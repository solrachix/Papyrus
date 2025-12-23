import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { useViewerStore } from '@papyrus-sdk/core';
import { getStrings } from '../strings';

const COLOR_SWATCHES = [
  '#fbbf24',
  '#f97316',
  '#ef4444',
  '#10b981',
  '#22d3ee',
  '#3b82f6',
  '#8b5cf6',
  '#ec4899',
  '#f3f4f6',
  '#111827',
];

const ToolDock: React.FC = () => {
  const { selectionActive, uiTheme, locale, annotationColor, setAnnotationColor, accentColor } = useViewerStore();
  const isDark = uiTheme === 'dark';
  const isVisible = selectionActive;
  const t = getStrings(locale);

  if (!isVisible) return null;

  return (
    <View style={[styles.container, isDark && styles.containerDark]}>
      <Text style={[styles.title, isDark && styles.titleDark]}>{t.highlight}</Text>
      <View style={styles.paletteRow}>
        {COLOR_SWATCHES.map((color) => {
          const isSelected = annotationColor === color;
          return (
            <Pressable
              key={color}
              onPress={() => setAnnotationColor(color)}
              style={[
                styles.swatch,
                { backgroundColor: color },
                isSelected && styles.swatchSelected,
                isSelected && { borderColor: accentColor },
              ]}
            />
          );
        })}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    left: 16,
    right: 16,
    bottom: 72,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 16,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    shadowColor: '#000000',
    shadowOpacity: 0.15,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },
  containerDark: {
    backgroundColor: '#0f1115',
    borderColor: '#1f2937',
  },
  title: {
    fontSize: 11,
    fontWeight: '800',
    color: '#111827',
    marginBottom: 8,
  },
  titleDark: {
    color: '#e5e7eb',
  },
  paletteRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  swatch: {
    width: 20,
    height: 20,
    borderRadius: 10,
    marginRight: 8,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  swatchSelected: {
    borderColor: '#2563eb',
    borderWidth: 2,
  },
});

export default ToolDock;
