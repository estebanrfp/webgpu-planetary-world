/**
 * PresenceSystem — P2P player presence over a GenosRTC data channel.
 *
 * Each peer broadcasts its absolute position, facing, current animation and voxel
 * avatar identity on a shared 'presence' channel. Remote peers are exposed both
 * as nameplate entities (NameplateSystem) and as full players (the renderer builds
 * an animated voxel avatar per peer). The local identity is injected by the caller.
 *
 * @module network/PresenceSystem
 */

const CHANNEL = 'presence'
const BROADCAST_HZ = 12
const BROADCAST_INTERVAL = 1000 / BROADCAST_HZ // ~83 ms
const PEER_TIMEOUT_MS = 5000
const REMOTE_TINT = '#ffaa33' // distinct from the local player's cyan

/** Map an animation name to the nameplate status enum (0 idle · 1 walk · 2 run). */
const animToState = (anim) => (anim === 'Run' ? 2 : anim === 'Walk' ? 1 : 0)

/**
 * Create the P2P presence system.
 * @param {object} opts
 * @param {object} opts.db - GenosDB instance (rtc enabled → exposes db.room)
 * @param {{id: string, name: string}} opts.identity - local player identity
 * @returns {{broadcast: Function, getRemotePlayers: Function, getRemoteEntities: Function, destroy: Function}}
 */
export const createPresenceSystem = ({ db, identity }) => {
  const room = db?.room
  if (!room) {
    console.warn('[Presence] db.room unavailable — presence disabled')
    const noop = () => {}
    return { broadcast: noop, getRemotePlayers: () => [], getRemoteEntities: () => [], destroy: noop }
  }

  const channel = room.channel(CHANNEL)
  /** @type {Map<string, object>} peerId → { id, name, x, y, z, fx, fy, fz, anim, params, lastSeen } */
  const remotePeers = new Map()
  let lastSent = 0

  const onMessage = (data, peerId) => {
    if (!data || typeof data !== 'object') return
    if (!remotePeers.has(peerId)) {
      console.log(`[Presence] first message from ${peerId}: "${data.name}" @ (${data.x?.toFixed?.(1)}, ${data.y?.toFixed?.(1)}, ${data.z?.toFixed?.(1)}) anim=${data.anim}`)
    }
    remotePeers.set(peerId, { ...data, lastSeen: performance.now() })
  }
  channel.on('message', onMessage)

  const onPeerLeave = (peerId) => remotePeers.delete(peerId)
  room.on('peer:leave', onPeerLeave)
  room.on('peer:join', (peerId) => console.log(`[Presence] peer joined: ${peerId}`))

  /**
   * Broadcast the local player's presence. Throttled to BROADCAST_HZ.
   * @param {{x:number, y:number, z:number}} pos - ABSOLUTE world position
   * @param {number[]} [forward] - world-space facing [x,y,z]
   * @param {string} [anim] - current animation clip name (Walk/Run/Floating/…)
   * @param {object} [params] - voxel avatar params (identity, ~tiny)
   */
  const broadcast = (pos, forward = [0, 0, 1], anim = 'Idle', params = null) => {
    const now = performance.now()
    if (now - lastSent < BROADCAST_INTERVAL) return
    lastSent = now
    channel.send({
      id: identity.id, name: identity.name,
      x: pos.x, y: pos.y, z: pos.z,
      fx: forward[0], fy: forward[1], fz: forward[2],
      anim, params,
    })
  }

  /** Drop peers not heard from within PEER_TIMEOUT_MS (safety net). */
  const prune = (now) => {
    for (const [peerId, p] of remotePeers) if (now - p.lastSeen > PEER_TIMEOUT_MS) remotePeers.delete(peerId)
  }

  /**
   * Remote peers as full players (for the renderer's voxel avatars).
   * @returns {Array<{id:string, name:string, x:number, y:number, z:number, forward:number[], anim:string, params:object}>}
   */
  const getRemotePlayers = () => {
    const now = performance.now()
    prune(now)
    const out = []
    for (const [peerId, p] of remotePeers) {
      out.push({ id: peerId, name: p.name ?? 'Player', x: p.x, y: p.y, z: p.z, forward: [p.fx ?? 0, p.fy ?? 0, p.fz ?? 1], anim: p.anim ?? 'Idle', params: p.params })
    }
    return out
  }

  /**
   * Remote peers as nameplate entities (NameplateSystem).
   * @returns {Array<{name:string, x:number, y:number, z:number, health:number, energy:number, state:number, tint:string}>}
   */
  const getRemoteEntities = () => {
    const now = performance.now()
    prune(now)
    const out = []
    for (const [, p] of remotePeers) {
      out.push({ name: p.name ?? 'Player', x: p.x, y: p.y, z: p.z, health: 1.0, energy: 1.0, state: animToState(p.anim), tint: REMOTE_TINT })
    }
    return out
  }

  const destroy = () => {
    channel.off?.('message', onMessage)
    room.off?.('peer:leave', onPeerLeave)
    remotePeers.clear()
  }

  console.log(`[Presence] ready — broadcasting as "${identity.name}" on channel "${CHANNEL}"`)
  return { broadcast, getRemotePlayers, getRemoteEntities, destroy }
}
