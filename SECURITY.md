# Security policy

This policy explains which niwa versions receive security fixes and how to report a vulnerability without exposing users.

## Supported versions

Security fixes target the latest release and the `main` branch. Older releases do not receive separate security updates while niwa remains under active construction.

## Report a vulnerability privately

Use GitHub's [private vulnerability report](https://github.com/saru-id/niwa/security/advisories/new). Do not open a public issue, pull request, or discussion before the report is resolved.

Include:

- The affected niwa version or commit
- The affected command, installer path, release artifact, or website route
- Steps that reproduce the issue with fake secrets and disposable data
- The expected and observed impact
- Any mitigation or patch you have tested

Do not include real credentials, private configuration, or identifying machine data. The maintainer will acknowledge the report through the private advisory and coordinate disclosure there.

## Scope

Reports are especially useful when they show that niwa can expose secrets, change a machine without the documented confirmation, escape its configured paths, execute untrusted content, or accept a release artifact that fails verification.

Security hardening ideas without a demonstrated vulnerability belong in a regular [proposal](https://github.com/saru-id/niwa/issues/new?template=proposal.yml).
