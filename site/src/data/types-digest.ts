/* The shipped types, pinned by hash.
 *
 * `resources.ts`, `functions.ts` and `facts.ts` are transcribed from
 * `share/types/init.luau` by a person who read it. No parser can tell
 * whether a description still describes the call it sits under, so the
 * site does the next best thing: it pins the file. When the types change,
 * `types-digest.test.ts` fails and says to read them again.
 *
 * Update this line only after the data modules match the new file.
 */

/** SHA-256 of `share/types/init.luau`, hex, lowercase. */
export const TYPES_DIGEST = '77f5d52fc11d249b9962d49ba9abab30dd5e79828908938468948514b76497af'
