import React from "react";
import {
  FlatList,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type FlatListProps,
  type ScrollViewProps,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { IconClose } from "../icons";
import { getNativeSheetSizeStyle } from "./nativeSheetLayout";

export type NativeSheetProps = {
  visible: boolean;
  onClose: () => void;
  children: React.ReactNode;
  isDark?: boolean;
  maxHeight?: number | string;
  title?: string;
  closeAccessibilityLabel?: string;
  showHeader?: boolean;
  sheetStyle?: StyleProp<ViewStyle>;
};

export function NativeSheet({
  visible,
  onClose,
  children,
  isDark,
  maxHeight,
  title,
  closeAccessibilityLabel = "Close sheet",
  showHeader = false,
  sheetStyle,
}: NativeSheetProps) {
  return (
    <Modal
      animationType="fade"
      transparent
      visible={visible}
      onRequestClose={onClose}
    >
      <View style={styles.root}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={closeAccessibilityLabel}
          style={styles.backdrop}
          onPress={onClose}
        />
        <View
          style={[
            styles.sheet,
            isDark && styles.sheetDark,
            getNativeSheetSizeStyle(maxHeight),
            sheetStyle,
          ]}
        >
          {showHeader ? (
            <View style={styles.header}>
              <Pressable
                onPress={onClose}
                style={[
                  styles.closeButton,
                  isDark && styles.closeButtonDark,
                ]}
                accessibilityLabel={closeAccessibilityLabel}
              >
                <IconClose size={18} color={isDark ? "#f8fafc" : "#111827"} />
              </Pressable>
              <Text
                style={[styles.title, isDark && styles.titleDark]}
                numberOfLines={1}
              >
                {title}
              </Text>
              <View style={styles.headerSpacer} />
            </View>
          ) : null}
          {children}
        </View>
      </View>
    </Modal>
  );
}

export function NativeSheetScrollView(props: ScrollViewProps) {
  return <ScrollView {...props} />;
}

export function NativeSheetFlatList<ItemT>(props: FlatListProps<ItemT>) {
  return <FlatList {...props} />;
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    justifyContent: "flex-end",
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0, 0, 0, 0.4)",
  },
  sheet: {
    maxHeight: "78%",
    width: "100%",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderTopWidth: 1,
    borderTopColor: "#e5e7eb",
    backgroundColor: "#ffffff",
  },
  sheetDark: {
    borderTopColor: "#1f2937",
    backgroundColor: "#0f1115",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 14,
  },
  headerSpacer: {
    width: 42,
  },
  closeButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#f1f5f9",
  },
  closeButtonDark: {
    backgroundColor: "#111827",
  },
  title: {
    flex: 1,
    textAlign: "center",
    fontSize: 18,
    fontWeight: "800",
    color: "#111827",
  },
  titleDark: {
    color: "#f8fafc",
  },
});
