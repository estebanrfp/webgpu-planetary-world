# Networking — P2P presence & remote avatars

Real-time multiplayer presence over **GenosRTC** (GenosDB's WebRTC layer). Remote
players appear as fully **animated voxel avatars**, not just nameplates.

```
local player ──broadcast──▶ GenosRTC 'presence' channel ──▶ remote clients
 (pos+facing+anim+params)        (~12 Hz, ~150 B)         build mesh + animate locally
```

## What's on the wire

`PresenceSystem.broadcast()` sends a tiny object on the shared `presence` data
channel (throttled to ~12 Hz):

```js
{ id, name,        // identity (wallet address / short name)
  x, y, z,         // ABSOLUTE world position (includes flight altitude)
  fx, fy, fz,      // facing (forward)
  anim: "Walk",    // current animation NAME (string) — not bone data
  params: {...} }  // voxel avatar identity (voxelParams)
```

## Key principle: state synced, animation replayed locally

**Animations are not streamed as bone matrices.** Only the clip *name* travels.
Every client has the same `avatar-anims.glb` and runs the same animation samplers,
so each client reproduces a remote's animation locally:

- a remote sends `anim: "Run"` → the receiver maps that name to its local **run**
  bone slot (`characterSystem.animBoneSlot(anim, index)`) → the remote's mesh is
  skinned with the *local* run matrices.

This is the standard "client-side animation, networked state" pattern. Streaming
bone matrices would cost ~2 MB/s/player; this costs ~1.2 KB/s/player.

## Architecture

| Piece | File | Role |
|---|---|---|
| Presence (data) | `PresenceSystem.js` | broadcast + collect peers; `getRemotePlayers()` (avatars) / `getRemoteEntities()` (nameplates) |
| Per-peer mesh + draw | `terrain/renderer.js` | `_ensureRemoteMesh` (voxel mesh per peer, cached by id, rebuilt if params change); remote instances + draw |
| Shared animation slots | `systems/CharacterSystem.js` | one set of samplers (idle / walk·K / run·K / fly / fall) sampled once per frame; `animBoneSlot(anim, index)` maps a clip name → slot |
| Wiring | `mainPlanet.js` | broadcast each frame; inject presence into the renderer |

A remote player is essentially a **network-driven NPC** — it reuses the exact
per-entity voxel-mesh + bone-slot path the NPC roster uses.

### Animation → bone slot mapping

| Remote `anim` | Slot | Pose |
|---|---|---|
| `Run` | run phase | running |
| `Walk` | walk phase | walking |
| `Fall` | fall | passive descent |
| `Floating` / `Jump` / `Land` | fly | hovering/airborne |
| `Idle` / `Sit` / `Swim` / `TreadWater` / other | idle | idle (fallback) |

Walk/Run use K staggered phase buckets (crowd variety); the rest are single shared
slots. Adding a distinct remote state = add one slot + one sampler + a mapping line.

## Coordinate handling (Floating Origin)

Broadcast positions are **absolute**. Each client renders relative to its own
camera, so the renderer converts `center = remoteAbsolute − absoluteCameraPos`
(double precision; the small result is fine in Float32, same as NPCs).

**Ground-snap:** the GPU avatar-ground pass snaps avatars onto the terrain, but it
is limited to `player + NPCs` (`_npcInstanceEnd`). Remote players are **excluded** —
they broadcast their own Y, so snapping would pin flyers to the ground.

## The world DB

Presence uses the **world** GenosDB instance — `getDB()` → `"ovgrid-world"`
(created with `{ rtc: true, sm }` in `GenosDBManager.js`). It is *not* `window.db`
(that's the marketplace DB, only set when the marketplace loads).

## Testing

Needs **2 clients** in the same room (`ovgrid-world`):

1. `npm run dev`.
2. Open two separate profiles, e.g. Brave normal + Brave incognito, at
   `http://localhost:3000` (separate storage ⇒ distinct identities/avatars).
3. Authenticate both. Console should show `[Presence] ready`, then
   `[Presence] peer joined` / `first message … anim=…`.
4. Move/fly/fall one → the other shows the animated voxel avatar at the right
   height with the matching animation.

> Brave Shields can block WebRTC / the Nostr signaling WebSocket — set Shields
> DOWN on `localhost` if peers don't find each other.

## Known limitations / next steps

- **No position interpolation** — remotes snap to each 12 Hz update (slightly
  steppy). Add lerp between received positions for smoothness.
- **`voxelParams` sent every message** — should be sent once on join (a "hello").
- **Remote states** collapse to idle/walk/run/fly/fall; swim/sit/jump map to the
  nearest. Add slots for full fidelity.
- **Remote meshes aren't freed** from the GPU when a peer leaves (minor leak; few
  peers). Prune `remoteMeshes` on `peer:leave`.
