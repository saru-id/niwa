# The manual tier

These checks need a real machine, so no gate runs them: the automated
drills stop where the sandbox stops. Run them by hand on a machine you
own before a release, and record the date and result in the release
notes. The `drills/[0-9]*.sh` glob never matches this directory.

## Checks

1. **The watcher, live.** `niwa init` on a real machine loads the
   LaunchAgent. Change a tracked preference in System Settings; a
   notification names the change within seconds. `niwa uninstall`
   unloads and removes the agent. `launchctl list | grep rs.niwa`
   is empty afterwards.
2. **Privileged steps, honestly.** Run an apply whose config carries
   /Library work. The privileged steps are listed up front with their
   sources. There is no elevation at this version: attended, they run
   with your own rights (and fail plainly if those do not suffice);
   `--no-privileged` skips them whole. The one password prompt lands
   with the release channel.

3. **mas honesty.** Declare a `niwa.mas.app`. The declaration
   validates and counts; plan and apply answer Unchecked ("not yet
   checkable in this build") whether signed in or not — the provider
   is stubbed before 1.0.0 and must never pretend otherwise.

4. **Permission checklist.** A `niwa.permission` entry deep-links
   into System Settings. niwa never claims the permission is granted;
   ticking it off is the person's act, in the dashboard.
5. **Real notification appearance.** The watcher's notification uses
   the system's own appearance and honors Focus modes. Nothing
   blinks and nothing repeats within a five-second window.
6. **Terminal matrix.** The dashboard and plan render correctly in
   Terminal.app, Ghostty, and over ssh: marks align, color roles map
   onto the terminal's palette, `NO_COLOR` strips color everywhere.
7. **Interactive apply.** `niwa apply` at a terminal steps through
   every pending item: `d` renders the same diff `plan --diff`
   shows, `s` leaves the item as it stands, `a` stops asking, `q`
   cancels with nothing changed. Skipped items are still pending on
   the next plan.
8. **OSC 8 locations.** In Ghostty or iTerm, `niwa explain` renders
   the source location as a clickable link; over ssh with a plain
   TERM it is plain text.
