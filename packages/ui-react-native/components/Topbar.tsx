import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  Modal,
  TextInput,
} from "react-native";
import { useViewerStore } from "@papyrus-sdk/core";
import { IconSettings, IconChevronLeft, IconChevronRight } from "../icons";
import { DocumentEngine } from "@papyrus-sdk/types";

export interface TopbarProps {
  engine: DocumentEngine;
  onOpenSettings?: () => void;
  onOpenOverflow?: () => void;
  title?: string;
  logo?: React.ReactNode;
  onLogoPress?: () => void;
  logoAccessibilityLabel?: string;
  showPageNavigationControls?: boolean;
}

const Topbar: React.FC<TopbarProps> = ({
  engine,
  onOpenSettings,
  onOpenOverflow,
  title,
  logo,
  onLogoPress,
  logoAccessibilityLabel = "Logo",
  showPageNavigationControls = false,
}) => {
  const {
    currentPage,
    pageCount,
    uiTheme,
    setDocumentState,
    triggerScrollToPage,
    accentColor,
    mobileChromeVisible,
  } = useViewerStore();
  const [pageLabel, setPageLabel] = useState(`${currentPage}`);
  const [jumpModalOpen, setJumpModalOpen] = useState(false);
  const [jumpValue, setJumpValue] = useState(`${currentPage}`);
  const isDark = uiTheme === "dark";
  const navIconColor = isDark ? "#e5e7eb" : "#111827";

  useEffect(() => {
    setPageLabel(`${currentPage}`);
    if (!jumpModalOpen) {
      setJumpValue(`${currentPage}`);
    }
  }, [currentPage, jumpModalOpen]);

  const navigateToPage = (targetPage: number) => {
    const next = Math.max(1, Math.min(pageCount, targetPage));
    engine.goToPage(next);
    setDocumentState({ currentPage: next });
    triggerScrollToPage(next - 1);
  };

  const handlePageChange = (delta: number) => {
    navigateToPage(currentPage + delta);
  };

  const openJumpModal = () => {
    setJumpValue(`${currentPage}`);
    setJumpModalOpen(true);
  };

  const confirmJump = () => {
    const parsed = Number.parseInt(jumpValue, 10);
    if (Number.isNaN(parsed)) {
      setJumpModalOpen(false);
      return;
    }
    navigateToPage(parsed);
    setJumpModalOpen(false);
  };

  const defaultLogo = (
    <View style={[styles.logoBadge, { backgroundColor: accentColor }]}>
      <Text style={styles.logoText}>P</Text>
    </View>
  );
  const logoElement = logo ?? defaultLogo;

  if (!mobileChromeVisible) return null;

  return (
    <>
      <View
        style={[styles.chromeFrame]}
        pointerEvents="box-none"
        testID="papyrus-floating-top-controls"
      >
        <View style={[styles.container, isDark && styles.containerDark]}>
          <View style={styles.leftGroup}>
            {onLogoPress ? (
              <Pressable
                onPress={onLogoPress}
                accessibilityRole="button"
                accessibilityLabel={logoAccessibilityLabel}
                style={styles.logoSlot}
              >
                {logoElement}
              </Pressable>
            ) : (
              <View style={styles.logoSlot}>{logoElement}</View>
            )}
            <Text
              numberOfLines={1}
              style={[styles.brandText, isDark && styles.brandTextDark]}
            >
              {title ?? "Papyrus"}
            </Text>
          </View>

          {showPageNavigationControls ? (
            <View style={styles.pageGroup}>
              <>
                <Pressable
                  onPress={() => handlePageChange(-1)}
                  style={[styles.pageButton, isDark && styles.pageButtonDark]}
                >
                  <IconChevronLeft size={16} color={navIconColor} />
                </Pressable>
                <Pressable
                  onPress={openJumpModal}
                  style={styles.pageIndicatorHit}
                  accessibilityLabel="Page jump"
                >
                  <Text
                    style={[
                      styles.pageIndicator,
                      isDark && styles.pageIndicatorDark,
                    ]}
                  >
                    {pageLabel}/{pageCount}
                  </Text>
                </Pressable>
                <Pressable
                  onPress={() => handlePageChange(1)}
                  style={[styles.pageButton, isDark && styles.pageButtonDark]}
                >
                  <IconChevronRight size={16} color={navIconColor} />
                </Pressable>
              </>
            </View>
          ) : null}

          <View style={styles.rightGroup}>
            <Pressable
              onPress={() => onOpenOverflow?.() ?? onOpenSettings?.()}
              style={[styles.iconButton, isDark && styles.iconButtonDark]}
              accessibilityLabel="Open overflow menu"
            >
              <IconSettings size={16} color={isDark ? "#e5e7eb" : "#111827"} />
            </Pressable>
          </View>
        </View>
      </View>

      <Modal
        visible={jumpModalOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setJumpModalOpen(false)}
      >
        <Pressable
          style={styles.jumpModalBackdrop}
          onPress={() => setJumpModalOpen(false)}
        >
          <Pressable
            style={[styles.jumpModalCard, isDark && styles.jumpModalCardDark]}
            onPress={(event) => event.stopPropagation()}
          >
            <Text
              style={[
                styles.jumpModalTitle,
                isDark && styles.jumpModalTitleDark,
              ]}
            >
              Ir para página
            </Text>
            <TextInput
              value={jumpValue}
              onChangeText={(text) => setJumpValue(text.replace(/[^0-9]/g, ""))}
              keyboardType="number-pad"
              autoFocus
              selectTextOnFocus
              maxLength={6}
              placeholder="1"
              placeholderTextColor={isDark ? "#6b7280" : "#9ca3af"}
              style={[styles.jumpInput, isDark && styles.jumpInputDark]}
              onSubmitEditing={confirmJump}
              accessibilityLabel="Page jump input"
            />
            <View style={styles.jumpActions}>
              <Pressable
                onPress={() => setJumpModalOpen(false)}
                style={[
                  styles.jumpActionButton,
                  styles.jumpActionCancel,
                  isDark && styles.jumpActionCancelDark,
                ]}
              >
                <Text
                  style={[
                    styles.jumpActionText,
                    isDark && styles.jumpActionTextDark,
                  ]}
                >
                  Cancelar
                </Text>
              </Pressable>
              <Pressable
                onPress={confirmJump}
                style={[
                  styles.jumpActionButton,
                  { backgroundColor: accentColor },
                ]}
              >
                <Text
                  style={[styles.jumpActionText, styles.jumpActionTextPrimary]}
                >
                  Ir
                </Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
};

const styles = StyleSheet.create({
  container: {
    marginHorizontal: 12,
    marginTop: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: "rgba(255,255,255,0.88)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.72)",
    borderRadius: 22,
    flexDirection: "row",
    alignItems: "center",
    shadowColor: "#0f172a",
    shadowOpacity: 0.12,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 8,
  },
  containerDark: {
    backgroundColor: "rgba(15,17,21,0.88)",
    borderColor: "rgba(71,85,105,0.48)",
  },
  chromeFrame: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    zIndex: 20,
  },
  leftGroup: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
    minWidth: 0,
  },
  logoBadge: {
    width: 26,
    height: 26,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#2563eb",
  },
  logoSlot: {
    marginRight: 8,
    borderRadius: 10,
  },
  logoText: {
    color: "#ffffff",
    fontWeight: "800",
    fontSize: 13,
  },
  brandText: {
    fontSize: 14,
    fontWeight: "800",
    color: "#111827",
    flexShrink: 1,
    flexGrow: 1,
  },
  brandTextDark: {
    color: "#f9fafb",
  },
  pageGroup: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
    justifyContent: "center",
  },
  pageButton: {
    width: 26,
    height: 26,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#f3f4f6",
  },
  pageButtonDark: {
    backgroundColor: "#111827",
  },
  pageButtonText: {
    fontSize: 11,
    fontWeight: "600",
    color: "#111827",
  },
  pageButtonTextDark: {
    color: "#e5e7eb",
  },
  pageIndicator: {
    fontSize: 12,
    color: "#374151",
    minWidth: 52,
    textAlign: "center",
    marginHorizontal: 6,
    fontWeight: "700",
  },
  pageIndicatorDark: {
    color: "#d1d5db",
  },
  pageIndicatorHit: {
    minWidth: 62,
    paddingVertical: 4,
    borderRadius: 8,
  },
  rightGroup: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    flexShrink: 0,
    marginLeft: 12,
  },
  iconButton: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
    backgroundColor: "#f3f4f6",
    marginLeft: 6,
  },
  iconButtonDark: {
    backgroundColor: "#111827",
  },
  iconButtonActive: {
    backgroundColor: "#2563eb",
  },
  iconButtonText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#111827",
  },
  iconButtonTextDark: {
    color: "#e5e7eb",
  },
  iconButtonTextActive: {
    color: "#ffffff",
  },
  iconRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  iconRowSpacer: {
    width: 6,
  },
  jumpModalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.35)",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
  },
  jumpModalCard: {
    width: "100%",
    maxWidth: 280,
    backgroundColor: "#ffffff",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    padding: 14,
  },
  jumpModalCardDark: {
    backgroundColor: "#0f1115",
    borderColor: "#1f2937",
  },
  jumpModalTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: "#111827",
    marginBottom: 10,
  },
  jumpModalTitleDark: {
    color: "#f3f4f6",
  },
  jumpInput: {
    borderWidth: 1,
    borderColor: "#d1d5db",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 15,
    color: "#111827",
    marginBottom: 12,
  },
  jumpInputDark: {
    borderColor: "#374151",
    color: "#f3f4f6",
    backgroundColor: "#111827",
  },
  jumpActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
  },
  jumpActionButton: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    marginLeft: 8,
    minWidth: 64,
    alignItems: "center",
  },
  jumpActionCancel: {
    backgroundColor: "#f3f4f6",
  },
  jumpActionCancelDark: {
    backgroundColor: "#111827",
  },
  jumpActionText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#111827",
  },
  jumpActionTextDark: {
    color: "#e5e7eb",
  },
  jumpActionTextPrimary: {
    color: "#ffffff",
  },
});

export default Topbar;
