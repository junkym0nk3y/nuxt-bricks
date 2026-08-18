/**
 * @vitest-environment happy-dom
 *
 * Форма смены своего пароля: куда попадает отказ и что происходит после успеха.
 *
 * Два контракта, ради которых форма и написана именно так:
 *
 * 1. Неверный текущий пароль ручка отдаёт статусом 400 с кодом
 *    `INVALID_CURRENT_PASSWORD`, а не 401, — иначе клиентский интерцептор увёл бы
 *    человека с рабочей сессией на форму логина вместо подсказки под полем.
 *    Спека сторожит это со стороны клиента: подсказка появляется, а перехода нет.
 * 2. Успех рвёт ВСЕ сессии, включая текущую, и гасит cookie тем же ответом —
 *    поэтому форма сама уводит на вход полной перезагрузкой. Отдай это
 *    следующему попутному запросу, и человек остался бы в интерфейсе, который
 *    молча перестал работать.
 */

// #region Imports
// Vitest
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Vue
import { defineComponent, h } from 'vue';
import { mount, flushPromises } from '@vue/test-utils';
// #endregion

// #region Mocks
const { changeOwnPasswordMock, assignMock } = vi.hoisted(() => ({
    changeOwnPasswordMock: vi.fn(),
    assignMock: vi.fn(),
}));

vi.mock('../../src/runtime/modules/builder/auth/composables/useAuthProfile', () => ({
    useAuthProfile: () => ({ changeOwnPassword: changeOwnPasswordMock }),
}));

vi.mock('../../src/runtime/modules/builder/auth/composables/useAuthSession', () => ({
    useAuthSession: () => ({ isDatabaseMode: true }),
}));

vi.mock('../../src/runtime/modules/common/composables/useBricksRoutePaths', () => ({
    useBricksRoutePaths: () => ({
        builderLoginPath: '/bricks/bricks-login',
        withBase: (path: string) => `/app${path}`,
    }),
}));

vi.mock('vue-i18n', () => ({
    useI18n: () => ({
        t: (key: string, params?: Record<string, unknown>) =>
            params ? `${key}:${JSON.stringify(params)}` : key,
    }),
}));
// #endregion

import { BRICKS_API_ERROR_CODES } from '../../src/runtime/modules/common/constants/apiErrors';
import BuilderAuthProfilePasswordForm from '../../src/runtime/modules/builder/auth/components/BuilderAuthProfilePasswordForm.vue';

/**
 * Заглушка поля кита: сам `BricksInput` тянет vee-validate-правила, которые
 * регистрирует плагин приложения, и в тесте валидация внутри поля падала бы на
 * отсутствующем правиле `max`. Спека проверяет поведение ФОРМЫ — куда попадает
 * отказ и уводит ли она на вход, — поэтому поле здесь минимальное: значение
 * наружу и текст ошибки на экран.
 */
const BricksInputStub = defineComponent({
    name: 'BricksInput',
    props: {
        value: { type: String, default: '' },
        label: { type: String, default: '' },
        errorMessage: { type: String, default: '' },
    },
    emits: ['update:value'],
    setup:
        (props, { emit }) =>
        () =>
            h('label', [
                props.label,
                h('input', {
                    value: props.value,
                    onInput: (event: Event) =>
                        emit('update:value', (event.target as HTMLInputElement).value),
                }),
                props.errorMessage ? h('span', props.errorMessage) : null,
            ]),
});

/**
 * Монтирует форму.
 *
 * @returns Обёртка теста.
 */
function mountForm() {
    return mount(BuilderAuthProfilePasswordForm, {
        attachTo: document.body,
        global: { stubs: { BricksInput: BricksInputStub } },
    });
}

/**
 * Отправляет форму и дожидается конца обработки.
 *
 * Сабмит вызывается напрямую, а не через `trigger('submit')`: цепочка
 * vee-validate (валидация схемы + `nextTick`) не укладывается в микротаски, и
 * DOM-путь дорабатывает только через несколько миллисекунд реального таймера —
 * замерено: 1 мс не хватает, 5 мс хватает. Спека на подобранной задержке краснела
 * бы на загруженной машине, а обработчик возвращает собственный промис, и
 * ожидание его детерминировано.
 *
 * @param wrapper - Обёртка формы.
 */
