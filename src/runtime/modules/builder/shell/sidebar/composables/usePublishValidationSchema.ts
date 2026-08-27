// Types
import type { IUsePublishValidationSchemaReturn } from '../types/composables';

// Utils
import { createPublishValidationSchema } from '../../../publish/utils/validationSchema';

// Vue
import { useI18n } from 'vue-i18n';

// Composables
import { useBricksPageAddress } from '../../../../common/composables/useBricksPageAddress';

// Pinia
import { usePublishStore } from '../../../publish/stores/publish';

/**
 * Validation schema of the sidebar publish form. A wrapper over
 * `createPublishValidationSchema` (publish/utils): it supplies i18n, the uniqueness
 * check from the store, and the `editingPageId` of the current editor session as the
 * exception to that check while a page is being edited.
 *
 * The page being edited is read from the store at validation time rather than
 * snapshotted when the schema is created: the settings panel survives a move to
 * another page, and a snapshot saying "a new page is being edited" would make an
 * existing page treat its own pagename as taken.
 */
export function usePublishValidationSchema(): IUsePublishValidationSchemaReturn {
    const publishStore = usePublishStore();
    const { t } = useI18n();
    const { isPageAddressFree, isEditorAddressFree } = useBricksPageAddress();

    const validationSchema = createPublishValidationSchema({
        t: (key) => t(key),
        isPageAddressFree,
        isEditorAddressFree,
        isAddressAvailable: (address, excludeId) =>
            publishStore.isAddressAvailable(address, excludeId),
        getExcludeId: () => publishStore.editingPageId ?? undefined,
    });

    return {
        validationSchema,
    };
}
