package com.papyrus.engine;

import android.content.Context;
import android.graphics.Color;
import android.os.Build;
import android.os.SystemClock;
import android.text.Layout;
import android.text.Selection;
import android.text.Spannable;
import android.text.SpannableString;
import android.text.style.BackgroundColorSpan;
import android.util.TypedValue;
import android.view.ActionMode;
import android.view.Menu;
import android.view.MenuItem;
import android.view.View;
import android.widget.FrameLayout;
import android.widget.ScrollView;
import android.widget.TextView;

import com.facebook.react.bridge.Arguments;
import com.facebook.react.bridge.ReactContext;
import com.facebook.react.bridge.ReadableArray;
import com.facebook.react.bridge.ReadableMap;
import com.facebook.react.bridge.WritableMap;
import com.facebook.react.uimanager.events.RCTEventEmitter;

import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

public final class PapyrusTextDocumentView extends FrameLayout {
  private static final int EVENT_THROTTLE_MS = 100;
  private static final int MAX_SEARCH_HIGHLIGHTS = 2000;
  private static final int ACTION_DEFINE = 0x5041;
  private static final ExecutorService TEXT_LAYOUT_EXECUTOR = Executors.newSingleThreadExecutor();

  private final ScrollView scrollView;
  private final PapyrusSelectableTextView textView;
  private String engineId;
  private int documentGeneration;
  private int expectedTextLength;
  private int currentTextOffset;
  private Integer scrollToTextOffsetSignal;
  private String pageTheme = "normal";
  private String uiTheme = "light";
  private String defineLabel = "Define";
  private String defineSelectionMode = "selection";
  private float fontSize = 18f;
  private float lineHeight = 28f;
  private int pageMarginDp = 20;
  private int activeSearchIndex = -1;
  private List<Range> searchRanges = new ArrayList<>();
  private long lastOffsetEventAt;
  private int lastOffsetEventValue = -1;
  private int loadToken;
  private int lastReportedStart = -1;
  private int lastReportedEnd = -1;
  private boolean suppressSelectionEvents;

  public PapyrusTextDocumentView(Context context) {
    super(context);
    setClipToPadding(false);
    scrollView = new ScrollView(context);
    scrollView.setFillViewport(false);
    scrollView.setVerticalScrollBarEnabled(true);
    textView = new PapyrusSelectableTextView(context);
    textView.setTextIsSelectable(true);
    textView.setFocusable(true);
    textView.setFocusableInTouchMode(true);
    textView.setTextSize(TypedValue.COMPLEX_UNIT_SP, fontSize);
    textView.setPadding(dp(pageMarginDp), dp(pageMarginDp), dp(pageMarginDp), dp(pageMarginDp));
    textView.setOnSelectionChangedListener(this::emitTextRangeSelected);
    textView.setCustomSelectionActionModeCallback(new ActionMode.Callback() {
      @Override public boolean onCreateActionMode(ActionMode mode, Menu menu) {
        addDefineAction(menu);
        return true;
      }
      @Override public boolean onPrepareActionMode(ActionMode mode, Menu menu) {
        addDefineAction(menu);
        return true;
      }
      @Override public boolean onActionItemClicked(ActionMode mode, MenuItem item) {
        if (item.getItemId() != ACTION_DEFINE) return false;
        emitDefineSelection();
        mode.finish();
        return true;
      }
      @Override public void onDestroyActionMode(ActionMode mode) { }
    });
    scrollView.addView(textView, new ScrollView.LayoutParams(
      LayoutParams.MATCH_PARENT, LayoutParams.WRAP_CONTENT
    ));
    scrollView.addOnLayoutChangeListener((view, left, top, right, bottom, oldLeft, oldTop, oldRight, oldBottom) -> {
      if (right - left != oldRight - oldLeft && textView.length() > 0) requestTextContentLayout();
    });
    addView(scrollView, new FrameLayout.LayoutParams(
      LayoutParams.MATCH_PARENT, LayoutParams.MATCH_PARENT
    ));
    scrollView.getViewTreeObserver().addOnScrollChangedListener(this::emitTextOffsetFromScroll);
    applyTheme();
  }

  public void setEngineId(String value) {
    if (value == null || value.equals(engineId)) return;
    engineId = value;
    expectedTextLength = 0;
    loadToken++;
    reloadText();
  }

