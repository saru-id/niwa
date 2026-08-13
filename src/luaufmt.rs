//! A conservative formatter for config files.
//!
//! niwa writes to your config, so machine-written lines must be
//! indistinguishable from yours. This formatter normalizes the things
//! machines and humans disagree about — indentation, trailing spaces,
//! blank-line runs — and refuses to reflow expressions, because a
//! formatter that rewrites your code is a formatter you stop trusting.
//! Two spaces per level, the example config's style.

/// Format one file's text. Returns `None` when nothing changed.
pub fn format(text: &str) -> Option<String> {
    let mut out = String::with_capacity(text.len());
    let mut depth: usize = 0;
    let mut blank_run = 0usize;
    let mut in_long_bracket: Option<usize> = None;

    for line in text.lines() {
        let trimmed = line.trim_end();

        // Long-bracket strings and comments keep their bytes exactly
        // — the untrimmed line, or a content declaration would drift.
        // Only the closer at the opener's own level ends the run.
        if let Some(level) = in_long_bracket {
            out.push_str(line);
            out.push('\n');
            if line.contains(&closer(level)) {
                in_long_bracket = None;
            }
            continue;
        }

        let body = trimmed.trim_start();
        if body.is_empty() {
            blank_run += 1;
            if blank_run == 1 {
                out.push('\n');
            }
            continue;
        }
        blank_run = 0;

        let (opens, closes, opens_long) = weigh(body);
        // One level per line: however many brackets a line opens, its
        // children indent a single step — the canonical shapes the
        // proposals write (and the example config uses) stay put.
        let opens = opens.min(1);
        let closes = closes.min(1);
        // A line that starts by closing sits one level shallower.
        let leading_close = body.starts_with(['}', ')', ']']);
        let level = if leading_close {
            depth.saturating_sub(1)
        } else {
            depth
        };
        for _ in 0..level {
            out.push_str("  ");
        }
        out.push_str(body);
        out.push('\n');
        depth = depth.saturating_sub(closes);
        depth += opens;
        if let Some(level) = opens_long {
            in_long_bracket = Some(level);
        }
    }

    let formatted = out;
    if formatted == text {
        None
    } else {
        Some(formatted)
    }
}

/// The closing token for a long bracket of one level: `]]`, `]=]`, …
fn closer(level: usize) -> String {
    format!("]{}]", "=".repeat(level))
}

/// A long-bracket opener at this position? Answers its `=` level.
fn long_open(text: &str) -> Option<usize> {
    let rest = text.strip_prefix('[')?;
    let level = rest.chars().take_while(|c| *c == '=').count();
    rest[level..].starts_with('[').then_some(level)
}

/// Count structural opens and closes on a line, ignoring everything
/// inside strings and after comment markers. The third answer is a
/// long bracket left open, with its level.
fn weigh(body: &str) -> (usize, usize, Option<usize>) {
    let mut opens = 0usize;
    let mut closes = 0usize;
    let mut characters = body.char_indices();
    let mut in_string: Option<char> = None;
    while let Some((index, character)) = characters.next() {
        if let Some(delimiter) = in_string {
            if character == '\\' {
                characters.next();
            } else if character == delimiter {
                in_string = None;
            }
            continue;
        }
        match character {
            '"' | '\'' | '`' => in_string = Some(character),
            '-' if body[index..].starts_with("--") => {
                let after = &body[index + 2..];
                let open = long_open(after).filter(|level| !after.contains(&closer(*level)));
                return (opens, closes, open);
            }
            '[' => {
                if let Some(level) = long_open(&body[index..]) {
                    let after = &body[index + 2 + level..];
                    if after.contains(&closer(level)) {
                        // Opened and closed on one line: the bytes
                        // between stay theirs, structure resumes
                        // after — close enough to skip the rest.
                        return (opens, closes, None);
                    }
                    return (opens, closes, Some(level));
                }
                opens += 1;
            }
            '{' | '(' => opens += 1,
            '}' | ')' | ']' => {
                if opens > 0 {
                    opens -= 1;
                } else {
                    closes += 1;
                }
            }
            _ => {}
        }
    }
    (opens, closes, None)
}

#[cfg(test)]
mod tests {
    #[test]
    fn leveled_long_brackets_keep_their_bytes_exactly() {
        let source = "local x = [=[\nhello  \n\n\n\ttabbed\n]=]\n";
        assert_eq!(super::format(source), None);
    }

    #[test]
    fn the_proposal_shape_is_a_fixed_point() {
        let statement = "niwa.defaults(\"com.apple.dock\", {\n  tilesize = 48,\n})\n";
        assert_eq!(super::format(statement), None);
    }

    use super::*;

    #[test]
    fn misindented_blocks_come_back_to_two_spaces() {
        let messy = "niwa.dock {\n      autohide = true,\ntilesize = 48,\n}\n";
        let clean = format(messy).unwrap();
        assert_eq!(
            clean,
            "niwa.dock {\n  autohide = true,\n  tilesize = 48,\n}\n"
        );
    }

    #[test]
    fn already_clean_text_is_left_alone() {
        let clean = "local niwa = require(\"@niwa\")\n\nniwa.dock {\n  autohide = true,\n}\n";
        assert_eq!(format(clean), None);
    }

    #[test]
    fn blank_line_runs_collapse_to_one() {
        let messy = "local a = 1\n\n\n\nlocal b = 2\n";
        assert_eq!(format(messy).unwrap(), "local a = 1\n\nlocal b = 2\n");
    }

    #[test]
    fn braces_inside_strings_do_not_move_the_depth() {
        let text = "local t = \"{ not a table }\"\nlocal u = 1\n";
        assert_eq!(format(text), None);
    }

    #[test]
    fn trailing_whitespace_goes() {
        let messy = "local a = 1   \n";
        assert_eq!(format(messy).unwrap(), "local a = 1\n");
    }

    #[test]
    fn nested_tables_indent_by_level() {
        let messy = "niwa.service {\nlabel = \"x.y\",\nprogram = {\n\"a\",\n},\n}\n";
        let clean = format(messy).unwrap();
        assert_eq!(
            clean,
            "niwa.service {\n  label = \"x.y\",\n  program = {\n    \"a\",\n  },\n}\n"
        );
    }
}
