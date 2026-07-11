// #region Imports
// Vitest
import { describe, expect, it } from 'vitest';

// Utils
import {
    validateCreatePagePayload,
    validateUpdatePagePayload,
    validateRestoreVersionPayload,
} from '../src/runtime/modules/persistence/server/utils/payloadValidation';
import {
    validateCreateMediaPayload,
    validateUpdateMediaPayload,
} from '../src/runtime/modules/persistence/server/utils/mediaPayloadValidation';
import {
    MAX_SCHEMA_DEPTH,
    MAX_SCHEMA_NODES,
    assertSchemaComplexity,
} from '../src/runtime/modules/persistence/server/utils/schemaPayloadValidation';
// #endregion

/** Минимальный валидный payload создания страницы. */
function makeCreatePageBody(overrides: Record<string, unknown> = {}): Record<string, unknown> {
    return {
        pagename: 'my-page',
        schema: { components: [] },
        ...overrides,
    };
}

/**
 * Строит цепочку вложенных plain-объектов заданной глубины итеративно (циклом,
 * без рекурсии) — иначе сам конструктор теста упёрся бы в тот же стек-лимит,
 * который проверяется. `buildNestedObject(0)` — пустой объект без вложенности;
 * `buildNestedObject(depth)` — объект, у которого максимальная глубина
 * JSON-графа (при обходе от самого объекта как корня) равна `depth`.
 */
function buildNestedObject(depth: number): Record<string, unknown> {
    let node: Record<string, unknown> = {};

    for (let index = 0; index < depth; index++) {
        node = { child: node };
    }

    return node;
}

/** Минимальный валидный payload создания медиа. */
function makeCreateMediaBody(overrides: Record<string, unknown> = {}): Record<string, unknown> {
    return {
        url: 'https://storage.example.com/bricks-media/file.webp',
        filename: 'file.webp',
        size: 1024,
        mimeType: 'image/webp',
        category: 'image',
        ...overrides,
    };
}

describe('validateCreatePagePayload: server-first DTO', () => {
    it('принимает минимальный валидный payload', () => {
        const result = validateCreatePagePayload(makeCreatePageBody());
        expect(result.pagename).toBe('my-page');
        expect(result.schema).toEqual({ components: [] });
    });

    it('отклоняет неизвестные ключи', () => {
        expect(() => validateCreatePagePayload(makeCreatePageBody({ isAdmin: true }))).toThrow(
            /Unknown fields: isAdmin/
        );
    });

    it('отклоняет невалидный pagename (формат, длина, reserved)', () => {
        expect(() =>
            validateCreatePagePayload(makeCreatePageBody({ pagename: 'My Page' }))
        ).toThrow();
        expect(() => validateCreatePagePayload(makeCreatePageBody({ pagename: 'ab' }))).toThrow();
        expect(() =>
            validateCreatePagePayload(makeCreatePageBody({ pagename: 'a'.repeat(81) }))
        ).toThrow();
        expect(() => validateCreatePagePayload(makeCreatePageBody({ pagename: 'login' }))).toThrow(
            /reserved/
        );
    });

    it('отклоняет payload без schema и schema неверной формы', () => {
        expect(() => validateCreatePagePayload({ pagename: 'my-page' })).toThrow();
        expect(() =>
            validateCreatePagePayload(makeCreatePageBody({ schema: { components: 'nope' } }))
        ).toThrow(/components/);
        expect(() => validateCreatePagePayload(makeCreatePageBody({ schema: [] }))).toThrow();
    });

    it('отклоняет schema с превышением лимита компонентов', () => {
        const components = Array.from({ length: 5001 }, (_, index) => ({ id: String(index) }));
        expect(() =>
            validateCreatePagePayload(makeCreatePageBody({ schema: { components } }))
        ).toThrow(/components limit/);
    });

    it('REGRESSION: 20_000-глубокая schema отклоняется детерминированной 400, а не RangeError', () => {
        // Итеративное (не рекурсивное) построение цепочки — быстро даже на 20k уровней.
        const deeplyNested = buildNestedObject(20_000);

        let caught: unknown;
        try {
            validateCreatePagePayload(
                makeCreatePageBody({ schema: { components: [], deeplyNested } })
            );
        } catch (error) {
            caught = error;
        }

        expect(caught).toBeDefined();
        expect((caught as Error).name).not.toBe('RangeError');
        expect((caught as { statusCode?: number }).statusCode).toBe(400);
    });

    it('нормализует пустые routing-поля в null и валидирует формат', () => {
        const result = validateCreatePagePayload(
            makeCreatePageBody({ urlPrefix: '  ', subdomain: '' })
        );
        expect(result.urlPrefix).toBeNull();
        expect(result.subdomain).toBeNull();

        expect(() =>
            validateCreatePagePayload(makeCreatePageBody({ urlPrefix: '/leading-slash' }))
        ).toThrow();
        expect(() =>
            validateCreatePagePayload(makeCreatePageBody({ subdomain: 'UPPER' }))
        ).toThrow();

        const nested = validateCreatePagePayload(makeCreatePageBody({ urlPrefix: 'docs/api' }));
        expect(nested.urlPrefix).toBe('docs/api');
    });

    it('отклоняет socialImage не-http(s) URL', () => {
        expect(() =>
            // eslint-disable-next-line no-script-url
            validateCreatePagePayload(makeCreatePageBody({ socialImage: 'javascript:alert(1)' }))
        ).toThrow();
        expect(() =>
            validateCreatePagePayload(makeCreatePageBody({ socialImage: 'ftp://host/file' }))
        ).toThrow();
    });

    it('отклоняет неверные типы полей', () => {
        expect(() => validateCreatePagePayload(makeCreatePageBody({ title: 42 }))).toThrow();
        expect(() => validateCreatePagePayload(makeCreatePageBody({ published: 'yes' }))).toThrow();
    });

    it('отклоняет schema с широким, но маленьким по байтам объектом (node limit)', () => {
        // MAX_SCHEMA_NODES + запас с головой — каждое поле хранит примитив 1,
        // сериализованный размер остаётся далеко ниже байтового лимита.
        const wide: Record<string, number> = {};
        for (let index = 0; index < MAX_SCHEMA_NODES + 10; index++) {
            wide[`k${index}`] = 1;
        }

        expect(() =>
            validateCreatePagePayload(makeCreatePageBody({ schema: { components: [], wide } }))
        ).toThrow(/nodes limit/);
    });
});

