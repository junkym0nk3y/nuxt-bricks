// Utils
import { createPublishValidationSchema } from '../../../publish/utils/validationSchema';

// Vue
import { useI18n } from 'vue-i18n';

// Composables
import { useBricksPageAddress } from '../../../../common/composables/useBricksPageAddress';

// Pinia
import { usePublishStore } from '../../../publish/stores/publish';

/**
 * Composable для получения validation schema формы публикации сайдбара.
 * Обёртка над `createPublishValidationSchema` (publish/utils): подставляет
 * i18n, проверку уникальности из store и `editingPageId` текущей сессии
 * редактора как исключение при редактировании.
 *
 * Редактируемая страница читается из стора в момент валидации, а не снимком на
 * создании схемы: панель настроек переживает переход на другую страницу, и
 * снимок «редактируем новую» заставлял бы существующую страницу считать свой же
 * pagename занятым.
 */
export function usePublishValidationSchema() {
    const publishStore = usePublishStore();
    const { t } = useI18n();
    const { isPageAddressFree, isEditorAddressFree } = useBricksPageAddress();

    const validationSchema = createPublishValidationSchema({
        t: (key) => t(key),
        isPageAddressFree,
        isEditorAddressFree,
        isPagenameAvailable: (pagename, excludeId) =>
            publishStore.isPagenameAvailable(pagename, excludeId),
        getExcludeId: () => publishStore.editingPageId ?? undefined,
    });

    return {
        validationSchema,
    };
}
