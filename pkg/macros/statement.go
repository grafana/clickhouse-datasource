package macros

import (
	"errors"
	"fmt"
	"math"
	"regexp"
	"strconv"
	"strings"

	"github.com/grafana/grafana-plugin-sdk-go/backend"
	"github.com/grafana/grafana-plugin-sdk-go/data/sqlutil"
	"github.com/grafana/macropro"
)

// Statement macros rewrite the whole query rather than expanding in place,
// which is why they cannot be ordinary macropro handlers: a MacroFunc only
// sees its own arguments, while these macros consume the FROM tail that
// follows the call and wrap it in generated WHERE / GROUP BY / WINDOW /
// ORDER BY clauses:
//
//	$__columns(timeCol, key, value)          one series per key value
//	$__rateColumns(timeCol, key, value)      value smoothed to per-second
//	$__perSecondColumns(timeCol, key, value) counter rate, Prometheus rate()
//	$__increaseColumns(timeCol, key, value)  counter delta, Prometheus increase()
//	$__lttb(buckets, x, y)                   Largest-Triangle-Three-Buckets downsampling
//
// Expansion emits long-format rows (t, key, value) that this plugin renders
// as multi-line series natively, uses a window partitioned by key rather than
// relying on physical row order, and marks the first point of each series as
// nan instead of dividing by zero. The generated SQL contains $__timeInterval
// and $__timeFilter calls, so macropro remains the single source of truth for
// time expansion.

// stmtPrefix matches macropro's default macro prefix.
const stmtPrefix = "$__"

// stmtDT is the number of seconds between the current bucket and the previous
// bucket of the same series. It is zero for the first bucket of a series,
// which every consumer treats as "no previous point".
const stmtDT = "t - lagInFrame(t, 1, t) OVER w"

var (
	bareIdentRe  = regexp.MustCompile(`^[A-Za-z_][A-Za-z0-9_]*$`)
	bucketsIntRe = regexp.MustCompile(`^[0-9]+$`)
)

// statementBuilders maps statement macro names (without the $__ prefix) to
// their SQL builders. All five take exactly three arguments, which
// expandStatementMacros validates before dispatching.
var statementBuilders = map[string]func(q *sqlutil.Query, args []string, tail string) (string, error){
	"columns":          buildColumns,
	"rateColumns":      buildRateColumns,
	"perSecondColumns": buildPerSecondColumns,
	"increaseColumns":  buildIncreaseColumns,
	"lttb":             buildLTTB,
}

// stmtMatch records where a statement macro call sits in the scanned query.
// argsStart is -1 when the macro name was not followed by an argument list.
type stmtMatch struct {
	name      string
	start     int // index of the '$' that opens the macro token
	argsStart int // index just after the opening '('
	argsEnd   int // index of the closing ')'
}

// expandStatementMacros is the pre-pass that runs before
// macropro.Interpolate. It finds at most one statement macro at the top level
// of the query, splits its arguments from the statement tail, and splices the
// builder's output over everything from the macro to the end of the query.
// Text before the macro (a WITH clause, typically) is preserved verbatim.
// On error the original query is returned unchanged, matching macropro.
func expandStatementMacros(rawSQL string, q *sqlutil.Query) (string, error) {
	if !strings.Contains(rawSQL, stmtPrefix) {
		return rawSQL, nil
	}

	// StripComments blanks comment regions to equal-length spaces, so offsets
	// found while scanning work are valid indices into rawSQL. Scanning the
	// stripped copy keeps a statement macro hidden inside a comment from ever
	// firing, the same protection macropro.Interpolate gives expression macros.
	work := macropro.StripComments(rawSQL, clickHouseComments)
	if len(work) != len(rawSQL) {
		return rawSQL, backend.PluginError(errors.New("comment stripping changed the query length, cannot expand statement macros"))
	}

	match, err := findStatementMacro(work)
	if err != nil {
		return rawSQL, backend.DownstreamError(err)
	}
	if match == nil {
		return rawSQL, nil
	}
	if match.argsStart < 0 {
		return rawSQL, badArgsErr(stmtPrefix+match.name, 3, 0)
	}

	args, err := splitStatementArgs(work[match.argsStart:match.argsEnd])
	if err != nil {
		return rawSQL, backend.DownstreamError(fmt.Errorf("%s%s: %w", stmtPrefix, match.name, err))
	}
	if len(args) != 3 {
		return rawSQL, badArgsErr(stmtPrefix+match.name, 3, len(args))
	}

	expanded, err := statementBuilders[match.name](q, args, work[match.argsEnd+1:])
	if err != nil {
		return rawSQL, backend.DownstreamError(err)
	}
	return rawSQL[:match.start] + expanded, nil
}

