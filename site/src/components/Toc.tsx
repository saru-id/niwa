import { Outline } from '@astryxdesign/core/Outline'
import { Theme } from '@astryxdesign/core/theme'
import type { Heading } from '../lib/headings'
import { niwaTheme } from '../theme/niwa'

/* The table of contents.
 *
 * The one piece of the chrome that is still the design system's, and the
 * reason is that it is the one piece with behaviour worth borrowing: it
 * follows the reader down the page. The bar and the rail were markup
 * wearing a component's clothes; this is a component.
 *
 * The offset it clears is the bar's height in the unit it measures in.
 * `--bar-height` is 3.25rem and the site does not scale its root.
 */
const BAR_HEIGHT = 52

export function Toc({ headings }: { headings: readonly Heading[] }) {
  return (
    <Theme theme={niwaTheme}>
      <Outline
        label="On this page"
        density="compact"
        offset={BAR_HEIGHT}
        items={headings.map((heading) => ({
          id: heading.id,
          label: heading.text,
          level: heading.depth,
        }))}
      />
    </Theme>
  )
}
