import { ref, type Ref } from 'vue';
import type { IPageVersionSummary, IPublishedPage } from '../../../common/types/bricks-api';
import { fetchPageVersionsRequest, fetchPageVersionRequest } from '../utils/publishApi';
import { usePublishPreview } from './usePublishPreview';

/**
 * Возвращаемое значение `usePublishPageVersions`.
 */
export interface IUsePublishPageVersionsReturn {
    versions: Ref<IPageVersionSummary[]>;
    isLoading: Ref<boolean>;
    previewingVersionId: Ref<number | null>;
    loadVersions: (pageId: string | number) => Promise<void>;
    previewVersion: (page: IPublishedPage, versionId: number) => Promise<void>;
}

/**
 * Версии страницы для панели деталей дашборда: список сводок и превью полного
 * снапшота через общий механизм `/preview/<pagename>` (см. `usePublishPreview`).
 * Ошибки запросов пробрасываются — уведомления показывает вызывающий компонент.
 */
export function usePublishPageVersions(): IUsePublishPageVersionsReturn {
    const { previewPageVersion } = usePublishPreview();

    const versions = ref<IPageVersionSummary[]>([]);
    const isLoading = ref(false);
    const previewingVersionId = ref<number | null>(null);

    /**
     * Загружает сводки версий страницы (при ошибке список сбрасывается).
     *
     * @param pageId - Идентификатор страницы.
     */
    async function loadVersions(pageId: string | number): Promise<void> {
        isLoading.value = true;
        try {
            versions.value = await fetchPageVersionsRequest(pageId);
        } catch (error: unknown) {
            versions.value = [];
            throw error;
        } finally {
            isLoading.value = false;
        }
    }

    /**
     * Загружает полный снапшот версии и открывает его превью в новой вкладке.
     *
     * @param page - Текущая страница (источник pagename превью-роута).
     * @param versionId - Идентификатор версии.
     */
    async function previewVersion(page: IPublishedPage, versionId: number): Promise<void> {
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

    return { versions, isLoading, previewingVersionId, loadVersions, previewVersion };
}
