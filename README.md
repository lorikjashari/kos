# KoS

Browser first-person shooter built with **TypeScript**, **Vite**, **Three.js**, and **Ammo.js**.

KoS is a **hobby prototype**: bots, Pool Day / Dust II sessions, mobile PWA install, and friends multiplayer. It is **not** Counter-Strike, not Valve-affiliated, and not competitive-ready.

## What it is

- Local bot matches (FFA deathmatch + Dust II team rounds)
- Touch / PWA path for phones
- PeerJS “host a room” multiplayer with host-side hit checks
- CS-flavored HUD, loadout, and callouts — for feel, not as a commercial CS clone

## What it isn’t

- A dedicated-server / ranked product
- Cleared for store / monetization (see [LEGAL.md](./LEGAL.md))
- Bomb defusal / full CS weapon roster (assets missing)

## Develop

```bash
npm install
npm run dev
```

## Build

```bash
npm run build
npm run preview
```

Static deploy (e.g. Vercel) works with the default Vite `dist` output.

## Mobile performance presets

Settings → Mobile → performance (or auto on first touch boot):

| Preset | Intent |
|--------|--------|
| **Smooth** | Lowest cost — older phones / Dust II |
| **Balanced** | Default for most phones |
| **Quality** | Post + particles — newer devices |

Dust II applies an extra backbuffer budget vs Pool Day. Overlay: console `cl_showfps 1` / `net_graph 1` (see `PerfOverlay`).

## Multiplayer — host safely

KoS friends MP is a **PeerJS star**: one browser hosts; others join `kos-room-<CODE>`. There is **no** dedicated game server.

| Piece | Reality |
|-------|---------|
| Signaling | Public PeerJS brokers — best-effort |
| NAT | Google STUN + public TURN — not guaranteed |
| Room list | Public MQTT heartbeats — spoofable; TTL ~10s |
| Combat | Host validates hits; listen-server style |

**Safer habits**

- Prefer **private room codes** with people you trust
- Don’t treat the public room browser as authenticated matchmaking
- Host leaves → session ends (no migration)
- For serious use, run your own PeerServer / TURN (see below)

Console: `ex_interp` sets remote pose delay (seconds, ~0.03–0.25).

### Self-host signaling / TURN

Copy [`.env.example`](./.env.example) → `.env.local` and set:

| Variable | Purpose |
|----------|---------|
| `VITE_PEER_HOST` / `PORT` / `PATH` / `KEY` / `SECURE` | Custom [PeerServer](https://github.com/peers/peerjs-server) |
| `VITE_ICE_SERVERS` | JSON `RTCIceServer[]` (STUN/TURN) |
| `VITE_MQTT_BROKER` / `VITE_MQTT_TOPIC` | Room-list MQTT |

Defaults stay on public brokers when unset. Restart `npm run dev` after changing env.

## Local demos

In a live match, console:

| Command | Action |
|---------|--------|
| `record` | Start POV capture (~20 Hz) |
| `stop` | Finish → download JSON + `localStorage` |
| `playdemo` | Replay last demo (freezes bots; `stop` cancels) |
| `demolist` | Show last demo metadata |

Not Valve `.dem` — KoS JSON POV only. No accounts / ranked.

## Pose editor

Console `editormode` → dummy poser. **Save pose** / **Load pose** persist joint JSON locally (and download on save).

## First run

On first launch you’ll get a short tips card (movement, loadout, TDM rounds). Errors surface as bottom toasts; a local telemetry ring is kept in `localStorage` only (never uploaded by default).

## License

MIT for application source — [LICENSE](./LICENSE). Asset / trademark constraints — [LEGAL.md](./LEGAL.md).