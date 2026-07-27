import type { IBrickExportModule } from '../types/index';
import { normalizeBrickPath } from '../utils/bricks/paths';

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
export function useBrickImports() {
    /**
     * Возвращает loader brick-модуля по пути из схемы компонента.
     *
     * @param brickPath - Значение `brickPath`, сохранённое в схеме.
     * @returns Функция-лоадер Vite или `undefined`, если файла нет.
     */
    function findImportModule(brickPath: string): (() => Promise<IBrickExportModule>) | undefined {
        if (brickPath.startsWith(LAYOUT_BRICK_PREFIX)) {
            return undefined;
        }

        const importModule = brickModules[normalizeBrickPath(brickPath)];

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
