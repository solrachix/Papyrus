import type React from "react";

export interface ReaderHeaderAction {
  label: string;
  content: React.ReactNode;
  onPress?: () => void;
  disabled?: boolean;
}

export interface ReaderBottomAction {
  key: string;
  label: string;
  icon: React.ReactNode;
  onPress?: () => void;
  active?: boolean;
  disabled?: boolean;
}

export interface ReaderChromeInsets {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

export interface ReaderChoiceOption {
  value: string;
  label: string;
  swatchColor?: string;
  swatchForegroundColor?: string;
  /** Font for an "Aa" preview tile (typography choices). */
  previewFontFamily?: string;
}

export interface ReaderSheetAction {
  key: string;
  label: string;
  icon?: React.ReactNode;
  onPress: () => void;
}

export interface ReaderContentsEntry<T = unknown> {
  id: string;
  title: string;
  depth?: number;
  disabled?: boolean;
  value?: T;
}

/** A labelled single-choice row in the reading settings sheet (e.g. typography). */
export interface ReaderSettingsChoiceGroup {
  key: string;
  label: string;
  value: string;
  options: ReaderChoiceOption[];
  onChange: (value: string) => void;
  /**
   * "choice" (default): one option is selected (`value`).
   * "action": momentary buttons with no persistent selection (e.g. rotate
   * left/right); `value` is "" and onChange runs the tapped option.
   */
  kind?: "choice" | "action";
}

/** A −/+ stepper row (zoom, font size). Same shape as ReaderSettingsView's fontSize. */
export interface ReaderSettingsStepper {
  key: string;
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
  /** Value as shown to the reader, e.g. "120%". */
  formattedValue: string;
  decreaseLabel: string;
  increaseLabel: string;
}
