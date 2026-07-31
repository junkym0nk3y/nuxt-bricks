/**
 * Типы build-time разбора метаданных brick-файлов (`src/brick-metadata.ts`).
 * Формы, уезжающие в манифест (`IBrickValues`, `IComponentSlotDefinition`), —
 * общие с рантаймом; язык допустимых значений — в `brickLiterals.d.ts`.
 */
import type { IComponentSlotDefinition } from '../runtime/modules/common/types/brick';
import type { IBrickValues } from '../runtime/modules/common/types/index';

/** Метаданные одного brick-файла, извлечённые из исходника. */
export interface IBrickMetadata {
    /** Категория библиотеки; при отсутствии поля — дефолтная. */
    category: string;
    /** Описание для панели свойств. */
    description?: string;
    /** Определения редактируемых свойств: имя пропа → описание значения. */
    values: Record<string, IBrickValues>;
    /** Нормализованные определения слотов; отсутствуют, если слотов нет. */
    slots?: IComponentSlotDefinition[];
}
