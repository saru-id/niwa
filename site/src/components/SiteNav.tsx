import { SideNav, SideNavItem } from '@astryxdesign/core/SideNav'
import * as stylex from '@stylexjs/stylex'
import { NAV, currentPath, groupOpens } from '../nav'

/* The site's navigation, from `src/nav.ts`.
 *
 * One element, rendered once. Inside `AppShell` the design system decides
 * where it goes: its own column above the breakpoint, and the contents of
 * the drawer below it. Nothing is rendered twice, so nothing has to be
 * hidden.
 *
 * The groups are `<details>` rather than the design system's collapsible
 * nav item. That item opens from React state, and a reader with no script
 * would meet the twenty command pages sealed shut behind `inert`. A
 * disclosure opens in the browser, with no script at all, which is the one
 * thing the fold has to do.
 */

const styles = stylex.create({
  drawer: {
    width: '100%',
  },
  group: {
    marginBlockStart: 'var(--spacing-4)',
  },
  // The summary is the group's own label, so it reads as the design
  // system's section titles do and answers the pointer as a control.
  label: {
    color: { default: 'var(--ink-muted)', ':hover': 'var(--ink-strong)' },
    cursor: 'pointer',
    fontFamily: 'var(--font-mono)',
    fontSize: 'var(--text-nav)',
    fontWeight: 500,
    paddingBlock: 'var(--spacing-1)',
    paddingInline: 'var(--spacing-2)',
    transitionDuration: 'var(--duration-fast)',
    transitionProperty: 'color',
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
    <SideNav aria-label="Site" xstyle={inDrawer ? styles.drawer : undefined}>
      {NAV.map((group) => (
        <details key={group.label} open={groupOpens(group, pathname)} {...stylex.props(styles.group)}>
          <summary {...stylex.props(styles.label)}>{group.label}</summary>
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
      ))}
    </SideNav>
  )
}
