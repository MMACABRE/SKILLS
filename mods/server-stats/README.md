# server-stats

A small Claude Code pane for Linux servers. It shows the server's hostname and IP,
CPU use as a percentage, RAM and disk (`/`) as used/total GB plus a percentage,
and refreshes every 3 seconds. Bars turn yellow at 70% and red at 90%.

```
╭────────────────────────────────────────╮
│ my-vps 203.0.113.10                    │
│ CPU  ██░░░░░░░░░░  18.3%               │
│ RAM  ██████░░░░░░  50.0%  2.0/4.0 GB   │
│ Disk ███░░░░░░░░░  25.0%  20.0/80.0 GB │
╰────────────────────────────────────────╯
```

## Install

At the prompt of a Claude Code terminal session on the server:

```
/plugin install server-stats --marketplace MMACABRE/SKILLS
```

Answer `y` to add the marketplace, then pick a scope (user scope loads it in every session).

From a shell instead:

```
claude plugin install server-stats --marketplace MMACABRE/SKILLS
```

The pane opens on its own when the terminal is wide enough (144+ columns);
otherwise run `/server-stats` to open it.

## Notes

- Linux only: it reads `/proc/stat`, `/proc/meminfo`, `df /` and `ip route`.
- RAM "used" is total minus available, the same figure `free` reports.
- The IP is the source address of the default route, so Docker bridge
  addresses are skipped; it falls back to `hostname -I`.
- Disk covers the root filesystem only.
