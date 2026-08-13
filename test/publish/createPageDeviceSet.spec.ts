// #region Imports
// Vitest
import { describe, expect, it } from 'vitest';

// Types
import type { IBricksComponent, IBricksSchema } from '../../src/runtime/modules/common/types/brick';

// Utils
import {
    applyDeviceSetToSchema,
    countDeviceOverrides,
} from '../../src/runtime/modules/builder/publish/utils/deviceImpact';
// #endregion

/**
 * Собирает схему из одного грида с переопределениями по устройствам.
 *
 * @param responsive - Переопределения по ключам устройств.
 * @param deviceVisibility - Флаги видимости по ключам устройств.
 * @returns Схема страницы.
 */
function buildSchema(
    responsive: Record<string, Record<string, unknown>>,
    deviceVisibility?: Record<string, boolean>
): IBricksSchema {
    const component: IBricksComponent = {
        id: 'grid-1',
        type: 'layout',
        componentName: 'Grid',
        brickPath: 'layout/grid',
        zIndex: 1,
        props: { columns: 4, responsive },
        ...(deviceVisibility ? { deviceVisibility } : {}),
    };

    return { components: [component] };
}

describe('создание страницы: правка набора устройств чистит импортированную схему', () => {
    it('исчезнувшее устройство уносит свои переопределения и флаг видимости', () => {
        // Подтверждение удаления обещает удалить переопределения устройства.
        // Страница создаётся из этой самой схемы, поэтому оставить их значило бы
        // записать ровно то, что обещали удалить
        const schema = buildSchema(
            { laptop: { columns: 3 }, mobile: { columns: 1 } },
            {
                laptop: false,
            }
        );

        const cleaned = applyDeviceSetToSchema(
            schema,
            ['mobile', 'laptop', 'desktop'],
            ['mobile', 'desktop']
        );

        expect(cleaned.components[0].props.responsive).toEqual({ mobile: { columns: 1 } });
        expect(cleaned.components[0].deviceVisibility).toBeUndefined();
    });

    it('переименование и добавление схему не трогают: та же ссылка', () => {
        const schema = buildSchema({ laptop: { columns: 3 } });

        expect(
            applyDeviceSetToSchema(
                schema,
                ['mobile', 'laptop', 'desktop'],
                ['mobile', 'laptop', 'tablet', 'desktop']
            )
        ).toBe(schema);
    });

    it('счётчик подтверждения считает переопределения импортированной схемы', () => {
        // Модалка получала пустой список компонентов, и счётчик всегда показывал
        // ноль — при создании из файла это неправда
        const schema = buildSchema({ laptop: { columns: 3, gap: 8 } }, { laptop: false });

        expect(countDeviceOverrides(schema.components, 'laptop')).toBe(3);
        expect(countDeviceOverrides([], 'laptop')).toBe(0);
    });
});
