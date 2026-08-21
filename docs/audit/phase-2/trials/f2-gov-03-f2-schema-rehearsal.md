# F2-GOV-03-F2 schema rehearsal

Synthetic, non-production change used only to observe the corrected personal-account branch-protection schema.

- Base: `5f0af6759ee221869b3fa35fd124a6dd9aa1328b`
- Target: `rehearsal/f2-gov-03-f2-target`
- Expected: universal checks run; merge remains blocked until every temporary rule is satisfied.
- Prohibited: merge, deployment, FTP, secrets and production.

Second benign commit: stale-review dismissal probe; no production behavior changes.
