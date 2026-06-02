# Lighting & Shadows

Photometric constants (sun/moon intensity, night floor) and the 4-cascade shadow-map system.
← back to [index](./README.md).

---

## `lightingConfig.js` — photometrics

Shared light/color constants for all environment shaders. **Tune-here-only.**
**Source:** [`lib/config/lightingConfig.js`](../../lib/config/lightingConfig.js).

| Param | Default | Effect |
|---|---|---|
| `SOLAR_IRRADIANCE_BASE` | `[1.474, 1.850, 1.912]` | Solar constant (radiance) RGB — the sun's spectral color/strength. |
| `SUN_INTENSITY_TERRAIN` | `0.7` | Sunlight multiplier on terrain. |
| `SUN_INTENSITY_AVATAR` | `0.7` | Sunlight multiplier on avatars. |
| `SUN_INTENSITY_SPACE` | `10.0` | Sun intensity seen from space. |
| `LUMINANCE_WEIGHTS` | `[0.299, 0.587, 0.114]` | Rec.709 weights for grayscale/luminance. |
| `CLOUD_SHADOW_INTENSITY` | `0.1` | Cloud-shadow darkness (→ 0.0 = darker). |
| `NIGHT_AMBIENT_FLOOR` | `0.15` | Minimum ambient light at night — keeps the world readable in the dark. |

---

## `shadowConfig.js` — cascaded shadow maps

Four shadow cascades, each covering a larger radius at the same resolution, for crisp shadows near
the avatar and coarse shadows on distant mountains. All radii in km (Floating Origin).
**Source:** [`lib/config/shadowConfig.js`](../../lib/config/shadowConfig.js).

| Param | Default | Effect |
|---|---|---|
| `CASCADE_COUNT` | `4` | Number of cascades. |
| `MAP_SIZE` | `2048` | Shadow-map resolution per cascade (px). |
| `SCATTER_SHADOW_MAX_CASCADE` | `3` | Up to which cascade vegetation/rocks/palms cast shadows (3 = all). |
| `SPLIT_SCHEME` | `'practical'` | Cascade split method. |
| `SPLIT_LAMBDA` | `0.95` | Log↔linear blend (0.95 ≈ logarithmic, matches the radii). |

### Cascades (`CASCADES`)

| # | `radius` (km) | `nearClip` | `farClip` | Covers |
|---|---|---|---|---|
| 0 | `0.15` | -1.5 | 1.5 | Avatar detail (150 m). |
| 1 | `1.0` | -10 | 10 | Nearby terrain (1 km). |
| 2 | `4.0` | -40 | 40 | Hills & palms (4 km). |
| 3 | `10.0` | -100 | 100 | Mountains & distant scatter (10 km). |

### PCF softening (`PCF`)

| Param | Default | Effect |
|---|---|---|
| `SAMPLES` | `9` | 3×3 kernel taps (soft edges). |
| `BIAS_BASE` | `0.0003` | Base depth bias (acne vs peter-panning). |
| `BIAS_NORMAL_SCALE` | `0.0012` | Slope-scaled bias multiplier. |

> `calculateCascadeSplits(near, far)` derives the view-space split depths from `SPLIT_LAMBDA`.

---

← [index](./README.md) · related: [sky-atmosphere.md](./sky-atmosphere.md) (volumetric/cloud shadows) · [performance.md](./performance.md)
