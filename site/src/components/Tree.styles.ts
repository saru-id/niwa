import * as stylex from '@stylexjs/stylex'

export const styles = stylex.create({
  figure: {
    marginBlock: '1.5rem',
    marginInline: 0,
  },
  // The root the tree hangs from, named once. The tree draws structure; the
  // caption and the prose beside it say what the structure is for.
  caption: {
    color: 'var(--ink-muted)',
    fontFamily: 'var(--font-mono)',
    fontSize: 'var(--text-meta)',
    marginBlockEnd: '0.5rem',
  },
  // The tree renders in a shadow root, so no rule here reaches inside it.
  // Custom properties do: they inherit across the boundary, and the library
  // reads `--trees-theme-*` for palette slots and `--trees-*-override` for
  // everything with no palette slot of its own. Selection, hover and the
  // focus ring are all mixed from the accent, so setting the accent sets
  // those three too.
  frame: {
    '--trees-theme-sidebar-bg': 'var(--surface)',
    '--trees-theme-sidebar-fg': 'var(--ink)',
    '--trees-theme-sidebar-header-fg': 'var(--ink-muted)',
    '--trees-theme-sidebar-border': 'var(--border)',
    '--trees-accent-override': 'var(--accent)',
    '--trees-indent-guide-bg-override': 'var(--border-strong)',
    '--trees-font-family-override': 'var(--font-mono)',
    '--trees-font-size-override': 'var(--text-nav)',
    backgroundColor: 'var(--surface)',
    // Longhands: StyleX drops the `border` shorthand silently.
    borderColor: 'var(--border)',
    borderStyle: 'solid',
    borderWidth: 1,
    borderRadius: '6px',
    paddingBlock: '0.5rem',
  },
  // The library gives its host `height: 100%`, so the height a tree gets is
  // the height this element is given.
  host: (height: number) => ({
    height: `${String(height)}px`,
  }),
  // The purposes beside the tree, when the fence carries them: the path in
  // the chrome face, its purpose in prose, one line each.
  notes: {
    marginBlock: '0.75rem 0',
  },
  noteRow: {
    columnGap: '0.75rem',
    display: 'grid',
    gridTemplateColumns: 'minmax(6rem, max-content) minmax(0, 1fr)',
    marginBlock: '0.15rem',
  },
  notePath: {
    color: 'var(--ink-strong)',
    fontFamily: 'var(--font-mono)',
    fontSize: 'var(--text-meta)',
    margin: 0,
  },
  noteText: {
    color: 'var(--ink-muted)',
    fontSize: 'var(--text-table)',
    lineHeight: 1.5,
    margin: 0,
  },
})