  public void setDocumentGeneration(int value) {
    if (value == documentGeneration) return;
    documentGeneration = value;
    expectedTextLength = 0;
    loadToken++;
    reloadText();
  }

  public void setTextLength(int value) {
    int next = Math.max(0, value);
    if (next == expectedTextLength) return;
    expectedTextLength = next;
    if (next > 0 && textView.length() != next) reloadText();
  }

  public void setCurrentTextOffset(int value) {
    int next = Math.max(0, Math.min(textView.length(), value));
    boolean changed = next != currentTextOffset;
    currentTextOffset = next;
    if (changed) scrollToTextOffset(next);
  }

  public void setScrollToTextOffsetSignal(Integer value) {
    if (value == null || value.equals(scrollToTextOffsetSignal)) return;
    scrollToTextOffsetSignal = value;
    scrollToTextOffset(value);
  }

  public void setSearchResults(ReadableArray results) {
    searchRanges = new ArrayList<>();
    if (results != null) {
      for (int i = 0; i < results.size() && searchRanges.size() < MAX_SEARCH_HIGHLIGHTS; i++) {
        ReadableMap item = results.getMap(i);
        if (item == null || !item.hasKey("location") || item.isNull("location")) continue;
        ReadableMap location = item.getMap("location");
        if (location == null) continue;
        int start = location.hasKey("start") ? location.getInt("start") : -1;
        int end = location.hasKey("end") ? location.getInt("end") : -1;
        if (start >= 0 && end > start) searchRanges.add(new Range(start, end));
      }
    }
    applySearchHighlights();
  }

  public void setActiveSearchIndex(int value) {
    activeSearchIndex = value;
    applySearchHighlights();
  }

  public void setPageTheme(String value) {
    pageTheme = value == null ? "normal" : value;
    applyTheme();
    applySearchHighlights();
  }

  public void setUiTheme(String value) {
    uiTheme = value == null ? "light" : value;
    applyTheme();
    applySearchHighlights();
  }

  public void setFontSize(float value) {
    fontSize = Math.max(10f, Math.min(48f, value));
    textView.setTextSize(TypedValue.COMPLEX_UNIT_SP, fontSize);
    applySearchHighlights();
    requestTextContentLayout();
  }

  public void setLineHeight(float value) {
    lineHeight = Math.max(fontSize, Math.min(72f, value));
    textView.setLineSpacing(Math.max(0f, lineHeight - fontSize), 1f);
    applySearchHighlights();
    requestTextContentLayout();
  }

  public void setPageMargin(float value) {
    pageMarginDp = Math.round(Math.max(8f, Math.min(64f, value)));
    textView.setPadding(dp(pageMarginDp), dp(pageMarginDp), dp(pageMarginDp), dp(pageMarginDp));
    requestTextContentLayout();
  }

  public void setDefineLabel(String value) {
    defineLabel = value == null ? "Define" : value;
  }

  public void setDefineSelectionMode(String value) {
    defineSelectionMode = value == null ? "selection" : value;
  }

  private void addDefineAction(Menu menu) {
    if (selectedPayload() == null || "single-word".equals(defineSelectionMode) && !isSingleWordSelection()) return;
    MenuItem item = menu.findItem(ACTION_DEFINE);
    if (item == null) {
      item = menu.add(Menu.NONE, ACTION_DEFINE, Menu.NONE, defineLabel);
      item.setShowAsAction(MenuItem.SHOW_AS_ACTION_IF_ROOM);
    } else {
      item.setTitle(defineLabel);
    }
  }

