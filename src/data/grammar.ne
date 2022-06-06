@{%
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
%}

# Pass your lexer with @lexer:
@lexer lexer

main -> select_stm

select_stm -> select from:? where:? group_by:? having:? order_by:? limit:? union:? | %lparen _ select_stm _ %rparen _ %as:? _ %word:?

select -> %kw_select __ feilds _ {% ([kw, , w]) => [kw.value, w] %}
from -> %kw_from __ val (_ %comma _ val _):* _
where -> %kw_where __ expr (__ %joiner __ expr):* _
group_by -> %kw_group_by _ feilds _
having -> %kw_having __ expr (__ %joiner __ expr):* _
order_by -> %kw_order_by __ feilds _
limit -> %kw_limit __ feilds _
union -> %kw_union _ %word:? __ select_stm _
format -> %kw_format __ %word
feild -> val|val __ %as __ %word|val __ %word
feilds -> (feild|%star):+ (_ %comma _ feild):* _
expr -> (val _ %op _ val|%lparen _ val _ %op _ val _ %rparen) _
func -> %word _ %lparen _ val _ (_ %comma _ val):* _ %rparen _
val -> (%word|%num|%string|select_stm|func)
_ -> %ws:* {% function(d) { null } %}
__ -> %ws {% function(d) { null } %}

# %token matches any token of that type
multiplication -> %number %ws %times %ws %number {% ([first, , , , second]) => first * second %}

# literal strings match lexed tokens with their exact text
trig -> "sin" %ws %number {% ([, ,third]) => Math.sin(third) %}