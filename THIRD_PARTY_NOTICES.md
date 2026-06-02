# Third-Party Notices

OVGrid bundles or derives from the third-party components below. Their licenses
apply to those components; the rest of OVGrid is under the project `LICENSE.md`.

## Code / binaries

| Component | Where | License | Holder |
|---|---|---|---|
| Basis Universal transcoder | `assets/wasm/basis_transcoder.wasm` | Apache-2.0 | Binomial LLC / Khronos |
| Draco mesh decoder | `assets/wasm/draco_decoder.wasm` | Apache-2.0 | Google LLC |
| KTX2 / Draco loaders (adapted) | `lib/textures/`, `lib/avatar/` | MIT | three.js authors |

## Assets

| Asset | Where | License | Source |
|---|---|---|---|
| PBR surface textures (Grass001, Rock035, Snow010A, Sand, Water) | `assets/textures/sources-textures/` | CC0 (public domain) | ambientCG.com |
| Character animations (baked) | `assets/character/avatar-anims.glb` | Mixamo license (use in projects permitted) | Adobe Mixamo |

> The raw Mixamo `.fbx` sources are **not** redistributed (excluded via
> `.gitignore`) because Mixamo's terms allow using the animations in a project
> but not redistributing the original files. Download your own from
> [mixamo.com](https://www.mixamo.com) to regenerate `avatar-anims.glb` — see
> `scripts/avatar-anims/`.

## Procedurally generated content

All in-world geometry — terrain, ocean, vegetation (trees, palms, plants),
rocks, clouds — is **generated procedurally on the GPU**. No third-party 3D
models are shipped (the only model asset is the baked Mixamo avatar animation
above). The reference models originally used to author the procedural shapes are
not part of the repository.

## Audio

Sound effects and ambient loops under `assets/sounds/` (rain, snow, wind,
flight, etc.) are used under licenses cleared by the maintainer. Some additional
sounds are streamed at runtime from the project's
[`ovgrid-assets`](https://github.com/estebanrfp/ovgrid-assets) repository.