// findStatementMacro scans the comment-stripped query for a registered
// statement macro outside string literals. A match inside parentheses is an
// error because a statement macro cannot rewrite an enclosing query, and a
// second match is an error because the first macro's tail would swallow it.
func findStatementMacro(work string) (*stmtMatch, error) {
	var found *stmtMatch
	depth := 0
	for i := 0; i < len(work); {
		switch c := work[i]; c {
		case '\'', '"', '`':
			i = scanQuoted(work, i)
		case '(':
			depth++
			i++
		case ')':
			if depth > 0 {
				depth--
			}
			i++
		case '$':
			if !strings.HasPrefix(work[i:], stmtPrefix) {
				i++
				continue
			}
			nameStart := i + len(stmtPrefix)
			nameEnd := nameStart
			for nameEnd < len(work) && isIdentChar(work[nameEnd]) {
				nameEnd++
			}
			name := work[nameStart:nameEnd]
			if _, ok := statementBuilders[name]; !ok {
				i = nameEnd
				continue
			}
			if depth > 0 {
				return nil, fmt.Errorf("%s%s must be at the top level of the query, not inside a subquery", stmtPrefix, name)
			}
			if found != nil {
				return nil, fmt.Errorf("only one statement macro is allowed per query, found %s%s and %s%s", stmtPrefix, found.name, stmtPrefix, name)
			}
			if nameEnd >= len(work) || work[nameEnd] != '(' {
				found = &stmtMatch{name: name, start: i, argsStart: -1, argsEnd: -1}
				i = nameEnd
				continue
			}
			end, err := matchParen(work, nameEnd)
			if err != nil {
				return nil, fmt.Errorf("%s%s: %w", stmtPrefix, name, err)
			}
			found = &stmtMatch{name: name, start: i, argsStart: nameEnd + 1, argsEnd: end}
			i = end + 1
		default:
			i++
		}
	}
	return found, nil
}

// scanQuoted advances past the quoted region opening at pos and returns the
// index after the closing quote. It handles single-quoted string literals,
// double-quoted identifiers, and backtick-quoted identifiers, which ClickHouse
// all closes with the same rules: a doubled quote character or a backslash
// escape continues the region (verified against ClickHouse for all three
// quote characters). An unterminated region consumes the rest of the input.
func scanQuoted(s string, pos int) int {
	quote := s[pos]
	for i := pos + 1; i < len(s); {
		switch {
		case s[i] == '\\' && i+1 < len(s):
			i += 2
		case s[i] == quote:
			if i+1 < len(s) && s[i+1] == quote {
				i += 2
				continue
			}
			return i + 1
		default:
			i++
		}
	}
	return len(s)
}

// matchParen returns the index of the ')' closing the '(' at open, tracking
// nesting depth and skipping string literals.
func matchParen(s string, open int) (int, error) {
	depth := 0
	for i := open; i < len(s); {
		switch s[i] {
		case '\'', '"', '`':
			i = scanQuoted(s, i)
			continue
		case '(':
			depth++
		case ')':
			depth--
			if depth == 0 {
				return i, nil
			}
		}
		i++
	}
	return 0, errors.New("unbalanced parentheses")
}

