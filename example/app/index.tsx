import React, { useState, FC, useCallback, useEffect, useMemo } from 'react';
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  SafeAreaView,
  TouchableOpacity,
  Modal,
  TextInput,
  Alert,
} from 'react-native';
// Import the component AND the exported PresetConfig type
import AnimatedGlowWrapper, { PresetConfig } from './AnimatedGlowWrapper';
// Ensure this file is named glow-presets-pro.ts and is typed
import { glowPresetsPro } from './glow-presets-pro';
import ColorPicker, {
  Panel1,
  Swatches,
  Preview,
  HueSlider,
} from 'reanimated-color-picker';

// --- Type Definitions (Now using the imported PresetConfig) ---
type PresetKey = keyof typeof glowPresetsPro;
interface CellData {
  key: keyof PresetConfig;
  value: any; // `any` is suitable here as it can be string, number, or string[]
}
interface StructuredRow {
  general?: CellData;
  outer?: CellData;
  inner?: CellData;
}
interface ColorPickerModalProps {
  isVisible: boolean;
  onClose: () => void;
  initialColor: string;
  onComplete: (color: string) => void;
}
interface PresetShowcaseItemProps {
  presetName: string;
  initialPreset: PresetConfig;
}
interface EditableCellProps {
  data: CellData;
  onUpdate: (key: keyof PresetConfig, value: any) => void;
}
interface PresetDebugTableProps {
  preset: PresetConfig;
  onUpdate: (key: keyof PresetConfig, value: any) => void;
}

// --- Helper Components (Typed with imported PresetConfig) ---

const fullDefaultConfig: Required<PresetConfig> = {
  cornerRadius: 10, outlineWidth: 2, borderColor: 'white', animationSpeed: 0.7, randomness: 0.01,
  outerGlowColors: ['#FF0000', '#FF0000'], outerGlowOpacity: 0.15, outerGlowDotSize: 100, outerGlowNumberOfOrbs: 20, outerGlowInset: 15, outerGlowSpeedMultiplier: 1.0, outerGlowScaleAmplitude: 0, outerGlowScaleFrequency: 2.5,
  innerGlowColors: ['#FF0000', '#FF0000'], innerGlowOpacity: 0.3, innerGlowDotSize: 50, innerGlowNumberOfOrbs: 20, innerGlowInset: 15, innerGlowSpeedMultiplier: 1.0, innerGlowScaleAmplitude: 0, innerGlowScaleFrequency: 2.5,
};

const isValidHex = (hex: string): boolean => /^#([A-Fa-f0-9]{3}|[A-Fa-f0-9]{6})$/.test(hex);

const normalizeHex = (hex: string): string => {
  if (/^#[A-Fa-f0-9]{3}$/.test(hex)) {
    const [, r, g, b] = hex.split('');
    return `#${r}${r}${g}${g}${b}${b}`.toUpperCase();
  }
  return hex.toUpperCase();
};

