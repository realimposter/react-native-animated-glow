import React, {
  useState,
  useEffect,
  useMemo,
  memo,
  FC,
  ReactNode,
} from 'react';
import {
  View,
  StyleSheet,
  LayoutChangeEvent,
  StyleProp,
  ViewStyle,
} from 'react-native';
import Svg, { Defs, RadialGradient, Rect, Stop } from 'react-native-svg';
import Animated, {
  Easing,
  useSharedValue,
  withRepeat,
  withTiming,
  useAnimatedStyle,
  SharedValue,
} from 'react-native-reanimated';

export type PresetConfig = {
  cornerRadius?: number;
  outlineWidth?: number;
  borderColor?: string;
  animationSpeed?: number;
  randomness?: number;

  outerGlowColors?: string[];
  outerGlowOpacity?: number;
  outerGlowDotSize?: number;
  outerGlowNumberOfOrbs?: number;
  outerGlowInset?: number;
  outerGlowSpeedMultiplier?: number;
  outerGlowScaleAmplitude?: number;
  outerGlowScaleFrequency?: number;

  innerGlowColors?: string[];
  innerGlowOpacity?: number;
  innerGlowDotSize?: number;
  innerGlowNumberOfOrbs?: number;
  innerGlowInset?: number;
  innerGlowSpeedMultiplier?: number;
  innerGlowScaleAmplitude?: number;
  innerGlowScaleFrequency?: number;
};

// Main component props
export interface AnimatedGlowWrapperProps extends PresetConfig {
  preset?: PresetConfig;
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}

// Internal types
type RGBColor = { r: number; g: number; b: number };
type Point = { x: number; y: number };
type Layout = { width: number; height: number };
type DotLayout = Layout & { count: number };

interface GlowDotProps {
  color: string;
  size: number;
  index: number;
}

interface AnimatedGlowDotProps {
  progress: SharedValue<number>;
  scaleProgress: SharedValue<number>;
  color: string;
  dotSize: number;
  layout: DotLayout | null;
  index: number;
  randomOffset: number;
  scaleAmplitude: number;
  scaleFrequency: number;
  inset: number;
  cornerRadius: number;
}

// --- Internal Helper Functions ---

const hexToRgb = (hex: string): RGBColor | null => {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result
    ? {
        r: parseInt(result[1], 16),
        g: parseInt(result[2], 16),
        b: parseInt(result[3], 16),
      }
    : null;
};

const rgbToHex = (r: number, g: number, b: number): string =>
  '#' + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);

const interpolateColor = (
  color1: string,
  color2: string,
  factor: number,
): string => {
  const rgb1 = hexToRgb(color1);
  const rgb2 = hexToRgb(color2);
  if (!rgb1 || !rgb2) return color1;
  const r = Math.round(rgb1.r + factor * (rgb2.r - rgb1.r));
  const g = Math.round(rgb1.g + factor * (rgb2.g - rgb1.g));
  const b = Math.round(rgb1.b + factor * (rgb2.b - rgb1.b));
  return rgbToHex(r, g, b);
};

const getGradientColor = (progress: number, colors: string[]): string => {
  if (!colors || colors.length === 0) return 'transparent';
  if (colors.length === 1) return colors[0];
  const fullColorList = [...colors, colors[0]]; // Loop back to the start
  const segmentLength = 1 / (fullColorList.length - 1);
  const segmentIndex = Math.min(
    Math.floor(progress / segmentLength),
    fullColorList.length - 2,
  );
  const segmentProgress =
    (progress - segmentIndex * segmentLength) / segmentLength;
  return interpolateColor(
    fullColorList[segmentIndex],
    fullColorList[segmentIndex + 1],
    segmentProgress,
  );
};

// --- Internal Components ---

const GlowDot: FC<GlowDotProps> = memo(({ color, size, index }) => {
  const gradientId = `grad-${color.replace(/#/g, '')}-${index}`;
  return (
    <Svg height={size} width={size}>
      <Defs>
        <RadialGradient id={gradientId} cx="50%" cy="50%" rx="50%" ry="50%">
          <Stop offset="0%" stopColor={color} stopOpacity="1" />
          <Stop offset="100%" stopColor={color} stopOpacity="0" />
        </RadialGradient>
      </Defs>
      <Rect
        x="0"
        y="0"
        width={size}
        height={size}
        fill={`url(#${gradientId})`}
      />
    </Svg>
  );
});

