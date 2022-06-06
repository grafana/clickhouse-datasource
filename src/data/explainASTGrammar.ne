@{%
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
%}

# Pass your lexer with @lexer:
@lexer lexer

main -> select_stm {% c => c[0]%}

select_stm -> _ %kw_SelectQuery _ children_count %newline _ select_query:+ _ identifier
{% c => ({
	kw: c[1].value,
	childCount: c[3].childCount,
	items: c[6],
	identifier: c[8]
})%}

select_query -> (expression_list _ | tables_in_select_query _ | function _)
{% c =>  c[0][0] %}

expression_list -> %kw_ExpressionList _ children_count %newline expression:+
{% c => ({
	kw: c[0].value,
	childCount: c[2].childCount,
	items: c[4]
})%}

expression -> _ (identifier %newline | function | literal %newline | asterisk %newline)
{% c => c[1][0] %}

tables_in_select_query -> %kw_TablesInSelectQuery _ children_count %newline tables_in_select_query_element:+
{% c => ({
	kw: c[0].value,
	childCount: c[2].childCount,
	items: c[4]
})%}

tables_in_select_query_element -> _ %kw_TablesInSelectQueryElement _ children_count %newline _ table_elements:+
{% c => ({
	kw: c[1].value,
	childCount: c[3].childCount,
	items: c[6]
})%}

table_elements -> (table_expression | table_operation)
{% c => c[0][0] %}

table_operation -> _ %word %newline
{% c => ({
	kw:c[1].value
})%}

table_expression -> %kw_TableExpression _ children_count %newline table_identifiers:+
{% c => ({
	kw: c[0].value,
	childCount: c[2].childCount,
	items: c[4]
})%}

table_identifier -> %kw_TableIdentifier _ %word (_ alias):?
{% c => ({
	kw: c[0].value,
	name: c[2].value,
	alias: (c[3] ? c[3][1].name : null)
})%}

table_identifiers -> _ table_identifier %newline
{% c => c[1]%}

function -> %kw_Function _ %word _ children_count %newline _ expression_list:+
{% c => ({
	kw: c[0].value,
	name: c[2].value,
	childCount: c[4].childCount,
	items: c[7]
})%}

identifier -> %kw_Identifier _ %word (_ alias):?
{% c => ({
	kw: c[0].value,
	name: c[2].value,
	alias: (c[3] ? c[3][1].name : null)
})%}

literal -> %kw_Literal _ (%string | %word)
{% c => ({
	kw: c[0].value,
	val: c[2][0].value
})%}

asterisk -> %kw_Asterisk
{% c => ({
	kw: c[0].value
})%}

children_count -> %lparen _ %word _ %word _ %rparen
{% c => ({
	childCount: Number.parseInt(c[4].value)
})%}

alias -> %lparen _ %word _ %word _ %rparen
{% a => ({
	name: a[4].value
})%}

_ -> %ws:*
{% _ => { null } %}

__ -> %ws
{% _ => { null } %}