// Generated automatically by nearley, version 2.20.1
// http://github.com/Hardmath123/nearley
(function () {
function id(x) { return x[0]; }

	// Moo lexer documention is here:
	// https://github.com/no-context/moo

	const moo = require("moo")
	const lexer = moo.compile({
		kw_with: /[wW][iI][tT][hH]/,
	    kw_select: /[sS][eE][lL][eE|][cC][tT]/,
		kw_from: /[fF][rR][oO][mM]/,
		kw_prewhere: /[pP][rR][eE][wW][hH][eE][rR][eE]/,
		kw_where: /[wW][hH][eE][rR][eE]/,
		kw_group_by: /[gG][rR][oO][uU][pP] [bB][yY]/,
		kw_having: /[hH][aA][vV][iI][nN][gG]/,
		kw_order_by: /[oO][rR][dD][eE][rR] [bB][yY]/,
		kw_limit: /[lL][iI][mM][iI][tT]/,
		kw_union: /[uU][nN][iI][oO][nN]/,
		kw_format: /[fF][oO][rR][mM][aA][tT]/,
		lparen: '(',
		rparen: ')',
		op: /=|in/,
		joiner: /[aA][nN][dD]|[oO][rR]/,
		string: /".*?"|'.*?'/,
		star: /\*/,
		as: /[aA][sS]/,
		comma:/\,/,
	    word: /[a-zA-Z0-9]+/,
		ws: /[ \t]+/,
	});
var grammar = {
    Lexer: lexer,
    ParserRules: [
    {"name": "main", "symbols": ["select_stm"]},
    {"name": "select_stm$ebnf$1", "symbols": ["from"], "postprocess": id},
    {"name": "select_stm$ebnf$1", "symbols": [], "postprocess": function(d) {return null;}},
    {"name": "select_stm$ebnf$2", "symbols": ["where"], "postprocess": id},
    {"name": "select_stm$ebnf$2", "symbols": [], "postprocess": function(d) {return null;}},
    {"name": "select_stm$ebnf$3", "symbols": ["group_by"], "postprocess": id},
    {"name": "select_stm$ebnf$3", "symbols": [], "postprocess": function(d) {return null;}},
    {"name": "select_stm$ebnf$4", "symbols": ["having"], "postprocess": id},
    {"name": "select_stm$ebnf$4", "symbols": [], "postprocess": function(d) {return null;}},
    {"name": "select_stm$ebnf$5", "symbols": ["order_by"], "postprocess": id},
    {"name": "select_stm$ebnf$5", "symbols": [], "postprocess": function(d) {return null;}},
    {"name": "select_stm$ebnf$6", "symbols": ["limit"], "postprocess": id},
    {"name": "select_stm$ebnf$6", "symbols": [], "postprocess": function(d) {return null;}},
    {"name": "select_stm$ebnf$7", "symbols": ["union"], "postprocess": id},
    {"name": "select_stm$ebnf$7", "symbols": [], "postprocess": function(d) {return null;}},
    {"name": "select_stm", "symbols": ["select", "select_stm$ebnf$1", "select_stm$ebnf$2", "select_stm$ebnf$3", "select_stm$ebnf$4", "select_stm$ebnf$5", "select_stm$ebnf$6", "select_stm$ebnf$7"]},
    {"name": "select_stm$ebnf$8", "symbols": [(lexer.has("as") ? {type: "as"} : as)], "postprocess": id},
    {"name": "select_stm$ebnf$8", "symbols": [], "postprocess": function(d) {return null;}},
    {"name": "select_stm$ebnf$9", "symbols": [(lexer.has("word") ? {type: "word"} : word)], "postprocess": id},
    {"name": "select_stm$ebnf$9", "symbols": [], "postprocess": function(d) {return null;}},
    {"name": "select_stm", "symbols": [(lexer.has("lparen") ? {type: "lparen"} : lparen), "_", "select_stm", "_", (lexer.has("rparen") ? {type: "rparen"} : rparen), "_", "select_stm$ebnf$8", "_", "select_stm$ebnf$9"]},
    {"name": "select", "symbols": [(lexer.has("kw_select") ? {type: "kw_select"} : kw_select), "__", "feilds", "_"], "postprocess": ([kw, , w]) => [kw.value, w]},
    {"name": "from$ebnf$1", "symbols": []},
    {"name": "from$ebnf$1$subexpression$1", "symbols": ["_", (lexer.has("comma") ? {type: "comma"} : comma), "_", "val", "_"]},
    {"name": "from$ebnf$1", "symbols": ["from$ebnf$1", "from$ebnf$1$subexpression$1"], "postprocess": function arrpush(d) {return d[0].concat([d[1]]);}},
    {"name": "from", "symbols": [(lexer.has("kw_from") ? {type: "kw_from"} : kw_from), "__", "val", "from$ebnf$1", "_"]},
    {"name": "where$ebnf$1", "symbols": []},
    {"name": "where$ebnf$1$subexpression$1", "symbols": ["__", (lexer.has("joiner") ? {type: "joiner"} : joiner), "__", "expr"]},
    {"name": "where$ebnf$1", "symbols": ["where$ebnf$1", "where$ebnf$1$subexpression$1"], "postprocess": function arrpush(d) {return d[0].concat([d[1]]);}},
    {"name": "where", "symbols": [(lexer.has("kw_where") ? {type: "kw_where"} : kw_where), "__", "expr", "where$ebnf$1", "_"]},
    {"name": "group_by", "symbols": [(lexer.has("kw_group_by") ? {type: "kw_group_by"} : kw_group_by), "_", "feilds", "_"]},
    {"name": "having$ebnf$1", "symbols": []},
    {"name": "having$ebnf$1$subexpression$1", "symbols": ["__", (lexer.has("joiner") ? {type: "joiner"} : joiner), "__", "expr"]},
    {"name": "having$ebnf$1", "symbols": ["having$ebnf$1", "having$ebnf$1$subexpression$1"], "postprocess": function arrpush(d) {return d[0].concat([d[1]]);}},
    {"name": "having", "symbols": [(lexer.has("kw_having") ? {type: "kw_having"} : kw_having), "__", "expr", "having$ebnf$1", "_"]},
    {"name": "order_by", "symbols": [(lexer.has("kw_order_by") ? {type: "kw_order_by"} : kw_order_by), "__", "feilds", "_"]},
    {"name": "limit", "symbols": [(lexer.has("kw_limit") ? {type: "kw_limit"} : kw_limit), "__", "feilds", "_"]},
    {"name": "union$ebnf$1", "symbols": [(lexer.has("word") ? {type: "word"} : word)], "postprocess": id},
    {"name": "union$ebnf$1", "symbols": [], "postprocess": function(d) {return null;}},
    {"name": "union", "symbols": [(lexer.has("kw_union") ? {type: "kw_union"} : kw_union), "_", "union$ebnf$1", "__", "select_stm", "_"]},
    {"name": "format", "symbols": [(lexer.has("kw_format") ? {type: "kw_format"} : kw_format), "__", (lexer.has("word") ? {type: "word"} : word)]},
    {"name": "feild", "symbols": ["val"]},
    {"name": "feild", "symbols": ["val", "__", (lexer.has("as") ? {type: "as"} : as), "__", (lexer.has("word") ? {type: "word"} : word)]},
    {"name": "feild", "symbols": ["val", "__", (lexer.has("word") ? {type: "word"} : word)]},
    {"name": "feilds$ebnf$1$subexpression$1", "symbols": ["feild"]},
    {"name": "feilds$ebnf$1$subexpression$1", "symbols": [(lexer.has("star") ? {type: "star"} : star)]},
    {"name": "feilds$ebnf$1", "symbols": ["feilds$ebnf$1$subexpression$1"]},
    {"name": "feilds$ebnf$1$subexpression$2", "symbols": ["feild"]},
    {"name": "feilds$ebnf$1$subexpression$2", "symbols": [(lexer.has("star") ? {type: "star"} : star)]},
    {"name": "feilds$ebnf$1", "symbols": ["feilds$ebnf$1", "feilds$ebnf$1$subexpression$2"], "postprocess": function arrpush(d) {return d[0].concat([d[1]]);}},
    {"name": "feilds$ebnf$2", "symbols": []},
    {"name": "feilds$ebnf$2$subexpression$1", "symbols": ["_", (lexer.has("comma") ? {type: "comma"} : comma), "_", "feild"]},
    {"name": "feilds$ebnf$2", "symbols": ["feilds$ebnf$2", "feilds$ebnf$2$subexpression$1"], "postprocess": function arrpush(d) {return d[0].concat([d[1]]);}},
    {"name": "feilds", "symbols": ["feilds$ebnf$1", "feilds$ebnf$2", "_"]},
    {"name": "expr$subexpression$1", "symbols": ["val", "_", (lexer.has("op") ? {type: "op"} : op), "_", "val"]},
    {"name": "expr$subexpression$1", "symbols": [(lexer.has("lparen") ? {type: "lparen"} : lparen), "_", "val", "_", (lexer.has("op") ? {type: "op"} : op), "_", "val", "_", (lexer.has("rparen") ? {type: "rparen"} : rparen)]},
    {"name": "expr", "symbols": ["expr$subexpression$1", "_"]},
    {"name": "func$ebnf$1", "symbols": []},
    {"name": "func$ebnf$1$subexpression$1", "symbols": ["_", (lexer.has("comma") ? {type: "comma"} : comma), "_", "val"]},
    {"name": "func$ebnf$1", "symbols": ["func$ebnf$1", "func$ebnf$1$subexpression$1"], "postprocess": function arrpush(d) {return d[0].concat([d[1]]);}},
    {"name": "func", "symbols": [(lexer.has("word") ? {type: "word"} : word), "_", (lexer.has("lparen") ? {type: "lparen"} : lparen), "_", "val", "_", "func$ebnf$1", "_", (lexer.has("rparen") ? {type: "rparen"} : rparen), "_"]},
    {"name": "val$subexpression$1", "symbols": [(lexer.has("word") ? {type: "word"} : word)]},
    {"name": "val$subexpression$1", "symbols": [(lexer.has("num") ? {type: "num"} : num)]},
    {"name": "val$subexpression$1", "symbols": [(lexer.has("string") ? {type: "string"} : string)]},
    {"name": "val$subexpression$1", "symbols": ["select_stm"]},
    {"name": "val$subexpression$1", "symbols": ["func"]},
    {"name": "val", "symbols": ["val$subexpression$1"]},
    {"name": "_$ebnf$1", "symbols": []},
    {"name": "_$ebnf$1", "symbols": ["_$ebnf$1", (lexer.has("ws") ? {type: "ws"} : ws)], "postprocess": function arrpush(d) {return d[0].concat([d[1]]);}},
    {"name": "_", "symbols": ["_$ebnf$1"], "postprocess": function(d) { null }},
    {"name": "__", "symbols": [(lexer.has("ws") ? {type: "ws"} : ws)], "postprocess": function(d) { null }},
    {"name": "multiplication", "symbols": [(lexer.has("number") ? {type: "number"} : number), (lexer.has("ws") ? {type: "ws"} : ws), (lexer.has("times") ? {type: "times"} : times), (lexer.has("ws") ? {type: "ws"} : ws), (lexer.has("number") ? {type: "number"} : number)], "postprocess": ([first, , , , second]) => first * second},
    {"name": "trig", "symbols": [{"literal":"sin"}, (lexer.has("ws") ? {type: "ws"} : ws), (lexer.has("number") ? {type: "number"} : number)], "postprocess": ([, ,third]) => Math.sin(third)}
]
  , ParserStart: "main"
}
if (typeof module !== 'undefined'&& typeof module.exports !== 'undefined') {
   module.exports = grammar;
} else {
   window.grammar = grammar;
}
})();
