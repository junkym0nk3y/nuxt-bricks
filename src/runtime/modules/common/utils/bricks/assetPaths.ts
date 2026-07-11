/**
 * Единый источник URL публичных ассетов модуля (превью layout-блоков,
 * плейсхолдер изображений, картинки документации).
 *
 * Ассеты раздаются Nitro под выделенным префиксом `/_bricks/`
 * (publicAssets в module.ts — папки потребителя не затеняются), а под
 * non-root `app.baseURL` — с его учётом. Хардкод `/images/...` в новом
 * коде запрещён — только эти хелперы.
 */

// #region Imports
// Utils
import { joinPathBase } from './routePaths';
// #endregion

/** Префикс публичных ассетов модуля (без `app.baseURL`). */
export const BRICKS_PUBLIC_ASSETS_BASE = '/_bricks/';

/** Абсолютные (external/protocol-relative/data:) URL — не наши ассеты. */
const EXTERNAL_URL_PATTERN = /^(?:[a-z][a-z0-9+.-]*:|\/\/)/i;

/**
 * Строит URL публичного ассета модуля с учётом `app.baseURL`.
 * Абсолютные внешние URL возвращаются как есть.
 *
 * @param baseURL - `app.baseURL` приложения (`/` — no-op).
 * @param assetPath - Путь ассета внутри `public/` модуля (ведущий `/` опционален).
 */
export function resolveBricksAssetUrl(baseURL: string, assetPath: string): string {
    if (EXTERNAL_URL_PATTERN.test(assetPath)) {
        return assetPath;
    }

    const normalized = assetPath.startsWith('/') ? assetPath.slice(1) : assetPath;

    return joinPathBase(baseURL, `${BRICKS_PUBLIC_ASSETS_BASE}${normalized}`);
}
