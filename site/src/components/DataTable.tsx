import * as stylex from '@stylexjs/stylex'
import { isValidElement, type ReactNode } from 'react'

const styles = stylex.create({
  // A table wider than the column it stands in scrolls sideways rather than
  // pushing the page along with it. The tab stop is what lets a keyboard
  // reach the part that is off screen.
  scroll: {
    overflowX: 'auto',
  },
  // The air a table keeps from the prose above and below it. The scroll
  // container makes its own block formatting context, so the margin belongs
  // to the table and stays inside it.
  table: {
    borderCollapse: 'collapse',
    marginBlock: '1.5rem',
    // The columns take the widths `measure` works out and ignore what the
    // cells hold, so one long line cannot take the room another column needs.
    tableLayout: 'fixed',
    width: '100%',
  },
  cell: {
    paddingBlock: '0.5rem',
    paddingInline: '0.75rem',
  },
  // A heading labels its column and is not part of the running text, so it
  // takes the quieter ink.
  heading: {
    color: 'var(--ink-muted)',
    fontWeight: 600,
  },
  content: {
    // A cell paints nothing outside its column. An identifier is set `nowrap`
    // in `app.css`, and one longer than its column would otherwise run under
    // the cell beside it.
    overflow: 'hidden',
    // A path or a flag with no space in it breaks instead of widening the
    // column past the width it was measured for.
    overflowWrap: 'break-word',
    verticalAlign: 'top',
  },
  // The hairline under the header and under every row but the last. A rule at
  // the foot as well would close the table into a box, and the table is a
  // rhythm of rows, not a frame.
  rule: {
    borderBottomColor: 'var(--border)',
    borderBottomStyle: 'solid',
    borderBottomWidth: 1,
  },
})

/** Which edge a column's cells line up on. */
export type TableColumnAlign = 'start' | 'center' | 'end'

/* Where a column lines up, on its heading and its cells alike. A browser
 * centres a header cell, so `start` is declared and never left to the
 * default. */
const alignments = stylex.create({
  start: { textAlign: 'start' },
  center: { textAlign: 'center' },
  end: { textAlign: 'end' },
})

/** One column: the words above it, and which edge its cells line up on. */
export interface DataColumn {
  readonly header: ReactNode
  readonly align?: TableColumnAlign
}

/** About the width of one character, for sizing a column from its text. */
const CHARACTER = 8

/** The narrowest a column may be, however short the text in it: room for a
 * short word at the table's size, so no column collapses on a phone. */
const FLOOR = 60

/** How many rows a column is measured from. The first few carry the shape
 * of the rest, and a whole reference table would be measured twice. */
const SAMPLE = 5

/** The share of the table one column takes, and the width it will not go under. */
interface Measurement {
  readonly share: number
  readonly floor: number
}

/** The widths of the table, as the elements that carry them read them. */
interface Widths {
  /** One per column, for its `th`. */
  readonly columns: { readonly width: string; readonly minWidth: string }[]
  /** The width under which some column would fall below its own floor. */
  readonly table: string
}

/** The longest run in `text` with no space, tab or newline in it. */
function longestWord(text: string): number {
  return text.split(/[ \t\n]+/).reduce((longest, word) => Math.max(longest, word.length), 0)
}

/**
 * The widths of a table, read off the text it holds.
 *
 * A column of flag names should not take the room a column of sentences
 * needs, and nothing here can ask a browser how wide a word draws: the table
 * is built once, on a machine with no fonts loaded and no page to lay out. So
 * the text is counted instead, in characters, from the heading and the first
 * few rows — enough to tell a column of identifiers from a column of prose.
 *
 * Each column asks for one, two or three shares of the table by how long its
 * longest cell is, and floors itself at the width of its longest unbreakable
 * word. The table's own floor is then the smallest width at which every
 * column clears its floor, which is what makes a table of long identifiers
 * scroll sideways instead of squeezing one column to nothing.
 */
