//! The command surface, declared in one place. The design's contract
//! is twenty verbs; they land here as they become real.

use clap::{Parser, Subcommand};

/// niwa is a configuration tool for macOS. One Luau script declares
/// what a machine should be. niwa makes it true, shows its work, and
/// can undo it.
#[derive(Parser)]
#[command(name = "niwa", version, about)]
pub struct Cli {
    #[command(subcommand)]
    pub verb: Verb,
}

#[derive(Subcommand)]
pub enum Verb {
    /// Validate the config: it loads, every spec is well formed, and
    /// declarations do not conflict
    Check,
}
