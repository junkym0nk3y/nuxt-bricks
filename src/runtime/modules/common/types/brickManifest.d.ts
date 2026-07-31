/**
 * Контракт манифеста brick-компонентов: build-time скан `*.brick.ts` пишет его
 * в buildDir, ручка `GET /api/bricks/components` отдаёт билдеру.
 */
import type { IComponentSlotDefinition } from './brick';
import type { IBrickValues } from './index';

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
    /** Описание компонента для панели свойств. */
    description?: string;
    /**
     * Определения редактируемых свойств. Приезжают в манифест с build-time,
     * поэтому библиотеке, панели свойств и inline-редактированию не нужно
     * импортировать brick-модуль в браузере — а вместе с ним и Vue-компонент со
     * стилями, который брик тянет своим импортом.
     */
    values: Record<string, IBrickValues>;
    /**
     * Нормализованные определения слотов. Обе формы записи (список и объект)
     * приводятся к одной на build-time: разбирать сырые варианты в рантайме
     * больше некому.
     */
    slots?: IComponentSlotDefinition[];
}

/** Манифест целиком: записи + хеш содержимого. */
export interface IBricksManifest {
    bricks: IBrickManifestEntry[];
    hash: string;
}

/**
 * Узкая форма записи: имя компонента и ключ загрузчика, без метаданных.
 * В этом виде записи уходят в ответ `?category=<name>` — категория там известна
 * из запроса, а редакторские метаданные запросу по категории не нужны.
 */
export type TBrickManifestRef = Pick<IBrickManifestEntry, 'name' | 'brickPath'>;
