import React from 'react';
import { View, Text, Pressable, StyleSheet, ScrollView } from 'react-native';
import { useViewerStore } from '../../core/index';

const TOOLS = [
  { id: 'select', label: 'Select' },
  { id: 'highlight', label: 'Highlight' },
  { id: 'strikeout', label: 'Strike' },
  { id: 'text', label: 'Text' },
  { id: 'comment', label: 'Note' },
] as const;

const ToolDock: React.FC = () => {
  const { activeTool, setDocumentState, uiTheme } = useViewerStore();
  const isDark = uiTheme === 'dark';

  return (
    <View style={[styles.container, isDark && styles.containerDark]}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        {TOOLS.map((tool) => {
          const isActive = activeTool === tool.id;
          return (
            <Pressable
              key={tool.id}
              onPress={() => setDocumentState({ activeTool: tool.id })}
              style={[
                styles.toolButton,
                isDark && styles.toolButtonDark,
                isActive && styles.toolButtonActive,
              ]}
            >
              <Text
                style={[
                  styles.toolText,
                  isDark && styles.toolTextDark,
                  isActive && styles.toolTextActive,
                ]}
              >
                {tool.label}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  containerDark: {
    backgroundColor: '#0f1115',
    borderBottomColor: '#1f2937',
  },
  scrollContent: {
    paddingRight: 6,
    alignItems: 'center',
  },
  toolButton: {
    marginRight: 8,
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f3f4f6',
  },
  toolButtonDark: {
    backgroundColor: '#1f2937',
  },
  toolButtonActive: {
    backgroundColor: '#2563eb',
  },
  toolText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#111827',
  },
  toolTextDark: {
    color: '#e5e7eb',
  },
  toolTextActive: {
    color: '#ffffff',
  },
});

export default ToolDock;
