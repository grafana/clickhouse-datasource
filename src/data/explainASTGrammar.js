// Generated automatically by nearley, version 2.20.1
// http://github.com/Hardmath123/nearley
(function () {
function id(x) { return x[0]; }

	// Moo lexer documention is here:
	// https://github.com/no-context/moo

	const moo = require("moo")
	const lexer = moo.compile({
		word: {match: /[a-zA-Z0-9_$]+/, type: moo.keywords(
			Object.fromEntries([
				'SelectQuery',
				'ExpressionList',
				'TablesInSelectQuery',
				'TablesInSelectQueryElement',
				'TableExpression',
				'TableIdentifier',
				'Identifier',
				'Literal',
				'Function',
				'Asterisk',
			].map(k => ['kw_' + k, k]))
		  )},
		lparen: '(',
		rparen: ')',
		string: /".*?"|'.*?'/,
		ws: /[ \t]+/,
		newline: {match: '\n', lineBreaks: true},
	});
var grammar = {
    Lexer: lexer,
    ParserRules: [
    {"name": "main", "symbols": ["select_stm"], "postprocess": c => c[0]},
    {"name": "select_stm$ebnf$1", "symbols": ["select_query"]},
    {"name": "select_stm$ebnf$1", "symbols": ["select_stm$ebnf$1", "select_query"], "postprocess": function arrpush(d) {return d[0].concat([d[1]]);}},
    {"name": "select_stm", "symbols": ["_", (lexer.has("kw_SelectQuery") ? {type: "kw_SelectQuery"} : kw_SelectQuery), "_", "children_count", (lexer.has("newline") ? {type: "newline"} : newline), "_", "select_stm$ebnf$1", "_", "identifier"], "postprocess":  c => ({
        	kw: c[1].value,
        	childCount: c[3].childCount,
        	items: c[6],
        	identifier: c[8]
        })},
    {"name": "select_query$subexpression$1", "symbols": ["expression_list", "_"]},
    {"name": "select_query$subexpression$1", "symbols": ["tables_in_select_query", "_"]},
    {"name": "select_query$subexpression$1", "symbols": ["function", "_"]},
    {"name": "select_query", "symbols": ["select_query$subexpression$1"], "postprocess": c =>  c[0][0]},
    {"name": "expression_list$ebnf$1", "symbols": ["expression"]},
    {"name": "expression_list$ebnf$1", "symbols": ["expression_list$ebnf$1", "expression"], "postprocess": function arrpush(d) {return d[0].concat([d[1]]);}},
    {"name": "expression_list", "symbols": [(lexer.has("kw_ExpressionList") ? {type: "kw_ExpressionList"} : kw_ExpressionList), "_", "children_count", (lexer.has("newline") ? {type: "newline"} : newline), "expression_list$ebnf$1"], "postprocess":  c => ({
        	kw: c[0].value,
        	childCount: c[2].childCount,
        	items: c[4]
        })},
    {"name": "expression$subexpression$1", "symbols": ["identifier", (lexer.has("newline") ? {type: "newline"} : newline)]},
    {"name": "expression$subexpression$1", "symbols": ["function"]},
    {"name": "expression$subexpression$1", "symbols": ["literal", (lexer.has("newline") ? {type: "newline"} : newline)]},
    {"name": "expression$subexpression$1", "symbols": ["asterisk", (lexer.has("newline") ? {type: "newline"} : newline)]},
    {"name": "expression", "symbols": ["_", "expression$subexpression$1"], "postprocess": c => c[1][0]},
    {"name": "tables_in_select_query$ebnf$1", "symbols": ["tables_in_select_query_element"]},
    {"name": "tables_in_select_query$ebnf$1", "symbols": ["tables_in_select_query$ebnf$1", "tables_in_select_query_element"], "postprocess": function arrpush(d) {return d[0].concat([d[1]]);}},
    {"name": "tables_in_select_query", "symbols": [(lexer.has("kw_TablesInSelectQuery") ? {type: "kw_TablesInSelectQuery"} : kw_TablesInSelectQuery), "_", "children_count", (lexer.has("newline") ? {type: "newline"} : newline), "tables_in_select_query$ebnf$1"], "postprocess":  c => ({
        	kw: c[0].value,
        	childCount: c[2].childCount,
        	items: c[4]
        })},
    {"name": "tables_in_select_query_element$ebnf$1", "symbols": ["table_elements"]},
    {"name": "tables_in_select_query_element$ebnf$1", "symbols": ["tables_in_select_query_element$ebnf$1", "table_elements"], "postprocess": function arrpush(d) {return d[0].concat([d[1]]);}},
    {"name": "tables_in_select_query_element", "symbols": ["_", (lexer.has("kw_TablesInSelectQueryElement") ? {type: "kw_TablesInSelectQueryElement"} : kw_TablesInSelectQueryElement), "_", "children_count", (lexer.has("newline") ? {type: "newline"} : newline), "_", "tables_in_select_query_element$ebnf$1"], "postprocess":  c => ({
        	kw: c[1].value,
        	childCount: c[3].childCount,
        	items: c[6]
        })},
    {"name": "table_elements$subexpression$1", "symbols": ["table_expression"]},
    {"name": "table_elements$subexpression$1", "symbols": ["table_operation"]},
    {"name": "table_elements", "symbols": ["table_elements$subexpression$1"], "postprocess": c => c[0][0]},
    {"name": "table_operation", "symbols": ["_", (lexer.has("word") ? {type: "word"} : word), (lexer.has("newline") ? {type: "newline"} : newline)], "postprocess":  c => ({
        	kw:c[1].value
        })},
    {"name": "table_expression$ebnf$1", "symbols": ["table_identifiers"]},
    {"name": "table_expression$ebnf$1", "symbols": ["table_expression$ebnf$1", "table_identifiers"], "postprocess": function arrpush(d) {return d[0].concat([d[1]]);}},
    {"name": "table_expression", "symbols": [(lexer.has("kw_TableExpression") ? {type: "kw_TableExpression"} : kw_TableExpression), "_", "children_count", (lexer.has("newline") ? {type: "newline"} : newline), "table_expression$ebnf$1"], "postprocess":  c => ({
        	kw: c[0].value,
        	childCount: c[2].childCount,
        	items: c[4]
        })},
    {"name": "table_identifier$ebnf$1$subexpression$1", "symbols": ["_", "alias"]},
    {"name": "table_identifier$ebnf$1", "symbols": ["table_identifier$ebnf$1$subexpression$1"], "postprocess": id},
    {"name": "table_identifier$ebnf$1", "symbols": [], "postprocess": function(d) {return null;}},
    {"name": "table_identifier", "symbols": [(lexer.has("kw_TableIdentifier") ? {type: "kw_TableIdentifier"} : kw_TableIdentifier), "_", (lexer.has("word") ? {type: "word"} : word), "table_identifier$ebnf$1"], "postprocess":  c => ({
        	kw: c[0].value,
        	name: c[2].value,
        	alias: (c[3] ? c[3][1].name : null)
        })},
    {"name": "table_identifiers", "symbols": ["_", "table_identifier", (lexer.has("newline") ? {type: "newline"} : newline)], "postprocess": c => c[1]},
    {"name": "function$ebnf$1", "symbols": ["expression_list"]},
    {"name": "function$ebnf$1", "symbols": ["function$ebnf$1", "expression_list"], "postprocess": function arrpush(d) {return d[0].concat([d[1]]);}},
    {"name": "function", "symbols": [(lexer.has("kw_Function") ? {type: "kw_Function"} : kw_Function), "_", (lexer.has("word") ? {type: "word"} : word), "_", "children_count", (lexer.has("newline") ? {type: "newline"} : newline), "_", "function$ebnf$1"], "postprocess":  c => ({
        	kw: c[0].value,
        	name: c[2].value,
        	childCount: c[4].childCount,
        	items: c[7]
        })},
    {"name": "identifier$ebnf$1$subexpression$1", "symbols": ["_", "alias"]},
    {"name": "identifier$ebnf$1", "symbols": ["identifier$ebnf$1$subexpression$1"], "postprocess": id},
    {"name": "identifier$ebnf$1", "symbols": [], "postprocess": function(d) {return null;}},
    {"name": "identifier", "symbols": [(lexer.has("kw_Identifier") ? {type: "kw_Identifier"} : kw_Identifier), "_", (lexer.has("word") ? {type: "word"} : word), "identifier$ebnf$1"], "postprocess":  c => ({
        	kw: c[0].value,
        	name: c[2].value,
        	alias: (c[3] ? c[3][1].name : null)
        })},
    {"name": "literal$subexpression$1", "symbols": [(lexer.has("string") ? {type: "string"} : string)]},
    {"name": "literal$subexpression$1", "symbols": [(lexer.has("word") ? {type: "word"} : word)]},
    {"name": "literal", "symbols": [(lexer.has("kw_Literal") ? {type: "kw_Literal"} : kw_Literal), "_", "literal$subexpression$1"], "postprocess":  c => ({
        	kw: c[0].value,
        	val: c[2][0].value
        })},
    {"name": "asterisk", "symbols": [(lexer.has("kw_Asterisk") ? {type: "kw_Asterisk"} : kw_Asterisk)], "postprocess":  c => ({
        	kw: c[0].value
        })},
    {"name": "children_count", "symbols": [(lexer.has("lparen") ? {type: "lparen"} : lparen), "_", (lexer.has("word") ? {type: "word"} : word), "_", (lexer.has("word") ? {type: "word"} : word), "_", (lexer.has("rparen") ? {type: "rparen"} : rparen)], "postprocess":  c => ({
        	childCount: Number.parseInt(c[4].value)
        })},
    {"name": "alias", "symbols": [(lexer.has("lparen") ? {type: "lparen"} : lparen), "_", (lexer.has("word") ? {type: "word"} : word), "_", (lexer.has("word") ? {type: "word"} : word), "_", (lexer.has("rparen") ? {type: "rparen"} : rparen)], "postprocess":  a => ({
        	name: a[4].value
        })},
    {"name": "_$ebnf$1", "symbols": []},
    {"name": "_$ebnf$1", "symbols": ["_$ebnf$1", (lexer.has("ws") ? {type: "ws"} : ws)], "postprocess": function arrpush(d) {return d[0].concat([d[1]]);}},
    {"name": "_", "symbols": ["_$ebnf$1"], "postprocess": _ => { null }},
    {"name": "__", "symbols": [(lexer.has("ws") ? {type: "ws"} : ws)], "postprocess": _ => { null }}
]
  , ParserStart: "main"
}
if (typeof module !== 'undefined'&& typeof module.exports !== 'undefined') {
   module.exports = grammar;
} else {
   window.grammar = grammar;
}
})();
