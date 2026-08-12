mod api;
mod apply;
mod brew;
mod cli;
mod drift;
mod engine;
mod error;
mod exec;
mod facts;
mod gate;
mod journal;
mod lockfile;
mod luau;
mod luaufmt;
mod mise;
mod model;
mod modules;
mod npm;
mod out;
mod paths;
mod plan;
mod proposals;
mod release;
mod secrets;
mod services;
mod stamp;
mod util;
mod verbs;
mod watch;

use std::process::ExitCode;

use clap::Parser as _;

fn main() -> ExitCode {
    let cli = cli::Cli::parse();
    let out = out::Out::detect(cli.verbose);
    let Some(verb) = cli.verb else {
        return verbs::dashboard::run(&out);
    };
    match verb {
        cli::Verb::Check { notify } => verbs::check::run(&out, notify),
        cli::Verb::Plan { diff, json } => verbs::plan::run(&out, diff, json),
        cli::Verb::Apply {
            yes,
            dirty,
            force,
            verify,
            no_privileged,
            only,
        } => verbs::apply_verb::run(
            &out,
            &verbs::apply_verb::Options {
                yes,
                dirty,
                force,
                verify,
                no_privileged,
                only,
            },
        ),
        cli::Verb::Undo { yes } => verbs::undo::run(&out, yes),
        cli::Verb::Pull { all } => verbs::pull::run(&out, all),
        cli::Verb::Add { provider, name } => verbs::add::run(&out, &provider, &name),
        cli::Verb::Fmt => verbs::fmt::run(&out),
        cli::Verb::SealKey { action } => verbs::seal_key::run(&out, &action),
        cli::Verb::Explain { target } => verbs::explain::run(&out, &target),
        cli::Verb::Machines => verbs::machines::run(&out),
        cli::Verb::Doctor { deep } => verbs::doctor::run(&out, deep),
        cli::Verb::Update { name } => verbs::update::run(&out, name.as_deref()),
        cli::Verb::Init => verbs::init::run(&out),
        cli::Verb::History => verbs::history::run(&out),
        cli::Verb::Export { markdown } => verbs::export::run(&out, markdown),
        cli::Verb::Tag { name, remove } => verbs::tag::run(&out, name.as_deref(), remove),
        cli::Verb::Migrate => verbs::migrate::run(&out),
        cli::Verb::SelfCmd { action, rollback } => verbs::self_update::run(&out, &action, rollback),
        cli::Verb::Uninstall { purge } => verbs::uninstall::run(&out, purge),
    }
}
