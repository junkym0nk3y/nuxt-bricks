// #region Imports
// Vitest
import { describe, expect, it } from 'vitest';

// Utils
import {
    buildUpdateQuery,
    PAGE_UPDATE_FIELDS,
    MEDIA_UPDATE_FIELDS,
} from '../src/runtime/modules/persistence/server/postgres/queryBuilders';
// #endregion

describe('buildUpdateQuery: динамический UPDATE с whitelist колонок', () => {
    it('собирает SET-выражения для разрешённых полей (camelCase → snake_case)', () => {
        const { updates, values } = buildUpdateQuery(
            { title: 'Лендинг', backgroundColor: '#fff' },
            PAGE_UPDATE_FIELDS
        );

        expect(updates).toEqual(['title = $1', 'background_color = $2']);
        expect(values).toEqual(['Лендинг', '#fff']);
    });

    it('пропускает undefined-поля и не сдвигает нумерацию параметров', () => {
        const { updates, values } = buildUpdateQuery(
            { title: undefined, published: false },
            PAGE_UPDATE_FIELDS
        );

        expect(updates).toEqual(['published = $1']);
        expect(values).toEqual([false]);
    });

    it('сериализует schema в JSON-строку', () => {
        const schema = { components: [], version: 1 };
        const { updates, values } = buildUpdateQuery({ schema }, PAGE_UPDATE_FIELDS);

        expect(updates).toEqual(['schema = $1']);
        expect(values).toEqual([JSON.stringify(schema)]);
    });

    it('отбрасывает ключи вне whitelist (SQL-инъекция через имя колонки)', () => {
        const { updates, values } = buildUpdateQuery(
            {
                title: 'ok',
                'published=(SELECT true)--': 1,
                'id; DROP TABLE bricks_pages;': 1,
            },
            PAGE_UPDATE_FIELDS
        );

        expect(updates).toEqual(['title = $1']);
        expect(values).toEqual(['ok']);
    });

    it('отбрасывает поля страницы, не разрешённые для медиа', () => {
        const { updates, values } = buildUpdateQuery(
            { alt: 'Логотип', schema: { components: [] }, published: true },
            MEDIA_UPDATE_FIELDS
        );

        expect(updates).toEqual(['alt = $1']);
        expect(values).toEqual(['Логотип']);
    });

    it('возвращает пустой результат, если все ключи отброшены', () => {
        const { updates, values } = buildUpdateQuery(
            { 'evil--': 1, createdAt: 'x' },
            MEDIA_UPDATE_FIELDS
        );

        expect(updates).toEqual([]);
        expect(values).toEqual([]);
    });
});
