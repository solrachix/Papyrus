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
