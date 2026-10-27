// The session state agent-hud keeps in `$.state`; favourites are mirrored to
// `$.store` under the key `favourites` so they outlive the session.
declare module 'claude-code' {
  interface PluginState {
    'agent-hud': {
      /** What the skill search box holds. */
      skillQuery: string
      /** Starred skill names, in the order they were starred. */
      favourites: string[]
    }
  }
}
