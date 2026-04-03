import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  ScrollView,
  type LayoutChangeEvent,
  type GestureResponderEvent,
} from "react-native";
import { useViewerStore } from "@papyrus-sdk/core";
import { getStrings } from "../mobileStrings";
import {
  IconClose,
  IconRedo,
  IconToolHighlighter,
  IconToolInk,
  IconToolNote,
  IconToolSelect,
  IconToolSquiggly,
  IconToolStrikeout,
  IconToolUnderline,
  IconUndo,
} from "../icons";
import {
  getToolDockDismissState,
  isToolDockToolSelected,
} from "../gesture/selectionInteraction";

const COLOR_SWATCHES = [
  "#fbbf24",
  "#f97316",
  "#ef4444",
  "#10b981",
  "#22d3ee",
  "#3b82f6",
  "#8b5cf6",
  "#ec4899",
  "#f3f4f6",
  "#111827",
] as const;

const PRIMARY_TOOLS = [
  { id: "select", label: "select", icon: IconToolSelect, accent: "#111827" },
  {
    id: "highlight",
    label: "highlight",
    icon: IconToolHighlighter,
    accent: "#f4c430",
  },
  {
    id: "underline",
    label: "underline",
    icon: IconToolUnderline,
    accent: "#111827",
  },
  { id: "ink", label: "ink", icon: IconToolInk, accent: "#111827" },
] as const;

const EXTRA_TOOLS = [
  { id: "comment", label: "note", icon: IconToolNote, accent: "#f4c430" },
  {
    id: "squiggly",
    label: "squiggly",
    icon: IconToolSquiggly,
    accent: "#111827",
  },
  {
    id: "strikeout",
    label: "strikeout",
    icon: IconToolStrikeout,
    accent: "#111827",
  },
] as const;

const ALL_TOOLS = [...PRIMARY_TOOLS, ...EXTRA_TOOLS] as const;
const INK_WIDTHS = [0.003, 0.006, 0.01, 0.014] as const;
const OPACITY_TRACK_PADDING = 6;
const OPACITY_THUMB_SIZE = 22;
const OPACITY_RAIL_HEIGHT = 10;

const getToolAccentColor = (
  tool: (typeof ALL_TOOLS)[number],
  isDark: boolean
) => {
  if (tool.label === "highlight" || tool.label === "note") {
    return "#f4c430";
  }

  return isDark ? "#f8fafc" : "#111827";
};

const getToolLabel = (
  label: (typeof ALL_TOOLS)[number]["label"],
  t: ReturnType<typeof getStrings>
) => {
  if (label === "note") return t.note;
  if (label === "select") return t.select;
  if (label === "underline") return t.underline;
  if (label === "squiggly") return t.squiggly;
  if (label === "strikeout") return t.strikeout;
  if (label === "ink") return t.ink;
  return t.highlight;
};

const OpacitySlider = React.memo(function OpacitySlider({
  value,
  color,
  isDark,
  onCommit,
}: {
  value: number;
  color: string;
  isDark: boolean;
  onCommit: (value: number) => void;
}) {
  const [trackWidth, setTrackWidth] = useState(0);
  const [draftValue, setDraftValue] = useState(value);
  const dragValueRef = useRef(draftValue);
  const isDraggingRef = useRef(false);
  const frameRef = useRef<number | null>(null);

  useEffect(() => {
    if (!isDraggingRef.current) {
      dragValueRef.current = value;
      setDraftValue(value);
    }
  }, [value]);

  useEffect(() => {
    return () => {
      if (frameRef.current !== null) {
        cancelAnimationFrame(frameRef.current);
      }
    };
  }, []);

  const railWidth = Math.max(trackWidth - OPACITY_TRACK_PADDING * 2, 0);
  const thumbOffset =
    railWidth > 0
      ? OPACITY_TRACK_PADDING + railWidth * draftValue - OPACITY_THUMB_SIZE / 2
      : -OPACITY_THUMB_SIZE / 2;
  const fillWidth =
    railWidth > 0
      ? Math.max(OPACITY_THUMB_SIZE / 2, railWidth * draftValue)
      : 0;

  const getOpacityFromTouch = (locationX: number) => {
    if (!railWidth) return null;
    const normalized = (locationX - OPACITY_TRACK_PADDING) / railWidth;
    return Math.min(1, Math.max(0.1, normalized));
  };

  const updateDraft = (event: GestureResponderEvent) => {
    const next = getOpacityFromTouch(event.nativeEvent.locationX);
    if (next === null) return;
    isDraggingRef.current = true;
    dragValueRef.current = next;
    if (frameRef.current !== null) return;
    frameRef.current = requestAnimationFrame(() => {
      frameRef.current = null;
      setDraftValue(dragValueRef.current);
    });
  };

  const commitDraft = (event?: GestureResponderEvent) => {
    const next = event
      ? getOpacityFromTouch(event.nativeEvent.locationX) ?? dragValueRef.current
      : dragValueRef.current;
    isDraggingRef.current = false;
    if (frameRef.current !== null) {
      cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
    }
    dragValueRef.current = next;
    setDraftValue(next);
    onCommit(next);
  };

  return (
    <View style={styles.opacitySliderWrap}>
      <View
        style={styles.opacityTouchSurface}
        onLayout={(event: LayoutChangeEvent) =>
          setTrackWidth(event.nativeEvent.layout.width)
        }
        onStartShouldSetResponder={() => true}
        onMoveShouldSetResponder={() => true}
        onResponderGrant={updateDraft}
        onResponderMove={updateDraft}
        onResponderRelease={commitDraft}
        onResponderTerminate={() => commitDraft()}
      >
        <View style={styles.opacityTrack} />
        <View
          style={[
            styles.opacityTrackFill,
            {
              width: fillWidth,
              backgroundColor: withInkAlpha(color, 0.92),
            },
          ]}
        />
        <View
          style={[
            styles.opacityThumb,
            {
              left: thumbOffset,
              borderColor: isDark ? "#0f172a" : "#ffffff",
            },
          ]}
        />
      </View>
    </View>
  );
});

