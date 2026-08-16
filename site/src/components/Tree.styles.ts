import * as stylex from '@stylexjs/stylex'

export const styles = stylex.create({
  // The listing's own type and air, inside the box `src/styles/frames.stylex.ts`
  // draws. A listing is paths, so it is set in the face niwa prints paths in.
  frame: {
    fontFamily: 'var(--font-mono)',
    fontSize: 'var(--text-nav)',
    lineHeight: 1.7,
    paddingBlock: '0.75rem',
    paddingInline: '1rem',
  },
  // The root the rows hang from, printed as the listing's first line.
  root: {
    color: 'var(--ink-muted)',
    margin: 0,
  },
  rows: {
    display: 'grid',
    gridTemplateColumns: 'max-content',
  },
  /* Two columns when any row has something to say, and one when none does.
   *
   * The first column takes the width of the longest row of structure, so
   * every note starts at the same left edge and the column of purposes
   * reads straight down. The second takes what is left and wraps inside it.
   */
  rowsAnnotated: {
    columnGap: '1.5rem',
    gridTemplateColumns: 'max-content minmax(0, 1fr)',
  },
  // Each row spans the grid's own columns rather than making its own, so
  // one width serves them all.
  row: {
    display: 'contents',
  },
  name: {
    color: 'var(--ink-strong)',
    whiteSpace: 'pre',
  },
  // The box-drawing run. It is structure, not text: it sits back so the
  // names read as the content and the lines as the frame around them.
  prefix: {
    color: 'var(--border-strong)',
  },
  // A directory is named by its trailing slash. It also takes the muted ink,
  // so a glance down the column separates the containers from the contents.
  directory: {
    color: 'var(--ink-muted)',
  },
  /* The purpose, in the reading face.
   *
   * The structure is a filesystem and stays in the chrome face; a purpose is
   * a sentence and belongs in the face sentences are set in. The two faces
   * are what keeps the columns apart without a rule between them.
   */
  note: {
    color: 'var(--ink-muted)',
    fontFamily: 'var(--font-sans)',
    fontSize: 'var(--text-table)',
    whiteSpace: 'normal',
  },
})
