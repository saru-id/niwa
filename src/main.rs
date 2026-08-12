mod api;
mod apply;
mod brew;
mod cli;
mod drift;
mod engine;
mod error;
mod facts;
mod gate;
mod journal;
mod luau;
mod luaufmt;
mod mise;
mod model;
mod npm;
mod out;
mod paths;
mod plan;
mod proposals;
mod secrets;
mod services;
mod util;
mod verbs;

use std::process::ExitCode;

use clap::Parser as _;

fn main() -> ExitCode {
    let cli = cli::Cli::parse();
    let out = out::Out::detect();
    match cli.verb {
        cli::Verb::Check { notify } => verbs::check::run(&out, notify),
        cli::Verb::Plan => verbs::plan::run(&out),
        cli::Verb::Apply {
            yes,
            dirty,
            force,
            verify,
        } => verbs::apply_verb::run(
            &out,
            &verbs::apply_verb::Options {
                yes,
                dirty,
                force,
                verify,
            },
        ),
        cli::Verb::Undo { yes } => verbs::undo::run(&out, yes),
        cli::Verb::Pull { all } => verbs::pull::run(&out, all),
        cli::Verb::Add { provider, name } => verbs::add::run(&out, &provider, &name),
        cli::Verb::Fmt => verbs::fmt::run(&out),
        cli::Verb::SealKey { action } => verbs::seal_key::run(&out, &action),
    }
}
