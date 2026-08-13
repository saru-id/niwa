/* The facts, as data.
 *
 * Seven values a config can read about the machine it is running on.
 * Facts are gathered once per run, so twenty guards asking the same
 * question cost one answer and the whole run sees a consistent world.
 * Names and types come from `share/types/init.luau`, and the digest in
 * `types-digest.ts` binds this file to that one.
 */

import type { ApiEntry } from './resources'

/** A fact is an entry whose signature is a value, not a call. */
export type Fact = ApiEntry

export const FACTS: readonly Fact[] = [
  {
    name: 'niwa.machine.name',
    signature: 'niwa.machine.name: string',
    description:
      "The machine's short name, spelled the way hosts/<name>.luau expects it. Empty when the system will not say.",
  },
  {
    name: 'niwa.machine.owner',
    signature: 'niwa.machine.owner: string',
    description: "The account's full name. Empty when the system will not say.",
  },
  {
    name: 'niwa.machine.arch',
    signature: 'niwa.machine.arch: string',
    description: 'The processor: "arm64" or "x86_64".',
  },
  {
    name: 'niwa.machine.os',
    signature: 'niwa.machine.os: string',
    description: 'The macOS version, as sw_vers reports it. Empty when the system will not say.',
  },
  {
    name: 'niwa.machine.tags',
    signature: 'niwa.machine.tags: { [string]: boolean }',
    description:
      'This machine\'s tags, as a set: niwa.machine.tags.work is true when the tag is set. This is the one fact you author, through niwa tag.',
  },
  {
    name: 'niwa.brew.prefix',
    signature: 'niwa.brew.prefix: string',
    description:
      'Where Homebrew lives: "/opt/homebrew" on Apple silicon, "/usr/local" otherwise. HOMEBREW_PREFIX wins when it is set to an absolute path.',
  },
  {
    name: 'niwa.home',
    signature: 'niwa.home: string',
    description:
      'This run\'s home directory. Resource targets expand "~/" against it, so a rehearsal under --sandbox moves every path together.',
  },
]
