/**
 * @vitest-environment happy-dom
 *
 * Числовые поля поповера параметров загрузки.
 *
 * Проверяется вместе с настоящим `BricksInput`, а не в отрыве: поле
 * контролируемое и синхронизирует себя из пропа, поэтому приведение значения на
 * каждый символ возвращалось в поле и подменяло набираемое. Ввод «1920»
 * посимвольно давал 16 → 169 → 1692 → 8000, то есть заполнить поле с клавиатуры
 * было нельзя. Со стабом такой круг не воспроизводится вовсе.
 */

// #region Imports
// Vitest
import { describe, expect, it, vi } from 'vitest';

// Types
import type { IBricksMediaOptimization } from '../../src/runtime/modules/common/types/media';

// Vue
import { defineComponent, h, ref } from 'vue';
import { mount } from '@vue/test-utils';
// #endregion

// #region Mocks
vi.mock('vue-i18n', () => ({
    useI18n: () => ({ t: (key: string) => key }),
}));

vi.mock('vee-validate', () => ({
    validate: async () => ({ errors: [] as string[] }),
}));
// #endregion

import BuilderMediaGalleryUploadOptions from '../../src/runtime/modules/builder/media/components/BuilderMediaGalleryUploadOptions.vue';

// #region Helpers
/** BricksIcon приходит из auto-import Nuxt — вне приложения его нужно подменить. */
const BricksIconStub = defineComponent({
    name: 'BricksIcon',
    props: { icon: { type: String, default: '' } },
    setup: (props) => () => h('i', { 'data-icon': props.icon }),
});

/**
 * Монтирует поповер контролируемым: эмит возвращается в проп, как это делает
 * модалка галереи. Без обратной связи баг не воспроизводится — он именно в
 * том, что приходит назад.
 *
 * @param configuredMaxWidth - Ширина из конфига модуля.
 * @returns Обёртка и текущее состояние параметров.
 */
function mountControlled(configuredMaxWidth = 1920) {
    const optimization = ref<IBricksMediaOptimization>({
        format: 'webp',
        quality: 70,
        maxWidth: configuredMaxWidth,
    });

    const wrapper = mount(
        defineComponent({
            setup: () => () =>
                h(BuilderMediaGalleryUploadOptions, {
                    optimization: optimization.value,
                    configuredMaxWidth,
                    'onUpdate:optimization': (value: IBricksMediaOptimization) => {
                        optimization.value = value;
                    },
                }),
        }),
        {
            global: {
                components: { BricksIcon: BricksIconStub },
                stubs: { BricksSelect: true, BricksCheckbox: true },
            },
        }
    );

    return { wrapper, optimization };
}

/**
 * Возвращает нативное поле «максимальной ширины» (второе числовое в поповере).
 *
 * @param wrapper - Смонтированная обёртка.
 * @returns Поле ввода ширины.
 */
function findMaxWidthInput(wrapper: ReturnType<typeof mountControlled>['wrapper']) {
    return wrapper.findAll('input[type="number"]')[1];
}
// #endregion

describe('Поповер параметров загрузки: посимвольный ввод ширины', () => {
    it('не подменяется границей до потери фокуса', async () => {
        const { wrapper, optimization } = mountControlled();
        const input = findMaxWidthInput(wrapper);

        for (const typed of ['1', '19', '192', '1920']) {
            await input.setValue(typed);

            expect((input.element as HTMLInputElement).value).toBe(typed);
            expect(optimization.value.maxWidth).toBe(Number(typed));
        }
    });

    it('нулевое значение доживает до blur и только там становится минимумом', async () => {
        const { wrapper, optimization } = mountControlled();
        const input = findMaxWidthInput(wrapper);

        await input.setValue('0');

        expect(optimization.value.maxWidth).toBe(0);

        await input.trigger('blur');

        expect(optimization.value.maxWidth).toBe(16);
    });

    it('дробное значение округляется на blur, а не по ходу набора', async () => {
        const { wrapper, optimization } = mountControlled();
        const input = findMaxWidthInput(wrapper);

        await input.setValue('19.5');

        expect(optimization.value.maxWidth).toBe(19.5);

        await input.trigger('blur');

        expect(optimization.value.maxWidth).toBe(20);
    });

    it('пустое поле оставляет прежнее значение — иначе стирание обнуляло бы параметр', async () => {
        const { wrapper, optimization } = mountControlled();
        const input = findMaxWidthInput(wrapper);

        await input.setValue('');

        expect(optimization.value.maxWidth).toBe(1920);
    });
});

describe('Поповер параметров загрузки: границы поля от конфига', () => {
    it('ширина из конфига выше обычного потолка не режется полем', async () => {
        const { wrapper, optimization } = mountControlled(12000);
        const input = findMaxWidthInput(wrapper);

        expect(input.attributes('max')).toBe('12000');

        await input.trigger('blur');

        expect(optimization.value.maxWidth).toBe(12000);
    });

    it('запрос выше конфигурационного потолка на blur опускается до него', async () => {
        const { wrapper, optimization } = mountControlled(12000);
        const input = findMaxWidthInput(wrapper);

        await input.setValue('15000');
        await input.trigger('blur');

        expect(optimization.value.maxWidth).toBe(12000);
    });
});
