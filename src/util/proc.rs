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

/// Is this name an executable on `PATH`? The same walk `resolve`
/// uses to spawn — one resolver, so a query and a spawn can never
/// disagree about what exists.
pub fn which(program: &str) -> bool {
    resolve(program).is_some_and(|path| path.is_file())
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
    pub stdout: String,
    /// The whole of stderr; screens show `stderr_tail`, the run log
    /// keeps this.
    pub stderr: String,
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
                let stderr = String::from_utf8_lossy(&output.stderr).into_owned();
                let skip = stderr.lines().count().saturating_sub(6);
                let tail: Vec<&str> = stderr.lines().skip(skip).collect();
                let stderr_tail = tail.join("\n");
                return Some(Finished {
                    code: output.status.code(),
                    stdout: String::from_utf8_lossy(&output.stdout).into_owned(),
                    stderr,
                    stderr_tail,
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

/// Run a program that owns the terminal — the one shape an $EDITOR
/// session can take. The deadline exists because every child gets
/// one; a day covers any editing session that is still a session.
pub fn interactive(program: &str, args: &[&str]) -> Option<i32> {
    let mut child = Command::new(resolve(program)?).args(args).spawn().ok()?;
    let deadline = Instant::now() + Duration::from_hours(24);
    loop {
        match child.try_wait() {
            Ok(Some(status)) => return status.code(),
            Ok(None) if Instant::now() >= deadline => {
                let _ = child.kill();
                let _ = child.wait();
                return None;
            }
            Ok(None) => std::thread::sleep(Duration::from_millis(50)),
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

/// What one tool invocation came to, kept for the failure screen:
/// the command as a person could re-run it, and what the tool said.
pub struct Invocation {
    pub command: String,
    pub code: Option<i32>,
    pub stderr_tail: String,
}

/// Run a tool and report the invocation whole. A tool that is not
/// installed, or that runs past the deadline, reports that in its
/// own words instead of vanishing.
pub fn invoke(program: &str, args: &[&str], deadline: Duration) -> Invocation {
    let mut command = String::from(program);
    for arg in args {
        command.push(' ');
        command.push_str(arg);
    }
    match bounded_output(program, args, deadline) {
        Some(finished) => Invocation {
            command,
            code: finished.code,
            stderr_tail: finished.stderr_tail,
        },
        None => Invocation {
            command,
            code: None,
            stderr_tail: format!(
                "{program} did not finish inside the deadline, or is not installed"
            ),
        },
    }
}

/// Run a tool that must simply succeed; failures come back in the
/// tool's own words.
pub fn run_ok(program: &str, args: &[&str], deadline: Duration) -> Result<(), String> {
    match bounded_output(program, args, deadline) {
        Some(finished) if finished.code == Some(0) => Ok(()),
        Some(finished) => Err(finished.stderr_tail),
        None => Err(format!(
            "{program} did not finish inside the deadline, or is not installed"
        )),
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
