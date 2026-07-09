// Types
import type { IThumbnailUploadResponse, IUsePageThumbnailReturn } from '../types/composables';

// Vue
import { nextTick } from 'vue';

// Composables
import { useApiClient } from '../../../common/composables/useApiClient';

// Pinia
import { useComponentsStore } from '../../core/stores/components';
import { usePublishStore } from '../../publish/stores/publish';

/** Целевая ширина снапшота канваса (px) — сервер дожимает webp до той же ширины. */
const THUMBNAIL_TARGET_WIDTH = 480;

/** Соотношение сторон миниатюры в дашборде (16:10). */
const THUMBNAIL_ASPECT_RATIO = 0.625;

/** Ограничение высоты снапшота — примерно два кадра 16:10, чтобы не рендерить очень длинные страницы. */
const THUMBNAIL_MAX_FRAMES = 2;

/**
 * Снапшот канваса для превью страницы в дашборде /bricks: снимает DOM канваса
 * (modern-screenshot, lazy-чанк билдера), загружает в S3 и патчит `thumbnailUrl` страницы.
 * Fire-and-forget: любые ошибки гасятся `console.warn`, сохранение страницы не блокируется.
 */
export function usePageThumbnail(): IUsePageThumbnailReturn {
    const componentsStore = useComponentsStore();
    const publishStore = usePublishStore();

    /**
     * Находит DOM-ноду канваса для снапшота.
     * В Figma mode на странице несколько `.bricks-canvas` — берём desktop-viewport.
     */
    function findCanvasNode(): HTMLElement | null {
        return (
            document.querySelector<HTMLElement>('[data-bricks-viewport="desktop"].bricks-canvas') ??
            document.querySelector<HTMLElement>('.bricks-canvas')
        );
    }

    /**
     * Собирает fetchFn для modern-screenshot: cross-origin медиа тянется через
     * same-origin прокси (бакет без CORS-заголовков не отдаёт байты dom-to-image).
     * Прокси пускает только URL из медиа-библиотеки; остальное — false (обычный fetch).
     *
     * @returns Функция-резолвер ресурса в data URL с кэшем на время снапшота.
     */
    function createProxyFetchFn(): (url: string) => Promise<string | false> {
        const { apiFetcher } = useApiClient();
        const cache = new Map<string, Promise<string | false>>();

        return (url: string) => {
            if (url.startsWith('data:') || url.startsWith(window.location.origin)) {
                return Promise.resolve(false);
            }

            const cached = cache.get(url);
            if (cached) {
                return cached;
            }

            const request = apiFetcher<{ dataUrl: string }>('/mock-api/s3-media-proxy', {
                method: 'POST',
                body: { url },
            }).then(
                (response) => response.dataUrl || false,
                () => false as const
            );

            cache.set(url, request);
            return request;
        };
    }

    /**
     * Снимает канвас, загружает снапшот в S3 и сохраняет `thumbnailUrl` страницы PATCH'ем.
     * Пустая схема пропускается (в канвасе — только watermark пустого состояния).
     *
     * @param pageId - Идентификатор сохранённой страницы.
     */
    async function captureAndUploadThumbnail(pageId: string | number): Promise<void> {
        try {
            if (!import.meta.client || componentsStore.sortedComponents.length === 0) {
                return;
            }

            // Сбрасываем выделение — outline выделенного компонента попал бы в снапшот
            componentsStore.deselectComponent();
            await nextTick();

            const node = findCanvasNode();
            if (!node) {
                return;
            }

            // Lazy import: библиотека попадает только в чанк билдера (bundle firewall)
            const { domToBlob } = await import('modern-screenshot');
            const blob = await domToBlob(node, {
                scale: Math.min(1, THUMBNAIL_TARGET_WIDTH / node.offsetWidth),
                type: 'image/jpeg',
                quality: 0.8,
                // Явные размеры в layout-пикселях: без width либа берёт ширину из
                // boundingClientRect (уже ужатую canvasTransform'ом) и обрезает контент справа
                width: node.offsetWidth,
                height: Math.min(
                    node.offsetHeight,
                    node.offsetWidth * THUMBNAIL_ASPECT_RATIO * THUMBNAIL_MAX_FRAMES
                ),
                // Нейтрализуем canvasTransform (fitScale * remCompensation) и рамку канваса
                style: { transform: 'none', margin: '0', boxShadow: 'none', borderRadius: '0' },
                fetchFn: createProxyFetchFn(),
            });

            const formData = new FormData();
            formData.append('file', blob, `page-${pageId}.jpg`);
            formData.append('pageId', String(pageId));

            const { apiFetcher } = useApiClient();
            const response = await apiFetcher<IThumbnailUploadResponse>(
                '/mock-api/s3-page-thumbnail',
                { method: 'POST', body: formData }
            );

            if (!response.success || !response.url) {
                throw new Error('Thumbnail upload failed');
            }

            // Cache-buster: S3-ключ детерминированный (перезапись), CDN/браузер не должны отдавать старый кадр
            await publishStore.patchPage(pageId, {
                thumbnailUrl: `${response.url}?v=${Date.now()}`,
            });
        } catch (error: unknown) {
            console.warn('[Bricks Thumbnail] Capture failed:', error);
        }
    }

    return { captureAndUploadThumbnail };
}
