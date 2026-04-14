/**
 * Grafana macro/variable preprocessor for the ClickHouse WASM parser.
 *
 * Before passing SQL to the WASM module, Grafana-specific constructs are
 * replaced with valid ClickHouse identifiers that the C++ parser can handle.
 * After the parser returns, identifiers are restored in the output.
 *
 * Replacements are deterministic (not random) so tests are reproducible.
 *
 * Handled constructs:
 *   $__timeInterval(col)   → __macro_timeInterval__(col)
 *   $__timeFilter(col)     → __macro_timeFilter__(col)
 *   $__timeFilter_ms(col)  → __macro_timeFilter_ms__(col)
 *   $__dateFilter(col)     → __macro_dateFilter__(col)
 *   $__dateTimeFilter(col) → __macro_dateTimeFilter__(col)
 *   $__fromTime            → __macro_fromTime__
 *   $__toTime              → __macro_toTime__
 *   $__fromTime_ms         → __macro_fromTime_ms__
 *   $__toTime_ms           → __macro_toTime_ms__
 *   $__interval_s          → __macro_interval_s__
 *   $__conditionalAll(col, val) → __macro_conditionalAll__(col, val)
 *   $__adHocFilters(col)   → __macro_adHocFilters__(col)
 *   ${varName}             → __var_varName__
 *   ${varName.key:fmt}     → __var_varName_key_fmt__
 *   SETTINGS ...           → stripped (everything from SETTINGS to end,
 *                            at top paren-depth level)
 */

/** Map from placeholder identifier back to the original macro/variable text. */
export type MacroMap = Map<string, string>;

/** Result of preprocessing a SQL string. */
export interface PreprocessResult {
  preprocessed: string;
  macroMap: MacroMap;
}

// ─── Grafana variable substitution ───────────────────────────────────────────
// Matches: ${varName}, ${varName.key}, ${varName.key:format}
const VARIABLE_RE = /\$\{([a-zA-Z0-9_:.]+)\}/g;

function variableToPlaceholder(match: string): string {
  // ${my.var:fmt} → __var_my_var_fmt__
  const inner = match.slice(2, -1); // strip ${ and }
  const safe = inner.replace(/[^a-zA-Z0-9]/g, '_');
  return `__var_${safe}__`;
}

// ─── Grafana macro substitution ───────────────────────────────────────────────
// Order matters: longer patterns must come before shorter ones.
const MACRO_PATTERNS: Array<[RegExp, string]> = [
  [/\$__timeInterval_ms/g, '__macro_timeInterval_ms__'],
  [/\$__timeFilter_ms/g, '__macro_timeFilter_ms__'],
  [/\$__timeFilter/g, '__macro_timeFilter__'],
  [/\$__dateTimeFilter/g, '__macro_dateTimeFilter__'],
  [/\$__dateFilter/g, '__macro_dateFilter__'],
  [/\$__timeInterval/g, '__macro_timeInterval__'],
  [/\$__fromTime_ms/g, '__macro_fromTime_ms__'],
  [/\$__toTime_ms/g, '__macro_toTime_ms__'],
  [/\$__fromTime/g, '__macro_fromTime__'],
  [/\$__toTime/g, '__macro_toTime__'],
  [/\$__interval_s/g, '__macro_interval_s__'],
  [/\$__conditionalAll/g, '__macro_conditionalAll__'],
  [/\$__adHocFilters/g, '__macro_adHocFilters__'],
];

// ─── SETTINGS clause stripping ────────────────────────────────────────────────
/**
 * Remove `SETTINGS ...` from the top level of the SQL (i.e. not inside any
 * parentheses). ClickHouse allows SETTINGS after the main query body.
 */
function stripSettings(sql: string): string {
  let depth = 0;
  // Scan for SETTINGS at depth 0
  // We do a simple token scan rather than a full parse.
  const upper = sql.toUpperCase();
  let i = 0;
  while (i < sql.length) {
    const ch = sql[i];
    if (ch === '(' || ch === '[' || ch === '{') {
      depth++;
      i++;
      continue;
    }
    if (ch === ')' || ch === ']' || ch === '}') {
      depth--;
      i++;
      continue;
    }
    // Skip string literals so we don't match SETTINGS inside a string
    if (ch === "'" || ch === '"' || ch === '`') {
      const quote = ch;
      i++;
      while (i < sql.length) {
        if (sql[i] === quote) {
          // Check for escaped quote (doubled)
          if (sql[i + 1] === quote) {
            i += 2;
            continue;
          }
          i++;
          break;
        }
        if (sql[i] === '\\') {
          i++;
        } // skip escaped char
        i++;
      }
      continue;
    }
    // Check for SETTINGS keyword at depth 0
    if (depth === 0 && upper.startsWith('SETTINGS', i)) {
      // Verify it's a whole word (not part of a longer identifier)
      const before = i === 0 || /\W/.test(sql[i - 1]);
      const after = i + 8 >= sql.length || /\W/.test(sql[i + 8]);
      if (before && after) {
        return sql.slice(0, i).trimEnd();
      }
    }
    i++;
  }
  return sql;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Preprocess `sql` for the WASM parser:
 *   1. Strip SETTINGS clause
 *   2. Replace Grafana variables (${...})
 *   3. Replace Grafana macros ($__...)
 *
 * Returns the preprocessed SQL and a map from placeholder → original text,
 * used by `postprocessResult` to restore macro names in the parser output.
 */
export function preprocessSql(sql: string): PreprocessResult {
  const macroMap: MacroMap = new Map();

  // 1. Strip SETTINGS clause (ClickHouse-specific, breaks pgsql parser too)
  let processed = stripSettings(sql);

  // 2. Replace Grafana variables ${varName} BEFORE macro replacement
  //    (so ${__timeFilter} inside a variable doesn't double-replace)
  processed = processed.replace(VARIABLE_RE, (match) => {
    const placeholder = variableToPlaceholder(match);
    macroMap.set(placeholder, match);
    return placeholder;
  });

  // 3. Replace Grafana macros ($__...)
  for (const [pattern, placeholder] of MACRO_PATTERNS) {
    processed = processed.replace(pattern, (match) => {
      // Only record the first occurrence (all occurrences map to same placeholder)
      if (!macroMap.has(placeholder)) {
        macroMap.set(placeholder, match);
      }
      return placeholder;
    });
  }

  return { preprocessed: processed, macroMap };
}

/**
 * Given a string that may contain placeholder identifiers (from `preprocessSql`),
 * restore the original macro/variable text.
 */
export function restoreMacros(text: string, macroMap: MacroMap): string {
  let result = text;
  for (const [placeholder, original] of macroMap) {
    // Use a global string replace (all occurrences)
    result = result.split(placeholder).join(original);
  }
  return result;
}

/**
 * Returns true if this column/identifier name corresponds to the
 * $__timeInterval macro (used to detect TimeSeries query type).
 */
export function isTimeIntervalMacro(name: string): boolean {
  return name.includes('__macro_timeInterval__') || name.includes('$__timeInterval');
}
