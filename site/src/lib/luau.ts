import {
  defineLanguage,
  type HighlightTokenClass,
  type TokenRange,
} from '@tanstack/highlight/core'

// TanStack Highlight ships no Lua or Luau grammar, and an unknown language
// falls back to plaintext without an error, so every Luau block on the site
// would quietly go grey. This is a custom LanguageDefinition per the
// documented defineLanguage API. One alternation pass yields ordered,
// non-overlapping ranges; anything unmatched stays plain text.
//
// Array order is precedence, twice over: JavaScript alternation is
// leftmost-first, and the group scan below stops at the first group that
// matched. `meta` precedes `comment` so `--!strict` is not eaten as a
// comment. `comment` precedes `str` so an apostrophe in `-- don't` cannot
// open one. `func` precedes `property` so `niwa.file(` colours `file` as a
// call.
const RULES = [
  /(?<meta>--!\w+)/,
  /(?<comment>--\[(?<ceq>=*)\[[\s\S]*?\]\k<ceq>\]|--[^\n]*)/,
  /(?<str>\[(?<seq>=*)\[[\s\S]*?\]\k<seq>\]|"(?:\\.|[^"\\\n])*"|'(?:\\.|[^'\\\n])*'|`(?:\\.|[^`\\])*`)/,
  // The lookbehind keeps digits inside an identifier out. Without it there
  // is no identifier rule to claim them, so the `1` in `n1` and the `256`
  // in `sha256` colour as numbers.
  /(?<![\w.])(?<number>0[xX][\da-fA-F_]+|0[bB][01_]+|(?:\d[\d_]*(?:\.[\d_]*)?|\.\d[\d_]*)(?:[eE][+-]?\d+)?)/,
  /(?<literal>\b(?:true|false|nil)\b)/,
  // A field named like a keyword is a field. The lookbehind declines the
  // identifier after a `.` so the property rule below can take it, and
  // `func` still takes it first when a call follows. The colon is left out:
  // after `:` sit type annotations and casts, which are not properties.
  //
  // The lookahead declines a name being assigned to. `type` is the only
  // word here that is contextual rather than reserved, so `{ type = "x" }`
  // is a table key and reads like its neighbours; no reserved word can
  // legally stand before a single `=`.
  /(?<!\.)(?<keyword>\b(?:and|break|continue|do|else|elseif|end|export|for|function|if|in|local|not|or|repeat|return|then|type|until|while)\b)(?!\s*=[^=])/,
  /(?<func>\b[A-Za-z_]\w*(?=\s*(?:[({]|"|'|`|\[\[|\[=)))/,
  /(?<property>(?<=\.)[A-Za-z_]\w*)/,
  /(?<operator>\.\.\.|\.\.=?|[=~<>]=|::|[+\-*/%^#=<>])/,
]
  .map((rule) => rule.source)
  .join('|')

// `ceq` and `seq` are backreference targets for long-bracket levels and
// carry no class. Any helper group must be declared after the group that
// owns it, or the scan below stops on the helper and emits nothing.
const CLASS_FOR_GROUP: Record<string, HighlightTokenClass> = {
  meta: 'meta',
  comment: 'comment',
  str: 'string',
  number: 'number',
  literal: 'literal',
  keyword: 'keyword',
  func: 'function',
  property: 'property',
  operator: 'operator',
}

/**
 * Tokenize Luau source into ordered, non-overlapping ranges.
 *
 * The regex is built per call. A `g`-flagged regex carries its scan
 * position, so a shared one would let a nested tokenization — a grammar
 * that embeds Luau, which the highlighter supports to a depth of 24 —
 * rewind the outer scan.
 */
export function tokenize(code: string): Array<TokenRange> {
  const token = new RegExp(RULES, 'g')
  const ranges: Array<TokenRange> = []
  let match: RegExpExecArray | null

  while ((match = token.exec(code))) {
    // No alternative can match empty today. This is the only thing standing
    // between a future edit and an infinite loop.
    if (match[0].length === 0) {
      token.lastIndex += 1
      continue
    }
    for (const [group, value] of Object.entries(match.groups ?? {})) {
      const className = CLASS_FOR_GROUP[group]
      if (value !== undefined && className) {
        // The whole match is the range. That is only correct because every
        // rule that needs context uses a zero-width assertion, so `match[0]`
        // is exactly the token. A consuming prefix would colour itself too.
        ranges.push({
          start: match.index,
          end: match.index + match[0].length,
          className,
        })
        break
      }
    }
  }

  return ranges
}

export const luau = defineLanguage({
  name: 'luau',
  aliases: ['lua'],
  tokenize,
})
