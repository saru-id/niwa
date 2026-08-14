import { HStack } from '@astryxdesign/core/HStack'
import { Link } from '@astryxdesign/core/Link'
import { Text } from '@astryxdesign/core/Text'
import { Theme } from '@astryxdesign/core/theme'
import * as stylex from '@stylexjs/stylex'
import { SITE } from '../nav'
import { styles } from './Footer.styles'
import { styles as shell } from './Layout.styles'
import { niwaTheme } from './../theme/niwa'

/* The foot of every page.
 *
 * It sits below the shell, not inside it, so that it is the document's own
 * `contentinfo` and not a block inside `main`. That puts it outside the
 * shell's theme, so it opens one of its own; the provider costs a wrapper
 * and nothing else, and no client directive follows it, so React runs here
 * once, during the build.
 *
 * Three items and a version. The design document does not ship, so it is
 * not among them.
 */
const LINKS = [
  { href: SITE.repository, label: 'Repository' },
  { href: SITE.index, label: 'llms.txt' },
  { href: SITE.license, label: 'License' },
]

export function Footer() {
  return (
    <Theme theme={niwaTheme}>
      <footer {...stylex.props(styles.footer)}>
        <HStack gap={4} align="center" wrap="wrap" xstyle={[shell.column, styles.line]}>
          {/* The only place the site names its version. */}
          <Text type="supporting" color="secondary" xstyle={styles.version}>
            niwa {SITE.version}
          </Text>
          <HStack gap={0} align="center" wrap="wrap" xstyle={styles.links}>
            {LINKS.map((link) => (
              <Link key={link.href} href={link.href} type="supporting" xstyle={styles.link}>
                {link.label}
              </Link>
            ))}
          </HStack>
        </HStack>
      </footer>
    </Theme>
  )
}
