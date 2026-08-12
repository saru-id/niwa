mod api;
mod cli;
mod error;
mod facts;
mod luau;
mod model;
mod out;
mod paths;
mod util;
mod verbs;

use std::process::ExitCode;

use clap::Parser as _;

fn main() -> ExitCode {
    let cli = cli::Cli::parse();
    let out = out::Out::detect();
    match cli.verb {
        cli::Verb::Check => verbs::check::run(&out),
    }
}