  private void reloadText() {
    if (engineId == null || documentGeneration <= 0) return;
    String text = PapyrusTextStore.getText(engineId, documentGeneration);
    if (text == null) return;
    int token = ++loadToken;
    int initialOffset = currentTextOffset;
    if (Build.VERSION.SDK_INT >= 28) {
      android.text.PrecomputedText.Params params = new android.text.PrecomputedText.Params.Builder(textView.getPaint())
        .setBreakStrategy(textView.getBreakStrategy())
        .setHyphenationFrequency(textView.getHyphenationFrequency())
        .build();
      TEXT_LAYOUT_EXECUTOR.execute(() -> {
        android.text.PrecomputedText precomputed = android.text.PrecomputedText.create(text, params);
        post(() -> {
          if (token != loadToken || !text.equals(PapyrusTextStore.getText(engineId, documentGeneration))) return;
          textView.setText(precomputed, TextView.BufferType.SPANNABLE);
          applySearchHighlights();
          requestTextContentLayout();
          textView.requestLayout();
          scrollView.requestLayout();
          requestLayout();
          scrollToTextOffset(initialOffset);
        });
      });
    } else {
      textView.post(() -> {
        if (token != loadToken) return;
        textView.setText(text);
        applySearchHighlights();
        requestTextContentLayout();
        textView.requestLayout();
        scrollView.requestLayout();
        requestLayout();
        scrollToTextOffset(initialOffset);
      });
    }
  }

  private void requestTextContentLayout() {
    textView.post(() -> {
      int contentWidth = scrollView.getWidth();
      if (contentWidth <= 0 || textView.length() == 0) return;

      android.view.ViewGroup.LayoutParams params = textView.getLayoutParams();
      if (params.height != LayoutParams.WRAP_CONTENT) {
        params.height = LayoutParams.WRAP_CONTENT;
        textView.setLayoutParams(params);
      }

      int contentWidthSpec = View.MeasureSpec.makeMeasureSpec(contentWidth, View.MeasureSpec.EXACTLY);
      int contentHeightSpec = View.MeasureSpec.makeMeasureSpec(0, View.MeasureSpec.UNSPECIFIED);
      textView.forceLayout();
      textView.measure(contentWidthSpec, contentHeightSpec);
      Layout layout = textView.getLayout();
      if (layout == null) return;

      int contentHeight = Math.max(
        textView.getMeasuredHeight(),
        layout.getHeight() + textView.getCompoundPaddingTop() + textView.getCompoundPaddingBottom()
      );
      params.height = contentHeight;
      textView.setLayoutParams(params);
      int exactHeightSpec = View.MeasureSpec.makeMeasureSpec(contentHeight, View.MeasureSpec.EXACTLY);
      textView.measure(contentWidthSpec, exactHeightSpec);
      textView.layout(
        textView.getLeft(),
        textView.getTop(),
        textView.getLeft() + textView.getMeasuredWidth(),
        textView.getTop() + textView.getMeasuredHeight()
      );
      scrollView.requestLayout();
      requestLayout();
    });
  }

  private void applySearchHighlights() {
    if (textView.length() == 0) return;
    int selectionStart = textView.getSelectionStart();
    int selectionEnd = textView.getSelectionEnd();
    int oldScrollY = scrollView.getScrollY();
    SpannableString styled = new SpannableString(textView.getText());
    for (int i = 0; i < searchRanges.size(); i++) {
      Range range = searchRanges.get(i);
      int start = Math.max(0, Math.min(styled.length(), range.start));
      int end = Math.max(start, Math.min(styled.length(), range.end));
      if (end > start) {
        int color = i == activeSearchIndex ? 0x8C1976D2 : 0x70FFC928;
        styled.setSpan(new BackgroundColorSpan(color), start, end, Spannable.SPAN_EXCLUSIVE_EXCLUSIVE);
      }
    }
    suppressSelectionEvents = true;
    textView.setText(styled, TextView.BufferType.SPANNABLE);
    if (selectionStart >= 0 && selectionEnd >= selectionStart && selectionEnd <= textView.length()) {
      Selection.setSelection((Spannable) textView.getText(), selectionStart, selectionEnd);
    }
    suppressSelectionEvents = false;
    scrollView.scrollTo(scrollView.getScrollX(), oldScrollY);
  }

  private void applyTheme() {
    int paper = Color.WHITE;
    int foreground = Color.BLACK;
    if ("sepia".equals(pageTheme)) {
      paper = Color.rgb(244, 235, 215);
      foreground = Color.rgb(51, 43, 31);
    } else if ("dark".equals(pageTheme) || "dark".equals(uiTheme)) {
      paper = Color.rgb(31, 31, 33);
      foreground = Color.rgb(235, 235, 235);
    } else if ("high-contrast".equals(pageTheme)) {
      paper = Color.BLACK;
      foreground = Color.WHITE;
    }
    scrollView.setBackgroundColor(paper);
    textView.setBackgroundColor(paper);
    textView.setTextColor(foreground);
  }

