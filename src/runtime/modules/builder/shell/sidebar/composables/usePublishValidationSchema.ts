// Utils
import { createPublishValidationSchema } from '../../../publish/utils/validationSchema';

// Vue
import { useI18n } from 'vue-i18n';

// Pinia
import { usePublishStore } from '../../../publish/stores/publish';

/**
 * Composable для получения validation schema формы публикации сайдбара.
 * Обёртка над `createPublishValidationSchema` (publish/utils): подставляет
 * i18n, проверку уникальности из store и `editingPageId` текущей сессии
 * редактора как исключение при редактировании.
 *
 * @param isEditing - режим редактирования (для проверки уникальности pagename).
 */
export function usePublishValidationSchema(isEditing: boolean) {
    const publishStore = usePublishStore();
    const { t } = useI18n();

    const validationSchema = createPublishValidationSchema({
        t: (key) => t(key),
        isPagenameAvailable: (pagename, excludeId) =>
            publishStore.isPagenameAvailable(pagename, excludeId),
        getExcludeId: () =>
            isEditing && publishStore.editingPageId !== null
                ? publishStore.editingPageId
                : undefined,
    });

    return {
        validationSchema,
    };
}
