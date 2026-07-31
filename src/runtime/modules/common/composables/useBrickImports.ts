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
 * Пути, о промахе которых уже сообщено, в нормализованном виде.
 *
 * Один раз на путь за жизнь этого модуля: добавить лоадер в готовую карту
 * нельзя — `import.meta.glob` разворачивается на этапе трансформации, — поэтому
 * повторное сообщение о том же пути не несёт нового повода. Загрузка при этом
 * повторяется как раньше: дедуплицируется только лог.
 *
 * Плата: на SSR состояние живёт между запросами, и второй запрос по тому же
 * битому пути промолчит. Размен сознательный — иначе бот, обходящий страницу с
 * устаревшим компонентом, забивал бы серверный лог одним и тем же дефектом.
 * В dev состав карты пересобирает рестарт, который перезагружает и этот модуль.
 */
const reportedMissingBrickPaths = new Set<string>();

/** Состав карты лоадеров: не меняется без пересборки, поэтому считается один раз. */
let availableBrickPaths: string[] | null = null;

/**
 * Сообщает о первом промахе по пути.
 *
 * Сериализовать весь состав карты на каждый промах было дорого: published-
 * страница с несколькими устаревшими компонентами печатала всю библиотеку
 * компонентов по разу на каждую попытку загрузки, и на SSR, и на клиенте.
 * Наружу идёт запрошенный путь и размер карты, полный список — только в dev.
 *
 * Уровень `warn`, а не `error`: страница остаётся рабочей, компонент просто не
 * рендерится. `error` оставлен сбоям самого импорта и повреждённому экспорту.
 *
 * @param brickPath - Значение `brickPath` из схемы или манифеста.
 */
function reportMissingBrick(brickPath: string): void {
    const normalizedPath = normalizeBrickPath(brickPath);

    if (reportedMissingBrickPaths.has(normalizedPath)) {
        return;
    }

    reportedMissingBrickPaths.add(normalizedPath);

    const modulePaths = (availableBrickPaths ??= Object.keys(brickModules));

    console.warn('[useBrickImports] Brick module is absent from the transformed import map', {
        // Исходный путь, а не нормализованный: диагносту нужно то, что записано в схеме
        brickPath,
        availableBrickModuleCount: modulePaths.length,
        ...(import.meta.dev ? { availableBrickPaths: modulePaths } : {}),
    });
}

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
            reportMissingBrick(brickPath);
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
