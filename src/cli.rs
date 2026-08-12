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
    Check {
        /// The watcher's voice: post a notification when something
        /// needs a decision. Never applies anything
        #[arg(long)]
        notify: bool,
    },
    /// Show what apply would do. Exit 0 when in sync, 2 when changes
    /// are pending, 1 on an error
    Plan,
    /// Make the config true: plan, confirm, execute
    Apply {
        /// Apply without asking
        #[arg(long)]
        yes: bool,
        /// With --yes: allow a config tree with uncommitted changes
        #[arg(long)]
        dirty: bool,
        /// Overwrite files that hold edits niwa never wrote
        #[arg(long)]
        force: bool,
        /// Re-check everything after the run; fail if anything still
        /// reports a change
        #[arg(long)]
        verify: bool,
        /// Skip the steps that need administrator rights
        #[arg(long = "no-privileged")]
        no_privileged: bool,
    },
    /// Reverse the most recent apply
    Undo {
        /// Undo without asking
        #[arg(long)]
        yes: bool,
    },
    /// Bring machine-side changes home to the config: the inverse of
    /// apply
    Pull {
        /// Stage every finding without the one-at-a-time walk
        #[arg(long)]
        all: bool,
    },
    /// Install something and write its config line, in one motion
    Add {
        /// One of: brew, cask, npm
        provider: String,
        /// The package name
        name: String,
    },
    /// Normalize the config files' formatting
    Fmt,
    /// Back up or restore the sealing key through the repo's
    /// passphrase-protected escrow
    #[command(name = "seal-key")]
    SealKey {
        /// One of: backup, restore
        action: String,
    },
    /// The model, printed for one resource: declared, actual,
    /// acknowledged, and its history
    Explain {
        /// An identity or a unique fragment of one, for example
        /// dock.autohide or brew.formula:jq
        target: String,
    },
    /// Every machine's stamp: who applied what, and who is behind
    Machines,
    /// Is niwa itself healthy? The journal, the archives, the
    /// secrets, the lockfile, the watcher
    Doctor {
        /// Run the expensive checks too: sealed archives decrypt
        #[arg(long)]
        deep: bool,
    },
    /// Re-resolve the lockfile and show the diff before writing it
    Update {
        /// Only pins whose name contains this
        name: Option<String>,
    },
}
