// #region Imports
// Vitest
import { describe, expect, it } from 'vitest';

// Types
import type { IBricksComponent } from '../../src/runtime/modules/common/types/brick';

// Registry
import {
    resolveBlockProps,
    resolveCanvasBind,
} from '../../src/runtime/modules/layouts-blocks/registry';
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
 * Собирает канвас-биндинг блока так же, как это делает билдер.
 *
 * Через `resolveCanvasBind`, а не прямым вызовом `canvasBind`: нормализация пропов
 * живёт в диспетчере, и прямой вызов прошёл бы мимо неё — то есть проверял бы путь,
 * которого в приложении нет.
 *
 * @param props - Пропсы блока.
 * @returns Пропсы канвас-компонента.
 */
function canvasBindings(props: Record<string, unknown>): Record<string, unknown> {
    return resolveCanvasBind(blockTextDefinition, {
        component: buildText(props),
        layoutProps: resolveBlockProps('Text', props, 'desktop'),
        boundProps: { ...props },
        childComponents: [],
        renderChild: () => null,
        t: (key: string) => key,
    });
}

/**
 * Достаёт CSS-переменные размера шрифта из канвас-биндинга блока.
 *
 * Отбор именно по префиксу размера: в том же объекте стиля живут переменные полей
 * блока, и сравнение всего объекта роняло бы эти кейсы при каждой новой адаптивной
 * переменной Text — притом что предмет у них один, размер шрифта.
 *
 * @param props - Пропсы блока.
 * @returns Объект переменных.
 */
function fontSizeVars(props: Record<string, unknown>): Record<string, string> {
    const style = (canvasBindings(props).style ?? {}) as Record<string, string>;

    return Object.fromEntries(
        Object.entries(style).filter(([name]) => name.startsWith('--bricks-text-font-size'))
    );
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
        expect(canvasBindings({})['data-bricks-layout']).toBe('text');
    });
});
