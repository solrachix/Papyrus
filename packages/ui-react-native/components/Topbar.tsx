import React, { useEffect, useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { useViewerStore } from '../../core/index';
import { DocumentEngine, PageTheme } from '../../types/index';

interface TopbarProps {
  engine: DocumentEngine;
}

const Topbar: React.FC<TopbarProps> = ({ engine }) => {
  const {
    currentPage,
    pageCount,
    zoom,
    uiTheme,
    pageTheme,
    setDocumentState,
    triggerScrollToPage,
    toggleSidebarRight,
  } = useViewerStore();
  const [pageLabel, setPageLabel] = useState(`${currentPage}`);
  const isDark = uiTheme === 'dark';

  useEffect(() => {
    setPageLabel(`${currentPage}`);
  }, [currentPage]);

  const handleZoom = (delta: number) => {
    const next = Math.max(0.5, Math.min(4, zoom + delta));
    engine.setZoom(next);
    setDocumentState({ zoom: next });
  };

  const handlePageChange = (delta: number) => {
    const next = Math.max(1, Math.min(pageCount, currentPage + delta));
    engine.goToPage(next);
    setDocumentState({ currentPage: next });
    triggerScrollToPage(next - 1);
  };

  const handleCyclePageTheme = () => {
    const order: PageTheme[] = ['normal', 'sepia', 'dark', 'high-contrast'];
    const currentIndex = Math.max(0, order.indexOf(pageTheme));
    const next = order[(currentIndex + 1) % order.length];
    setDocumentState({ pageTheme: next });
  };

  const pageThemeLabel = (() => {
    switch (pageTheme) {
      case 'sepia':
        return 'Filter: Sepia';
      case 'dark':
        return 'Filter: Invert';
      case 'high-contrast':
        return 'Filter: Hi-Contrast';
      default:
        return 'Filter: Normal';
    }
  })();

  return (
    <View style={[styles.container, isDark && styles.containerDark]}>
      <View style={styles.brandRow}>
        <View style={styles.brandGroup}>
          <View style={styles.logoBadge}>
            <Text style={styles.logoText}>P</Text>
          </View>
          <Text style={[styles.brandText, isDark && styles.brandTextDark]}>PapyrusCore</Text>
        </View>
        <View style={styles.brandActions}>
          <Pressable
            onPress={() => toggleSidebarRight('pages')}
            style={[styles.actionChip, isDark && styles.actionChipDark]}
          >
            <Text style={[styles.actionChipText, isDark && styles.actionChipTextDark]}>Pages</Text>
          </Pressable>
          <Pressable
            onPress={() => toggleSidebarRight('search')}
            style={[styles.actionChip, isDark && styles.actionChipDark]}
          >
            <Text style={[styles.actionChipText, isDark && styles.actionChipTextDark]}>Search</Text>
          </Pressable>
          <Pressable
            onPress={() => toggleSidebarRight('annotations')}
            style={[styles.actionChip, isDark && styles.actionChipDark]}
          >
            <Text style={[styles.actionChipText, isDark && styles.actionChipTextDark]}>Notes</Text>
          </Pressable>
        </View>
      </View>

      <View style={styles.controlRow}>
        <View style={styles.controlGroup}>
          <Pressable onPress={() => handlePageChange(-1)} style={styles.controlButton}>
            <Text style={styles.controlButtonText}>Prev</Text>
          </Pressable>
          <Text style={[styles.pageIndicator, isDark && styles.pageIndicatorDark]}>
            {pageLabel}/{pageCount}
          </Text>
          <Pressable onPress={() => handlePageChange(1)} style={styles.controlButton}>
            <Text style={styles.controlButtonText}>Next</Text>
          </Pressable>
        </View>

        <View style={styles.controlGroup}>
          <Pressable onPress={() => handleZoom(-0.1)} style={styles.controlButton}>
            <Text style={styles.controlButtonText}>-</Text>
          </Pressable>
          <Text style={[styles.zoomLabel, isDark && styles.zoomLabelDark]}>
            {Math.round(zoom * 100)}%
          </Text>
          <Pressable onPress={() => handleZoom(0.1)} style={styles.controlButton}>
            <Text style={styles.controlButtonText}>+</Text>
          </Pressable>
        </View>

        <View style={styles.controlGroup}>
          <Pressable
            onPress={handleCyclePageTheme}
            style={[styles.actionChip, isDark && styles.actionChipDark]}
          >
            <Text style={[styles.actionChipText, isDark && styles.actionChipTextDark]}>
              {pageThemeLabel}
            </Text>
          </Pressable>
          <Pressable
            onPress={() => setDocumentState({ uiTheme: isDark ? 'light' : 'dark' })}
            style={[styles.actionChip, isDark && styles.actionChipDark]}
          >
            <Text style={[styles.actionChipText, isDark && styles.actionChipTextDark]}>
              UI: {isDark ? 'Dark' : 'Light'}
            </Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 10,
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  containerDark: {
    backgroundColor: '#0f1115',
    borderBottomColor: '#1f2937',
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  brandGroup: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  logoBadge: {
    width: 26,
    height: 26,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#2563eb',
    marginRight: 8,
  },
  logoText: {
    color: '#ffffff',
    fontWeight: '800',
    fontSize: 13,
  },
  brandText: {
    fontSize: 16,
    fontWeight: '800',
    color: '#111827',
  },
  brandTextDark: {
    color: '#f9fafb',
  },
  brandActions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  controlRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
  },
  controlGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: 10,
    marginBottom: 8,
  },
  controlButton: {
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: '#111827',
    marginHorizontal: 4,
  },
  controlButtonText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#ffffff',
  },
  pageIndicator: {
    fontSize: 12,
    color: '#374151',
    minWidth: 48,
    textAlign: 'center',
    marginHorizontal: 4,
    fontWeight: '600',
  },
  pageIndicatorDark: {
    color: '#d1d5db',
  },
  zoomLabel: {
    fontSize: 12,
    color: '#374151',
    minWidth: 40,
    textAlign: 'center',
    marginHorizontal: 4,
    fontWeight: '600',
  },
  zoomLabelDark: {
    color: '#d1d5db',
  },
  actionChip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
    backgroundColor: '#f3f4f6',
    marginLeft: 6,
  },
  actionChipDark: {
    backgroundColor: '#111827',
  },
  actionChipText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#111827',
  },
  actionChipTextDark: {
    color: '#e5e7eb',
  },
});

export default Topbar;
