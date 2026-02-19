import ePub from "epubjs";
import { BaseDocumentEngine } from "@papyrus-sdk/core";
import {
  DocumentLoadInput,
  DocumentLoadRequest,
  DocumentSource,
  DocumentType,
  TextItem,
  OutlineItem,
  FileLike,
  TextSelection,
  PageDestination,
} from "@papyrus-sdk/types";

export class EPUBEngine extends BaseDocumentEngine {
  private book: any = null;
  private spineItems: any[] = [];
  private coverUrl: string | null = null;
  private readerRendition: any = null;
  private readerTarget: HTMLElement | null = null;
  private pageSizes = new Map<number, { width: number; height: number }>();
  private currentPage: number = 1;
  private zoom: number = 1.0;
  private rotation: number = 0;
  private heightSyncVersion = 0;
  private renderVersion = 0;
  private renderLock: Promise<void> = Promise.resolve();
  private pendingHrefDestination: string | null = null;
  private destinationSequence: Array<{ href: string; pageIndex: number }> = [];
  private destinationCursor = -1;
  private lastDestinationNavTime = 0;
  private lastDestinationPageIndex: number | null = null;
  private lastDestinationHref: string | null = null;
  private static readonly A4_RATIO = 1.4142;
  private static readonly USE_INTERNAL_IFRAME_SCROLL = true;
  private static readonly MOBILE_VIEWPORT_MAX_WIDTH_PX = 768;
  private static readonly MOBILE_SHORT_VIEWPORT_MAX_HEIGHT_PX = 500;
  private static readonly INTERNAL_VIEWPORT_PADDING_PX = 10;
  private static readonly MAX_SECTION_HEIGHT = 1_000_000;
  private static readonly HEIGHT_PADDING = 24;

  getRenderTargetType(): "element" {
    return "element";
  }

  async load(input: DocumentLoadInput): Promise<void> {
    try {
      const { source, type } = this.normalizeLoadInput(input);
      if (type && type !== "epub") {
        throw new Error(
          `[EPUBEngine] Tipo de documento não suportado: ${type}`
        );
      }

      this.renderVersion += 1;
      this.renderLock = Promise.resolve();
      this.disposeReader();
      this.pageSizes.clear();
      this.spineItems = [];
      this.coverUrl = null;
      this.destinationSequence = [];
      this.destinationCursor = -1;
      this.lastDestinationNavTime = 0;
      this.lastDestinationPageIndex = null;
      this.lastDestinationHref = null;
      if (this.book?.destroy) this.book.destroy();

      const data = await this.resolveSource(source);

      this.book = ePub(data);
      if (this.book?.opened) {
        await this.book.opened;
      }
      await this.book.ready;
      const packaging =
        (this.book as any)?.package ?? (this.book as any)?.packaging ?? null;
      if (!packaging) {
        throw new Error("[EPUBEngine] packaging indisponivel.");
      }
      if (!(this.book as any).package) {
        (this.book as any).package = packaging;
      }
      if (!(this.book as any).packaging) {
        (this.book as any).packaging = packaging;
      }
      if (this.book?.loaded?.navigation) {
        await this.book.loaded.navigation;
      }
      this.spineItems = this.getLinearSpineItems(this.book.spine?.items ?? []);
      if (typeof this.book.coverUrl === "function") {
        try {
          const resolvedCover = await this.book.coverUrl();
          if (typeof resolvedCover === "string" && resolvedCover.length > 0) {
            this.coverUrl = resolvedCover;
          }
        } catch {
          this.coverUrl = null;
        }
      }
      this.currentPage = 1;
    } catch (error) {
      console.error("[EPUBEngine] Erro ao carregar:", error);
      throw error;
    }
  }

  getPageCount(): number {
    return this.spineItems.length + (this.hasCoverPage() ? 1 : 0);
  }
  getCurrentPage(): number {
    return this.currentPage;
  }
  goToPage(page: number): void {
    if (page < 1 || page > this.getPageCount()) return;
    this.currentPage = page;
    this.pendingHrefDestination = null;

    if (this.destinationSequence.length) {
      const destinationIndex = this.findNearestDestinationIndexByPage(page - 1);
      if (destinationIndex >= 0) this.destinationCursor = destinationIndex;
    }
  }

  async goToDestination(dest: PageDestination): Promise<number | null> {
    const href = this.extractHrefDestination(dest);
    if (!href) {
      const pageIndex = await this.getPageIndex(dest);
      if (pageIndex != null) this.goToPage(pageIndex + 1);
      return pageIndex;
    }

    // If the rendition already shows this exact base file and we're just
    // re-navigating to it without a different anchor, short-circuit.
    const baseHref = this.normalizeHref(href);
    const currentBaseHref = this.lastDestinationHref
      ? this.normalizeHref(this.lastDestinationHref)
      : null;
    const hasAnchor = href.includes("#");
    if (
      !hasAnchor &&
      currentBaseHref &&
      baseHref === currentBaseHref &&
      this.readerRendition
    ) {
      this.debugLog("goToDestination:skip-same-base", {
        href,
        currentBaseHref,
      });
      const pageIndex = await this.resolvePageIndexFromHref(href);
      return pageIndex;
    }

    let releaseCurrent: (() => void) | null = null;
    const previousRender = this.renderLock;
    this.renderLock = new Promise<void>((resolve) => {
      releaseCurrent = resolve;
    });
    await previousRender;

    try {
      this.pendingHrefDestination = href;
      let pageIndex = await this.resolvePageIndexFromHref(href);
      if (pageIndex != null) this.currentPage = pageIndex + 1;
      this.debugLog("goToDestination:start", {
        href,
        pageIndex,
        currentPage: this.currentPage,
      });

      const rendition = this.readerRendition;
      let displayFailed = false;
      if (rendition) {
        try {
          const didDisplay = await this.displayDestinationWithRetry(
            rendition,
            href
          );
          if (!didDisplay)
            throw new Error("Destination display retry exhausted");
          if (pageIndex == null) {
            const locationPageIndex =
              this.getPageIndexFromRenditionLocation(rendition);
            if (locationPageIndex != null) {
              pageIndex = locationPageIndex;
              this.currentPage = locationPageIndex + 1;
            }
          }
          this.debugLog("goToDestination:displayed", {
            href,
            pageIndex,
            currentPage: this.currentPage,
          });
          this.updateDestinationCursor(href, pageIndex);
          this.pendingHrefDestination = null;
          this.lastDestinationNavTime = Date.now();
          this.lastDestinationPageIndex = pageIndex;
          this.lastDestinationHref = href;
          return pageIndex;
        } catch {
          displayFailed = true;
          this.debugLog("goToDestination:display-failed", { href, pageIndex });
          // Rendition may be rebuilding; keep destination pending for renderPage.
        }
      }

      if (
        displayFailed &&
        pageIndex != null &&
        this.readerTarget &&
        typeof this.readerTarget.isConnected === "boolean" &&
        this.readerTarget.isConnected
      ) {
        // Same-spine anchor jumps may need one more render cycle to settle.
        void this.renderPage(pageIndex, this.readerTarget, 1).catch(() => {
          // Keep pending destination for next cycle if this retry also races.
        });
      }

      this.debugLog("goToDestination:no-rendition", {
        href,
        pageIndex,
        currentPage: this.currentPage,
      });
      this.updateDestinationCursor(href, pageIndex);
      return pageIndex;
    } finally {
      releaseCurrent?.();
    }
  }

