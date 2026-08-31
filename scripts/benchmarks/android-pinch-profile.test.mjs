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
  assert.match(source, /android-pinch-aggregate\.mjs/);
  assert.match(source, /--min-valid/);
  assert.match(source, /gfxWindowDurationMs/);
  assert.match(source, /without --device exactly one adb device/);
});
