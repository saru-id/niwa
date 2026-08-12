mod api;
mod apply;
mod cli;
mod error;
mod facts;
mod journal;
mod luau;
mod model;
mod out;
mod paths;
mod plan;
mod util;
mod verbs;

use std::process::ExitCode;

use clap::Parser as _;

fn main() -> ExitCode {
    let cli = cli::Cli::parse();
    let out = out::Out::detect();
    match cli.verb {
        cli::Verb::Check => verbs::check::run(&out),
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
    }
}
