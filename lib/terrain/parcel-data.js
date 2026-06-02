/**
 * Parcel data manager — loads real land data from GenosDB
 * for the 6-face cube sphere grid overlay.
 *
 * Uses the db.map(query, callback) pattern with a self-contained realtime
 * subscription. World-data only — no blockchain/marketplace dependency.
 * @module terrain/parcel-data
 */

export const FACE_SIZE = 123
const TOTAL_PARCELS = FACE_SIZE * FACE_SIZE * 6 // 90,774

const REGION_NAMES = ['Frontera', 'Oriente', 'Posterior', 'Occidente', 'Boreal', 'Austral']

const TYPE_LABELS = [
  'Empty', 'Reserved', 'For Sale', 'Auction', 'For Rent', 'Owned',
]

const FILTER_MAP = { sale: 2, auction: 3, rent: 4, owned: 5 }

/**
 * Map marketplace status → GPU type enum
 * @param {string} status
 * @param {string} owner
 * @returns {number}
 */
const statusToType = (status, owner) => {
  if (status === 'sale') return 2
  if (status === 'auction') return 3
  if (status === 'rent') return 4
  if (owner) return 5
  return 0
}

/**
 * Check if a GenosDB record is a land asset (case-insensitive).
 * Skips activities (have .type) and offers.
 * @param {object} value
 * @returns {boolean}
 */
const isLandRecord = (value) => {
  if (!value) return false
  if (value.type || value.status === 'offer') return false
  return (value.category || '').toLowerCase() === 'land'
}

/**
 * Decode land coordinates from landId (v1.1.0 formula).
 * landId = LAND_ID_OFFSET + (x+10000)*100000 + (z+10000)
 * where x = face*1000 + localX, z = localY
 * @param {number} landId
 * @returns {{face: number, localX: number, localY: number}|null}
 */
const landIdToCoords = (landId) => {
  if (!landId || landId <= 10000) return null
  const temp = landId - 10000
  const z = (temp % 100000) - 10000
  const x = Math.floor(temp / 100000) - 10000
  const face = Math.floor(x / 1000)
  const localX = x % 1000
  const localY = z
  if (face < 0 || face >= 6 || localX < 0 || localX >= FACE_SIZE || localY < 0 || localY >= FACE_SIZE) return null
  return { face, localX, localY }
}

/**
 * Extract coordinates from a land record (explicit or derived from tokenId).
 * @param {object} value
 * @returns {{face: number, localX: number, localY: number}|null}
 */
const extractCoords = (value) =>
  value.coordinates ?? landIdToCoords(Number(value.tokenId ?? value.assetId))

/**
 * Create a parcel data manager backed by GenosDB.
 * Uses the same db.map(query, callback) pattern as Inventory/Explore.
 * @param {object} db - GenosDB instance
 * @returns {object} Parcel data API
 */
