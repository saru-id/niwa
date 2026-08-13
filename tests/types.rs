//! The shipped type definitions must at least be a valid Luau module.
//! Full analysis runs where luau-analyze is available; syntax and
//! structure are guaranteed here.

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