// splitStatementArgs splits the text between the outer parentheses on
// top-level commas, trimming whitespace from each argument.
func splitStatementArgs(raw string) ([]string, error) {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return nil, nil
	}
	var args []string
	depth, start := 0, 0
	for i := 0; i < len(raw); {
		switch raw[i] {
		case '\'', '"', '`':
			i = scanQuoted(raw, i)
			continue
		case '(':
			depth++
		case ')':
			if depth == 0 {
				return nil, fmt.Errorf("unexpected ')' at position %d in arguments", i)
			}
			depth--
		case ',':
			if depth == 0 {
				args = append(args, strings.TrimSpace(raw[start:i]))
				start = i + 1
			}
		}
		i++
	}
	return append(args, strings.TrimSpace(raw[start:])), nil
}

// isIdentChar reports whether b can appear in a macro name or identifier.
func isIdentChar(b byte) bool {
	return b == '_' || (b >= 'a' && b <= 'z') || (b >= 'A' && b <= 'Z') || (b >= '0' && b <= '9')
}

// tailClauses is the decomposition of the statement tail that follows a
// statement macro call, e.g. "FROM t WHERE x ORDER BY y LIMIT 10". Every
// field except where keeps the user's text verbatim, keyword included. The
// where field holds only the condition so it can be merged with the generated
// time filter.
type tailClauses struct {
	from     string
	where    string
	groupBy  string
	having   string
	orderBy  string
	limit    string
	settings string
}

// tailKeywords lists the clause keywords supported in a statement tail, in
// the order ClickHouse requires them to appear. PREWHERE is deliberately
// absent so that it stays glued to the FROM segment, where it is valid.
var tailKeywords = []struct {
	name  string
	words []string
}{
	{"WHERE", []string{"WHERE"}},
	{"GROUP BY", []string{"GROUP", "BY"}},
	{"HAVING", []string{"HAVING"}},
	{"ORDER BY", []string{"ORDER", "BY"}},
	{"LIMIT", []string{"LIMIT"}},
	{"SETTINGS", []string{"SETTINGS"}},
}

// parseTailClauses splits a statement tail into its clauses. Keywords are
// matched case-insensitively at the top level only, outside string literals,
// so a WHERE inside a subquery or a literal never splits the tail.
func parseTailClauses(macro, tail string) (tailClauses, error) {
	tail = strings.TrimSpace(tail)
	tail = strings.TrimSpace(strings.TrimSuffix(tail, ";"))
	if _, ok := matchWords(tail, 0, []string{"FROM"}); !ok {
		return tailClauses{}, fmt.Errorf("%s must be followed by a FROM clause", macro)
	}

	starts := make([]int, len(tailKeywords))
	ends := make([]int, len(tailKeywords))
	for k := range starts {
		starts[k] = -1
	}

	depth := 0
	for i := 0; i < len(tail); {
		switch c := tail[i]; c {
		case '\'', '"', '`':
			i = scanQuoted(tail, i)
		case '(':
			depth++
			i++
		case ')':
			if depth > 0 {
				depth--
			}
			i++
		default:
			if depth == 0 && (i == 0 || !isIdentChar(tail[i-1])) {
				if k, end, ok := matchTailKeyword(tail, i); ok && starts[k] == -1 {
					starts[k], ends[k] = i, end
					i = end
					continue
				}
			}
			i++
		}
	}

	// The matched clauses must appear in canonical order, otherwise the
	// segments between them would be sliced incorrectly.
	last, lastK := -1, -1
	for k, s := range starts {
		if s == -1 {
			continue
		}
		if s < last {
			return tailClauses{}, fmt.Errorf("%s: %s must appear before %s", macro, tailKeywords[k].name, tailKeywords[lastK].name)
		}
		last, lastK = s, k
	}

	// segmentEnd returns where the clause starting at index k stops, which is
	// the start of the next present clause or the end of the tail.
	segmentEnd := func(k int) int {
		for n := k + 1; n < len(starts); n++ {
			if starts[n] != -1 {
				return starts[n]
			}
		}
		return len(tail)
	}

	firstClause := len(tail)
	for _, s := range starts {
		if s != -1 && s < firstClause {
			firstClause = s
		}
	}

	tc := tailClauses{from: strings.TrimSpace(tail[:firstClause])}
	for k, s := range starts {
		if s == -1 {
			continue
		}
		segment := strings.TrimSpace(tail[s:segmentEnd(k)])
		switch tailKeywords[k].name {
		case "WHERE":
			tc.where = strings.TrimSpace(tail[ends[k]:segmentEnd(k)])
		case "GROUP BY":
			tc.groupBy = segment
		case "HAVING":
			tc.having = segment
		case "ORDER BY":
			tc.orderBy = segment
		case "LIMIT":
			tc.limit = segment
		case "SETTINGS":
			tc.settings = segment
		}
	}
	return tc, nil
}

