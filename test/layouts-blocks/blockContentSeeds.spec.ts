/**
 * @vitest-environment happy-dom
 *
 * Starting content of a block versus its structural default.
 *
 * The two used to be one thing, and it was a Russian literal inside the definition:
 * every page created a Text block with the same Russian paragraph whatever the
 * language of the editor. Moving the literal into a locale key alone would not do —
 * a default travels into the page schema on the first save and from that moment is
 * the content of the person, so it must be materialized once, at creation, and never
 * retranslated afterwards.
 *
 * Hence the split checked here: the definition keeps the structure language-neutral,
 * `seedProps` builds the starting content out of the current translator, and the
 * prompts an editor sees on the canvas never reach the published render.
 */

// #region Imports
// Vitest
import { describe, expect, it } from 'vitest';

// Vue
import { mount } from '@vue/test-utils';
import { defineComponent, h } from 'vue';

// Types
import type { IBricksComponent } from '../../src/runtime/modules/common/types/brick';
import type { IBlockCanvasContext } from '../../src/runtime/modules/layouts-blocks/types/registry';
// #endregion

import { blockTextDefinition } from '../../src/runtime/modules/layouts-blocks/components/blockText.definition';
import { blockAccordionDefinition } from '../../src/runtime/modules/layouts-blocks/components/blockAccordion.definition';
import { blockSvgDefinition } from '../../src/runtime/modules/layouts-blocks/components/blockSvg.definition';
import {
    getLayoutLibraryItems,
    resolveBlockSeedProps,
    resolveCanvasBind,
} from '../../src/runtime/modules/layouts-blocks/registry';
import BlockAccordion from '../../src/runtime/modules/layouts-blocks/components/BlockAccordion.vue';
import BlockSvg from '../../src/runtime/modules/layouts-blocks/components/BlockSvg.vue';

/** Global builder icon: registered by an app plugin, stubbed here. */
const BricksIconStub = defineComponent({
    name: 'BricksIcon',
    props: { icon: { type: String, default: '' } },
    setup: () => () => h('i'),
});

/**
 * Translator that answers in the language it is built for.
 *
 * @param language - Marker written into every answer.
 * @returns A translator for the block definitions.
 */
function makeTranslator(language: string) {
    return (key: string, params?: Record<string, unknown>): string => {
        const suffix = params ? ` ${JSON.stringify(params)}` : '';

        return `${language}:${key}${suffix}`;
    };
}

/**
 * Reads the default of a panel property out of a definition.
 *
 * @param properties - Properties of the definition.
 * @param name - Property name.
 * @returns The default value.
 */
function readDefault(
    properties: Array<{ name: string; default?: unknown }>,
    name: string
): unknown {
    return properties.find((property) => property.name === name)?.default;
}

/**
 * Canvas binding context of a block, with the translator under test.
 *
 * @param name - Block name for the schema component.
 * @param translate - Translator of the builder.
 * @returns The context accepted by canvasBind.
 */
function makeCanvasContext(name: string, translate: (key: string) => string): IBlockCanvasContext {
    const component: IBricksComponent = {
        id: 'seed',
        type: 'layout',
        componentName: name,
        brickPath: `layout/${name.toLowerCase()}`,
        zIndex: 0,
        props: {},
    };

    return {
        component,
        layoutProps: {},
        boundProps: {},
        childComponents: [],
        renderChild: () => null,
        t: translate,
    };
}

describe('layout blocks: structural default versus starting content', () => {
    it('the definitions keep no language in their defaults', () => {
        expect(readDefault(blockTextDefinition.properties, 'content')).toBe('');
        expect(readDefault(blockAccordionDefinition.properties, 'items')).toEqual([]);
    });

    it('the Text seed wraps the translated line into a paragraph', () => {
        expect(blockTextDefinition.seedProps?.(makeTranslator('en'))).toEqual({
            content: '<p>en:bricks.blocks.text.defaultContent</p>',
        });
    });

    it('the Accordion seed builds one item out of the shared editor keys', () => {
        expect(blockAccordionDefinition.seedProps?.(makeTranslator('en'))).toEqual({
            items: [
                {
                    title: 'en:bricks.properties.accordion.defaultTitle {"n":1}',
                    content: '<p>en:bricks.properties.accordion.defaultContent</p>',
                },
            ],
        });
    });

    // A language switch has to reach the next block dragged out of the library, which
    // is the whole reason the seed is a function and not a stored value
    it('a seed follows the translator it is built with', () => {
        const ru = resolveBlockSeedProps('Text', makeTranslator('ru'));
        const en = resolveBlockSeedProps('Text', makeTranslator('en'));

        expect(ru).not.toEqual(en);
    });

    it('a block without a seed answers with nothing to override', () => {
        expect(resolveBlockSeedProps('Grid', makeTranslator('en'))).toEqual({});
        expect(resolveBlockSeedProps('NoSuchBlock', makeTranslator('en'))).toEqual({});
    });

    // The library list itself stays neutral: the seed is merged in by the builder,
    // which is the only surface that has a translator at all
    it('the library items carry the structural default, not the seed', () => {
        const text = getLayoutLibraryItems().find((item) => item.name === 'Text');

        expect(text?.defaultProps?.content).toBe('');
    });
});

describe('layout blocks: prompts of an empty block', () => {
    it('the canvas binding of Svg carries the prompt', () => {
        const bind = resolveCanvasBind(
            blockSvgDefinition,
            makeCanvasContext('Svg', makeTranslator('en'))
        );

        expect(bind.emptyLabel).toBe('en:bricks.blocks.svg.emptyLabel');
    });

    it('the canvas binding of Accordion carries the prompt', () => {
        const bind = resolveCanvasBind(
            blockAccordionDefinition,
            makeCanvasContext('Accordion', makeTranslator('en'))
        );

        expect(bind.emptyLabel).toBe('en:bricks.blocks.accordion.emptyLabel');
    });

    it('an empty Accordion shows the prompt only when one is passed', () => {
        const layoutProps = { items: [], allowMultiple: false, initialOpenIndex: -1 };

        const withPrompt = mount(BlockAccordion, {
            props: { layoutProps, emptyLabel: 'Add items' },
        });
        const withoutPrompt = mount(BlockAccordion, { props: { layoutProps } });

        expect(withPrompt.text()).toContain('Add items');
        expect(withoutPrompt.text()).toBe('');
    });

    it('an Svg without a source shows the prompt only when one is passed', () => {
        const global = { components: { BricksIcon: BricksIconStub } };

        const withPrompt = mount(BlockSvg, { props: { emptyLabel: 'Pick an SVG' }, global });
        const withoutPrompt = mount(BlockSvg, { global });

        expect(withPrompt.text()).toContain('Pick an SVG');
        expect(withoutPrompt.text()).toBe('');
    });
});
