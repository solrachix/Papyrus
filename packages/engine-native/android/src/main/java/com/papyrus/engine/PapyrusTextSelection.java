package com.papyrus.engine;

final class PapyrusTextSelection {
  final String text;
  final float[] rects;

  PapyrusTextSelection(String text, float[] rects) {
    this.text = text != null ? text : "";
    this.rects = rects;
  }
}