const AnimatedGlowDot: FC<AnimatedGlowDotProps> = ({
  progress,
  scaleProgress,
  color,
  dotSize,
  layout,
  index,
  randomOffset,
  scaleAmplitude,
  scaleFrequency,
  inset,
  cornerRadius,
}) => {
  const animatedStyle = useAnimatedStyle(() => {
    // Return an empty object if layout is not ready
    if (!layout || layout.width <= 0 || layout.height <= 0 || layout.count === 0) {
      return {};
    }

    const currentPosProgress =
      (progress.value + index / layout.count + randomOffset) % 1;
    const currentScaleProgress = (scaleProgress.value + index / layout.count) % 1;

    let x: number, y: number;

    // Path calculation logic
    const r = Math.max(0, cornerRadius);
    const w = layout.width - inset * 2;
    const h = layout.height - inset * 2;
    const halfDot = dotSize / 2;

    if (r <= 0 || w < 2 * r || h < 2 * r) {
      // Logic for a simple rectangle
      const perimeter = 2 * (w + h);
      if (perimeter === 0) {
        x = inset - halfDot;
        y = inset - halfDot;
      } else {
        let d = currentPosProgress * perimeter;
        if (d <= w) {
          x = inset + d - halfDot;
          y = inset - halfDot;
        } else {
          d -= w;
          if (d <= h) {
            x = inset + w - halfDot;
            y = inset + d - halfDot;
          } else {
            d -= h;
            if (d <= w) {
              x = inset + w - d - halfDot;
              y = inset + h - halfDot;
            } else {
              d -= w;
              x = inset - halfDot;
              y = inset + h - d - halfDot;
            }
          }
        }
      }
    } else {
      // Logic for a rounded rectangle path
      const sW = w - 2 * r;
      const sH = h - 2 * r;
      const aL = (Math.PI * r) / 2;
      const p = 2 * (sW + sH) + 4 * aL;
      let d = currentPosProgress * p;

      // Worklet for Bezier curve calculation on the UI thread
      const getPoint = (t: number, p0: Point, p1: Point, p2: Point): Point => {
        'worklet';
        const o = 1 - t;
        return {
          x: o * o * p0.x + 2 * o * t * p1.x + t * t * p2.x,
          y: o * o * p0.y + 2 * o * t * p1.y + t * t * p2.y,
        };
      };

      let pt: Point;
      if (d <= sW) {
        pt = { x: inset + r + d, y: inset };
      } else {
        d -= sW;
        if (d <= aL) {
          pt = getPoint(d / aL, { x: inset + w - r, y: inset }, { x: inset + w, y: inset }, { x: inset + w, y: inset + r });
        } else {
          d -= aL;
          if (d <= sH) {
            pt = { x: inset + w, y: inset + r + d };
          } else {
            d -= sH;
            if (d <= aL) {
              pt = getPoint(d / aL, { x: inset + w, y: inset + h - r }, { x: inset + w, y: inset + h }, { x: inset + w - r, y: inset + h });
            } else {
              d -= aL;
              if (d <= sW) {
                pt = { x: inset + w - r - d, y: inset + h };
              } else {
                d -= sW;
                if (d <= aL) {
                  pt = getPoint(d / aL, { x: inset + r, y: inset + h }, { x: inset, y: inset + h }, { x: inset, y: inset + h - r });
                } else {
                  d -= aL;
                  if (d <= sH) {
                    pt = { x: inset, y: inset + h - r - d };
                  } else {
                    d -= sH;
                    pt = getPoint(d / aL, { x: inset, y: inset + r }, { x: inset, y: inset }, { x: inset + r, y: inset });
                  }
                }
              }
            }
          }
        }
      }

      x = pt.x - halfDot;
      y = pt.y - halfDot;
    }

    const scale = 1 + scaleAmplitude * Math.sin(currentScaleProgress * 2 * Math.PI * scaleFrequency);
    return { transform: [{ translateX: x }, { translateY: y }, { scale }] };
  });

  return (
    <Animated.View style={[styles.glowDot, animatedStyle]}>
      <GlowDot color={color} size={dotSize} index={index} />
    </Animated.View>
  );
};

// --- Main Component ---

/**
 * A highly customizable animated glow effect wrapper for React Native components.
 */
