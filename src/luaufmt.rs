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
    let mut in_long_bracket = false;

    for line in text.lines() {
        let trimmed = line.trim_end();

        // Long-bracket strings and comments keep their bytes exactly
        // — the untrimmed line, or a content declaration would drift.
        if in_long_bracket {
            out.push_str(line);
            out.push('\n');
            if line.contains("]]") {
                in_long_bracket = false;
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
        if opens_long {
            in_long_bracket = true;
        }
    }

    let formatted = out;
    if formatted == text {
        None
    } else {
        Some(formatted)
    }
}

/// Count structural opens and closes on a line, ignoring everything
/// inside strings and after comment markers.
fn weigh(body: &str) -> (usize, usize, bool) {
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
                return (
                    opens,
                    closes,
                    body[index..].contains("[[") && !body[index..].contains("]]"),
                );
            }
            '[' if body[index..].starts_with("[[") => {
                return (opens, closes, !body[index + 2..].contains("]]"));
            }
            '{' | '(' | '[' => opens += 1,
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
    (opens, closes, false)
}

#[cfg(test)]
mod tests {
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
