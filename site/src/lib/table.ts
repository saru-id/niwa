/* Sizing a reference table from the text it holds.
 *
 * Nothing here can ask a browser how wide a word draws: the table is built
 * once, on a machine with no fonts loaded and no page to lay out. So the
 * text is counted instead, in characters.
 */

/** About the width of one character, for sizing a column from its text. The
 * widest text a column holds is an identifier in the table's mono face,
 * which advances just under nine pixels per character at the table's size. */
const CHARACTER = 9

/** The narrowest a column may be, however short the text in it: room for a
 * short word at the table's size, so no column collapses on a phone. */
const FLOOR = 60

/** `styles.cell`'s inline padding, at both ends. A column's width is what it
 * draws, not what it reads, so the padding is part of the room its longest
 * word needs: without it counted, a heading breaks inside a word and a long
 * identifier loses its tail. */
const AIR = 16

/** How many rows a column's SHARE is estimated from. The first few carry
 * the shape of the rest. The floor is different: it reads every row, because
 * the one identifier that would lose its tail can sit anywhere. */
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
 * word plus the air the cell holds it in. The table's own floor is then the
 * smallest width at which every column clears its floor, which is what makes
 * a table of long identifiers scroll sideways instead of squeezing one
 * column to nothing.
 */
export function measure(headings: readonly string[], rows: readonly (readonly string[])[]): Widths {
  const sample = rows.slice(0, SAMPLE)
  const measurements: Measurement[] = headings.map((heading, index) => {
    let longestCell = heading.length
    // The heading is one word for this purpose: it is never broken.
    let longest = heading.length
    for (const row of sample) {
      longestCell = Math.max(longestCell, (row[index] ?? '').length)
    }
    for (const row of rows) {
      longest = Math.max(longest, longestWord(row[index] ?? ''))
    }
    return {
      // Six characters is an exit code or a mark, fifteen is a name or a
      // path, and anything longer is a sentence.
      share: longestCell <= 6 ? 1 : longestCell <= 15 ? 2 : 3,
      floor: Math.max(longest * CHARACTER + AIR, FLOOR),
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
