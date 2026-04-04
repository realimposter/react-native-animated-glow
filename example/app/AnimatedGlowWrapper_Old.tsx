import React, { useEffect, useMemo, useState, FC, ReactNode } from 'react';
import { View, StyleSheet, LayoutChangeEvent, StyleProp, ViewStyle, Text } from 'react-native';
import Svg, { Defs, RadialGradient, Stop, NumberProp, G, Circle } from 'react-native-svg';
import Animated, {
  useSharedValue,
  useAnimatedProps,
  withRepeat,
  withTiming,
  Easing,
  useFrameCallback,
} from 'react-native-reanimated';

// --- Type definitions (Unchanged) ---
export interface AnimatedGlowWrapperProps {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
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
}

// --- Orb Component (Unchanged) ---
const AnimatedCircle = Animated.createAnimatedComponent(Circle);
const Orb: FC<any> = React.memo(({ id, index, colors, numberOfOrbs, ...props }) => {
  const x = useSharedValue<NumberProp|undefined>(0); const y = useSharedValue<NumberProp|undefined>(0); const scale = useSharedValue(1); const pathLength = useMemo(() => 2 * (props.width + props.height), [props.width, props.height]);
  const staticColor = useMemo(() => { const progress = numberOfOrbs > 1 ? index / (numberOfOrbs - 1) : 0; const hexToRgb = (hex: string) => { let r=0,g=0,b=0; if(hex.length===4){r=parseInt(hex[1]+hex[1],16);g=parseInt(hex[2]+hex[2],16);b=parseInt(hex[3]+hex[3],16);}else if(hex.length===7){r=parseInt(hex.substring(1,3),16);g=parseInt(hex.substring(3,5),16);b=parseInt(hex.substring(5,7),16);} return {r,g,b}; }; const rgbToHex = (r:number,g:number,b:number) => { const toHex=(c:number)=>('0'+Math.round(c).toString(16)).slice(-2); return `#${toHex(r)}${toHex(g)}${toHex(b)}`; }; const interpolateColor = (p: number, c: string[]): string => { if (c.length === 0) return '#000000'; if (c.length === 1) return c[0]; const cp = p * (c.length - 1); const fi = Math.max(0, Math.floor(cp)); const ti = Math.min(c.length - 1, fi + 1); const lp = cp - fi; const fr = hexToRgb(c[fi]); const tr = hexToRgb(c[ti]); const r = fr.r + (tr.r - fr.r) * lp; const g = fr.g + (tr.g - fr.g) * lp; const b = fr.b + (tr.b - fr.b) * lp; return rgbToHex(r, g, b); }; return interpolateColor(progress, colors); }, [colors, index, numberOfOrbs]);
  useFrameCallback(() => { if (pathLength === 0 || numberOfOrbs === 0) return; const getPointAtLength = (length: number, width: number, height: number): { x: number; y: number } => { 'worklet'; const perimeter = 2 * (width + height); if (perimeter === 0) return { x: 0, y: 0 }; let l = length % perimeter; if (l < 0) l += perimeter; if (l < width) return { x: l, y: 0 }; l -= width; if (l < height) return { x: width, y: l }; l -= height; if (l < width) return { x: width - l, y: height }; l -= width;  return { x: 0, y: height - l }; }; const progress = (props.time.value * props.speedMultiplier + index / numberOfOrbs) % 1; const point = getPointAtLength(progress * pathLength, props.width, props.height); x.value = point.x + (Math.random() - 0.5) * props.width * props.randomness; y.value = point.y + (Math.random() - 0.5) * props.height * props.randomness; if (props.scaleAmplitude > 0) { scale.value = 1 + props.scaleAmplitude * Math.sin(props.time.value * 2 * Math.PI * props.scaleFrequency + index); } }, true);
  const animatedCircleProps = useAnimatedProps(() => ({ cx: x.value, cy: y.value, r: Math.max(0, (props.dotSize / 2) * scale.value) })); const gradientId = `${id}-grad`;
  
  return (<><Defs>
      <RadialGradient id={gradientId}>
        <Stop offset="0%" stopColor={staticColor} stopOpacity={1} />
        <Stop offset="25%" stopColor={staticColor} stopOpacity={1} />
        <Stop offset="90%" stopColor={staticColor} stopOpacity={0.1} />
        <Stop offset="100%" stopColor={staticColor} stopOpacity={0} />
      </RadialGradient>
    </Defs><AnimatedCircle animatedProps={animatedCircleProps} fill={`url(#${gradientId})`} /></>);
});

