// #region Imports
// Types
import type { TBrickDemoValues } from '../../../common/types/index';
import type { TMediaKind } from '../../../common/types/media';
import type { IBrickUiCommonProp } from '../../../ui/types/common';
import type { IMediaKindFilter, IMediaKindFilterOptions } from '../types/composables';

// Vue
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
// #endregion

/** Caption keys of the kinds, in the order the select lists them */
const KIND_LABEL_KEYS: Readonly<Record<TMediaKind, string>> = {
    image: 'bricks.media.kindFilter.image',
    video: 'bricks.media.kindFilter.video',
    document: 'bricks.media.kindFilter.document',
};

/**
 * The kind filter of a media library surface: images, video or documents.
 *
 * One mechanism for the gallery modal and the dashboard section, the way the category
 * select of a file is. The value is held here rather than by the caller: neither
 * surface shares it with anyone, and both drop it on their own occasions
 * (`resetKindFilter`).
 *
 * A picked kind that the surface no longer offers reads as "every kind": the modal
 * stays mounted between openings, and a filter left from a gallery of pictures would
 * otherwise empty the grid of a gallery opened for a document.
 *
 * @param options - The kinds the surface offers.
 * @returns The value of the filter and the options of its select.
 */
export function useMediaKindFilter(options: IMediaKindFilterOptions): IMediaKindFilter {
    // #region Data
    const { t } = useI18n();
    const pickedKind = ref<TMediaKind | null>(null);
    // #endregion

    // #region Computed
    const kindFilter = computed<TMediaKind | null>(() =>
        pickedKind.value && options.kinds().includes(pickedKind.value) ? pickedKind.value : null
    );

    const hasKindChoice = computed<boolean>(() => options.kinds().length > 1);

    const kindOptions = computed<IBrickUiCommonProp[]>(() => [
        { label: t('bricks.media.kindFilter.all'), value: '' },
        ...options.kinds().map((kind) => ({ label: t(KIND_LABEL_KEYS[kind]), value: kind })),
    ]);

    const kindFacets = computed<TBrickDemoValues[]>(() =>
        kindOptions.value.map((option) => option.value)
    );

    const selectedKind = computed<string>(() => kindFilter.value ?? '');
    // #endregion

    // #region Methods
    /**
     * Takes the value reported by the select; anything that is not a kind on offer
     * (the empty "every kind" option first of all) clears the filter.
     *
     * @param value - The value of the select.
     */
    function handleKindChange(value: TBrickDemoValues | null): void {
        const kind = options.kinds().find((candidate) => candidate === value);

        pickedKind.value = kind ?? null;
    }

    /** Puts the filter back to every kind */
    function resetKindFilter(): void {
        pickedKind.value = null;
    }
    // #endregion

    return {
        kindFilter,
        kindOptions,
        kindFacets,
        selectedKind,
        hasKindChoice,
        handleKindChange,
        resetKindFilter,
    };
}