  async goToAdjacentDestination(delta: number): Promise<number | null> {
    if (!Number.isFinite(delta) || delta === 0) return this.currentPage - 1;
    await this.ensureDestinationSequence();
    if (!this.destinationSequence.length) {
      const basePageIndex = Math.max(0, this.currentPage - 1);
      const nextPageIndex = Math.max(
        0,
        Math.min(this.getPageCount() - 1, basePageIndex + (delta > 0 ? 1 : -1))
      );
      if (nextPageIndex === basePageIndex) return basePageIndex;
      this.goToPage(nextPageIndex + 1);
      return nextPageIndex;
    }

    if (this.destinationCursor < 0) {
      const inferred = this.findNearestDestinationIndexByPage(
        this.currentPage - 1
      );
      this.destinationCursor = inferred >= 0 ? inferred : 0;
    }

    // Find the base href of the current position so we can skip entries
    // that share the same spine file (multiple TOC entries in one .xhtml).
    const currentEntry = this.destinationSequence[this.destinationCursor];
    const currentBaseHref = currentEntry
      ? this.normalizeHref(currentEntry.href)
      : null;

    this.debugLog("goToAdjacentDestination:start", {
      delta,
      cursor: this.destinationCursor,
      total: this.destinationSequence.length,
      currentPage: this.currentPage,
      currentBaseHref,
    });

    // Walk in the delta direction, skipping entries that share the same
    // base href (spine file) as the current position.
    const step = delta > 0 ? 1 : -1;
    let nextIndex = this.destinationCursor;
    const limit = delta > 0 ? this.destinationSequence.length - 1 : 0;
    while (true) {
      const candidate = nextIndex + step;
      if (candidate < 0 || candidate > this.destinationSequence.length - 1)
        break;
      nextIndex = candidate;
      const candidateBaseHref = this.normalizeHref(
        this.destinationSequence[nextIndex].href
      );
      if (!currentBaseHref || candidateBaseHref !== currentBaseHref) break;
    }
    if (nextIndex === this.destinationCursor) {
      this.debugLog("goToAdjacentDestination:at-boundary", {
        delta,
        cursor: this.destinationCursor,
      });
      const current = this.destinationSequence[this.destinationCursor];
      return current?.pageIndex ?? this.currentPage - 1;
    }

    const target = this.destinationSequence[nextIndex];
    if (!target) return null;

    // Always advance the cursor before calling goToDestination to prevent
    // stale cursor from causing infinite same-page navigation loops.
    this.destinationCursor = nextIndex;

    const resolved = await this.goToDestination({
      kind: "href",
      value: target.href,
    });
    if (resolved != null) {
      this.debugLog("goToAdjacentDestination:resolved", {
        delta,
        nextIndex,
        href: target.href,
        resolved,
      });
      return resolved;
    }

    // Revert cursor if navigation failed.
    this.destinationCursor = nextIndex - step;
    this.debugLog("goToAdjacentDestination:failed", {
      delta,
      nextIndex,
      href: target.href,
    });
    return null;
  }

  getDestinationNavigationState(): { hasPrev: boolean; hasNext: boolean } {
    const total = this.destinationSequence.length;
    if (!total) {
      return {
        hasPrev: this.currentPage > 1,
        hasNext: this.currentPage < this.getPageCount(),
      };
    }

    const cursor =
      this.destinationCursor >= 0
        ? this.destinationCursor
        : this.findNearestDestinationIndexByPage(this.currentPage - 1);
    return {
      hasPrev: cursor > 0,
      hasNext: cursor >= 0 && cursor < total - 1,
    };
  }
  setZoom(zoom: number): void {
    this.zoom = Math.max(0.5, Math.min(3.0, zoom));
  }
  getZoom(): number {
    return this.zoom;
  }

  rotate(direction: "clockwise" | "counterclockwise"): void {
    if (direction === "clockwise") this.rotation = (this.rotation + 90) % 360;
    else {
      this.rotation = (this.rotation - 90) % 360;
      if (this.rotation < 0) this.rotation += 360;
    }
  }

  getRotation(): number {
    return this.rotation;
  }

  async getPageDimensions(
    pageIndex: number
  ): Promise<{ width: number; height: number }> {
    const size = this.pageSizes.get(pageIndex);
    if (size) return size;
    return { width: 0, height: 0 };
  }

  async selectText(
    pageIndex: number,
    rect: { x: number; y: number; width: number; height: number }
  ): Promise<TextSelection | null> {
    void pageIndex;
    void rect;
    return null;
  }