  private void scrollToTextOffset(int offset) {
    final int safeOffset = Math.max(0, Math.min(textView.length(), offset));
    textView.post(() -> {
      Layout layout = textView.getLayout();
      if (layout == null || textView.length() == 0) return;
      int line = layout.getLineForOffset(safeOffset);
    scrollView.scrollTo(0, Math.max(0, layout.getLineTop(line) + textView.getTop()));
    });
  }

  private void emitTextOffsetFromScroll() {
    if (textView.getLayout() == null || textView.length() == 0) return;
    long now = SystemClock.uptimeMillis();
    if (now - lastOffsetEventAt < EVENT_THROTTLE_MS) return;
    Layout layout = textView.getLayout();
    int line = layout.getLineForVertical(Math.max(0, scrollView.getScrollY() - textView.getTop()));
    int offset = Math.max(0, Math.min(textView.length(), layout.getLineStart(line)));
    if (offset == lastOffsetEventValue) return;
    lastOffsetEventAt = now;
    lastOffsetEventValue = offset;
    currentTextOffset = offset;
    WritableMap event = Arguments.createMap();
    event.putInt("offset", offset);
    emit("onTextOffsetChange", event);
  }

  private WritableMap selectedPayload() {
    int start = Math.max(0, textView.getSelectionStart());
    int end = Math.min(textView.length(), textView.getSelectionEnd());
    if (end <= start) return null;
    WritableMap event = Arguments.createMap();
    event.putString("text", textView.getText().subSequence(start, end).toString());
    event.putInt("start", start);
    event.putInt("end", end);
    return event;
  }

  private boolean isSingleWordSelection() {
    WritableMap selection = selectedPayload();
    if (selection == null) return false;
    String selected = selection.getString("text");
    return selected != null && selected.trim().matches("[^\\s]+") && selected.trim().length() <= 64;
  }

  private void emitTextRangeSelected() {
    if (suppressSelectionEvents) return;
    WritableMap selection = selectedPayload();
    if (selection == null) {
      lastReportedStart = -1;
      lastReportedEnd = -1;
      return;
    }
    int start = selection.getInt("start");
    int end = selection.getInt("end");
    if (start == lastReportedStart && end == lastReportedEnd) return;
    lastReportedStart = start;
    lastReportedEnd = end;
    emit("onTextRangeSelected", selection);
  }

  private void emitDefineSelection() {
    WritableMap selection = selectedPayload();
    if (selection != null) emit("onDefineSelection", selection);
  }

  private void emit(String name, WritableMap payload) {
    if (!(getContext() instanceof ReactContext)) return;
    ((ReactContext) getContext()).getJSModule(RCTEventEmitter.class).receiveEvent(getId(), name, payload);
  }

  private int dp(float value) {
    return Math.round(value * getResources().getDisplayMetrics().density);
  }

  private interface SelectionListener { void onSelectionChanged(); }

  private static final class PapyrusSelectableTextView extends TextView {
    private SelectionListener listener;
    PapyrusSelectableTextView(Context context) { super(context); }
    void setOnSelectionChangedListener(SelectionListener value) { listener = value; }
    @Override protected void onMeasure(int widthMeasureSpec, int heightMeasureSpec) {
      super.onMeasure(widthMeasureSpec, heightMeasureSpec);
      Layout layout = getLayout();
      if (layout == null || MeasureSpec.getMode(heightMeasureSpec) == MeasureSpec.EXACTLY) return;
      int contentHeight = layout.getHeight() + getCompoundPaddingTop() + getCompoundPaddingBottom();
      int desiredHeight = resolveSizeAndState(
        Math.max(getSuggestedMinimumHeight(), contentHeight),
        heightMeasureSpec,
        0
      );
      setMeasuredDimension(getMeasuredWidth(), desiredHeight);
    }
    @Override protected void onSelectionChanged(int selectionStart, int selectionEnd) {
      super.onSelectionChanged(selectionStart, selectionEnd);
      if (listener != null) listener.onSelectionChanged();
    }
  }

  private static final class Range {
    final int start;
    final int end;
    Range(int start, int end) { this.start = start; this.end = end; }
  }
}
