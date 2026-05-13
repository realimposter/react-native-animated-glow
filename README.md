# React Native Animated Glow v3.2.0

<div align="center">

[![NPM Version](https://img.shields.io/npm/v/react-native-animated-glow.svg)](https://www.npmjs.com/package/react-native-animated-glow)
[![NPM License](https://img.shields.io/npm/l/react-native-animated-glow.svg)](https://github.com/realimposter/react-native-animated-glow/blob/main/LICENSE)
[![NPM Downloads](https://img.shields.io/npm/dt/react-native-animated-glow.svg)](https://www.npmjs.com/package/react-native-animated-glow)
<br/>
<a href="https://github.com/realimposter/react-native-animated-glow">
  <img src="https://img.shields.io/github/stars/realimposter/react-native-animated-glow?style=social" alt="GitHub stars">
</a>

</div>

A performant, highly-customizable animated glow effect component for React Native, powered by **Skia** and **Reanimated 3**.

![React Native Animated Glow Demo](https://raw.githubusercontent.com/realimposter/react-native-animated-glow/main/assets/react-native-glow-demo.gif)

## Live Demo & Builder

Check out the **[live web demo and interactive builder](https://reactnativeglow.com/)** to see the component in action, browse tutorials, and create your own presets.

## Features

-   **GPU-Powered Performance:** Built with Skia for smooth, 60 FPS animations that run on the UI thread.
-   **Intelligent State Blending:** Responds to `hover` and `press` events by smoothly interpolating between different glow configurations.
-   **Highly Customizable:** Control colors, speed, shape, size, opacity, and more through a flexible `glowLayers` API.
-   **Advanced Effects:**
    -   Create flowing **gradient glows and borders**.
    -   Render glows `behind`, `inside` (clipped), or `over` your component.
    -   Achieve "comet trail" effects with variable `glowSize` arrays.
-   **Easy Web Setup:** Skia's CanvasKit WASM file is loaded automatically from a CDN, no extra configuration needed.
-   **Presets Included:** Ships with professionally designed presets to get you started instantly.

## Installation

**1. Install the library:**

```bash
npm install react-native-animated-glow
```

**2. Install Peer Dependencies:**

The library depends on Skia, Reanimated, and Gesture Handler.

```bash
npm install @shopify/react-native-skia react-native-reanimated react-native-gesture-handler
```

**3. Configure Dependencies:**

You must follow the installation guides for the peer dependencies to ensure they are configured correctly for your project.
- [React Native Skia Docs](https://shopify.github.io/react-native-skia/docs/getting-started/installation)
- [Reanimated Docs](https://docs.swmansion.com/react-native-reanimated/docs/fundamentals/getting-started/#installation) (Remember to add the Babel plugin!)
- [Gesture Handler Docs](https://docs.swmansion.com/react-native-gesture-handler/docs/fundamentals/installation) (Remember to add `GestureHandlerRootView`!)

## Usage

The best way to use the component is with a `PresetConfig` object, which makes your styles reusable and type-safe.

```jsx
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import AnimatedGlow, { type PresetConfig } from 'react-native-animated-glow';

// 1. Define your preset
const myCoolPreset: PresetConfig = {
  metadata: { 
    name: 'My Cool Preset', 
    textColor: '#FFFFFF', 
    category: 'Custom',
    tags: ['interactive']
  },
  states: [
    {
      name: 'default', // The base style for the component
      preset: {
        cornerRadius: 50,
        outlineWidth: 2,
        borderColor: '#E0FFFF',
        glowLayers: [
          { colors: ['#00BFFF', '#87CEEB'], opacity: 0.5, glowSize: 30 },
        ]
      }
    },
    // 2. Define interactive states
    { 
      name: 'hover', 
      transition: 300, // 300ms transition into this state
      preset: { 
        glowLayers: [{ glowSize: 40 }] // On hover, make the glow bigger
      } 
    },
    { 
      name: 'press', 
      transition: 100, // A faster transition for press
      preset: { 
        glowLayers: [{ glowSize: 45, opacity: 0.6 }] 
      } 
    }
  ]
};

// 3. Use it in your component
export default function MyGlowingComponent() {
  return (
    <AnimatedGlow preset={myCoolPreset}>
      <View style={styles.box}>
        <Text style={styles.text}>I'm Interactive!</Text>
      </View>
    </AnimatedGlow>
  );
}

const styles = StyleSheet.create({
  box: { paddingVertical: 20, paddingHorizontal: 40, backgroundColor: '#222' },
  text: { color: 'white', fontWeight: 'bold' }
});
```

## Controlling States

The `AnimatedGlow` component is stateless by default and is controlled via the `activeState` prop. This gives you complete control to connect it to any gesture or state management system.

The recommended way to handle user interactions is to wrap your content in a `Pressable` and use `React.useState` and `React.useRef` to manage the component's state between `'default'`, `'hover'`, and `'press'`.

Here is a robust example demonstrating how to handle both press and hover events correctly:

```jsx
import React, { useState, useRef } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
// Import the GlowEvent type for type safety
import AnimatedGlow, { glowPresets, type GlowEvent } from 'react-native-animated-glow';

export default function MyInteractiveButton() {
  // 1. State for the active glow effect ('default', 'hover', 'press')
  const [glowState, setGlowState] = useState<GlowEvent>('default');
  // 2. Ref to track if the cursor is currently hovering over the element
  const isHovered = useRef(false);

  return (
    <AnimatedGlow 
      preset={glowPresets.defaultRainbow}
      // 3. Pass the state to the activeState prop to control the glow
      activeState={glowState}
    >
      <Pressable
        style={styles.button}
        onPress={() => console.log('Button Pressed!')}
        
        // --- Press Events ---
        onPressIn={() => setGlowState('press')}
        onPressOut={() => {
          // When the press is released, transition to 'hover' if the cursor
          // is still over the button, otherwise return to 'default'.
          setGlowState(isHovered.current ? 'hover' : 'default');
        }}
        
        // --- Hover Events (for Web, macOS, Windows) ---
        onHoverIn={() => {
          isHovered.current = true;
          // Only transition to hover state if not being actively pressed.
          if (glowState !== 'press') {
            setGlowState('hover');
          }
        }}
        onHoverOut={() => {
          isHovered.current = false;
          // Only transition to default state if not being actively pressed.
          if (glowState !== 'press') {
            setGlowState('default');
          }
        }}
      >
        <Text style={styles.buttonText}>Tap or Hover Me</Text>
      </Pressable>
    </AnimatedGlow>
  );
}

const styles = StyleSheet.create({
  button: { 
    paddingVertical: 20, 
    paddingHorizontal: 40,
    backgroundColor: '#222'
  },
  buttonText: { 
    color: 'white', 
    fontWeight: 'bold', 
    textAlign: 'center'
  }
});
```

## API Reference

For a complete list of all available props and their descriptions, please see the **[Docs Tab](https://reactnativeglow.com/docs)** in the live demo app.

## Changelog

### `v3.2.0`
-   **Fixed Samsung Adreno crash on first draw** — `getGradientColor` previously used a reverse-iterating loop with conditional assignment-without-break (`for (i=6; i>=0; i--) { if (...) finalColor = mix(...); }`). Some Samsung Adreno shader compilers (verified Galaxy S25 / Adreno 750, Vulkan backend) reject this pattern at link/first-draw time and crash the app with `SIGABRT`. Switched to forward iteration with explicit `break` — output is bit-identical (both find the same gradient segment) and compiles cleanly everywhere.
-   **Fixed Samsung Adreno 1 fps perf regression** — the per-layer `for(i<10)` loop with an 11-way `if/else` chain to "dynamically index" into `u_colors_N` (workaround for SKSL not allowing dynamic uniform array indexing) hits register-spill / branch-divergence pathology in Samsung Adreno's compiler — same shader runs at 60 fps on iOS / Pixel / Mali but ~1 fps on modern Samsung. Unrolled the per-layer rendering into 7 inline blocks; compiles to straight-line GPU code that runs at 60 fps on Samsung and is at least as fast on every other tested device. **Tradeoff:** presets are now capped at 7 simultaneous layers (was 10). To support more, paste additional inline blocks in `UnifiedSkiaGlow.tsx` — pattern is mechanical.
-   See the **Samsung Adreno notes** section below for the full investigation.

### `v3.1.0`
-   Fixed Samsung/Adreno freezes by keeping SkSL color math on `half4` precision.
-   Fixed Android Expo dev OOMs by avoiding native lazy loading for the Skia renderer.
-   Fixed Web `WithSkiaWeb` loading so Metro no longer emits the `_ref` runtime error.
-   Added `react-native` and `default` package export conditions for newer Metro/Expo compatibility.
-   Added `wrapperStyle` for styling the inner content wrapper.

### `v3.0.1`
-   Added `activeState` prop.
-   Removed internal state management

### `v3.0.0` (Breaking Changes)
This version introduces a more powerful and intelligent animation system along with a complete restructuring of the preset API for better organization and type safety.

-   **New Feature: Intelligent Animation Blending:** A new animation system powered by Reanimated worklets smoothly interpolates *between* state configurations. When you hover, press, or return to default, every animatable property (colors, sizes, opacity, etc.) will transition gracefully over the specified duration.
-   **New Feature: Reworked State Management API:** The `preset` prop now expects a `PresetConfig` object with a `states` array. All visual styles, including the `default` look, are defined within this array. This makes presets more organized and powerful.
-   **Architectural Improvement:** All glow layers, placements (`behind`, `inside`, `over`), and the animated border are now rendered in a single, unified Skia shader for maximum efficiency.
-   **BREAKING CHANGE:** The `preset` prop format has been completely overhauled. Old flat preset objects are incompatible and must be migrated to the new `PresetConfig` structure, which includes a `metadata` object and a `states` array.
-   **BREAKING CHANGE:** The `randomness` prop has been removed from the core API.

### `v2.0.0`
This version marked a complete architectural rewrite for maximum performance and flexibility.

-   **Complete Rewrite with Skia:** The library is now powered by **Skia** and **Reanimated 3**, running animations smoothly on the UI thread.
-   **Interactive States:** Added support for `hover` and `press` events with configurable transitions using `react-native-gesture-handler`.
-   **BREAKING CHANGE:** The library now requires `@shopify/react-native-skia`, `react-native-reanimated`, and `react-native-gesture-handler` as peer dependencies. The old props (`glowColor`, `glowSize`, etc.) have been replaced by the `glowLayers` API.

### `v1.0.0`
-   Initial release using glow particles and reanimated

## Samsung Adreno notes

If you're contributing to the SKSL shader in `UnifiedSkiaGlow.tsx`, three things in there are load-bearing for Samsung Adreno compatibility — please don't undo any of them:

1. **`half4` color uniforms and color-math intermediates.** Samsung's modified Adreno driver promotes `vec4` / `float` color arithmetic to highp where every other tested driver defaults to mediump — ~5x per-fragment slowdown. SKSL doesn't accept `precision mediump float;` directives, so half-typed declarations are the SKSL-native way to drop color paths to mediump. (Fixed in v3.1.0.)

2. **`getGradientColor` uses a forward loop with explicit `break`.** The reverse form (`for (i=6; i>=0; i--)` with conditional assignment, no break) crashes Samsung Adreno at link/first-draw time. Both forms produce identical output. (Fixed in v3.2.0.)

3. **The per-layer rendering is unrolled into 7 inline blocks** instead of a `for(i<10)` loop with an 11-way `if/else` color-array picker. The looped form runs at ~1 fps on Samsung Adreno because SKSL's lack of dynamic uniform array indexing forces an `if/else` chain that combines with the dynamic loop to hit register-spill / branch-divergence pathology in Samsung's shader compiler. Unrolled inline blocks compile to straight-line GPU code that runs at 60 fps. The current shader caps at 7 layers; presets needing more should add additional inline blocks (pattern is mechanical and well-tested). (Fixed in v3.2.0.)

If you're seeing Samsung-specific crashes or freezes after modifying the shader, check those three conventions first.

## License
This project is licensed under the MIT License.