  async renderPage(
    pageIndex: number,
    target: any,
    scale: number
  ): Promise<void> {
    let releaseCurrent: (() => void) | null = null;
    const previousRender = this.renderLock;
    this.renderLock = new Promise<void>((resolve) => {
      releaseCurrent = resolve;
    });
    await previousRender;

    try {
      void scale;
      const pageCount = this.getPageCount();
      if (pageCount <= 0) return;
      const safePageIndex = Math.max(0, Math.min(pageCount - 1, pageIndex));
      const renderVersion = ++this.renderVersion;
      const element = target as HTMLElement;
      if (!this.book || !element) return;

      const width = element.clientWidth > 0 ? element.clientWidth : 640;
      const viewportHeightHint = EPUBEngine.USE_INTERNAL_IFRAME_SCROLL
        ? this.getViewportHeightHint(element)
        : null;
      // Avoid carrying an oversized height from a previous long section.
      const rawHeight =
        viewportHeightHint ??
        (element.clientHeight > 0 ? element.clientHeight : 900);
      const normalizedHeight = EPUBEngine.USE_INTERNAL_IFRAME_SCROLL
        ? Math.max(360, Math.min(4000, rawHeight))
        : Math.max(480, Math.min(1400, rawHeight));
      const minA4Height = EPUBEngine.USE_INTERNAL_IFRAME_SCROLL
        ? 0
        : this.getA4MinHeight(width);
      const seedHeight = EPUBEngine.USE_INTERNAL_IFRAME_SCROLL
        ? normalizedHeight
        : Math.max(minA4Height, normalizedHeight);
      if (this.isCoverPage(safePageIndex)) {
        this.renderCoverPage(element, width, seedHeight, safePageIndex);
        if (renderVersion === this.renderVersion) {
          this.currentPage = safePageIndex + 1;
        }
        return;
      }

      const spineItem = this.getSpineItemForPage(safePageIndex);
      if (!spineItem) return;
      const displayTargets = [...this.getDisplayTargetsForSpineItem(spineItem)];
      if (!displayTargets.length) return;
      const defaultSectionIndex =
        typeof spineItem.index === "number" ? spineItem.index : null;
      const pendingHrefDestination = this.pendingHrefDestination;
      let consumedPendingHref = false;
      if (pendingHrefDestination) {
        const pendingPageIndex = await this.resolvePageIndexFromHref(
          pendingHrefDestination
        );
        const pendingMatchesCurrentPage =
          pendingPageIndex === safePageIndex ||
          this.isHrefMatchingSpineItem(pendingHrefDestination, spineItem);
        if (pendingMatchesCurrentPage) {
          consumedPendingHref = true;
          displayTargets.unshift(
            pendingHrefDestination,
            this.decodeHref(pendingHrefDestination)
          );
        }
      }
      const uniqueTargets = this.uniqueDisplayTargets(displayTargets);
      if (!uniqueTargets.length) return;

      element.style.width = `${width}px`;
      element.style.height = `${seedHeight}px`;
      if (width >= 320 && seedHeight >= 480)
        this.pageSizes.set(safePageIndex, { width, height: seedHeight });

      let rendition = this.readerRendition;
      if (!rendition || this.readerTarget !== element) {
        this.disposeReader();
        element.innerHTML = "";
        rendition = this.createRendition(element, width, seedHeight);
        this.readerRendition = rendition;
        this.readerTarget = element;
      } else if (
        typeof rendition.resize === "function" &&
        (rendition as any).manager?.resize
      ) {
        try {
          rendition.resize(width, seedHeight);
        } catch (error) {
          this.disposeReader();
          element.innerHTML = "";
          rendition = this.createRendition(element, width, seedHeight);
          this.readerRendition = rendition;
          this.readerTarget = element;
        }
      }

      if (rendition) {
        const syncVersion = ++this.heightSyncVersion;
        this.applyRenditionTheme(rendition);
        if (renderVersion !== this.renderVersion) return;

        // If goToDestination just navigated to this exact page, skip re-display.
        // The rendition already shows the correct content; re-displaying via
        // spine-item targets would overwrite the href-specific destination.
        const recentDestNav =
          Date.now() - this.lastDestinationNavTime < 200 &&
          this.lastDestinationPageIndex === safePageIndex;
        if (recentDestNav) {
          this.debugLog("renderPage:skip-recent-dest-nav", {
            safePageIndex,
            msSince: Date.now() - this.lastDestinationNavTime,
          });
          // Run height sync without rendition.resize() to avoid resetting
          // the section that goToDestination just displayed.
          await this.syncSectionHeight(
            rendition,
            element,
            safePageIndex,
            width,
            seedHeight,
            defaultSectionIndex,
            true
          );
          if (renderVersion !== this.renderVersion) return;
          // Schedule deferred re-measurements so progressively-rendered
          // content gets its full height even after the initial sync.
          this.scheduleHeightSync(
            syncVersion,
            rendition,
            element,
            safePageIndex,
            width,
            seedHeight,
            defaultSectionIndex,
            true
          );
          if (renderVersion === this.renderVersion) {
            this.currentPage = safePageIndex + 1;
          }
        } else {
          const sectionIndex = await this.displayWithFallback(
            rendition,
            uniqueTargets,
            () => renderVersion !== this.renderVersion
          );
          if (sectionIndex === undefined) return;
          if (renderVersion !== this.renderVersion) return;
          if (
            consumedPendingHref &&
            pendingHrefDestination &&
            pendingHrefDestination.includes("#")
          ) {
            const anchored = await this.displayDestinationWithRetry(
              rendition,
              pendingHrefDestination
            );
            this.debugLog("renderPage:anchor-second-pass", {
              href: pendingHrefDestination,
              anchored,
            });
            if (renderVersion !== this.renderVersion) return;
          }
          await this.syncSectionHeight(
            rendition,
            element,
            safePageIndex,
            width,
            seedHeight,
            sectionIndex ?? defaultSectionIndex
          );
          if (renderVersion !== this.renderVersion) return;
          this.scheduleHeightSync(
            syncVersion,
            rendition,
            element,
            safePageIndex,
            width,
            seedHeight,
            sectionIndex ?? defaultSectionIndex
          );
          if (renderVersion === this.renderVersion) {
            if (consumedPendingHref) this.pendingHrefDestination = null;
            this.currentPage = safePageIndex + 1;
          }
        }
      }
    } finally {
      releaseCurrent?.();
    }
  }

  async renderTextLayer(
    pageIndex: number,
    container: any,
    scale: number
  ): Promise<void> {
    void pageIndex;
    void scale;
    const element = container as HTMLElement;
    if (element) element.innerHTML = "";
  }

  async getTextContent(pageIndex: number): Promise<TextItem[]> {
    if (!this.book) return [];
    if (this.isCoverPage(pageIndex)) return [];
    const spineIndex = this.toSpineIndex(pageIndex);
    if (spineIndex < 0) return [];
    const spineItem = this.spineItems[spineIndex];
    if (!spineItem) return [];

    try {
      const section = this.book.spine.get(spineItem.idref || spineItem.href);
      const text =
        typeof section?.text === "function" ? await section.text() : "";
      if (!text) return [];
      return [
        {
          str: text,
          dir: "ltr",
          width: 0,
          height: 0,
          transform: [1, 0, 0, 1, 0, 0],
          fontName: "default",
        },
      ];
    } catch {
      return [];
    }
  }

  async getOutline(): Promise<OutlineItem[]> {
    if (!this.book) return [];
    const nav = await this.book.loaded?.navigation;
    const toc = nav?.toc ?? [];
    if (!toc.length) return [];
    await this.ensureDestinationSequence();

    const mapItem = async (item: any): Promise<OutlineItem> => {
      const title = item.label || item.title || "";
      const href = item.href || "";
      const resolvedIndex = await this.resolvePageIndexFromHref(href);
      const pageIndex = resolvedIndex ?? -1;
      const children = Array.isArray(item.subitems)
        ? await Promise.all(item.subitems.map(mapItem))
        : [];
      const outlineItem: OutlineItem = { title, pageIndex };
      if (href) {
        outlineItem.dest = { kind: "href", value: href };
      }
      if (children.length > 0) outlineItem.children = children;
      return outlineItem;
    };

    return await Promise.all(toc.map(mapItem));
  }

  async getPageIndex(dest: PageDestination): Promise<number | null> {
    if (!dest) return null;
    if (typeof dest === "string")
      return await this.resolvePageIndexFromHref(dest);
    if (dest.kind === "href")
      return await this.resolvePageIndexFromHref(dest.value);
    if (dest.kind === "pageIndex")
      return Math.max(0, Math.min(this.getPageCount() - 1, dest.value));
    if (dest.kind === "pageNumber")
      return Math.max(0, Math.min(this.getPageCount() - 1, dest.value - 1));
    return null;
  }

  destroy(): void {
    this.renderVersion += 1;
    this.renderLock = Promise.resolve();
    this.pendingHrefDestination = null;
    this.destinationSequence = [];
    this.destinationCursor = -1;
    this.lastDestinationNavTime = 0;
    this.lastDestinationPageIndex = null;
    this.lastDestinationHref = null;
    this.disposeReader();
    this.pageSizes.clear();
    if (this.book?.destroy) this.book.destroy();
    this.book = null;
    this.spineItems = [];
    this.coverUrl = null;
  }

  private applyRenditionTheme(rendition: any): void {
    if (!rendition) return;
    const fontSize = "100%";
    if (rendition.themes?.fontSize) {
      rendition.themes.fontSize(fontSize);
    } else if (rendition.themes?.override) {
      rendition.themes.override("font-size", fontSize);
    }
  }

  private getSpineIndexByHref(href: string): number {
    const normalized = this.normalizeHref(href);
    const decoded = this.decodeHref(normalized);
    if (!normalized) return -1;
    const candidates = new Set<string>([normalized, decoded].filter(Boolean));
    const exactIndex = this.spineItems.findIndex((item) => {
      const itemHref = this.normalizeHref(item.href);
      const itemDecoded = this.decodeHref(itemHref);
      return candidates.has(itemHref) || candidates.has(itemDecoded);
    });
    if (exactIndex >= 0) return exactIndex;

    return this.spineItems.findIndex((item) => {
      const itemHref = this.normalizeHref(item.href);
      if (!itemHref) return false;
      const itemDecoded = this.decodeHref(itemHref);
      for (const candidate of candidates) {
        if (
          itemHref.endsWith(candidate) ||
          candidate.endsWith(itemHref) ||
          itemDecoded.endsWith(candidate) ||
          candidate.endsWith(itemDecoded)
        ) {
          return true;
        }
      }
      return false;
    });
  }

