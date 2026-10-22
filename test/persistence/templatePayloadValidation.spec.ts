// #region Imports
// Vitest
import { describe, expect, it } from 'vitest';

// Utils
import {
    validateCreateTemplatePayload,
    validateUpdateTemplatePayload,
} from '../../src/runtime/modules/persistence/server/utils/templatePayloadValidation';
// #endregion

/**
 * Валидация DTO шаблонов: тело запроса приходит от клиента, поэтому неизвестные
 * ключи отклоняются, границы проверяются, а наружу уходит только известный
 * нормализованный набор полей.
 */

// #region Fixtures
/** Минимальная валидная схема: один текстовый блок. */
const SCHEMA = {
    components: [
        {
            id: 'text-1',
            type: 'component',
            componentName: 'Text',
            brickPath: 'content/text',
            zIndex: 1,
            props: { content: 'hi' },
        },
    ],
};

/** Валидный набор устройств: mobile первым, desktop последним. */
const DEVICES = [
    { key: 'mobile', label: 'Mobile', icon: 'device-mobile', width: 390, aside: 0 },
    { key: 'desktop', label: 'Desktop', icon: 'device-desktop', width: 1440, aside: 0 },
];
// #endregion

describe('validateCreateTemplatePayload: сохранение страницы как шаблона', () => {
    it('принимает имя, описание, схему, оформление и кадр-источник', () => {
        const payload = validateCreateTemplatePayload({
            name: '  Лендинг продукта  ',
            description: 'Герой, тарифы и форма',
            schema: SCHEMA,
            pageMeta: {
                layout: 'default',
                backgroundColor: '#ffffff',
                viewportConfig: DEVICES,
            },
            thumbnailSourceUrl: 'https://bucket.example/bricks-thumbnails/page-3-uuid.webp',
        });

        expect(payload.name).toBe('Лендинг продукта');
        expect(payload.description).toBe('Герой, тарифы и форма');
        expect(payload.schema).toEqual(SCHEMA);
        expect(payload.pageMeta).toEqual({
            layout: 'default',
            backgroundColor: '#ffffff',
            viewportConfig: DEVICES,
        });
        expect(payload.thumbnailSourceUrl).toBe(
            'https://bucket.example/bricks-thumbnails/page-3-uuid.webp'
        );
    });

    it('без оформления и кадра даёт пустое оформление, а не отказ', () => {
        // Страницу могли ни разу не сохранять и не задавать ей ни layout, ни фон —
        // шаблон из неё законен, просто без картинки
        const payload = validateCreateTemplatePayload({ name: 'Пустой каркас', schema: SCHEMA });

        expect(payload.pageMeta).toEqual({
            layout: null,
            backgroundColor: null,
            viewportConfig: null,
        });
        expect(payload.description).toBeNull();
        expect(payload.thumbnailSourceUrl).toBeNull();
    });

    it('готовый URL превью в обход копирования не принимается', () => {
        // Иначе клиент прописал бы шаблону произвольную картинку: собственный файл
        // делает ручка копией кадра страницы
        expect(() =>
            validateCreateTemplatePayload({
                name: 'Лендинг',
                schema: SCHEMA,
                thumbnailUrl: 'https://bucket.example/anything.webp',
            })
        ).toThrow(/Unknown fields: thumbnailUrl/);
    });

    it('короткое имя, отсутствующее имя и не-http кадр отклоняются', () => {
        expect(() => validateCreateTemplatePayload({ name: 'ab', schema: SCHEMA })).toThrow(
            /at least 3 characters/
        );
        expect(() => validateCreateTemplatePayload({ schema: SCHEMA })).toThrow(
            /"name" must be a string/
        );
        expect(() =>
            validateCreateTemplatePayload({
                name: 'Лендинг',
                schema: SCHEMA,
                thumbnailSourceUrl: 'javascript:alert(1)',
            })
        ).toThrow(/must be an http\(s\) URL/);
    });

    it('схема проверяется теми же правилами, что у страницы', () => {
        // Второй набор границ разошёлся бы с первым: шаблон несёт ровно ту схему,
        // которую приняла бы страница
        expect(() => validateCreateTemplatePayload({ name: 'Лендинг', schema: {} })).toThrow(
            /"schema.components" must be an array/
        );
        expect(() =>
            validateCreateTemplatePayload({
                name: 'Лендинг',
                schema: { components: [{ id: 'a' }] },
            })
        ).toThrow(/Invalid schema/);
    });

    it('повреждённый набор устройств отклоняется целиком, а не чинится', () => {
        // Значение уезжает и в ключи схемы, и в генерацию `<style>`: «почти
        // валидный» набор опаснее отказа
        expect(() =>
            validateCreateTemplatePayload({
                name: 'Лендинг',
                schema: SCHEMA,
                pageMeta: { viewportConfig: [DEVICES[1], DEVICES[0]] },
            })
        ).toThrow(/"pageMeta.viewportConfig" is invalid/);
    });

    it('неизвестный ключ оформления не проходит', () => {
        expect(() =>
            validateCreateTemplatePayload({
                name: 'Лендинг',
                schema: SCHEMA,
                pageMeta: { published: true },
            })
        ).toThrow(/Unknown fields: published/);
    });
});

describe('validateUpdateTemplatePayload: правка подписи шаблона', () => {
    it('принимает любое одно поле', () => {
        expect(validateUpdateTemplatePayload({ name: ' Промо ' })).toEqual({ name: 'Промо' });
        expect(validateUpdateTemplatePayload({ description: '' })).toEqual({ description: null });
    });

    it('пустое тело отклоняется', () => {
        // Иначе адаптер собрал бы `UPDATE ... SET` без выражений
        expect(() => validateUpdateTemplatePayload({})).toThrow(/No fields to update/);
    });

    it('содержимое шаблона этой ручкой не правится', () => {
        // Шаблон — отпечаток момента: «обновить его текущей страницей» означало бы
        // связь с источником, версии шаблона и разрешение конфликтов
        expect(() => validateUpdateTemplatePayload({ schema: SCHEMA })).toThrow(
            /Unknown fields: schema/
        );
        expect(() => validateUpdateTemplatePayload({ pageMeta: {} })).toThrow(
            /Unknown fields: pageMeta/
        );
    });
});
