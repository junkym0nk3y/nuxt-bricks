/**
 * Parity-тест published-рендера (шаг B5, ВРЕМЕННЫЙ — удаляется на шаге 14
 * вместе с test/legacy/useRendererLayouts.legacy.ts).
 *
 * Сверяет VNode-выход нового registry-диспатча (`renderPublished` в definitions)
 * со старой switch-реализацией (копия из git HEAD до B5) на фикстурах всех
 * 10 блоков: Grid lead-варианты, Section responsive-vars, Space divider и т.д.
 */

import { describe, expect, it } from 'vitest';
import { h, ref } from 'vue';

import type { BricksComponent } from '../src/runtime/modules/common/types/brick';
import { useRendererLayouts } from '../src/runtime/modules/render/composables/useRendererLayouts';
import { useRendererLayouts as useLegacyRendererLayouts } from './legacy/useRendererLayouts.legacy';

/** CSS-module-стаб: любой ключ → детерминированный класс. */
const styles = new Proxy({} as Record<string, string>, {
    get: (_, prop) => `css-${String(prop)}`,
});

/**
 * Создаёт компонент схемы с дефолтами.
 */
function makeComponent(partial: Partial<BricksComponent> & { id: string }): BricksComponent {
    return {
        type: 'layout',
        componentName: '',
        storyPath: '',
        zIndex: 0,
        props: {},
        ...partial,
    };
}

const CHILD_IDS = ['child-1', 'child-2', 'child-3'];
const childComponents = CHILD_IDS.map((id) =>
    makeComponent({ id, type: 'component', componentName: 'Card', storyPath: 'cards/card' })
);

/** Фикстуры всех 10 блоков: responsive overrides, placement, htmlId, children. */
const FIXTURES: BricksComponent[] = [
    makeComponent({
        id: 'grid-1',
        componentName: 'Grid',
        htmlId: 'grid-anchor',
        gridColumn: 'span 2',
        children: CHILD_IDS,
        props: {
            columns: 4,
            rows: 2,
            gap: 24,
            variant: 'lead-left',
            rowHeight: '1fr',
            minRowHeight: 6,
            paddingX: 2,
            paddingY: 1.6,
            responsive: { tablet: { columns: 2, variant: 'lead-right' }, mobile: { gap: 8 } },
        },
    }),
    makeComponent({
        id: 'flex-1',
        componentName: 'Flex',
        children: CHILD_IDS.slice(0, 2),
        props: {
            direction: 'row',
            justify: 'space-between',
            align: 'center',
            gap: 16,
            wrap: true,
            paddingY: 0.8,
            responsive: { tablet: { direction: 'column', wrap: false } },
        },
    }),
    makeComponent({
        id: 'section-1',
        componentName: 'Section',
        children: CHILD_IDS.slice(0, 1),
        props: {
            backgroundColor: 'var(--bricks-base-900)',
            backgroundImage: '/images/bg.webp',
            paddingTop: 4,
            paddingBottom: 4,
            paddingX: 2,
            borderRadius: 1.6,
            minHeight: 40,
            responsive: { mobile: { paddingTop: 2, minHeight: 0 } },
        },
    }),
    makeComponent({
        id: 'space-1',
        componentName: 'Space',
        gridRow: 'span 2',
        props: {
            size: 2.4,
            direction: 'both',
            showDivider: true,
            dividerColor: '#ff0000',
            dividerWidth: 2,
            dividerStyle: 'dashed',
            dividerMarginX: 1.2,
            responsive: { tablet: { size: 1.2 } },
        },
    }),
    makeComponent({
        id: 'title-1',
        componentName: 'Title',
        gridColumn: '1 / 3',
        props: {
            inlineContent: [{ id: 's1', kind: 'text', text: 'Заголовок' }],
            headingType: 'h2',
            fontSize: 4.8,
            marginBottom: 1.6,
        },
    }),
    makeComponent({
        id: 'text-1',
        componentName: 'Text',
        props: { content: '<p>Введите текст</p>', marginTop: 0.8 },
    }),
    makeComponent({
        id: 'media-1',
        componentName: 'Media',
        htmlId: 'media-anchor',
        props: {
            type: 'image',
            src: '/images/photo.webp',
            alt: 'Photo',
            objectFit: 'cover',
            width: '100%',
            height: '32rem',
            borderRadius: '1.6rem',
            responsive: { mobile: { height: '20rem' } },
        },
    }),
    makeComponent({
        id: 'svg-1',
        componentName: 'Svg',
        props: {
            src: '/images/icon.svg',
            svgContent: '<svg viewBox="0 0 24 24"></svg>',
            color: '#00ff00',
            width: '4.8rem',
            height: '4.8rem',
            responsive: { tablet: { width: '3.2rem' } },
        },
    }),
    makeComponent({
        id: 'slider-1',
        componentName: 'Slider',
        children: CHILD_IDS,
        props: {
            spaceBetween: 16,
            slidesPerViewDesktop: 3,
            loop: true,
            captions: '[{"text":"Tab"}]',
            captionPosition: 'top',
        },
    }),
    makeComponent({
        id: 'accordion-1',
        componentName: 'Accordion',
        props: {
            items: [{ title: 'Вопрос', content: '<p>Ответ</p>' }],
            allowMultiple: true,
            gap: 0.8,
        },
    }),
];