async function submitForm(wrapper: ReturnType<typeof mountForm>): Promise<void> {
    await (wrapper.vm as unknown as { submitForm: () => Promise<void> }).submitForm();
    await flushPromises();
}

/**
 * Монтирует форму и заполняет оба поля.
 *
 * @returns Обёртка теста.
 */
async function mountFilledForm() {
    const wrapper = mountForm();
    const inputs = wrapper.findAll('input');

    await inputs[0].setValue('current-password');
    await inputs[1].setValue('new-password');
    await flushPromises();

    return wrapper;
}

describe('BuilderAuthProfilePasswordForm', () => {
    beforeEach(() => {
        changeOwnPasswordMock.mockReset();
        assignMock.mockReset();
        // happy-dom не даёт переопределить assign напрямую
        Object.defineProperty(window, 'location', {
            configurable: true,
            value: { assign: assignMock, pathname: '/app/bricks', search: '' },
        });
    });

    it('успех уводит на форму входа полной перезагрузкой', async () => {
        changeOwnPasswordMock.mockResolvedValueOnce(undefined);

        const wrapper = await mountFilledForm();

        await submitForm(wrapper);

        expect(changeOwnPasswordMock).toHaveBeenCalledWith('current-password', 'new-password');
        expect(assignMock).toHaveBeenCalledWith('/app/bricks/bricks-login');

        wrapper.unmount();
    });

    // Две формы одной ошибки: h3 отдаёт `data.code`, а ofetch кладёт тело ответа
    // в `error.data`, поэтому у клиента код лежит на уровень глубже. Разбор
    // поддерживает обе, и обе обязаны доехать до подсказки под полем — иначе
    // поломка клиентской ветки прошла бы мимо спеки
    it.each([
        ['серверная форма', { code: BRICKS_API_ERROR_CODES.invalidCurrentPassword }],
        [
            'клиентская форма ofetch',
            { data: { code: BRICKS_API_ERROR_CODES.invalidCurrentPassword } },
        ],
    ])(
        'неверный текущий пароль показывается под полем и никуда не уводит (%s)',
        async (_name, data) => {
            changeOwnPasswordMock.mockRejectedValueOnce({ statusCode: 400, data });

            const wrapper = await mountFilledForm();

            await submitForm(wrapper);

            expect(assignMock).not.toHaveBeenCalled();
            expect(wrapper.text()).toContain('bricks.auth.profile.errors.invalidCurrentPassword');

            wrapper.unmount();
        }
    );

    it('прочий отказ 400 объясняется общим текстом, а не подсказкой под полем', async () => {
        changeOwnPasswordMock.mockRejectedValueOnce({ statusCode: 400 });

        const wrapper = await mountFilledForm();

        await submitForm(wrapper);

        expect(wrapper.text()).toContain('bricks.auth.profile.errors.passwordRejected');
        expect(assignMock).not.toHaveBeenCalled();

        wrapper.unmount();
    });

    it('выключенная настройкой смена пароля объясняется отдельным текстом', async () => {
        changeOwnPasswordMock.mockRejectedValueOnce({
            statusCode: 403,
            data: { code: BRICKS_API_ERROR_CODES.passwordChangeDisabled },
        });

        const wrapper = await mountFilledForm();

        await submitForm(wrapper);

        expect(wrapper.text()).toContain('bricks.auth.profile.errors.passwordChangeDisabled');
        expect(assignMock).not.toHaveBeenCalled();

        wrapper.unmount();
    });

    it('короткий новый пароль не уходит на сервер: границы те же, что у ручки', async () => {
        const wrapper = mountForm();
        const inputs = wrapper.findAll('input');

        await inputs[0].setValue('current-password');
        await inputs[1].setValue('short');
        await flushPromises();

        await submitForm(wrapper);

        expect(changeOwnPasswordMock).not.toHaveBeenCalled();
        expect(wrapper.text()).toContain('bricks.auth.profile.validation.passwordTooShort');

        wrapper.unmount();
    });

    it('пустой текущий пароль не уходит на сервер', async () => {
        const wrapper = mountForm();
        const inputs = wrapper.findAll('input');

        await inputs[1].setValue('new-password');
        await flushPromises();

        await submitForm(wrapper);

        expect(changeOwnPasswordMock).not.toHaveBeenCalled();
        expect(wrapper.text()).toContain('bricks.auth.profile.validation.currentPasswordRequired');

        wrapper.unmount();
    });
});
