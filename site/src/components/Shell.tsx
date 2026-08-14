import { AppShell } from '@astryxdesign/core/AppShell'
import { Button } from '@astryxdesign/core/Button'
import { IconButton } from '@astryxdesign/core/IconButton'
import { HStack } from '@astryxdesign/core/HStack'
import { Layout, LayoutContent, LayoutPanel } from '@astryxdesign/core/Layout'
import { MobileNav } from '@astryxdesign/core/MobileNav'
import { Outline } from '@astryxdesign/core/Outline'
import { DisplayIcon, MoonIcon, SearchIcon, SunIcon } from '../icons/theme'
import { Theme } from '@astryxdesign/core/theme'
import { TopNav, TopNavHeading, TopNavItem } from '@astryxdesign/core/TopNav'
import * as stylex from '@stylexjs/stylex'
import { useState, type ReactNode } from 'react'
// `?raw` inlines the vendored file at build time. Nothing is fetched.
import githubMark from '../icons/github.svg?raw'
import type { Heading } from '../lib/headings'
import { SITE, currentPath } from '../nav'
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
/* The colour mode, in one control instead of three.
 *
 * A reader sets this once and never returns to it, so it takes the room of
 * one thing rather than three: the icon says where the mode stands now, and
 * pressing it moves to the next. The label and the title both name the
 * destination, so the pointer and the screen reader are told the same fact
 * before the press rather than after it.
 */
const NEXT: Record<Choice, Choice> = { system: 'light', light: 'dark', dark: 'system' }
const MODE_ICON: Record<Choice, () => ReactNode> = {
  system: () => <DisplayIcon />,
  light: () => <SunIcon />,
  dark: () => <MoonIcon />,
}
const MODE_NAME: Record<Choice, string> = { system: 'system', light: 'light', dark: 'dark' }

function ThemeControl({ choice, onChoose }: { choice: Choice; onChoose: (choice: Choice) => void }) {
  const next = NEXT[choice]
  return (
    <IconButton
      label={`Colour mode: ${MODE_NAME[choice]}. Switch to ${MODE_NAME[next]}.`}
      icon={MODE_ICON[choice]()}
      variant="ghost"
      size="sm"
      tooltip={`Colour mode: ${MODE_NAME[choice]}`}
      data-theme-control
      onClick={() => {
        onChoose(next)
      }}
    />
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

/* The site's four areas, in the bar.
 *
 * The rail lists the pages inside one area; this lists the areas. A reader
 * who lands deep in the reference can see the whole shape of the
 * documentation and move across it without going back to a start page. The
 * rail's own group opens itself from the address, so the two agree without
 * either knowing about the other.
 */
const AREAS = [
  { href: '/start', label: 'Start' },
  { href: '/concepts', label: 'Concepts' },
  { href: '/guides', label: 'Guides' },
  { href: '/reference', label: 'Reference' },
] as const

function AreaTabs({ pathname }: { pathname: string }) {
  const here = currentPath(pathname)
  return (
    <>
      {AREAS.map((area) => (
        <TopNavItem
          key={area.href}
          label={area.label}
          href={area.href}
          isSelected={here === area.href || here.startsWith(`${area.href}/`)}
        />
      ))}
    </>
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

  /* The server cannot know the reader's stored choice, so it renders the
   * one the blocking script leaves when nothing is stored. The browser
   * reads the store in the initialiser rather than in an effect: an
   * initialiser runs during the first render and is painted once, while an
   * effect runs after the paint, so the control was visibly jumping from
   * System to the stored choice on every load. */
  const [choice, setChoice] = useState<Choice>(() =>
    typeof document === 'undefined' ? 'system' : recall(),
  )
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
      {/* The shortcut is written out rather than resolved. The design
        system's own key component reads the platform in the browser, so
        the server sends one spelling and the browser replaces it, and the
        hint flickers on every load. niwa is a macOS tool; the key is the
        command key. */}
      <Button
        label="Search"
        aria-label="Search the documentation"
        icon={<SearchIcon />}
        variant="secondary"
        size="sm"
        data-search-open
        aria-haspopup="dialog"
        aria-keyshortcuts="Meta+K Control+K"
        endContent={
          <kbd {...stylex.props(styles.kbd)} aria-hidden="true">
            ⌘K
          </kbd>
        }
        xstyle={styles.search}
      />
      <HStack gap={1} align="center" xstyle={styles.wideOnly}>
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
            heading={
              <TopNavHeading
                heading="niwa"
                headingHref="/"
                xstyle={styles.wordmark}
                logo={<span {...stylex.props(styles.dot)} aria-hidden="true" />}
                headerEndContent={
                  <span {...stylex.props(styles.version)}>{SITE.version}</span>
                }
              />
            }
            startContent={<AreaTabs pathname={pathname} />}
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
