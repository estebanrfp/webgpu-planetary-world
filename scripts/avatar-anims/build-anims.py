"""
Combine the Mixamo FBX clips in ./fbx into a single GLB animation set for the
avatar, mapping each filename to the engine animation name the state machine plays.

Then run bake-root-transform.mjs (the GLB still has the armature root transform on
a parent node, which the engine's FK ignores) — see README.md.

Run: /Applications/Blender.app/Contents/MacOS/Blender --background --python build-anims.py
"""
import bpy
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
FBX_DIR = os.path.join(HERE, 'fbx')
OUTPUT = os.path.join(HERE, '..', '..', 'assets', 'character', 'avatar-anims.glb')

# ── EDIT THIS to add animations ──────────────────────────────────────────────
# <FBX filename without .fbx> : <engine animation name>
# The engine name must match what CharacterSystem.updateAnimation() plays.
ANIM_NAMES = {
    'Idle': 'Idle',
    'Walking': 'Walk',
    'Running': 'Run',
    'Jump': 'Jump',
    'Flying': 'Floating',        # real Mixamo flight clip → played while flying (Q/C)
    'Falling Idle': 'Fall',      # airborne, not flying (descending)
    'Hard Landing': 'Land',      # brief impact pose on touchdown
    'Swimming': 'Swim',          # moving in water
    'Treading Water': 'TreadWater',  # idle in water
    'Sitting Idle': 'Sit',       # emote (toggle)
    'Standing Idle': 'Idle2',    # idle variant — varied per NPC so the crowd isn't in lockstep
    'Sad Idle': 'Idle3',         # idle variant
    'Standing Greeting': 'Greeting',  # occasional wave emote
    'Swing Dancing': 'Dance',    # occasional dance emote
}

bpy.ops.wm.read_factory_settings(use_empty=True)

fbx_files = sorted(f for f in os.listdir(FBX_DIR) if f.lower().endswith('.fbx'))
if not fbx_files:
    print('ERROR: no FBX in', FBX_DIR)
    sys.exit(1)
print('FBX:', fbx_files)

# Import each FBX, capture + rename its single action.
actions = {}
for fbx_file in fbx_files:
    name_key = os.path.splitext(fbx_file)[0]
    anim_name = ANIM_NAMES.get(name_key, name_key)

    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.delete()
    bpy.ops.import_scene.fbx(filepath=os.path.join(FBX_DIR, fbx_file))

    armature = next((o for o in bpy.context.scene.objects if o.type == 'ARMATURE'), None)
    if not armature or not armature.animation_data or not armature.animation_data.action:
        print('  WARNING: no animation in', fbx_file, '- skipped')
        continue

    action = armature.animation_data.action
    action.name = anim_name
    action.use_fake_user = True
    actions[anim_name] = action
    print(f'  {fbx_file} -> {anim_name} ({action.frame_range[0]:.0f}-{action.frame_range[1]:.0f})')

print('Collected:', list(actions.keys()))

# Rebuild a skeleton-only scene; push each action to its own NLA track.
# Base skeleton is PINNED to a canonical 33-bone Mixamo rig (matches avatar-rig.glb). Never use
# fbx_files[0] (alphabetical) as the base — a new clip with a non-standard rest pose or extra
# finger bones would hijack it and break every clip (e.g. 'Breathing Idle' had Hips at z=31, not 0).
BASE_FBX = 'Idle.fbx' if 'Idle.fbx' in fbx_files else fbx_files[0]
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete()
bpy.ops.import_scene.fbx(filepath=os.path.join(FBX_DIR, BASE_FBX))

armature = next((o for o in bpy.context.scene.objects if o.type == 'ARMATURE'), None)
if not armature:
    print('ERROR: no armature')
    sys.exit(1)

for child in list(armature.children):
    bpy.data.objects.remove(child, do_unlink=True)
for mesh in list(bpy.data.meshes):
    bpy.data.meshes.remove(mesh)

# Mixamo FBX is in cm; the avatar GLB is in metres. The bake step folds this into
# the bone tracks, but set it here so the standalone GLB is also ~correct.
armature.scale = (0.01, 0.01, 0.01)

if not armature.animation_data:
    armature.animation_data_create()
for track in list(armature.animation_data.nla_tracks):
    armature.animation_data.nla_tracks.remove(track)
for anim_name, action in actions.items():
    track = armature.animation_data.nla_tracks.new()
    track.name = anim_name
    track.strips.new(anim_name, int(action.frame_range[0]), action).name = anim_name
if 'Idle' in actions:
    armature.animation_data.action = actions['Idle']

bpy.ops.object.select_all(action='DESELECT')
armature.select_set(True)
bpy.context.view_layer.objects.active = armature

os.makedirs(os.path.dirname(OUTPUT), exist_ok=True)
bpy.ops.export_scene.gltf(
    filepath=OUTPUT, export_format='GLB', use_selection=True,
    export_animations=True, export_nla_strips=True, export_skins=True,
)
print(f'\nExported {OUTPUT} ({os.path.getsize(OUTPUT) / 1024:.0f} KB)')
print('NOW RUN: node scripts/avatar-anims/bake-root-transform.mjs')
