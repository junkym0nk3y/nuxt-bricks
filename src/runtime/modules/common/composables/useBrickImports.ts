import type { IBrickExportModule } from '../types/index';
import type { IUseBrickImportsReturn } from '../types/composables';
import { normalizeBrickPath } from '../utils/bricks/paths';
import { readOwnKey } from '../utils/safeRecord';

/**
 * Лоадеры brick-файлов проекта-потребителя.
 *
 * Паттерн root-абсолютный, поэтому Vite резолвит его от своего root
 * (`nuxt.options.srcDir`), а ключи всегда имеют вид `/components/<путь>.brick.ts`:
 * у Nuxt 3 srcDir равен rootDir, у Nuxt 4 — `<rootDir>/app`, у playground —
 * `<repo>/playground`. Build-time генератор (`src/bricks-manifest.ts`) пишет
 * `brickPath` ровно в этом виде, так что поиск лоадера — прямой lookup.
 */
const brickModules = import.meta.glob<IBrickExportModule>('/components/**/*.brick.ts');

/** Layout-блоки встроены в модуль и brick-файлов не имеют. */
const LAYOUT_BRICK_PREFIX = 'layout';

/**
 * Предоставляет доступ к динамическим импортам `.brick.ts` файлов потребителя.
 *
 * @returns Функция поиска loader-а по `brickPath` из схемы.
 */
export function useBrickImports(): IUseBrickImportsReturn {
    /**
     * Возвращает loader brick-модуля по пути из схемы компонента.
     *
     * `brickPath` приходит из схемы страницы, поэтому lookup — только по
     * own-ключу: иначе `"__proto__"` вернул бы `Object.prototype`,
     * а `"constructor"` — функцию `Object`, и оба ушли бы наружу как «лоадер»
     * без записи о промахе (BM-14).
     *
     * @param brickPath - Значение `brickPath`, сохранённое в схеме.
     * @returns Функция-лоадер Vite или `undefined`, если файла нет.
     */
    function findImportModule(brickPath: string): (() => Promise<IBrickExportModule>) | undefined {
        if (brickPath.startsWith(LAYOUT_BRICK_PREFIX)) {
            return undefined;
        }

        const importModule = readOwnKey(brickModules, normalizeBrickPath(brickPath));

        if (!importModule) {
            console.error(
                `[useBrickImports] Brick не найден: ${brickPath}. Доступные: ${
                    Object.keys(brickModules).join(', ') || '—'
                }`
            );
        }

        return importModule;
    }

    return {
        findImportModule,
    };
}
