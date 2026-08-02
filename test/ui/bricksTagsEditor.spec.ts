/**
 * @vitest-environment happy-dom
 *
 * DOM-окружение включено только для этого файла: остальные тесты проекта живут в
 * node-окружении, и глобальный `window` им не нужен.
 */

// #region Imports
// Vitest
import { describe, expect, it, vi } from 'vitest';

// Types
import type { IBricksTagsEditorProps } from '../../src/runtime/modules/ui/inputs/types.d.ts';

// Vue
import { defineComponent, h } from 'vue';
import { mount, type VueWrapper } from '@vue/test-utils';

// Components
import BricksTagsEditor from '../../src/runtime/modules/ui/inputs/BricksTagsEditor.vue';
// #endregion

// #region Mocks
vi.mock('vue-i18n', () => ({
    useI18n: () => ({
        t: (key: string, named?: Record<string, unknown>) =>
            named ? `${key}:${Object.values(named).join(',')}` : key,
    }),
}));
// #endregion

// #region Helpers
/** BricksIcon приходит из auto-import Nuxt — вне приложения его нужно подменить. */
const BricksIconStub = defineComponent({
    name: 'BricksIcon',
    props: { icon: { type: String, default: '' } },
    setup: (props) => () => h('i', { 'data-icon': props.icon }),
});

/**
 * Монтирует редактор тегов.
 *
 * @param overrides - Пропсы, переопределяющие дефолты.
 */
function mountEditor(overrides: Partial<IBricksTagsEditorProps> = {}): VueWrapper {
    return mount(BricksTagsEditor, {
        props: { modelValue: [], ...overrides },
        global: { components: { BricksIcon: BricksIconStub } },
    });
}

/**
 * Отдаёт последний список тегов, отданный наружу.
 *
 * @param wrapper - Смонтированный редактор.
 */
function lastEmittedTags(wrapper: VueWrapper): string[] | undefined {
    const events = wrapper.emitted('update:modelValue') as string[][][] | undefined;
    return events?.[events.length - 1]?.[0];
}

/**
 * Вводит текст в поле редактора (как это делает пользователь или вставка).
 *
 * @param wrapper - Смонтированный редактор.
 * @param value - Полное новое значение поля.
 */
async function typeInto(wrapper: VueWrapper, value: string): Promise<void> {
    const input = wrapper.find('input');
    (input.element as HTMLInputElement).value = value;
    await input.trigger('input');
}
// #endregion

describe('BricksTagsEditor: запятая как разделитель', () => {
    it('раскладывает вставленную строку на чипы, хвост оставляет в поле', async () => {
        const wrapper = mountEditor();

        await typeInto(wrapper, 'promo, page, marke');

        expect(lastEmittedTags(wrapper)).toEqual(['promo', 'page']);
        expect((wrapper.find('input').element as HTMLInputElement).value).toBe('marke');
    });

    it('фиксирует последний тег по Enter', async () => {
        const wrapper = mountEditor({ modelValue: ['promo'] });

        await typeInto(wrapper, 'page');
        await wrapper.find('input').trigger('keydown', { key: 'Enter' });

        expect(lastEmittedTags(wrapper)).toEqual(['promo', 'page']);
    });

    it('не добавляет дубли и пустые фрагменты', async () => {
        const wrapper = mountEditor({ modelValue: ['promo'] });

        await typeInto(wrapper, 'promo, , page,');

        expect(lastEmittedTags(wrapper)).toEqual(['promo', 'page']);
    });
});

describe('BricksTagsEditor: предел длины склеенного значения', () => {
    it('не принимает тег, с которым значение выходит за maxLength, и объясняет отказ', async () => {
        // 'promo' + ', ' + 'page' = 11 символов: 'page' уже не влезает
        const wrapper = mountEditor({ modelValue: ['promo'], maxLength: 10 });

        await typeInto(wrapper, 'page');
        await wrapper.find('input').trigger('keydown', { key: 'Enter' });

        expect(wrapper.emitted('update:modelValue')).toBeUndefined();
        expect(wrapper.text()).toContain('bricks.common.tagsLimit:10');
    });

    it('оставляет непринятый ввод в поле — молча съеденный текст выглядел бы как потеря', async () => {
        const wrapper = mountEditor({ modelValue: ['promo'], maxLength: 10 });

        await typeInto(wrapper, 'page, sale,');

        expect((wrapper.find('input').element as HTMLInputElement).value).toBe('page, sale');
    });

    it('принимает всё, что влезает, до первого непоместившегося тега', async () => {
        // 'ab' + ', ' + 'cd' = 6 символов, следующий тег уже не помещается
        const wrapper = mountEditor({ maxLength: 6 });

        await typeInto(wrapper, 'ab, cd, ef,');

        expect(lastEmittedTags(wrapper)).toEqual(['ab', 'cd']);
        expect(wrapper.text()).toContain('bricks.common.tagsLimit:6');
    });

    it('подмена набора снаружи убирает непринятый ввод и сообщение', async () => {
        const wrapper = mountEditor({ modelValue: ['promo'], maxLength: 10 });

        await typeInto(wrapper, 'page,');
        expect(wrapper.text()).toContain('bricks.common.tagsLimit:10');

        // Отмена правок или переход на другую страницу: хвост и отказ относятся
        // к прежнему значению и в новом контексте читались бы как чужой мусор
        await wrapper.setProps({ modelValue: ['other'] });

        expect((wrapper.find('input').element as HTMLInputElement).value).toBe('');
        expect(wrapper.text()).not.toContain('bricks.common.tagsLimit');
    });

    it('своё же эхо набора хвост в поле не стирает', async () => {
        const wrapper = mountEditor({ modelValue: [], maxLength: 20 });

        await typeInto(wrapper, 'promo, page');
        expect((wrapper.find('input').element as HTMLInputElement).value).toBe('page');

        // Владелец формы применил emit и вернул тот же набор пропом
        await wrapper.setProps({ modelValue: lastEmittedTags(wrapper) });

        expect((wrapper.find('input').element as HTMLInputElement).value).toBe('page');
    });

    it('без maxLength лимита нет — редактор остаётся общим элементом кита', async () => {
        const wrapper = mountEditor();

        await typeInto(wrapper, 'a'.repeat(500) + ',');

        expect(lastEmittedTags(wrapper)).toEqual(['a'.repeat(500)]);
    });
});
