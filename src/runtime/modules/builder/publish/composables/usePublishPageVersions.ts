import { computed, ref } from 'vue';
import type { IPageVersionSummary, TPublishedPageSummary } from '../../../common/types/bricks-api';
import type { IUsePublishPageVersionsReturn } from '../types/composables';
import { fetchPageVersionsRequest, fetchPageVersionRequest } from '../utils/publishApi';
import { usePublishPreview } from './usePublishPreview';

/**
 * Версии страницы для панели деталей дашборда: список сводок и превью полного
 * снапшота через общий механизм `/preview/<pagename>` (см. `usePublishPreview`).
 * Ошибки запросов пробрасываются — уведомления показывает вызывающий компонент.
 */
export function usePublishPageVersions(): IUsePublishPageVersionsReturn {
    const { previewPageVersion } = usePublishPreview();

    const versions = ref<IPageVersionSummary[]>([]);
    const previewingVersionId = ref<number | null>(null);

    // Номер последнего стартовавшего запроса: им отсекается ответ, пришедший
    // после переключения панели на другую страницу или после более свежей
    // загрузки той же (список версий меняется откатом и сохранением)
    let versionsRequestId = 0;

    // Счётчик, а не флаг: у двух параллельных загрузок (раскрытие секции плюс
    // перезагрузка по изменившемуся updatedAt) `finally` первой снимал бы
    // индикатор, пока вторая ещё идёт
    const pendingLoads = ref(0);
    const isLoading = computed<boolean>(() => pendingLoads.value > 0);

    /**
     * Очищает список и обесценивает уже летящий запрос. Зовётся при
     * переключении панели на другую страницу: без обесценивания ответ прежней
     * страницы приземлился бы после очистки и показал бы её версии как версии
     * новой — с ними и уходил бы откат.
     */
    function resetVersions(): void {
        versionsRequestId += 1;
        versions.value = [];
    }

    /**
     * Загружает сводки версий страницы.
     *
     * Отказ список не стирает: уже показанные версии переживают transient-отказ,
     * а сообщение получает вызывающий. Отказ вытесненного запроса не
     * докладывается — уведомление о нём накрыло бы результат более свежего.
     *
     * @param pageId - Идентификатор страницы.
     */
    async function loadVersions(pageId: string | number): Promise<void> {
        const requestId = ++versionsRequestId;
        pendingLoads.value += 1;

        try {
            const loaded = await fetchPageVersionsRequest(pageId);

            if (requestId !== versionsRequestId) {
                return;
            }

            versions.value = loaded;
        } catch (error: unknown) {
            if (requestId !== versionsRequestId) {
                return;
            }

            throw error;
        } finally {
            pendingLoads.value -= 1;
        }
    }

    /**
     * Загружает полный снапшот версии и открывает его превью в новой вкладке.
     *
     * @param page - Текущая страница (источник pagename превью-роута).
     * @param versionId - Идентификатор версии.
     */
    async function previewVersion(page: TPublishedPageSummary, versionId: number): Promise<void> {
        if (previewingVersionId.value !== null) {
            return;
        }

        previewingVersionId.value = versionId;
        try {
            const version = await fetchPageVersionRequest(page.id, versionId);
            previewPageVersion(page, version);
        } finally {
            previewingVersionId.value = null;
        }
    }

    return {
        versions,
        isLoading,
        previewingVersionId,
        loadVersions,
        previewVersion,
        resetVersions,
    };
}
