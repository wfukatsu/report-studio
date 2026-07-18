# report-studio CLI

Drive the Report Studio backend from the terminal — the same product goals
(template management, single/batch PDF output, schema/DB operations, job status)
that the GUI offers, but scriptable (#165).

Dependency-free: uses Node 18+ global `fetch` and the standard library only.

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

templates list                       list templates (id, name, visibility, updated)
templates get <id>                   print the full template definition
templates export <id> [--out f.json] export to a .rds2.json file
templates import <file>              import a .rds2.json file
templates delete <id>                delete a template

pdf <id> [--data d.json] [--out f]   single PDF (optional testData JSON override)
batch <id> --csv rows.csv [--out d]  one PDF per CSV row into a directory
                                     --name <col> names files by a column value

jobs list                            list batch jobs and their status
jobs status <jobId>                  print one job's status

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

## Notes

- `batch` renders each row through the per-template PDF endpoint (reliable for V2
  templates) rather than the legacy V1 CSV job, which depends on V1 projections
  that V2-created templates don't have.
- Auth is session-cookie based today. A future API-token flow would let CI use the
  CLI without an interactive login (tracked in #165).
