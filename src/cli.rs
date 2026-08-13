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
    pub verb: Option<Verb>,
    /// More detail: -v adds absolutes and groups converged output,
    /// -vv lists every resource
    #[arg(short, long, global = true, action = clap::ArgAction::Count)]
    pub verbose: u8,
    /// Keep the raw stack trace on config errors, for reports
    #[arg(long, global = true)]
    pub debug: bool,
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
        /// Ask the upstreams: does everything you declare still
        /// exist? The watcher runs this weekly
        #[arg(long)]
        upstream: bool,
    },
    /// Show what apply would do. Exit 0 when in sync, 2 when changes
    /// are pending, 1 on an error
    Plan {
        /// Render full file diffs, word-level highlighted
        #[arg(long)]
        diff: bool,
        /// The machine interface: one versioned JSON document
        #[arg(long)]
        json: bool,
    },
    /// Make the config true: plan, confirm, execute
    Apply {
        /// Apply without asking
        #[arg(long)]
        yes: bool,
        /// With --yes: allow a config tree with uncommitted changes
        #[arg(long)]
        dirty: bool,
        /// Overwrite files that hold edits niwa never wrote: bare
        /// covers the run, or name targets to lift one at a time
        #[arg(long, num_args = 0.., value_name = "TARGET")]
        force: Option<Vec<String>>,
        /// Re-check everything after the run; fail if anything still
        /// reports a change
        #[arg(long)]
        verify: bool,
        /// Skip the steps that need administrator rights
        #[arg(long = "no-privileged")]
        no_privileged: bool,
        /// Run one module by name and leave the rest as they stand
        #[arg(long)]
        only: Option<String>,
        /// Rehearse from nothing: a throwaway home and fake prefixes.
        /// Files land there; packages are counted, never installed
        #[arg(long)]
        sandbox: bool,
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
        /// One of: brew, cask, npm, secret
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
    /// Write a starter config that describes this machine, install
    /// the editor types, and load the watcher. Once per machine
    Init,
    /// Browse the applies before the most recent one
    History,
    /// Render this machine as a readable document
    Export {
        /// The one format that exists
        #[arg(long)]
        markdown: bool,
    },
    /// Set, list, or remove this machine's tags
    Tag {
        /// The tag to set (or remove, with --remove); bare tag lists
        name: Option<String>,
        /// Remove the named tag instead of setting it
        #[arg(long)]
        remove: bool,
    },
    /// Rewrite deprecated config forms in place
    Migrate,
    /// The tool updating itself, always as a decision
    #[command(name = "self")]
    SelfCmd {
        /// One of: update
        action: String,
        /// Swap back to the previous pair
        #[arg(long)]
        rollback: bool,
    },
    /// Remove niwa and leave the machine exactly as it stands
    Uninstall {
        /// Also remove the journal and its undo archives
        #[arg(long)]
        purge: bool,
    },
}
