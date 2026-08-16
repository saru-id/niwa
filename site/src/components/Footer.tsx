import * as stylex from '@stylexjs/stylex'
import { SITE } from '../nav'
import { styles } from './Footer.styles'

/* The foot of every page.
 *
 * It sits below the shell, not inside it, so that it is the document's own
 * `contentinfo` and not a block inside `main`. No client directive follows
 * it, so React runs here once, during the build.
 *
 * Three items and a version. The design document does not ship, so it is
 * not among them. The three are a plain row and not a `nav`: the rail is
 * the site's navigation, and a second landmark here would name a place the
 * page does not have.
 */
const LINKS = [
  { href: SITE.repository, label: 'Repository' },
  { href: SITE.index, label: 'llms.txt' },
  { href: SITE.license, label: 'License' },
]

export function Footer() {
  return (
    <footer {...stylex.props(styles.footer)}>
      <div {...stylex.props(styles.column, styles.line)}>
        {/* The version, bound to the crate's by a test. */}
        <span {...stylex.props(styles.version)}>niwa {SITE.version}</span>
        <div {...stylex.props(styles.links)}>
          {LINKS.map((link) => (
            <a key={link.href} href={link.href} {...stylex.props(styles.link)}>
              {link.label}
            </a>
          ))}
        </div>
      </div>
    </footer>
  )
}
