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

use std::process::{Command, Stdio};
use std::time::{Duration, Instant};

/// Run a program and return its trimmed stdout, or `None` for a
/// failure, a timeout, or a program that is not there. From the
/// caller's side those are one answer: no information.
pub fn bounded_stdout(program: &str, args: &[&str], timeout: Duration) -> Option<String> {
    let mut child = Command::new(program)
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