const allComponents = ref<BricksComponent[]>([...FIXTURES, ...childComponents]);

/**
 * Рекурсивно сводит VNode к сравнимой структуре:
 * компонентные типы → имя, функции в props → '[fn]'.
 */
function summarize(node: unknown): unknown {
    if (node === null || typeof node !== 'object') {
        return node;
    }
    if (Array.isArray(node)) {
        return node.map(summarize);
    }

    const vnode = node as {
        type: unknown;
        key: unknown;
        props: Record<string, unknown> | null;
        children: unknown;
    };
    const rawType = vnode.type as { __name?: string; name?: string } | string;
    const type =
        typeof rawType === 'string' ? rawType : (rawType.__name ?? rawType.name ?? 'component');
    const props = Object.fromEntries(
        Object.entries(vnode.props ?? {}).map(([key, value]) => [
            key,
            typeof value === 'function' ? '[fn]' : value,
        ])
    );

    return { type, key: vnode.key, props, children: summarize(vnode.children) };
}

/**
 * Создаёт обе реализации рендерера с одинаковым контекстом.
 */
function makeRenderers() {
    const renderChild = (child: BricksComponent) => h('span', { 'data-child': child.id });
    const current = useRendererLayouts({ allComponents, styles, renderChild });
    const legacy = useLegacyRendererLayouts({ allComponents, styles, renderChild });
    return { current, legacy };
}

describe('published renderer parity (registry vs legacy switch)', () => {
    const { current, legacy } = makeRenderers();

    for (const fixture of FIXTURES) {
        it(`${fixture.componentName}: VNode-выход идентичен legacy`, () => {
            const extraClasses = ['visibility-hide-mobile'];
            const extraAttrs = { 'aria-hidden': 'true' };

            const actual = current.renderLayoutComponent(fixture, extraClasses, extraAttrs);
            const expected = legacy.renderLayoutComponent(fixture, extraClasses, extraAttrs);

            expect(actual, fixture.componentName).not.toBeNull();
            expect(summarize(actual)).toEqual(summarize(expected));
        });
    }

    it('не-layout компонент → null (фоллбэк на UI-рендер)', () => {
        const uiComponent = makeComponent({
            id: 'ui-1',
            type: 'component',
            componentName: 'HeroBanner',
        });
        expect(current.renderLayoutComponent(uiComponent)).toBeNull();
        expect(legacy.renderLayoutComponent(uiComponent)).toBeNull();
    });

    it('needsContainerWrapper идентичен legacy', () => {
        const topLevel = makeComponent({ id: 't1', componentName: 'Grid' });
        const fullWidth = makeComponent({ id: 't2', componentName: 'Grid', fullWidth: true });
        const nested = makeComponent({ id: 't3', componentName: 'Grid', parent: 'grid-1' });

        for (const component of [topLevel, fullWidth, nested]) {
            expect(current.needsContainerWrapper(component)).toBe(
                legacy.needsContainerWrapper(component)
            );
        }
    });
});
