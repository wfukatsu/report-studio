# report-studio CLI

Drive the Report Studio backend from the terminal — the same product goals
(template management, single/batch PDF output, schema/DB operations, job status)
that the GUI offers, but scriptable (#165).

Dependency-free: uses the global `fetch` and the standard library only — Node 20+ as in
`docs/setup.md` (Node 18, which already bundles `fetch`, also works).

## Setup

Start the backend (`npm run dev:backend`), then log in once:

```bash
npm run cli -- login                 # default admin/changeme for dev
npm run cli -- login --user alice --password secret --url http://host:8080
```

The session cookie is saved to `~/.report-studio/cookies` (override with
`$REPORT_STUDIO_HOME`), so later commands reuse it.

## Commands

```
login / whoami                       authenticate / show current user
tokens list                          list API tokens
tokens create --label <use>          issue an API token (PAT/Bearer, #195)
tokens revoke <id>                   revoke an API token

templates list                       list templates (id, name, visibility, updated)
templates summary <id>               overview: pages, element counts by type, schema, rules
templates outline <id> [--page N]    element table (TSV) with short handles e1, e2, …
templates get <id> [--out f.json]    full definition (>40 KB needs --force or --out)
templates create <name>              new template (--from <id> to duplicate,
                                     --import <file> to load a .rds2.json)
templates edit <id> --ops ops.json   apply edit ops (auto-snapshots first)
                                     --dry-run, --expect-updated-at <iso>, --no-snapshot
templates validate <id>              pre-save checks (local invariants + validation rules)
templates thumbnail <id> [--out f]   render the thumbnail JPEG to a file
templates versions list <id>         list snapshots
templates versions snapshot <id>     snapshot the stored definition
templates versions restore <id> <v>  restore a snapshot (undo for `edit`)
templates export <id> [--out f.json] export to a .rds2.json file
templates import <file>              import a .rds2.json file
templates delete <id> --yes          delete a template (hard delete; --yes required)

evaluate <id> --data d.json          evaluate calculation rules (JEXL debugging)
bindings resolve <id> [--keys k.json] resolve ScalarDB bindings (HTTP 207 partial)
schema list                          list the schema library
schema infer --data sample.json      infer a schema from a sample record

pdf <id> [--data d.json] [--out f]   single PDF (optional testData JSON override)
batch <id> --csv rows.csv [--out d]  one PDF per CSV row into a directory
                                     --filename-template "{col}_{date}.pdf" or --name <col>

responses list <id>                  list a template's responses (with status)
responses status <id> <rid> <status> set one response's status (draft|issued|sent|void)
responses set-status <id> <status>   bulk status change (--ids a,b or --status-from <old>)

jobs list                            list jobs (all types) and their status
jobs status <jobId>                  print one job's status
jobs cancel <jobId>                  cancel / delete a job

db tables                            list ScalarDB namespaces + tables
db rows <ns.table>                   scan rows of a table
```

Global options: `--url <base>`, `--json` (machine-readable output), `--help`.

## Examples

```bash
# Single invoice PDF
npm run cli -- pdf 1dd0a524-... --out invoice.pdf

# Batch: one PDF per CSV row, named by the customer column.
# CSV header keys use dot-notation matching template field keys:
#   customer.customerName,header.documentNo
#   ACME 商事,INV-0001
npm run cli -- batch 1dd0a524-... --csv rows.csv --out out/ --name customer.customerName

# JSON output for piping into jq
npm run cli -- templates list --json | jq '.[].name'
```

## Editing a template with ops

Full read-modify-write of a 25–65 KB definition is both expensive and easy to
corrupt, so edits are expressed as ops against `sections[].elements`:

```bash
npm run cli -- templates outline <id>      # assigns the e1/e2/… handles
cat > ops.json <<'EOF'
{ "ops": [
  { "op": "addPage", "preset": "A4P" },
  { "op": "addElement", "pageIndex": 0,
    "element": { "type": "text", "content": "御 請 求 書", "x": 10, "y": 12,
                 "width": 100, "height": 10, "style": { "fontSize": 20 } } },
  { "op": "updateElement", "elementId": "e3", "patch": { "style": { "fontSize": 12 } } },
  { "op": "moveElement", "elementId": "e5", "y": 34 }
] }
EOF
npm run cli -- templates edit <id> --ops ops.json --dry-run
npm run cli -- templates edit <id> --ops ops.json
```

Ops: `addElement` `updateElement` `removeElement` `moveElement` `addPage`
`removePage` `setSchemaGroup` `setSchemaField` `setRule` `setPointer`.
Element refs accept either a handle (`e3`) or a raw UUID; a handle map that has
gone stale is rejected rather than applied to the wrong element.

Before PUT, four invariants are checked locally — the server does not catch any
of them, and each fails silently at save time:

1. elements written to the deprecated `page.elements` (the renderer ignores it)
2. a 3-level `fieldKey` (renders from sample JSON but is never DB-bindable)
3. an unknown or retired element type (`label`, `table`)
4. schema keys outside the explicit Zod objects (stripped on import) — a warning

`edit` overwrites in place, so it snapshots the stored definition first and
prints the restore command. Undo with:

```bash
npm run cli -- templates versions list <id>
npm run cli -- templates versions restore <id> <versionId>
```

Restore also snapshots the state it replaces, so it is itself reversible. Pass
`--no-snapshot` to skip (e.g. in a tight scripted loop). Note that the server's
restore endpoint only *returns* the archived definition — the CLI writes it back,
otherwise "restore" would be a no-op.

## Notes

- `batch` renders each row through the per-template PDF endpoint (reliable for V2
  templates) rather than the legacy V1 CSV job, which depends on V1 projections
  that V2-created templates don't have.
- **Writes need a PAT.** The CLI sends no Origin header, and the server's CSRF
  filter only tolerates a missing Origin on `/api/v1/auth/*` and
  `/api/v1/public/*` — so a cookie session can log in but gets 403 on every other
  state-changing call. A Bearer PAT bypasses the CSRF check outright
  (`ApiRoutes.csrfRejectReason`). Issue one with `tokens create`, then
  `login --token <token>` or `$REPORT_STUDIO_TOKEN` (env wins).
- Shared HTTP / projection / ops layers live in `lib/`, so an MCP server can reuse
  them without duplicating the API contract. See
  `docs/plans/2026-07-27-feat-agent-cli-interface-plan.md`.
- Agent-facing usage is documented as a skill in
  `.claude/skills/report-studio/SKILL.md`.
