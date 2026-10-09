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
import android.text.style.CharacterStyle;
import android.text.style.UnderlineSpan;
import android.text.style.LineBackgroundSpan;
import android.text.TextPaint;
import android.graphics.Canvas;
import android.graphics.Paint;
import android.app.AlertDialog;
import com.facebook.react.bridge.ReadableType;
import java.util.HashMap;
import java.util.Map;
import android.widget.Button;
import android.util.TypedValue;
import android.view.ActionMode;
import android.view.GestureDetector;
import android.view.MotionEvent;
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
  private static final int ACTION_ANNOTATE = 0x5050;
  private static final String[] MARKUP_ACTIONS = {"highlight", "underline", "strikeout", "comment"};
  private static final ExecutorService TEXT_LAYOUT_EXECUTOR = Executors.newSingleThreadExecutor();

  private final ScrollView scrollView;
  private final PapyrusSelectableTextView textView;
  private final FrameLayout textContainer;
  private final List<Button> noteButtons = new ArrayList<>();
  private ReadableArray annotations;
  private final Map<String, Range> resolvedAnnotationRanges = new HashMap<>();
  private String resolvedAnnotationText = "";
  private final Map<Button,List<String>> noteGroups = new HashMap<>();
  private ReadableMap annotationLabels;
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
    textContainer = new FrameLayout(context);
    textView = new PapyrusSelectableTextView(context);
    textView.setTextIsSelectable(true);
    if (Build.VERSION.SDK_INT >= 26) textView.setTextClassifier(android.view.textclassifier.TextClassifier.NO_OP);
    textView.setFocusable(true);
    textView.setFocusableInTouchMode(true);
    textView.setTextSize(TypedValue.COMPLEX_UNIT_SP, fontSize);
    textView.setPadding(dp(Math.max(44,pageMarginDp)), dp(pageMarginDp), dp(pageMarginDp), dp(pageMarginDp));
    textView.setOnSelectionChangedListener(this::emitTextRangeSelected);
    GestureDetector annotationTaps = new GestureDetector(context,new GestureDetector.SimpleOnGestureListener(){
      @Override public boolean onSingleTapUp(MotionEvent event){return hitTestAnnotation(event);}
    });
    textView.setOnTouchListener((v,event)->annotationTaps.onTouchEvent(event));
    textView.setCustomSelectionActionModeCallback(new ActionMode.Callback() {
      @Override public boolean onCreateActionMode(ActionMode mode, Menu menu) {
        addSelectionActions(menu);
        return true;
      }
      @Override public boolean onPrepareActionMode(ActionMode mode, Menu menu) {
        addSelectionActions(menu);
        return true;
      }
      @Override public boolean onActionItemClicked(ActionMode mode, MenuItem item) {
        if (item.getItemId() == ACTION_DEFINE) { emitDefineSelection(); }
        else if (item.getItemId() >= ACTION_ANNOTATE && item.getItemId() < ACTION_ANNOTATE + MARKUP_ACTIONS.length) {
          WritableMap payload = selectedPayload();
          if (payload != null) {
            payload.putString("style", MARKUP_ACTIONS[item.getItemId() - ACTION_ANNOTATE]);
            emit("onAnnotateSelection", payload);
          }
        } else return false;
        mode.finish();
        return true;
      }
      @Override public void onDestroyActionMode(ActionMode mode) { }
    });
    textContainer.addView(textView, new FrameLayout.LayoutParams(
      LayoutParams.MATCH_PARENT, LayoutParams.WRAP_CONTENT
    ));
    textView.addOnLayoutChangeListener((v,l,t,r,b,ol,ot,or,ob) -> layoutNoteButtons());
    scrollView.addView(textContainer, new ScrollView.LayoutParams(
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
    int clampedOffset = PapyrusNativeTextModel.clampRequestedTextOffset(currentTextOffset, expectedTextLength);
    if (clampedOffset != currentTextOffset) {
      currentTextOffset = clampedOffset;
      scrollToTextOffset(clampedOffset);
    }
    if (next > 0 && textView.length() != next) reloadText();
  }

  public void setCurrentTextOffset(int value) {
    int next = PapyrusNativeTextModel.clampRequestedTextOffset(value, expectedTextLength);
    boolean changed = next != currentTextOffset;
    currentTextOffset = next;
    if (changed) scrollToTextOffset(next);
  }

  public void setScrollToTextOffsetSignal(Integer value) {
    if (value == null || value.equals(scrollToTextOffsetSignal)) return;
    scrollToTextOffsetSignal = value;
    scrollToTextOffset(value);
  }

  public void setTextNavigationRequest(ReadableMap request) {
    if(request!=null && request.hasKey("offset"))scrollToTextOffset(Math.max(0,request.getInt("offset")));
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
    textView.setLineSpacing(Math.max(0f,lineHeight-fontSize),1f);
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
    textView.setPadding(dp(Math.max(44,pageMarginDp)), dp(pageMarginDp), dp(pageMarginDp), dp(pageMarginDp));
    requestTextContentLayout();
  }

  public void setDefineLabel(String value) {
    defineLabel = value == null ? "Define" : value;
  }

  public void setDefineSelectionMode(String value) {
    defineSelectionMode = value == null ? "selection" : value;
  }

  private void addSelectionActions(Menu menu) {
    MenuItem copy = menu.findItem(android.R.id.copy);
    if (copy != null && !labelFor("copy").isEmpty()) copy.setTitle(labelFor("copy"));
    MenuItem selectAll = menu.findItem(android.R.id.selectAll);
    if (selectAll != null && !labelFor("selectAll").isEmpty()) selectAll.setTitle(labelFor("selectAll"));
    for (int i = 0; i < MARKUP_ACTIONS.length; i++) {
      String label = labelFor(MARKUP_ACTIONS[i]);
      if (selectedPayload() != null && !label.isEmpty() && menu.findItem(ACTION_ANNOTATE+i) == null) {
        menu.add(Menu.NONE, ACTION_ANNOTATE+i, i, label).setIcon(new PapyrusSelectionMenuIcon(MARKUP_ACTIONS[i]));
      }
    }
    if (selectedPayload() == null || "single-word".equals(defineSelectionMode) && !isSingleWordSelection()) {
      menu.removeItem(ACTION_DEFINE);
      return;
    }
    MenuItem item = menu.findItem(ACTION_DEFINE);
    if (item == null) {
      item = menu.add(Menu.NONE, ACTION_DEFINE, Menu.NONE, defineLabel);
      item.setIcon(new PapyrusSelectionMenuIcon("define"));
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
      android.text.PrecomputedText.Params params = textView.getTextMetricsParams();
      TEXT_LAYOUT_EXECUTOR.execute(() -> {
        android.text.PrecomputedText precomputed = android.text.PrecomputedText.create(text, params);
        post(() -> {
          if (token != loadToken || !text.equals(PapyrusTextStore.getText(engineId, documentGeneration))) return;
          // Typography can change while the background layout is running.
          // Recompute with current metrics instead of applying an incompatible result.
          if (!textView.getTextMetricsParams().equals(params)) { reloadText(); return; }
          textView.setText(precomputed, TextView.BufferType.SPANNABLE);
          textView.setTextIsSelectable(true);
          textView.setClickable(true);
          textView.setLongClickable(true);
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
        textView.setText(text, TextView.BufferType.SPANNABLE);
        textView.setTextIsSelectable(true);
        textView.setClickable(true);
        textView.setLongClickable(true);
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
      // React Native can retain the parent's old wrap-content measurement after
      // asynchronous PrecomputedText arrives. Resize the content container too,
      // otherwise its clip bounds can hide every line after the first.
      android.view.ViewGroup.LayoutParams containerParams = textContainer.getLayoutParams();
      containerParams.height = contentHeight;
      textContainer.setLayoutParams(containerParams);
      textContainer.forceLayout();
      textContainer.measure(contentWidthSpec, exactHeightSpec);
      textContainer.layout(0, 0, contentWidth, contentHeight);
      scrollView.requestLayout();
      requestLayout();
    });
  }

  private void applySearchHighlights() {
    if (textView.length() == 0) return;
    int selectionStart = textView.getSelectionStart();
    int selectionEnd = textView.getSelectionEnd();
    int oldScrollY = scrollView.getScrollY();
    Spannable styled = textView.getText() instanceof Spannable
        ? (Spannable) textView.getText() : new SpannableString(textView.getText());
    for (BackgroundColorSpan span : styled.getSpans(0, styled.length(), BackgroundColorSpan.class)) styled.removeSpan(span);
    for (LineBackgroundSpan span : styled.getSpans(0, styled.length(), LineBackgroundSpan.class)) styled.removeSpan(span);
    for (CharacterStyle span : styled.getSpans(0, styled.length(), CharacterStyle.class)) {
      if (!(span instanceof BackgroundColorSpan)) styled.removeSpan(span);
    }
    applyAnnotationSpans(styled);
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
    if (styled != textView.getText()) textView.setText(styled, TextView.BufferType.SPANNABLE);
    textView.invalidate();
    if (selectionStart >= 0 && selectionEnd >= selectionStart && selectionEnd <= textView.length()) {
      Selection.setSelection((Spannable) textView.getText(), selectionStart, selectionEnd);
    }
    suppressSelectionEvents = false;
    scrollView.scrollTo(scrollView.getScrollX(), oldScrollY);
  }

  public void setAnnotations(ReadableArray value) {
    annotations = value;
    resolvedAnnotationRanges.clear();
    applySearchHighlights();
  }

  public void setAnnotationLabels(ReadableMap value) { annotationLabels = value; }

  private String labelFor(String key) {
    return annotationLabels != null && annotationLabels.hasKey(key) && !annotationLabels.isNull(key)
      ? annotationLabels.getString(key) : "";
  }

  private ReadableMap annotationRange(ReadableMap item) {
    if (item.hasKey("anchor") && !item.isNull("anchor")) {
      ReadableMap anchor = item.getMap("anchor");
      if (anchor != null && anchor.hasKey("kind") && "text-range".equals(anchor.getString("kind"))) return anchor;
      return null;
    }
    return item.hasKey("textRange") && !item.isNull("textRange") ? item.getMap("textRange") : null;
  }

  private Range checkedAnnotationRange(ReadableMap item) {
    try {
      String id=item.getString("id");
      CharSequence source=textView.getText();
      if(!resolvedAnnotationText.contentEquals(source)){resolvedAnnotationText=source.toString();resolvedAnnotationRanges.clear();}
      if(resolvedAnnotationRanges.containsKey(id))return resolvedAnnotationRanges.get(id);
      ReadableMap range=annotationRange(item);
      if(range==null || !range.hasKey("start") || !range.hasKey("end") || range.getType("start")!=ReadableType.Number || range.getType("end")!=ReadableType.Number)return null;
      int start=range.getInt("start"),end=range.getInt("end");
      Range result=null;
      if(range.hasKey("quote") && range.getType("quote")==ReadableType.String){
        int[] resolved=PapyrusTextAnnotationModel.resolve(resolvedAnnotationText,start,end,range.getString("quote"),range.hasKey("prefix")&&range.getType("prefix")==ReadableType.String?range.getString("prefix"):null,range.hasKey("suffix")&&range.getType("suffix")==ReadableType.String?range.getString("suffix"):null);
        if(resolved!=null)result=new Range(resolved[0],resolved[1]);
      } else if(start>=0 && end>start && end<=source.length())result=new Range(start,end);
      resolvedAnnotationRanges.put(id,result);return result;
    } catch(RuntimeException malformed) {return null;}
  }

  private void applyAnnotationSpans(Spannable styled) {
    for (Button button : noteButtons) textContainer.removeView(button);
    noteButtons.clear();
    noteIds.clear();
    if (annotations == null) return;
    for (int i=0; i<annotations.size(); i++) {
      ReadableMap item = annotations.getMap(i);
      if (item == null || !item.hasKey("id")) continue;
      Range range = checkedAnnotationRange(item);
      if (range == null) continue;
      String type = item.hasKey("type") ? item.getString("type") : "";
      String style = item.hasKey("markupStyle") && !item.isNull("markupStyle") ? item.getString("markupStyle") : type;
      int color = 0xFFFFC928;
      try { if (item.hasKey("color")) color = Color.parseColor(item.getString("color")); } catch (IllegalArgumentException ignored) { }
      final int spanColor=color;
      if ("highlight".equals(style)) {
        double opacity = item.hasKey("opacity") ? Math.max(0,Math.min(1,item.getDouble("opacity"))) : 0.35;
        styled.setSpan(new BackgroundColorSpan((color & 0x00FFFFFF) | ((int)(opacity*255)<<24)),range.start,range.end,Spannable.SPAN_EXCLUSIVE_EXCLUSIVE);
      } else if ("underline".equals(style)) {
        styled.setSpan(new UnderlineSpan(){@Override public void updateDrawState(TextPaint paint){super.updateDrawState(paint);paint.underlineColor=spanColor;paint.underlineThickness=Math.max(1,paint.getTextSize()/18);}},range.start,range.end,Spannable.SPAN_EXCLUSIVE_EXCLUSIVE);
      } else if ("strikeout".equals(style)) {
        styled.setSpan((LineBackgroundSpan)(canvas,paint,left,right,top,baseline,bottom,text,start,end,lineNumber)->{
          if(range.end<=start || range.start>=end)return;
          float x=left+paint.measureText(text,start,Math.max(start,range.start));
          float width=paint.measureText(text,Math.max(start,range.start),Math.min(end,range.end));
          int old=paint.getColor();float oldWidth=paint.getStrokeWidth();paint.setColor(spanColor);paint.setStrokeWidth(Math.max(1,paint.getTextSize()/18));
          canvas.drawLine(x,baseline+paint.ascent()*0.4f,x+width,baseline+paint.ascent()*0.4f,paint);paint.setColor(old);paint.setStrokeWidth(oldWidth);
        },range.start,range.end,Spannable.SPAN_EXCLUSIVE_EXCLUSIVE);
      }
      if (item.hasKey("noteContent") || "comment".equals(type) || "text".equals(type)) {
        final String id = item.getString("id");
        Button button = new Button(getContext());
        button.setText("●"); button.setTextColor(color); button.setContentDescription(labelFor("comment"));
        button.setTag(range.start); button.setMinWidth(0); button.setMinimumWidth(0);
        button.setPadding(0,0,0,0); button.setBackgroundColor(Color.TRANSPARENT);
        button.setOnClickListener(v -> openAnnotationGroup(button,id));
        noteIds.put(button,id);
        noteButtons.add(button); textContainer.addView(button,new FrameLayout.LayoutParams(dp(44),dp(44)));
      }
    }
    textView.post(this::layoutNoteButtons);
  }

  private boolean hitTestAnnotation(MotionEvent event) {
    if (annotations == null || textView.getLayout() == null || textView.getSelectionEnd() > textView.getSelectionStart()) return false;
    Layout layout = textView.getLayout();
    float x = event.getX()-textView.getPaddingLeft();
    int y = (int)event.getY()-textView.getPaddingTop();
    if(x<0 || y<0 || y>layout.getHeight())return false;
    int line=layout.getLineForVertical(y);
    if(x<layout.getLineLeft(line) || x>layout.getLineRight(line))return false;
    int offset=layout.getOffsetForHorizontal(line,x);
    for(int i=0;i<annotations.size();i++) {
      ReadableMap annotation=annotations.getMap(i);if(annotation==null)continue;
      Range range=checkedAnnotationRange(annotation);
      if(range!=null && offset>=range.start && offset<range.end) {
        WritableMap payload=Arguments.createMap();payload.putString("id",annotation.getString("id"));emit("onAnnotationTap",payload);return true;
      }
    }
    return false;
  }

  private void layoutNoteButtons() {
    Layout layout = textView.getLayout();
    if (layout == null) return;
    noteGroups.clear();
    Map<Integer,Button> leaders=new HashMap<>();
    for (Button button : noteButtons) {
      int start = Math.min(textView.length(),(Integer)button.getTag());
      int line = layout.getLineForOffset(start);
      int y=textView.getPaddingTop()+layout.getLineTop(line);
      button.setTranslationY((y/dp(44))*dp(44));
      int bucket=y/dp(44);Button leader=leaders.get(bucket);
      button.setVisibility(leader==null?View.VISIBLE:View.INVISIBLE);
      String id=(String)button.getContentDescription();
      // Accessibility label stays localized; stable IDs live in a keyed map.
      id=noteIds.get(button);
      if(leader==null){leaders.put(bucket,button);leader=button;noteGroups.put(leader,new ArrayList<>());}
      noteGroups.get(leader).add(id);
    }
    for(Map.Entry<Button,List<String>> entry:noteGroups.entrySet())entry.getKey().setText(entry.getValue().size()>1?String.valueOf(entry.getValue().size()):"●");
  }

  private final Map<Button,String> noteIds=new HashMap<>();
  private void openAnnotationGroup(Button button,String fallback) {
    List<String> ids=noteGroups.get(button);
    if(ids==null || ids.size()<2){emitAnnotationTap(fallback);return;}
    String[] titles=new String[ids.size()];
    for(int i=0;i<ids.size();i++){
      titles[i]=ids.get(i);
      for(int j=0;j<annotations.size();j++){ReadableMap a=annotations.getMap(j);if(ids.get(i).equals(a.getString("id"))){titles[i]=a.hasKey("noteContent")&&!a.isNull("noteContent")?a.getString("noteContent"):a.hasKey("content")&&!a.isNull("content")?a.getString("content"):ids.get(i);break;}}
    }
    new AlertDialog.Builder(getContext()).setTitle(labelFor("comment")).setItems(titles,(dialog,index)->emitAnnotationTap(ids.get(index))).show();
  }
  private void emitAnnotationTap(String id){WritableMap event=Arguments.createMap();event.putString("id",id);emit("onAnnotationTap",event);}

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
    final int requestedOffset = Math.max(0, offset);
    textView.post(() -> {
      Layout layout = textView.getLayout();
      if (layout == null || textView.length() == 0) return;
      int safeOffset = Math.min(textView.length(), requestedOffset);
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
    int prefixStart = Math.max(0, start - 48);
    int suffixEnd = Math.min(textView.length(), end + 48);
    if (prefixStart > 0 && Character.isLowSurrogate(textView.getText().charAt(prefixStart))) prefixStart--;
    if (suffixEnd < textView.length() && Character.isLowSurrogate(textView.getText().charAt(suffixEnd))) suffixEnd++;
    event.putString("prefix", textView.getText().subSequence(prefixStart, start).toString());
    event.putString("suffix", textView.getText().subSequence(end, suffixEnd).toString());
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
    if (selection != null && (!"single-word".equals(defineSelectionMode) || isSingleWordSelection())) emit("onDefineSelection", selection);
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
