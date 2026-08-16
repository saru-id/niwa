import * as stylex from '@stylexjs/stylex'

/* The type a documentation page is set in, and the air between its parts.
 *
 * A page opens with a title and a deck, and runs on sections, paragraphs and
 * lists under them. Written pages and generated pages are built by different
 * code and a reader moving between them must not be able to tell which kind
 * of page they are on, so every one of those decisions is made once, here.
 * The generated pages read these styles directly; the markdown renderer
 * hands them to the elements it builds, which carry no class of their own.
 *
 * The name of this file is part of the contract. The StyleX compiler follows
 * a cross-module import only when the specifier ends in `.stylex`. Under any
 * other name, every page that reads from here loses these styles.
 */

export const TYPE = stylex.create({
  title: {
    color: 'var(--ink-strong)',
    fontSize: 'var(--text-h1)',
    fontWeight: 600,
    letterSpacing: '-0.015em',
    lineHeight: 1.15,
    marginBlock: '0.75rem 0',
    // A title is short enough to balance, and a one-word second line reads
    // as a mistake.
    textWrap: 'balance',
  },
  // The deck says what the page does, in the page's own words. It stays at
  // body size: the title is the size signal, and muted ink is the rest.
  deck: {
    color: 'var(--ink-muted)',
    marginBlock: '0.75rem 1.5rem',
    textWrap: 'pretty',
  },
  /* The chapter rule: a full-width hairline with air on both sides.
   *
   * It opens every section of a page, and the links out of the page at the
   * end of it. It is the only rule the reading column draws, and it carries
   * most of the hierarchy these pages have.
   */
  chapter: {
    borderBlockStartColor: 'var(--border)',
    borderBlockStartStyle: 'solid',
    borderBlockStartWidth: 1,
    marginBlock: '2.75rem 0',
    paddingBlockStart: '2.25rem',
  },
  // The heading the chapter rule stands above.
  section: {
    fontSize: 'var(--text-h2)',
    fontWeight: 600,
    letterSpacing: '-0.02em',
    lineHeight: 1.2,
    textWrap: 'balance',
  },
  paragraph: {
    marginBlock: '1rem',
  },
  // A list of prose. The indent is the marker's room and nothing more.
  list: {
    marginBlock: '1rem',
    paddingInlineStart: '1.5rem',
  },
  // A run of entries: each is a name and a line about it. The name is the
  // marker, so the list carries neither a bullet nor an indent, and it reads
  // down the page rather than across it.
  entries: {
    listStyle: 'none',
    marginBlock: 0,
    paddingInlineStart: 0,
  },
  // One row of either kind. The outer edges are flush, so a list holds the
  // same air from what surrounds it that a paragraph does.
  item: {
    marginBlockEnd: { default: '0.45rem', ':last-child': 0 },
    marginBlockStart: { default: '0.45rem', ':first-child': 0 },
  },
  // The clause after a name says why to follow it, so it sits one step back
  // from the name.
  said: {
    color: 'var(--ink-muted)',
  },
})
