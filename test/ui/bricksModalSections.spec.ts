/**
 * @vitest-environment happy-dom
 *
 * Шапка и футер модалки — то, что до выделения компонентов было написано в
 * пятнадцати местах руками.
 *
 * Что здесь сторожится:
 *
 * 1. Видимый заголовок печатает то же значение, что стоит в имени диалога
 *    (`aria-labelledby` → скрытый `DialogTitle`). Пока шапку писали в шаблоне,
 *    это были две независимые строки: проп `title` для скринридера и `<h3>` для
 *    глаза, и разойтись они могли молча — ни одна проверка на такое не
 *    срабатывает.
 * 2. Крестик шапки гасится на время сабмита: закрывать окно, пока запрос летит,
 *    нельзя, и кнопка обязана об этом сообщать сама.
 * 3. Левая группа футера остаётся слева и не разъезжается со `space-between`:
 *    признак — она стоит в своём узле перед кнопками по умолчанию.
 */

// #region Imports
// Vitest
import { describe, expect, it, vi, afterEach } from 'vitest';

// Vue
import { defineComponent, h, nextTick } from 'vue';
import { mount } from '@vue/test-utils';
// #endregion

// #region Mocks
vi.mock('vue-i18n', () => ({
    useI18n: () => ({ t: (key: string) => key }),
}));
// #endregion

import BricksModal from '../../src/runtime/modules/ui/base/modal/BricksModal.vue';
import BricksModalFooter from '../../src/runtime/modules/ui/base/modal/BricksModalFooter.vue';
import BricksModalHeader from '../../src/runtime/modules/ui/base/modal/BricksModalHeader.vue';

/** Глобальная иконка билдера регистрируется плагином приложения — здесь заглушка. */
const BricksIconStub = defineComponent({
    name: 'BricksIcon',
    props: { icon: { type: String, default: '' } },
    setup: (props) => () => h('i', { 'data-icon': props.icon }),
});

/** Хост модалки: окно рисует он, шапка стоит внутри окна — как у всех вызывающих. */
const ModalHost = defineComponent({
    components: { BricksModal, BricksModalHeader },
    props: {
        title: { type: String, required: true },
        closeDisabled: { type: Boolean, default: false },
    },
    template: `
        <BricksModal :is-open="true" :title="title">
            <BricksModalHeader :close-disabled="closeDisabled" />
        </BricksModal>
    `,
});

/**
 * Монтирует хост и ждёт портал: `DialogPortal` появляется в разметке только
 * после монтирования, поэтому синхронно после `mount` в документе ещё пусто.
 *
 * @param title - Заголовок, который хост отдаёт `BricksModal`.
 * @param closeDisabled - Гасить ли крестик.
 */
async function mountModalWithHeader(title: string, closeDisabled = false) {
    const wrapper = mount(ModalHost, {
        props: { title, closeDisabled },
        global: { components: { BricksIcon: BricksIconStub } },
        attachTo: document.body,
    });

    await nextTick();
    await nextTick();

    return wrapper;
}

/** Текст, которым диалог назван для скринридера (цель `aria-labelledby`). */
function accessibleName(): string {
    const dialog = document.querySelector('[role="dialog"]');
    const labelId = dialog?.getAttribute('aria-labelledby') ?? '';

    return document.getElementById(labelId)?.textContent?.trim() ?? '';
}

/** Текст видимого заголовка шапки. */
function visibleTitle(): string {
    const headings = [...document.querySelectorAll('h2')].filter((node) => !node.id);

    return headings.at(-1)?.textContent?.trim() ?? '';
}

afterEach(() => {
    document.body.innerHTML = '';
});

describe('BricksModalHeader', () => {
    it('видимый заголовок и имя диалога — одно значение', async () => {
        await mountModalWithHeader('Создание страницы');

        expect(accessibleName()).toBe('Создание страницы');
        expect(visibleTitle()).toBe('Создание страницы');
    });

    it('смена заголовка у хоста меняет оба', async () => {
        const wrapper = await mountModalWithHeader('Пароль: admin');

        await wrapper.setProps({ title: 'Пароль: editor' });

        expect(accessibleName()).toBe('Пароль: editor');
        expect(visibleTitle()).toBe('Пароль: editor');
    });

    it('гасит крестик, пока идёт сабмит', async () => {
        await mountModalWithHeader('Создание учётки', true);

        const close = document.querySelector('button[aria-label="bricks.common.close"]');

        expect(close).not.toBeNull();
        expect(close?.hasAttribute('disabled')).toBe(true);
    });
});

describe('BricksModalFooter', () => {
    it('левая группа стоит перед кнопками по умолчанию', () => {
        const wrapper = mount(BricksModalFooter, {
            slots: {
                leading: '<button data-role="discard">Отказаться</button>',
                default: '<button data-role="confirm">Восстановить</button>',
            },
        });

        const buttons = wrapper.findAll('button');

        expect(buttons.map((button) => button.attributes('data-role'))).toEqual([
            'discard',
            'confirm',
        ]);

        // Левая группа — свой узел: без него прижать её влево нечем
        expect(wrapper.get('[data-role="discard"]').element.parentElement).not.toBe(
            wrapper.element
        );
    });

    it('без слота левой группы лишнего узла не появляется', () => {
        const wrapper = mount(BricksModalFooter, {
            slots: { default: '<button data-role="confirm">Сохранить</button>' },
        });

        expect(wrapper.element.children).toHaveLength(1);
    });
});
