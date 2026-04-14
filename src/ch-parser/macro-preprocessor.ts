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
 *   $__name(...)           → __macro_name__(...)   (any plugin or global macro)
 *   ${varName}             → __var_varName__
 *   ${varName.key:fmt}     → __var_varName_key_fmt__
 *   $varName               → __var_varName__
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
const MACRO_RE = /\$__([a-zA-Z_][a-zA-Z0-9_]*)/g;
// A bare $name. The lookahead keeps the tag of a dollar-quoted string ($tag$...$tag$) intact.
const BARE_VARIABLE_RE = /\$([a-zA-Z_][a-zA-Z0-9_]*)(?![a-zA-Z0-9_$])/g;

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
      // Verify it's a whole word (not part of a longer identifier or a qualified name such as system.settings)
      const before = i === 0 || (/\W/.test(sql[i - 1]) && sql[i - 1] !== '.');
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
 * Preprocess `sql` for the query-builder parser: strip the SETTINGS clause,
 * which that parser does not handle, then replace Grafana syntax.
 *
 * Returns the preprocessed SQL and a map from placeholder → original text,
 * used by `restoreMacros` to restore macro names in the parser output.
 */
export function preprocessSql(sql: string): PreprocessResult {
  return replaceGrafanaSyntax(stripSettings(sql));
}

/**
 * Replace Grafana variables and macros with identifiers a ClickHouse parser
 * accepts, leaving every other character of `sql` in place.
 */
export function replaceGrafanaSyntax(sql: string): PreprocessResult {
  const macroMap: MacroMap = new Map();

  // 1. Replace Grafana variables ${varName} BEFORE macro replacement
  //    (so ${__timeFilter} inside a variable doesn't double-replace)
  let processed = sql.replace(VARIABLE_RE, (match) => {
    const placeholder = variableToPlaceholder(match);
    macroMap.set(placeholder, match);
    return placeholder;
  });

  // 2. Replace Grafana macros ($__...) before bare variables, so the variable
  //    pattern cannot consume the `$__` prefix
  processed = processed.replace(MACRO_RE, (match, name: string) => {
    const placeholder = `__macro_${name}__`;
    macroMap.set(placeholder, match);
    return placeholder;
  });

  // 3. Replace bare Grafana variables ($varName)
  processed = processed.replace(BARE_VARIABLE_RE, (match, name: string) => {
    const placeholder = `__var_${name}__`;
    macroMap.set(placeholder, match);
    return placeholder;
  });

  return { preprocessed: processed, macroMap };
}

/**
 * Maps an index in `preprocessed` back to the same position in the SQL that
 * `replaceGrafanaSyntax` was given. A position inside a placeholder maps to the
 * start of the original macro or variable text.
 */
export function toOriginalIndex(preprocessed: string, index: number, macroMap: MacroMap): number {
  let delta = 0;
  for (const [placeholder, original] of macroMap) {
    for (
      let at = preprocessed.indexOf(placeholder);
      at !== -1 && at < index;
      at = preprocessed.indexOf(placeholder, at + placeholder.length)
    ) {
      delta += at + placeholder.length <= index ? original.length - placeholder.length : at - index;
    }
  }
  return index + delta;
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