// matchTailKeyword tries every tail keyword at pos and returns the index of
// the matching keyword and the offset just past it.
func matchTailKeyword(s string, pos int) (int, int, bool) {
	for k, kw := range tailKeywords {
		if end, ok := matchWords(s, pos, kw.words); ok {
			return k, end, true
		}
	}
	return 0, 0, false
}

// matchWords matches a sequence of keyword words at pos, case-insensitively,
// separated by whitespace and bounded by non-identifier characters. It
// returns the offset just past the last word.
func matchWords(s string, pos int, words []string) (int, bool) {
	i := pos
	for w, word := range words {
		if w > 0 {
			j := i
			for j < len(s) && (s[j] == ' ' || s[j] == '\t' || s[j] == '\r' || s[j] == '\n') {
				j++
			}
			if j == i {
				return 0, false
			}
			i = j
		}
		if len(s)-i < len(word) || !strings.EqualFold(s[i:i+len(word)], word) {
			return 0, false
		}
		i += len(word)
		if i < len(s) && isIdentChar(s[i]) {
			return 0, false
		}
	}
	return i, true
}

// splitAlias splits a trailing top-level "AS alias" off a macro argument. The
// last top-level AS wins so that expressions containing their own aliases,
// which ClickHouse allows inside any expression, are left intact.
func splitAlias(arg string) (expr, alias string) {
	arg = strings.TrimSpace(arg)
	lastStart, lastEnd := -1, -1
	depth := 0
	for i := 0; i < len(arg); {
		switch arg[i] {
		case '\'', '"', '`':
			i = scanQuoted(arg, i)
		case '(':
			depth++
			i++
		case ')':
			if depth > 0 {
				depth--
			}
			i++
		default:
			if depth == 0 && (i == 0 || !isIdentChar(arg[i-1])) {
				if end, ok := matchWords(arg, i, []string{"AS"}); ok {
					lastStart, lastEnd = i, end
					i = end
					continue
				}
			}
			i++
		}
	}
	if lastStart <= 0 {
		return arg, ""
	}
	return strings.TrimSpace(arg[:lastStart]), strings.TrimSpace(arg[lastEnd:])
}

