import { describe, expect, it } from '@jest/globals';
import { isAllowedResearchFilename, RESEARCH_FILE_EXTENSIONS } from '@/services/api/files';

describe('isAllowedResearchFilename', () => {
  it.each(RESEARCH_FILE_EXTENSIONS)('accepts a .%s file', (extension) => {
    expect(isAllowedResearchFilename(`sample.${extension}`)).toBe(true);
  });

  it('matches the extension case-insensitively', () => {
    expect(isAllowedResearchFilename('SCAN.H5')).toBe(true);
  });

  it('reads only the final extension, so dotted research filenames pass', () => {
    // Mirrors the backend, which takes Path(name).suffix — "sample.v2.csv" is a
    // legitimate research filename, not a double-extension bypass attempt.
    expect(isAllowedResearchFilename('sample.v2.csv')).toBe(true);
    expect(isAllowedResearchFilename('report.csv.exe')).toBe(false);
  });

  it.each(['payload.svg', 'script.sh', 'archive.zip', 'photo.jpg'])('rejects %s', (filename) => {
    expect(isAllowedResearchFilename(filename)).toBe(false);
  });

  it('rejects a name with no extension at all', () => {
    expect(isAllowedResearchFilename('README')).toBe(false);
    expect(isAllowedResearchFilename('csv')).toBe(false);
  });
});