  private normalizeHref(href: string): string {
    if (!href) return "";
    return href.split("#")[0];
  }

  private decodeHref(href: string): string {
    if (!href) return "";
    try {
      return decodeURIComponent(href);
    } catch {
      return href;
    }
  }

  private getSectionFromHref(href: string): any | null {
    const normalized = this.normalizeHref(href);
    if (!normalized || !this.book?.spine?.get) return null;
    const decoded = this.decodeHref(normalized);
    const candidates = [normalized, decoded];

    for (const candidate of candidates) {
      if (!candidate) continue;
      try {
        const section = this.book.spine.get(candidate);
        if (section) return section;
      } catch {
        // Try next candidate.
      }
    }

    return null;
  }

  private getSpineItemForPage(pageIndex: number): any | null {
    const spineIndex = this.toSpineIndex(pageIndex);
    if (spineIndex < 0 || spineIndex >= this.spineItems.length) return null;
    return this.spineItems[spineIndex] ?? null;
  }

  private getSpineIndexForSection(section: any): number {
    if (!section) return -1;

    const sectionIdRef =
      typeof section?.idref === "string" ? section.idref.trim() : "";
    if (sectionIdRef) {
      const idrefIndex = this.spineItems.findIndex(
        (item) =>
          typeof item?.idref === "string" && item.idref.trim() === sectionIdRef
      );
      if (idrefIndex >= 0) return idrefIndex;
    }

    const sectionHref =
      typeof section?.href === "string" ? this.normalizeHref(section.href) : "";
    if (sectionHref) {
      const hrefIndex = this.getSpineIndexByHref(sectionHref);
      if (hrefIndex >= 0) return hrefIndex;
    }

    if (typeof section?.index === "number" && section.index >= 0) {
      const directItem = this.spineItems[section.index];
      if (directItem) {
        const directHref = this.normalizeHref(directItem?.href ?? "");
        const directIdRef =
          typeof directItem?.idref === "string" ? directItem.idref.trim() : "";
        const hasSameHref = Boolean(sectionHref && directHref === sectionHref);
        const hasSameIdRef = Boolean(
          sectionIdRef && directIdRef && directIdRef === sectionIdRef
        );
        if (hasSameHref || hasSameIdRef) return section.index;
      }
    }

    return -1;
  }

  private getPageIndexFromSection(section: any): number | null {
    const spineIndex = this.getSpineIndexForSection(section);
    if (spineIndex < 0) return null;
    return this.toPageIndexFromSpine(spineIndex);
  }

  private isHrefMatchingSpineItem(href: string, spineItem: any): boolean {
    const normalizedCandidate = this.normalizeHref(href);
    if (!normalizedCandidate) return false;
    const decodedCandidate = this.decodeHref(normalizedCandidate);
    const itemHref = this.normalizeHref(spineItem?.href ?? "");
    if (!itemHref) return false;
    const itemDecoded = this.decodeHref(itemHref);

    for (const candidate of [normalizedCandidate, decodedCandidate]) {
      if (!candidate) continue;
      if (
        itemHref === candidate ||
        itemDecoded === candidate ||
        itemHref.endsWith(candidate) ||
        candidate.endsWith(itemHref) ||
        itemDecoded.endsWith(candidate) ||
        candidate.endsWith(itemDecoded)
      ) {
        return true;
      }
    }

    return false;
  }

  private uniqueDisplayTargets(
    targets: Array<string | number>
  ): Array<string | number> {
    const deduped: Array<string | number> = [];
    const seen = new Set<string>();
    for (const target of targets) {
      if (typeof target !== "string" && typeof target !== "number") continue;
      const normalized =
        typeof target === "string" ? target.trim() : String(target).trim();
      if (!normalized) continue;
      const key = `${typeof target}:${normalized}`;
      if (seen.has(key)) continue;
      seen.add(key);
      deduped.push(target);
    }
    return deduped;
  }

  private getDisplayTargetsForSpineItem(
    spineItem: any
  ): Array<string | number> {
    const targets: Array<string | number> = [];
    const seen = new Set<string>();

    const pushTarget = (value: unknown) => {
      if (typeof value !== "string" && typeof value !== "number") return;
      const normalized =
        typeof value === "string" ? value.trim() : String(value).trim();
      if (!normalized) return;
      const key = `${typeof value}:${normalized}`;
      if (seen.has(key)) return;
      seen.add(key);
      targets.push(value);
    };

    pushTarget(spineItem?.href);
    pushTarget(this.decodeHref(spineItem?.href ?? ""));
    pushTarget(spineItem?.idref);
    pushTarget(spineItem?.cfiBase);
    if (typeof spineItem?.index === "number") pushTarget(spineItem.index);

    const sectionFromHref = this.getSectionFromHref(spineItem?.href ?? "");
    if (sectionFromHref) {
      pushTarget(sectionFromHref.href);
      pushTarget(sectionFromHref.idref);
      pushTarget(sectionFromHref.cfiBase);
      if (typeof sectionFromHref.index === "number")
        pushTarget(sectionFromHref.index);
    }

    return targets;
  }

  private normalizeDestinationKey(href: string): string {
    if (!href) return "";
    const trimmed = href.trim();
    if (!trimmed) return "";
    return this.decodeHref(trimmed).toLowerCase();
  }

  private findDestinationIndexByHref(href: string): number {
    const candidate = this.normalizeDestinationKey(href);
    if (!candidate || !this.destinationSequence.length) return -1;

    const exact = this.destinationSequence.findIndex(
      (entry) => this.normalizeDestinationKey(entry.href) === candidate
    );
    if (exact >= 0) return exact;

    return this.destinationSequence.findIndex((entry) => {
      const key = this.normalizeDestinationKey(entry.href);
      return (
        key === candidate || key.endsWith(candidate) || candidate.endsWith(key)
      );
    });
  }

  private findNearestDestinationIndexByPage(pageIndex: number): number {
    if (!this.destinationSequence.length) return -1;
    const candidates = this.destinationSequence
      .map((entry, idx) => ({ idx, pageIndex: entry.pageIndex }))
      .filter((entry) => entry.pageIndex <= pageIndex);
    if (candidates.length) return candidates[candidates.length - 1].idx;

    const firstNext = this.destinationSequence.findIndex(
      (entry) => entry.pageIndex >= pageIndex
    );
    return firstNext >= 0 ? firstNext : this.destinationSequence.length - 1;
  }

  private async ensureDestinationSequence(): Promise<void> {
    if (this.destinationSequence.length) return;
    if (!this.book?.loaded?.navigation) return;

    const nav = await this.book.loaded.navigation;
    const toc = nav?.toc ?? [];
    if (!Array.isArray(toc) || !toc.length) return;

    const hrefs: string[] = [];
    const walk = (items: any[]) => {
      for (const item of items) {
        const href = typeof item?.href === "string" ? item.href.trim() : "";
        if (href) hrefs.push(href);
        if (Array.isArray(item?.subitems) && item.subitems.length) {
          walk(item.subitems);
        }
      }
    };
    walk(toc);

    if (!hrefs.length) return;

    const deduped: string[] = [];
    const seen = new Set<string>();
    for (const href of hrefs) {
      const key = this.normalizeDestinationKey(href);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      deduped.push(href);
    }

    const sequence: Array<{ href: string; pageIndex: number }> = [];
    for (const href of deduped) {
      const pageIndex = await this.resolvePageIndexFromHref(href);
      if (pageIndex == null) continue;
      sequence.push({ href, pageIndex });
    }

    this.destinationSequence = sequence;
    if (this.destinationCursor < 0 && sequence.length) {
      this.destinationCursor = this.findNearestDestinationIndexByPage(
        this.currentPage - 1
      );
    }
  }