// buildColumnsFamily is the shared shape of the four *Columns macros: bucket
// the time column with $__timeInterval, emit the key as a string label
// column, aggregate per bucket and key, and let valueColumn decide what the
// numeric column looks like. windowed adds the named window that the rate
// and counter variants compute lagInFrame over.
func buildColumnsFamily(macro string, args []string, tail string, windowed bool, valueColumn func(expr, alias string) string) (string, error) {
	timeCol := args[0]
	keyExpr, keyAlias := splitAlias(args[1])
	if keyAlias == "" {
		keyAlias = "metric"
	}
	valueExpr, valueAlias := splitAlias(args[2])
	if valueAlias == "" {
		valueAlias = "value"
	}

	tc, err := parseTailClauses(macro, tail)
	if err != nil {
		return "", err
	}
	if tc.groupBy != "" {
		return "", fmt.Errorf("%s generates its own GROUP BY, remove the GROUP BY clause from the query", macro)
	}

	where := fmt.Sprintf("WHERE $__timeFilter(%s)", timeCol)
	if tc.where != "" {
		where += fmt.Sprintf(" AND (%s)", tc.where)
	}
	orderBy := tc.orderBy
	if orderBy == "" {
		orderBy = fmt.Sprintf("ORDER BY t, %s", keyAlias)
	}

	parts := []string{
		fmt.Sprintf("SELECT $__timeInterval(%s) AS t, toString(%s) AS %s, %s", timeCol, keyExpr, keyAlias, valueColumn(valueExpr, valueAlias)),
		tc.from,
		where,
		fmt.Sprintf("GROUP BY t, %s", keyAlias),
	}
	if tc.having != "" {
		parts = append(parts, tc.having)
	}
	if windowed {
		parts = append(parts, fmt.Sprintf("WINDOW w AS (PARTITION BY %s ORDER BY t ASC ROWS BETWEEN 1 PRECEDING AND CURRENT ROW)", keyAlias))
	}
	parts = append(parts, orderBy)
	if tc.limit != "" {
		parts = append(parts, tc.limit)
	}
	if tc.settings != "" {
		parts = append(parts, tc.settings)
	}
	return strings.Join(parts, " "), nil
}

// buildColumns expands $__columns(timeCol, key, value): one row per time
// bucket and key value, rendered by Grafana as one series per key.
func buildColumns(_ *sqlutil.Query, args []string, tail string) (string, error) {
	return buildColumnsFamily("$__columns", args, tail, false, func(expr, alias string) string {
		return fmt.Sprintf("%s AS %s", expr, alias)
	})
}

// buildRateColumns expands $__rateColumns(timeCol, key, value): the
// aggregated value divided by the seconds since the previous bucket of the
// same series, nan for the first bucket.
func buildRateColumns(_ *sqlutil.Query, args []string, tail string) (string, error) {
	return buildColumnsFamily("$__rateColumns", args, tail, true, func(expr, alias string) string {
		return fmt.Sprintf("if((%s) = 0, nan, %s / (%s)) AS %s", stmtDT, expr, stmtDT, alias)
	})
}

// buildPerSecondColumns expands $__perSecondColumns(timeCol, key, value) for
// monotonic counters: the per-second rate of max(value), with counter resets
// and first buckets emitted as nan, like the Prometheus rate() function.
func buildPerSecondColumns(_ *sqlutil.Query, args []string, tail string) (string, error) {
	return buildColumnsFamily("$__perSecondColumns", args, tail, true, func(expr, alias string) string {
		delta := fmt.Sprintf("(max(%s) - lagInFrame(max(%s), 1, max(%s)) OVER w)", expr, expr, expr)
		return fmt.Sprintf("if((%s) = 0 OR %s < 0, nan, %s / (%s)) AS %s", stmtDT, delta, delta, stmtDT, alias)
	})
}

// buildIncreaseColumns expands $__increaseColumns(timeCol, key, value) for
// monotonic counters: the raw delta of max(value) per bucket, like the
// Prometheus increase() function.
func buildIncreaseColumns(_ *sqlutil.Query, args []string, tail string) (string, error) {
	return buildColumnsFamily("$__increaseColumns", args, tail, true, func(expr, alias string) string {
		delta := fmt.Sprintf("(max(%s) - lagInFrame(max(%s), 1, max(%s)) OVER w)", expr, expr, expr)
		// toFloat64 keeps the column type stable: without it the integer delta
		// and the nan branch have no common type and ClickHouse produces a
		// Variant column, or an error on versions without variant support.
		return fmt.Sprintf("if((%s) = 0 OR %s < 0, nan, toFloat64(max(%s) - lagInFrame(max(%s), 1, max(%s)) OVER w)) AS %s", stmtDT, delta, expr, expr, expr, alias)
	})
}

