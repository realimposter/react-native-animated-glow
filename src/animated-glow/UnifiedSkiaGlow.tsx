import React, { FC, useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import { Canvas, Fill, Skia, Shader, type SkRuntimeEffect } from "@shopify/react-native-skia";
import Animated, { useDerivedValue, useFrameCallback, useSharedValue, type SharedValue } from 'react-native-reanimated';
import type { Layout, GlowConfig, RGBColor, GlowPlacement } from './types';
import { 
    interpolateNumber, 
    interpolateNumberArray, 
    getGlowSizeVec4Worklet, 
    interpolateColorArrayWorklet,
    getGradientColorWorklet,
    parseColorToRgbaWorklet,
    interpolateRgbaWorklet,
} from './helpers';

const MAX_SKIA_LAYERS = 10;

// Color uniforms and color-math intermediates use half-precision (half4
// and half) instead of vec4/float. SkSL doesn't accept GLSL's
// `precision mediump float;` directives - the keyword is reserved but
// unimplemented - so half-typed declarations are the SkSL-native way to
// drop color paths to mediump. Geometry uniforms (resolution, rectSize,
// cornerRadius, borderWidth, glowSizes, layerProgress, etc.) stay as
// float because distance/perimeter math needs highp accuracy.
//
// Why this matters: Samsung devices (verified S21 Ultra Snapdragon 888 /
// Adreno 660; reproduces on other modern Samsung models) ship a modified
// Adreno driver that promotes vec4/float color arithmetic to highp,
// where every other tested driver (stock Adreno on Pixel, Apple Metal,
// Mali, older Adreno builds) defaults the same color paths to mediump.
// Highp color math runs ~5x slower per fragment on Samsung's driver.

// DON'T undo this. Changing color types back to vec4 reintroduces the
// Samsung freeze. Half-precision color typing is load-bearing.
//
// Two more Samsung Adreno fixes are also load-bearing in this shader:
//
//  1. `getGradientColor` uses a FORWARD loop with a "found" boolean
//     flag (no break). Three forms have been tried, two of them buggy:
//       (a) original reverse-no-break: crashes Samsung S25 / Adreno
//           750 at link/first-draw time (verified, reproduces on
//           other modern Samsung models).
//       (b) forward + explicit break: compiles cleanly on Samsung
//           S25 but produces visible vertical-line artifacts on the
//           glow output on other Adreno builds — divergent
//           wavefronts (different fragments break at different
//           iterations) miscompile in combination with the array
//           indexing inside the body.
//       (c) shipping form: forward loop with "found" boolean —
//           UNIFORM iteration count (always 7), single conditional
//           write gated by the flag, no break. Same first-match
//           semantics as (b) without the divergence.
//     Don't switch back to (a) or (b).
//
//  2. Layer rendering is UNROLLED into 7 inline blocks instead of a
//     `for(i<10)` loop with an 11-way `if/else` chain to "dynamically
//     index" into u_colors_N. SKSL doesn't allow dynamic indexing of
//     uniform arrays, so the if/else chain was the standard workaround,
//     but on Samsung Adreno's compiler it combines with the dynamic loop
//     to hit register-spill / branch-divergence pathology and runs at
//     ~1 fps. Unrolled inline blocks compile to straight-line GPU code
//     that Samsung Adreno executes at 60 fps (and is at least as fast
//     on every other GPU we've tested — iOS Metal, stock Adreno on
//     Pixel, Mali). Tradeoff: presets with 8+ layers only render layers
//     1-7. To support more, paste more inline blocks below — the pattern
//     is mechanical.
const sksl = `
  uniform vec2 u_resolution;
  uniform vec2 u_rectSize;
  uniform float u_cornerRadius;
  uniform half4 u_backgroundColor;

  uniform float u_borderWidth;
  uniform float u_borderProgress;

  uniform int u_layerCount;
  uniform float u_coverage[${MAX_SKIA_LAYERS}];
  uniform vec4 u_glowSizes[${MAX_SKIA_LAYERS}];
  uniform float u_opacity[${MAX_SKIA_LAYERS}];
  uniform float u_relativeOffset[${MAX_SKIA_LAYERS}];
  uniform float u_layerProgress[${MAX_SKIA_LAYERS}];

  uniform half4 u_colors_0[8];
  uniform half4 u_colors_1[8];
  uniform half4 u_colors_2[8];
  uniform half4 u_colors_3[8];
  uniform half4 u_colors_4[8];
  uniform half4 u_colors_5[8];
  uniform half4 u_colors_6[8];
  uniform half4 u_colors_7[8];
  uniform half4 u_colors_8[8];
  uniform half4 u_colors_9[8];
  uniform half4 u_colors_10[8];

  uniform float u_masterOpacity;
  uniform float u_placements[${MAX_SKIA_LAYERS}];
  uniform float u_isBorderAnimated;

  const float PI = 3.14159265359;

  float smoothCubic(float t) { return t * t * (3.0 - 2.0 * t); }

  // Forward iteration with a "found" flag (Samsung Adreno fix #1 — see
  // top-of-file comment for the three-form history). Uniform iteration
  // count (always 7), single conditional write gated by the flag, no
  // break — works on both Samsung S25 and other Adreno builds where the
  // forward+break form caused vertical-line artifacts.
  // DO NOT switch to either of the two predecessor forms.
  half4 getGradientColor(float progress, half4 colors[8]) {
    float t = progress * 7.0;
    half4 finalColor = colors[7];
    bool found = false;
    for (int i = 0; i <= 6; i++) {
      if (!found && t < float(i + 1)) {
        finalColor = mix(colors[i], colors[i + 1], half(t - float(i)));
        found = true;
      }
    }
    return finalColor;
  }

  float sdfRoundedBox(vec2 p, vec2 b, float r) {
    vec2 q = abs(p) - b + r;
    return min(max(q.x, q.y), 0.0) + length(max(q, 0.0)) - r;
  }

  float calculatePerimeterProgress(vec2 p, vec2 b, float r) {
    float w = b.x - r;
    float h = b.y - r;
    float c = PI * r / 2.0;
    float H = 2.0 * w;
    float V = 2.0 * h;
    float s0_end = c;
    float s1_end = s0_end + H;
    float s2_end = s1_end + c;
    float s3_end = s2_end + V;
    float s4_end = s3_end + c;
    float s5_end = s4_end + H;
    float s6_end = s5_end + c;
    float perimeter = s6_end + V;
    if (perimeter == 0.0) return 0.0;
    float dist = 0.0;
    if (p.x < -w) {
      if (p.y < -h) {
        vec2 corner_p = p - vec2(-w, -h);
        dist = c * ((atan(corner_p.y, corner_p.x) + PI) / (PI / 2.0));
      } else if (p.y > h) {
        vec2 corner_p = p - vec2(-w, h);
        dist = s5_end + c * ((atan(corner_p.y, corner_p.x) - PI / 2.0) / (PI / 2.0));
      } else {
        dist = s6_end + (h - p.y);
      }
    } else if (p.x > w) {
      if (p.y < -h) {
        vec2 corner_p = p - vec2(w, -h);
        dist = s1_end + c * ((atan(corner_p.y, corner_p.x) + PI / 2.0) / (PI / 2.0));
      } else if (p.y > h) {
        vec2 corner_p = p - vec2(w, h);
        dist = s3_end + c * (atan(corner_p.y, corner_p.x) / (PI / 2.0));
      } else {
        dist = s2_end + (h + p.y);
      }
    } else {
      if (p.y < 0.0) {
        dist = s0_end + (w + p.x);
      } else {
        dist = s4_end + (w - p.x);
      }
    }
    return dist / perimeter;
  }

  float getInterpolatedSize(float progress, vec4 sizes) {
    float segLen = 1.0 / 3.0;
    if (progress < segLen) return mix(sizes.x, sizes.y, smoothCubic(progress / segLen));
    if (progress < 2.0 * segLen) return mix(sizes.y, sizes.z, smoothCubic((progress - segLen) / segLen));
    return mix(sizes.z, sizes.w, smoothCubic((progress - 2.0 * segLen) / segLen));
  }

  float gaussian(float x, float sigma) {
    if (sigma <= 0.0) return 0.0;
    return exp(-(pow(x, 2.0)) / (2.0 * pow(sigma, 2.0)));
  }

  // Layer rendering is UNROLLED (Samsung Adreno fix #2 — see top-of-file
  // comment). 7 inline blocks below, one per layer 0..6. Each accesses
  // u_colors_N directly without an if/else picker. DO NOT collapse back
  // into a for(i<10) loop.
  half4 main(vec2 fragCoord) {
    vec2 p = fragCoord - u_resolution * 0.5;
    vec2 b = u_rectSize * 0.5;
    float d = sdfRoundedBox(p, b, u_cornerRadius);
    float perimeterProgress = calculatePerimeterProgress(p, b, u_cornerRadius);

    half4 behindAcc = half4(0.0);
    half4 frontAcc = half4(0.0);

    // Layer 0 (uses u_colors_1).
    if (u_opacity[0] > 0.0 && u_coverage[0] > 0.0) {
      float animatedProgress = fract(perimeterProgress - u_layerProgress[0] + u_relativeOffset[0]);
      if (animatedProgress <= u_coverage[0]) {
        float segmentProgress = animatedProgress / u_coverage[0];
        float glowSize = getInterpolatedSize(segmentProgress, u_glowSizes[0]);
        float halo = gaussian(abs(d), glowSize);
        if (d > 0.0 && u_placements[0] == 1.0) halo = 0.0;
        if (halo > 0.0) {
          half4 color = getGradientColor(segmentProgress, u_colors_1);
          half4 glowComponent = color * half(halo) * half(u_opacity[0]);
          if (u_placements[0] == 0.0) behindAcc += glowComponent;
          else frontAcc += glowComponent;
        }
      }
    }

    // Layer 1 (uses u_colors_2).
    if (u_opacity[1] > 0.0 && u_coverage[1] > 0.0) {
      float animatedProgress = fract(perimeterProgress - u_layerProgress[1] + u_relativeOffset[1]);
      if (animatedProgress <= u_coverage[1]) {
        float segmentProgress = animatedProgress / u_coverage[1];
        float glowSize = getInterpolatedSize(segmentProgress, u_glowSizes[1]);
        float halo = gaussian(abs(d), glowSize);
        if (d > 0.0 && u_placements[1] == 1.0) halo = 0.0;
        if (halo > 0.0) {
          half4 color = getGradientColor(segmentProgress, u_colors_2);
          half4 glowComponent = color * half(halo) * half(u_opacity[1]);
          if (u_placements[1] == 0.0) behindAcc += glowComponent;
          else frontAcc += glowComponent;
        }
      }
    }

    // Layer 2 (uses u_colors_3).
    if (u_opacity[2] > 0.0 && u_coverage[2] > 0.0) {
      float animatedProgress = fract(perimeterProgress - u_layerProgress[2] + u_relativeOffset[2]);
      if (animatedProgress <= u_coverage[2]) {
        float segmentProgress = animatedProgress / u_coverage[2];
        float glowSize = getInterpolatedSize(segmentProgress, u_glowSizes[2]);
        float halo = gaussian(abs(d), glowSize);
        if (d > 0.0 && u_placements[2] == 1.0) halo = 0.0;
        if (halo > 0.0) {
          half4 color = getGradientColor(segmentProgress, u_colors_3);
          half4 glowComponent = color * half(halo) * half(u_opacity[2]);
          if (u_placements[2] == 0.0) behindAcc += glowComponent;
          else frontAcc += glowComponent;
        }
      }
    }

    // Layer 3 (uses u_colors_4).
    if (u_opacity[3] > 0.0 && u_coverage[3] > 0.0) {
      float animatedProgress = fract(perimeterProgress - u_layerProgress[3] + u_relativeOffset[3]);
      if (animatedProgress <= u_coverage[3]) {
        float segmentProgress = animatedProgress / u_coverage[3];
        float glowSize = getInterpolatedSize(segmentProgress, u_glowSizes[3]);
        float halo = gaussian(abs(d), glowSize);
        if (d > 0.0 && u_placements[3] == 1.0) halo = 0.0;
        if (halo > 0.0) {
          half4 color = getGradientColor(segmentProgress, u_colors_4);
          half4 glowComponent = color * half(halo) * half(u_opacity[3]);
          if (u_placements[3] == 0.0) behindAcc += glowComponent;
          else frontAcc += glowComponent;
        }
      }
    }

    // Layer 4 (uses u_colors_5).
    if (u_opacity[4] > 0.0 && u_coverage[4] > 0.0) {
      float animatedProgress = fract(perimeterProgress - u_layerProgress[4] + u_relativeOffset[4]);
      if (animatedProgress <= u_coverage[4]) {
        float segmentProgress = animatedProgress / u_coverage[4];
        float glowSize = getInterpolatedSize(segmentProgress, u_glowSizes[4]);
        float halo = gaussian(abs(d), glowSize);
        if (d > 0.0 && u_placements[4] == 1.0) halo = 0.0;
        if (halo > 0.0) {
          half4 color = getGradientColor(segmentProgress, u_colors_5);
          half4 glowComponent = color * half(halo) * half(u_opacity[4]);
          if (u_placements[4] == 0.0) behindAcc += glowComponent;
          else frontAcc += glowComponent;
        }
      }
    }

    // Layer 5 (uses u_colors_6).
    if (u_opacity[5] > 0.0 && u_coverage[5] > 0.0) {
      float animatedProgress = fract(perimeterProgress - u_layerProgress[5] + u_relativeOffset[5]);
      if (animatedProgress <= u_coverage[5]) {
        float segmentProgress = animatedProgress / u_coverage[5];
        float glowSize = getInterpolatedSize(segmentProgress, u_glowSizes[5]);
        float halo = gaussian(abs(d), glowSize);
        if (d > 0.0 && u_placements[5] == 1.0) halo = 0.0;
        if (halo > 0.0) {
          half4 color = getGradientColor(segmentProgress, u_colors_6);
          half4 glowComponent = color * half(halo) * half(u_opacity[5]);
          if (u_placements[5] == 0.0) behindAcc += glowComponent;
          else frontAcc += glowComponent;
        }
      }
    }

    // Layer 6 (uses u_colors_7).
    if (u_opacity[6] > 0.0 && u_coverage[6] > 0.0) {
      float animatedProgress = fract(perimeterProgress - u_layerProgress[6] + u_relativeOffset[6]);
      if (animatedProgress <= u_coverage[6]) {
        float segmentProgress = animatedProgress / u_coverage[6];
        float glowSize = getInterpolatedSize(segmentProgress, u_glowSizes[6]);
        float halo = gaussian(abs(d), glowSize);
        if (d > 0.0 && u_placements[6] == 1.0) halo = 0.0;
        if (halo > 0.0) {
          half4 color = getGradientColor(segmentProgress, u_colors_7);
          half4 glowComponent = color * half(halo) * half(u_opacity[6]);
          if (u_placements[6] == 0.0) behindAcc += glowComponent;
          else frontAcc += glowComponent;
        }
      }
    }

    half4 finalColor = behindAcc;
    if (d <= 0.0) {
      finalColor = mix(finalColor, u_backgroundColor, u_backgroundColor.a);
    }
    finalColor += frontAcc;

    if (u_isBorderAnimated > 0.5 && u_borderWidth > 0.0) {
      float halfWidth = u_borderWidth / 2.0;
      float borderStrength = 1.0 - smoothstep(halfWidth - 1.0, halfWidth + 1.0, abs(d));
      if (borderStrength > 0.0) {
        float borderT = fract(perimeterProgress - u_borderProgress);
        half4 borderColor = getGradientColor(borderT, u_colors_0);
        finalColor = mix(finalColor, borderColor, half(borderStrength));
      }
    }

    return finalColor * half(u_masterOpacity);
  }
`;

const processColorsWorklet = (colors: RGBColor[]): number[] => { 'worklet'; if (colors.length === 0) return Array(8 * 4).fill(0); const seamless = colors.length > 1 ? [...colors, colors[0]] : [...colors, ...colors]; const finalColors: number[] = []; for (let i = 0; i < 8; i++) { const p = i / 7.0; const c = getGradientColorWorklet(p, seamless); finalColors.push(c.r / 255, c.g / 255, c.b / 255, 1.0); } return finalColors; };

export interface UnifiedSkiaGlowProps { 
  layout: Layout; 
  masterOpacity: SharedValue<number>; 
  progress: SharedValue<number>; 
  fromConfig: SharedValue<GlowConfig>; 
  toConfig: SharedValue<GlowConfig>; 
}

const GLOW_CANVAS_MARGIN = 100;

export const UnifiedSkiaGlow: FC<UnifiedSkiaGlowProps> = ({ layout, masterOpacity, progress, fromConfig, toConfig }) => {
    const animatedEffect = useMemo((): SkRuntimeEffect | null => {
        if (Skia.RuntimeEffect) {
            return Skia.RuntimeEffect.Make(sksl);
        }
        return null;
    }, []);

    const borderProgress = useSharedValue(0);
    const layerProgress = useSharedValue(Array(MAX_SKIA_LAYERS).fill(0));
    
    const interpolatedSpeeds = useDerivedValue(() => {
        'worklet';
        const p = progress.value;
        const from = fromConfig.value;
        const to = toConfig.value;
        const animSpeed = interpolateNumber(from.animationSpeed ?? 0.7, to.animationSpeed ?? 0.7, p);
        const borderSpeedMult = interpolateNumber(from.borderSpeedMultiplier ?? 1.0, to.borderSpeedMultiplier ?? 1.0, p);
        const layerSpeedMults = [];
        const toLayers = to.glowLayers ?? [];
        const fromLayers = from.glowLayers ?? [];
        for (let i = 0; i < MAX_SKIA_LAYERS; i++) {
            if (i >= toLayers.length) {
                layerSpeedMults.push(0);
                continue;
            }
            const fromLayer = fromLayers[i] ?? {};
            const toLayer = toLayers[i] ?? {};
            layerSpeedMults.push(interpolateNumber(fromLayer.speedMultiplier ?? (toLayer.speedMultiplier ?? 1.0), toLayer.speedMultiplier ?? 1.0, p));
        }
        return { animSpeed, borderSpeedMult, layerSpeedMults };
    });

    useFrameCallback((frameInfo) => {
        'worklet';
        if (frameInfo.timeSincePreviousFrame === null) return;
        const deltaTime = frameInfo.timeSincePreviousFrame / 1000;
        const speeds = interpolatedSpeeds.value;
        const speedFactor = 0.166;
        const borderDelta = deltaTime * speedFactor * speeds.animSpeed * speeds.borderSpeedMult;
        borderProgress.value = (borderProgress.value + borderDelta) % 1.0;
        const currentLayerProgress = [...layerProgress.value];
        for (let i = 0; i < MAX_SKIA_LAYERS; i++) {
            const layerDelta = deltaTime * speedFactor * speeds.animSpeed * speeds.layerSpeedMults[i];
            currentLayerProgress[i] = (currentLayerProgress[i] + layerDelta) % 1.0;
        }
        layerProgress.value = currentLayerProgress;
    });

    const uniforms = useDerivedValue(() => {
        'worklet';
        const p = progress.value;
        const from = fromConfig.value;
        const to = toConfig.value;
        const cornerRadius = interpolateNumber(from.cornerRadius ?? 10, to.cornerRadius ?? 10, p);
        const outlineWidth = interpolateNumber(from.outlineWidth ?? 2, to.outlineWidth ?? 2, p);
        const fromBg = parseColorToRgbaWorklet(from.backgroundColor ?? 'transparent');
        const toBg = parseColorToRgbaWorklet(to.backgroundColor ?? 'transparent');
        const iBg = interpolateRgbaWorklet(fromBg, toBg, p);
        const backgroundColor = [iBg.r / 255, iBg.g / 255, iBg.b / 255, iBg.a];
        const coverage: number[] = [], glowSizes: number[] = [], opacity: number[] = [],
              relativeOffset: number[] = [], placements: number[] = [];
        const layerColors: number[][] = [];
        const fromLayers = from.glowLayers ?? [];
        const toLayers = to.glowLayers ?? [];
        const layerCount = toLayers.length;
        for (let i = 0; i < MAX_SKIA_LAYERS; i++) {
            if (i >= layerCount) {
                coverage.push(0); opacity.push(0); relativeOffset.push(0); placements.push(0);
                glowSizes.push(0, 0, 0, 0); layerColors.push(Array(32).fill(0));
                continue;
            }
            const fromLayer = fromLayers[i] ?? {};
            const toLayer = toLayers[i] ?? {};
            opacity.push(interpolateNumber(fromLayer.opacity ?? (toLayer.opacity ?? 0.5), toLayer.opacity ?? 0.5, p));
            coverage.push(interpolateNumber(fromLayer.coverage ?? (toLayer.coverage ?? 1.0), toLayer.coverage ?? 1.0, p));
            relativeOffset.push(interpolateNumber(fromLayer.relativeOffset ?? (toLayer.relativeOffset ?? 0), toLayer.relativeOffset ?? 0, p));
            const fromSize = Array.isArray(fromLayer.glowSize) ? fromLayer.glowSize : [fromLayer.glowSize ?? 0];
            const toSize = Array.isArray(toLayer.glowSize) ? toLayer.glowSize : [toLayer.glowSize ?? 0];
            glowSizes.push(...getGlowSizeVec4Worklet(interpolateNumberArray(fromSize, toSize, p)));
            const iColors = interpolateColorArrayWorklet(Array.isArray(fromLayer.colors) ? fromLayer.colors : [], Array.isArray(toLayer.colors) ? toLayer.colors : [], p);
            layerColors.push(processColorsWorklet(iColors));
            const placementMap: Record<GlowPlacement, number> = { 'behind': 0.0, 'inside': 1.0, 'over': 2.0 };
            const placementKey = (toLayer.glowPlacement ?? 'behind') as GlowPlacement;
            placements.push(placementMap[placementKey]);
        }
        const fromBorder = Array.isArray(from.borderColor) ? from.borderColor : (from.borderColor ? [from.borderColor] : []);
        const toBorder = Array.isArray(to.borderColor) ? to.borderColor : (to.borderColor ? [to.borderColor] : []);
        const iBorder = interpolateColorArrayWorklet(fromBorder, toBorder, p);
        
        return {
            u_resolution: [layout.width + GLOW_CANVAS_MARGIN * 2, layout.height + GLOW_CANVAS_MARGIN * 2],
            u_rectSize: [layout.width, layout.height],
            u_cornerRadius: Math.min(cornerRadius, layout.width / 2, layout.height / 2),
            u_backgroundColor: backgroundColor,
            u_borderWidth: outlineWidth,
            u_borderProgress: borderProgress.value,
            u_layerCount: layerCount,
            u_coverage: coverage, u_opacity: opacity, u_relativeOffset: relativeOffset,
            u_glowSizes: glowSizes, u_placements: placements,
            u_layerProgress: layerProgress.value,
            u_colors_0: processColorsWorklet(iBorder),
            u_colors_1: layerColors[0], u_colors_2: layerColors[1], u_colors_3: layerColors[2],
            u_colors_4: layerColors[3], u_colors_5: layerColors[4], u_colors_6: layerColors[5],
            u_colors_7: layerColors[6], u_colors_8: layerColors[7], u_colors_9: layerColors[8],
            u_colors_10: layerColors[9],
            u_masterOpacity: masterOpacity.value,
            u_isBorderAnimated: toBorder.length > 1 ? 1.0 : 0.0,
        };
    }, [layout, progress, fromConfig, toConfig, masterOpacity]);

    if (!animatedEffect || layout.width <= 0 || layout.height <= 0) {
        return null;
    }

    return (
        <View style={[StyleSheet.absoluteFill, { left: -GLOW_CANVAS_MARGIN, top: -GLOW_CANVAS_MARGIN, width: layout.width + GLOW_CANVAS_MARGIN * 2, height: layout.height + GLOW_CANVAS_MARGIN * 2 }]} pointerEvents="none">
            <Animated.View style={StyleSheet.absoluteFill}>
                <Canvas style={StyleSheet.absoluteFill}>
                    <Fill>
                        <Shader source={animatedEffect} uniforms={uniforms} />
                    </Fill>
                </Canvas>
            </Animated.View>
        </View>
    );
};
