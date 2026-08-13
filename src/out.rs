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
    Warn,
    Bad,
    Muted,
    Accent,
}

impl Role {
    const fn ansi(self) -> &'static str {
        match self {
            Self::Good => "32",
            Self::Warn => "33",
            Self::Bad => "31",
            Self::Muted => "2",
            Self::Accent => "36",
        }
    }
}

/// The mark vocabulary. One set, used by every verb. The enum grows as
/// verbs land; the full table lives in the design's interface chapter.
#[derive(Clone, Copy)]
pub enum Mark {
    Ok,
    Added,
    Changed,
    Failed,
    Restarted,
    Busy,
    /// An offer to take something away.
    Removed,
    /// Waiting on a human's hands, never blocking.
    Waiting,
}

impl Mark {
    const fn glyph(self) -> &'static str {
        match self {
            Self::Ok => "✓",
            Self::Added => "+",
            Self::Changed => "~",
            Self::Failed => "✗",
            Self::Restarted => "↻",
            Self::Busy => "▸",
            Self::Removed => "-",
            Self::Waiting => "→",
        }
    }

    const fn role(self) -> Role {
        match self {
            Self::Ok | Self::Added => Role::Good,
            Self::Changed | Self::Removed => Role::Warn,
            Self::Failed => Role::Bad,
            Self::Restarted => Role::Muted,
            Self::Busy | Self::Waiting => Role::Accent,
        }
    }
}

/// Where output lands, decided once at startup. Cloning shares the
/// decision: the engine's progress line and the verbs' screens must
/// agree on one terminal.
#[derive(Clone)]
#[allow(
    clippy::struct_excessive_bools,
    reason = "each is an independent terminal capability, detected once"
)]
pub struct Out {
    /// Marks and layout are for humans at a terminal.
    tty: bool,
    /// Color implies `tty`; `NO_COLOR` and `TERM=dumb` strip it back.
    color: bool,
    /// `-v` count: humanized times gain their absolutes at one,
    /// screens list everything at two.
    verbose: u8,
    /// The terminal's column count; `None` when piped, so nothing
    /// truncates in output a program will read.
    width: Option<usize>,
    /// OSC 8 hyperlinks, on terminals known to render them.
    links: bool,
    /// `--debug`: raw stack traces stay, for reports.
    debug: bool,
}

