/**
 * @vitest-environment happy-dom
 *
 * Модалка профиля: две вкладки против одной формы и то, что клиент отсекает сам.
 *
 * Гейт вкладок — контракт с настройкой установки: при `allowPasswordChange: false`
 * ручки пароля отвечают 403, и дорожка с недостижимой вкладкой предлагала бы
 * человеку форму, которая заведомо откажет. Дорожка из одного таба тоже не
 * нужна — она сообщает о выборе, которого нет.
 *
 * Размер файла — единственная проверка содержимого на клиенте: тип подтверждает
 * сигнатура на сервере, а вот гонять по сети файл, обречённый на 413, незачем.
 */

// #region Imports
// Vitest
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Vue
import { defineComponent, h } from 'vue';
import { mount, flushPromises } from '@vue/test-utils';
// #endregion

// #region Mocks
vi.mock('../../src/runtime/modules/builder/auth/composables/useAuthProfile', async () => {
    const { computed } = await import('vue');
    const profile = {
        id: 7,
        username: 'admin',
        role: 'admin' as const,
        displayName: 'Сергей',
        avatarUrl: null,
    };

    return {
        useAuthProfile: () => ({
            profile: computed(() => profile),
            displayLabel: computed(() => profile.displayName),
            ensureProfile: vi.fn(),
            saveDisplayName: vi.fn(),
            uploadAvatar: vi.fn(),
            removeAvatar: vi.fn(),
            changeOwnPassword: vi.fn(),
        }),
    };
});

vi.mock('vue-i18n', () => ({
    useI18n: () => ({
        t: (key: string, params?: Record<string, unknown>) =>
            params ? `${key}:${JSON.stringify(params)}` : key,
    }),
}));
// #endregion

import { BRICKS_AVATAR_MAX_UPLOAD_MB } from '../../src/runtime/modules/common/constants/auth';
import TheBuilderAuthProfileModal from '../../src/runtime/modules/builder/auth/components/TheBuilderAuthProfileModal.vue';

/** Глобальная иконка билдера регистрируется плагином приложения. */
const BricksIconStub = defineComponent({
    name: 'BricksIcon',
    props: { icon: { type: String, default: '' } },
    setup: (props) => () => h('i', { 'data-icon': props.icon }),
});

/** Заглушка модального шелла: reka-диалог телепортирует контент и требует портал. */
const BricksModalStub = defineComponent({
    name: 'BricksModal',
    props: { isOpen: { type: Boolean, default: false } },
    setup:
        (props, { slots }) =>
        () =>
            props.isOpen ? h('div', slots.default?.()) : null,
});

const TabBarStub = defineComponent({
    name: 'BricksTabBar',
    props: {
        modelValue: { type: String, default: '' },
        items: { type: Array, default: () => [] },
    },
    emits: ['update:modelValue'],
    setup:
        (props, { emit }) =>
        () =>
            h(
                'div',
                { 'data-testid': 'tabs' },
                (props.items as Array<{ value: string; label: string }>).map((item) =>
                    h(
                        'button',
                        {
                            type: 'button',
                            'data-tab': item.value,
                            onClick: () => emit('update:modelValue', item.value),
                        },
                        item.label
                    )
                )
            ),
});

/**
 * Заглушки форм и вложенной модалки: спека про гейт вкладок и отсечение файла,
 * а не про их содержимое (у каждой своя спека).
 */
const stubs = {
    BricksModal: BricksModalStub,
    BricksTabBar: TabBarStub,
    BuilderAuthProfileDetailsForm: defineComponent({
        name: 'BuilderAuthProfileDetailsForm',
        setup: () => () => h('div', { 'data-testid': 'details-form' }),
    }),
    BuilderAuthProfilePasswordForm: defineComponent({
        name: 'BuilderAuthProfilePasswordForm',
        setup: () => () => h('div', { 'data-testid': 'password-form' }),
    }),
    BuilderAuthProfileAvatarCropModal: defineComponent({
        name: 'BuilderAuthProfileAvatarCropModal',
        props: { isOpen: { type: Boolean, default: false }, file: { type: Object, default: null } },
        setup: (props) => () =>
            h('div', { 'data-testid': 'crop', 'data-open': String(props.isOpen) }),
    }),
};

/**
 * Монтирует модалку профиля.
 *
 * @param canChangePassword - Доступна ли вкладка «Пароль».
 * @returns Обёртка теста.
 */
function mountModal(canChangePassword: boolean) {
    return mount(TheBuilderAuthProfileModal, {
        props: { isOpen: true, canChangePassword },
        global: { stubs, components: { BricksIcon: BricksIconStub } },
    });
}

/**
 * Подкладывает выбранный файл в скрытое поле и сообщает об изменении.
 *
 * @param wrapper - Обёртка модалки.
 * @param file - Файл.
 */
async function selectFile(wrapper: ReturnType<typeof mountModal>, file: File): Promise<void> {
    const input = wrapper.find('input[type="file"]');

    Object.defineProperty(input.element, 'files', { configurable: true, value: [file] });
    await input.trigger('change');
    await flushPromises();
}

