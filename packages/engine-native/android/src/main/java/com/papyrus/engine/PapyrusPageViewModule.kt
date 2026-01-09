package com.papyrus.engine

import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class PapyrusPageViewModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("PapyrusPageView")
    View(PapyrusPageView::class) {
    }
  }
}
