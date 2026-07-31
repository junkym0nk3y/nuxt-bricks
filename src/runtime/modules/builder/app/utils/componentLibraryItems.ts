// #region Imports
// Types
import type { IComponentLibraryItem } from '../../../common/types/brick';
import type { IBrickManifestEntry } from '../../../common/types/brickManifest';

// Utils
import { toSafeRecord } from '../../../common/utils/safeRecord';
// #endregion

/**
 * Превращает запись манифеста в карточку библиотеки.
 *
 * Метаданные приходят готовыми: `values` и `slots` разобраны на build-time,
 * поэтому карточка собирается без импорта brick-модуля — а значит, без
 * Vue-компонента и его стилей, которые brick-файл тянет своим импортом.
 *
 * @param entry - Запись манифеста brick-компонентов.
 * @returns Элемент библиотеки компонентов.
 */
export function toComponentLibraryItem(entry: IBrickManifestEntry): IComponentLibraryItem {
    return {
        name: entry.name,
        category: entry.category,
        brickPath: entry.brickPath,
        description: entry.description,
        thumbnail: '',
        // Имена пропов приходят из brick-файла: `acc['__proto__'] = …` подменял
        // бы прототип аккумулятора вместо записи ключа, а own-ключ `__proto__`
        // не пережил бы Nuxt payload
        defaultProps: toSafeRecord(
            Object.entries(entry.values).map(([name, value]) => [name, value.default])
        ),
        slots: entry.slots,
    };
}
