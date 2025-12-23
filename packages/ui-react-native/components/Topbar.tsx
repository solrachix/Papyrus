import React, { useEffect, useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { useViewerStore } from '../../core/index';
import { IconSettings, IconChevronLeft, IconChevronRight } from '../icons';
import { DocumentEngine } from '../../types/index';

interface TopbarProps {
  engine: DocumentEngine;
  onOpenSettings?: () => void;
}

const Topbar: React.FC<TopbarProps> = ({ engine, onOpenSettings }) => {
  const {
    currentPage,
    pageCount,
    uiTheme,
    setDocumentState,
    triggerScrollToPage,
    accentColor,
  } = useViewerStore();
  const [pageLabel, setPageLabel] = useState(`${currentPage}`);
  const isDark = uiTheme === 'dark';
  const navIconColor = isDark ? '#e5e7eb' : '#111827';

  useEffect(() => {
    setPageLabel(`${currentPage}`);
  }, [currentPage]);

  const handlePageChange = (delta: number) => {
    const next = Math.max(1, Math.min(pageCount, currentPage + delta));
    engine.goToPage(next);
    setDocumentState({ currentPage: next });
    triggerScrollToPage(next - 1);
  };

  return (
    <View style={[styles.container, isDark && styles.containerDark]}>
      <View style={styles.leftGroup}>
        <View style={[styles.logoBadge, { backgroundColor: accentColor }]}>
          <Text style={styles.logoText}>P</Text>
        </View>
        <Text style={[styles.brandText, isDark && styles.brandTextDark]}>Papyrus</Text>
      </View>

      <View style={styles.pageGroup}>
        <Pressable onPress={() => handlePageChange(-1)} style={[styles.pageButton, isDark && styles.pageButtonDark]}>
          <IconChevronLeft size={16} color={navIconColor} />
        </Pressable>
        <Text style={[styles.pageIndicator, isDark && styles.pageIndicatorDark]}>
          {pageLabel}/{pageCount}
        </Text>
        <Pressable onPress={() => handlePageChange(1)} style={[styles.pageButton, isDark && styles.pageButtonDark]}>
          <IconChevronRight size={16} color={navIconColor} />
        </Pressable>
      </View>

      <View style={styles.rightGroup}>
        <Pressable
          onPress={() => onOpenSettings?.()}
          style={[styles.iconButton, isDark && styles.iconButtonDark]}
        >
          <IconSettings size={16} color={isDark ? '#e5e7eb' : '#111827'} />
        </Pressable>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
    flexDirection: 'row',
    alignItems: 'center',
  },
  containerDark: {
    backgroundColor: '#0f1115',
    borderBottomColor: '#1f2937',
  },
  leftGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
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
    fontSize: 14,
    fontWeight: '800',
    color: '#111827',
  },
  brandTextDark: {
    color: '#f9fafb',
  },
  pageGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
  },
  pageButton: {
    width: 26,
    height: 26,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f3f4f6',
  },
  pageButtonDark: {
    backgroundColor: '#111827',
  },
  pageButtonText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#111827',
  },
  pageButtonTextDark: {
    color: '#e5e7eb',
  },
  pageIndicator: {
    fontSize: 12,
    color: '#374151',
    minWidth: 52,
    textAlign: 'center',
    marginHorizontal: 6,
    fontWeight: '700',
  },
  pageIndicatorDark: {
    color: '#d1d5db',
  },
  rightGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    flex: 1,
  },
  iconButton: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
    backgroundColor: '#f3f4f6',
    marginLeft: 6,
  },
  iconButtonDark: {
    backgroundColor: '#111827',
  },
  iconButtonActive: {
    backgroundColor: '#2563eb',
  },
  iconButtonText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#111827',
  },
  iconButtonTextDark: {
    color: '#e5e7eb',
  },
  iconButtonTextActive: {
    color: '#ffffff',
  },
  iconRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  iconRowSpacer: {
    width: 6,
  },
});

export default Topbar;
