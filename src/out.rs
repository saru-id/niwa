//! The one output layer.
//!
//! Every user-visible string flows through this module. That is how the
//! design's "one visual language" is enforced by architecture instead of
//! by review, and how snapshot tests can cover every screen.
//!
//! The rules come from the interface chapter of the design: marks carry
//! meaning by shape, color is semantics on the terminal's own palette,
//! and the same output adapts to where it lands. Piped output drops
//! marks and color and stays line oriented. `NO_COLOR` removes color
//! and keeps layout. `FORCE_COLOR` is an explicit request and wins.

use std::io::IsTerminal as _;

use crate::error::Error;

/// A color role from the design's mark table. Roles map onto the
/// terminal's sixteen color palette; niwa ships no theme of its own.
#[derive(Clone, Copy, PartialEq, Eq)]
pub enum Role {
    Good,
    Bad,
}

impl Role {
    const fn ansi(self) -> &'static str {
        match self {
            Self::Good => "32",
            Self::Bad => "31",
        }
    }
}

/// The mark vocabulary. One set, used by every verb. The enum grows as
/// verbs land; the full table lives in the design's interface chapter.
#[derive(Clone, Copy)]
pub enum Mark {
    Ok,
    Failed,
}

impl Mark {
    const fn glyph(self) -> &'static str {
        match self {
            Self::Ok => "✓",
            Self::Failed => "✗",
        }
    }

    const fn role(self) -> Role {
        match self {
            Self::Ok => Role::Good,
            Self::Failed => Role::Bad,
        }
    }
}

/// Where output lands, decided once at startup.
pub struct Out {
    /// Marks and layout are for humans at a terminal.
    tty: bool,
    /// Color implies `tty`; `NO_COLOR` and `TERM=dumb` strip it back.
    color: bool,
}

impl Out {
    /// Detect the terminal once. `FORCE_COLOR` (set, non-empty, not
    /// `0`) turns everything on even when piped. `NO_COLOR` (set,
    /// non-empty) and `TERM=dumb` remove color but keep the marks a
    /// terminal user still sees.
    pub fn detect() -> Self {
        let tty = std::io::stdout().is_terminal();
        let force = std::env::var_os("FORCE_COLOR").is_some_and(|v| !v.is_empty() && v != "0");
        let no_color = std::env::var_os("NO_COLOR").is_some_and(|v| !v.is_empty());
        let dumb = std::env::var_os("TERM").is_some_and(|v| v == "dumb");
        Self {
            tty: tty || force,
            color: force || (tty && !no_color && !dumb),
        }
    }

    fn paint(&self, role: Role, text: &str) -> String {
        if self.color {
            format!("\x1b[{}m{text}\x1b[0m", role.ansi())
        } else {
            text.to_string()
        }
    }

    /// One result line on stdout: marked for a terminal, bare when piped.
    pub fn result(&self, mark: Mark, text: &str) {
        if self.tty {
            let glyph = self.paint(mark.role(), mark.glyph());
            println!("{glyph} {text}");
        } else {
            println!("{text}");
        }
    }

    /// Render an error to stderr. Every error answers what was being
    /// done, what happened, and what to do next; verbs that change the
    /// machine add where that leaves it. `check` changes nothing, so
    /// its errors stop at three.
    pub fn error(&self, error: &Error) {
        let mark = if self.tty {
            let glyph = self.paint(Mark::Failed.role(), Mark::Failed.glyph());
            format!("{glyph} ")
        } else {
            String::new()
        };
        eprintln!("{mark}{error}");
        for line in error.detail() {
            eprintln!("  {line}");
        }
    }
}

/// `1 resource`, `3 resources`. Counting reads wrong in every language
/// when it is left to format strings.
pub fn count(n: usize, singular: &str) -> String {
    if n == 1 {
        format!("1 {singular}")
    } else {
        format!("{n} {singular}s")
    }
}