const CustomColorPicker: FC<ColorPickerModalProps> = ({ isVisible, onClose, initialColor, onComplete }) => {
  const [activeColor, setActiveColor] = useState(initialColor);
  const [hexInput, setHexInput] = useState(initialColor);
  const [hexError, setHexError] = useState(false);
  const onColorSelect = useCallback((color: { hex: string }) => {
    'worklet';
    setActiveColor(color.hex);
    setHexInput(color.hex.toUpperCase());
    setHexError(false);
  }, []);
  const handleComplete = () => { onComplete(activeColor); onClose(); };
  const handleHexChange = (text: string) => {
    let value = text;
    if (!value.startsWith('#')) value = '#' + value;
    setHexInput(value);
    if (isValidHex(value)) {
      const normalized = normalizeHex(value);
      setActiveColor(normalized);
      setHexError(false);
    } else {
      setHexError(value.length > 1);
    }
  };
  const handleHexSubmit = () => {
    if (isValidHex(hexInput)) {
      const normalized = normalizeHex(hexInput);
      setActiveColor(normalized);
      setHexInput(normalized);
      setHexError(false);
    }
  };
  useEffect(() => {
    if (isVisible) {
      setActiveColor(initialColor);
      setHexInput(initialColor.toUpperCase());
      setHexError(false);
    }
  }, [isVisible, initialColor]);
  return (
    <Modal visible={isVisible} animationType="fade" transparent={true} onRequestClose={onClose}>
      <View style={styles.modalBackdrop}>
        <View style={styles.modalContainer}>
          <ColorPicker style={styles.colorPickerContainer} value={activeColor} onComplete={onColorSelect}>
            <Preview style={styles.colorPreview} />
            <Panel1 style={styles.colorPanel} />
            <HueSlider style={styles.hueSlider} />
            <Swatches style={styles.swatches} />
          </ColorPicker>
          <View style={styles.hexInputContainer}>
            <View style={[styles.hexInputPreview, { backgroundColor: activeColor }]} />
            <TextInput
              style={[styles.hexInput, hexError && styles.hexInputError]}
              value={hexInput}
              onChangeText={handleHexChange}
              onSubmitEditing={handleHexSubmit}
              placeholder="#FFFFFF"
              placeholderTextColor="#666"
              autoCapitalize="characters"
              autoCorrect={false}
              maxLength={7}
            />
          </View>
          <TouchableOpacity style={[styles.modalButton, styles.modalButtonPrimary]} onPress={handleComplete}>
            <Text style={[styles.modalButtonText, styles.modalButtonTextPrimary]}>Done</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
};

const EditableCell: FC<EditableCellProps> = ({ data, onUpdate }) => {
  const { key, value } = data; const [isEditing, setIsEditing] = useState(false); const [editText, setEditText] = useState(String(value));
  useEffect(() => { if (!isEditing) setEditText(String(value)); }, [value, isEditing]);
  const handleSave = () => { setIsEditing(false); const newValue = parseFloat(editText); if (!isNaN(newValue) && newValue !== value) { onUpdate(key, newValue); } };
  const isColorString = (v: any): v is string => typeof v === 'string' && v.startsWith('#');
  const baseKey = key.replace(/^(outerGlow|innerGlow)/, '');
  const renderValue = () => {
    if (isEditing && typeof value === 'number') { return (<TextInput style={styles.textInputInline} value={editText} onChangeText={setEditText} keyboardType="numeric" autoFocus selectTextOnFocus onSubmitEditing={handleSave} onBlur={handleSave} />); }
    if (isColorString(value)) { return (<View style={styles.cellValueContainer}><View style={[styles.colorSwatch, { backgroundColor: value }]} /><Text style={styles.cellValueText}>{value}</Text></View>); }
    if (Array.isArray(value) && value.every(isColorString)) { return (<View style={styles.cellValueContainer}><View style={styles.colorSwatchGroup}>{value.map((color, index) => (<TouchableOpacity key={index} onPress={() => onUpdate(key, { type: 'edit_color', index, color })} onLongPress={() => onUpdate(key, { type: 'remove_color', index })}><View style={[styles.colorSwatch, { backgroundColor: color, marginRight: 2 }]} /></TouchableOpacity>))}<TouchableOpacity style={styles.addButton} onPress={() => onUpdate(key, { type: 'add_color' })} ><Text style={styles.addButtonText}>+</Text></TouchableOpacity></View></View>); }
    return <Text style={styles.cellValueText}>{String(value)}</Text>;
  };
  return (<TouchableOpacity onPress={() => { if (typeof value === 'number') setIsEditing(true); else if (isColorString(value)) onUpdate(key, { type: 'edit_color', index: null, color: value }); }} disabled={Array.isArray(value)}><Text style={styles.cellKey}>{baseKey}:</Text>{renderValue()}</TouchableOpacity>);
};

const PresetDebugTable: FC<PresetDebugTableProps> = ({ preset, onUpdate }) => {
  const structuredRows = useMemo(() => {
    const general: (keyof PresetConfig)[] = []; const outer: (keyof PresetConfig)[] = []; const inner: (keyof PresetConfig)[] = [];
    (Object.keys(preset) as (keyof PresetConfig)[]).forEach(k => { if (k.startsWith('outerGlow')) outer.push(k); else if (k.startsWith('innerGlow')) inner.push(k); else general.push(k); });
    const baseKeys = [...new Set([...outer.map(k => k.replace('outerGlow', '')), ...inner.map(k => k.replace('innerGlow', ''))])].sort();
    const rows: StructuredRow[] = [];
    for (let j = 0; j < Math.max(general.length, baseKeys.length); j++) {
      const row: StructuredRow = {};
      if (j < general.length) { const key = general[j]; row.general = { key, value: preset[key] }; }
      if (j < baseKeys.length) {
        const baseKey = baseKeys[j];
        const outerKey = `outerGlow${baseKey}` as keyof PresetConfig;
        const innerKey = `innerGlow${baseKey}` as keyof PresetConfig;
        if (outerKey in preset) row.outer = { key: outerKey, value: preset[outerKey] };
        if (innerKey in preset) row.inner = { key: innerKey, value: preset[innerKey] };
      }
      rows.push(row);
    }
    return rows;
  }, [preset]);
  return (<View style={styles.table}><View style={styles.tableHeaderRow}><Text style={styles.tableHeaderText}>General</Text><Text style={styles.tableHeaderText}>Outer Glow</Text><Text style={styles.tableHeaderText}>Inner Glow</Text></View>{structuredRows.map((row, index) => (<View key={index} style={styles.tableContentRow}><View style={styles.tableColumn}>{row.general && <EditableCell data={row.general} onUpdate={onUpdate} />}</View><View style={styles.tableColumn}>{row.outer && <EditableCell data={row.outer} onUpdate={onUpdate} />}</View><View style={styles.tableColumn}>{row.inner && <EditableCell data={row.inner} onUpdate={onUpdate} />}</View></View>))}</View>);
};

// --- MAIN SHOWCASE COMPONENT (manages state for one preset) ---
const PresetShowcaseItem: FC<PresetShowcaseItemProps> = ({ presetName, initialPreset }) => {
  const [config, setConfig] = useState<PresetConfig>(() => ({ ...fullDefaultConfig, ...initialPreset }));
  const [isColorPickerVisible, setColorPickerVisible] = useState(false);
  const [editingColorInfo, setEditingColorInfo] = useState<{ key: keyof PresetConfig; index: number | null } | null>(null);

  const handleUpdate = (key: keyof PresetConfig, value: any) => {
    if (typeof value === 'object' && value !== null && value.type) {
      switch (value.type) {
        case 'edit_color': setEditingColorInfo({ key, index: value.index }); setColorPickerVisible(true); break;
        case 'add_color': setConfig(prev => ({ ...prev, [key]: [...(prev[key] as string[] || []), '#ffffff'] })); break;
        case 'remove_color': setConfig(prev => { const currentColors = prev[key] as string[]; if (currentColors.length <= 1) { Alert.alert("Cannot Remove", "An array must have at least one color."); return prev; } return { ...prev, [key]: currentColors.filter((_, i) => i !== value.index) }; }); break;
      }
    } else { setConfig(prev => ({ ...prev, [key]: value })); }
  };

  const handleColorComplete = (newColor: string) => {
    if (!editingColorInfo) return; const { key, index } = editingColorInfo;
    setConfig(prev => { const newConfig = { ...prev }; if (index === null) { (newConfig as any)[key] = newColor; } else { const newColors = [...(prev[key] as string[])]; newColors[index] = newColor; (newConfig as any)[key] = newColors; } return newConfig; });
    setEditingColorInfo(null);
  };

  const getInitialPickerColor = () => {
    if (!editingColorInfo) return '#ffffff';
    const { key, index } = editingColorInfo;
    const value = config[key];
    if (Array.isArray(value) && index !== null) {
        return value[index] || '#ffffff';
    }
    return (value as string) || '#ffffff';
  }

  return (
    <View style={styles.presetContainer}>
      <CustomColorPicker isVisible={isColorPickerVisible} onClose={() => setColorPickerVisible(false)} initialColor={getInitialPickerColor()} onComplete={handleColorComplete} />
      <Text style={styles.presetTitle}>{presetName}</Text>
      
      <AnimatedGlowWrapper 
        key={JSON.stringify(config)} // Re-mounts the component on config change to restart animations
        {...config}
      >
        <View style={styles.box}>
          <Text style={styles.boxText}>{presetName === 'Default' ? 'Default Glow' : 'PREMIUM'}</Text>
        </View>
      </AnimatedGlowWrapper>

      <PresetDebugTable preset={config} onUpdate={handleUpdate} />
    </View>
  );
};

// --- ROOT APP COMPONENT (Modified) ---
const showcaseDefaultPreset: PresetConfig = {
  outerGlowColors: ['#00FFFF', '#FF00FF', '#FFFF00'],
  innerGlowColors: ['#00FFFF', '#FF00FF', '#FFFF00'],
};
const presetKeys = Object.keys(glowPresetsPro) as PresetKey[];

export default function App() {
  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.mainTitle}>Interactive Glow Showcase</Text>
        <PresetShowcaseItem key="Default" presetName="Default" initialPreset={showcaseDefaultPreset} />
        {presetKeys.map((key) => (
          <PresetShowcaseItem key={key} presetName={key} initialPreset={glowPresetsPro[key]} />
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

// --- Styles (Unchanged) ---
const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#111' },
  container: { backgroundColor: '#111', alignItems: 'center', paddingVertical: 20, paddingHorizontal: 20 },
  mainTitle: { color: 'white', fontSize: 28, fontWeight: 'bold', marginBottom: 20 },
  presetContainer: { width: '100%', alignItems: 'center', marginVertical: 25 },
  presetTitle: { color: '#aaa', fontSize: 16, marginBottom: 10, fontFamily: 'monospace', textAlign: 'center' },
  box: { paddingVertical: 20, paddingHorizontal: 40, backgroundColor: '#222' },
  boxText: { color: 'white', fontWeight: 'bold', fontSize: 16 },
  table: { marginTop: 20, borderWidth: 1, borderColor: '#3a3a3a', borderRadius: 8, width: '100%', maxWidth: 400, backgroundColor: '#1c1c1c' },
  tableHeaderRow: { flexDirection: 'row', paddingVertical: 8, paddingHorizontal: 5, borderBottomWidth: 1, borderBottomColor: '#3a3a3a' },
  tableHeaderText: { flex: 1, color: '#aaa', fontWeight: 'bold', fontSize: 11, textAlign: 'center' },
  tableContentRow: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: '#2f2f2f' },
  tableColumn: { flex: 1, padding: 8, borderRightWidth: 1, borderRightColor: '#2f2f2f' },
  cellKey: { color: '#999', fontFamily: 'monospace', fontSize: 11, marginBottom: 4 },
  cellValueContainer: { flexDirection: 'row', alignItems: 'center' },
  cellValueText: { color: '#eee', fontFamily: 'monospace', fontSize: 11, flexShrink: 1 },
  colorSwatch: { width: 12, height: 12, borderRadius: 3, borderWidth: 1, borderColor: '#555' },
  colorSwatchGroup: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', flex: 1 },
  textInputInline: { color: '#eee', fontFamily: 'monospace', fontSize: 11, padding: 0, width: '100%' },
  modalBackdrop: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.6)' },
  modalContainer: { backgroundColor: '#2c2c2c', borderRadius: 14, padding: 20, width: '85%', maxWidth: 320, elevation: 10, shadowColor: '#000', shadowOpacity: 0.5, shadowRadius: 10, alignItems: 'center' },
  modalButton: { paddingVertical: 12, borderRadius: 8, alignItems: 'center', flex: 1, backgroundColor: '#4a4a4a', width: '100%' },
  modalButtonPrimary: { backgroundColor: '#fff' },
  modalButtonText: { color: 'white', fontWeight: 'bold', fontSize: 16 },
  modalButtonTextPrimary: { color: '#1c1c1c' },
  colorPickerContainer: { gap: 20, width: '100%' },
  colorPreview: {},
  colorPanel: { borderRadius: 10 },
  hueSlider: { borderRadius: 10, height: 12 },
  swatches: { marginTop: 10 },
  addButton: { width: 14, height: 14, borderRadius: 3, borderWidth: 1, borderColor: '#666', borderStyle: 'dashed', justifyContent: 'center', alignItems: 'center', marginLeft: 4, },
  addButtonText: { color: '#999', fontWeight: 'bold', fontSize: 10, lineHeight: 10, textAlign: 'center', },
  hexInputContainer: { flexDirection: 'row', alignItems: 'center', marginTop: 16, marginBottom: 16, width: '100%', gap: 10 },
  hexInputPreview: { width: 36, height: 36, borderRadius: 8, borderWidth: 1, borderColor: '#555' },
  hexInput: { flex: 1, backgroundColor: '#1c1c1c', color: '#eee', fontFamily: 'monospace', fontSize: 16, paddingVertical: 8, paddingHorizontal: 12, borderRadius: 8, borderWidth: 1, borderColor: '#555' },
  hexInputError: { borderColor: '#ff4444' },
});