// #region Imports
// Types
import type { TBricksTemplateSummary } from '../../../common/types/templates';
import type { IUseTemplateActionsOptions, IUseTemplateActionsReturn } from '../types/templates';

// Utils
import { deleteTemplateRequest } from '../utils/templatesApi';
import { resolveTemplateActionErrorKey } from '../utils/templateErrors';
import { isRequestTimeoutError } from '../../../common/utils/apiRequestPolicy';

// Vue
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';

// Composables
import { useTemplatesData } from './useTemplatesData';
// #endregion

/**
 * Операции над шаблоном: подтверждение и удаление.
 *
 * Занятость — одна на раздел, а не набор занятых карточек: удаление уносит
 * запись из сетки, и вторая операция, начатая в это же время, целилась бы в
 * состояние, которого через мгновение не будет. Раздел с двумя карточками так же
 * прост, как с одной, и один занятый идентификатор проще набора.
 *
 * Переименование сюда не входит: у него своя форма с полями и валидацией
 * (`useTemplateRenameForm`), а здесь — действия без ввода.
 *
 * @param options - Показ тоста.
 * @returns Состояние подтверждения и операции.
 */
export function useTemplateActions(options: IUseTemplateActionsOptions): IUseTemplateActionsReturn {
    // #region Data
    const { t } = useI18n();
    const { removeTemplate, refreshTemplates } = useTemplatesData();

    /** Шаблон, чьё удаление подтверждают; `null` — диалог закрыт. */
    const confirmTarget = ref<TBricksTemplateSummary | null>(null);
    const pendingTemplateId = ref<number | null>(null);
    const isDeleting = ref(false);
    // #endregion

    // #region Computed
    const isDeleteConfirmOpen = computed<boolean>(() => confirmTarget.value !== null);

    /**
     * Текст подтверждения говорит именно то, что удаление ничего не ломает:
     * страницы, созданные из шаблона, не изменятся — связи с ним у них нет.
     * Без этого удаление читалось бы как рискованное.
     */
    const deleteConfirmDescription = computed<string>(() =>
        confirmTarget.value
            ? t('bricks.templates.deleteConfirm.description', { name: confirmTarget.value.name })
            : ''
    );
    // #endregion

    // #region Methods
    /**
     * Спрашивает подтверждение удаления шаблона.
     *
     * @param template - Шаблон.
     */
    function requestDelete(template: TBricksTemplateSummary): void {
        if (pendingTemplateId.value !== null) {
            return;
        }

        confirmTarget.value = template;
    }

    /**
     * Закрывает подтверждение, не удаляя. Во время самой операции не закрывается:
     * диалог показывает её ход, и убранный из-под руки он оставил бы человека без
     * исхода.
     */
    function closeDeleteConfirm(): void {
        if (isDeleting.value) {
            return;
        }

        confirmTarget.value = null;
    }

    /**
     * Удаляет подтверждённый шаблон.
     *
     * Строка убирается из списка ответом ручки, а не повторным чтением: удаление
     * не оставляет о записи ничего, что стоило бы перечитывать. Обрыв по потолку
     * ожидания — исключение: исход неизвестен (сервер мог удалить и не успеть
     * ответить), и тогда список перечитывается, чтобы человек увидел факт.
     */
    async function confirmDelete(): Promise<void> {
        const template = confirmTarget.value;

        if (!template || isDeleting.value) {
            return;
        }

        isDeleting.value = true;
        pendingTemplateId.value = template.id;

        try {
            await deleteTemplateRequest(template.id);
            removeTemplate(template.id);
            confirmTarget.value = null;
            options.onNotify(
                t('bricks.templates.toasts.deleted', { name: template.name }),
                'success'
            );
        } catch (error: unknown) {
            if (isRequestTimeoutError(error)) {
                confirmTarget.value = null;
                options.onNotify(t('bricks.templates.errors.deleteOutcomeUnknown'), 'error');
                await refreshTemplates();
                return;
            }

            options.onNotify(t(resolveTemplateActionErrorKey(error)), 'error');
        } finally {
            isDeleting.value = false;
            pendingTemplateId.value = null;
        }
    }
    // #endregion

    return {
        pendingTemplateId: computed(() => pendingTemplateId.value),
        isDeleteConfirmOpen,
        deleteConfirmDescription,
        isDeleting: computed(() => isDeleting.value),
        requestDelete,
        closeDeleteConfirm,
        confirmDelete,
    };
}
