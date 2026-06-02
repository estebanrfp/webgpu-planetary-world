import { HUD_CONFIG } from '../config/index.js';

// CRITICAL: GlobalUniforms must match terrain.wgsl.js EXACTLY
export const nameplateShader = `
struct GlobalUniforms {
  viewProjection : mat4x4f,
  cameraPos : vec4f,
  sunDirection : vec4f,
  earthCenter : vec4f,
  whitePoint : vec4f,
  _reserved0 : vec4f,
  avatarSphere : vec4f,
  moonDir : vec4f,
  miscParams : vec4f,
}

struct NameplateInstance {
    worldPos : vec3f,
    alpha : f32,
    scale : f32,
    texIdx : f32,
    padding : vec2f,
}

@group(0) @binding(0) var<uniform> globals : GlobalUniforms;
@group(0) @binding(1) var<storage, read> instances : array<NameplateInstance>;
@group(0) @binding(2) var texArray : texture_2d_array<f32>;
@group(0) @binding(3) var texSampler : sampler;

struct VertexOutput {
    @builtin(position) position : vec4f,
    @location(0) uv : vec2f,
    @location(1) alpha : f32,
    @location(2) @interpolate(flat) texIdx : u32,
}

@vertex
fn vs_main(
    @builtin(vertex_index) vertexIndex : u32,
    @builtin(instance_index) instanceIdx : u32
) -> VertexOutput {
    let inst = instances[instanceIdx];
    let pos = inst.worldPos;
    
    if (inst.alpha <= 0.0) {
        var out : VertexOutput;
        out.position = vec4f(0.0, 0.0, -10.0, 1.0);
        out.alpha = 0.0;
        return out;
    }
    
    // Camera at origin, so toCamera = -pos
    var toCamera = -pos;
    let dist = length(toCamera);
    if (dist < 0.0001) {
        toCamera = vec3f(0.0, 0.0, 1.0);
    } else {
        toCamera = toCamera / dist;
    }

    // Spherical up from earthCenter - KEEP UPRIGHT (like old HUD)
    let worldUp = normalize(pos - globals.earthCenter.xyz);
    let rightVec = normalize(cross(worldUp, toCamera));
    // Use worldUp directly for upright appearance (not perpendicular to camera)
    let upVec = worldUp;

    var positions = array<vec2f, 6>(
        vec2f(-0.5, -0.5), vec2f(0.5, -0.5), vec2f(0.5, 0.5),
        vec2f(-0.5, -0.5), vec2f(0.5, 0.5), vec2f(-0.5, 0.5)
    );
    var uvs = array<vec2f, 6>(
        vec2f(0.0, 1.0), vec2f(1.0, 1.0), vec2f(1.0, 0.0),
        vec2f(0.0, 1.0), vec2f(1.0, 0.0), vec2f(0.0, 0.0)
    );

    let localPos = positions[vertexIndex];
    let aspectRatio = 1.0; // No stretching - preserve canvas proportions
    let scale = inst.scale * 0.85;
    // Match old HUD: shorter height (0.5 factor on Y)
    let worldPosition = pos + (rightVec * localPos.x * scale * aspectRatio) + (upVec * localPos.y * scale * 0.5);

    var out : VertexOutput;
    out.position = globals.viewProjection * vec4f(worldPosition, 1.0);
    out.uv = uvs[vertexIndex];
    out.alpha = inst.alpha;
    out.texIdx = u32(inst.texIdx);
    return out;
}

@fragment
fn fs_main(in : VertexOutput) -> @location(0) vec4f {
    let color = textureSample(texArray, texSampler, in.uv, in.texIdx);
    if (color.a < 0.01) { discard; }
    return vec4f(color.rgb, color.a * in.alpha);
}
`;

/**
 * Renders a single nameplate to a canvas with full features
 */
