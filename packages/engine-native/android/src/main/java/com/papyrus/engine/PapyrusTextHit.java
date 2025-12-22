package com.papyrus.engine;

final class PapyrusTextHit {
  final int pageIndex;
  final int matchIndex;
  final String text;
  final float[] rects;

  PapyrusTextHit(int pageIndex, int matchIndex, String text, float[] rects) {
    this.pageIndex = pageIndex;
    this.matchIndex = matchIndex;
    this.text = text;
    this.rects = rects;
  }
}
