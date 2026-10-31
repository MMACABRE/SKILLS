export type Stats = {
  host: string
  ip: string
  cpuPct: number
  memTotal: number
  memUsed: number
  diskTotal: number
  diskUsed: number
  diskAvail: number
}

export type Snapshot = { stats: Stats | null; error: string | null }

declare module 'claude-code' {
  interface PluginState {
    'server-stats': { snapshot: Shaped<Snapshot> }
  }
}
