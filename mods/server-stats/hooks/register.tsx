import { atom, read, update } from 'claude-code'
import type { Register } from 'claude-code'

import type { Stats } from '../types'

const PANE = 'server-stats'
const PERIOD_MS = 3000
// 6 rows inline (border + 4 lines), 44 columns when docked
const OPEN = { id: PANE, title: 'Server', rows: 6, columns: 44 } as const

const snapshot = atom(
  { plugin: 'server-stats', key: 'snapshot' } as const,
  { stats: null, error: null },
  { shape: 'snapshot-2' },
)

// String.raw: the awk "\n" must reach sh as backslash-n, not a real newline.
// CPU: two /proc/stat samples 1s apart. IP: source address of the default
// route (skips docker/bridge addresses), falling back to hostname -I.
const SCRIPT = String.raw`
s() { read -r _ a b c d e f g h _ < /proc/stat; T=$((a+b+c+d+e+f+g+h)); I=$((d+e)); }
s; t1=$T; i1=$I; sleep 1; s; t2=$T; i2=$I
dt=$((t2-t1)); [ "$dt" -gt 0 ] || dt=1
echo "cpu $(( 1000*(dt-(i2-i1))/dt ))"
awk '/^MemTotal:/{t=$2} /^MemAvailable:/{a=$2} END{printf "mem %.0f %.0f\n", t*1024, (t-a)*1024}' /proc/meminfo
df -B1 -P / | awk 'NR==2{print "disk", $2, $3, $4}'
ip=$(ip -4 route get 1.1.1.1 2>/dev/null | awk '{for(i=1;i<NF;i++) if($i=="src"){print $(i+1); exit}}')
[ -n "$ip" ] || ip=$(hostname -I 2>/dev/null | awk '{print $1}')
echo "ip $ip"
echo "host $(hostname)"
`

export function parse(out: string): Stats {
  const kv: Record<string, string[]> = {}
  for (const line of out.split('\n')) {
    const [k, ...rest] = line.trim().split(/\s+/)
    if (k) kv[k] = rest
  }
  const num = (k: string, i = 0) => Number(kv[k]?.[i] ?? NaN)
  const stats: Stats = {
    host: kv.host?.[0] ?? '?',
    ip: kv.ip?.[0] || 'unknown',
    cpuPct: num('cpu') / 10,
    memTotal: num('mem', 0),
    memUsed: num('mem', 1),
    diskTotal: num('disk', 0),
    diskUsed: num('disk', 1),
    diskAvail: num('disk', 2),
  }
  if (Object.values(stats).some(v => Number.isNaN(v))) {
    throw new Error('could not read /proc or df (is this Linux?)')
  }
  return stats
}

const gb = (bytes: number) => (bytes / 1024 ** 3).toFixed(1)
const pct = (part: number, whole: number) => (whole > 0 ? (100 * part) / whole : 0)
const tone = (p: number) => (p >= 90 ? 'red' : p >= 70 ? 'yellow' : 'green')
const BAR = 12
const bar = (p: number) => {
  const full = Math.round((Math.min(100, Math.max(0, p)) / 100) * BAR)
  return '█'.repeat(full) + '░'.repeat(BAR - full)
}
const fmtPct = (p: number) => `${p.toFixed(1)}%`.padStart(7)

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'server-stats',
      description: "Show this server's CPU, RAM, disk and IP in a pane",
    })

    let busy = false
    const sample = async () => {
      if (busy) return
      busy = true
      try {
        const r = await $.process.run(['sh', '-c', SCRIPT], { timeoutMs: 10000 })
        const stats = parse(r.stdout)
        await update($, snapshot, () => ({ stats, error: null }))
      } catch (err) {
        const error = err instanceof Error ? err.message : String(err)
        await update($, snapshot, s => ({ ...s, error }))
      } finally {
        busy = false
      }
    }
    void sample()
    $.clock.every(PERIOD_MS, sample)
    void $.ui.open(OPEN)

    return next(e)
  })

  on('command.run', { command: 'server-stats' }, async $ => {
    await $.ui.open(OPEN)
    return { text: 'Server stats pane opened.' }
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text } = $.ui.resolve(e)
    const { stats, error } = await read($, snapshot)

    if (!stats) {
      return (
        <Box borderStyle="round" paddingX={1}>
          <Text dimColor>{error ?? 'Reading server stats…'}</Text>
        </Box>
      )
    }

    const memP = pct(stats.memUsed, stats.memTotal)
    // Same basis as df's Use%: used / (used + available)
    const diskP = pct(stats.diskUsed, stats.diskUsed + stats.diskAvail)

    return (
      <Box borderStyle="round" paddingX={1} flexDirection="column">
        <Text>
          <Text bold>{stats.host}</Text> <Text color="cyan">{stats.ip}</Text>
          {error ? <Text color="red"> (stale: {error})</Text> : null}
        </Text>
        <Text>
          CPU  <Text color={tone(stats.cpuPct)}>{bar(stats.cpuPct)}</Text>
          {fmtPct(stats.cpuPct)}
        </Text>
        <Text>
          RAM  <Text color={tone(memP)}>{bar(memP)}</Text>
          {fmtPct(memP)}  <Text dimColor>{gb(stats.memUsed)}/{gb(stats.memTotal)} GB</Text>
        </Text>
        <Text>
          Disk <Text color={tone(diskP)}>{bar(diskP)}</Text>
          {fmtPct(diskP)}  <Text dimColor>{gb(stats.diskUsed)}/{gb(stats.diskTotal)} GB</Text>
        </Text>
      </Box>
    )
  })
}