const ToolDock: React.FC = () => {
  const {
    uiTheme,
    locale,
    annotationColor,
    setAnnotationColor,
    annotationOpacity,
    setAnnotationOpacity,
    inkStrokeWidth,
    setInkStrokeWidth,
    accentColor,
    activeTool,
    interactionMode,
    toolDockOpen,
    setDocumentState,
    annotationUndoStack,
    annotationRedoStack,
    undoAnnotations,
    redoAnnotations,
  } = useViewerStore();
  const [paletteExpanded, setPaletteExpanded] = useState(false);
  const [extrasExpanded, setExtrasExpanded] = useState(false);
  const isDark = uiTheme === "dark";
  const t = getStrings(locale);
  const panelColor = isDark ? "rgba(15,17,21,0.94)" : "rgba(255,255,255,0.96)";
  const borderColor = isDark ? "rgba(71,85,105,0.48)" : "rgba(229,231,235,0.88)";
  const buttonColor = isDark ? "rgba(17,24,39,0.92)" : "#eef1f6";
  const iconColor = isDark ? "#e5e7eb" : "#111827";
  const labelColor = isDark ? "#e5e7eb" : "#374151";
  const utilityIconColor = isDark ? "#f8fafc" : "#111827";

  const selectedTool = useMemo(
    () =>
      ALL_TOOLS.find((tool) =>
        isToolDockToolSelected({
          toolId: tool.id,
          activeTool,
          interactionMode,
        })
      ) ?? PRIMARY_TOOLS[1],
    [activeTool, interactionMode]
  );
  const inkSettingsExpanded = activeTool === "ink";
  const canUndo = annotationUndoStack.length > 0;
  const canRedo = annotationRedoStack.length > 0;

  const applyTool = (toolId: (typeof ALL_TOOLS)[number]["id"]) => {
    if (toolId === "select") {
      const shouldArmSelection =
        activeTool !== "select" || interactionMode !== "select";
      setDocumentState({
        activeTool: "select",
        interactionMode: shouldArmSelection ? "select" : "pan",
      });
      return;
    }
    setDocumentState({
      activeTool: toolId,
      interactionMode: "pan",
    });
  };

  const renderToolButton = (
    tool: (typeof ALL_TOOLS)[number],
    compact = false
  ) => {
    const isSelected = isToolDockToolSelected({
      toolId: tool.id,
      activeTool,
      interactionMode,
    });
    const Icon = tool.icon;

    const baseIconColor = getToolAccentColor(tool, isDark);

    return (
      <Pressable
        key={tool.id}
        onPress={() => {
          applyTool(tool.id);
          if (compact) setExtrasExpanded(false);
        }}
        style={[
          compact ? styles.compactToolButton : styles.toolButton,
          isSelected && {
            backgroundColor: `${accentColor}12`,
            borderColor: `${accentColor}2e`,
          },
        ]}
      >
        <Icon
          size={compact ? 26 : 34}
          color={isSelected ? accentColor : baseIconColor}
        />
      </Pressable>
    );
  };

  return (
    <View pointerEvents="box-none" style={styles.root}>
      {toolDockOpen ? (
        <View style={styles.stack}>
          {paletteExpanded ? (
            <View
              style={[
                styles.popup,
                {
                  backgroundColor: panelColor,
                  borderColor,
                },
              ]}
            >
              <View style={styles.swatchRow}>
                {COLOR_SWATCHES.map((color) => {
                  const isSelected = annotationColor === color;
                  return (
                    <Pressable
                      key={color}
                      onPress={() => setAnnotationColor(color)}
                      style={[
                        styles.swatchOuter,
                        {
                          borderColor: isSelected ? accentColor : "transparent",
                          backgroundColor: isSelected
                            ? `${accentColor}12`
                            : "transparent",
                        },
                      ]}
                    >
                      <View
                        style={[
                          styles.swatch,
                          {
                            backgroundColor: color,
                            borderColor:
                              color === "#f3f4f6" ? "#d1d5db" : "transparent",
                          },
                        ]}
                      />
                    </Pressable>
                  );
                })}
              </View>
            </View>
          ) : null}

          {inkSettingsExpanded ? (
            <View
              style={[
                styles.popup,
                styles.inkPopup,
                {
                  backgroundColor: panelColor,
                  borderColor,
                },
              ]}
            >
              <View style={styles.inkPreviewRow}>
                {INK_WIDTHS.map((width) => {
                  const selected = Math.abs(inkStrokeWidth - width) < 0.0005;
                  return (
                    <Pressable
                      key={width}
                      onPress={() => setInkStrokeWidth(width)}
                      style={[
                        styles.inkWidthButton,
                        selected && {
                          backgroundColor: `${accentColor}12`,
                          borderColor: `${accentColor}30`,
                        },
                      ]}
                    >
                      <View style={styles.inkNib}>
                        <IconToolInk
                          size={Math.round(18 + width * 1200)}
                          color={withInkAlpha(annotationColor, annotationOpacity)}
                        />
                      </View>
                    </Pressable>
                  );
                })}
              </View>
              <OpacitySlider
                value={annotationOpacity}
                color={annotationColor}
                isDark={isDark}
                onCommit={setAnnotationOpacity}
              />
            </View>
          ) : null}

          {extrasExpanded ? (
            <View
              style={[
                styles.popup,
                styles.extrasPopup,
                {
                  backgroundColor: panelColor,
                  borderColor,
                },
              ]}
            >
              <View style={styles.compactToolsRow}>
                {EXTRA_TOOLS.map((tool) => renderToolButton(tool, true))}
              </View>
            </View>
          ) : null}

          <View
            style={[
              styles.container,
              {
                backgroundColor: panelColor,
                borderColor,
              },
            ]}
          >
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              bounces={false}
              contentContainerStyle={styles.primaryToolsRow}
            >
              <Pressable
                onPress={undoAnnotations}
                disabled={!canUndo}
                style={[
                  styles.utilityButton,
                  styles.historyButton,
                  { backgroundColor: buttonColor },
                  !canUndo && styles.disabledButton,
                ]}
              >
                <IconUndo
                  size={16}
                  color={
                    canUndo ? utilityIconColor : isDark ? "#4b5563" : "#9ca3af"
                  }
                  strokeWidth={2.2}
                />
              </Pressable>

              <Pressable
                onPress={redoAnnotations}
                disabled={!canRedo}
                style={[
                  styles.utilityButton,
                  styles.historyButton,
                  { backgroundColor: buttonColor },
                  !canRedo && styles.disabledButton,
                ]}
              >
                <IconRedo
                  size={16}
                  color={
                    canRedo ? utilityIconColor : isDark ? "#4b5563" : "#9ca3af"
                  }
                  strokeWidth={2.2}
                />
              </Pressable>

              {PRIMARY_TOOLS.map((tool) => renderToolButton(tool))}

              <Pressable
                onPress={() => {
                  setExtrasExpanded((value) => !value);
                  setPaletteExpanded(false);
                }}
                style={[
                  styles.utilityButton,
                  { backgroundColor: extrasExpanded ? `${accentColor}12` : buttonColor },
                ]}
              >
                <Text
                  style={[
                    styles.utilityLabel,
                    { color: extrasExpanded ? accentColor : utilityIconColor },
                  ]}
                >
                  +
                </Text>
              </Pressable>

              <Pressable
                onPress={() => {
                  setPaletteExpanded((value) => !value);
                  setExtrasExpanded(false);
                }}
                style={styles.colorButton}
              >
                <View style={[styles.colorRing, { backgroundColor: buttonColor }]}>
                  <View
                    style={[
                      styles.colorCenter,
                      {
                        backgroundColor: annotationColor,
                        borderColor:
                          annotationColor === "#f3f4f6"
                            ? "#d1d5db"
                            : isDark
                            ? "#111827"
                            : "#ffffff",
                      },
                    ]}
                  />
                </View>
              </Pressable>

              <Pressable
                onPress={() =>
                  setDocumentState(
                    getToolDockDismissState({
                      activeTool,
                      interactionMode,
                    })
                  )
                }
                style={[styles.utilityButton, { backgroundColor: buttonColor }]}
              >
                <IconClose
                  size={15}
                  color={utilityIconColor}
                  strokeWidth={2.2}
                />
              </Pressable>
            </ScrollView>
          </View>

          <Text style={[styles.selectionLabel, { color: labelColor }]}>
            {getToolLabel(selectedTool.label, t)}
          </Text>
        </View>
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  root: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "flex-end",
    paddingHorizontal: 0,
    paddingBottom: 72,
  },
  stack: {
    width: "100%",
    maxWidth: 520,
    alignItems: "center",
  },
  container: {
    width: "100%",
    minHeight: 72,
    borderRadius: 28,
    borderWidth: 1,
    paddingLeft: 4,
    paddingRight: 4,
    paddingVertical: 2,
    justifyContent: "center",
    shadowColor: "#000000",
    shadowOpacity: 0.14,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 12 },
    elevation: 8,
  },
  popup: {
    marginBottom: 10,
    borderRadius: 24,
    borderWidth: 1,
    paddingHorizontal: 6,
    paddingVertical: 6,
    shadowColor: "#000000",
    shadowOpacity: 0.1,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 5,
  },
  extrasPopup: {
    alignSelf: "flex-end",
    marginRight: 54,
  },
  inkPopup: {
    width: "58%",
    minWidth: 220,
    alignSelf: "center",
  },
  primaryToolsRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-start",
    gap: 2,
    paddingRight: 0,
  },
  compactToolsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  inkPreviewRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    gap: 6,
    marginBottom: 8,
  },
  inkWidthButton: {
    flex: 1,
    minWidth: 0,
    height: 40,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "transparent",
    alignItems: "center",
    justifyContent: "center",
  },
  inkNib: {
    width: 22,
    height: 24,
    alignItems: "center",
    justifyContent: "center",
  },
  inkNibStroke: {
    width: 18,
    borderRadius: 999,
  },
  opacitySliderWrap: {
    width: "100%",
    justifyContent: "center",
    paddingHorizontal: 4,
  },
  opacityTouchSurface: {
    width: "100%",
    height: OPACITY_THUMB_SIZE + 2,
    justifyContent: "center",
    position: "relative",
  },
  opacityTrack: {
    position: "absolute",
    left: OPACITY_TRACK_PADDING,
    right: OPACITY_TRACK_PADDING,
    top: "50%",
    marginTop: -(OPACITY_RAIL_HEIGHT / 2),
    height: OPACITY_RAIL_HEIGHT,
    borderRadius: 999,
    backgroundColor: "rgba(107,114,128,0.18)",
  },
  opacityTrackFill: {
    position: "absolute",
    left: OPACITY_TRACK_PADDING,
    top: "50%",
    marginTop: -(OPACITY_RAIL_HEIGHT / 2),
    height: OPACITY_RAIL_HEIGHT,
    borderRadius: 999,
  },
  opacityThumb: {
    position: "absolute",
    top: "50%",
    marginTop: -(OPACITY_THUMB_SIZE / 2),
    width: OPACITY_THUMB_SIZE,
    height: OPACITY_THUMB_SIZE,
    borderRadius: 999,
    backgroundColor: "#ffffff",
    borderWidth: 1.5,
    shadowColor: "#000000",
    shadowOpacity: 0.14,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
  },
  toolButton: {
    width: 30,
    height: 44,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "transparent",
    alignItems: "center",
    justifyContent: "center",
  },
  compactToolButton: {
    width: 32,
    height: 42,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "transparent",
    alignItems: "center",
    justifyContent: "center",
  },
  colorButton: {
    alignItems: "center",
    justifyContent: "center",
    marginLeft: 2,
  },
  colorRing: {
    width: 28,
    height: 28,
    borderRadius: 14,
    padding: 3,
    borderWidth: 2.5,
    borderColor: "#7c3aed",
  },
  colorCenter: {
    flex: 1,
    borderRadius: 999,
    borderWidth: 1.5,
  },
  utilityButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    marginLeft: 0,
  },
  historyButton: {
    marginRight: 2,
  },
  disabledButton: {
    opacity: 0.45,
  },
  utilityLabel: {
    fontSize: 22,
    lineHeight: 24,
    fontWeight: "400",
    marginTop: -2,
  },
  swatchRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  swatchOuter: {
    width: 30,
    height: 30,
    borderRadius: 15,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
  },
  swatch: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 1,
  },
  selectionLabel: {
    marginTop: 6,
    fontSize: 10,
    fontWeight: "700",
    textAlign: "center",
  },
});

const withInkAlpha = (hex: string, alpha: number) => {
  const normalized = hex.replace("#", "").trim();
  const value =
    normalized.length === 3
      ? normalized
          .split("")
          .map((c) => c + c)
          .join("")
      : normalized;
  if (value.length !== 6) return hex;
  const r = parseInt(value.slice(0, 2), 16);
  const g = parseInt(value.slice(2, 4), 16);
  const b = parseInt(value.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};

export default ToolDock;
