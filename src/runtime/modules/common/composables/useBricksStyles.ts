// #region Imports
// Types
import type { TBricksResolvedDeviceSet } from '../types/devices';

// Nuxt
import { useHead } from 'nuxt/app';

// Utils
import { buildBricksContainerCss } from '../utils/bricks/containerCss';
// #endregion

/** Ключ тега: по нему набор страницы вытесняет проектный. */
const BRICKS_CONTAINER_STYLE_KEY = 'bricks-container';

/**
 * Инъекция стилей контейнера в `<head>`.
 *
 * Тег помечен фиксированным `key` и `tagDuplicateStrategy: 'replace'`: плагин
 * пишет CSS набора ПРОЕКТА, а страница со своим набором регистрирует запись
 * позже и вытесняет её по тому же ключу. Уход со страницы снимает запись, и
 * проектный CSS возвращается. Без `key` дедупа не будет вовсе — в `<head>`
 * окажутся оба тега, и раскладку решит порядок.
 *
 * Аргумент — геттер, а не значение: набор страницы меняется без перемонтирования
 * (правка в модалке, live-preview, переход между страницами билдера), и
 * одноразовый вызов оставил бы CSS первой открытой страницы.
 *
 * @param getDevices - Геттер резолвнутого набора устройств.
 */
export function useBricksStyles(getDevices: () => TBricksResolvedDeviceSet): void {
    useHead(() => ({
        style: [
            {
                key: BRICKS_CONTAINER_STYLE_KEY,
                tagDuplicateStrategy: 'replace',
                innerHTML: buildBricksContainerCss(getDevices()),
            },
        ],
    }));
}
