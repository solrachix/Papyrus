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
}
