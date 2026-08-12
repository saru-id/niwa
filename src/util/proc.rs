//! Child processes, always on a deadline.
//!
//! niwa asks other programs small questions. Any of them can wedge,
//! and a tool that waits forever on a child has stopped working. So
//! there is one way to run a child here, and it has a wall clock: a
//! wedged child costs one answer, never the run.
//!
//! Output is drained after the child exits, so a child that writes
//! more than a pipe buffer holds blocks until the deadline kills it.
//! That suits programs that answer in kilobytes; anything that streams
//! belongs elsewhere.
//!
//! Programs resolve through the `PATH` variable here, explicitly,
//! never through the exec fallback path. That one rule is load
//! bearing for the sandbox: a test or drill that clears `PATH` has
//! taken away every tool, and nothing this module spawns can reach
//! the real machine behind its back.

use std::path::PathBuf;
use std::process::{Command, Stdio};
use std::time::{Duration, Instant};

/// Find a program the way a shell would, and only that way. A name
/// with a slash is used as given; a bare name must be an executable
/// file in one of `PATH`'s entries, or there is nothing to run.
fn resolve(program: &str) -> Option<PathBuf> {
    resolve_in(program, std::env::var_os("PATH").as_deref())
}

fn resolve_in(program: &str, path: Option<&std::ffi::OsStr>) -> Option<PathBuf> {
    if program.contains('/') {
        return Some(PathBuf::from(program));
    }
    std::env::split_paths(path?)
        .map(|dir| dir.join(program))
        .find(|candidate| {
            use std::os::unix::fs::PermissionsExt as _;
            std::fs::metadata(candidate)
                .is_ok_and(|meta| meta.is_file() && meta.permissions().mode() & 0o111 != 0)
        })
}

/// A finished run: the exit code and what the child said. `code` is
/// `None` when the deadline killed it.
pub struct Finished {
    pub code: Option<i32>,
    pub stderr_tail: String,
}

/// Run a program to completion under the deadline and report what
/// happened, or `None` when it could not start or ran past the clock.
pub fn bounded_output(program: &str, args: &[&str], timeout: Duration) -> Option<Finished> {
    let mut child = Command::new(resolve(program)?)
        .args(args)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .ok()?;
    let deadline = Instant::now() + timeout;
    loop {
        match child.try_wait() {
            Ok(Some(_)) => {
                let output = child.wait_with_output().ok()?;
                let stderr = String::from_utf8_lossy(&output.stderr);
                let skip = stderr.lines().count().saturating_sub(6);
                let tail: Vec<&str> = stderr.lines().skip(skip).collect();
                return Some(Finished {
                    code: output.status.code(),
                    stderr_tail: tail.join("\n"),
                });
            }
            Ok(None) if Instant::now() >= deadline => {
                let _ = child.kill();
                let _ = child.wait();
                return None;
            }
            Ok(None) => std::thread::sleep(Duration::from_millis(10)),
            Err(_) => return None,
        }
    }
}

/// Run a program and return its trimmed stdout, or `None` for a
/// failure, a timeout, or a program that is not there. From the
/// caller's side those are one answer: no information.
pub fn bounded_stdout(program: &str, args: &[&str], timeout: Duration) -> Option<String> {
    let mut child = Command::new(resolve(program)?)
        .args(args)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .spawn()
        .ok()?;
    let deadline = Instant::now() + timeout;
    loop {
        match child.try_wait() {
            Ok(Some(status)) => {
                let output = child.wait_with_output().ok()?;
                if !status.success() {
                    return None;
                }
                let stdout = String::from_utf8(output.stdout).ok()?;
                return Some(stdout.trim().to_string());
            }
            Ok(None) if Instant::now() >= deadline => {
                let _ = child.kill();
                let _ = child.wait();
                return None;
            }
            Ok(None) => std::thread::sleep(Duration::from_millis(10)),
            Err(_) => return None,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_child_that_never_finishes_costs_its_deadline_and_no_more() {
        let started = Instant::now();
        let answer = bounded_stdout("/bin/sleep", &["120"], Duration::from_millis(300));
        assert_eq!(answer, None);
        assert!(started.elapsed() < Duration::from_secs(5));
    }

    #[test]
    fn without_a_path_nothing_resolves_by_bare_name() {
        // The exec fallback path must never be consulted: with PATH
        // gone, even /bin's tools are unreachable by bare name.
        assert_eq!(resolve_in("echo", None), None);
        assert_eq!(resolve_in("echo", Some(std::ffi::OsStr::new(""))), None);
        // A slashed path stays reachable: the caller named a file.
        assert_eq!(
            resolve_in("/bin/echo", None),
            Some(PathBuf::from("/bin/echo"))
        );
    }

    #[test]
    fn a_program_that_is_not_there_is_just_no_answer() {
        assert_eq!(
            bounded_stdout("niwa-no-such-binary", &[], Duration::from_secs(5)),
            None
        );
    }

    #[test]
    fn success_returns_trimmed_stdout_and_failure_returns_nothing() {
        assert_eq!(
            bounded_stdout("/bin/echo", &["hello"], Duration::from_secs(5)),
            Some("hello".to_string())
        );
        assert_eq!(
            bounded_stdout("/usr/bin/false", &[], Duration::from_secs(5)),
            None
        );
    }
}
