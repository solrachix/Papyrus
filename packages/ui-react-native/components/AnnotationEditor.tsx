import React, { useEffect, useState } from 'react';
import { Modal, View, Text, TextInput, Pressable, StyleSheet } from 'react-native';
import { useViewerStore } from '../../core/index';

const AnnotationEditor: React.FC = () => {
  const { annotations, selectedAnnotationId, updateAnnotation, setSelectedAnnotation, uiTheme } =
    useViewerStore();
  const annotation = annotations.find((ann) => ann.id === selectedAnnotationId);
  const isEditable = annotation && (annotation.type === 'text' || annotation.type === 'comment');
  const [draft, setDraft] = useState('');
  const isDark = uiTheme === 'dark';

  useEffect(() => {
    if (isEditable) {
      setDraft(annotation?.content ?? '');
    }
  }, [annotation?.id, isEditable]);

  if (!isEditable || !annotation) return null;

  const handleClose = () => setSelectedAnnotation(null);
  const handleSave = () => {
    updateAnnotation(annotation.id, { content: draft });
    setSelectedAnnotation(null);
  };

  return (
    <Modal visible transparent animationType="fade" onRequestClose={handleClose}>
      <View style={styles.overlay}>
        <View style={[styles.card, isDark && styles.cardDark]}>
          <Text style={[styles.title, isDark && styles.titleDark]}>Edit note</Text>
          <TextInput
            style={[styles.input, isDark && styles.inputDark]}
            value={draft}
            onChangeText={setDraft}
            placeholder="Write your note..."
            placeholderTextColor={isDark ? '#9ca3af' : '#6b7280'}
            multiline
          />
          <View style={styles.actions}>
            <Pressable onPress={handleClose} style={[styles.actionButton, styles.actionCancel]}>
              <Text style={styles.actionText}>Cancel</Text>
            </Pressable>
            <Pressable onPress={handleSave} style={[styles.actionButton, styles.actionSave]}>
              <Text style={[styles.actionText, styles.actionTextLight]}>Save</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
    padding: 24,
  },
  card: {
    width: '100%',
    borderRadius: 16,
    padding: 16,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  cardDark: {
    backgroundColor: '#0f1115',
    borderColor: '#1f2937',
  },
  title: {
    fontSize: 14,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 12,
  },
  titleDark: {
    color: '#f9fafb',
  },
  input: {
    minHeight: 100,
    borderRadius: 12,
    padding: 12,
    backgroundColor: '#f3f4f6',
    color: '#111827',
    fontSize: 12,
  },
  inputDark: {
    backgroundColor: '#111827',
    color: '#e5e7eb',
  },
  actions: {
    marginTop: 16,
    flexDirection: 'row',
    justifyContent: 'flex-end',
  },
  actionButton: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    marginLeft: 8,
  },
  actionCancel: {
    backgroundColor: '#e5e7eb',
  },
  actionSave: {
    backgroundColor: '#2563eb',
  },
  actionText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#111827',
  },
  actionTextLight: {
    color: '#ffffff',
  },
});

export default AnnotationEditor;
