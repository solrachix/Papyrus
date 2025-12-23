import React from 'react';
import { Modal, View, Text, Pressable, StyleSheet } from 'react-native';
import { useViewerStore } from '../../core/index';
import { DocumentEngine } from '../../types/index';
import { getStrings } from '../strings';
import { IconZoomIn, IconZoomOut } from '../icons';

interface SettingsSheetProps {
  engine: DocumentEngine;
  visible: boolean;
  onClose: () => void;
}

const SettingsSheet: React.FC<SettingsSheetProps> = ({ engine, visible, onClose }) => {
  const { viewMode, uiTheme, zoom, setDocumentState, locale, accentColor, pageTheme } = useViewerStore();
  const isDark = uiTheme === 'dark';
  const isPaged = viewMode === 'single';
  const isDouble = viewMode === 'double';
  const t = getStrings(locale);

  const handleTransition = (mode: 'continuous' | 'paged') => {
    if (mode === 'paged') {
      setDocumentState({ viewMode: 'single' });
      return;
    }
    setDocumentState({ viewMode: isDouble ? 'double' : 'continuous' });
  };

  const handleLayout = (layout: 'single' | 'double') => {
    if (layout === 'double') {
      setDocumentState({ viewMode: 'double' });
      return;
    }
    if (viewMode === 'double') {
      setDocumentState({ viewMode: 'continuous' });
    }
  };

  const handleRotate = (direction: 'clockwise' | 'counterclockwise') => {
    engine.rotate(direction);
    setDocumentState({ rotation: engine.getRotation() });
  };

  const handleZoom = (delta: number) => {
    const next = Math.max(0.5, Math.min(4, zoom + delta));
    engine.setZoom(next);
    setDocumentState({ zoom: next });
  };

  if (!visible) return null;

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.modalRoot}>
        <Pressable style={styles.backdrop} onPress={onClose} />
        <View style={[styles.sheet, isDark && styles.sheetDark]}>
          <View style={[styles.handle, isDark && styles.handleDark]} />

          <View style={styles.section}>
            <Text style={[styles.sectionTitle, isDark && styles.sectionTitleDark]}>{t.appearance}</Text>
            <View style={styles.optionRow}>
              <Pressable
                onPress={() => setDocumentState({ uiTheme: 'light' })}
                style={[
                  styles.optionButton,
                  isDark && styles.optionButtonDark,
                  uiTheme === 'light' && styles.optionButtonActive,
                  uiTheme === 'light' && { backgroundColor: accentColor },
                ]}
              >
                <Text
                  style={[
                    styles.optionText,
                    isDark && styles.optionTextDark,
                    uiTheme === 'light' && styles.optionTextActive,
                  ]}
                >
                  {t.light}
                </Text>
              </Pressable>
              <Pressable
                onPress={() => setDocumentState({ uiTheme: 'dark' })}
                style={[
                  styles.optionButton,
                  isDark && styles.optionButtonDark,
                  uiTheme === 'dark' && styles.optionButtonActive,
                  uiTheme === 'dark' && { backgroundColor: accentColor },
                ]}
              >
                <Text
                  style={[
                    styles.optionText,
                    isDark && styles.optionTextDark,
                    uiTheme === 'dark' && styles.optionTextActive,
                  ]}
                >
                  {t.dark}
                </Text>
              </Pressable>
            </View>
          </View>

          <View style={styles.section}>
            <Text style={[styles.sectionTitle, isDark && styles.sectionTitleDark]}>{t.pageTheme}</Text>
            <View style={styles.optionRow}>
              <Pressable
                onPress={() => setDocumentState({ pageTheme: 'normal' })}
                style={[
                  styles.optionButton,
                  isDark && styles.optionButtonDark,
                  pageTheme === 'normal' && styles.optionButtonActive,
                  pageTheme === 'normal' && { backgroundColor: accentColor },
                ]}
              >
                <Text
                  style={[
                    styles.optionText,
                    isDark && styles.optionTextDark,
                    pageTheme === 'normal' && styles.optionTextActive,
                  ]}
                >
                  {t.themeOriginal}
                </Text>
              </Pressable>
              <Pressable
                onPress={() => setDocumentState({ pageTheme: 'sepia' })}
                style={[
                  styles.optionButton,
                  isDark && styles.optionButtonDark,
                  pageTheme === 'sepia' && styles.optionButtonActive,
                  pageTheme === 'sepia' && { backgroundColor: accentColor },
                ]}
              >
                <Text
                  style={[
                    styles.optionText,
                    isDark && styles.optionTextDark,
                    pageTheme === 'sepia' && styles.optionTextActive,
                  ]}
                >
                  {t.themeSepia}
                </Text>
              </Pressable>
              <Pressable
                onPress={() => setDocumentState({ pageTheme: 'dark' })}
                style={[
                  styles.optionButton,
                  isDark && styles.optionButtonDark,
                  pageTheme === 'dark' && styles.optionButtonActive,
                  pageTheme === 'dark' && { backgroundColor: accentColor },
                ]}
              >
                <Text
                  style={[
                    styles.optionText,
                    isDark && styles.optionTextDark,
                    pageTheme === 'dark' && styles.optionTextActive,
                  ]}
                >
                  {t.themeDark}
                </Text>
              </Pressable>
              <Pressable
                onPress={() => setDocumentState({ pageTheme: 'high-contrast' })}
                style={[
                  styles.optionButton,
                  isDark && styles.optionButtonDark,
                  pageTheme === 'high-contrast' && styles.optionButtonActive,
                  pageTheme === 'high-contrast' && { backgroundColor: accentColor },
                ]}
              >
                <Text
                  style={[
                    styles.optionText,
                    isDark && styles.optionTextDark,
                    pageTheme === 'high-contrast' && styles.optionTextActive,
                  ]}
                >
                  {t.themeContrast}
                </Text>
              </Pressable>
            </View>
          </View>

          <View style={styles.section}>
            <Text style={[styles.sectionTitle, isDark && styles.sectionTitleDark]}>{t.pageTransition}</Text>
            <View style={styles.optionRow}>
              <Pressable
                onPress={() => handleTransition('continuous')}
                style={[
                  styles.optionButton,
                  isDark && styles.optionButtonDark,
                  (!isPaged || isDouble) && styles.optionButtonActive,
                  (!isPaged || isDouble) && { backgroundColor: accentColor },
                ]}
              >
                <Text
                  style={[
                    styles.optionText,
                    isDark && styles.optionTextDark,
                    (!isPaged || isDouble) && styles.optionTextActive,
                  ]}
                >
                  {t.continuous}
                </Text>
              </Pressable>
              <Pressable
                onPress={() => handleTransition('paged')}
                style={[
                  styles.optionButton,
                  isDark && styles.optionButtonDark,
                  isPaged && styles.optionButtonActive,
                  isPaged && { backgroundColor: accentColor },
                ]}
              >
                <Text
                  style={[
                    styles.optionText,
                    isDark && styles.optionTextDark,
                    isPaged && styles.optionTextActive,
                  ]}
                >
                  {t.pageByPage}
                </Text>
              </Pressable>
            </View>
          </View>

          <View style={styles.section}>
            <Text style={[styles.sectionTitle, isDark && styles.sectionTitleDark]}>{t.layout}</Text>
            <View style={styles.optionRow}>
              <Pressable
                onPress={() => handleLayout('single')}
                style={[
                  styles.optionButton,
                  isDark && styles.optionButtonDark,
                  !isDouble && styles.optionButtonActive,
                  !isDouble && { backgroundColor: accentColor },
                ]}
              >
                <Text
                  style={[
                    styles.optionText,
                    isDark && styles.optionTextDark,
                    !isDouble && styles.optionTextActive,
                  ]}
                >
                  {t.singlePage}
                </Text>
              </Pressable>
              <Pressable
                onPress={() => handleLayout('double')}
                style={[
                  styles.optionButton,
                  isDark && styles.optionButtonDark,
                  isDouble && styles.optionButtonActive,
                  isDouble && { backgroundColor: accentColor },
                ]}
              >
                <Text
                  style={[
                    styles.optionText,
                    isDark && styles.optionTextDark,
                    isDouble && styles.optionTextActive,
                  ]}
                >
                  {t.doublePage}
                </Text>
              </Pressable>
            </View>
          </View>

          <View style={styles.section}>
            <Text style={[styles.sectionTitle, isDark && styles.sectionTitleDark]}>{t.rotate}</Text>
            <View style={styles.optionRow}>
              <Pressable
                onPress={() => handleRotate('counterclockwise')}
                style={[styles.optionButton, isDark && styles.optionButtonDark]}
              >
                <Text style={[styles.optionText, isDark && styles.optionTextDark]}>{t.counterclockwise}</Text>
              </Pressable>
              <Pressable
                onPress={() => handleRotate('clockwise')}
                style={[styles.optionButton, isDark && styles.optionButtonDark]}
              >
                <Text style={[styles.optionText, isDark && styles.optionTextDark]}>{t.clockwise}</Text>
              </Pressable>
            </View>
          </View>

          <View style={styles.section}>
            <Text style={[styles.sectionTitle, isDark && styles.sectionTitleDark]}>{t.zoom}</Text>
            <View style={styles.optionRow}>
              <Pressable onPress={() => handleZoom(-0.1)} style={[styles.optionButton, isDark && styles.optionButtonDark]}>
                <IconZoomOut size={16} color={isDark ? '#e5e7eb' : '#111827'} />
              </Pressable>
              <View style={styles.zoomValue}>
                <Text style={[styles.zoomText, isDark && styles.zoomTextDark]}>
                  {Math.round(zoom * 100)}%
                </Text>
              </View>
              <Pressable onPress={() => handleZoom(0.1)} style={[styles.optionButton, isDark && styles.optionButtonDark]}>
                <IconZoomIn size={16} color={isDark ? '#e5e7eb' : '#111827'} />
              </Pressable>
            </View>
          </View>

          <View style={styles.section}>
            <Text style={[styles.sectionTitle, isDark && styles.sectionTitleDark]}>{t.language}</Text>
            <View style={styles.optionRow}>
              <Pressable
                onPress={() => setDocumentState({ locale: 'en' })}
                style={[
                  styles.optionButton,
                  isDark && styles.optionButtonDark,
                  locale === 'en' && styles.optionButtonActive,
                  locale === 'en' && { backgroundColor: accentColor },
                ]}
              >
                <Text
                  style={[
                    styles.optionText,
                    isDark && styles.optionTextDark,
                    locale === 'en' && styles.optionTextActive,
                  ]}
                >
                  {t.english}
                </Text>
              </Pressable>
              <Pressable
                onPress={() => setDocumentState({ locale: 'pt-BR' })}
                style={[
                  styles.optionButton,
                  isDark && styles.optionButtonDark,
                  locale === 'pt-BR' && styles.optionButtonActive,
                  locale === 'pt-BR' && { backgroundColor: accentColor },
                ]}
              >
                <Text
                  style={[
                    styles.optionText,
                    isDark && styles.optionTextDark,
                    locale === 'pt-BR' && styles.optionTextActive,
                  ]}
                >
                  {t.portuguese}
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  modalRoot: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
  },
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 18,
    paddingBottom: 24,
    backgroundColor: '#ffffff',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
  },
  sheetDark: {
    backgroundColor: '#0f1115',
    borderTopColor: '#1f2937',
  },
  handle: {
    width: 44,
    height: 4,
    borderRadius: 999,
    backgroundColor: '#cbd5f5',
    alignSelf: 'center',
    marginTop: 10,
    marginBottom: 12,
  },
  handleDark: {
    backgroundColor: '#374151',
  },
  section: {
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: '#111827',
    marginBottom: 8,
  },
  sectionTitleDark: {
    color: '#e5e7eb',
  },
  optionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
  },
  optionButton: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    backgroundColor: '#e5e7eb',
    marginRight: 8,
    marginBottom: 8,
  },
  optionButtonDark: {
    backgroundColor: '#111827',
  },
  optionButtonActive: {
    backgroundColor: '#2563eb',
  },
  optionText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#111827',
  },
  optionTextDark: {
    color: '#e5e7eb',
  },
  optionTextActive: {
    color: '#ffffff',
  },
  zoomValue: {
    minWidth: 52,
    alignItems: 'center',
    justifyContent: 'center',
  },
  zoomText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#111827',
  },
  zoomTextDark: {
    color: '#e5e7eb',
  },
});

export default SettingsSheet;
