import * as stylex from '@stylexjs/stylex'
import { measure } from '../lib/table'
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
  // The air a cell holds its text in, the same at every edge. `AIR` below is
  // this padding at the two inline ends, and every column width is measured
  // with it counted in.
  cell: {
    paddingBlock: '0.5rem',
    paddingInline: '0.5rem',
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
