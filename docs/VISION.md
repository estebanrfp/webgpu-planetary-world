# OVGrid — Vision

## What OVGrid is

OVGrid is an **open social world**, not a game. There is no win condition and
no objective loop — it is a persistent WebGPU planet that people explore,
inhabit and share. Structured games are something OVGrid can *host* later as
optional layers; they are not what it is.

Reference points: VRChat, Rec Room — social spaces first, content second.

## A web-first distributed world

OVGrid is a **web app** — a static WebGPU build deployed on Netlify, with P2P
networking and identity via GenosDB. The browser is the platform: instant,
linkable, no install, no gatekeeper. This is the project's strength, not a
limitation — a distributed social world belongs on the open web.

- **Rendering, world, avatar, P2P presence** — the WebGPU core.
- **Identity** — BIP39 mnemonic + WebAuthn (GenosDB Security Manager).
- **Blockchain / marketplace** — an **optional layer on top**: OVG token,
  ERC-1155 assets, parcels as tradable land. The world stands on its own
  without it; the economy is additive.

> Note: OVGrid is web-only — it runs in the browser on WebGPU, with the full
> blockchain + GenosDB stack. Native/desktop game ambitions live in separate,
> purpose-built game projects.

## How it is built

Incrementally, without deadline pressure. The world is given shape little by
little — terrain, avatars, presence, then places, then activity — on a single
shared web core.

## Games as future layers

Once the world and its social layer are solid, games and structured
experiences can be added as **modular layers on top** — per-parcel mini-games,
events, missions — without rewriting the core. The platform comes first, the
content modules come later. This ordering is deliberate, not a missing piece.

## Open design question

A social world lives on **retention** — a reason to come back. The rendering
and presence technology is strong; the open question is what makes *being
there* worthwhile over time: other people present, places that evolve, events,
expression and identity. This is explored as the world takes shape, in line
with the incremental approach above — not decided up front.

---

*See also: `ROADMAP.md` for the marketplace roadmap.*
