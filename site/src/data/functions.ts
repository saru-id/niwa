/* The Luau utility functions, as data.
 *
 * These are the calls that are not resources: they return values, load
 * things, or define a kind. None of them produces a plan line. The
 * signatures come from `share/types/init.luau`, and the digest in
 * `types-digest.ts` binds this file to that one.
 *
 * Eight names, eight signatures. `niwa.secret`'s two shapes share one
 * union signature, mirroring the shipped types: the analyzer never picks
 * between overloads for a table literal, so the types stopped offering it
 * the choice.
 */

import type { ApiEntry } from './resources'

export interface ApiFunction extends Omit<ApiEntry, 'signature'> {
  /** One line each. More than one only where the call is overloaded. */
  readonly signatures: readonly string[]
}

export const FUNCTIONS: readonly ApiFunction[] = [
  {
    name: 'niwa.try',
    signatures: ['niwa.try<T...>(body: () -> T...) -> ()'],
    description:
      'Run a block whose failures do not halt the apply. What fails inside it is reported and the run continues.',
  },
  {
    name: 'niwa.secret',
    signatures: [
      'niwa.secret(name: string | { name: string, from: string? }) -> Secret',
    ],
    description:
      'Take a handle on a secret. niwa searches the keychain, then secrets/<name>.age in the config repo, then an external manager; from forces one of them. The handle is opaque: it resolves at apply time, never at plan time, and the value never reaches the config or the screen.',
  },
  {
    name: 'niwa.render',
    signatures: [
      'niwa.render(template: string, values: { [string]: string | number | Secret }) -> Rendered',
    ],
    description:
      'Fill a template with values, writing {name} where each one goes. The result is opaque, like a secret: the plan shows its shape, and a secret inside it stays masked everywhere.',
  },
  {
    name: 'niwa.use',
    signatures: ['niwa.use(source: string) -> ()'],
    description:
      'Load a shared module. It is pinned by hash in niwa.lock and sandboxed exactly like your own code.',
  },
  {
    name: 'niwa.resource',
    signatures: [
      'niwa.resource<S>(kind: string, definition: { check: (read: ReadHandle, spec: S) -> boolean, apply: (act: ActHandle, spec: S) -> (), reverse: ((act: ActHandle, spec: S) -> ()) | false, describe: (spec: S) -> string, privileged: boolean? }) -> (spec: S) -> Result',
    ],
    description:
      'Define a resource kind of your own. It returns a constructor; calling the constructor declares a resource. check gets a read-only handle, so it cannot change the machine by construction, and reverse = false marks the kind irreversible. A custom kind may not take one of the nineteen reserved names.',
  },
  {
    name: 'niwa.exists',
    signatures: ['niwa.exists(path: string) -> boolean'],
    description:
      'Is there something at this path? The answer is memoised for the run, so twenty guards asking it cost one look.',
  },
  {
    name: 'niwa.command',
    signatures: ['niwa.command(name: string) -> boolean'],
    description:
      'Is this command on PATH? Memoised for the run, like exists.',
  },
  {
    name: 'niwa.host',
    signatures: ['niwa.host() -> ()'],
    description:
      'Load hosts/<this machine>.luau if it exists. Call it last: the host file is the override, so it has to run after the modules it overrides.',
  },
]
