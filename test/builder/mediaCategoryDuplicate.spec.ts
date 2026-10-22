/**
 * @vitest-environment happy-dom
 *
 * Ловля дубликата при создании категории медиатеки.
 *
 * Уникальность сервер считает по slug'у, а не по подписи, поэтому сравнение
 * подписей пропускало пары вроде «Ёлка»/«Елка» и «Promo»/«Promo!»: POST отвечал
 * существующей категорией как успехом, поле создания закрывалось, новой
 * категории не появлялось и ошибки пользователь не видел.
 */

// #region Imports
// Vitest
import { describe, expect, it, vi } from 'vitest';

// Types
import type { IMediaCategory } from '../../src/runtime/modules/common/types/media';

// Vue
import { defineComponent, h } from 'vue';
import { mount, type VueWrapper } from '@vue/test-utils';
// #endregion

// #region Mocks
vi.mock('vue-i18n', () => ({
    useI18n: () => ({
        t: (key: string, params?: Record<string, unknown>) => `${key}:${params?.name ?? ''}`,
    }),
}));
// #endregion

import BuilderMediaGalleryFilters from '../../src/runtime/modules/builder/media/components/BuilderMediaGalleryFilters.vue';

// #region Helpers
/** BricksIcon приходит из auto-import Nuxt — вне приложения его нужно подменить. */
const BricksIconStub = defineComponent({
    name: 'BricksIcon',
    props: { icon: { type: String, default: '' } },
    setup: (props) => () => h('i', { 'data-icon': props.icon }),
});

/** Кнопка кита: важен только клик и `aria-label`, по которому её ищет тест. */
const BricksButtonStub = defineComponent({
    name: 'BricksButton',
    props: {
        ariaLabel: { type: String, default: '' },
        disabled: { type: Boolean, default: false },
    },
    emits: ['click'],
    setup:
        (props, { slots, emit }) =>
        () =>
            h(
                'button',
                {
                    'aria-label': props.ariaLabel,
                    disabled: props.disabled,
                    onClick: () => emit('click'),
                },
                slots.default?.()
            ),
});

/** Тултип кита рендерит активатор через слот — без него кнопки не попадут в DOM. */
const BricksTooltipStub = defineComponent({
    name: 'BricksTooltip',
    setup:
        (_, { slots }) =>
        () =>
            h('span', slots.activator?.()),
});

/** Поле кита: наружу отдаётся введённое, внутрь — текст ошибки в `data-error`. */
const BricksInputStub = defineComponent({
    name: 'BricksInput',
    props: {
        value: { type: String, default: '' },
        errorMessage: { type: String, default: '' },
    },
    emits: ['update:value'],
    setup:
        (props, { emit }) =>
        () =>
            h('input', {
                'data-error': props.errorMessage ?? '',
                value: props.value,
                onInput: (event: Event) =>
                    emit('update:value', (event.target as HTMLInputElement).value),
            }),
});

/**
 * Монтирует дорожку категорий и открывает поле создания.
 *
 * @param categories - Уже заведённые категории.
 * @returns Обёртка компонента.
 */
async function mountWithCreateOpen(categories: IMediaCategory[]): Promise<VueWrapper> {
    const wrapper = mount(BuilderMediaGalleryFilters, {
        props: {
            categoryFilter: 'all',
            categories,
            categoryCounts: {},
            totalCount: 0,
            isCreatingCategory: false,
        },
        global: {
            // BricksIcon приходит auto-import'ом — его подменяет `components`.
            // Остальные кит-компоненты SFC импортирует явно, и такой импорт
            // перебивается только через `stubs`.
            components: { BricksIcon: BricksIconStub },
            stubs: {
                BricksButton: BricksButtonStub,
                BricksTooltip: BricksTooltipStub,
                BricksInput: BricksInputStub,
                BricksTooltipHint: true,
                BuilderMediaGalleryCategoryTabs: true,
            },
        },
    });

    await wrapper.find('button[aria-label^="bricks.media.categoryCreate"]').trigger('click');

    return wrapper;
}

/**
 * Вводит подпись в поле создания и возвращает текст ошибки поля.
 *
 * @param wrapper - Смонтированная дорожка.
 * @param label - Вводимая подпись.
 * @returns Сообщение об ошибке или пустая строка.
 */
async function typeLabel(wrapper: VueWrapper, label: string): Promise<string> {
    const input = wrapper.find('input');
    await input.setValue(label);

    return wrapper.find('input').attributes('data-error') ?? '';
}