describe('TheBuilderAuthProfileModal: вкладки', () => {
    it('при выключенной смене пароля вкладок нет, остаётся одна форма', () => {
        const wrapper = mountModal(false);

        expect(wrapper.find('[data-testid="tabs"]').exists()).toBe(false);
        expect(wrapper.find('[data-testid="details-form"]').exists()).toBe(true);
        expect(wrapper.find('[data-testid="password-form"]').exists()).toBe(false);
    });

    it('со включённой сменой пароля дорожка ведёт на форму пароля и обратно', async () => {
        const wrapper = mountModal(true);

        expect(wrapper.find('[data-testid="tabs"]').exists()).toBe(true);

        await wrapper.find('[data-tab="password"]').trigger('click');

        expect(wrapper.find('[data-testid="password-form"]').exists()).toBe(true);
        expect(wrapper.find('[data-testid="details-form"]').exists()).toBe(false);

        await wrapper.find('[data-tab="profile"]').trigger('click');

        expect(wrapper.find('[data-testid="details-form"]').exists()).toBe(true);
    });

    // Настройка могла выключиться, пока модалка открыта: оставить экран на
    // недостижимой вкладке значит показать форму, которой ручка откажет
    it('выключение смены пароля возвращает на вкладку профиля', async () => {
        const wrapper = mountModal(true);

        await wrapper.find('[data-tab="password"]').trigger('click');
        expect(wrapper.find('[data-testid="password-form"]').exists()).toBe(true);

        await wrapper.setProps({ canChangePassword: false });

        expect(wrapper.find('[data-testid="details-form"]').exists()).toBe(true);
        expect(wrapper.find('[data-testid="tabs"]').exists()).toBe(false);
    });
});

describe('TheBuilderAuthProfileModal: закрытие', () => {
    it('«Отмена» формы закрывает модалку', async () => {
        const wrapper = mountModal(false);

        wrapper.findComponent({ name: 'BuilderAuthProfileDetailsForm' }).vm.$emit('close');
        await flushPromises();

        expect(wrapper.emitted('close')).toHaveLength(1);
    });

    // Оба пути закрытия идут через один guard: пока открыт кроп, модалка профиля
    // остаётся на экране — иначе Esc или «Отмена» сняли бы обе разом, хотя
    // отменить нужно только выбор области
    it('пока открыто кадрирование, закрытие профиля не проходит', async () => {
        const wrapper = mountModal(false);
        const file = new File([new Uint8Array(1024)], 'photo.jpg', { type: 'image/jpeg' });

        await selectFile(wrapper, file);
        expect(wrapper.find('[data-testid="crop"]').attributes('data-open')).toBe('true');

        wrapper.findComponent({ name: 'BuilderAuthProfileDetailsForm' }).vm.$emit('close');
        await flushPromises();

        expect(wrapper.emitted('close')).toBeUndefined();
    });

    // Файл снимается по уходу кропа из DOM, а не в начале закрытия: иначе кадр
    // гаснет пустым всё время leave-анимации
    it('файл кадрирования снимается только после ухода модалки', async () => {
        const wrapper = mountModal(false);
        const file = new File([new Uint8Array(1024)], 'photo.jpg', { type: 'image/jpeg' });

        await selectFile(wrapper, file);

        const crop = wrapper.findComponent({ name: 'BuilderAuthProfileAvatarCropModal' });

        crop.vm.$emit('close');
        await flushPromises();
        expect(crop.props('file')).toBe(file);

        crop.vm.$emit('afterLeave');
        await flushPromises();
        expect(crop.props('file')).toBeNull();
    });
});

describe('TheBuilderAuthProfileModal: выбор файла фото', () => {
    let wrapper: ReturnType<typeof mountModal>;

    beforeEach(() => {
        wrapper = mountModal(false);
    });

    it('подходящий файл открывает кадрирование', async () => {
        const file = new File([new Uint8Array(1024)], 'photo.jpg', { type: 'image/jpeg' });

        await selectFile(wrapper, file);

        expect(wrapper.find('[data-testid="crop"]').attributes('data-open')).toBe('true');
        expect(wrapper.emitted('notify')).toBeUndefined();
    });

    it('файл сверх потолка не доходит до кадрирования и объясняется тостом', async () => {
        const oversized = new File(
            [new Uint8Array(BRICKS_AVATAR_MAX_UPLOAD_MB * 1024 * 1024 + 1)],
            'big.jpg',
            { type: 'image/jpeg' }
        );

        await selectFile(wrapper, oversized);

        expect(wrapper.find('[data-testid="crop"]').attributes('data-open')).toBe('false');

        const notify = wrapper.emitted('notify');

        expect(notify).toHaveLength(1);
        expect(String(notify?.[0][0])).toContain('bricks.auth.profile.errors.avatarTooLarge');
        expect(notify?.[0][1]).toBe('error');
    });
});
