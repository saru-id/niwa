import { SideNav, SideNavItem, SideNavSection } from '@astryxdesign/core/SideNav'
import * as stylex from '@stylexjs/stylex'
import { NAV, currentPath } from '../nav'

/* The site's navigation, from `src/nav.ts`.
 *
 * One element, rendered once. Inside `AppShell` the design system decides
 * where it goes: its own column above the breakpoint, and the contents of
 * the drawer below it. Nothing is rendered twice, so nothing has to be
 * hidden.
 *
 * A group is a `SideNavSection`, which is the design system's own name for
 * one: it draws the title, the rhythm and the padding, and it names the
 * group to a screen reader through `role="group"`. Nothing here draws any of
 * that by hand.
 *
 * Every group stands open. A section has no disclosure, and the one nav
 * item that does opens from React state, so a reader with no script would
 * meet the twenty command pages sealed shut behind `inert`. A rail that is
 * wholly present is worth more than a rail that is short.
 */

/* Both rails set `--text-label-size`, and it is the same decision in both.
 *
 * These labels are sentences, not the word or two a nav item is usually
 * given. At the theme's label size most of them take two lines, and the
 * section titles above them are then the smaller type on the rail, which
 * stands its own hierarchy on its head. The size is set on the token the
 * items read, so it reaches them through the design system rather than past
 * it, and only inside this rail. The leading is a ratio, so it follows on
 * its own.
 */
const styles = stylex.create({
  // The column stands at the edge of the window, so its own air is the only
  // air its labels get. The design system gives the list eight pixels,
  // which is right for a rail inside a padded shell and not for this one.
  rail: {
    '--text-label-size': 'var(--text-nav)',
    paddingBlock: 'var(--spacing-4) var(--spacing-6)',
    paddingInline: 'var(--spacing-3)',
  },
  // Inside the drawer the list is the whole width it is given, and the
  // drawer has already drawn the air around it. Its height is its content:
  // a rail that fills its parent scrolls inside a drawer that also scrolls,
  // and one list behind two scrollbars is a list nobody can reach the end
  // of.
  drawer: {
    '--text-label-size': 'var(--text-nav)',
    height: 'auto',
    width: '100%',
  },
  // Six groups need to read as six. The design system spaces sections for a
  // rail of two or three; this one earns a clear step between them.
  group: {
    paddingBlockEnd: 'var(--spacing-1)',
    paddingBlockStart: 'var(--spacing-4)',
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
      {NAV.map((group) => (
        <SideNavSection key={group.label} title={group.label} xstyle={styles.group}>
          {group.entries.map((entry) => (
            <SideNavItem
              key={entry.path}
              label={entry.title}
              href={entry.path}
              isSelected={entry.path === here}
              size="sm"
            />
          ))}
        </SideNavSection>
      ))}
    </SideNav>
  )
}
