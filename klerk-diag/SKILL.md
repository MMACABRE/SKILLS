---
name: klerk-diag
description: Read a live KLERK clinic's diagnostics feed (server stats, specs, error reports, logs) with tools/klerk_diag.py. Use when debugging a deployed KLERK clinic, checking a clinic's health after a release, following its logs, or when the owner hands over a diagnostics token (kd_...). Read-only; never patient data.
---

# klerk-diag: read a clinic's logs and health

KLERK's diagnostics feed (ADR-0013 in the KLERK.Private repo) lets the builder read a clinic server without the
deployment agent. The CLI is `tools/klerk_diag.py` in the KLERK.Private checkout (desktop
`C:\Users\H.2\Desktop\Klerk`). Python standard library only; run it from the repo root.

## Before you start

- The feed must be on for that clinic. Only the clinic's owner switches it on in the app: «مدیریت کاربران» →
  «عیب‌یابی» → «روشن کردن». The app shows the token (`kd_...`) once. If you have no token, write
  `needs input:` and ask the owner to switch the feed on and send the token privately.
- The clinic must run a release built on or after 2026-11-14 (the feed does not exist before). A 404 on every
  command means: feed off, wrong address, or an older release.
- The token expires 30 days after it was made or renewed. Renewing and switching off are the owner's, in the same
  page.

## Commands

```
python tools/klerk_diag.py clinics add <name> https://<clinic-domain>        # prompts for the token, hidden
echo "$TOKEN" | python tools/klerk_diag.py clinics add <name> https://<domain> --token-stdin   # non-interactive
python tools/klerk_diag.py clinics list | remove <name>

python tools/klerk_diag.py stats  --clinic <name>          # live: memory, CPU, disk, MySQL, warnings
python tools/klerk_diag.py specs  --clinic <name>          # versions, image tag, kernel, limits, data size
python tools/klerk_diag.py errors --clinic <name> [--since CURSOR] [--limit 50]
python tools/klerk_diag.py logs   --clinic <name> [--process web|worker|client] [--since CURSOR] [--follow]
```

- With one clinic configured, `--clinic` may be left out. Add `--pretty` for indented JSON.
- Output is one JSON object per line. `errors` and `logs` end with `{"cursor": "..."}`: pass it to `--since` next
  time to read only what is new. A `{"gap": true}` line means rotation removed records after your cursor.
- `--follow` polls every 5 s; stop it with Ctrl+C. In Claude Code, run it in the background or with a timeout.
- Exit codes: 0 ok; 1 usage or config error; 2 refused, with `{"error": 401|404|429}` on stderr (401 wrong token,
  404 feed off or wrong address, 429 too many reads or locked after 20 wrong tokens; wait 15 minutes).

## Reading the answers

- `stats.warnings`: `worker` (worker stopped: no SMS, imports, nightly backup), `backup` (no nightly dump in 26 h),
  `disk_low`, `memory_high` (over 90 % of the container limit), `errors_burst` (over 20 errors in 5 min),
  `db_unreachable`, `logs_paused_low_disk`. Empty list = healthy.
- `errors` groups reports by `fingerprint`: `count`, `first_seen`, `last_seen`, and a `sample` with `exc_type`,
  `mysql_code` (e.g. 1062 duplicate key, 1213 deadlock, 2006/2013 connection lost), `route`, `method`, `status`,
  `duration_ms`, `version`, `image`, `frames` (repo-relative `file` + `function`) and `recent` (the request's last
  log templates). Open the named files in the checkout matching `image` to find the cause.
- `logs`: `msg` is the log template our code wrote (`"backup failed: %s: %s"`), never the values. Records from
  django, gunicorn or mysqlclient carry only logger and level. `process=client` are browser errors (name, route
  pattern, frame names).
- There are no messages, values, bodies or patient data by design. Reproduce a bug with fake data on the dev stack
  (`seed_demo`), never ask the clinic for real records.

## Rules

- Read-only: the feed cannot change anything on the server. Server changes still go through the deployment agent
  and the owner.
- Never print, log, commit or paste a token. The config file `~/.klerk-diag.json` holds them (override with
  `KLERK_DIAG_CONFIG`); keep it private (`chmod 600` on POSIX).
- Every read is audited in the clinic (`diag_read`, once a day per address); that is expected.
- When done with a clinic for good, ask the owner to switch the feed off.
