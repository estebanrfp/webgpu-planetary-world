# Avatar animations pipeline

How the avatar's animation clips are built, and how to **add a new one** end-to-end.
The avatar mesh is voxel (built at runtime, see `lib/avatar/voxel-builder.js`) but
it is rigged to the standard **Mixamo skeleton**, so any Mixamo clip works.

```
Mixamo .fbx  ──Blender──▶  avatar-anims.glb  ──bake──▶  avatar-anims.glb  ──▶  engine
 (this folder/fbx)        (Idle/Walk/Run/…)   (fix coords)   (final)        CharacterSystem
```

- **Skeleton (rig):** `assets/character/avatar-rig.glb` — 33 `mixamorig:*` bones,
  Y-up, 1.8 m, feet at origin (`AVATAR_CONFIG.url`). Only its skeleton is used.
- **Animations:** `assets/character/avatar-anims.glb` (`AVATAR_CONFIG.animationsUrl`),
  built from the FBX in `./fbx`.
- **Engine reads them** in `lib/systems/CharacterSystem.js` → `init()` loads the
  GLB, retargets bone names (strips the `mixamorig:` prefix), and
  `updateAnimation()` is the state machine that picks which clip plays.

## Current clips & what plays them

`updateAnimation()` picks one per frame in this priority order:

| Clip | Plays when | Signal source |
|---|---|---|
| `Sit` | grounded, idle, **X** pressed (toggle, cancels on move) | `movementState.sit` (InputManager `xTriggered` → mainPlanet) |
| `Swim` / `TreadWater` | in water, moving / idle | `movementState.inWater` (`seaLevelAltitude ≤ waterDetectionThreshold`) |
| `Jump` | jumping (one-shot) | physics |
| `Floating` | actively flying (Q ascend / C descend) | `isFlying` |
| `Fall` | airborne, not flying (descending/drifting) | `actuallyAirborne` (debounced) |
| `Land` | brief, on a hard touchdown (one-shot ~0.45 s) | internal `landTimer` |
| `Run` / `Walk` | moving + Shift / moving | physics |
| `Idle` | default / any missing clip falls back here | — |

To wire a **new** clip you add a branch here under the right condition; clips that
need a state that doesn't exist yet (e.g. emotes) also need an input/UI to set it.

## Requirements

- **Blender** (the scripts use `/Applications/Blender.app/Contents/MacOS/Blender`).
- **node** (for the bake step).

## Add a new animation (worked example: a "Wave" emote)

1. **Get the clip from Mixamo.** Upload nothing — search the animation library
   (e.g. "Waving"), then **Download** with:
   - Format: **FBX Binary (.fbx)**
   - Skin: **Without Skin** (we only need the skeleton + animation)
   - Frames per Second: 30, Keyframe Reduction: none
   - "In Place" if the clip otherwise drifts (locomotion is driven by the engine,
     not by root motion). Stationary emotes don't need it.

2. **Drop the file** into `scripts/avatar-anims/fbx/` → `Waving.fbx`.

3. **Map the filename to an engine name** in `build-anims.py`:
   ```python
   ANIM_NAMES = {
       'Idle': 'Idle', 'Walking': 'Walk', 'Running': 'Run', 'Jump': 'Jump',
       'Flying': 'Floating', 'Falling Idle': 'Fall', 'Hard Landing': 'Land',
       'Swimming': 'Swim', 'Treading Water': 'TreadWater', 'Sitting Idle': 'Sit',
       'Waving': 'Wave',   # ← add this
   }
   ```

4. **Build + bake** (from the repo root):
   ```bash
   /Applications/Blender.app/Contents/MacOS/Blender --background \
     --python scripts/avatar-anims/build-anims.py
   node scripts/avatar-anims/bake-root-transform.mjs
   ```
   This rewrites `assets/character/avatar-anims.glb` with all clips, including
   `Wave`. (Both steps are needed — see *How it works* below.)

5. **Play it from the state machine** in `lib/systems/CharacterSystem.js` →
   `updateAnimation()`. Add a branch in the priority chain, e.g. (after `Sit`):
   ```js
   if (sit && isGrounded && !isMoving && !inWater) {
     targetAnim = 'Sit';
   } else if (wave && isGrounded && !isMoving) {   // ← new emote
     targetAnim = 'Wave';
   } else if (inWater) {
     targetAnim = isMoving ? 'Swim' : 'TreadWater';
   } // … Jump / Floating / Fall / Land / Run / Walk
   ```
   First match wins; a missing clip falls back to `Idle`.

   An **emote needs a trigger.** Stateful poses like `Sit` are wired through a key:
   `InputManager.js` exposes `xTriggered`, `mainPlanet.js` toggles `sitToggle` and
   passes it on `movementState.sit`. Copy that pattern for `Wave` (a new key, or a
   future emotes menu). Clips driven by physics (`Fall`, `Land`, `Swim`) only need
   the branch — the signals already exist.

6. **Test** — refresh `npm run dev`. No engine rebuild needed for the GLB.

That's it. The same GLB also drives the NPC roster (`NpcSystem`), so new clips are
available there too.

## How it works (and why the two steps)

Blender's glTF exporter leaves two things on a parent **Armature** node that the
engine's animation FK *ignores* (it starts the forward kinematics at the root
joint, `Hips`):

- a **0.01 scale** (Mixamo FBX is in centimetres; the avatar is in metres), and
- a **Z-up → Y-up rotation**.

`bake-root-transform.mjs` folds that parent transform straight into the bone
animation tracks:

- every bone's local **translation** is scaled ×0.01 (cm→m); the **Hips** also
  gets the up-axis rotation,
- bone **scale** is left ~1 (scaling it would shrink the whole skeleton 100× →
  invisible avatar),
- only the **Hips rotation** is rebased (child rotations are already correct),
- each keyframe accessor is baked **once** (glTF dedupes identical data, incl. the
  bind `Layer0` clip).

Without the bake the avatar either explodes off-screen (cm coords) or shrinks to a
dot. The numbers to sanity-check after a build+bake: the **Hips** translation Y
should be **~1.0** (hip height in metres), not ~−100.

> Unrelated but worth knowing: the engine clamps animation sampling to `[0,1]`
> (`lib/avatar/animation-system.js`) so clips whose keyframes don't start exactly
> at t=0 (Mixamo often starts at frame 1) don't extrapolate and tear the mesh
> apart at the loop point.

## Files

| File | Role |
|---|---|
| `fbx/*.fbx` | Source Mixamo clips (one animation each) |
| `build-anims.py` | Blender: combine FBX → `assets/character/avatar-anims.glb` |
| `bake-root-transform.mjs` | Fix the GLB coordinate space (run after the build) |
| `../../assets/character/avatar-anims.glb` | The committed output the engine loads |
