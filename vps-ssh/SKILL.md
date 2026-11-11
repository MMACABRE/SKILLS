---
name: vps-ssh
description: Run shell commands on a remote VPS and download or upload files over SSH with password login, using the `vps` CLI. Use when the user gives a server IP and password and asks to inspect, read logs, collect data, check status, back up files, or copy files to or from that server.
---

# vps-ssh

`vps` is a small CLI (`scripts/vps.py`, needs Python with `paramiko`) that opens one SSH connection per call, does one thing, and exits.

## Setup on a new machine

1. `python -m pip install paramiko`
2. Call the script directly with `python <this-skill-dir>/scripts/vps.py ...`, or put a `vps` shim on PATH that runs it.

## Credentials

Pass credentials as environment variables, not flags. Flags end up in shell history and the process list.

| Variable   | Meaning                 | Default |
|------------|-------------------------|---------|
| `VPS_HOST` | server IP or hostname   | none    |
| `VPS_PASS` | SSH password            | none    |
| `VPS_USER` | login user              | `root`  |
| `VPS_PORT` | SSH port                | `22`    |

Shell variables do not persist between tool calls, so set them in the same command:

```bash
VPS_HOST=1.2.3.4 VPS_PASS='secret' vps run "uptime"
```

```powershell
$env:VPS_HOST='1.2.3.4'; $env:VPS_PASS='secret'; vps run "uptime"
```

Quote the password in single quotes so the local shell leaves `$`, `!` and backticks alone. Never echo the password, write it to a file, or put it in a commit, a log, or your reply.

## Commands

```
vps run "<shell command>" [--timeout 300]   # runs on the server, prints stdout and stderr
vps get <remote-path> [local-path]          # downloads a file or a whole directory
vps put <local-path> <remote-path>          # uploads a file or a whole directory
```

- `run` exits with the remote command's exit code. The command runs in the user's default shell on the server, so pipes, `;` and `&&` work. Wrap it in double quotes locally.
- `get` with no local path saves under the remote name in the current directory. It prints each local file it writes.
- `put` needs the remote parent directory to exist. Create it first with `vps run "mkdir -p ..."`.

## Getting data

Do the filtering on the server, so only the result comes back:

```bash
vps run "uname -a; uptime; df -h /; free -m"                 # system overview
vps run "systemctl --failed; systemctl status nginx --no-pager"
vps run "journalctl -u nginx -n 200 --no-pager"               # recent service logs
vps run "tail -n 200 /var/log/syslog"
vps run "ss -tlnp"                                            # listening ports
vps run "docker ps -a; docker logs --tail 100 <name>"
vps run "du -sh /var/* 2>/dev/null | sort -h | tail"
vps run "mysqldump -u root dbname | gzip > /tmp/db.sql.gz" && vps get /tmp/db.sql.gz
```

For large directories, pack them on the server first, then download one file: `vps run "tar czf /tmp/x.tgz -C /etc nginx"` then `vps get /tmp/x.tgz`.

## Limits

- Output shows only after the command finishes. Do not run commands that never end (`tail -f`, `top`, `watch`); use `tail -n`, `top -bn1`, or a one-shot form. `--timeout` (seconds) stops a hung command.
- Password login only; SSH keys and agents are not used.
- No interactive prompts. Use non-interactive flags such as `apt-get -y` and `--no-pager`.

## Safety

- The first connection to a server saves its host key to `~/.ssh/known_hosts`. If the key changes later, `vps` refuses to connect. Tell the user; do not delete the key line on your own, since a changed key can mean the server was replaced or someone is intercepting the connection.
- Reading data is fine to do without asking. Ask the user before any command that changes or deletes things on the server: `rm`, service restarts, package installs, config edits, `put` over existing files, reboots.

## Errors

- `need --host/VPS_HOST and --password/VPS_PASS`: the variables were not set in the same command.
- `connect failed: Authentication failed`: wrong user or password. Ask the user; do not retry in a loop, since servers often ban IPs after repeated failures (fail2ban).
- `connect failed: ... Unable to connect`: wrong IP or port, or a firewall blocks it.
