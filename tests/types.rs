//! The shipped type definitions must at least be a valid Luau module.
//! Full analysis runs where luau-analyze is available; syntax and
//! structure are guaranteed here. The analyzer, when it is installed,
//! reads every documented call shape against them: a type that rejects
//! a call the documentation shows is a defect in the type.

#![allow(
    clippy::unwrap_used,
    reason = "this is a test crate; tests panic loudly by design"
)]

#[test]
fn the_shipped_types_are_a_valid_luau_module() {
    let source = std::fs::read_to_string(concat!(
        env!("CARGO_MANIFEST_DIR"),
        "/share/types/init.luau"
    ))
    .unwrap();
    let lua = mlua::Lua::new();
    let value: mlua::Value = lua
        .load(&source)
        .set_name("@share/types/init.luau")
        .eval()
        .unwrap();
    // The module is types plus one cast return; at runtime that is nil.
    assert!(value.is_nil());

    // The runtime accepts `privileged` on `niwa.run`; the types must
    // say so, or strict configs that use it fail analysis.
    let run_options = source
        .split_once("run: (command")
        .map(|(_, rest)| rest.split("-> Result").next().unwrap_or(""))
        .unwrap();
    assert!(
        run_options.contains("privileged: boolean?"),
        "the run options lost `privileged`"
    );

    // Syntax alone would pass on a gutted file; the load-bearing
    // exported types must still be declared by name.
    for name in [
        "export type Result",
        "export type Plist",
        "export type Secret",
        "export type Rendered",
        "export type ReadHandle",
        "export type ActHandle",
        "export type Niwa",
    ] {
        assert!(source.contains(name), "the shipped types lost `{name}`");
    }
}

#[test]
fn every_documented_call_shape_passes_strict_analysis() {
    let Some(analyzer) = on_path("luau-analyze") else {
        eprintln!("luau-analyze is not installed · the call shapes went unchecked");
        return;
    };
    let root = std::path::Path::new(env!("CARGO_MANIFEST_DIR"));
    let directory = tempfile::tempdir().unwrap();

    // The alias arrangement `niwa init` writes, with `@niwa` pointed at
    // this checkout's types instead of the installed copy.
    let luaurc = serde_json::json!({
        "languageMode": "strict",
        "aliases": { "niwa": root.join("share/types"), "self": "." },
    });
    std::fs::write(
        directory.path().join(".luaurc"),
        serde_json::to_string(&luaurc).unwrap(),
    )
    .unwrap();
    std::fs::copy(
        root.join("tests/fixtures/api-shapes.luau"),
        directory.path().join("shapes.luau"),
    )
    .unwrap();

    // Every spawned process carries a deadline. A minute is far past an
    // honest read of one file plus the types it requires.
    let report = std::process::Command::new("/usr/bin/perl")
        .args([
            "-e",
            "alarm shift; exec @ARGV or die \"exec: $!\"",
            "--",
            "60",
        ])
        .arg(analyzer)
        .arg("shapes.luau")
        .current_dir(directory.path())
        .output()
        .unwrap();
    assert!(
        report.status.success(),
        "the shipped types reject a documented call shape:\n{}{}",
        String::from_utf8_lossy(&report.stdout),
        String::from_utf8_lossy(&report.stderr),
    );
}

/// Where a program lives on `PATH`, or `None` when it is not
/// installed: the same walk a shell does.
fn on_path(program: &str) -> Option<std::path::PathBuf> {
    std::env::split_paths(&std::env::var_os("PATH")?)
        .map(|directory| directory.join(program))
        .find(|candidate| candidate.is_file())
}
