# Performance & Systems

Startup quality profiles and the marketplace/network tuning. ← back to [index](./README.md).

---

## `performanceProfiles.js` — quality profiles

Hardware-aware bundles applied at startup (no UI). Force one with `?profile=low` or
`?profile=default` in the URL. **Source:** [`lib/config/performanceProfiles.js`](../../lib/config/performanceProfiles.js).

| Profile | `scatterEnabled` | `volumetricShadows` | `cloudShadows` |
|---|---|---|---|
| `default` | `true` | `true` | `true` |
| `low` | `false` | `false` | `false` |

- `detectPerformanceProfile()` — resolves the profile (URL override → `default`).
- `applyPerformanceProfile(key, { planetRenderer, env })` — applies it live: toggles scatter bypass
  and the `env.volumetricShadowsEnabled` / `env.cloudShadowsEnabled` flags.

To add a tier, add an entry to `PERFORMANCE_PROFILES` and its key to `PROFILE_KEYS`.

---

## `marketplaceConfig.js` — `MARKETPLACE_CONFIG`

Tuning for the on-chain marketplace UI, caching, batching and network behaviour (Polygon).
**Source:** [`lib/config/marketplaceConfig.js`](../../lib/config/marketplaceConfig.js).

| Group | Fields (defaults) | Effect |
|---|---|---|
| **Pagination** | `ITEMS_PER_PAGE 12`, `VISIBLE_PAGES 5`, `SEARCH_DEBOUNCE_MS 200` | List paging & search. |
| **Caching (TTL ms)** | `CACHE_TTL 30000`, `OWNED_ASSETS_CACHE_TTL 15000`, `ACTIVITY_CACHE_TTL 15000`, `STATS_CACHE_TTL 60000`, `PRICE_HISTORY_CACHE_TTL 120000`, `FLOOR_PRICES_CACHE_TTL 60000` | How long fetched data is reused. |
| **Batching** | `BALANCE_CHECK_BATCH_SIZE 20`, `LISTING_FETCH_BATCH_SIZE 10`, `BATCH_DELAY_MS 100` | Multicall batching. |
| **Network** | `ACTIVITY_BLOCK_RANGE 45000`, `RPC_TIMEOUT_MS 5000`, `TX_WAIT_TIMEOUT_MS 60000`, `RETRY_CONFIG` | RPC limits & retries. |
| **Royalties / fees** | `ROYALTY_MIN/MAX_PERCENT 0/25`, `MARKETPLACE_FEE_PERCENT 2.5`, `MIN_BID_INCREMENT_PERCENT 1`, `MAX_FEE_BASIS_POINTS 1000` | Economic bounds. |
| **Durations (s)** | `SECONDS_PER_HOUR 3600`, `SECONDS_PER_DAY 86400`, `DEFAULT_RENTAL_DAYS 1`, `AUCTION_DURATIONS {…}`, `DEFAULT_AUCTION_DURATION 86400` | Rental/auction time units (seconds — matches the contract). |
| **Validation / misc** | `ETH_ADDRESS_LENGTH 42`, `MAX_BUNDLE_NAME_LENGTH 32`, `VISIBILITY_THRESHOLD 0.1`, `ERROR_CODES {…}` | Input validation & decoded contract error codes. |

> Durations are stored in **seconds** end-to-end (UI decodes to days for display) — see the project
> README/memory on the duration convention.

---

← [index](./README.md) · related: [sky-atmosphere.md](./sky-atmosphere.md) · [vegetation.md](./vegetation.md) · [lighting-shadows.md](./lighting-shadows.md)
