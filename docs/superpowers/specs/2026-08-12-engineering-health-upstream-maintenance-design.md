# Engineering Health And Upstream Maintenance Design

## Goal

Give Mineradio-Next a repeatable maintenance gate for dependency security and
future original/LX upstream updates. The tooling reports facts and prepares a
review; it never merges upstream code into `main` automatically.

## Scope

- Remove currently fixable npm audit findings without crossing Electron's
  current major version unless a future review explicitly approves it.
- Add stable package scripts for unit tests, full verification, dependency
  audit, upstream inspection, and the complete maintenance gate.
- Replace ad hoc upstream inspection with a structured report containing the
  locked revision, fetched revision, commit list, changed files, overlap with
  Mineradio-Next-owned files, and a risk classification.
- Keep the two read-only upstream worktrees and the two no-push remotes. The
  report must work before the lock file is advanced.
- Add regression tests for lock validation, report classification, dirty-tree
  protection, and the no-automatic-merge contract.

## Dependency Policy

- `package-lock.json` remains authoritative and must be updated with npm rather
  than hand-edited.
- Production and development dependencies are both audited because Electron and
  packaging tools execute during release construction.
- The maintenance gate fails on high or critical findings. Moderate findings
  remain visible and require an explicit recorded decision if no compatible fix
  exists.
- A dependency update is accepted only after unit tests, full quick-check, and
  a Windows directory build or equivalent packaged-runtime smoke check pass.

## Upstream Report

`scripts/upstream-report.js` reads `upstream-lock.json` and the current remote
references. For each upstream it writes a human-readable Markdown report under
`reports/upstream/` and optionally prints JSON for automation.

Each source section includes:

- old and new commit identifiers;
- whether the update is unchanged, fast-forward, rewritten, or unavailable;
- commit subjects and changed paths between the revisions;
- paths also present in Mineradio-Next, grouped as playback, desktop/runtime,
  provider/server, UI/assets, build/dependency, documentation, or other;
- a recommended action: no action, inspect, or manual migration required.

The report does not call `merge`, `rebase`, `cherry-pick`, `checkout`, or write
the lock file. `sync-upstreams.ps1` fetches first, generates this report against
the previous lock, and advances the lock only after report generation succeeds.

## Merge Protection

- Reject dirty read-only upstream worktrees before fetching.
- Reject malformed lock files and missing/unresolvable commits.
- Preserve no-push URLs for both upstream remotes.
- Keep original and LX histories independent; LX is not expected to share a Git
  ancestor with Mineradio-Next.
- Never treat a clean textual merge as proof that a feature should be copied.
  Every reported overlap remains a manual product and architecture decision.

## Verification

- Focused tests validate dependency policy and the report's pure classification
  helpers with temporary Git fixtures.
- `npm test` runs the full Node test suite.
- `npm run check` runs the full application quick-check.
- `npm run security:audit` enforces the high/critical vulnerability threshold.
- `npm run maintenance:check` combines tests, security audit, upstream report
  validation, and full application checks.
- A Windows unpacked build verifies the updated Electron/package lock in the
  actual desktop packaging path.

## Non-Goals

- No new application UI.
- No automatic upstream merge or wholesale LX copy.
- No user-data migration.
- No dependency major-version jump merely to make an audit counter reach zero.