// --- Main Wrapper Component (FIXED) ---
const AnimatedGlowWrapper: FC<AnimatedGlowWrapperProps> = (props) => {
    const { 
      children, 
      style, 
      ...config 
    } = props;

    const [layout, setLayout] = useState<{ width: number; height: number }>({ width: 0, height: 0 });
    const time = useSharedValue(0);

    useEffect(() => { 
        const duration = config.animationSpeed! === 0 ? Infinity : 10000 / config.animationSpeed!; 
        if (duration !== Infinity) { 
            time.value = withRepeat(withTiming(1, { duration, easing: Easing.linear }), -1, false); 
        } 
    }, [config.animationSpeed, time]);

    const onLayout = (event: LayoutChangeEvent) => setLayout(event.nativeEvent.layout);
    const shouldRenderGlow = layout.width > 0 && layout.height > 0;
    const glowBleed = 100;

    const outerOrbIndices = useMemo(() => Array.from({ length: config.outerGlowNumberOfOrbs! }, (_, i) => i), [config.outerGlowNumberOfOrbs]);
    const innerOrbIndices = useMemo(() => Array.from({ length: config.innerGlowNumberOfOrbs! }, (_, i) => i), [config.innerGlowNumberOfOrbs]);
    
    return (
      <View style={style} onLayout={onLayout}>
        {shouldRenderGlow && (
          <View style={{ position: 'absolute', top: -glowBleed, left: -glowBleed, width: layout.width + glowBleed * 2, height: layout.height + glowBleed * 2, pointerEvents: 'none' }}>
            <Svg width="100%" height="100%">
              <G opacity={config.outerGlowOpacity} x={glowBleed + config.outerGlowInset!} y={glowBleed + config.outerGlowInset!}>
                {outerOrbIndices.map((index) => ( 
                  <Orb 
                    // --- FIX #1: The key now includes the color array to ensure a full re-render on preset change ---
                    key={`outer-orb-${JSON.stringify(config.outerGlowColors)}-${index}`} 
                    id={`outer-orb-${index}`} 
                    index={index} 
                    dotSize={config.outerGlowDotSize!} 
                    colors={config.outerGlowColors!} 
                    time={time} 
                    width={layout.width - config.outerGlowInset!*2} 
                    height={layout.height - config.outerGlowInset!*2} 
                    speedMultiplier={config.outerGlowSpeedMultiplier!} 
                    randomness={config.randomness!} 
                    scaleAmplitude={config.outerGlowScaleAmplitude!} 
                    scaleFrequency={config.outerGlowScaleFrequency!} 
                    numberOfOrbs={config.outerGlowNumberOfOrbs!}
                  /> 
                ))}
              </G>
              <G opacity={config.innerGlowOpacity} x={glowBleed + config.innerGlowInset!} y={glowBleed + config.innerGlowInset!}>
                {innerOrbIndices.map((index) => ( 
                  <Orb 
                    // --- FIX #2: The key now includes the color array to ensure a full re-render on preset change ---
                    key={`inner-orb-${JSON.stringify(config.innerGlowColors)}-${index}`} 
                    id={`inner-orb-${index}`} 
                    index={index} 
                    dotSize={config.innerGlowDotSize!} 
                    colors={config.innerGlowColors!} 
                    time={time} 
                    width={layout.width - config.innerGlowInset!*2} 
                    height={layout.height - config.innerGlowInset!*2} 
                    speedMultiplier={config.innerGlowSpeedMultiplier!} 
                    randomness={config.randomness!} 
                    scaleAmplitude={config.innerGlowScaleAmplitude!} 
                    scaleFrequency={config.innerGlowScaleFrequency!} 
                    numberOfOrbs={config.innerGlowNumberOfOrbs!}
                  /> 
                ))}
              </G>
            </Svg>
          </View>
        )}
        <View style={{ borderWidth: config.outlineWidth, borderColor: config.borderColor, borderRadius: config.cornerRadius, overflow: 'hidden' }}>
          {children}
        </View>
        <Text style={{
            position: 'absolute',
            top: 2,
            left: 2,
            fontSize: 8,
            color: 'white',
            backgroundColor: 'rgba(0,0,0,0.6)',
            padding: 2,
            borderRadius: 2,
            zIndex: 999,
            opacity: 0.8,
            maxWidth: '95%'
        }}>
            {`O: ${JSON.stringify(config.outerGlowColors)}\nI: ${JSON.stringify(config.innerGlowColors)}`}
        </Text>
      </View>
    );
};

export default AnimatedGlowWrapper;