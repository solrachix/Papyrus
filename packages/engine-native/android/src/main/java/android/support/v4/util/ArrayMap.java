package android.support.v4.util;

import java.util.HashMap;
import java.util.Map;

public class ArrayMap<K, V> extends HashMap<K, V> {
  public ArrayMap() {
    super();
  }

  public ArrayMap(int capacity) {
    super(capacity);
  }

  public ArrayMap(Map<? extends K, ? extends V> map) {
    super(map);
  }
}
