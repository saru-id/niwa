import { AppShell } from '@astryxdesign/core/AppShell'
import { Button } from '@astryxdesign/core/Button'
import { HStack } from '@astryxdesign/core/HStack'
import { Kbd } from '@astryxdesign/core/Kbd'
import { Link } from '@astryxdesign/core/Link'
import { MobileNav } from '@astryxdesign/core/MobileNav'
import { Outline } from '@astryxdesign/core/Outline'
import { SegmentedControl, SegmentedControlItem } from '@astryxdesign/core/SegmentedControl'
import { StackItem } from '@astryxdesign/core/Stack'
import { Theme } from '@astryxdesign/core/theme'
import { TopNav, TopNavHeading } from '@astryxdesign/core/TopNav'
import { useEffect, useState, type ReactNode } from 'react'
import type { Heading } from '../lib/headings'
import { SITE } from '../nav'
import { recall, remember, show, type Choice } from '../scripts/theme'
import { niwaTheme } from '../theme/niwa'
import { styles } from './Shell.styles'
import { SiteNav } from './SiteNav'

/* The page shell.
 *
 * Frame: navigation 260 | reading 44rem | table of contents 13rem.
 *
 * Responsive contract, declared before the content:
 *   > 768px   navigation column | reading column, and above 1280 the
 *             table of contents joins them
 *   <= 768px  the navigation column becomes the header's drawer; the site
 *             stylesheet hides the column at the same width so the two
 *             agree before the shell's own script arrives
 *   no script the drawer cannot open, so the navigation is repeated once
 *             more inside a `<noscript>` below the shell
 *
 * One React tree, because the design system passes the navigation into the
 * drawer through context. Splitting it would render it twice.
 */

// The sticky header the rails clear, in the unit `offset` is measured in.
// `--header-height` is 3.75rem and the site does not scale its root.
const HEADER_HEIGHT = 60

interface Props {
  pathname: string
  /** Absent when the page has no headings. The rail then does not exist. */
  headings?: readonly Heading[]
  /** Search indexes every page unless the page says otherwise. */
  indexed?: boolean
  /**
   * The page renders no rail, so the header carries the navigation at every
   * width instead of handing it over above the breakpoint.
   */
  carriesNavigation?: boolean
  children?: ReactNode
}

/* The three named states. The store is `localStorage`, read by the blocking
 * script in the head and by nothing else; this is a view of it. The bar and
 * the drawer each show one, and both read the same state, so the two can
 * never disagree. */
function ThemeControl({ choice, onChoose }: { choice: Choice; onChoose: (choice: Choice) => void }) {
  return (
    <SegmentedControl
      label="Theme"
      size="sm"
      value={choice}
      data-theme-control
      onChange={(value) => {
        onChoose(value as Choice)
      }}
    >
      <SegmentedControlItem value="system" label="System" />
      <SegmentedControlItem value="light" label="Light" />
      <SegmentedControlItem value="dark" label="Dark" />
    </SegmentedControl>
  )
}

export function Shell({
  pathname,
  headings,
  indexed = true,
  carriesNavigation = false,
  children,
}: Props) {
  // A page with no headings has no rail.
  const outline = headings !== undefined && headings.length > 0 ? headings : undefined

  // A page with no navigation column owns its drawer: the shell only opens
  // one for itself below the breakpoint, and this one opens at every width.
  const [navOpen, setNavOpen] = useState(false)

  // The server cannot know the reader's stored choice, so it renders the one
  // the blocking script leaves when there is nothing stored, and the control
  // corrects itself on mount.
  const [choice, setChoice] = useState<Choice>('system')
  useEffect(() => {
    setChoice(recall())
  }, [])
  const choose = (next: Choice) => {
    remember(next)
    show(next)
    setChoice(next)
  }

  const settings = (
    <>
      <ThemeControl choice={choice} onChoose={choose} />
      <Link href={SITE.repository} isStandalone>
        Repository
      </Link>
    </>
  )

  const controls = (
    <>
      {/* The hint is for the eye. `aria-keyshortcuts` is the same fact,
        said the way a screen reader says it. The click is answered by
        `scripts/search.ts`, which is bound to the document and so is
        already listening before this button has any script of its own. */}
      <Button
        label="Search"
        variant="secondary"
        size="sm"
        data-search-open
        aria-haspopup="dialog"
        aria-keyshortcuts="Meta+K Control+K"
        endContent={<Kbd keys="mod+k" xstyle={styles.kbd} />}
      />
      <HStack gap={1} align="center" xstyle={styles.wideOnly}>
        {settings}
      </HStack>
      {carriesNavigation && (
        <Button label="Navigation" variant="ghost" size="sm" onClick={() => setNavOpen(true)} />
      )}
    </>
  )

  /* The drawer: the same list, the same two settings, under the name the
   * rail uses. The shell would build one of its own, but that one holds the
   * list without its landmark and calls itself Navigation. */
  const drawer = (
    <MobileNav
      header="niwa"
      label="Site"
      isOpen={carriesNavigation ? navOpen : undefined}
      onOpenChange={carriesNavigation ? setNavOpen : undefined}
    >
      <SiteNav pathname={pathname} inDrawer />
      <HStack gap={1} align="center" wrap="wrap" xstyle={styles.drawerControls}>
        {settings}
      </HStack>
    </MobileNav>
  )

  const content = (
    <HStack
      gap={10}
      align="start"
      paddingInline={5}
      paddingBlock={10}
      xstyle={carriesNavigation ? styles.bare : styles.body}
    >
      <StackItem size="fill" xstyle={styles.column} data-pagefind-body={indexed ? '' : undefined}>
        {children}
      </StackItem>
      {outline !== undefined && (
        <Outline
          label="On this page"
          density="compact"
          offset={HEADER_HEIGHT}
          xstyle={styles.outline}
          items={outline.map((heading) => ({
            id: heading.id,
            label: heading.text,
            level: heading.depth,
          }))}
        />
      )}
    </HStack>
  )

  return (
    <Theme theme={niwaTheme}>
      <AppShell
        height="auto"
        variant="section"
        contentPadding={0}
        topNav={
          <TopNav
            label="Header"
            xstyle={styles.bar}
            heading={<TopNavHeading heading="niwa" headingHref="/" xstyle={styles.wordmark} />}
            endContent={controls}
          />
        }
        sideNav={carriesNavigation ? undefined : <SiteNav pathname={pathname} />}
        {...(carriesNavigation
          ? /* No column to hand the navigation to, so the drawer is the
              navigation at every width and this page owns its open state.
              The shell only opens one for itself below the breakpoint. */
            { mobileNav: false as const }
          : { mobileNav: { breakpoint: 'md' as const, content: drawer } })}
      >
        {content}
        {carriesNavigation && drawer}
      </AppShell>
    </Theme>
  )
}

/**
 * The same navigation, for a reader with no script.
 *
 * It is rendered inside a `<noscript>`, which the browser parses as text
 * when scripting is on. So it is one navigation landmark or the other,
 * never both, and the shell's own column is hidden by the stylesheet at
 * exactly the width where its drawer would have taken over.
 */
export function FallbackNav({ pathname, carriesNavigation = false }: Pick<Props, 'pathname' | 'carriesNavigation'>) {
  return (
    <Theme theme={niwaTheme}>
      <HStack xstyle={[styles.fallback, !carriesNavigation && styles.fallbackWithRail]}>
        <SiteNav pathname={pathname} inDrawer />
      </HStack>
    </Theme>
  )
}
