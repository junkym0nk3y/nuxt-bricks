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
 *    ответить, а мог и отклонить её занятым логином, и обработчик его вообще не
 *    обязан был остановиться. Поэтому список перечитывается — но только чтобы
 *    сказать человеку, что видно, а не чтобы объявить исход.
 * 4. Успех объявляет ТОЛЬКО ответ POST. Найденная после обрыва строка успеха не
 *    доказывает: список мог отстать от базы задолго до отправки, и тогда чужая
 *    учётка выглядела бы новой — форма закрылась бы тостом успеха о посторонней
 *    записи, с её ролью и без заданного здесь пароля. Поэтому ветка обрыва только
 *    сообщает наблюдаемое состояние, различая три исхода: строка видна, строки не
 *    видно, список перечитать не удалось.
 * 5. После обрыва отправка закрыта до сброса формы: текст просит не повторять, а
 *    просьба без запрета ничего не стоит — обработчик на сервере клиентским
 *    потолком не останавливается, и повтор упёрся бы в логин, занятый первой же
 *    отправкой.
 * 6. Сброс формы обесценивает прежнюю отправку целиком: окно закрывают и во
 *    время запроса, и его исход к новой, чистой форме уже не относится.
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
import { useUsersData } from '../../src/runtime/modules/builder/users/composables/useUsersData';
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
 * Приводит список раздела в `ready` с заданными учётками.
 *
 * Нужен там, где кейс различает исходы ПО СПИСКУ: без посева состояние остаётся
 * непрочитанным, и ветка ушла бы в «список перечитать не удалось» независимо от
 * того, что вернул GET.
 *
 * @param users - Учётки списка до отправки формы.
 */
async function seedReadyList(users: IBricksUserSummary[]): Promise<void> {
    apiFetcherMock.mockResolvedValueOnce({ users });

    const { ensureUsers, status } = useUsersData();

    await ensureUsers();

    if (status.value !== 'ready') {
        throw new Error('Список не пришёл в ready — посев состояния не удался');
    }
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
        // Ветка обрыва не различает «создал я» и «создал кто-то другой», поэтому
        // не различает и успех: чужую строку она объявила бы созданной здесь
        it('строка видна в списке — успех всё равно не объявляется', async () => {
            await seedReadyList([]);
            apiFetcherMock.mockRejectedValueOnce(makeTimeoutError());
            apiFetcherMock.mockResolvedValueOnce({
                users: [makeUser({ createdAt: '2026-04-02T09:00:00.000Z' })],
            });

            const { form, onCreated } = mountForm();

            form.username.value = 'Anna.Editor';
            form.password.value = 'sixteen-char-pass';
            await nextTick();

            await form.submitForm();

            expect(onCreated).not.toHaveBeenCalled();
            expect(form.generalError.value).toBe('bricks.users.errors.createOutcomeUnknown');
        });

        // Серверный обработчик клиентским потолком не останавливается: «не видно»
        // означает «пока не видно», и текст обязан отличаться от «учётки нет»
        it('строки пока не видно — исход остаётся незавершённым', async () => {
            await seedReadyList([]);
            apiFetcherMock.mockRejectedValueOnce(makeTimeoutError());
            apiFetcherMock.mockResolvedValueOnce({ users: [] });

            const { form, onCreated } = mountForm();

            form.username.value = 'anna.editor';
            form.password.value = 'sixteen-char-pass';
            await nextTick();

            await form.submitForm();

            expect(onCreated).not.toHaveBeenCalled();
            expect(form.generalError.value).toBe('bricks.users.errors.createStillProcessing');
        });

        // Перечитывание отказ не бросает по построению: упавший GET оставляет
        // прежний кеш, и говорить по нему о списке нельзя вовсе
        it('перечитывание списка упало — о списке не говорится ничего', async () => {
            await seedReadyList([makeUser({ id: 9, username: 'ivan.admin' })]);
            apiFetcherMock.mockRejectedValueOnce(makeTimeoutError());
            apiFetcherMock.mockRejectedValueOnce(new Error('network down'));

            const { form, onCreated } = mountForm();

            form.username.value = 'anna.editor';
            form.password.value = 'sixteen-char-pass';
            await nextTick();

            await form.submitForm();

            expect(onCreated).not.toHaveBeenCalled();
            expect(form.generalError.value).toBe('bricks.users.errors.createReconcileFailed');
        });

        // Просьба «не отправляйте форму повторно» обязана быть подкреплена:
        // серверный обработчик потолком клиента не останавливается, и повтор
        // запустил бы второй scrypt, чтобы упереться в занятый первой отправкой
        // логин. Сброс формы признак снимает — другую учётку создают из чистой
        it('повторная отправка после обрыва до сброса формы на сервер не уходит', async () => {
            await seedReadyList([]);
            apiFetcherMock.mockRejectedValueOnce(makeTimeoutError());
            apiFetcherMock.mockResolvedValueOnce({ users: [] });

            const { form } = mountForm();

            form.username.value = 'anna.editor';
            form.password.value = 'sixteen-char-pass';
            await nextTick();

            await form.submitForm();

            const callsAfterTimeout = apiFetcherMock.mock.calls.length;

            await form.submitForm();

            expect(apiFetcherMock.mock.calls.length).toBe(callsAfterTimeout);

            form.resetToEmpty();
            form.username.value = 'anna.editor';
            form.password.value = 'sixteen-char-pass';
            await nextTick();
            apiFetcherMock.mockResolvedValueOnce({ users: [makeUser()] });

            await form.submitForm();

            expect(apiFetcherMock.mock.calls.length).toBe(callsAfterTimeout + 1);
        });

        // Окно закрывают и во время запроса — ни крестик, ни Esc этого не
        // запрещают, — а следующее открытие сбрасывает форму. Прежняя отправка к
        // ней уже не относится: без этого её обрыв запечатывал бы чистую форму и
        // показывал ошибку о логине, которого человек больше не вводит
        it('обрыв прежней отправки не запечатывает сброшенную форму', async () => {
            await seedReadyList([]);

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
            await vi.waitFor(() => expect(apiFetcherMock).toHaveBeenCalledTimes(2));

            // Модалку закрыли и открыли снова: форма чистая, отправка свободна
            form.resetToEmpty();

            // Прежний запрос обрывается уже после этого
            apiFetcherMock.mockResolvedValueOnce({ users: [] });
            breakFirstSubmit(makeTimeoutError());
            await abandoned;

            expect(form.generalError.value).toBe('');
            expect(form.isSubmitSealed.value).toBe(false);
            expect(form.isSubmitting.value).toBe(false);
        });
    });
});
