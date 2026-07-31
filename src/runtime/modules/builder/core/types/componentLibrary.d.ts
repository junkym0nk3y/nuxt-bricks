/**
 * Типы библиотеки компонентов, общие для сборки списка (`builder/app`) и его
 * показа (`builder/shell`). Лежат в ядре, потому что shell не имеет права
 * импортировать из composition root'а.
 */
import type { IBricksComponent, IPropertyDefinition } from '../../../common/types/brick';
import type { IBrickManifestEntry } from '../../../common/types/brickManifest';

/**
 * Brick из манифеста, не попавший в библиотеку: запись есть, а лоадера под её
 * `brickPath` в сборке нет. Это рассинхрон манифеста и `import.meta.glob`:
 * карта лоадеров разворачивается на этапе трансформации, поэтому в рантайме
 * такое не чинится — в dev помогает перезапуск сервера, в проде это дефект
 * сборки.
 */
export interface ISkippedBrick {
    name: string;
    brickPath: string;
}

/**
 * Метаданные бриков по `brickPath`. Собирается из ответа ручки компонентов и
 * служит единственным источником редакторских данных: панель свойств, слоты,
 * inline-редактирование и force-render читают его, а не импортируют
 * brick-модуль.
 */
export type TBrickMetadataIndex = Record<string, IBrickManifestEntry>;

/** Возвращаемое значение `useBrickMetadata`. */
export interface IUseBrickMetadataReturn {
    /**
     * Заменяет индекс целиком. Именно заменяет, а не дописывает: успешный
     * манифест обязан убрать записи бриков, которых больше нет.
     */
    replaceBrickMetadata: (entries: IBrickManifestEntry[]) => void;
    /**
     * Метаданные брика или `undefined`, если манифест ещё не дошёл либо записи
     * в нём нет.
     */
    readBrickMetadata: (brickPath: string) => IBrickManifestEntry | undefined;
}

/** Данные компонента для панели свойств. */
export interface IComponentEditorMetadata {
    /** Определения редактируемых свойств; пусто, если метаданных ещё нет. */
    properties: IPropertyDefinition[];
    /** Описание компонента. */
    description?: string;
}

/** Возвращаемое значение `useComponentEditorMetadata`. */
export interface IUseComponentEditorMetadataReturn {
    /**
     * Собирает данные панели свойств для компонента канваса: layout-блоку — из
     * его definitions, brick-компоненту — из индекса метаданных.
     */
    resolveComponentEditorMetadata: (component: IBricksComponent) => IComponentEditorMetadata;
}