  private updateDestinationCursor(
    href: string,
    pageIndex: number | null | undefined
  ): void {
    if (!this.destinationSequence.length) {
      void this.ensureDestinationSequence().then(() => {
        if (!this.destinationSequence.length) return;
        this.updateDestinationCursor(href, pageIndex);
      });
      return;
    }

    const byHref = this.findDestinationIndexByHref(href);
    if (byHref >= 0) {
      this.destinationCursor = byHref;
      return;
    }

    if (typeof pageIndex === "number" && pageIndex >= 0) {
      const byPage = this.findNearestDestinationIndexByPage(pageIndex);
      if (byPage >= 0) this.destinationCursor = byPage;
    }
  }

  private getSectionFromTarget(target: string | number): any | null {
    if (!this.book?.spine?.get) return null;
    try {
      const section = this.book.spine.get(target);
      if (section) return section;
    } catch {
      // Try fallback by href parsing.
    }

    if (typeof target === "string") {
      return this.getSectionFromHref(target);
    }
    return null;
  }

  private getPageIndexFromRenditionLocation(rendition: any): number | null {
    const location = rendition?.currentLocation?.();
    if (!location) return null;

    const starts = Array.isArray(location)
      ? location.map((entry) => entry?.start).filter(Boolean)
      : [location?.start];
    for (const start of starts) {
      if (!start) continue;

      const href =
        typeof start?.href === "string" ? this.normalizeHref(start.href) : "";
      if (href) {
        const hrefIndex = this.getSpineIndexByHref(href);
        if (hrefIndex >= 0) return this.toPageIndexFromSpine(hrefIndex);
      }

      if (typeof start?.index === "number" && start.index >= 0) {
        const section = this.getSectionFromTarget(start.index);
        const sectionPageIndex = this.getPageIndexFromSection(section);
        if (sectionPageIndex != null) return sectionPageIndex;
      }
    }

    return null;
  }

  private isNoSectionError(error: unknown): boolean {
    if (!error || typeof error !== "object") return false;
    const message =
      "message" in error && typeof (error as any).message === "string"
        ? ((error as any).message as string)
        : "";
    return message.includes("No Section Found");
  }

  private isTransientDisplayError(error: unknown): boolean {
    if (!error || typeof error !== "object") return false;
    const message =
      "message" in error && typeof (error as any).message === "string"
        ? ((error as any).message as string)
        : "";
    if (!message) return false;
    const normalized = message.toLowerCase();
    return (
      normalized.includes("cannot read properties of undefined") ||
      normalized.includes("cannot read properties of null") ||
      normalized.includes("reading 'package'") ||
      normalized.includes('reading "package"')
    );
  }

  private async displayWithFallback(
    rendition: any,
    targets: Array<string | number>,
    isCancelled: () => boolean
  ): Promise<number | null | undefined> {
    for (const target of targets) {
      if (isCancelled()) return null;
      try {
        await rendition.display(target);
        if (isCancelled()) return null;
        const section = this.getSectionFromTarget(target);
        return typeof section?.index === "number" ? section.index : null;
      } catch (error) {
        if (
          this.isNoSectionError(error) ||
          this.isTransientDisplayError(error)
        ) {
          continue;
        }
        throw error;
      }
    }

    return undefined;
  }

