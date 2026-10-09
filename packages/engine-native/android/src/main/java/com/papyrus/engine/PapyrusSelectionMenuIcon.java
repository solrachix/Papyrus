package com.papyrus.engine;

import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.ColorFilter;
import android.graphics.Paint;
import android.graphics.PixelFormat;
import android.graphics.drawable.Drawable;

/** Small vector glyphs for public Android selection-menu APIs. */
final class PapyrusSelectionMenuIcon extends Drawable {
  private final String action;
  private final Paint paint = new Paint(Paint.ANTI_ALIAS_FLAG);
  PapyrusSelectionMenuIcon(String action) {
    this.action = action;
    paint.setColor(Color.BLACK);
    paint.setStrokeWidth(2);
    paint.setStyle(Paint.Style.STROKE);
  }
  @Override public void draw(Canvas canvas) {
    canvas.save();
    canvas.translate(getBounds().left,getBounds().top);
    canvas.scale(getBounds().width()/24f,getBounds().height()/24f);
    if ("copy".equals(action)) {
      canvas.drawRoundRect(8,7,20,21,2,2,paint);
      canvas.drawLine(4,17,4,3,paint); canvas.drawLine(4,3,16,3,paint);
    } else if ("comment".equals(action)) {
      canvas.drawRoundRect(3,3,21,17,2,2,paint);
      canvas.drawLine(7,17,7,22,paint); canvas.drawLine(7,22,12,17,paint);
      canvas.drawLine(7,8,17,8,paint); canvas.drawLine(7,12,15,12,paint);
    } else if ("define".equals(action)) {
      canvas.drawCircle(10,10,6,paint); canvas.drawLine(15,15,21,21,paint);
    } else if ("highlight".equals(action)) {
      canvas.drawLine(5,17,17,5,paint);canvas.drawLine(8,20,20,8,paint);
      canvas.drawLine(17,5,20,8,paint);canvas.drawLine(4,21,12,21,paint);
    } else {
      canvas.drawLine(6,4,6,14,paint); canvas.drawLine(18,4,18,14,paint);
      canvas.drawArc(6,8,18,20,0,180,false,paint);
      canvas.drawLine(3,"underline".equals(action)?22:12,21,"underline".equals(action)?22:12,paint);
    }
    canvas.restore();
  }
  @Override public int getIntrinsicWidth() { return 24; }
  @Override public int getIntrinsicHeight() { return 24; }
  @Override public void setAlpha(int alpha) { paint.setAlpha(alpha); invalidateSelf(); }
  @Override public void setColorFilter(ColorFilter filter) { paint.setColorFilter(filter); invalidateSelf(); }
  @Override public int getOpacity() { return PixelFormat.TRANSLUCENT; }
}