describe('assertSchemaComplexity: итеративный depth/node/type guard (R0.2)', () => {
    it(`пропускает вложенность ровно ${MAX_SCHEMA_DEPTH} уровней`, () => {
        expect(() => assertSchemaComplexity(buildNestedObject(MAX_SCHEMA_DEPTH))).not.toThrow();
    });

    it(`отклоняет вложенность ${MAX_SCHEMA_DEPTH + 1} уровень (depth limit)`, () => {
        expect(() => assertSchemaComplexity(buildNestedObject(MAX_SCHEMA_DEPTH + 1))).toThrow(
            /depth limit/
        );
    });

    it('отклоняет non-JSON типы значений: Date, Map, class instance, undefined, функция, символ', () => {
        class CustomInstance {
            public value = 1;
        }

        expect(() => assertSchemaComplexity({ value: new Date() })).toThrow(
            /JSON-compatible values/
        );
        expect(() => assertSchemaComplexity({ value: new Map() })).toThrow(
            /JSON-compatible values/
        );
        expect(() => assertSchemaComplexity({ value: new CustomInstance() })).toThrow(
            /JSON-compatible values/
        );
        expect(() => assertSchemaComplexity({ value: undefined })).toThrow(
            /JSON-compatible values/
        );
        const noop = (): void => undefined;
        expect(() => assertSchemaComplexity({ value: noop })).toThrow(/JSON-compatible values/);
        expect(() => assertSchemaComplexity({ value: Symbol('x') })).toThrow(
            /JSON-compatible values/
        );
    });

    it('отклоняет нефинитные числа (NaN, Infinity)', () => {
        expect(() => assertSchemaComplexity({ value: Number.NaN })).toThrow(/non-finite numbers/);
        expect(() => assertSchemaComplexity({ value: Number.POSITIVE_INFINITY })).toThrow(
            /non-finite numbers/
        );
    });

    it('пропускает валидные JSON-примитивы: null, string, finite number, boolean, вложенные массив/объект', () => {
        expect(() =>
            assertSchemaComplexity({
                a: null,
                b: 'text',
                c: 42,
                d: true,
                e: [1, 'two', false, null],
                f: { nested: { value: 1 } },
            })
        ).not.toThrow();
    });

    it('отклоняет payload, укладывающийся в число UTF-16-символов старого лимита, но превышающий байтовый', () => {
        // Кириллица — 2 байта UTF-8 на символ при 1 UTF-16 code unit: старая
        // char-based проверка занижала реальный объём вдвое.
        const charLength = 1_500_000;
        const cyrillicPayload = { text: 'ы'.repeat(charLength) };

        expect(charLength).toBeLessThan(2 * 1024 * 1024);
        expect(() => assertSchemaComplexity(cyrillicPayload)).toThrow(/too large/);
    });
});

