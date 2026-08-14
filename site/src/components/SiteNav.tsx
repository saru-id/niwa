import { SideNav, SideNavItem } from '@astryxdesign/core/SideNav'
import * as stylex from '@stylexjs/stylex'
import { NAV, currentPath } from '../nav'

/* The site's navigation, from `src/nav.ts`.
 *
 * One element, rendered once. Inside `AppShell` the design system decides
 * where it goes: its own column above the breakpoint, and the contents of
 * the drawer below it. Nothing is rendered twice, so nothing has to be
 * hidden.
 *
 * Six groups, and only the one you are standing in is open. Sixty-one
 * sentence-length labels laid out flat is a rail two thousand pixels tall:
 * it cannot fit a window, so it scrolls inside itself, and every page load
 * returns that scroll to the top and loses your place. Opened one group at
 * a time the whole rail fits, so it never scrolls and never resets.
 *
 * The disclosure is a `<details>`, not the design system's collapsible nav
 * item, and that is the reason this file draws two elements by hand. The
 * component's disclosure opens from React state and renders its children
 * `inert` when closed, which would seal the twenty command pages away from
 * a reader with no script. `<details open>` is decided by the server, so
 * the rail is right in the HTML and stays operable with nothing running.
 * Everything below the summary is the design system's own item.
 */

const styles = stylex.create({
  /* Both rails set `--text-label-size`, and it is the same decision in
   * both. These labels are sentences, not the word or two a nav item is
   * usually given, and at the theme's label size most take two lines. The
   * size is set on the token the items read, so it reaches them through the
   * design system rather than past it, and only inside this rail. */
  rail: {
    '--text-label-size': 'var(--text-nav)',
    paddingBlock: 'var(--spacing-2) var(--spacing-4)',
    paddingInline: 'var(--spacing-3)',
  },
  // Inside the drawer the list is the whole width it is given, and the
  // drawer has already drawn the air around it.
  drawer: {
    '--text-label-size': 'var(--text-nav)',
    height: 'auto',
    width: '100%',
  },
  group: {
    marginBlockEnd: 'var(--spacing-0-5, 2px)',
  },
  /* The row that opens a group. It is the same height and the same shape as
   * an item below it, so the rail reads as one column of rows rather than
   * as headings with lists hanging off them. The marker is drawn by the
   * rule in `app.css`, which can reach a `::marker` and a rotation. */
  summary: {
    alignItems: 'center',
    borderRadius: 'var(--radius-inner)',
    color: { default: 'var(--ink-strong)', ':hover': 'var(--ink-strong)' },
    cursor: 'pointer',
    display: 'flex',
    fontSize: 'var(--text-nav)',
    fontWeight: 600,
    justifyContent: 'space-between',
    minBlockSize: 'var(--size-element-sm)',
    paddingInline: 'var(--spacing-2)',
    transitionDuration: 'var(--duration-fast)',
    transitionProperty: 'background-color',
    transitionTimingFunction: 'ease',
  },
})

interface Props {
  pathname: string
  /** Inside the drawer the list is the whole width it is given. */
  inDrawer?: boolean
}

export function SiteNav({ pathname, inDrawer = false }: Props) {
  const here = currentPath(pathname)

  return (
    <SideNav aria-label="Site" xstyle={inDrawer ? styles.drawer : styles.rail}>
      {NAV.map((group) => {
        const holdsHere = group.entries.some((entry) => entry.path === here)
        return (
          <details key={group.label} open={holdsHere} data-nav-group {...stylex.props(styles.group)}>
            <summary {...stylex.props(styles.summary)}>{group.label}</summary>
            {group.entries.map((entry) => (
              <SideNavItem
                key={entry.path}
                label={entry.title}
                href={entry.path}
                isSelected={entry.path === here}
                size="sm"
              />
            ))}
          </details>
        )
      })}
    </SideNav>
  )
}
