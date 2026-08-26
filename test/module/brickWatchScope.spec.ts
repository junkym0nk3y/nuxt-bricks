/**
 * Scope of the dev watcher over brick files.
 *
 * The manifest is built from `<srcDir>/components/**` alone, so the watcher has no
 * reason to rebuild it for a `*.brick.ts` lying anywhere else — and it must still
 * react inside that directory whichever way the `builder:watch` hook hands the path
 * over: absolute, or relative to `srcDir` (`experimental.relativeWatchPaths`).
 */

// #region Imports
// Vitest
import { describe, expect, it } from 'vitest';

// Utils
import { isBrickFilePath } from '../../src/bricks-manifest';
// #endregion

const SRC_DIR = '/repo/playground';

describe('isBrickFilePath', () => {
    it.each([
        ['relative path inside the scan scope', 'components/cards/Promo.brick.ts', true],
        ['absolute path inside the scan scope', `${SRC_DIR}/components/Promo.brick.ts`, true],
        ['brick file outside the scan scope', 'lib/bricks/Promo.brick.ts', false],
        ['absolute brick file outside the scope', `${SRC_DIR}/lib/Promo.brick.ts`, false],
        ['ordinary component inside the scope', 'components/cards/Promo.vue', false],
        ['directory whose name only starts alike', 'components-legacy/Promo.brick.ts', false],
    ])('%s', (_case, path, expected) => {
        expect(isBrickFilePath(SRC_DIR, path)).toBe(expected);
    });
});
