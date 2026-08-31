import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import test from 'node:test';

test('profile runner requires real fixture/deep-link/multipointer contracts', async () => {
  const source = await fs.readFile(new URL('./android-pinch-profile.sh', import.meta.url), 'utf8');
  assert.match(source, /large-1000/);
  assert.match(source, /viewerMode=compat/);
  assert.match(source, /fixture=\$\{fixture\}\\&runId=\$\{run_id\}\\&sampleId=\$\{sample_id\}/);
  assert.match(source, /dumpsys gfxinfo.*reset/);
  assert.match(source, /android-multitouch-probe\.sh/);
  assert.match(source, /preview\.cleared/);
  assert.match(source, /wait_for_log 'sample\.end' 90/);
  assert.match(source, /adb -s "\$device" shell sleep 10/);
  assert.match(source, /android-pinch-aggregate\.mjs/);
  assert.match(source, /--min-valid/);
  assert.match(source, /gfxWindowDurationMs/);
  assert.match(source, /without --device exactly one adb device/);
});

test('profile metadata writes one key per line so gfx window is parseable', async () => {
  const source = await fs.readFile(new URL('./android-pinch-profile.sh', import.meta.url), 'utf8');
  assert.ok(source.includes('"fixture=$fixture" \\\n        "direction=$direction" \\\n        "run=$run" \\\n        "device=$device" \\\n        "gfxWindowDurationMs=$gfx_window_duration_ms"'));
  assert.doesNotMatch(source, /fixture=\$\{fixture\} direction=\$\{direction\}/);
});

test('closes the gfx window before draining late render events', async () => {
  const source = await fs.readFile(new URL('./android-pinch-profile.sh', import.meta.url), 'utf8');
  const gfxDump = source.indexOf('dumpsys gfxinfo "$package_id" > "$sample_dir/gfxinfo.txt"');
  const drain = source.indexOf('adb -s "$device" shell sleep 10');
  const eventCapture = source.indexOf('events.ndjson');
  assert.ok(gfxDump !== -1 && drain !== -1 && eventCapture !== -1);
  assert.ok(gfxDump < drain);
  assert.ok(drain < eventCapture);
});