impl Out {
    /// Detect the terminal once. `FORCE_COLOR` (set, non-empty, not
    /// `0`) turns everything on even when piped. `NO_COLOR` (set,
    /// non-empty) and `TERM=dumb` remove color but keep the marks a
    /// terminal user still sees.
    pub fn detect(verbose: u8, debug: bool) -> Self {
        let tty = std::io::stdout().is_terminal();
        let force = std::env::var_os("FORCE_COLOR").is_some_and(|v| !v.is_empty() && v != "0");
        let no_color = std::env::var_os("NO_COLOR").is_some_and(|v| !v.is_empty());
        let dumb = std::env::var_os("TERM").is_some_and(|v| v == "dumb");
        let width = if tty {
            Some(
                crate::util::proc::bounded_stdout(
                    "tput",
                    &["cols"],
                    std::time::Duration::from_secs(2),
                )
                .and_then(|cols| cols.trim().parse().ok())
                .unwrap_or(80),
            )
        } else {
            None
        };
        // The terminals that render OSC 8; everywhere else the text
        // stays plain, which is the design's own fallback.
        let links = tty
            && !dumb
            && std::env::var_os("TERM_PROGRAM").is_some_and(|program| {
                ["iTerm.app", "WezTerm", "ghostty", "kitty", "vscode"]
                    .iter()
                    .any(|known| program == std::ffi::OsStr::new(known))
            });
        Self {
            tty: tty || force,
            color: force || (tty && !no_color && !dumb),
            verbose,
            width,
            links,
            debug,
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

    /// A group header: the module's name and a rule, so the eye can
    /// scan a run by its structure.
    pub fn group(&self, name: &str) {
        if self.tty {
            let rule_width = 36usize.saturating_sub(name.chars().count() + 2);
            println!(" {name} {}", "─".repeat(rule_width));
        } else {
            println!("[{name}]");
        }
    }

    /// Aligned item rows: mark, a left column padded to the widest
    /// entry, and a detail column. On a terminal the identifier is
    /// bold and the detail dim; a row past the terminal's width
    /// truncates its identifier from the front, because the tail of
    /// a path is the signal.
    pub fn list(&self, rows: &[(Mark, String, String)]) {
        // The mark and its space eat two columns.
        let room = self.width.map(|width| width.saturating_sub(2));
        let column = rows
            .iter()
            .map(|(_, left, _)| display_width(left))
            .max()
            .unwrap_or(0);
        for (mark, left, right) in rows {
            let left = match room {
                Some(room) if right.is_empty() => truncate_keep_tail(left, room),
                Some(room) => {
                    truncate_keep_tail(left, room.saturating_sub(display_width(right) + 3))
                }
                None => left.clone(),
            };
            let text = if right.is_empty() {
                self.emphasize(&left)
            } else {
                let pad = column.saturating_sub(display_width(&left));
                format!(
                    "{}{}   {}",
                    self.emphasize(&left),
                    " ".repeat(pad),
                    self.paint(Role::Muted, right)
                )
            };
            self.result(*mark, text.trim_end());
        }
    }

    /// Identifiers wear bold on a color terminal, per the design's
    /// typography rules.
    fn emphasize(&self, text: &str) -> String {
        if self.color {
            format!("\x1b[1m{text}\x1b[22m")
        } else {
            text.to_string()
        }
    }

    /// `file:line` as an OSC 8 hyperlink where the terminal renders
    /// them, plain text everywhere else.
    pub fn locate(&self, config: &std::path::Path, provenance: &str) -> String {
        if !self.links {
            return provenance.to_string();
        }
        let file = provenance.split(':').next().unwrap_or(provenance);
        let target = config.join(file);
        format!(
            "\x1b]8;;file://{}\x1b\\{provenance}\x1b]8;;\x1b\\",
            target.display()
        )
    }

    /// A bare line: screens whose shape is its own vocabulary (the
    /// machines list, explain) print through here.
    pub fn plain(&self, text: &str) {
        if self.tty {
            println!(" {text}");
        } else {
            println!("{text}");
        }
    }

    /// Verbatim output: a generated document leaves exactly as
    /// written, on any terminal.
    #[expect(clippy::unused_self, reason = "every screen prints through Out")]
    pub fn raw(&self, text: &str) {
        print!("{text}");
    }

    /// One question, one answer. The question lands on stderr so a
    /// piped stdout stays the screen alone; the answer comes back
    /// trimmed and lowercased, so `y` and `Y` mean the same thing.
    /// `None` is a closed or unreadable stdin — never an answer, so
    /// every caller reads it as a decline.
    #[expect(clippy::unused_self, reason = "every screen prints through Out")]
    pub fn prompt(&self, question: &str) -> Option<String> {
        eprint!("{question} ");
        let mut answer = String::new();
        match std::io::stdin().read_line(&mut answer) {
            Ok(0) | Err(_) => None,
            Ok(_) => Some(answer.trim().to_lowercase()),
        }
    }

    /// A yes/no question; only an explicit yes is a yes.
    pub fn confirm(&self, question: &str) -> bool {
        self.prompt(question)
            .is_some_and(|answer| matches!(answer.as_str(), "y" | "yes"))
    }

    /// How much detail the person asked for: 0, `-v`, or `-vv`.
    pub const fn verbosity(&self) -> u8 {
        self.verbose
    }

    /// A moment: humanized always, the absolute beside it at `-v`.
    pub fn when(&self, timestamp: &str) -> String {
        let humanized = ago(timestamp);
        if self.verbose == 0 {
            return humanized;
        }
        let absolute = timestamp.parse::<jiff::Timestamp>().map_or_else(
            |_| timestamp.to_string(),
            |moment| {
                moment
                    .to_zoned(jiff::tz::TimeZone::system())
                    .strftime("%Y-%m-%d %H:%M")
                    .to_string()
            },
        );
        format!("{humanized} ({absolute})")
    }

    /// A file diff, line by line with the changed words emphasized,
    /// so a one-character change reads as one character. Meaning
    /// travels by the signs; color and bold only sharpen it.
    pub fn diff(&self, old: &str, new: &str) {
        let text_diff = similar::TextDiff::from_lines(old, new);
        for (index, group) in text_diff.grouped_ops(3).iter().enumerate() {
            if index > 0 {
                self.note("···");
            }
            for op in group {
                for change in text_diff.iter_inline_changes(op) {
                    let (sign, role) = match change.tag() {
                        similar::ChangeTag::Delete => ("-", Role::Bad),
                        similar::ChangeTag::Insert => ("+", Role::Good),
                        similar::ChangeTag::Equal => (" ", Role::Muted),
                    };
                    let mut line = String::new();
                    for (emphasized, piece) in change.iter_strings_lossy() {
                        if emphasized && self.color {
                            use std::fmt::Write as _;
                            let _ = write!(line, "\x1b[1m{piece}\x1b[22m");
                        } else {
                            line.push_str(&piece);
                        }
                    }
                    let text = format!("{sign} {}", line.trim_end_matches('\n'));
                    if self.color {
                        println!(" {}", self.paint(role, &text));
                    } else {
                        self.plain(&text);
                    }
                }
            }
        }
    }

    /// The single redrawn progress line a terminal gets; scrollback
    /// is the user's, and filling it with frames is vandalism. Piped
    /// callers print plain lines through `plain` instead.
    pub fn progress_line(&self, text: &str) {
        if self.tty {
            print!("\r {text}\x1b[K");
            let _ = std::io::Write::flush(&mut std::io::stdout());
        }
    }

    /// Take the progress line back off the screen.
    pub fn progress_clear(&self) {
        if self.tty {
            print!("\r\x1b[K");
            let _ = std::io::Write::flush(&mut std::io::stdout());
        }
    }

    /// Whether a person is watching; progress pacing differs.
    pub const fn is_tty(&self) -> bool {
        self.tty
    }

    /// A quiet, indented note.
    pub fn note(&self, text: &str) {
        if self.tty {
            println!("  {}", self.paint(Role::Muted, text));
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
            // Raw stack traces never reach a person; `--debug` keeps
            // one for reports.
            if !self.debug && line.trim_start().starts_with("stack traceback") {
                break;
            }
            eprintln!("  {line}");
        }
        self.frame(error);
    }

    /// The compiler-quality frame a config error earns: the offending
    /// line quoted, underlined, under its `file:line`. Best effort —
    /// a file that cannot be read gets no frame, never a wrong one.
    fn frame(&self, error: &Error) {
        let Error::Script { message } = error else {
            return;
        };
        let Some((file, line_number)) = locate_frame(message) else {
            return;
        };
        let Ok(paths) = crate::paths::Paths::resolve() else {
            return;
        };
        let Ok(text) = std::fs::read_to_string(paths.config.join(&file)) else {
            return;
        };
        let Some(line) = text.lines().nth(line_number.saturating_sub(1)) else {
            return;
        };
        let indent = line.len() - line.trim_start().len();
        eprintln!("  --> {file}:{line_number}");
        eprintln!("   |  {line}");
        eprintln!(
            "   |  {}{}",
            " ".repeat(indent),
            self.paint(Role::Bad, &"^".repeat(line.trim().len().max(1)))
        );
    }
}

/// The first `file.luau:line` a script error names, for the frame.
fn locate_frame(message: &str) -> Option<(String, usize)> {
    for token in message.split_whitespace() {
        let token = token.trim_end_matches(':');
        if let Some(position) = token.find(".luau:") {
            let file = &token[..position + 5];
            let rest = &token[position + 6..];
            let digits: String = rest.chars().take_while(char::is_ascii_digit).collect();
            if let Ok(line) = digits.parse() {
                return Some((file.to_string(), line));
            }
        }
    }
    None
}

/// A string's width in terminal columns, not bytes or chars.
fn display_width(text: &str) -> usize {
    unicode_width::UnicodeWidthStr::width(text)
}

/// Truncate from the front, keeping the tail: `…/bin/notes-sync`.
/// The design's rule — the tail of a path is the signal.
fn truncate_keep_tail(text: &str, max: usize) -> String {
    if display_width(text) <= max || max < 2 {
        return text.to_string();
    }
    let mut tail = String::new();
    let mut width = 1;
    for character in text.chars().rev() {
        let next = unicode_width::UnicodeWidthChar::width(character).unwrap_or(0);
        if width + next > max {
            break;
        }
        width += next;
        tail.insert(0, character);
    }
    format!("…{tail}")
}

/// Humanize a time in the voice rules' shape: "2h ago", "3w ago".
/// Absolutes appear at -v, later.
pub fn ago(timestamp: &str) -> String {
    let Ok(then) = timestamp.parse::<jiff::Timestamp>() else {
        return timestamp.to_string();
    };
    let seconds = (jiff::Timestamp::now() - then).get_seconds().max(0);
    match seconds {
        0..=59 => "just now".to_string(),
        60..=3_599 => format!("{}m ago", seconds / 60),
        3_600..=86_399 => format!("{}h ago", seconds / 3600),
        86_400..=604_799 => format!("{}d ago", seconds / 86_400),
        _ => format!("{}w ago", seconds / 604_800),
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

#[cfg(test)]
mod tests {
    #![allow(clippy::unwrap_used, reason = "tests panic loudly by design")]

    use super::*;

    fn plain_out() -> Out {
        Out {
            tty: false,
            color: false,
            verbose: 0,
            width: None,
            links: false,
            debug: false,
        }
    }

    #[test]
    fn truncation_keeps_the_tail_of_a_path() {
        let cut = truncate_keep_tail("~/.local/bin/notes-sync", 12);
        assert!(cut.starts_with('…'), "{cut}");
        assert!(cut.ends_with("notes-sync"), "{cut}");
        assert!(display_width(&cut) <= 12, "{cut}");
        assert_eq!(truncate_keep_tail("short", 12), "short");
    }

    #[test]
    fn wide_characters_count_by_columns_not_chars() {
        // Two-column characters: four of them fill eight columns.
        let wide = "日本語表";
        assert_eq!(display_width(wide), 8);
        let cut = truncate_keep_tail(wide, 5);
        assert!(display_width(&cut) <= 5);
        assert!(cut.starts_with('…'));
    }

    #[test]
    fn locations_stay_plain_without_link_support() {
        let out = plain_out();
        let text = out.locate(std::path::Path::new("/cfg"), "modules/dev.luau:22");
        assert_eq!(text, "modules/dev.luau:22");
    }

    #[test]
    fn locations_wrap_in_osc8_when_the_terminal_renders_them() {
        let out = Out {
            links: true,
            ..plain_out()
        };
        let text = out.locate(std::path::Path::new("/cfg"), "modules/dev.luau:22");
        assert!(text.contains("\x1b]8;;file:///cfg/modules/dev.luau"));
        assert!(text.contains("modules/dev.luau:22"));
    }
}
