/**
 * @vitest-environment happy-dom
 *
 * Форма создания учётки.
 *
 * Что здесь сторожится:
 *
 * 1. В тело уходит РОВНО то, что принимает ручка: лишний ключ она отклоняет
 *    400-м (`assertKnownKeys`), а логин канонизируется в нижний регистр — иначе
 *    `Anna.Kim` и `anna.kim` выглядели бы двумя учётками при одной строке в базе.
 * 2. Занятый логин встаёт ПОД ПОЛЕ, а не в общий текст ошибки: исправлять нужно
 *    именно его.
 * 3. Обрыв по потолку ожидания — не отказ: сервер мог создать учётку и не успеть
 *    ответить, поэтому список перечитывается и в нём ищется логин. Повтор формы
 *    иначе получил бы «логин занят» и выглядел бы противоречием.
 */

// #region Imports
// Vitest
import { beforeEach, describe, expect, it, vi } from 'vitest';
// #endregion

// #region Mocks
const { apiFetcherMock } = vi.hoisted(() => ({ apiFetcherMock: vi.fn() }));

vi.mock('../../src/runtime/modules/common/composables/useApiClient', () => ({
    useApiClient: () => ({ apiFetcher: apiFetcherMock }),
}));
vi.mock('../../src/runtime/modules/builder/core/composables/useBuilderPermissions', () => ({
    useBuilderPermissions: () => ({ canManageUsers: { value: true } }),
}));

vi.mock('vue-i18n', () => ({
    useI18n: () => ({
        // Пустой набор параметров печатается как его отсутствие: `vue-i18n`
        // рендерит `t(key, {})` и `t(key)` одинаково, и мок не должен добавлять
        // различие, которого в приложении нет
        t: (key: string, params?: Record<string, unknown>) =>
            params && Object.keys(params).length > 0 ? `${key}:${JSON.stringify(params)}` : key,
    }),
}));
// #endregion

import { defineComponent, h, nextTick } from 'vue';
import { mount } from '@vue/test-utils';
import { resetNuxtStateStub } from '../stubs/nuxt-imports';
import { useUsersCreateForm } from '../../src/runtime/modules/builder/users/composables/useUsersCreateForm';
import type { IBricksUserSummary } from '../../src/runtime/modules/common/types/auth';

/**
 * Учётка ответа ручки.
 *
 * @param overrides - Поля, отличающиеся от дефолтных.
 * @returns Учётка.
 */
function makeUser(overrides: Partial<IBricksUserSummary> = {}): IBricksUserSummary {
    return {
        id: 5,
        username: 'anna.editor',
        role: 'editor',
        isActive: true,
        displayName: 'Анна Ким',
        avatarUrl: null,
        createdAt: '2026-04-02T10:00:00.000Z',
        lastLoginAt: null,
        ...overrides,
    };
}

/**
 * Монтирует форму в компоненте: vee-validate требует активного экземпляра.
 *
 * @param onCreated - Колбэк успешного создания.
 * @returns Возвращаемое значение композабла и обёртка.
 */
function mountForm(onCreated = vi.fn()) {
    let form: ReturnType<typeof useUsersCreateForm> | undefined;

    const wrapper = mount(
        defineComponent({
            setup() {
                form = useUsersCreateForm({ onCreated });

                return () => h('div');
            },
        })
    );

    if (!form) {
        throw new Error('Форма не создана');
    }

    return { form, wrapper, onCreated };
}

describe('useUsersCreateForm: создание учётки', () => {
    beforeEach(() => {
        apiFetcherMock.mockReset();
        resetNuxtStateStub();
    });

    it('в тело уходят пять полей, логин — в нижнем регистре', async () => {
        apiFetcherMock.mockResolvedValueOnce({ user: makeUser() });

        const { form, onCreated } = mountForm();

        form.username.value = 'Anna.Editor';
        form.displayName.value = '  Анна Ким  ';
        form.password.value = 'sixteen-char-pass';
        form.role.value = 'admin';
        form.isActive.value = false;
        await nextTick();

        await form.submitForm();

        expect(apiFetcherMock).toHaveBeenCalledWith(
            '/api/bricks/users',
            expect.objectContaining({
                method: 'POST',
                body: {
                    username: 'anna.editor',
                    password: 'sixteen-char-pass',
                    role: 'admin',
                    displayName: 'Анна Ким',
                    isActive: false,
                },
            })
        );
        expect(onCreated).toHaveBeenCalledWith(makeUser());
    });

    it('короткий пароль отклоняется до запроса', async () => {
        const { form } = mountForm();

        form.username.value = 'anna.editor';
        form.password.value = 'short';
        await nextTick();

        await form.submitForm();

        expect(apiFetcherMock).not.toHaveBeenCalled();
        expect(form.errors.value.password).toBeTruthy();
    });

    it('логин с недопустимым символом отклоняется до запроса', async () => {
        const { form } = mountForm();

        form.username.value = 'анна';
        form.password.value = 'sixteen-char-pass';
        await nextTick();

        await form.submitForm();

        expect(apiFetcherMock).not.toHaveBeenCalled();
        expect(form.errors.value.username).toBe('bricks.users.validation.usernameInvalid');
    });

    it('занятый логин показывается под полем, а не общим текстом', async () => {
        apiFetcherMock.mockRejectedValueOnce(
            Object.assign(new Error('HTTP 409'), {
                statusCode: 409,
                data: { code: 'USERNAME_TAKEN' },
            })
        );

        const { form, onCreated } = mountForm();

        form.username.value = 'anna.editor';
        form.password.value = 'sixteen-char-pass';
        await nextTick();

        await form.submitForm();
        await nextTick();

        expect(form.errors.value.username).toBe('bricks.users.errors.usernameTaken');
        expect(form.generalError.value).toBe('');
        expect(onCreated).not.toHaveBeenCalled();
    });

    it('генератор ставит пароль длиннее серверного минимума', async () => {
        const { form } = mountForm();

        form.generatePassword();

        expect(form.password.value.length).toBeGreaterThanOrEqual(16);
        expect(form.password.value).not.toMatch(/[\s'"\\/]/);
    });

    describe('обрыв по потолку ожидания', () => {
        it('учётка нашлась в перечитанном списке — создание состоялось', async () => {
            apiFetcherMock.mockRejectedValueOnce(
                Object.assign(new Error('timeout'), { name: 'TimeoutError' })
            );
            apiFetcherMock.mockResolvedValueOnce({ users: [makeUser()] });

            const { form, onCreated } = mountForm();

            form.username.value = 'Anna.Editor';
            form.password.value = 'sixteen-char-pass';
            await nextTick();

            await form.submitForm();

            expect(onCreated).toHaveBeenCalledWith(makeUser());
            expect(form.generalError.value).toBe('');
        });

        it('учётки в списке нет — форма остаётся с честным «результат неизвестен»', async () => {
            apiFetcherMock.mockRejectedValueOnce(
                Object.assign(new Error('timeout'), { name: 'TimeoutError' })
            );
            apiFetcherMock.mockResolvedValueOnce({ users: [] });

            const { form, onCreated } = mountForm();

            form.username.value = 'anna.editor';
            form.password.value = 'sixteen-char-pass';
            await nextTick();

            await form.submitForm();

            expect(onCreated).not.toHaveBeenCalled();
            expect(form.generalError.value).toBe('bricks.users.errors.createTimeout');
        });
    });
});
