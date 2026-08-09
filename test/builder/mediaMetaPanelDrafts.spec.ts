/**
 * @vitest-environment happy-dom
 *
 * Черновики полей мета-панели против серверных обновлений.
 *
 * Два крайних варианта здесь не работают оба, и оба были попробованы. Сторож по
 * объекту срабатывал на собственном ответе PATCH (стор подменяет элемент списка
 * новым объектом) и стирал набираемое в соседнем поле. Сторож только по `id`
 * терял обратную задачу: обновление того же файла извне не доезжало до поля, и
 * следующий commit отправлял устаревшее значение назад, откатывая чужую правку.
 */

// #region Imports
// Vitest
import { describe, expect, it, vi } from 'vitest';

// Types
import type { IMediaItem } from '../../src/runtime/modules/common/types/media';

// Vue
import { defineComponent, h } from 'vue';
import { mount } from '@vue/test-utils';

// Components
import BuilderMediaGalleryMetaPanel from '../../src/runtime/modules/builder/media/components/BuilderMediaGalleryMetaPanel.vue';
// #endregion

// #region Mocks
vi.mock('vue-i18n', () => ({
    useI18n: () => ({ t: (key: string) => key }),
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
 * Поле ввода вместо `BricksInput`: тот тянет vee-validate с правилами, которых
 * вне приложения не зарегистрировано, и валится необслуженными промисами. Под
 * тестом здесь синхронизация черновиков, а не сам инпут, поэтому нужен ровно
 * контракт `value` / `update:value` поверх нативного `<input>`.
 */
const BricksInputStub = defineComponent({
    name: 'BricksInput',
    props: { value: { type: [String, Number], default: '' } },
    emits: ['update:value'],
    setup:
        (props, { emit }) =>
        () =>
            h('input', {
                value: String(props.value),
                onInput: (event: Event) =>
                    emit('update:value', (event.target as HTMLInputElement).value),
            }),
});

/** Селект категории к задаче не относится — достаточно пустой заглушки. */
const BricksSelectStub = defineComponent({ name: 'BricksSelect', setup: () => () => h('div') });

/**
 * Медиа-элемент с заданными правимыми полями.
 *
 * @param overrides - Поля, отличающиеся от базовых.
 */
function makeItem(overrides: Partial<IMediaItem> = {}): IMediaItem {
    return {
        id: 7,
        url: 'https://cdn.example.com/a.webp',
        filename: 'old.png',
        alt: 'старый alt',
        size: 1024,
        uploadedAt: '2026-01-01T00:00:00.000Z',
        mimeType: 'image/webp',
        category: 'other',
        svgContent: null,
        width: 800,
        height: 600,
        previewUrl: null,
        mockUrl: null,
        ...overrides,
    };
}

/**
 * Монтирует панель с выбранным файлом.
 *
 * @param item - Выбранный медиа-элемент.
 */
function mountPanel(item: IMediaItem) {
    return mount(BuilderMediaGalleryMetaPanel, {
        props: {
            selectedItem: item,
            categories: [],
            showPickerActions: false,
            totalCount: 1,
            totalSize: item.size,
        },
        global: {
            stubs: {
                BricksIcon: BricksIconStub,
                BricksInput: BricksInputStub,
                BricksSelect: BricksSelectStub,
            },
        },
    });
}

/**
 * Значения полей «Имя» и «Alt» из разметки.
 *
 * @param html - Разметка панели.
 */
function readInputs(wrapper: ReturnType<typeof mountPanel>): string[] {
    return wrapper.findAll('input').map((input) => (input.element as HTMLInputElement).value);
}
// #endregion

describe('мета-панель: серверные обновления против несохранённого ввода', () => {
    it('нетронутое поле принимает обновление того же файла извне', async () => {
        // Иначе поле остаётся с прежним значением, и следующий commit отправляет
        // его назад — то есть откатывает чужую правку
        const wrapper = mountPanel(makeItem());

        await wrapper.setProps({ selectedItem: makeItem({ filename: 'new.png' }) });

        expect(readInputs(wrapper)).toContain('new.png');
        wrapper.unmount();
    });

    it('поле с несохранённым вводом переживает ответ PATCH соседнего поля', async () => {
        const wrapper = mountPanel(makeItem());
        const altInput = wrapper.findAll('input')[1];

        await altInput.setValue('печатаю прямо сейчас');
        // Ответ PATCH имени: стор подменяет объект целиком, alt в нём серверный
        await wrapper.setProps({ selectedItem: makeItem({ filename: 'new.png' }) });

        expect(readInputs(wrapper)).toContain('печатаю прямо сейчас');
        wrapper.unmount();
    });

    it('смена файла сбрасывает черновики, даже несохранённые', async () => {
        const wrapper = mountPanel(makeItem());
        const altInput = wrapper.findAll('input')[1];

        await altInput.setValue('черновик прошлого файла');
        await wrapper.setProps({ selectedItem: makeItem({ id: 9, alt: 'alt нового файла' }) });

        expect(readInputs(wrapper)).toContain('alt нового файла');
        expect(readInputs(wrapper)).not.toContain('черновик прошлого файла');
        wrapper.unmount();
    });
});
