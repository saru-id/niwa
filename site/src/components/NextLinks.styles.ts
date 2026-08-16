import * as stylex from '@stylexjs/stylex'

/* The label over the links out of a page.
 *
 * The rule above it, the list under it and the clause after each link are
 * the page's own, from `src/styles/type.stylex.ts`. Only the label is here,
 * and it is set the way the site sets every label that names a group of
 * links: the rail's groups and the contents beside the article wear this
 * same one.
 */
export const styles = stylex.create({
  label: {
    color: 'var(--ink-muted)',
    fontFamily: 'var(--font-mono)',
    fontSize: 'var(--text-kicker)',
    fontWeight: 500,
    letterSpacing: '0.09em',
    marginBlock: '0 0.5rem',
    textTransform: 'uppercase',
  },
})