function renderNameplateToCanvas(ctx, name, status, accentColor, health, energy, xp, statusIcon) {
    const w = HUD_CONFIG.canvasWidth;
    const h = HUD_CONFIG.canvasHeight;
    
    // Clear
    ctx.clearRect(0, 0, w, h);
    
    // Background panel with rounded corners
    const margin = 3;
    const panelX = margin;
    const panelY = margin;
    const panelW = w - margin * 2;
    const panelH = h - margin * 2;
    const radius = 3;
    
    // Draw rounded rect background
    ctx.beginPath();
    ctx.roundRect(panelX, panelY, panelW, panelH, radius);
    ctx.fillStyle = 'rgba(40, 40, 40, 0.65)'; // Match UI panel background
    ctx.fill();
    
    // Top accent bar
    const barHeight = 3;
    ctx.beginPath();
    ctx.roundRect(panelX, panelY, panelW, barHeight, [radius, radius, 0, 0]);
    ctx.fillStyle = accentColor;
    ctx.fill();
    
    // Status icon (circle) - top right corner
    const iconRadius = 5;
    const iconX = panelX + panelW - iconRadius - 4;
    const iconY = panelY + barHeight + iconRadius + 4;
    
    // Icon colors based on state
    let iconColor;
    switch (statusIcon) {
        case 'online': iconColor = '#22dd44'; break;
        case 'busy': iconColor = '#dd4422'; break;
        case 'away': iconColor = '#ddaa22'; break;
        case 'offline': iconColor = '#666666'; break;
        default: iconColor = accentColor; break;
    }
    
    // Draw icon circle
    ctx.beginPath();
    ctx.arc(iconX, iconY, iconRadius, 0, Math.PI * 2);
    ctx.fillStyle = iconColor;
    ctx.fill();
    
    // Inner highlight
    ctx.beginPath();
    ctx.arc(iconX - 1, iconY - 1, iconRadius * 0.4, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
    ctx.fill();
    
    // Name text
    ctx.font = `bold ${HUD_CONFIG.style.fontSize}px ${HUD_CONFIG.style.fontFamily}`;
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(name, w / 2 - 5, panelY + barHeight + 10);
    
    // Status text
    ctx.font = `${HUD_CONFIG.style.statusFontSize}px ${HUD_CONFIG.style.fontFamily}`;
    ctx.fillStyle = 'rgba(180, 180, 180, 0.9)';
    ctx.fillText(status, w / 2 - 5, panelY + barHeight + 21);
    
    // Achievement badges row (emojis as trophies)
    const badges = ['🏆', '⭐', '🎯', '💎', '🔥', '🎖️'];
    const badgeCount = 1 + (name.charCodeAt(0) % 6); // 1-6 badges
    const badgeY = panelY + barHeight + 33;
    const badgeSpacing = 16;
    const totalBadgeWidth = badgeCount * badgeSpacing;
    const badgeStartX = (w - totalBadgeWidth) / 2 + badgeSpacing / 2;
    
    ctx.font = '12px serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (let i = 0; i < badgeCount; i++) {
        ctx.fillText(badges[i % badges.length], badgeStartX + i * badgeSpacing, badgeY);
    }
    
    // Three bars: Health, Energy, Experience
    const barH = 2;
    const barSpacing = 7;
    const labelWidth = 16;
    const barW = panelW - 10 - labelWidth;
    const barX = panelX + 5 + labelWidth;
    const startY = panelY + panelH - 24;
    
    // Bar labels style
    ctx.font = `bold 7px ${HUD_CONFIG.style.fontFamily}`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    
    // Bar 1: Health
    const bar1Y = startY;
    ctx.fillStyle = '#88cc88';
    ctx.fillText('HP', panelX + 5, bar1Y + barH / 2 + 1);
    
    ctx.fillStyle = 'rgba(60, 20, 20, 0.9)';
    ctx.beginPath();
    ctx.roundRect(barX, bar1Y, barW, barH, 1);
    ctx.fill();
    
    const healthW = barW * Math.max(0, Math.min(1, health));
    if (healthW > 0) {
        let healthColor;
        if (health > 0.6) healthColor = '#22cc55';
        else if (health > 0.3) healthColor = '#ddaa22';
        else healthColor = '#dd3333';
        ctx.fillStyle = healthColor;
        ctx.beginPath();
        ctx.roundRect(barX, bar1Y, healthW, barH, 1);
        ctx.fill();
    }
    
    // Bar 2: Energy
    const bar2Y = startY + barSpacing;
    ctx.fillStyle = '#88aaff';
    ctx.fillText('EN', panelX + 5, bar2Y + barH / 2 + 1);
    
    ctx.fillStyle = 'rgba(20, 30, 60, 0.9)';
    ctx.beginPath();
    ctx.roundRect(barX, bar2Y, barW, barH, 1);
    ctx.fill();
    
    const energyW = barW * Math.max(0, Math.min(1, energy));
    if (energyW > 0) {
        ctx.fillStyle = '#3399ff';
        ctx.beginPath();
        ctx.roundRect(barX, bar2Y, energyW, barH, 1);
        ctx.fill();
    }
    
    // Bar 3: Experience
    const bar3Y = startY + barSpacing * 2;
    ctx.fillStyle = '#cc88dd';
    ctx.fillText('XP', panelX + 5, bar3Y + barH / 2 + 1);
    
    ctx.fillStyle = 'rgba(40, 20, 60, 0.9)';
    ctx.beginPath();
    ctx.roundRect(barX, bar3Y, barW, barH, 1);
    ctx.fill();
    
    const xpW = barW * Math.max(0, Math.min(1, xp));
    if (xpW > 0) {
        ctx.fillStyle = '#aa55dd';
        ctx.beginPath();
        ctx.roundRect(barX, bar3Y, xpW, barH, 1);
        ctx.fill();
    }
}

