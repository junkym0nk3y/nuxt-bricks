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
 * Ищет лоадер brick-модуля без побочных эффектов.
 *
 * `brickPath` приходит из схемы страницы или манифеста, поэтому lookup — только
 * по own-ключу: иначе `"__proto__"` вернул бы `Object.prototype`,
 * а `"constructor"` — функцию `Object`, и оба ушли бы наружу как «лоадер».
 *
 * @param brickPath - Значение `brickPath` из схемы или манифеста.
 * @returns Функция-лоадер Vite или `undefined`, если файла нет.
 */
function resolveBrickLoader(brickPath: string): (() => Promise<IBrickExportModule>) | undefined {
    if (brickPath.startsWith(LAYOUT_BRICK_PREFIX)) {
        return undefined;
    }

    return readOwnKey(brickModules, normalizeBrickPath(brickPath));
}

/**
 * Предоставляет доступ к динамическим импортам `.brick.ts` файлов потребителя.
 *
 * @returns Функции поиска лоадера и проверки его наличия.
 */
export function useBrickImports(): IUseBrickImportsReturn {
    /**
     * Возвращает loader brick-модуля по пути из схемы компонента.
     *
     * @param brickPath - Значение `brickPath`, сохранённое в схеме.
     * @returns Функция-лоадер Vite или `undefined`, если файла нет.
     */
    function findImportModule(brickPath: string): (() => Promise<IBrickExportModule>) | undefined {
        const importModule = resolveBrickLoader(brickPath);

        if (!importModule && !brickPath.startsWith(LAYOUT_BRICK_PREFIX)) {
            console.error(
                `[useBrickImports] Brick не найден: ${brickPath}. Доступные: ${
                    Object.keys(brickModules).join(', ') || '—'
                }`
            );
        }

        return importModule;
    }

    /**
     * Есть ли в сборке лоадер под этот `brickPath`.
     *
     * Отдельно от `findImportModule`, потому что зовётся из вычисляемых свойств
     * на каждой перерисовке библиотеки: сообщение о промахе там повторялось бы
     * без нового повода, а само отсутствие лоадера показывает сайдбар.
     *
     * @param brickPath - Значение `brickPath` из манифеста.
     * @returns Признак наличия лоадера.
     */
    function hasBrickModule(brickPath: string): boolean {
        return resolveBrickLoader(brickPath) !== undefined;
    }

    return {
        findImportModule,
        hasBrickModule,
    };
}
