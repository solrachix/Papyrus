import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { useViewerStore } from '@papyrus/core';
import { getStrings } from '../strings';
import { IconDocument, IconGrid, IconSearch, IconComment } from '../icons';

const BottomBar: React.FC = () => {
  const { sidebarRightOpen, sidebarRightTab, toggleSidebarRight, setDocumentState, uiTheme, locale, accentColor } = useViewerStore();
  const isDark = uiTheme === 'dark';
  const t = getStrings(locale);

  const isActive = (tab: 'pages' | 'search' | 'annotations') =>
    sidebarRightOpen && sidebarRightTab === tab;

  const iconColor = (active: boolean) => {
    if (active) return '#ffffff';
    return isDark ? '#e5e7eb' : '#111827';
  };

  return (
    <View style={[styles.container, isDark && styles.containerDark]}>
      <Pressable
        onPress={() => toggleSidebarRight('pages')}
        style={[styles.item, isActive('pages') && styles.itemActive]}
      >
        <View
          style={[
            styles.itemIcon,
            isDark && styles.itemIconDark,
            isActive('pages') && styles.itemIconActive,
            isActive('pages') && { backgroundColor: accentColor },
          ]}
        >
          <IconGrid size={16} color={iconColor(isActive('pages'))} />
        </View>
        <Text
          style={[
            styles.itemLabel,
            isDark && styles.itemLabelDark,
            isActive('pages') && styles.itemLabelActive,
            isActive('pages') && { color: accentColor },
          ]}
        >
          {t.pages}
        </Text>
      </Pressable>

      <Pressable
        onPress={() => toggleSidebarRight('search')}
        style={[styles.item, isActive('search') && styles.itemActive]}
      >
        <View
          style={[
            styles.itemIcon,
            isDark && styles.itemIconDark,
            isActive('search') && styles.itemIconActive,
            isActive('search') && { backgroundColor: accentColor },
          ]}
        >
          <IconSearch size={16} color={iconColor(isActive('search'))} />
        </View>
        <Text
          style={[
            styles.itemLabel,
            isDark && styles.itemLabelDark,
            isActive('search') && styles.itemLabelActive,
            isActive('search') && { color: accentColor },
          ]}
        >
          {t.search}
        </Text>
      </Pressable>

      <Pressable
        onPress={() => setDocumentState({ sidebarRightOpen: false })}
        style={[styles.item, !sidebarRightOpen && styles.itemActive]}
      >
        <View
          style={[
            styles.itemIcon,
            isDark && styles.itemIconDark,
            !sidebarRightOpen && styles.itemIconActive,
            !sidebarRightOpen && { backgroundColor: accentColor },
          ]}
        >
          <IconDocument size={16} color={iconColor(!sidebarRightOpen)} />
        </View>
        <Text
          style={[
            styles.itemLabel,
            isDark && styles.itemLabelDark,
            !sidebarRightOpen && styles.itemLabelActive,
            !sidebarRightOpen && { color: accentColor },
          ]}
        >
          {t.read}
        </Text>
      </Pressable>

      <Pressable
        onPress={() => toggleSidebarRight('annotations')}
        style={[styles.item, isActive('annotations') && styles.itemActive]}
      >
        <View
          style={[
            styles.itemIcon,
            isDark && styles.itemIconDark,
            isActive('annotations') && styles.itemIconActive,
            isActive('annotations') && { backgroundColor: accentColor },
          ]}
        >
          <IconComment size={16} color={iconColor(isActive('annotations'))} />
        </View>
        <Text
          style={[
            styles.itemLabel,
            isDark && styles.itemLabelDark,
            isActive('annotations') && styles.itemLabelActive,
            isActive('annotations') && { color: accentColor },
          ]}
        >
          {t.notes}
        </Text>
      </Pressable>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 12,
    backgroundColor: '#ffffff',
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
  },
  containerDark: {
    backgroundColor: '#0f1115',
    borderTopColor: '#1f2937',
  },
  item: {
    alignItems: 'center',
    paddingHorizontal: 6,
  },
  itemActive: {
    transform: [{ translateY: -2 }],
  },
  itemIcon: {
    width: 28,
    height: 28,
    borderRadius: 10,
    backgroundColor: '#e5e7eb',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  itemIconDark: {
    backgroundColor: '#111827',
    color: '#e5e7eb',
  },
  itemIconActive: {
    backgroundColor: '#2563eb',
    color: '#ffffff',
  },
  itemLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: '#6b7280',
  },
  itemLabelDark: {
    color: '#9ca3af',
  },
  itemLabelActive: {
    color: '#2563eb',
  },
});

export default BottomBar;
