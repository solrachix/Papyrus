import React, { useState } from "react";
import { useViewerStore, SearchService } from "@papyrus-sdk/core";
import { Annotation, DocumentEngine } from "@papyrus-sdk/types";
import { isSingleViewportMode as getIsSingleViewportMode } from "./renderMode";

interface SidebarRightProps {
  engine: DocumentEngine;
  style?: React.CSSProperties;
}

const withAlpha = (hex: string, alpha: number) => {
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

const SidebarRight: React.FC<SidebarRightProps> = ({ engine, style }) => {
  const {
    sidebarRightOpen,
    sidebarRightTab,
    toggleSidebarRight,
    searchResults,
    activeSearchIndex,
    uiTheme,
    setSearch,
    setDocumentState,
    triggerScrollToPage,
    annotations,
    accentColor,
    updateAnnotation,
    addAnnotationReply,
    setSelectedAnnotation,
  } = useViewerStore();

  const [query, setQuery] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const [contentDrafts, setContentDrafts] = useState<Record<string, string>>(
    {}
  );
  const [replyDrafts, setReplyDrafts] = useState<Record<string, string>>({});
  const searchService = new SearchService(engine);
  const isDark = uiTheme === "dark";
  const isSingleViewportMode = getIsSingleViewportMode(engine);
  const accentSoft = withAlpha(accentColor, 0.12);
  const resultsCount = searchResults.length;

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) {
      setSearch("", []);
      return;
    }
    setIsSearching(true);
    const results = await searchService.search(query);
    setSearch(query, results);
    setIsSearching(false);
  };

  const jumpToAnnotation = (annotation: Annotation) => {
    const page = annotation.pageIndex + 1;
    engine.goToPage(page);
    if (isSingleViewportMode) {
      setDocumentState({ currentPage: page, scrollToPageSignal: null });
    } else {
      setDocumentState({ currentPage: page });
      triggerScrollToPage(annotation.pageIndex);
    }
    setSelectedAnnotation(annotation.id);
  };

  const getContentDraft = (annotation: Annotation) => {
    if (Object.prototype.hasOwnProperty.call(contentDrafts, annotation.id)) {
      return contentDrafts[annotation.id];
    }
    return annotation.content ?? "";
  };

  const updateContentDraft = (annotationId: string, nextValue: string) => {
    setContentDrafts((prev) => ({ ...prev, [annotationId]: nextValue }));
  };

  const submitContent = (annotation: Annotation) => {
    const nextContent = getContentDraft(annotation).trim();
    const currentContent = (annotation.content ?? "").trim();
    if (nextContent === currentContent) return;
    updateAnnotation(annotation.id, {
      content: nextContent,
      updatedAt: Date.now(),
    });
  };

  const getReplyDraft = (annotationId: string) =>
    replyDrafts[annotationId] ?? "";

  const updateReplyDraft = (annotationId: string, nextValue: string) => {
    setReplyDrafts((prev) => ({ ...prev, [annotationId]: nextValue }));
  };

  const submitReply = (annotationId: string) => {
    const nextReply = getReplyDraft(annotationId).trim();
    if (!nextReply) return;
    addAnnotationReply(annotationId, nextReply);
    setReplyDrafts((prev) => ({ ...prev, [annotationId]: "" }));
  };

  if (!sidebarRightOpen) return null;

  return (
    <div
      data-papyrus-theme={uiTheme}
      className={`papyrus-sidebar-right papyrus-theme absolute right-0 top-0 bottom-0 z-[120] w-[88vw] max-w-80 border-l flex flex-col h-full transition-colors duration-200 shadow-2xl ${
        isDark ? "bg-[#1a1a1a] border-[#333]" : "bg-white border-gray-200"
      }`}
      style={style}
    >
      <div
        className={`p-4 border-b flex items-center justify-between shrink-0 ${
          isDark ? "border-[#333]" : "border-gray-100"
        }`}
      >
        <div className="flex space-x-6">
          <button
            onClick={() => toggleSidebarRight("search")}
            className={`text-[10px] font-black uppercase tracking-widest pb-1 transition-all ${
              sidebarRightTab === "search" ? "border-b-2" : "text-gray-400"
            }`}
            style={
              sidebarRightTab === "search"
                ? { color: accentColor, borderColor: accentColor }
                : undefined
            }
          >
            Busca
          </button>
          <button
            onClick={() => toggleSidebarRight("annotations")}
            className={`text-[10px] font-black uppercase tracking-widest pb-1 transition-all ${
              sidebarRightTab === "annotations" ? "border-b-2" : "text-gray-400"
            }`}
            style={
              sidebarRightTab === "annotations"
                ? { color: accentColor, borderColor: accentColor }
                : undefined
            }
          >
            Notas
          </button>
        </div>
        <button
          onClick={() => toggleSidebarRight()}
          className="papyrus-unstyled-button text-gray-400 hover:text-red-500 transition-colors"
        >
          <svg
            className="w-4 h-4"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 custom-scrollbar bg-opacity-50">
        {sidebarRightTab === "search" ? (
          <div className="space-y-4">
            <form onSubmit={handleSearch} className="relative mb-6">
              <input
                type="text"
                className={`papyrus-input w-full rounded-lg px-4 py-2.5 text-xs outline-none border transition-all shadow-inner font-medium ${
                  isDark
                    ? "bg-[#2a2a2a] text-white border-[#444] focus:border-blue-500"
                    : "bg-gray-100 border-gray-200 focus:bg-white focus:border-blue-400"
                }`}
                placeholder="O que você procura?"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
              {resultsCount > 0 && (
                <span className="absolute right-9 top-2.5 text-[10px] font-bold text-gray-400">
                  {resultsCount}
                </span>
              )}
              <button
                type="submit"
                className="papyrus-unstyled-button absolute right-3 top-2.5 text-gray-400 transition-colors"
                style={{ color: accentColor }}
              >
                <svg
                  className="w-4 h-4"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2.5}
                    d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                  />
                </svg>
              </button>
            </form>

            {isSearching && (
              <div className="flex flex-col items-center justify-center py-12 space-y-3">
                <div
                  className="w-6 h-6 border-2 border-t-transparent rounded-full animate-spin"
                  style={{ borderColor: accentColor }}
                />
                <span className="text-[10px] font-bold text-gray-500 uppercase">
                  Varrendo documento...
                </span>
              </div>
            )}

            {!isSearching &&
              searchResults.map((res, idx) => (
                <div
                  key={idx}
                  onClick={() => {
                    const page = res.pageIndex + 1;
                    engine.goToPage(page);
                    if (isSingleViewportMode) {
                      setDocumentState({
                        activeSearchIndex: idx,
                        currentPage: page,
                        scrollToPageSignal: null,
                      });
                    } else {
                      setDocumentState({
                        activeSearchIndex: idx,
                        currentPage: page,
                      });
                      triggerScrollToPage(res.pageIndex);
                    }
                  }}
                  className={`p-4 rounded-xl border-2 cursor-pointer transition-all group hover:scale-[1.02] ${
                    idx === activeSearchIndex
                      ? "shadow-lg"
                      : isDark
                      ? "border-[#333] hover:border-[#555] bg-[#222]"
                      : "border-gray-50 hover:border-gray-200 bg-gray-50/50 hover:bg-white"
                  }`}
                  style={
                    idx === activeSearchIndex
                      ? {
                          borderColor: accentColor,
                          backgroundColor: accentSoft,
                        }
                      : undefined
                  }
                >
                  <div className="flex items-center justify-between mb-2">
                    <span
                      className={`text-[10px] font-black uppercase tracking-tighter ${
                        idx === activeSearchIndex ? "" : "text-gray-400"
                      }`}
                      style={
                        idx === activeSearchIndex
                          ? { color: accentColor }
                          : undefined
                      }
                    >
                      PÁGINA {res.pageIndex + 1}
                    </span>
                    <svg
                      className={`w-3 h-3 transition-transform ${
                        idx === activeSearchIndex ? "" : "text-gray-300"
                      }`}
                      style={
                        idx === activeSearchIndex
                          ? { color: accentColor }
                          : undefined
                      }
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={3}
                        d="M9 5l7 7-7 7"
                      />
                    </svg>
                  </div>
                  <p
                    className={`text-[11px] font-medium leading-relaxed italic ${
                      isDark ? "text-gray-400" : "text-gray-600"
                    }`}
                  >
                    ...{res.text}...
                  </p>
                </div>
              ))}
          </div>
        ) : (
          <div className="space-y-3">
            <div className="text-[9px] font-black text-gray-400 uppercase tracking-[0.2em] mb-6 flex items-center">
              <span>WORKSET</span>
              <div className="flex-1 h-px bg-current ml-3 opacity-10" />
            </div>
            {annotations.length === 0 ? (
              <div className="text-center py-20">
                <div className="w-12 h-12 bg-gray-500/10 rounded-full flex items-center justify-center mx-auto mb-4">
                  <svg
                    className="w-6 h-6 text-gray-400"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                    />
                  </svg>
                </div>
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">
                  Sem anotações
                </p>
              </div>
            ) : (
              annotations
                .slice()
                .sort(
                  (a, b) =>
                    (b.updatedAt ?? b.createdAt) - (a.updatedAt ?? a.createdAt)
                )
                .map((ann) => {
                  const isCommentThread =
                    ann.type === "comment" || ann.type === "text";
                  const replies = ann.replies ?? [];
                  const contentDraft = getContentDraft(ann);
                  const replyDraft = getReplyDraft(ann.id);
                  const hasExistingContent = Boolean(
                    (ann.content ?? "").trim()
                  );

                  return (
                    <div
                      key={ann.id}
                      className="rounded-xl border p-4 transition-colors"
                      style={{
                        background:
                          "var(--papyrus-surface-2-resolved, var(--papyrus-surface-2, #1f2937))",
                        borderColor:
                          "var(--papyrus-border-resolved, var(--papyrus-border, #374151))",
                        color:
                          "var(--papyrus-text-resolved, var(--papyrus-text, #e5e7eb))",
                      }}
                    >
                      <div className="mb-3 flex items-center justify-between">
                        <div className="flex items-center space-x-2">
                          <div
                            className="h-2.5 w-2.5 rounded-full"
                            style={{ backgroundColor: ann.color }}
                          />
                          <span
                            className="text-[10px] font-black uppercase tracking-wide"
                            style={{ color: accentColor }}
                          >
                            P{ann.pageIndex + 1}
                          </span>
                          <span className="text-[10px] font-semibold opacity-70 uppercase tracking-wide">
                            {ann.type}
                          </span>
                        </div>
                        <button
                          type="button"
                          className="rounded-md border px-2 py-1 text-[10px] font-semibold uppercase tracking-wide"
                          onClick={() => jumpToAnnotation(ann)}
                          style={{
                            borderColor: accentColor,
                            color: accentColor,
                          }}
                        >
                          Ir para pagina
                        </button>
                      </div>

                      {isCommentThread ? (
                        <div className="space-y-2">
                          <textarea
                            className="w-full resize-none rounded-md border p-2 text-xs focus:outline-none"
                            style={{
                              background:
                                "var(--papyrus-surface-resolved, var(--papyrus-surface, #111827))",
                              borderColor:
                                "var(--papyrus-border-resolved, var(--papyrus-border, #374151))",
                              color:
                                "var(--papyrus-text-resolved, var(--papyrus-text, #e5e7eb))",
                            }}
                            rows={3}
                            placeholder="Escreva seu comentario..."
                            value={contentDraft}
                            onChange={(event) =>
                              updateContentDraft(ann.id, event.target.value)
                            }
                            onKeyDown={(event) => {
                              if (event.key === "Enter" && !event.shiftKey) {
                                event.preventDefault();
                                submitContent(ann);
                              }
                            }}
                          />
                          <div className="flex justify-end">
                            <button
                              type="button"
                              className="rounded-md px-3 py-1.5 text-[11px] font-semibold text-white"
                              style={{ backgroundColor: accentColor }}
                              onClick={() => submitContent(ann)}
                            >
                              {hasExistingContent
                                ? "Atualizar comentario"
                                : "Enviar comentario"}
                            </button>
                          </div>
                        </div>
                      ) : null}

                      {replies.length > 0 ? (
                        <div className="mt-3 space-y-2">
                          {replies.map((reply) => (
                            <div
                              key={reply.id}
                              className="rounded-md border p-2"
                              style={{
                                background:
                                  "var(--papyrus-surface-resolved, var(--papyrus-surface, #111827))",
                                borderColor:
                                  "var(--papyrus-border-resolved, var(--papyrus-border, #374151))",
                              }}
                            >
                              <p className="text-xs leading-relaxed">
                                {reply.content}
                              </p>
                              <p className="mt-1 text-[10px] opacity-70">
                                {new Date(reply.createdAt).toLocaleTimeString(
                                  [],
                                  {
                                    hour: "2-digit",
                                    minute: "2-digit",
                                  }
                                )}
                              </p>
                            </div>
                          ))}
                        </div>
                      ) : null}

                      {isCommentThread ? (
                        <div className="mt-3 flex items-center gap-2">
                          <input
                            type="text"
                            className="flex-1 rounded-md border px-2 py-1.5 text-xs focus:outline-none"
                            style={{
                              background:
                                "var(--papyrus-surface-resolved, var(--papyrus-surface, #111827))",
                              borderColor:
                                "var(--papyrus-border-resolved, var(--papyrus-border, #374151))",
                              color:
                                "var(--papyrus-text-resolved, var(--papyrus-text, #e5e7eb))",
                            }}
                            value={replyDraft}
                            placeholder="Responder..."
                            onChange={(event) =>
                              updateReplyDraft(ann.id, event.target.value)
                            }
                            onKeyDown={(event) => {
                              if (event.key === "Enter") {
                                event.preventDefault();
                                submitReply(ann.id);
                              }
                            }}
                          />
                          <button
                            type="button"
                            className="rounded-md px-3 py-1.5 text-[11px] font-semibold text-white"
                            style={{ backgroundColor: accentColor }}
                            onClick={() => submitReply(ann.id)}
                          >
                            Responder
                          </button>
                        </div>
                      ) : null}
                    </div>
                  );
                })
            )}
          </div>
        )}
      </div>
    </div>
  );
};
export default SidebarRight;
