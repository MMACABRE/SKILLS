// The session state agent-hud keeps in `$.state`; favourites are mirrored to
// `$.store` under the key `favourites` so they outlive the session.
declare module 'claude-code' {
  interface PluginState {
    'agent-hud': {
      /** What the skill search box holds. */
      skillQuery: string
      /** Starred skill names, in the order they were starred. */
      favourites: string[]
      /** Last result of comparing ~/.agents/skills with the SKILLS repo clone. */
      repoSync: {
        status: 'idle' | 'checking' | 'syncing' | 'ok' | 'out' | 'error'
        /** Skill folders whose files differ between the two. */
        changed: string[]
        /** Skill folders only on this computer. */
        added: string[]
        /** Skill folders only in the repo. */
        removed: string[]
        /** Local commits not yet pushed to GitHub. */
        ahead: number
        /** GitHub commits not yet pulled. */
        behind: number
        /** The fetch failed, so ahead and behind may be stale. */
        isOffline: boolean
        error?: string
        /** Short sha of the commit a sync pushed, or 'none'. */
        syncedSha?: string
        /** Epoch ms of the last finished check or sync. */
        checkedAt?: number
      }
    }
  }
}
