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
2. **Privileged apply.** A config with one `/Library` declaration
   asks for administrator rights once, at the top, with the steps
   listed. Cancelling the prompt leaves the machine unchanged and
   the summary says which steps were skipped.
3. **App Store install.** A `mas.app` declaration with the App Store
   signed out produces a checklist entry with a deep link, and never
   hangs. Signed in, the install lands and the receipt is detected.
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
