/**
 * Contract of `usePublishTemplatesSurface` — the templates surface of the dashboard.
 *
 * A file of its own rather than a region of `composables.d.ts`: that file stands at
 * the `max-lines` ceiling, and the domain already keeps the contracts of its other
 * surfaces thematically (`dashboard.d.ts` holds the options and the return of
 * `usePublishDashboardSections` the same way).
 */

import type { ComputedRef } from 'vue';
import type { TPublishedPageSummary } from '../../../common/types/bricks-api';
import type { TBricksTemplateSummary } from '../../../common/types/templates';
import type { ITemplateSaveSource } from '../../templates/types/templates';
import type { TMediaLightboxItem } from '../../media/types/media';

/**
 * Options of `usePublishTemplatesSurface`.
 */
export interface IUsePublishTemplatesSurfaceOptions {
    /** Showing a toast: the schema of the source page could not be read */
    onNotify: (message: string, variant: 'success' | 'error') => void;
}

/**
 * The return value of `usePublishTemplatesSurface`. Every field is read-only: the
 * surface owns the state, and the host reads it — the meaning of each one is stated
 * beside its `ref` in the composable rather than repeated here.
 */
export interface IUsePublishTemplatesSurfaceReturn {
    source: ComputedRef<ITemplateSaveSource | null>;
    isModalOpen: ComputedRef<boolean>;
    preparingPageId: ComputedRef<string | null>;
    createTemplate: ComputedRef<TBricksTemplateSummary | null>;
    previewItem: ComputedRef<TMediaLightboxItem | null>;
    requestFromPage: (page: TPublishedPageSummary) => Promise<void>;
    close: () => void;
    selectForCreate: (template: TBricksTemplateSummary) => void;
    clearCreateSelection: () => void;
    previewThumbnail: (template: TBricksTemplateSummary) => void;
    closePreview: () => void;
}