describe('validateUpdatePagePayload: частичное обновление', () => {
    it('принимает частичный payload и не добавляет непереданные поля', () => {
        const result = validateUpdatePagePayload({ title: 'New title' });
        expect(result).toEqual({ title: 'New title' });
        expect('pagename' in result).toBe(false);
    });

    it('требует хотя бы одно поле', () => {
        expect(() => validateUpdatePagePayload({})).toThrow(/No fields/);
    });

    it('отклоняет неизвестные ключи (id/createdAt не пролезают)', () => {
        expect(() => validateUpdatePagePayload({ title: 'x', id: 7 })).toThrow(/Unknown fields/);
    });

    it('валидирует thumbnailUrl как http(s) URL с нормализацией пустого в null', () => {
        expect(validateUpdatePagePayload({ thumbnailUrl: '' }).thumbnailUrl).toBeNull();
        expect(
            validateUpdatePagePayload({ thumbnailUrl: 'https://cdn.example.com/t.webp' })
                .thumbnailUrl
        ).toBe('https://cdn.example.com/t.webp');
        expect(() =>
            validateUpdatePagePayload({ thumbnailUrl: 'data:image/png;base64,x' })
        ).toThrow();
    });

    it('валидирует pagename и schema при их наличии', () => {
        expect(() => validateUpdatePagePayload({ pagename: 'Bad Name' })).toThrow();
        expect(() => validateUpdatePagePayload({ schema: 'nope' })).toThrow();
    });

    it('принимает expectedRevision как positive safe integer', () => {
        const result = validateUpdatePagePayload({ title: 'x', expectedRevision: 7 });
        expect(result.expectedRevision).toBe(7);
    });

    it('отклоняет невалидный expectedRevision (строка, ноль, отрицательный, дробь)', () => {
        expect(() => validateUpdatePagePayload({ title: 'x', expectedRevision: '7' })).toThrow(
            /expectedRevision/
        );
        expect(() => validateUpdatePagePayload({ title: 'x', expectedRevision: 0 })).toThrow();
        expect(() => validateUpdatePagePayload({ title: 'x', expectedRevision: -1 })).toThrow();
        expect(() => validateUpdatePagePayload({ title: 'x', expectedRevision: 1.5 })).toThrow();
    });

    it('не считает expectedRevision записываемым полем (без данных — 400)', () => {
        expect(() => validateUpdatePagePayload({ expectedRevision: 3 })).toThrow(/No fields/);
    });
});

describe('validateRestoreVersionPayload: precondition отката версии', () => {
    it('принимает expectedRevision как positive safe integer', () => {
        expect(validateRestoreVersionPayload({ expectedRevision: 7 })).toEqual({
            expectedRevision: 7,
        });
    });

    it('отклоняет отсутствующий expectedRevision (в отличие от page update — здесь обязателен)', () => {
        expect(() => validateRestoreVersionPayload({})).toThrow(/expectedRevision/);
    });

    it('отклоняет невалидный expectedRevision (строка, ноль, отрицательный, дробь)', () => {
        expect(() => validateRestoreVersionPayload({ expectedRevision: '7' })).toThrow(
            /expectedRevision/
        );
        expect(() => validateRestoreVersionPayload({ expectedRevision: 0 })).toThrow();
        expect(() => validateRestoreVersionPayload({ expectedRevision: -1 })).toThrow();
        expect(() => validateRestoreVersionPayload({ expectedRevision: 1.5 })).toThrow();
        expect(() => validateRestoreVersionPayload({ expectedRevision: null })).toThrow();
    });

    it('отклоняет неизвестные ключи', () => {
        expect(() => validateRestoreVersionPayload({ expectedRevision: 1, pagename: 'x' })).toThrow(
            /Unknown fields/
        );
    });
});

describe('validateCreateMediaPayload: метаданные медиа', () => {
    it('принимает валидный payload', () => {
        const result = validateCreateMediaPayload(makeCreateMediaBody());
        expect(result.url).toContain('https://');
        expect(result.size).toBe(1024);
    });

    it('отклоняет не-http(s) url', () => {
        expect(() => validateCreateMediaBodyThrow({ url: 'file:///etc/passwd' })).toThrow();
        expect(() => validateCreateMediaBodyThrow({ url: 'gopher://internal' })).toThrow();
    });

    it('отклоняет невалидный size (дробный, отрицательный, строка)', () => {
        expect(() => validateCreateMediaBodyThrow({ size: -1 })).toThrow();
        expect(() => validateCreateMediaBodyThrow({ size: 1.5 })).toThrow();
        expect(() => validateCreateMediaBodyThrow({ size: '1024' })).toThrow();
    });

    it('отклоняет невалидный mimeType и неизвестные ключи', () => {
        expect(() => validateCreateMediaBodyThrow({ mimeType: 'not-a-mime' })).toThrow();
        expect(() => validateCreateMediaBodyThrow({ extra: 1 })).toThrow(/Unknown fields/);
    });

    it('валидирует uploadedAt как дату', () => {
        expect(
            validateCreateMediaPayload(makeCreateMediaBody({ uploadedAt: '2026-07-10T10:00:00Z' }))
                .uploadedAt
        ).toBe('2026-07-10T10:00:00Z');
        expect(() => validateCreateMediaBodyThrow({ uploadedAt: 'not-a-date' })).toThrow();
    });
});

describe('validateUpdateMediaPayload: PATCH медиа', () => {
    it('принимает частичный payload', () => {
        expect(validateUpdateMediaPayload({ alt: 'Alt text' })).toEqual({ alt: 'Alt text' });
    });

    it('требует хотя бы одно поле и отклоняет неизвестные ключи', () => {
        expect(() => validateUpdateMediaPayload({})).toThrow(/No fields/);
        expect(() => validateUpdateMediaPayload({ url: 'https://x' })).toThrow(/Unknown fields/);
    });
});

/** Обёртка для негативных кейсов create media. */
function validateCreateMediaBodyThrow(overrides: Record<string, unknown>): unknown {
    return validateCreateMediaPayload(makeCreateMediaBody(overrides));
}