/**
 * Собирает категорию для пропа.
 *
 * @param id - Идентификатор.
 * @param slug - Slug категории.
 * @param label - Подпись категории.
 * @returns Категория медиатеки.
 */
function createCategory(id: number, slug: string, label: string): IMediaCategory {
    return { id, slug, label, sortOrder: id * 10 };
}
// #endregion

describe('Создание категории: дубликат по slug’у', () => {
    it('подпись, отличающаяся только «ё», ловится как дубликат', async () => {
        const wrapper = await mountWithCreateOpen([createCategory(1, 'elka', 'Ёлка')]);

        expect(await typeLabel(wrapper, 'Елка')).toBe('bricks.media.categoryDuplicate:Ёлка');
    });

    it('подпись, отличающаяся только знаком препинания, ловится как дубликат', async () => {
        const wrapper = await mountWithCreateOpen([createCategory(1, 'promo', 'Promo')]);

        expect(await typeLabel(wrapper, 'Promo!')).toBe('bricks.media.categoryDuplicate:Promo');
    });

    it('расширяющая транслитерация упирается в потолок slug’а и склеивает разные подписи', async () => {
        // «щ» даёт три символа slug'а, поэтому 17 и 20 букв — это 51 и 60
        // символов, обрезаемых колонкой до одних и тех же 50. Обе подписи
        // короче потолка подписи в 50 символов, то есть сервер их примет и
        // упрётся в конфликт по slug'у уже на вставке
        const existingLabel = 'щ'.repeat(17);
        const existingSlug = 'sch'.repeat(16) + 'sc';
        const wrapper = await mountWithCreateOpen([createCategory(1, existingSlug, existingLabel)]);

        expect(await typeLabel(wrapper, 'щ'.repeat(20))).toBe(
            `bricks.media.categoryDuplicate:${existingLabel}`
        );
    });

    it('в сообщении стоит подпись существующей категории, а не введённая', async () => {
        const wrapper = await mountWithCreateOpen([createCategory(1, 'elka', 'Ёлка')]);

        expect(await typeLabel(wrapper, 'ЕЛКА')).not.toContain('ЕЛКА');
    });

    it('новая подпись дубликатом не считается', async () => {
        const wrapper = await mountWithCreateOpen([createCategory(1, 'elka', 'Ёлка')]);

        expect(await typeLabel(wrapper, 'Промо')).toBe('');
    });
});

describe('Создание категории: дубликат по подписи', () => {
    it('совпадение подписи ловится даже при чужом slug’е', async () => {
        // Подпись и slug связаны только в момент создания: у категории,
        // заведённой когда-то иначе, они разъехались, и сервер такую пару
        // примет — в дорожке оказались бы два неразличимых чипа
        const wrapper = await mountWithCreateOpen([createCategory(1, 'icons', 'Иконки')]);

        expect(await typeLabel(wrapper, 'Иконки')).toBe('bricks.media.categoryDuplicate:Иконки');
    });

    it('совпадение подписи регистронезависимо', async () => {
        const wrapper = await mountWithCreateOpen([createCategory(1, 'icons', 'Иконки')]);

        expect(await typeLabel(wrapper, 'иконки')).toBe('bricks.media.categoryDuplicate:Иконки');
    });

    it('подпись без букв и цифр сверяется как есть: slug у неё пуст, но текст различим', async () => {
        const wrapper = await mountWithCreateOpen([createCategory(1, 'elka', 'Ёлка')]);

        expect(await typeLabel(wrapper, '!!!')).toBe('');
    });

    it('пустой slug не склеивает подписи из одних символов', async () => {
        const wrapper = await mountWithCreateOpen([createCategory(1, '', '!!!')]);

        expect(await typeLabel(wrapper, '???')).toBe('');
    });
});

describe('Создание категории: дубликат не отправляется', () => {
    it('Enter на дубликате не эмитит создание', async () => {
        const wrapper = await mountWithCreateOpen([createCategory(1, 'elka', 'Ёлка')]);

        await wrapper.find('input').setValue('Елка');
        await wrapper.find('input').trigger('keydown.enter');

        expect(wrapper.emitted('create-category')).toBeUndefined();
    });

    it('Enter на новой подписи создание эмитит', async () => {
        const wrapper = await mountWithCreateOpen([createCategory(1, 'elka', 'Ёлка')]);

        await wrapper.find('input').setValue('Промо');
        await wrapper.find('input').trigger('keydown.enter');

        expect(wrapper.emitted('create-category')).toEqual([['Промо']]);
    });
});
