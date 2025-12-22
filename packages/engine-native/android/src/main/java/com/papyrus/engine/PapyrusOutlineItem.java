package com.papyrus.engine;

final class PapyrusOutlineItem {
  final String title;
  final int pageIndex;
  final PapyrusOutlineItem[] children;

  PapyrusOutlineItem(String title, int pageIndex, PapyrusOutlineItem[] children) {
    this.title = title != null ? title : "";
    this.pageIndex = pageIndex;
    this.children = children;
  }
}