// buildLTTB expands $__lttb(buckets, x, y) using ClickHouse's native lttb
// aggregate. Without a GROUP BY the x and y arguments are spliced verbatim
// into the aggregate call. With a GROUP BY the aggregation runs in a
// subquery and lttb consumes its aliased output columns, because lttb is
// itself an aggregate and ClickHouse rejects nested aggregation such as
// lttb(...)(ts, avg(value)) with ILLEGAL_AGGREGATION.
func buildLTTB(q *sqlutil.Query, args []string, tail string) (string, error) {
	buckets, err := lttbBuckets(args[0], q)
	if err != nil {
		return "", err
	}
	xExpr, xAlias := splitAlias(args[1])
	xAlias = lttbAlias(xExpr, xAlias, "x")
	yExpr, yAlias := splitAlias(args[2])
	yAlias = lttbAlias(yExpr, yAlias, "y")

	tc, err := parseTailClauses("$__lttb", tail)
	if err != nil {
		return "", err
	}
	where := fmt.Sprintf("WHERE $__timeFilter(%s)", xExpr)
	if tc.where != "" {
		where += fmt.Sprintf(" AND (%s)", tc.where)
	}

	lttbX, lttbY := args[1], args[2]
	from := tc.from
	if tc.groupBy != "" {
		// GROUP BY output order is unspecified and lttb buckets by input
		// order, so the aggregated rows are sorted by x unless the user
		// ordered them explicitly.
		orderBy := tc.orderBy
		if orderBy == "" {
			orderBy = fmt.Sprintf("ORDER BY %s", xAlias)
		}
		aggregated := []string{
			fmt.Sprintf("SELECT %s, %s", lttbSelectColumn(xExpr, xAlias), lttbSelectColumn(yExpr, yAlias)),
			tc.from,
			where,
			tc.groupBy,
		}
		for _, clause := range []string{tc.having, orderBy, tc.limit, tc.settings} {
			if clause != "" {
				aggregated = append(aggregated, clause)
			}
		}
		return fmt.Sprintf("SELECT point.1 AS %s, point.2 AS %s FROM (SELECT arrayJoin(lttb(%s)(%s, %s)) AS point FROM (%s)) ORDER BY %s",
			xAlias, yAlias, buckets, xAlias, yAlias, strings.Join(aggregated, " "), xAlias), nil
	}

	inner := []string{
		fmt.Sprintf("SELECT arrayJoin(lttb(%s)(%s, %s)) AS point", buckets, lttbX, lttbY),
		from,
		where,
	}
	for _, clause := range []string{tc.having, tc.orderBy, tc.limit, tc.settings} {
		if clause != "" {
			inner = append(inner, clause)
		}
	}
	return fmt.Sprintf("SELECT point.1 AS %s, point.2 AS %s FROM (%s) ORDER BY %s",
		xAlias, yAlias, strings.Join(inner, " "), xAlias), nil
}

// lttbAlias picks the outer column name for an lttb coordinate: the user's
// alias when given, the column itself when the expression is a bare
// identifier, and the fallback otherwise.
func lttbAlias(expr, alias, fallback string) string {
	if alias != "" {
		return alias
	}
	if bareIdentRe.MatchString(expr) {
		return expr
	}
	return fallback
}

// lttbSelectColumn renders one coordinate of the pre-aggregation subquery.
// A bare column whose alias is itself needs no AS clause.
func lttbSelectColumn(expr, alias string) string {
	if expr == alias {
		return expr
	}
	return fmt.Sprintf("%s AS %s", expr, alias)
}

// lttbBuckets validates the buckets argument. The auto keyword derives the
// bucket count from the panel time range and interval, which approximates
// one bucket per rendered pixel column.
func lttbBuckets(arg string, q *sqlutil.Query) (string, error) {
	if strings.EqualFold(arg, "auto") {
		interval := math.Max(q.Interval.Seconds(), 1)
		buckets := max(int64(q.TimeRange.To.Sub(q.TimeRange.From).Seconds()/interval), 1)
		return strconv.FormatInt(buckets, 10), nil
	}
	if !bucketsIntRe.MatchString(arg) || strings.Trim(arg, "0") == "" {
		return "", fmt.Errorf("$__lttb buckets must be a positive integer or 'auto', got %q", arg)
	}
	return arg, nil
}
