//! Folding and the conflict lint.
//!
//! Two declarations with the same identity and the same spec fold into
//! one, harmlessly. Same identity with a different spec is a conflict
//! — unless one side is a host file, which is the override mechanism
//! working as intended: later declaration wins, merged per key.

use std::collections::HashMap;

use super::{Declaration, Identity, Provenance};

#[derive(Debug)]
pub struct Analysis {
    /// Distinct identities, in first-declared order.
    pub resources: usize,
    pub conflicts: Vec<Conflict>,
}

#[derive(Debug)]
pub struct Conflict {
    pub identity: Identity,
    /// One location per distinct spec, in declaration order.
    pub locations: Vec<Provenance>,
}

pub fn analyze(declarations: &[Declaration]) -> Analysis {
    let mut order: Vec<&Identity> = Vec::new();
    let mut groups: HashMap<&Identity, Vec<&Declaration>> = HashMap::new();
    for declaration in declarations {
        groups
            .entry(&declaration.identity)
            .or_insert_with(|| {
                order.push(&declaration.identity);
                Vec::new()
            })
            .push(declaration);
    }

    let mut conflicts = Vec::new();
    for identity in &order {
        let group = &groups[*identity];
        // Hosts may disagree with modules; that is the override. Two
        // non-host declarations disagreeing, or two host declarations
        // disagreeing, is a conflict.
        for layer in [false, true] {
            let layer_declarations: Vec<&&Declaration> =
                group.iter().filter(|d| d.unit.is_host() == layer).collect();
            let Some(first) = layer_declarations.first() else {
                continue;
            };
            if layer_declarations.iter().all(|d| d.spec == first.spec) {
                continue;
            }
            let mut locations = Vec::new();
            let mut seen_specs: Vec<&super::Value> = Vec::new();
            for declaration in &layer_declarations {
                if !seen_specs.contains(&&declaration.spec) {
                    seen_specs.push(&declaration.spec);
                    locations.push(declaration.provenance.clone());
                }
            }
            conflicts.push(Conflict {
                identity: (*identity).clone(),
                locations,
            });
        }
    }

    Analysis {
        resources: order.len(),
        conflicts,
    }
}

#[cfg(test)]
mod tests {
    use std::collections::BTreeMap;

    use super::super::{Kind, Unit, Value};
    use super::*;

    fn declaration(key: &str, value: i64, unit: Unit, line: u32) -> Declaration {
        let mut fields = BTreeMap::new();
        fields.insert("value".to_string(), Value::Int(value));
        Declaration {
            identity: Identity::new(Kind::Defaults, key),
            spec: Value::Map(fields),
            provenance: Provenance {
                file: "test.luau".to_string(),
                line,
            },
            unit,
            privileged: false,
        }
    }

    #[test]
    fn identical_declarations_fold_into_one_resource() {
        let declarations = vec![
            declaration("d:k", 1, Unit::Module("a".to_string()), 1),
            declaration("d:k", 1, Unit::Module("b".to_string()), 2),
        ];
        let analysis = analyze(&declarations);
        assert_eq!(analysis.resources, 1);
        assert!(analysis.conflicts.is_empty());
    }

    #[test]
    fn two_modules_disagreeing_is_a_conflict_with_both_locations() {
        let declarations = vec![
            declaration("d:k", 1, Unit::Module("a".to_string()), 5),
            declaration("d:k", 2, Unit::Module("b".to_string()), 9),
        ];
        let analysis = analyze(&declarations);
        assert_eq!(analysis.conflicts.len(), 1);
        let conflict = &analysis.conflicts[0];
        assert_eq!(conflict.locations.len(), 2);
        assert_eq!(conflict.locations[0].line, 5);
        assert_eq!(conflict.locations[1].line, 9);
    }

    #[test]
    fn a_host_overriding_a_module_is_not_a_conflict() {
        let declarations = vec![
            declaration("d:k", 1, Unit::Module("a".to_string()), 5),
            declaration("d:k", 2, Unit::Host("laptop".to_string()), 3),
        ];
        let analysis = analyze(&declarations);
        assert_eq!(analysis.resources, 1);
        assert!(analysis.conflicts.is_empty());
    }

    #[test]
    fn init_disagreeing_with_a_module_is_a_conflict() {
        let declarations = vec![
            declaration("d:k", 1, Unit::Init, 2),
            declaration("d:k", 2, Unit::Module("a".to_string()), 7),
        ];
        let analysis = analyze(&declarations);
        assert_eq!(analysis.conflicts.len(), 1);
    }
}