const AnimatedGlowWrapper: FC<AnimatedGlowWrapperProps> = (props) => {
  const { preset: presetObject = {}, children, style, ...overrideProps } = props;

  // Define default properties for the component
  const defaultProps: Required<PresetConfig> = {
    cornerRadius: 10, outlineWidth: 2, borderColor: 'white', animationSpeed: 0.7, randomness: 0.01,
    outerGlowColors: ['#00FFFF', '#FF00FF', '#FFFF00'], outerGlowOpacity: 0.15, outerGlowDotSize: 100, outerGlowNumberOfOrbs: 20, outerGlowInset: 15, outerGlowSpeedMultiplier: 1.0, outerGlowScaleAmplitude: 0, outerGlowScaleFrequency: 2.5,
    innerGlowColors: ['#00FFFF', '#FF00FF', '#FFFF00'], innerGlowOpacity: 0.3, innerGlowDotSize: 50, innerGlowNumberOfOrbs: 20, innerGlowInset: 15, innerGlowSpeedMultiplier: 1.0, innerGlowScaleAmplitude: 0, innerGlowScaleFrequency: 2.5,
  };

  // Merge props in order: defaults -> preset -> overrides
  const finalProps = useMemo(() => ({
    ...defaultProps,
    ...presetObject,
    ...overrideProps,
  }), [presetObject, overrideProps]);

  // Destructure all properties for use in the component
  const {
    cornerRadius, outlineWidth, borderColor, animationSpeed, randomness,
    outerGlowColors, outerGlowOpacity, outerGlowDotSize, outerGlowNumberOfOrbs, outerGlowInset, outerGlowSpeedMultiplier, outerGlowScaleAmplitude, outerGlowScaleFrequency,
    innerGlowColors, innerGlowOpacity, innerGlowDotSize, innerGlowNumberOfOrbs, innerGlowInset, innerGlowSpeedMultiplier, innerGlowScaleAmplitude, innerGlowScaleFrequency,
  } = finalProps;

  const [layout, setLayout] = useState<Layout>({ width: 0, height: 0 });

  // Custom hook to prepare glow orb data
  const useGlowLayer = (numOrbs: number, initialColors: string[] | undefined) => {
    const randomOffsets = useMemo(() => Array.from({ length: numOrbs }, () => (Math.random() - 0.5) * randomness), [numOrbs, randomness]);
    const glowColors = useMemo(() => {
      const colors: string[] = [];
      if (numOrbs > 0 && initialColors && initialColors.length > 0) {
        for (let i = 0; i < numOrbs; i++) {
          colors.push(getGradientColor(i / numOrbs, initialColors));
        }
      }
      return colors;
    }, [initialColors, numOrbs]);
    return { randomOffsets, glowColors };
  };

  // Custom hook to drive an animation loop
  const useAnimationDriver = (speedMultiplier: number): SharedValue<number> => {
    const progress = useSharedValue(0);
    useEffect(() => {
      const duration = animationSpeed === 0 || speedMultiplier === 0 ? Infinity : (1 / (animationSpeed * speedMultiplier)) * 3000;
      if (duration !== Infinity) {
        progress.value = withRepeat(withTiming(1, { duration, easing: Easing.linear }), -1);
      }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [speedMultiplier, animationSpeed]); // progress is intentionally omitted
    return progress;
  };

  // Prepare data and animations for both glow layers
  const { randomOffsets: outerRandomOffsets, glowColors: outerGlowColorsCalculated } = useGlowLayer(outerGlowNumberOfOrbs, outerGlowColors);
  const { randomOffsets: innerRandomOffsets, glowColors: innerGlowColorsCalculated } = useGlowLayer(innerGlowNumberOfOrbs, innerGlowColors);
  const outerPosProgress = useAnimationDriver(outerGlowSpeedMultiplier);
  const outerScaleProgress = useAnimationDriver(outerGlowSpeedMultiplier * 2);
  const innerPosProgress = useAnimationDriver(innerGlowSpeedMultiplier);
  const innerScaleProgress = useAnimationDriver(innerGlowSpeedMultiplier * 2);

  const onLayout = (event: LayoutChangeEvent) => setLayout(event.nativeEvent.layout);

  const renderGlowLayer = (
    layerId: string, colors: string[], randomOffsets: number[],
    posProgress: SharedValue<number>, scaleProgress: SharedValue<number>,
    dotSize: number, scaleAmplitude: number, scaleFrequency: number,
    opacity: number, inset: number
  ) => (
    <View style={[styles.glowContainer, { opacity }]} pointerEvents="none">
      {colors.map((color, index) => (
        <AnimatedGlowDot
          key={`${layerId}-${index}`}
          color={color}
          progress={posProgress}
          scaleProgress={scaleProgress}
          dotSize={dotSize}
          layout={colors.length > 0 ? { ...layout, count: colors.length } : null}
          index={index}
          scaleAmplitude={scaleAmplitude}
          scaleFrequency={scaleFrequency}
          randomOffset={randomOffsets[index]}
          inset={inset}
          cornerRadius={cornerRadius}
        />
      ))}
    </View>
  );

  return (
    <View style={style} onLayout={onLayout}>
      {layout.width > 0 && layout.height > 0 && (
        <>
          {outerGlowNumberOfOrbs > 0 && renderGlowLayer('outer', outerGlowColorsCalculated, outerRandomOffsets, outerPosProgress, outerScaleProgress, outerGlowDotSize, outerGlowScaleAmplitude, outerGlowScaleFrequency, outerGlowOpacity, outerGlowInset)}
          {innerGlowNumberOfOrbs > 0 && renderGlowLayer('inner', innerGlowColorsCalculated, innerRandomOffsets, innerPosProgress, innerScaleProgress, innerGlowDotSize, innerGlowScaleAmplitude, innerGlowScaleFrequency, innerGlowOpacity, innerGlowInset)}
        </>
      )}
      <View style={{ borderWidth: outlineWidth, borderColor: borderColor, borderRadius: cornerRadius, overflow: 'hidden' }}>
        {children}
      </View>
    </View>
  );
};

// --- Styles ---

const styles = StyleSheet.create({
  glowContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: '100%',
    height: '100%',
  },
  glowDot: {
    position: 'absolute',
    top: 0,
    left: 0,
  },
});

export default AnimatedGlowWrapper;