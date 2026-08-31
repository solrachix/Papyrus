import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import test from 'node:test';

test('multitouch probe prefers emulator events, then real Protocol B/helper fallbacks', async () => {
  const source = await fs.readFile(new URL('./android-multitouch-probe.sh', import.meta.url), 'utf8');
  assert.match(source, /emu event send/);
  assert.match(source, /getevent -lp/);
  assert.match(source, /ABS_MT_SLOT/);
  assert.match(source, /sendevent/);
  assert.match(source, /BTN_TOUCH/);
  assert.match(source, /ABS_MT_TOUCH_MAJOR/);
  assert.match(source, /ABS_MT_PRESSURE/);
  assert.match(source, /map_touch_x/);
  assert.match(source, /map_touch_y/);
  assert.match(source, /density_dpi/);
  assert.match(source, /radius_dp/);
  assert.match(source, /160/);
  assert.match(source, /PAPYRUS_MULTITOUCH_HELPER/);
  assert.match(source, /run_emulator_console \|\| run_protocol_b \|\| run_helper/);
  assert.match(source, /57/);
  assert.match(source, /direction/);
  assert.doesNotMatch(source, /input touchscreen swipe/);
});
