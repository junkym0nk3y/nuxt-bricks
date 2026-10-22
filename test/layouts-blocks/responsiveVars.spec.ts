// #region Imports
// Vitest
import { describe, expect, it } from 'vitest';

// Utils
import {
    getOverriddenDeviceKeys,
    makeResponsiveVarGroup,
    makeResponsiveVars,
    toRem,
} from '../../src/runtime/modules/layouts-blocks/utils/responsiveVars';
// #endregion

describe('getOverriddenDeviceKeys', () => {
    it('возвращает только устройства с непустыми переопределениями', () => {
        const props = {
            responsive: { mobile: { gap: 1 }, tablet: {}, laptop: { columns: 2 } },
        };
        expect(getOverriddenDeviceKeys(props).sort()).toEqual(['laptop', 'mobile']);
    });

    it('отбрасывает базовое устройство: его значения лежат в обычных пропах', () => {
        const props = { responsive: { desktop: { gap: 4 }, mobile: { gap: 1 } } };
        expect(getOverriddenDeviceKeys(props)).toEqual(['mobile']);
    });

    it('ключ вне контракта имени отбрасывается: он уезжает в имя CSS-переменной', () => {
        // Схема — внешние данные (legacy-файл, чужой backend), и такой ключ дал
        // бы поломанный style-атрибут
        const props = { responsive: { 'x; color: red': { gap: 2 }, laptop: { gap: 3 } } };

        expect(getOverriddenDeviceKeys(props)).toEqual(['laptop']);
    });

    it('зарезервированный base из схемы тоже не эмитится', () => {
        expect(getOverriddenDeviceKeys({ responsive: { base: { gap: 1 } } })).toEqual([]);
    });

    it('без responsive возвращает пусто', () => {
        expect(getOverriddenDeviceKeys({})).toEqual([]);
        expect(getOverriddenDeviceKeys({ responsive: null })).toEqual([]);
    });
});

describe('makeResponsiveVars', () => {
    it('эмитит базовую переменную всегда, переменную устройства — только при override', () => {
        const props = { paddingTop: 4, responsive: { mobile: { paddingTop: 2 } } };

        expect(makeResponsiveVars('--bricks-section-pt', 4, props, 'paddingTop', toRem)).toEqual({
            '--bricks-section-pt-base': '4rem',
            '--bricks-section-pt-mobile': '2rem',
        });
    });

    it('устройство без нужного свойства переменной не получает: её доберёт fallback в CSS', () => {
        const props = { paddingTop: 4, responsive: { mobile: { paddingX: 1 } } };

        expect(makeResponsiveVars('--bricks-section-pt', 4, props, 'paddingTop', toRem)).toEqual({
            '--bricks-section-pt-base': '4rem',
        });
    });

    it('произвольный ключ устройства попадает в имя переменной как есть', () => {
        const props = { paddingTop: 4, responsive: { laptop: { paddingTop: 3 } } };

        expect(
            makeResponsiveVars('--bricks-section-pt', 4, props, 'paddingTop', toRem)
        ).toHaveProperty('--bricks-section-pt-laptop', '3rem');
    });
});

describe('makeResponsiveVarGroup', () => {
    /**
     * Считает связанную группу: `span` производен от `columns`.
     *
     * @param resolved - Пропсы, слитые с overrides устройства.
     * @returns Значения группы.
     */
    function compute(resolved: Record<string, unknown>): Record<string, string> {
        const columns = Number(resolved.columns) || 1;
        return {
            columns: String(columns),
            span: String(Math.max(1, Math.round(columns / 2))),
        };
    }

    it('пересчитывает всю группу целиком, а не только переопределённый член', () => {
        const props = { columns: 4, responsive: { mobile: { columns: 2 } } };

        expect(makeResponsiveVarGroup('--bricks-grid', props, ['columns'], compute)).toEqual({
            '--bricks-grid-columns-base': '4',
            '--bricks-grid-span-base': '2',
            '--bricks-grid-columns-mobile': '2',
            // Производная переменная пересчитана от mobile-значения, а не осталась базовой
            '--bricks-grid-span-mobile': '1',
        });
    });

    it('устройство без переопределений группы не получает вовсе', () => {
        const props = { columns: 4 };

        expect(makeResponsiveVarGroup('--bricks-grid', props, ['columns'], compute)).toEqual({
            '--bricks-grid-columns-base': '4',
            '--bricks-grid-span-base': '2',
        });
    });

    it('переопределение чужого свойства копию группы не создаёт', () => {
        // Устройство переопределило то, из чего группа не считается. Копия группы
        // повторила бы базовые значения слово в слово — мёртвый вес в разметке
        // каждого экземпляра блока на странице
        const props = { columns: 4, responsive: { mobile: { paddingX: 2 } } };

        expect(makeResponsiveVarGroup('--bricks-grid', props, ['columns'], compute)).toEqual({
            '--bricks-grid-columns-base': '4',
            '--bricks-grid-span-base': '2',
        });
    });
});
