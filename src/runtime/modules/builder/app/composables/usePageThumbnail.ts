// Types
import { BASE_DEVICE_KEY } from '../../../common/constants/devices';
import type {
    IBuilderSessionToken,
    IThumbnailUploadResponse,
    IUsePageThumbnailReturn,
} from '../types/composables';

// Vue
import { nextTick } from 'vue';

// Composables
import { useApiClient } from '../../../common/composables/useApiClient';

// Constants
import {
    BRICKS_S3_PROXY_TIMEOUT_MS,
    BRICKS_THUMBNAIL_UPLOAD_TIMEOUT_MS,
} from '../../../common/constants/apiTimeouts';

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
 *
 * @param sessionToken - Токен сессии: снимок канваса принадлежит той странице, из
 * которой запрос ушёл.
 */
export function usePageThumbnail(sessionToken: IBuilderSessionToken): IUsePageThumbnailReturn {
    const componentsStore = useComponentsStore();
    const publishStore = usePublishStore();

    /**
     * Находит DOM-ноду канваса для снапшота.
     *
     * В Figma mode на странице несколько `.bricks-canvas` — берём лист базового
     * устройства: снимок идёт в карточку страницы, и узкий лист показывал бы
     * не ту раскладку, по которой страницу узнают.
     */
    function findCanvasNode(): HTMLElement | null {
        return (
            document.querySelector<HTMLElement>(
                `[data-bricks-viewport="${BASE_DEVICE_KEY}"].bricks-canvas`
            ) ?? document.querySelector<HTMLElement>('.bricks-canvas')
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

            const request = apiFetcher<{ dataUrl: string }>('/api/bricks/media/s3-proxy', {
                method: 'POST',
                body: { url },
                // Семантически чтение, выполненное POST'ом: без override'а
                // сработал бы потолок записи (30 с), а нужен чуть выше
                // собственного лимита ручки — тогда наверх доезжает её ошибка, а
                // не наш обрыв. Размен: 15 с накрывают весь обмен, включая
                // передачу base64 в ответе, поэтому крупный ресурс на медленном
                // канале выпадет из снапшота. Съёмка превью — best-effort
                // (`fetchFn` возвращает false, ресурс просто не попадёт в кадр),
                // поэтому потолок здесь важнее полноты
                timeout: BRICKS_S3_PROXY_TIMEOUT_MS,
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
     * Токен приходит от вызывающего, а не снимается здесь: съёмка — хвост
     * сохранения, и «старт операции» — это момент, когда сохранение началось.
     * Со снятым на месте токеном все проверки ниже становятся пустыми, если сама
     * съёмка запущена уже после смены сессии, — так и было у `handleSaveAsCopy`,
     * который зовёт её после `await switchToSavedPage` (находка ревью).
     *
     * Границ три, и каждая отвечает за своё: на входе — до первой мутации общего
     * стора; после подготовительных await — до чтения живого DOM; после
     * `domToBlob` — до отправки результата. Ни одна не дублирует другую.
     *
     * @param pageId - Идентификатор сохранённой страницы.
     * @param startedIn - Токен сессии, снятый на старте сохранения.
     */
    async function captureAndUploadThumbnail(
        pageId: string | number,
        startedIn: number
    ): Promise<void> {
        try {
            // Проверка стоит до любого действия, а не только до съёмки: первым идёт
            // `deselectComponent`, а это запись в общий стор — сброс выделения,
            // выключение interactive preview и скрытие панели свойств. Вызванная из
            // вытесненного сохранения, она снимала бы выделение на канвасе уже
            // другой страницы (находка ревью)
            if (!sessionToken.isCurrent(startedIn)) {
                return;
            }

            if (!import.meta.client || componentsStore.sortedComponents.length === 0) {
                return;
            }

            // Сбрасываем выделение — outline выделенного компонента попал бы в снапшот
            componentsStore.deselectComponent();
            await nextTick();

            // Lazy import: библиотека попадает только в чанк билдера (bundle firewall)
            const { domToBlob } = await import('modern-screenshot');

            // `pageId` зафиксирован на старте, а снимается живой DOM канваса: после
            // перехода кадр принадлежал бы уже другой странице, и превью сохранённой
            // патчилось бы чужим содержимым. Эта проверка экономит работу — саму
            // подмену ловит проверка после съёмки
            if (!sessionToken.isCurrent(startedIn)) {
                return;
            }

            const node = findCanvasNode();
            if (!node) {
                return;
            }

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

            // Решающая проверка: `domToBlob` клонирует DOM не сразу. Сначала
            // `createContext` ждёт загрузку всех `img`/`video` канваса
            // (`waitUntilLoad`), и только потом идёт `cloneNode`
            // (modern-screenshot 4.7, index.mjs:452 и :1497). Переход внутри этого
            // окна означает, что снят уже канвас другой страницы, — такой кадр
            // нельзя грузить под зафиксированный `pageId` (находка ревью)
            if (!sessionToken.isCurrent(startedIn)) {
                return;
            }

            const formData = new FormData();
            formData.append('file', blob, `page-${pageId}.jpg`);
            formData.append('pageId', String(pageId));

            const { apiFetcher } = useApiClient();
            const response = await apiFetcher<IThumbnailUploadResponse>(
                '/api/bricks/media/s3-page-thumbnail',
                {
                    method: 'POST',
                    body: formData,
                    // Кадр канваса плюс серверная дожимка в webp и выгрузка в S3
                    timeout: BRICKS_THUMBNAIL_UPLOAD_TIMEOUT_MS,
                }
            );

            if (!response.success || !response.url) {
                throw new Error('Thumbnail upload failed');
            }

            // Без cache-buster'а: ключ уникален на каждую загрузку, поэтому URL
            // нового кадра сам по себе новый. Прежний `?v=<ts>` теперь только
            // мешал бы — этот же URL уносит в историю снапшот версии, и версии
            // отличались бы друг от друга параметром, а не файлом
            await publishStore.patchPage(pageId, { thumbnailUrl: response.url });
        } catch (error: unknown) {
            console.warn('[Bricks Thumbnail] Capture failed:', error);
        }
    }

    return { captureAndUploadThumbnail };
}