export function createNameplateSystem(device, format, globalBuffer) {
    const MAX_INSTANCES = 64;
    
    // Canvas for rendering
    const canvas = document.createElement('canvas');
    canvas.width = HUD_CONFIG.canvasWidth;
    canvas.height = HUD_CONFIG.canvasHeight;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });

    const texture = device.createTexture({
        size: [HUD_CONFIG.canvasWidth, HUD_CONFIG.canvasHeight, MAX_INSTANCES],
        format: 'rgba8unorm',
        usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT
    });

    const sampler = device.createSampler({ magFilter: 'linear', minFilter: 'linear' });
    const instanceBuffer = device.createBuffer({
        size: MAX_INSTANCES * 32,
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST
    });

    const instanceData = new Float32Array(MAX_INSTANCES * 8);
    const shaderModule = device.createShaderModule({ code: nameplateShader, label: 'Nameplate Shader' });

    const pipeline = device.createRenderPipeline({
        label: 'Nameplate Pipeline',
        layout: 'auto',
        vertex: { module: shaderModule, entryPoint: 'vs_main' },
        fragment: {
            module: shaderModule,
            entryPoint: 'fs_main',
            targets: [{
                format,
                blend: {
                    color: { srcFactor: 'src-alpha', dstFactor: 'one-minus-src-alpha', operation: 'add' },
                    alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' }
                }
            }]
        },
        primitive: { topology: 'triangle-list' },
        depthStencil: { format: 'depth32float', depthWriteEnabled: false, depthCompare: 'greater' }
    });

    const bindGroup = device.createBindGroup({
        layout: pipeline.getBindGroupLayout(0),
        entries: [
            { binding: 0, resource: { buffer: globalBuffer } },
            { binding: 1, resource: { buffer: instanceBuffer } },
            { binding: 2, resource: texture.createView() },
            { binding: 3, resource: sampler }
        ]
    });

    // Track entity textures
    const entityTextures = new Map();
    let nextTexIdx = 0;

    function formatState(state) {
        switch (state) {
            case 0: return ''; // No text for idle
            case 1: return 'Caminando';
            case 2: return 'Corriendo';
            case 3: return 'Siguiendo';
            default: return '';
        }
    }

    function getStatusIcon(state) {
        switch (state) {
            case 0: return 'online';
            case 1: return 'away';
            case 2: return 'busy';
            default: return 'online';
        }
    }

    return {
        update(entities, cameraPos, earthCenter) {
            const time = performance.now();
            let visibleCount = 0;
            
            for (let i = 0; i < entities.length && visibleCount < MAX_INSTANCES; i++) {
                const ent = entities[i];
                const absPos = [ent.x, ent.y, ent.z];
                
                const dx = absPos[0] - cameraPos[0];
                const dy = absPos[1] - cameraPos[1];
                const dz = absPos[2] - cameraPos[2];
                const dist = Math.sqrt(dx*dx + dy*dy + dz*dz);

                if (dist > HUD_CONFIG.maxDistance) continue;
                
                let alpha = 1.0;
                // Far distance fade out
                if (dist > HUD_CONFIG.fadeStartDistance) {
                    alpha = 1.0 - (dist - HUD_CONFIG.fadeStartDistance) / (HUD_CONFIG.fadeEndDistance - HUD_CONFIG.fadeStartDistance);
                }
                
                // Near distance fade out (to avoid clipping/occluding camera)
                if (dist < HUD_CONFIG.minDistance) {
                    alpha *= (dist / HUD_CONFIG.minDistance);
                }
                
                // Sync with avatar visibility (fade when flying high)
                const entityVisibility = ent.visibility ?? 1.0;
                alpha *= entityVisibility;
                
                if (alpha <= 0.01) continue;

                // Calculate spherical up
                const toCenter = [
                    absPos[0] - earthCenter[0],
                    absPos[1] - earthCenter[1],
                    absPos[2] - earthCenter[2]
                ];
                const toCenterLen = Math.sqrt(toCenter[0]*toCenter[0] + toCenter[1]*toCenter[1] + toCenter[2]*toCenter[2]);
                const unitUp = [toCenter[0]/toCenterLen, toCenter[1]/toCenterLen, toCenter[2]/toCenterLen];

                // Apply height offset
                const hudAbsX = absPos[0] + unitUp[0] * HUD_CONFIG.heightOffset;
                const hudAbsY = absPos[1] + unitUp[1] * HUD_CONFIG.heightOffset;
                const hudAbsZ = absPos[2] + unitUp[2] * HUD_CONFIG.heightOffset;

                // Convert to relative (Floating Origin)
                const relX = hudAbsX - cameraPos[0];
                const relY = hudAbsY - cameraPos[1];
                const relZ = hudAbsZ - cameraPos[2];

                // Get or create texture index
                const entityKey = ent.name || `entity_${i}`;
                let texIdx = entityTextures.get(entityKey);
                if (texIdx === undefined) {
                    texIdx = nextTexIdx++;
                    entityTextures.set(entityKey, texIdx);
                }
                
                // Animated bar values
                const phase = i * 0.7;
                const speed1 = 0.0008 + (i % 5) * 0.0001;
                const speed2 = 0.0012 + (i % 7) * 0.00015;
                const speed3 = 0.0006 + (i % 3) * 0.0002;
                
                const health = ent.health ?? ((Math.sin(time * speed1 + phase) + 1) / 2);
                const energy = ent.energy ?? ((Math.sin(time * speed2 + phase + 1) + 1) / 2);
                const xp = ent.xp ?? ((Math.sin(time * speed3 + phase + 2) + 1) / 2);
                
                // Parse accent color
                const accentColor = ent.tint || '#4ff3ff';
                const status = formatState(ent.state);
                const statusIcon = getStatusIcon(ent.state);
                
                // Render nameplate to texture
                renderNameplateToCanvas(ctx, ent.name, status, accentColor, health, energy, xp, statusIcon);
                
                // Upload to texture array
                const imageData = ctx.getImageData(0, 0, HUD_CONFIG.canvasWidth, HUD_CONFIG.canvasHeight);
                device.queue.writeTexture(
                    { texture, origin: [0, 0, texIdx] },
                    imageData.data,
                    { bytesPerRow: HUD_CONFIG.canvasWidth * 4 },
                    [HUD_CONFIG.canvasWidth, HUD_CONFIG.canvasHeight, 1]
                );

                // Write instance data
                const offset = visibleCount * 8;
                instanceData[offset + 0] = relX;
                instanceData[offset + 1] = relY;
                instanceData[offset + 2] = relZ;
                instanceData[offset + 3] = alpha;
                instanceData[offset + 4] = HUD_CONFIG.baseScale; // Scale (10m - narrower)
                instanceData[offset + 5] = texIdx;

                visibleCount++;
            }
            
            if (visibleCount > 0) {
                device.queue.writeBuffer(instanceBuffer, 0, instanceData.subarray(0, visibleCount * 8));
            }
            return visibleCount;
        },
        
        render(passEncoder, visibleCount) {
            if (visibleCount === 0) return;
            passEncoder.setPipeline(pipeline);
            passEncoder.setBindGroup(0, bindGroup);
            passEncoder.draw(6, visibleCount);
        }
    };
}
