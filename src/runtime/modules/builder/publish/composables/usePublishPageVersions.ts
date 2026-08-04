import { computed, ref } from 'vue';
import type { IPageVersionSummary, TPublishedPageSummary } from '../../../common/types/bricks-api';
import type { IUsePublishPageVersionsReturn } from '../types/composables';
import { fetchPageVersionsRequest } from '../utils/publishApi';
import { usePublishPreview } from './usePublishPreview';

/**
 * Версии страницы для панели деталей дашборда: список сводок и превью версии
 * через общий превью-роут `<previewPrefix>/<pagename>?version=<id>`
 * (см. `usePublishPreview`).
 * Ошибки запросов пробрасываются — уведомления показывает вызывающий компонент.
 */
export function usePublishPageVersions(): IUsePublishPageVersionsReturn {
    const { previewPageVersion } = usePublishPreview();

    const versions = ref<IPageVersionSummary[]>([]);

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
     * Открывает превью версии в новой вкладке.
     *
     * Снапшот не загружается: версия уходит в URL (`?version=`), и её тянет
     * middleware превью-роута — вкладка рендерится сервером сразу нужным
     * состоянием, а клиенту ждать нечего.
     *
     * @param page - Текущая страница (источник pagename превью-роута).
     * @param versionId - Идентификатор версии.
     * @returns false, если вкладка не открылась (блокировщик попапов).
     */
    function previewVersion(page: TPublishedPageSummary, versionId: number): boolean {
        return previewPageVersion(page.pagename, versionId) !== null;
    }

    return {
        versions,
        isLoading,
        loadVersions,
        previewVersion,
        resetVersions,
    };
}