  private async displayDestinationWithRetry(
    rendition: any,
    href: string
  ): Promise<boolean> {
    const targets = this.uniqueDisplayTargets([href, this.decodeHref(href)]);
    if (!targets.length) return false;
    const hasAnchor = href.includes("#");

    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        const firstPass = await this.displayWithFallback(
          rendition,
          targets,
          () => false
        );
        if (firstPass === undefined) {
          this.debugLog("displayDestinationWithRetry:first-pass-miss", {
            href,
            attempt,
          });
          continue;
        }

        if (!hasAnchor) return true;

        // Anchor destinations can require a second pass in EPUB.js when the
        // first pass stabilizes section context and the second applies hash.
        await new Promise((resolve) => setTimeout(resolve, 0));
        const secondPass = await this.displayWithFallback(
          rendition,
          targets,
          () => false
        );
        if (secondPass !== undefined) return true;
        this.debugLog("displayDestinationWithRetry:second-pass-miss", {
          href,
          attempt,
        });
      } catch {
        // Retry for transient rendition lifecycle races.
        this.debugLog("displayDestinationWithRetry:error", { href, attempt });
      }
      await new Promise((resolve) => setTimeout(resolve, 40 * (attempt + 1)));
    }

    return false;
  }

  private isDebugEnabled(): boolean {
    try {
      const globalFlag = Boolean((globalThis as any)?.__PAPYRUS_EPUB_DEBUG__);
      if (globalFlag) return true;

      const localStorageRef = (globalThis as any)?.localStorage;
      if (!localStorageRef) return false;
      const persisted = localStorageRef.getItem("papyrus:epubDebug");
      return persisted === "1" || persisted === "true";
    } catch {
      return false;
    }
  }

  private debugLog(message: string, payload?: unknown): void {
    if (!this.isDebugEnabled()) return;
    if (payload === undefined) {
      console.log("[EPUBEngine]", message);
      return;
    }
    console.log("[EPUBEngine]", message, payload);
  }

  private async syncSectionHeight(
    rendition: any,
    element: HTMLElement,
    pageIndex: number,
    width: number,
    seedHeight: number,
    targetSectionIndex: number | null,
    skipResize = false
  ): Promise<void> {
    if (EPUBEngine.USE_INTERNAL_IFRAME_SCROLL) {
      const fallbackHeight = Math.max(360, Math.ceil(seedHeight));
      element.style.height = `${fallbackHeight}px`;
      this.pageSizes.set(pageIndex, { width, height: fallbackHeight });

      if (
        !skipResize &&
        typeof rendition?.resize === "function" &&
        (rendition as any).manager?.resize
      ) {
        try {
          rendition.resize(width, fallbackHeight);
        } catch {
          // Ignore resize race for manager lifecycle edge cases.
        }
      }
      return;
    }

    const measureElementHeight = (
      elementToMeasure: Element | null | undefined
    ): number => {
      const measuredElement = elementToMeasure as
        | HTMLElement
        | null
        | undefined;
      if (!measuredElement) return 0;
      const rectHeight =
        typeof measuredElement.getBoundingClientRect === "function"
          ? measuredElement.getBoundingClientRect().height
          : 0;
      return Math.max(
        measuredElement.scrollHeight ?? 0,
        measuredElement.offsetHeight ?? 0,
        measuredElement.clientHeight ?? 0,
        Number.isFinite(rectHeight) ? rectHeight : 0
      );
    };

    const measureDocumentHeight = (
      doc: Document | null | undefined
    ): number => {
      if (!doc) return 0;
      return Math.max(
        measureElementHeight(doc.documentElement),
        measureElementHeight(doc.body)
      );
    };

    const measureContentHeight = (strictTarget: boolean): number => {
      let measured = 0;
      const contents =
        typeof rendition?.getContents === "function"
          ? rendition.getContents()
          : [];

      if (Array.isArray(contents)) {
        for (const content of contents) {
          if (
            strictTarget &&
            targetSectionIndex !== null &&
            typeof content?.sectionIndex === "number" &&
            content.sectionIndex !== targetSectionIndex
          ) {
            continue;
          }
          const doc = content?.document;
          if (!doc) continue;
          measured = Math.max(measured, measureDocumentHeight(doc));
        }
      }

      if (measured > 0) return measured;

      const frameSelector =
        strictTarget && targetSectionIndex !== null
          ? `.epub-view[ref="${targetSectionIndex}"] iframe`
          : "iframe";
      const frame = element.querySelector(
        frameSelector
      ) as HTMLIFrameElement | null;
      const fallbackFrame =
        frame ??
        ((strictTarget && targetSectionIndex !== null
          ? element.querySelector("iframe")
          : null) as HTMLIFrameElement | null);
      const selectedFrame = fallbackFrame ?? frame;
      const frameDoc = selectedFrame?.contentDocument;
      if (!frameDoc) return 0;
      return measureDocumentHeight(frameDoc);
    };

    let contentHeight = measureContentHeight(true);
    if (contentHeight <= 0 && targetSectionIndex !== null) {
      // Fallback when section index tagging differs from loaded content views.
      contentHeight = measureContentHeight(false);
    }
    if (contentHeight <= 0) {
      await new Promise((resolve) => setTimeout(resolve, 0));
      contentHeight = measureContentHeight(true);
      if (contentHeight <= 0 && targetSectionIndex !== null) {
        contentHeight = measureContentHeight(false);
      }
    }

    const measuredTarget =
      contentHeight > 0
        ? Math.ceil(contentHeight + EPUBEngine.HEIGHT_PADDING)
        : Math.ceil(seedHeight);
    const minA4Height = this.getA4MinHeight(width);
    const unclampedTarget = Math.max(minA4Height, measuredTarget);
    const targetHeight = Math.max(
      minA4Height,
      Math.min(EPUBEngine.MAX_SECTION_HEIGHT, unclampedTarget)
    );
    if (targetHeight !== unclampedTarget) {
      this.debugLog("syncSectionHeight:clamped", {
        pageIndex,
        measuredTarget,
        max: EPUBEngine.MAX_SECTION_HEIGHT,
      });
    }
    if (targetHeight <= 0) return;

    element.style.height = `${targetHeight}px`;
    this.pageSizes.set(pageIndex, { width, height: targetHeight });

    if (
      !skipResize &&
      typeof rendition?.resize === "function" &&
      (rendition as any).manager?.resize
    ) {
      try {
        rendition.resize(width, targetHeight);
      } catch {
        // Ignore resize race for manager lifecycle edge cases.
      }
    }
  }

  private async resolvePageIndexFromHref(href: string): Promise<number | null> {
    const normalizedHref = href.trim();
    if (!normalizedHref) return null;

    const section = this.getSectionFromHref(normalizedHref);
    const sectionPageIndex = this.getPageIndexFromSection(section);
    if (sectionPageIndex != null) return sectionPageIndex;

    const spineIndex = this.getSpineIndexByHref(
      this.normalizeHref(normalizedHref)
    );
    return spineIndex >= 0 ? this.toPageIndexFromSpine(spineIndex) : null;
  }

  private extractHrefDestination(dest: PageDestination): string | null {
    if (typeof dest === "string") return dest;
    if (dest?.kind === "href" && typeof dest.value === "string") {
      return dest.value;
    }
    return null;
  }

  private isUriSource(source: DocumentSource): source is { uri: string } {
    return typeof source === "object" && source !== null && "uri" in source;
  }

  private isDataSource(
    source: DocumentSource
  ): source is { data: ArrayBuffer | Uint8Array } {
    return typeof source === "object" && source !== null && "data" in source;
  }

  private isFileLike(source: DocumentSource): source is FileLike {
    return (
      typeof source === "object" &&
      source !== null &&
      typeof (source as FileLike).arrayBuffer === "function"
    );
  }

  private normalizeLoadInput(input: DocumentLoadInput): {
    source: DocumentSource;
    type?: DocumentType;
  } {
    if (this.isLoadRequest(input)) {
      return { source: input.source, type: input.type };
    }
    return { source: input };
  }

  private isLoadRequest(
    input: DocumentLoadInput
  ): input is DocumentLoadRequest {
    return (
      typeof input === "object" &&
      input !== null &&
      "source" in input &&
      "type" in input
    );
  }

  private async resolveSource(source: DocumentSource): Promise<any> {
    if (typeof source === "string") {
      const dataUri = this.parseDataUri(source);
      if (dataUri) {
        return dataUri.isBase64
          ? this.decodeBase64(dataUri.data)
          : dataUri.data;
      }
      if (this.looksLikeUri(source)) {
        return source;
      }
      if (this.isLikelyBase64(source)) {
        return this.decodeBase64(source);
      }
      return source;
    }
    if (this.isUriSource(source)) return source.uri;
    if (this.isDataSource(source)) return source.data;
    if (this.isFileLike(source)) return await source.arrayBuffer();
    return source;
  }

  private parseDataUri(
    value: string
  ): { isBase64: boolean; data: string } | null {
    const match = /^data:([^;,]+)?(;base64)?,(.*)$/.exec(value);
    if (!match) return null;
    const isBase64 = Boolean(match[2]);
    const data = match[3] ?? "";
    return { isBase64, data };
  }

  private decodeBase64(value: string): Uint8Array {
    const clean = value.replace(/\s/g, "");
    if (typeof atob !== "function") {
      throw new Error(
        "[EPUBEngine] atob não está disponível para decodificar base64."
      );
    }
    const binary = atob(clean);
    const len = binary.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i += 1) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  }

  private looksLikeUri(value: string): boolean {
    return (
      value.startsWith("http://") ||
      value.startsWith("https://") ||
      value.startsWith("/") ||
      value.startsWith("./") ||
      value.startsWith("../") ||
      value.startsWith("file://")
    );
  }

  private isLikelyBase64(value: string): boolean {
    if (this.looksLikeUri(value)) return false;
    if (value.includes(".")) return false;
    if (value.length < 16) return false;
    return /^[A-Za-z0-9+/=]+$/.test(value);
  }

  private createRendition(
    element: HTMLElement,
    width: number,
    height: number
  ): any {
    const rendition = this.book.renderTo(element, {
      width,
      height,
      flow: "scrolled-doc",
      spread: "none",
      method: "write",
      overflow: EPUBEngine.USE_INTERNAL_IFRAME_SCROLL ? "auto" : "hidden",
    });
    this.registerContentHook(rendition);
    return rendition;
  }

  private disposeReader(): void {
    const rendition = this.readerRendition;
    if (!rendition) return;
    try {
      rendition?.manager?.destroy?.();
    } catch {
      // Ignore teardown failures to keep navigation resilient.
    }
    this.readerRendition = null;
    this.readerTarget = null;
    this.heightSyncVersion += 1;
  }

  private registerContentHook(rendition: any): void {
    if (!rendition?.hooks?.content?.register) return;
    rendition.hooks.content.register((contents: any) => {
      try {
        const setImportantStyle = (
          node: HTMLElement | null | undefined,
          property: string,
          value: string
        ) => {
          if (!node) return;
          node.style.setProperty(property, value, "important");
        };
        const useInternalScroll = EPUBEngine.USE_INTERNAL_IFRAME_SCROLL;
        const managerContainer = rendition?.manager?.container as
          | HTMLElement
          | undefined;
        const viewsContainer = rendition?.manager?.views?.container as
          | HTMLElement
          | undefined;
        if (managerContainer) {
          managerContainer.classList.add("papyrus-epub-scroll-host");
          managerContainer.style.overflow = useInternalScroll
            ? "auto"
            : "hidden";
          managerContainer.style.overflowY = useInternalScroll
            ? "auto"
            : "hidden";
          managerContainer.style.overflowX = "hidden";
          managerContainer.style.height = "100%";
          managerContainer.style.maxHeight = "100%";
          managerContainer.style.scrollbarWidth = useInternalScroll
            ? "thin"
            : "none";
          managerContainer.style.setProperty(
            "-webkit-overflow-scrolling",
            "touch"
          );
          managerContainer.style.setProperty("overscroll-behavior", "contain");
        }
        if (viewsContainer) {
          viewsContainer.style.overflow = useInternalScroll
            ? "visible"
            : "hidden";
          viewsContainer.style.overflowY = useInternalScroll
            ? "visible"
            : "hidden";
          viewsContainer.style.overflowX = "hidden";
          viewsContainer.style.minHeight = "100%";
          viewsContainer.style.scrollbarWidth = useInternalScroll
            ? "auto"
            : "none";
        }

        const frame = contents?.window
          ?.frameElement as HTMLIFrameElement | null;
        const mobileProbe = (managerContainer ??
          frame ??
          (contents?.document?.body as
            | HTMLElement
            | undefined)) as HTMLElement | null;
        const mobileWidthHint = Math.max(
          managerContainer?.clientWidth ?? 0,
          frame?.clientWidth ?? 0,
          mobileProbe?.clientWidth ?? 0
        );
        const isMobileInternalScroll = Boolean(
          useInternalScroll &&
            mobileProbe &&
            this.isMobileViewport(mobileProbe, mobileWidthHint)
        );
        const contentOverflow = useInternalScroll ? "hidden" : "visible";
        const doc = contents?.document;
        const root = doc?.documentElement as HTMLElement | undefined;
        const body = doc?.body as HTMLElement | undefined;
        contents?.overflow?.(contentOverflow);
        contents?.overflowX?.("hidden");
        contents?.overflowY?.(contentOverflow);
        contents?.css?.("overflow", contentOverflow, true);
        contents?.css?.("overflow-y", contentOverflow, true);
        contents?.css?.("overflow-x", "hidden", true);
        contents?.css?.("height", "auto", true);
        contents?.css?.("max-height", "none", true);
        contents?.css?.("min-height", "100%", true);

        if (root) {
          setImportantStyle(root, "overflow", contentOverflow);
          setImportantStyle(root, "overflow-y", contentOverflow);
          setImportantStyle(root, "overflow-x", "hidden");
          setImportantStyle(root, "height", "auto");
          setImportantStyle(root, "min-height", "100%");
          setImportantStyle(root, "max-height", "none");
          setImportantStyle(root, "scrollbar-width", "none");
          setImportantStyle(root, "overscroll-behavior", "none");
        }
        if (body) {
          setImportantStyle(body, "overflow", contentOverflow);
          setImportantStyle(body, "overflow-y", contentOverflow);
          setImportantStyle(body, "overflow-x", "hidden");
          setImportantStyle(body, "height", "auto");
          setImportantStyle(body, "min-height", "100%");
          setImportantStyle(body, "max-height", "none");
          setImportantStyle(body, "scrollbar-width", "none");
          setImportantStyle(body, "overscroll-behavior", "none");
          if (isMobileInternalScroll) {
            setImportantStyle(body, "margin", "0");
            setImportantStyle(body, "padding", "0");
          }
        }

        if (useInternalScroll && managerContainer && doc && root) {
          const proxyMarker = "data-papyrus-scroll-proxy";
          if (!root.hasAttribute(proxyMarker)) {
            root.setAttribute(proxyMarker, "1");
            const scrollHost = managerContainer;

            const onWheel = (event: WheelEvent) => {
              if (event.defaultPrevented) return;
              if (event.ctrlKey || event.metaKey) return;
              const deltaY = Number(event.deltaY) || 0;
              const deltaX = Number(event.deltaX) || 0;
              if (!deltaY && !deltaX) return;

              const previousTop = scrollHost.scrollTop;
              const previousLeft = scrollHost.scrollLeft;
              scrollHost.scrollTop += deltaY;
              scrollHost.scrollLeft += deltaX;

              const moved =
                scrollHost.scrollTop !== previousTop ||
                scrollHost.scrollLeft !== previousLeft;
              if (moved && event.cancelable) event.preventDefault();
            };

            let lastTouchY: number | null = null;
            let lastTouchX: number | null = null;

            const onTouchStart = (event: TouchEvent) => {
              if (event.touches.length !== 1) return;
              lastTouchY = event.touches[0].clientY;
              lastTouchX = event.touches[0].clientX;
            };

            const onTouchMove = (event: TouchEvent) => {
              if (event.touches.length !== 1) return;
              const touch = event.touches[0];
              if (lastTouchY == null || lastTouchX == null) {
                lastTouchY = touch.clientY;
                lastTouchX = touch.clientX;
                return;
              }

              const deltaY = lastTouchY - touch.clientY;
              const deltaX = lastTouchX - touch.clientX;

              const previousTop = scrollHost.scrollTop;
              const previousLeft = scrollHost.scrollLeft;
              if (deltaY || deltaX) {
                scrollHost.scrollTop += deltaY;
                scrollHost.scrollLeft += deltaX;
              }

              const moved =
                scrollHost.scrollTop !== previousTop ||
                scrollHost.scrollLeft !== previousLeft;
              if (moved && event.cancelable) event.preventDefault();

              lastTouchY = touch.clientY;
              lastTouchX = touch.clientX;
            };

            const onTouchEnd = () => {
              lastTouchY = null;
              lastTouchX = null;
            };

            doc.addEventListener("wheel", onWheel, { passive: false });
            doc.addEventListener("touchstart", onTouchStart, {
              passive: true,
            });
            doc.addEventListener("touchmove", onTouchMove, {
              passive: false,
            });
            doc.addEventListener("touchend", onTouchEnd, { passive: true });
            doc.addEventListener("touchcancel", onTouchEnd, {
              passive: true,
            });
          }
        }

        if (isMobileInternalScroll && doc?.body) {
          const singleImage = this.getSingleImageForMobileLayout(doc);
          if (singleImage) {
            doc.body.style.display = "flex";
            doc.body.style.justifyContent = "center";
            doc.body.style.alignItems = "flex-start";
            singleImage.style.width = "100%";
            singleImage.style.maxWidth = "100%";
            singleImage.style.height = "auto";
            singleImage.style.maxHeight = "100%";
            singleImage.style.display = "block";
            singleImage.style.objectFit = "contain";
          }
        }
        if (frame) {
          if (useInternalScroll) {
            frame.setAttribute("scrolling", "no");
            setImportantStyle(frame, "overflow", "hidden");
            setImportantStyle(frame, "overflow-y", "hidden");
            setImportantStyle(frame, "overflow-x", "hidden");
            setImportantStyle(frame, "height", "auto");
            setImportantStyle(frame, "min-height", "100%");
            setImportantStyle(frame, "max-height", "none");
            setImportantStyle(frame, "width", "100%");
            setImportantStyle(frame, "max-width", "100%");
            setImportantStyle(frame, "display", "block");
            setImportantStyle(frame, "border", "0");
          } else {
            frame.setAttribute("scrolling", "no");
            setImportantStyle(frame, "overflow", "hidden");
            setImportantStyle(frame, "height", "auto");
          }
        }
      } catch {
        // Keep reader functional even if some EPUB content blocks style updates.
      }
    });
  }

  private scheduleHeightSync(
    syncVersion: number,
    rendition: any,
    element: HTMLElement,
    pageIndex: number,
    width: number,
    fallbackHeight: number,
    targetSectionIndex: number | null,
    skipResize = false
  ): void {
    const run = () => {
      if (syncVersion !== this.heightSyncVersion) return;
      if (this.readerRendition !== rendition) return;
      if (this.readerTarget !== element) return;
      void this.syncSectionHeight(
        rendition,
        element,
        pageIndex,
        width,
        fallbackHeight,
        targetSectionIndex,
        skipResize
      );
    };

    setTimeout(run, 80);
    setTimeout(run, 260);
    setTimeout(run, 620);
    setTimeout(run, 1200);
  }

  private getViewportHeightHint(element: HTMLElement): number | null {
    const viewerRoot = element.closest(".papyrus-viewer") as HTMLElement | null;
    const hostParent = element.parentElement;
    const measured = Math.max(
      viewerRoot?.clientHeight ?? 0,
      hostParent?.clientHeight ?? 0,
      element.clientHeight ?? 0
    );
    if (measured <= 0) return null;

    const viewportWidth = Math.max(
      viewerRoot?.clientWidth ?? 0,
      (globalThis as any)?.visualViewport?.width ?? 0,
      (globalThis as any)?.innerWidth ?? 0
    );
    const isMobileViewport =
      viewportWidth > 0 &&
      viewportWidth <= EPUBEngine.MOBILE_VIEWPORT_MAX_WIDTH_PX;
    if (!isMobileViewport) return null;

    let topbarOffset = 0;
    const shell = viewerRoot?.parentElement
      ?.parentElement as HTMLElement | null;
    if (shell) {
      const shellHeight = shell.getBoundingClientRect().height;
      const topbar = Array.from(shell.children).find((child) =>
        (child as HTMLElement).classList?.contains("papyrus-topbar")
      ) as HTMLElement | undefined;
      const topbarHeight = topbar?.getBoundingClientRect().height ?? 0;
      const viewerLikelyIncludesTopbar =
        topbarHeight > 0 && shellHeight > 0 && measured >= shellHeight - 2;
      if (viewerLikelyIncludesTopbar) {
        topbarOffset = Math.ceil(topbarHeight);
      }
    }

    const adjusted =
      measured - topbarOffset - EPUBEngine.INTERNAL_VIEWPORT_PADDING_PX;
    return Math.max(280, Math.floor(adjusted));
  }

  private getLinearSpineItems(items: any[]): any[] {
    const linearItems = items.filter((item) => item?.linear !== "no");
    if (!linearItems.length) return items;

    const deduped: any[] = [];
    for (const item of linearItems) {
      const prev = deduped[deduped.length - 1];
      const prevHref = this.normalizeHref(prev?.href ?? "");
      const currentHref = this.normalizeHref(item?.href ?? "");
      if (prevHref && currentHref && prevHref === currentHref) continue;
      deduped.push(item);
    }

    return deduped.length ? deduped : linearItems;
  }

  private hasCoverPage(): boolean {
    return Boolean(this.coverUrl);
  }

  private isCoverPage(pageIndex: number): boolean {
    return this.hasCoverPage() && pageIndex === 0;
  }

  private toSpineIndex(pageIndex: number): number {
    return pageIndex - (this.hasCoverPage() ? 1 : 0);
  }

  private toPageIndexFromSpine(spineIndex: number): number {
    return spineIndex + (this.hasCoverPage() ? 1 : 0);
  }

  private getA4MinHeight(width: number): number {
    if (!Number.isFinite(width) || width <= 0) return 900;
    return Math.max(480, Math.ceil(width * EPUBEngine.A4_RATIO));
  }

  private renderCoverPage(
    element: HTMLElement,
    width: number,
    height: number,
    pageIndex: number
  ): void {
    this.disposeReader();
    element.innerHTML = "";
    element.style.width = `${width}px`;
    element.style.height = `${height}px`;
    const isMobileViewport = this.isMobileViewport(element, width);
    const isLandscapeViewport = width > height;

    const wrapper = document.createElement("div");
    wrapper.style.width = "100%";
    wrapper.style.minHeight = `${height}px`;
    wrapper.style.display = "flex";
    wrapper.style.alignItems = "center";
    wrapper.style.justifyContent = "center";
    wrapper.style.background = "#fff";
    wrapper.style.padding = isMobileViewport ? "0" : "16px";
    wrapper.style.boxSizing = "border-box";
    if (isMobileViewport) {
      wrapper.style.overflow = "hidden";
    }

    const img = document.createElement("img");
    img.src = this.coverUrl ?? "";
    img.alt = "Capa";
    img.style.maxWidth = "100%";
    img.style.maxHeight = "100%";
    img.style.width = isMobileViewport ? "100%" : "auto";
    img.style.height = isMobileViewport ? "100%" : "auto";
    img.style.display = "block";
    img.style.objectFit =
      isMobileViewport && !isLandscapeViewport ? "cover" : "contain";
    img.style.boxShadow = isMobileViewport
      ? "none"
      : "0 16px 32px rgba(0,0,0,0.15)";
    img.style.borderRadius = isMobileViewport ? "0" : "8px";

    img.onload = () => {
      if (isMobileViewport) {
        const targetHeight = Math.max(280, Math.floor(height));
        wrapper.style.minHeight = `${targetHeight}px`;
        element.style.height = `${targetHeight}px`;
        this.pageSizes.set(pageIndex, { width, height: targetHeight });
        return;
      }

      const naturalWidth = img.naturalWidth || width;
      const naturalHeight = img.naturalHeight || height;
      if (naturalWidth <= 0 || naturalHeight <= 0) return;
      const displayedWidth = Math.min(naturalWidth, Math.max(1, width - 32));
      const scaledHeight = Math.round(
        (naturalHeight / naturalWidth) * displayedWidth
      );
      const targetHeight = Math.max(height, scaledHeight + 32);
      wrapper.style.minHeight = `${targetHeight}px`;
      element.style.height = `${targetHeight}px`;
      this.pageSizes.set(pageIndex, { width, height: targetHeight });
    };

    wrapper.appendChild(img);
    element.appendChild(wrapper);
    this.pageSizes.set(pageIndex, { width, height });
  }

  private isMobileViewport(element: HTMLElement, widthHint: number): boolean {
    const viewerRoot = element.closest(".papyrus-viewer") as HTMLElement | null;
    const viewportWidth = Math.max(
      widthHint,
      viewerRoot?.clientWidth ?? 0,
      (globalThis as any)?.visualViewport?.width ?? 0,
      (globalThis as any)?.innerWidth ?? 0
    );
    const viewportHeight = Math.max(
      viewerRoot?.clientHeight ?? 0,
      (globalThis as any)?.visualViewport?.height ?? 0,
      (globalThis as any)?.innerHeight ?? 0
    );
    const isShortLandscape =
      viewportHeight > 0 &&
      viewportHeight <= EPUBEngine.MOBILE_SHORT_VIEWPORT_MAX_HEIGHT_PX &&
      viewportWidth > viewportHeight;
    return Boolean(
      viewportWidth > 0 &&
        (viewportWidth <= EPUBEngine.MOBILE_VIEWPORT_MAX_WIDTH_PX ||
          isShortLandscape)
    );
  }

  private getSingleImageForMobileLayout(
    doc: Document
  ): HTMLImageElement | null {
    const body = doc.body;
    if (!body) return null;
    const images = Array.from(
      body.querySelectorAll("img")
    ) as HTMLImageElement[];
    if (images.length !== 1) return null;
    const textLength = (body.textContent ?? "").replace(/\s+/g, "").length;
    if (textLength > 48) return null;
    return images[0] ?? null;
  }
}
