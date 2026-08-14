import { AppShell } from '@astryxdesign/core/AppShell'
import { Button } from '@astryxdesign/core/Button'
import { Divider } from '@astryxdesign/core/Divider'
import { HStack } from '@astryxdesign/core/HStack'
import { Kbd } from '@astryxdesign/core/Kbd'
import { Layout, LayoutContent, LayoutPanel } from '@astryxdesign/core/Layout'
import { MobileNav } from '@astryxdesign/core/MobileNav'
import { Outline } from '@astryxdesign/core/Outline'
import { SegmentedControl, SegmentedControlItem } from '@astryxdesign/core/SegmentedControl'
import { DisplayIcon, MoonIcon, SearchIcon, SunIcon } from '../icons/theme'
import { Theme } from '@astryxdesign/core/theme'
import { TopNav, TopNavHeading } from '@astryxdesign/core/TopNav'
import * as stylex from '@stylexjs/stylex'
import { useEffect, useState, type ReactNode } from 'react'
// `?raw` inlines the vendored file at build time. Nothing is fetched.
import githubMark from '../icons/github.svg?raw'
import type { Heading } from '../lib/headings'
import { SITE } from '../nav'
import { recall, remember, show, type Choice } from '../scripts/theme'
import { niwaTheme } from '../theme/niwa'
import { FRAME, styles } from './Shell.styles'
import { SiteNav } from './SiteNav'

/* The page shell.
 *
 * Frame: navigation 260 | reading 720 | table of contents 192, with the
 * arithmetic and its reasons in `Shell.styles.ts`.
 *
 * Nothing inside the shell scrolls. The page is the one scroller: the shell
 * grows with its content, the reading column grows with it, and the
 * navigation column stands in the flow beside them. `app.css` releases the
 * one pane the design system would otherwise pin to the viewport.
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

// The sticky header the outline clears, in the unit `offset` is measured in.
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
      {/* The names are the labels a screen reader reads and the tooltips a
        pointer finds; the eye reads the icons. Three words spelled out sit
        in the header of every page for a choice made once. */}
      <SegmentedControlItem value="system" label="System" icon={<DisplayIcon />} isLabelHidden />
      <SegmentedControlItem value="light" label="Light" icon={<SunIcon />} isLabelHidden />
      <SegmentedControlItem value="dark" label="Dark" icon={<MoonIcon />} isLabelHidden />
    </SegmentedControl>
  )
}

/* The repository, named the way the repository names itself: the mark and
 * the slug. There is no remote yet, so there is no count of anything to
 * print beside them.
 *
 * The mark is one glyph and the design system has no component for artwork,
 * so it rides in a span. The file is drawn at 1em in `currentColor`, which
 * is why the span carries no size and no ink of its own. */
function RepositoryLink() {
  return (
    <Button
      label={SITE.slug}
      variant="ghost"
      size="sm"
      href={SITE.repository}
      icon={
        <span
          {...stylex.props(styles.mark)}
          aria-hidden="true"
          dangerouslySetInnerHTML={{ __html: githubMark }}
        />
      }
    />
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
      <RepositoryLink />
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
        aria-label="Search the documentation"
        icon={<SearchIcon />}
        variant="secondary"
        size="sm"
        data-search-open
        aria-haspopup="dialog"
        aria-keyshortcuts="Meta+K Control+K"
        endContent={<Kbd keys="mod+k" xstyle={styles.kbd} />}
        xstyle={styles.search}
      />
      <Divider orientation="vertical" xstyle={styles.rule} />
      <HStack gap={2} align="center" xstyle={styles.wideOnly}>
        {settings}
      </HStack>
      {/* The landing has no rail, so the header carries the way in. It is a
        link to where a reader starts, not a drawer named after itself:
        "Navigation" tells nobody where they would arrive. The drawer is
        still there below the rail's width, where the shell's own toggle
        opens it. */}
      {carriesNavigation && (
        <Button
          label="Documentation"
          href="/start"
          variant="ghost"
          size="sm"
        />
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
      <HStack gap={2} align="center" wrap="wrap" xstyle={styles.drawerControls}>
        {settings}
      </HStack>
    </MobileNav>
  )

  /* The reading frame. A page that carries its own full-width bands takes
   * neither the cap nor the padding: it was drawn for the width it is
   * given, and it has no headings to put in a table of contents. */
  const content = (
    <Layout
      height="auto"
      contentWidth={carriesNavigation ? undefined : FRAME.row}
      end={
        outline === undefined ? undefined : (
          /* The panel takes no landmark role of its own. The table of
             contents inside it is already a navigation landmark with this
             name, and a second landmark around it would say the same name
             twice. */
          <LayoutPanel
            isScrollable={false}
            padding={FRAME.padding}
            width={FRAME.outline}
            xstyle={styles.outline}
          >
            <Outline
              label="On this page"
              density="compact"
              offset={HEADER_HEIGHT}
              items={outline.map((heading) => ({
                id: heading.id,
                label: heading.text,
                level: heading.depth,
              }))}
            />
          </LayoutPanel>
        )
      }
      content={
        <LayoutContent
          isScrollable={false}
          padding={carriesNavigation ? 0 : FRAME.padding}
          xstyle={carriesNavigation ? undefined : styles.reading}
          data-pagefind-body={indexed ? '' : undefined}
        >
          {children}
        </LayoutContent>
      }
    />
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
