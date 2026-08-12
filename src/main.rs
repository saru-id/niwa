mod api;
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
    }
}
