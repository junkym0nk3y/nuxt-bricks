// #region Imports
// Vitest
import { describe, expect, it } from 'vitest';

// Types
import type { IBricksComponent } from '../../src/runtime/modules/common/types/brick';

// Registry
import { blockTextDefinition } from '../../src/runtime/modules/layouts-blocks/components/blockText.definition';
// #endregion

/**
 * Собирает компонент Text с заданными пропсами.
 *
 * @param props - Пропсы блока.
 * @returns Компонент схемы.
 */
function buildText(props: Record<string, unknown>): IBricksComponent {
    return {
        id: 'text-1',
        type: 'layout',
        componentName: 'Text',
        brickPath: 'layout/text',
        zIndex: 1,
        props,
    };
}

/**
 * Достаёт CSS-переменные размера шрифта из канвас-биндинга блока.
 *
 * @param props - Пропсы блока.
 * @returns Объект переменных.
 */
function fontSizeVars(props: Record<string, unknown>): Record<string, string> {
    const bind = blockTextDefinition.canvasBind?.({
        component: buildText(props),
        layoutProps: props,
        boundProps: props,
        childComponents: [],
        renderChild: () => null,
        t: (key: string) => key,
    });

    return (bind?.style ?? {}) as Record<string, string>;
}

describe('BlockText: размер шрифта', () => {
    it('схема без своего fontSize сохраняет прежние размеры узких устройств', () => {
        // До перевода на переменные размер задавали @container-запросы в SFC:
        // 1.4rem до 768, 1.6rem до 1024, дальше 1.8rem. Без этой подстановки
        // весь существующий текст на узких устройствах стал бы крупнее
        expect(fontSizeVars({ content: '<p>Текст</p>' })).toEqual({
            '--bricks-text-font-size-base': '1.8rem',
            '--bricks-text-font-size-mobile': '1.4rem',
            '--bricks-text-font-size-tablet': '1.6rem',
        });
    });

    it('явный fontSize отменяет легаси-таблицу целиком', () => {
        expect(fontSizeVars({ fontSize: 2.4 })).toEqual({
            '--bricks-text-font-size-base': '2.4rem',
        });
    });

    it('переопределение устройства эмитится рядом с базовым', () => {
        expect(fontSizeVars({ fontSize: 2.4, responsive: { mobile: { fontSize: 1.6 } } })).toEqual({
            '--bricks-text-font-size-base': '2.4rem',
            '--bricks-text-font-size-mobile': '1.6rem',
        });
    });

    it('произвольное устройство без своего значения переменной не получает', () => {
        // Недостающую ступень доберёт fallback на `-base` в сгенерированном CSS
        expect(fontSizeVars({ fontSize: 2, responsive: { laptop: { marginTop: 2 } } })).toEqual({
            '--bricks-text-font-size-base': '2rem',
        });
    });

    it('блок помечен data-bricks-layout: по нему сматчится правило выбора', () => {
        const bind = blockTextDefinition.canvasBind?.({
            component: buildText({}),
            layoutProps: {},
            boundProps: {},
            childComponents: [],
            renderChild: () => null,
            t: (key: string) => key,
        });

        expect(bind?.['data-bricks-layout']).toBe('text');
    });
});
