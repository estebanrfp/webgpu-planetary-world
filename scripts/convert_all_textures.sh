#!/bin/bash

# Define standardized conversion parameters
BASE_DIR="assets/textures/sources-textures"
WIDTH=1024
HEIGHT=1024

function convert_set() {
    local folder=$1
    local name=$2
    local albedo_pattern=$3
    local normal_pattern=$4
    
    echo "Processing $name in $folder..."
    
    # Identify albedo file
    local albedo_file=$(find "$folder" -maxdepth 1 -name "$albedo_pattern" | head -n 1)
    # Identify normal file (preferring NormalGL, fallback to NormalDX or generic Normal)
    local normal_file=$(find "$folder" -maxdepth 1 -name "*NormalGL.png" -o -name "*_NormalGL.png" -o -name "*_NRM.jpg" -o -name "*_normal.png" -o -name "*_NormalDX.png" | head -n 1)

    if [[ -n "$albedo_file" ]]; then
        echo "  Converting Albedo: $albedo_file"
        toktx --t2 --encode etc1s --clevel 1 --assign_oetf srgb "${folder}/albedo.ktx2" "$albedo_file"
    else
        echo "  WARNING: No albedo found for $name"
    fi

    if [[ -n "$normal_file" ]]; then
        echo "  Converting Normal: $normal_file"
        toktx --t2 --encode etc1s --clevel 1 --assign_oetf linear "${folder}/normal.ktx2" "$normal_file"
    else
        echo "  WARNING: No normal found for $name"
    fi
}

# 1. Grass
convert_set "$BASE_DIR/grass/Grass001_1K-PNG" "Grass001" "*_Color.png"
convert_set "$BASE_DIR/grass/Grass004_1K-PNG" "Grass004" "*_Color.png"
convert_set "$BASE_DIR/grass/Grass008_1K-PNG" "Grass008" "*_Color.png"
convert_set "$BASE_DIR/grass/Ground037_1K-PNG" "Ground037" "*_Color.png"

# 2. Rock
convert_set "$BASE_DIR/rock/Rock035_1K-PNG" "Rock035" "*_Color.png"
convert_set "$BASE_DIR/rock/Rock037_1K-PNG" "Rock037" "*_Color.png"
convert_set "$BASE_DIR/rock/Rock025_1K-PNG" "Rock025" "*_Color.png"
convert_set "$BASE_DIR/rock/Rock058_1K-PNG" "Rock058" "*_Color.png"
convert_set "$BASE_DIR/rock/Rock026_1K-PNG" "Rock026" "*_Color.png"
convert_set "$BASE_DIR/rock/Rocks001_1K-PNG" "Rocks001" "*_Color.png"
convert_set "$BASE_DIR/rock/Rocks011_1K-PNG" "Rocks011" "*_Color.png"
convert_set "$BASE_DIR/rock/Rocks012_1K-PNG" "Rocks012" "*_Color.png"
convert_set "$BASE_DIR/sand/Rocks019_1K-PNG" "Rocks019" "*_Color.png"
convert_set "$BASE_DIR/rock/Ground067_1K-PNG" "Ground067" "*_Color.png"
convert_set "$BASE_DIR/rock/Ground068_1K-PNG" "Ground068" "*_Color.png"

# 3. Snow
convert_set "$BASE_DIR/snow/Snow010A_1K-PNG" "Snow010A" "*_Color.png"
convert_set "$BASE_DIR/snow/Snow008A_1K-PNG" "Snow008A" "*_Color.png"

# 4. Sand & Ground
convert_set "$BASE_DIR/sand/sand_002" "Sand002" "*_COLOR.jpg"
convert_set "$BASE_DIR/sand/stylized_Sand_002_ambientOcclusion" "SandStylized" "*_basecolor.png"
convert_set "$BASE_DIR/sand/Gravel014_1K-PNG" "Gravel014" "*_Color.png"
convert_set "$BASE_DIR/sand/Ground033_1K-PNG" "Ground033" "*_Color.png"
convert_set "$BASE_DIR/sand/Ground055L_1K-PNG" "Ground055L" "*_Color.png"
convert_set "$BASE_DIR/sand/Ground061_1K-PNG" "Ground061" "*_Color.png"
convert_set "$BASE_DIR/sand/Ground062S_1K-PNG" "Ground062S" "*_Color.png"
convert_set "$BASE_DIR/sand/Ground089_1K-PNG" "Ground089" "*_Color.png"

echo "Mass conversion complete."
