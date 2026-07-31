// #region Imports
// Types
import type { IBrickManifestEntry } from '../../../common/types/brickManifest';
import type { IUseBrickMetadataReturn, TBrickMetadataIndex } from '../types/componentLibrary';

// Nuxt
import { useState } from '#imports';

// Utils
import { readOwnKey, toSafeRecord } from '../../../common/utils/safeRecord';
// #endregion

// #region Constants
/**
 * Индекс живёт в состоянии уровня приложения, а не в модульной переменной:
 * значение уезжает в payload и переживает гидрацию, на которой handler
 * `useAsyncData` не исполняется, а на сервере не протекает между запросами.
 */
const BRICK_METADATA_STATE_KEY = 'bricks-components-metadata';
// #endregion

/**
 * Метаданные brick-компонентов по `brickPath`: описание, определения свойств и
 * слоты, пришедшие с build-time в манифесте.
 *
 * Заменяет прежний способ их получить — импорт brick-модуля в браузере. Тот
 * тянул за собой Vue-компонент со стилями и отставал на одну перезагрузку в
 * dev: Vite инвалидировал brick-файл позже, чем уходил сигнал перезагрузки.
 *
 * @returns Замена индекса и чтение записи по пути.
 */
export function useBrickMetadata(): IUseBrickMetadataReturn {
    const metadataIndex = useState<TBrickMetadataIndex>(BRICK_METADATA_STATE_KEY, () => ({}));

    /**
     * Заменяет индекс метаданных записями манифеста.
     *
     * @param entries - Записи манифеста brick-компонентов.
     */
    function replaceBrickMetadata(entries: IBrickManifestEntry[]): void {
        // Ключ приходит из манифеста, то есть из имени файла потребителя:
        // `__proto__` в пути подменял бы прототип вместо записи ключа
        metadataIndex.value = toSafeRecord(entries.map((entry) => [entry.brickPath, entry]));
    }

    /**
     * Возвращает метаданные брика.
     *
     * @param brickPath - Путь brick-файла из схемы страницы.
     * @returns Запись манифеста или `undefined`, если её нет.
     */
    function readBrickMetadata(brickPath: string): IBrickManifestEntry | undefined {
        return readOwnKey(metadataIndex.value, brickPath);
    }

    return {
        replaceBrickMetadata,
        readBrickMetadata,
    };
}
