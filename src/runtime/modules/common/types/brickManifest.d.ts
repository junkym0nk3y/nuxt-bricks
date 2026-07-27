/**
 * Контракт манифеста brick-компонентов: build-time скан `*.brick.ts` пишет его
 * в buildDir, ручка `GET /api/bricks/components` отдаёт билдеру.
 */

/** Запись манифеста — один найденный `*.brick.ts`. */
export interface IBrickManifestEntry {
    /** Имя компонента: basename файла без суффикса `.brick.ts`. */
    name: string;
    /** Категория из `category` внутри brick-файла. */
    category: string;
    /**
     * Ключ загрузчика: путь до brick-файла относительно `srcDir` с ведущим `/`.
     * Совпадает с ключами `import.meta.glob` в `useBrickImports`, поэтому поиск
     * компонента — прямой lookup без разбора вариантов пути.
     */
    brickPath: string;
}

/** Манифест целиком: записи + хеш содержимого. */
export interface IBricksManifest {
    bricks: IBrickManifestEntry[];
    hash: string;
}

/** Группировка манифеста по категориям — форма ответа `?category=<name>`. */
export interface IBrickCategory {
    components: Array<Pick<IBrickManifestEntry, 'name' | 'brickPath'>>;
}
