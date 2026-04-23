import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from '@jest/globals';

const SRC_ROOT = path.resolve(__dirname, '..');
const ASSET_THEME_IMPORT_PATTERN = /@\/assets\/themes\/(light|dark)/;
const HARD_CODED_COLOR_PATTERN = /#[0-9A-Fa-f]{3,8}|rgba\(/;
const MODERNIZED_FILES = [
  'lib/router/styles.ts',
  'lib/router/background.ts',
  'components/auth/LoginSections.tsx',
  'components/auth/NewAccountSections.tsx',
  'components/cameras/CameraCard.tsx',
  'components/cameras/TelemetryBadge.tsx',
  'components/cameras/live-preview/styles.ts',
  'components/cameras/live-preview/shared.tsx',
  'components/cameras/screen/styles.ts',
  'components/common/ActiveStreamBanner.tsx',
  'components/common/StreamingContent.tsx',
  'components/product/gallery/styles.ts',
  'components/product/gallery/ProductImageGalleryContent.tsx',
  'components/product/gallery/ProductImageEmptyEditState.tsx',
  'components/product/gallery/ProductImageThumbnails.tsx',
  'components/product/gallery/ProductImageLightbox.tsx',
  'components/product/ProductDelete.tsx',
  'components/product/ProductMetaData.tsx',
  'components/profile/sections/styles.ts',
  'app/(auth)/onboarding.tsx',
  'app/cameras/add.tsx',
].map((file) => path.join(SRC_ROOT, file));

describe('theme regressions', () => {
  it('does not import raw asset themes outside the theme layer and tests', () => {
    const checkedFiles = MODERNIZED_FILES.filter(
      (file) => !file.includes(`${path.sep}theme${path.sep}`),
    );
    const violations = checkedFiles.filter((file) =>
      ASSET_THEME_IMPORT_PATTERN.test(readFileSync(file, 'utf8')),
    );

    expect(violations).toEqual([]);
  });

  it('keeps hard-coded color literals out of the files modernized to semantic tokens', () => {
    const violations = MODERNIZED_FILES.filter((file) => {
      const source = readFileSync(file, 'utf8');
      return HARD_CODED_COLOR_PATTERN.test(source);
    });

    expect(violations).toEqual([]);
  });
});
