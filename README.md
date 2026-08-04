# KoS

Browser first-person shooter — TypeScript, Vite, Three.js, Ammo.js.

Local bot matches, Dust II team rounds, mobile PWA, and PeerJS multiplayer. Independent hobby project; not affiliated with Valve.

## Quick start

```bash
npm install
npm run dev
```

```bash
npm run build
npm run preview
```

Deploy the Vite `dist` output to any static host.

## Play

- **Deathmatch** — free-for-all with bots on Pool Day or Dust II
- **Team rounds** — T vs CT on Dust II
- **Multiplayer** — host a room code; friends join via PeerJS
- **Mobile** — installable PWA with Smooth / Balanced / Quality presets

## Multiplayer config

Optional. Copy [`.env.example`](./.env.example) → `.env.local` for a custom PeerServer, ICE/TURN servers, or MQTT room list. Defaults use public brokers.

| Variable | Purpose |
|----------|---------|
| `VITE_PEER_*` | PeerJS server host / port / path / key |
| `VITE_ICE_SERVERS` | JSON `RTCIceServer[]` |
| `VITE_MQTT_*` | Room-list broker and topic |

Restart the dev server after changing env.

## Console

| Command | Action |
|---------|--------|
| `cl_showfps 1` / `net_graph 1` | Performance overlay |
| `record` / `stop` / `playdemo` | Local POV demo capture |
| `editormode` | Pose editor (save / load locally) |

## License

Source: [MIT](./LICENSE). Assets and trademarks: [LEGAL.md](./LEGAL.md).