export const createParcelDataManager = (db) => {
  const allParcels = new Array(TOTAL_PARCELS)
  let filteredParcels = []
  const filteredSet = new Set()
  /** @type {Set<string>} Active parcel type filters — multi-select, all active by default */
  const activeTypes = new Set(['sale', 'auction', 'rent', 'owned'])
  /** @type {(() => void)|null} Teardown for the active realtime land subscription. */
  let landUnsubscribe = null

  // Initialize empty grid — all parcels start as type 0 (Empty)
  for (let face = 0; face < 6; face++)
    for (let ly = 0; ly < FACE_SIZE; ly++)
      for (let lx = 0; lx < FACE_SIZE; lx++) {
        const idx = face * FACE_SIZE * FACE_SIZE + ly * FACE_SIZE + lx
        allParcels[idx] = { face, localX: lx, localY: ly, type: 0, estateId: 0 }
      }

  /**
   * Apply a single land record to the grid
   * @param {string} id - GenosDB node ID
   * @param {object} value - Land data with coordinates
   */
  const applyLandRecord = (id, value) => {
    const coords = value?.coordinates
    if (!coords) return

    const { face = 0, localX, localY } = coords
    if (localX == null || localY == null) return

    const idx = face * FACE_SIZE * FACE_SIZE + localY * FACE_SIZE + localX
    if (idx < 0 || idx >= TOTAL_PARCELS) return

    const parcel = allParcels[idx]
    parcel.type = statusToType(value.status, value.owner)
    parcel.owner = value.owner ?? null
    parcel.price = value.price ?? null
    parcel.name = value.title ?? value.name ?? `F${face}:${localX},${localY}`
    parcel.tokenId = value.tokenId != null ? String(value.tokenId) : null
    parcel.nodeId = id
  }

  /**
   * Clear a parcel back to empty by nodeId
   * @param {string} nodeId - GenosDB node ID
   */
  const clearParcel = (nodeId) => {
    const match = allParcels.find(p => p.nodeId === nodeId)
    if (!match) return
    match.type = 0
    match.owner = null
    match.price = null
    match.name = null
    match.tokenId = null
    match.nodeId = null
  }

  /**
   * Reset all parcels to empty state
   */
  const resetAllParcels = () => {
    for (const p of allParcels) {
      p.type = 0
      p.owner = null
      p.price = null
      p.name = null
      p.tokenId = null
      p.nodeId = null
      p.estateId = 0
    }
  }

  /**
   * Process a single record: apply if land, ignore otherwise
   * @param {string} id
   * @param {object} value
   */
  const processRecord = (id, value) => {
    if (!isLandRecord(value)) return
    const coords = extractCoords(value)
    if (!coords) return
    const enriched = value.coordinates ? value : { ...value, coordinates: coords }
    applyLandRecord(id, enriched)
  }

  /**
   * Load land data from GenosDB AND subscribe to realtime updates.
   * Uses db.map(query, callback) — same pattern as Inventory/Explore views.
   */
  const loadAndSubscribe = async () => {
    const activeDb = db || window.db
    if (!activeDb) return

    if (landUnsubscribe) { landUnsubscribe(); landUnsubscribe = null }
    resetAllParcels()

    let reloadTimeout = null

    const { results, unsubscribe } = await activeDb.map(
      { query: {}, field: 'timestamp', order: 'desc', $limit: 99999 },
      ({ id, value, action }) => {
        if (action === 'removed') {
          clearParcel(id)
          applyFilter()
          window.dispatchEvent(new CustomEvent('landDataChanged'))
          return
        }

        if (!isLandRecord(value)) return

        const coords = extractCoords(value)
        if (!coords) return

        applyLandRecord(id, value.coordinates ? value : { ...value, coordinates: coords })
        applyFilter()

        clearTimeout(reloadTimeout)
        reloadTimeout = setTimeout(() => {
          window.dispatchEvent(new CustomEvent('landDataChanged'))
        }, 100)
      }
    )

    landUnsubscribe = unsubscribe

    for (const { id, value } of results) {
      processRecord(id, value)
    }

    applyFilter()
    window.dispatchEvent(new CustomEvent('landDataChanged'))
  }

  // ─── Filtering (multi-select) ───

  const applyFilter = () => {
    const allActive = activeTypes.size === 4
    const activeNums = new Set([...activeTypes].map(t => FILTER_MAP[t]))
    const gridLines = [30, 61, 92]
    const edgePositions = [0, 1, 121, 122]

    filteredSet.clear()

    if (allActive) {
      filteredParcels = allParcels
      for (const p of allParcels) filteredSet.add(`${p.face}:${p.localX},${p.localY}`)
    } else {
      filteredParcels = allParcels.filter(p => {
        const isGrid = gridLines.includes(p.localX) || gridLines.includes(p.localY)
        const isEdge = edgePositions.includes(p.localX) || edgePositions.includes(p.localY)
        const typeMatch = p.type === 0 || activeNums.has(p.type)
        const match = typeMatch || isGrid || isEdge
        if (match) filteredSet.add(`${p.face}:${p.localX},${p.localY}`)
        return match
      })
    }
  }

  /**
   * Set active parcel type filters (multi-select).
   * @param {Set<string>|string[]} types - Active types ('sale','auction','rent','owned')
   */
  const setActiveTypes = (types) => {
    activeTypes.clear()
    for (const t of types) activeTypes.add(t)
    applyFilter()
  }

  /**
   * Build a Float32Array for GPU storage buffer (all 90,774 parcels).
   * Fixed face-major row-major order so fragment shader can index directly.
   * Filtered-out parcels get type 0 (Empty, nearly invisible).
   * @returns {Float32Array}
   */
  const buildGPUBuffer = () => {
    const arr = new Float32Array(TOTAL_PARCELS * 4)
    const allActive = activeTypes.size === 4
    const activeNums = allActive ? null : new Set([...activeTypes].map(t => FILTER_MAP[t]))
    for (let i = 0; i < allParcels.length; i++) {
      const p = allParcels[i]
      arr[i * 4] = p.face * 1000 + p.localX
      arr[i * 4 + 1] = p.localY
      arr[i * 4 + 3] = p.estateId ?? 0

      if (allActive) {
        arr[i * 4 + 2] = p.type
      } else if (p.type === 0 || activeNums.has(p.type)) {
        arr[i * 4 + 2] = p.type
      } else if (filteredSet.has(`${p.face}:${p.localX},${p.localY}`)) {
        // Grid/edge line — show as grid (type 1), not its real type
        arr[i * 4 + 2] = p.type <= 1 ? p.type : 1
      } else {
        arr[i * 4 + 2] = 0
      }
    }
    return arr
  }

  /**
   * Get parcel at face coordinates (from picking).
   * @param {number} face
   * @param {number} localX
   * @param {number} localY
   * @returns {object|null}
   */
  const getParcelAt = (face, localX, localY) => {
    const key = `${face}:${localX},${localY}`
    if (!filteredSet.has(key)) return null
    const globalIdx = face * FACE_SIZE * FACE_SIZE + localY * FACE_SIZE + localX
    const match = allParcels[globalIdx]
    if (match) match.idx = globalIdx
    return match ?? null
  }

  /**
   * @param {number} face
   * @returns {string}
   */
  const getRegionName = (face) => REGION_NAMES[face] ?? 'Unknown'

  // Initialize filter (all parcels visible, all empty)
  applyFilter()

  return {
    get parcels() { return filteredParcels },
    get allParcels() { return allParcels },
    get filteredSet() { return filteredSet },
    get parcelCount() { return filteredParcels.length },
    get activeTypes() { return activeTypes },
    get allActive() { return activeTypes.size === 4 },
    loadAndSubscribe,
    updateParcel: (id, value) => { applyLandRecord(id, value); applyFilter() },
    clearParcelAt: (face, localX, localY) => {
      const idx = face * FACE_SIZE * FACE_SIZE + localY * FACE_SIZE + localX
      if (idx < 0 || idx >= TOTAL_PARCELS) return
      const p = allParcels[idx]
      p.type = 0; p.owner = null; p.price = null; p.name = null; p.tokenId = null; p.nodeId = null
      applyFilter()
    },
    setActiveTypes,
    buildGPUBuffer,
    getParcelAt,
    getRegionName,
    FACE_SIZE,
    TOTAL_PARCELS,
    TYPE_LABELS,
  }
}
