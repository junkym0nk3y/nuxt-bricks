/**
 * The preview of a page opened from a row of the dashboard.
 *
 * What is guarded here: a blocked tab reaches the person. The control is drawn per
 * page, a row has no other way to report a refusal, and silence reads as a button
 * that does nothing. The address is checked by what actually travels into
 * `window.open`: the row is the third surface opening a preview, and a URL built on
 * its own has no place there.
 */

// #region Imports
// Vitest
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Pinia
import { createPinia, setActivePinia } from 'pinia';

// Types
import type { IPreviewWindowStub } from '../helpers/types';

// Utils
import { createPageSummaryBuilder, createPreviewWindowStub } from '../helpers/publishFixtures';
// #endregion

// #region Mocks
vi.mock('../../src/runtime/modules/common/composables/useApiClient', () => ({
    useApiClient: () => ({ apiFetcher: vi.fn() }),
}));

vi.mock('vue-i18n', () => ({
    useI18n: () => ({ t: (key: string) => key }),
}));
// #endregion

import { usePublishPageActions } from '../../src/runtime/modules/builder/publish/composables/usePublishPageActions';

const buildPage = createPageSummaryBuilder();

describe('previewPage: the outcome of opening a tab', () => {
    let windowStub: IPreviewWindowStub;

    beforeEach(() => {
        setActivePinia(createPinia());
        windowStub = createPreviewWindowStub();
        vi.stubGlobal('window', windowStub);
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('opens the preview route by the whole address of the page', () => {
        const onNotify = vi.fn();
        const { previewPage } = usePublishPageActions({ onNotify });

        previewPage(buildPage({ pagename: 'post', urlPrefix: 'blog' }));

        expect(windowStub.open).toHaveBeenCalledWith('/bricks-preview/blog/post', '_blank');
        expect(onNotify).not.toHaveBeenCalled();
    });

    it('reports a blocked popup by a toast instead of losing it', () => {
        const onNotify = vi.fn();
        const { previewPage } = usePublishPageActions({ onNotify });
        windowStub.open.mockReturnValueOnce(null);

        previewPage(buildPage({ pagename: 'landing' }));

        expect(onNotify).toHaveBeenCalledWith('bricks.publish.toasts.previewFailed', 'error');
    });

    it('refuses instead of throwing when there is no window', () => {
        const onNotify = vi.fn();
        const { previewPage } = usePublishPageActions({ onNotify });
        vi.stubGlobal('window', undefined);

        expect(() => previewPage(buildPage({ pagename: 'landing' }))).not.toThrow();
        expect(onNotify).toHaveBeenCalledWith('bricks.publish.toasts.previewFailed', 'error');
    });
});