function measure(headings: readonly string[], rows: readonly (readonly string[])[]): Widths {
  const sample = rows.slice(0, SAMPLE)
  const measurements: Measurement[] = headings.map((heading, index) => {
    let longestCell = heading.length
    // The heading is one word for this purpose: it is never broken.
    let longest = heading.length
    for (const row of sample) {
      const cell = row[index] ?? ''
      longestCell = Math.max(longestCell, cell.length)
      longest = Math.max(longest, longestWord(cell))
    }
    return {
      // Six characters is an exit code or a mark, fifteen is a name or a
      // path, and anything longer is a sentence.
      share: longestCell <= 6 ? 1 : longestCell <= 15 ? 2 : 3,
      floor: Math.max(longest * CHARACTER, FLOOR),
    }
  })

  const shares = measurements.reduce((total, column) => total + column.share, 0)
  return {
    columns: measurements.map((column) => ({
      width: `${(column.share / shares) * 100}%`,
      minWidth: `${column.floor}px`,
    })),
    table: `${measurements.reduce(
      (widest, column) => Math.max(widest, (column.floor * shares) / column.share),
      0,
    )}px`,
  }
}

/** Anything a cell can hold, as the plain text it reads as. */
function plain(node: ReactNode): string {
  if (typeof node === 'string') return node
  if (typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(plain).join('')
  if (isValidElement<{ children?: ReactNode }>(node)) return plain(node.props.children)
  return ''
}

/**
 * A table: a heading row, a rule under it, and a rule under every row but the
 * last.
 *
 * A cell may be a fragment of markup, so every cell travels twice: as the
 * node the reader sees, and as the text it measures as.
 *
 * A header row labels its columns; it is not prose. Pagefind joins cell text
 * with no separator, so indexed it reads "FlagArgumentMeaning" inside an
 * excerpt. The header cells stay on the page and leave the index.
 *
 * Rendered with no client directive, so React runs once, during the build.
 */
export function DataTable({
  columns,
  rows,
}: {
  columns: readonly DataColumn[]
  rows: readonly (readonly ReactNode[])[]
}) {
  const widths = measure(
    columns.map((column) => plain(column.header)),
    rows.map((row) => row.map(plain)),
  )
  const last = rows.length - 1

  return (
    <div {...stylex.props(styles.scroll)} aria-label="Table" role="group" tabIndex={0}>
      <table {...stylex.props(styles.table)} style={{ minWidth: widths.table }}>
        <thead>
          <tr>
            {columns.map((column, index) => {
              const cell = stylex.props(
                styles.cell,
                styles.heading,
                styles.rule,
                alignments[column.align ?? 'start'],
              )
              return (
                <th
                  className={cell.className}
                  data-pagefind-ignore=""
                  key={index}
                  scope="col"
                  style={{ ...cell.style, ...widths.columns[index] }}
                >
                  {column.header}
                </th>
              )
            })}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={index}>
              {columns.map((column, position) => (
                <td
                  key={position}
                  {...stylex.props(
                    styles.cell,
                    styles.content,
                    index === last ? null : styles.rule,
                    alignments[column.align ?? 'start'],
                  )}
                >
                  {row[position]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/** One column of a generated reference table. */
export interface ReferenceColumn {
  readonly header: string
  /** True where the cells are identifiers the reader types, not prose. */
  readonly identifier?: boolean
}

/**
 * A generated reference table.
 *
 * The reference pages are built from typed data modules, so a table there is
 * a heading row and a rectangle of strings. The columns that hold a flag, an
 * argument, a variable or an exit code hold code, and say so.
 */
export function ReferenceTable({
  columns,
  rows,
}: {
  columns: readonly ReferenceColumn[]
  rows: readonly (readonly string[])[]
}) {
  return (
    <DataTable
      columns={columns.map((column) => ({ header: column.header }))}
      rows={rows.map((row) =>
        row.map((cell, index) =>
          columns[index]?.identifier === true ? <code key={index}>{cell}</code> : cell,
        ),
      )}
    />
  )
}
