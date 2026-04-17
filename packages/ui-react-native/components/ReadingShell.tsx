import React, { useState } from "react";
import { Keyboard, View, StyleSheet } from "react-native";
import { useViewerStore } from "@papyrus-sdk/core";
import {
  DocumentEngine,
  DocumentType,
  MobilePrimaryDestination,
} from "@papyrus-sdk/types";
import BottomBar from "./BottomBar";
import { DocumentActionsSheet } from "./DocumentActionsSheet";
import { InfoSheet } from "./InfoSheet";
import { OverflowSheet } from "./OverflowSheet";
import { ProgressPill } from "./ProgressPill";
import { PageJumpModal } from "./PageJumpModal";
import { SearchOverlay } from "./SearchOverlay";
import { SearchResultsSheet } from "./SearchResultsSheet";
import SettingsSheet from "./SettingsSheet";
import Topbar from "./Topbar";
import RightSheet from "./RightSheet";
import Viewer from "./Viewer";
import { isSidebarBoundDestination } from "./mobileShell";

type ReadingShellProps = {
  engine: DocumentEngine;
  title?: string;
  documentType?: DocumentType;
  thumbsInitialCount?: number;
  viewerProps?: React.ComponentProps<typeof Viewer>;
};

export function ReadingShell({
  engine,
  title,
  documentType = "pdf",
  thumbsInitialCount,
  viewerProps,
}: ReadingShellProps) {
  const {
    activeMobileDestination,
    closeMobileDestination,
    openMobileDestination,
    setDocumentState,
    setMobileKeyboardOpen,
    triggerScrollToPage,
    sidebarRightOpen,
    currentPage,
    pageCount,
    uiTheme,
    accentColor,
  } = useViewerStore();
  const [overflowOpen, setOverflowOpen] = useState(false);
  const [infoOpen, setInfoOpen] = useState(false);
  const [actionsOpen, setActionsOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [searchResultsOpen, setSearchResultsOpen] = useState(false);
  const [pageJumpOpen, setPageJumpOpen] = useState(false);
  const isDark = uiTheme === "dark";

  React.useEffect(() => {
    const showSubscription = Keyboard.addListener("keyboardDidShow", () => {
      setMobileKeyboardOpen(true);
    });
    const hideSubscription = Keyboard.addListener("keyboardDidHide", () => {
      setMobileKeyboardOpen(false);
    });

    return () => {
      showSubscription.remove();
      hideSubscription.remove();
    };
  }, [setMobileKeyboardOpen]);

  React.useEffect(() => {
    if (sidebarRightOpen) return;
    if (isSidebarBoundDestination(activeMobileDestination)) {
      closeMobileDestination();
    }
  }, [activeMobileDestination, closeMobileDestination, sidebarRightOpen]);

  const openDestination = (destination: MobilePrimaryDestination) => {
    openMobileDestination(destination);
    setOverflowOpen(false);
    setInfoOpen(false);
    setActionsOpen(false);
    setSettingsOpen(false);
    setSearchResultsOpen(false);
    setDocumentState({ sidebarRightOpen: false });

    if (
      destination === "pages" ||
      destination === "contents" ||
      destination === "progress"
    ) {
      setDocumentState({ sidebarRightOpen: true, sidebarRightTab: "pages" });
      return;
    }

    if (destination === "search") {
      setDocumentState({ sidebarRightOpen: false });
      return;
    }

    if (destination === "notes") {
      setDocumentState({
        sidebarRightOpen: true,
        sidebarRightTab: "annotations",
      });
      return;
    }

    if (destination === "display") {
      setSettingsOpen(true);
      return;
    }

    if (destination === "info") {
      setInfoOpen(true);
      return;
    }

    if (destination === "documentActions") {
      setActionsOpen(true);
    }
  };

  const navigateToPage = (page: number) => {
    engine.goToPage(page);
    setDocumentState({ currentPage: page });
    triggerScrollToPage(page - 1);
  };

  return (
    <View style={styles.container} testID="papyrus-rn-reading-shell">
      <Topbar
        engine={engine}
        title={title}
        onOpenOverflow={() => {
          closeMobileDestination();
          setInfoOpen(false);
          setActionsOpen(false);
          setSettingsOpen(false);
          setOverflowOpen(true);
        }}
        onOpenPageJump={() => setPageJumpOpen(true)}
        showPageNavigationControls={false}
      />
      <View style={styles.viewerStage}>
        <Viewer engine={engine} {...viewerProps} />
      </View>
      <ProgressPill
        documentType={documentType}
        onPress={() =>
          openDestination(
            documentType === "pdf"
              ? "pages"
              : documentType === "epub"
              ? "contents"
              : "progress"
          )
        }
        onOpenPageJump={() => setPageJumpOpen(true)}
      />
      <BottomBar
        documentType={documentType}
        onOpenDestination={openDestination}
        onOpenInfo={() => openDestination("info")}
        onOpenSettings={() => openDestination("display")}
      />
      <SearchOverlay
        engine={engine}
        documentType={documentType}
        visible={activeMobileDestination === "search"}
        onClose={() => {
          setSearchResultsOpen(false);
          closeMobileDestination();
        }}
        onOpenResults={() => setSearchResultsOpen(true)}
      />
      <SearchResultsSheet
        documentType={documentType}
        visible={searchResultsOpen}
        onClose={() => setSearchResultsOpen(false)}
      />
      <RightSheet
        engine={engine}
        documentType={documentType}
        thumbsInitialCount={thumbsInitialCount}
        onOpenPageJump={() => setPageJumpOpen(true)}
      />
      <OverflowSheet
        visible={overflowOpen}
        onClose={() => {
          setOverflowOpen(false);
          setSearchResultsOpen(false);
          closeMobileDestination();
        }}
        onOpenActions={() => {
          openDestination("documentActions");
        }}
      />
      <InfoSheet
        visible={infoOpen}
        title={title}
        documentType={documentType}
        onClose={() => {
          setInfoOpen(false);
          closeMobileDestination();
        }}
      />
      <DocumentActionsSheet
        visible={actionsOpen}
        onClose={() => {
          setActionsOpen(false);
          closeMobileDestination();
        }}
      />
      <SettingsSheet
        engine={engine}
        visible={settingsOpen}
        onClose={() => {
          setSettingsOpen(false);
          closeMobileDestination();
        }}
      />
      <PageJumpModal
        visible={pageJumpOpen}
        currentPage={currentPage}
        pageCount={pageCount}
        isDark={isDark}
        accentColor={accentColor}
        onClose={() => setPageJumpOpen(false)}
        onConfirm={navigateToPage}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  viewerStage: {
    flex: 1,
    position: "relative",
  },
});
