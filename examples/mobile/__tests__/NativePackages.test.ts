import fs from 'node:fs';
import path from 'node:path';

it('registers Reanimated native package on Android', () => {
  const mainApplicationPath = path.resolve(
    __dirname,
    '../android/app/src/main/java/com/papyrusmobile/MainApplication.kt',
  );
  const source = fs.readFileSync(mainApplicationPath, 'utf8');

  expect(source).toContain('import com.swmansion.reanimated.ReanimatedPackage');
  expect(source).toContain('ReanimatedPackage()');
});
