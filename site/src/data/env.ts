/* The environment, as data.
 *
 * Every variable niwa reads, and the two the installer reads. Nothing
 * else in the environment changes what the tool does.
 *
 * `env.test.ts` reads the Rust source for every `env::var` and `var_os`
 * call site and requires this list to name exactly what it finds: a
 * variable the tool started reading and a variable it stopped reading
 * both fail the build.
 */

/** Who reads the variable: the binary, or `install.sh`. */
export type Reader = 'tool' | 'installer'

export interface EnvVar {
  readonly name: string
  readonly reader: Reader
  /** What setting it does, in one line. */
  readonly role: string
}

export const ENV_VARS: readonly EnvVar[] = [
  {
    name: 'HOME',
    reader: 'tool',
    role: 'The home directory. It must be set and absolute, or niwa stops before it does anything.',
  },
  {
    name: 'XDG_CONFIG_HOME',
    reader: 'tool',
    role: 'Moves the config repo to <value>/niwa. Honored when absolute, ignored otherwise.',
  },
  {
    name: 'XDG_STATE_HOME',
    reader: 'tool',
    role: 'Moves the state directory to <value>/niwa. Honored when absolute, ignored otherwise.',
  },
  {
    name: 'XDG_DATA_HOME',
    reader: 'tool',
    role: 'Moves shared data, including the shipped types and resolved modules. Honored when absolute.',
  },
  {
    name: 'HOMEBREW_PREFIX',
    reader: 'tool',
    role: 'Where Homebrew lives, in place of the architecture default. Honored when absolute.',
  },
  {
    name: 'NIWA_MANAGED_PREFS',
    reader: 'tool',
    role: 'Where managed preferences are read from. It exists so the tests can run against a fake one.',
  },
  {
    name: 'NIWA_PROGRESS_EVERY',
    reader: 'tool',
    role: 'How often a long run prints a progress line, in seconds. The default is 30.',
  },
  {
    name: 'NO_COLOR',
    reader: 'tool',
    role: 'Set and not empty: no color. The marks stay, so the screen still reads.',
  },
  {
    name: 'FORCE_COLOR',
    reader: 'tool',
    role: 'Set, not empty, and not "0": color even when the output is a pipe.',
  },
  {
    name: 'TERM',
    reader: 'tool',
    role: '"dumb" turns color off, like NO_COLOR.',
  },
  {
    name: 'TERM_PROGRAM',
    reader: 'tool',
    role: 'Names the terminal. On the ones known to render OSC 8, niwa prints clickable links.',
  },
  {
    name: 'EDITOR',
    reader: 'tool',
    role: 'The editor pull opens for the edit answer. It may carry arguments, for example "code --wait".',
  },
  {
    name: 'ZDOTDIR',
    reader: 'tool',
    role: 'Where .zshrc lives. uninstall reads it to find the PATH line the installer wrote.',
  },
  {
    name: 'PATH',
    reader: 'tool',
    role: 'Where niwa finds the tools it drives, and what every command it runs inherits.',
  },
  {
    name: 'NIWA_RELEASE_BASE',
    reader: 'installer',
    role: 'Where install.sh fetches a release from. For mirrors, and for testing.',
  },
  {
    name: 'NIWA_VERSION',
    reader: 'installer',
    role: 'The version install.sh fetches. The default is the current release.',
  },
]

/** The variables one reader reads, in declaration order. */
export function envOf(reader: Reader): readonly EnvVar[] {
  return ENV_VARS.filter((variable) => variable.reader === reader)
}
