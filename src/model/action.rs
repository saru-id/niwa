//! The verdict vocabulary: what a comparison concluded, and the plan
//! screen built from it. These are model shapes, below every
//! provider, so providers and orchestrators can both name a verdict
//! without depending on one another.

use super::Declaration;

pub enum Action {
    /// Nothing to do; the machine already agrees.
    InSync,
    /// The resource does not exist yet.
    Create,
    /// The resource exists with another value.
    Change { detail: String },
    /// No provider reads this kind yet.
    Unchecked,
}

pub struct Item {
    pub declaration: Declaration,
    pub action: Action,
}

pub struct Plan {
    pub items: Vec<Item>,
}

impl Plan {
    pub fn pending(&self) -> usize {
        self.items
            .iter()
            .filter(|item| matches!(item.action, Action::Create | Action::Change { .. }))
            .count()
    }

    pub fn unchecked(&self) -> usize {
        self.items
            .iter()
            .filter(|item| matches!(item.action, Action::Unchecked))
            .count()
    }
}
