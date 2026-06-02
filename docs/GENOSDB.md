# GenosDB in OVGrid

OVGrid's entire live state runs on **[GenosDB](https://github.com/estebanrfp/gdb)** —
peer-to-peer, real-time, reactive, with **no game server**. This page is the map:
the three distinct ways OVGrid uses GenosDB, with pointers to the code and the
deep-dive docs.

## One database, three jobs

A single GenosDB instance — `"ovgrid-world"`, created with `{ rtc: true, sm }`
(GenosRTC networking + Security Manager) — is the world's source of live state.
See [`lib/network/GenosDBManager.js`](../lib/network/GenosDBManager.js) (`getDB()`).

```
                       ┌──────────────────────────┐
   WebGPU 3-D world ──▶│   GenosDB  "ovgrid-world" │◀── Marketplace UI
   (presence, land)    │   { rtc: true, sm }       │    (listings, offers)
                       └────────────┬─────────────┘
                          db.map(query, cb)  ← every consumer reads reactively
                          GenosRTC P2P sync  ← every write propagates to peers
```

### 1 · Real-time multiplayer presence (GenosRTC)

Other players appear as **animated avatars** at the right position, altitude and
animation, synced ~12 Hz over WebRTC — no server in the middle. Only *state* is
sent; each client replays the animation locally.

- Code: [`lib/network/PresenceSystem.js`](../lib/network/PresenceSystem.js)
- Detail: [`lib/network/README.md`](../lib/network/README.md)
- GenosDB capability shown: **GenosRTC** data channels, serverless P2P.

### 2 · Reactive world & land state (`db.map`)

The parcel grid and land records are read with a self-contained realtime
subscription — the **same `db.map(query, callback)` pattern** the marketplace uses
for inventory. Claim a parcel and it appears live, on every connected peer.

- Code: [`lib/terrain/parcel-data.js`](../lib/terrain/parcel-data.js)
- GenosDB capability shown: **reactive queries**, real-time subscriptions.

### 3 · On-chain mirror — a reactive cache over a blockchain

Polygon is the **source of truth** for ownership; a sync layer mirrors it into
GenosDB so the world reads **fast, offline and in real time** instead of hitting
the chain. The UI never reads the chain directly. This is OVGrid's flagship
GenosDB pattern: *blockchain = truth, GenosDB = reactive read layer + P2P sync.*

- Code: [`lib/marketplace/js/core/blockchain/sync.js`](../lib/marketplace/js/core/blockchain/sync.js)
- Detail: [`lib/marketplace/docs/GENOSDB_INTEGRATION.md`](../lib/marketplace/docs/GENOSDB_INTEGRATION.md)
- GenosDB capability shown: **GenosDB as a real-time mirror/cache** over expensive,
  slow on-chain writes — offline-capable, instant reads.

## Identity & access (Security Manager)

Sign-in is decentralized — WebAuthn biometrics or a BIP39 mnemonic — and
operations are signed and access-controlled by GenosDB's **Security Manager**.

- Code: [`lib/network/AuthManager.js`](../lib/network/AuthManager.js)
- Detail: [`docs/AUTH_AND_AVATARS.md`](AUTH_AND_AVATARS.md)

## The point

**The read layer never changes.** Whether a parcel is a local GenosDB record or
an asset minted on-chain and mirrored in, the world reads it the same reactive
`db.map` way. GenosDB is the abstraction that lets a 3-D world, real-time
multiplayer and an on-chain marketplace all share **one serverless data layer**.
