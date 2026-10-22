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
 *    ответить, а мог и отклонить её занятым логином. Разница с прежним поведением в
 *    том, что теперь исход есть чем узнать — у операции есть имя (ключ, который
 *    клиент прислал с первой же отправкой), и повтор той же отправки спрашивает про
 *    первую попытку, а не создаёт вторую учётку.
 * 4. Ключ живёт на одно НАМЕРЕНИЕ: повтор неизменённых значений уходит тем же
 *    ключом, правка любого поля и сброс формы выдают новый. Иначе сервер встретил бы
 *    один ключ с двумя разными телами — и обязан был бы отказать.
 * 5. Успех объявляет только ответ сервера — им же объявляется и повтор, которому
 *    сервер отдал результат первой операции.
 * 6. Сброс формы обесценивает прежнюю отправку целиком: окно закрывают и во время
 *    запроса, и её исход к новой, чистой форме уже не относится.
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

/**
 * Обрыв запроса по потолку ожидания — так его видит клиент ofetch.
 *
 * @returns Ошибка обрыва.
 */
function makeTimeoutError(): Error {
    return Object.assign(new Error('timeout'), { name: 'TimeoutError' });
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
        // Ровно то, ради чего заведён ключ операции: исход неизвестен, но узнать его
        // теперь есть чем — повтор той же отправки спрашивает про первую попытку.
        // Раньше ветка перечитывала список и говорила о наблюдаемом, потому что
        // связать строку со своим запросом было нечем
        it('форма просит повторить отправку, а не проверять список', async () => {
            apiFetcherMock.mockRejectedValueOnce(makeTimeoutError());

            const { form, onCreated } = mountForm();

            form.username.value = 'Anna.Editor';
            form.password.value = 'sixteen-char-pass';
            await nextTick();

            await form.submitForm();

            expect(onCreated).not.toHaveBeenCalled();
            expect(form.generalError.value).toBe('bricks.users.errors.createOutcomeUnknown');
            // Отправка не запечатана: повтор безопасен по построению
            expect(form.isSubmitting.value).toBe(false);
        });

        // Ключ живёт на одно НАМЕРЕНИЕ: повтор неизменённых значений обязан прийти
        // тем же ключом, иначе сервер примет его за второе создание
        it('повтор после обрыва уходит тем же ключом операции', async () => {
            apiFetcherMock.mockRejectedValueOnce(makeTimeoutError());
            apiFetcherMock.mockResolvedValueOnce({ user: makeUser() });

            const { form, onCreated } = mountForm();

            form.username.value = 'anna.editor';
            form.password.value = 'sixteen-char-pass';
            await nextTick();

            await form.submitForm();
            await form.submitForm();

            const keys = apiFetcherMock.mock.calls.map(
                ([, options]) =>
                    (options as { headers?: Record<string, string> } | undefined)?.headers?.[
                        'Idempotency-Key'
                    ]
            );

            expect(keys).toHaveLength(2);
            expect(keys[0]).toMatch(/^[0-9a-f]{32}$/);
            expect(keys[1]).toBe(keys[0]);
            // Ответ второй отправки — это результат ПЕРВОЙ операции: сервер отдаёт
            // созданную учётку, а не создаёт вторую
            expect(onCreated).toHaveBeenCalledTimes(1);
        });

        // Изменённые значения — другое намерение. Отправить их под прежним ключом
        // значило бы получить отказ «тот же ключ с другим телом», а при правке
        // одного пароля — учётку, созданную с ПЕРВЫМ паролем
        it('правка поля выдаёт новый ключ операции', async () => {
            apiFetcherMock.mockRejectedValueOnce(makeTimeoutError());
            apiFetcherMock.mockResolvedValueOnce({ user: makeUser() });

            const { form } = mountForm();

            form.username.value = 'anna.editor';
            form.password.value = 'sixteen-char-pass';
            await nextTick();

            await form.submitForm();

            form.password.value = 'another-sixteen-pass';
            await nextTick();

            await form.submitForm();

            const keys = apiFetcherMock.mock.calls.map(
                ([, options]) =>
                    (options as { headers?: Record<string, string> } | undefined)?.headers?.[
                        'Idempotency-Key'
                    ]
            );

            expect(keys[1]).not.toBe(keys[0]);
        });

        // «Сервер ещё считает» — не отказ и не успех: у операции есть имя, поэтому
        // ответ честно говорит подождать и спросить снова
        it('идущая первая попытка показывается своим текстом', async () => {
            apiFetcherMock.mockRejectedValueOnce(
                Object.assign(new Error('409'), {
                    statusCode: 409,
                    data: { data: { code: 'USER_CREATE_IN_PROGRESS' } },
                })
            );

            const { form, onCreated } = mountForm();

            form.username.value = 'anna.editor';
            form.password.value = 'sixteen-char-pass';
            await nextTick();

            await form.submitForm();

            expect(onCreated).not.toHaveBeenCalled();
            expect(form.generalError.value).toBe('bricks.users.errors.createInProgress');
        });

        // Окно закрывают и во время запроса — ни крестик, ни Esc этого не
        // запрещают, — а следующее открытие сбрасывает форму. Прежняя отправка к
        // ней уже не относится: без этого её обрыв показывал бы на чистой форме
        // ошибку о логине, которого человек больше не вводит
        it('обрыв прежней отправки не пишет в сброшенную форму', async () => {
            // Присваивается синхронно в моке ниже — до первого использования
            let breakFirstSubmit!: (error: Error) => void;

            apiFetcherMock.mockImplementationOnce(
                () =>
                    new Promise((_, reject) => {
                        breakFirstSubmit = reject;
                    })
            );

            const { form } = mountForm();

            form.username.value = 'anna.editor';
            form.password.value = 'sixteen-char-pass';
            await nextTick();

            const abandoned = form.submitForm();

            // Дождаться СТАРТА запроса обязательно: submitForm сперва проходит
            // валидацию, и сброс до её конца отменил бы отправку вовсе — кейс
            // проверял бы тогда пустую форму, а не брошенный запрос
            await vi.waitFor(() => expect(apiFetcherMock).toHaveBeenCalledTimes(1));

            // Модалку закрыли и открыли снова: форма чистая, отправка свободна
            form.resetToEmpty();

            // Прежний запрос обрывается уже после этого
            breakFirstSubmit(makeTimeoutError());
            await abandoned;

            expect(form.generalError.value).toBe('');
            expect(form.isSubmitting.value).toBe(false);
        });

        // Сброс формы — конец намерения: следующая учётка создаётся своим ключом,
        // иначе её отправка пришла бы под ключом прошлой и получила бы отказ
        it('сброс формы выдаёт новый ключ следующей отправке', async () => {
            apiFetcherMock.mockRejectedValueOnce(makeTimeoutError());
            apiFetcherMock.mockResolvedValueOnce({ user: makeUser() });

            const { form } = mountForm();

            form.username.value = 'anna.editor';
            form.password.value = 'sixteen-char-pass';
            await nextTick();

            await form.submitForm();

            form.resetToEmpty();
            form.username.value = 'anna.editor';
            form.password.value = 'sixteen-char-pass';
            await nextTick();

            await form.submitForm();

            const keys = apiFetcherMock.mock.calls.map(
                ([, options]) =>
                    (options as { headers?: Record<string, string> } | undefined)?.headers?.[
                        'Idempotency-Key'
                    ]
            );

            expect(keys[1]).not.toBe(keys[0]);
        });
    });
});
