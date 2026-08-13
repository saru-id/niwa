import { Code } from '@astryxdesign/core/Code'
import { Table, generateColumns } from '@astryxdesign/core/Table'
import type { TableColumn, TableColumnAlign, TablePlugin } from '@astryxdesign/core/Table'
import { Theme } from '@astryxdesign/core/theme'
import * as stylex from '@stylexjs/stylex'
import { isValidElement, type ReactNode } from 'react'

import { niwaTheme } from '../theme/niwa'

const styles = stylex.create({
  // The air a table keeps from the prose above and below it. The scroll
  // container the design system draws makes its own block formatting
  // context, so the margin belongs to the table and stays inside it.
  table: {
    marginBlock: 'var(--spacing-6)',
  },
  // A column heading names its column, and `acknowledg…` names nothing. The
  // design system clips a heading that outgrows its column; where the table
  // is at its narrowest, on a phone, the heading wraps instead.
  heading: {
    overflow: 'visible',
    textOverflow: 'clip',
    whiteSpace: 'normal',
  },
})

/** A row as the design system reads it: one string per column, to measure. */
type Row = Record<string, string>

/** One column: the words above it, and which edge its cells line up on. */
export interface DataColumn {
  readonly header: ReactNode
  readonly align?: TableColumnAlign
}

/* What every header cell needs, through the pipeline the design system opens
 * for exactly this. The design system builds the `thead` itself, so this is
 * where a header cell is reached.
 *
 * A header row labels its columns; it is not prose. Pagefind joins cell text
 * with no separator, so indexed it reads "FlagArgumentMeaning" inside an
 * excerpt. The header cells stay on the page and leave the index. */
const headerCells: TablePlugin<Row> = {
  transformHeaderCell: (props) => ({
    ...props,
    htmlProps: { ...props.htmlProps, 'data-pagefind-ignore': '' },
    xstyle: [...props.xstyle, styles.heading],
  }),
}

/** Anything a cell can hold, as the plain text it reads as. */
function plain(node: ReactNode): string {
  if (typeof node === 'string') return node
  if (typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(plain).join('')
  if (isValidElement<{ children?: ReactNode }>(node)) return plain(node.props.children)
  return ''
}

/** A key per column. Two columns may share a heading; keys may not. */
function keysFor(headings: readonly string[]): string[] {
  const taken = new Set<string>()
  return headings.map((heading, index) => {
    const key = taken.has(heading) ? `${heading} ${index}` : heading
    taken.add(key)
    return key
  })
}

/**
 * A table, rendered by the design system.
 *
 * Everything a reader sees — the hairlines, the cell rhythm, the column
 * widths, the scroll container that keeps a wide table from pushing the page
 * sideways — belongs to the design system. Nothing here draws a box.
 *
 * `generateColumns` sizes each column from what is in it, so a column of
 * flag names does not take the room a column of sentences needs. It reads
 * strings, and a cell may be a fragment of markup, so every cell travels
 * twice: as the node the reader sees, and as the text it measures as.
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
  const keys = keysFor(columns.map((column) => plain(column.header)))
  const nodes = new Map<Row, readonly ReactNode[]>()
  const data: Row[] = rows.map((row) => {
    const item = Object.fromEntries(keys.map((key, index) => [key, plain(row[index])]))
    nodes.set(item, row)
    return item
  })

  const measured: TableColumn<Row>[] = generateColumns(data).map((column, index) => ({
    ...column,
    header: columns[index]?.header,
    align: columns[index]?.align,
    renderCell: (item: Row) => nodes.get(item)?.[index] ?? null,
  }))

  return (
    <Theme theme={niwaTheme}>
      <Table
        columns={measured}
        data={data}
        dividers="rows"
        plugins={{ headerCells }}
        verticalAlign="top"
        xstyle={styles.table}
      />
    </Theme>
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
          columns[index]?.identifier === true ? <Code key={index}>{cell}</Code> : cell,
        ),
      )}
    />
  )
}
