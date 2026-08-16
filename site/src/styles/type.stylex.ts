import * as stylex from '@stylexjs/stylex'

/* The two lines a page opens with: its title, and the deck under the title.
 *
 * Written pages and generated pages both open this way, and a reader moving
 * between them must not be able to tell which kind of page they are on. So
 * the type is decided once, here.
 *
 * Margins are not here, and the title carries no ink. A page adds its own:
 * the two kinds of page disagree about the title's weight of ink and the
 * trailing air under a deck, and those are theirs to make.
 *
 * The name of this file is part of the contract. The StyleX compiler follows
 * a cross-module import only when the specifier ends in `.stylex`. Under any
 * other name, every page that reads from here loses these styles.
 */

export const TYPE = stylex.create({
  title: {
    fontSize: 'var(--text-h1)',
    fontWeight: 600,
    letterSpacing: '-0.015em',
    lineHeight: 1.15,
    // A title is short enough to balance, and a one-word second line reads
    // as a mistake.
    textWrap: 'balance',
  },
  // The deck says what the page does, in the page's own words. It stays at
  // body size: the title is the size signal, and muted ink is the rest.
  deck: {
    color: 'var(--ink-muted)',
    textWrap: 'pretty',
  },
})
