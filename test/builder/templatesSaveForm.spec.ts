/**
 * @vitest-environment happy-dom
 *
 * Сохранение страницы как шаблона: что уезжает на сервер и как разбираются
 * отказы.
 *
 * Что здесь сторожится. Во-первых, состав запроса: в шаблон уходит содержимое и
 * оформление, а кадр страницы отправляется как ИСТОЧНИК копии — прописать
 * шаблону готовый URL клиент не может. Во-вторых, занятое имя: это единственный
 * отказ, относящийся к конкретному полю, и он обязан встать под поле, а не в
 * общий текст, — проверить занятость заранее нечем, список в браузере лишь копия.
 * В-третьих, созданный шаблон обязан попасть в список сразу ответом ручки: иначе
 * раздел показывал бы его только после следующего чтения.
 */

// #region Imports
// Vitest
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Vue
import { computed, defineComponent, h, nextTick, ref } from 'vue';

// Test utils
import { mount } from '@vue/test-utils';
// #endregion

// #region Mocks
const { apiFetcherMock } = vi.hoisted(() => ({
    apiFetcherMock: vi.fn(),
}));

vi.mock('../../src/runtime/modules/common/composables/useApiClient', () => ({
    useApiClient: () => ({ apiFetcher: apiFetcherMock }),
}));

vi.mock('vue-i18n', () => ({
    useI18n: () => ({ t: (key: string) => key }),
}));
// #endregion

import { resetNuxtStateStub } from '../stubs/nuxt-imports';
import type { ITemplateSaveSource } from '../../src/runtime/modules/builder/templates/types/templates';
import { useTemplateSaveForm } from '../../src/runtime/modules/builder/templates/composables/useTemplateSaveForm';
import { useTemplatesData } from '../../src/runtime/modules/builder/templates/composables/useTemplatesData';

// #region Fixtures
/** Схема источника: один блок — по нему считается число блоков сводки. */
const SCHEMA = {
    components: [
        {
            id: 'text-1',
            type: 'component' as const,
            componentName: 'Text',
            brickPath: 'content/text',
            zIndex: 1,
            props: {},
        },
    ],
};

/**
 * Источник шаблона — то, что собрал вызывающий (строка списка или билдер).
 *
 * @returns Источник содержимого.
 */
function buildSource(): ITemplateSaveSource {
    return {
        suggestedName: 'Главная',
        suggestedDescription: 'Герой и слайдер',
        schema: SCHEMA,
        pageMeta: { layout: 'default', backgroundColor: '#fff', viewportConfig: null },
        thumbnailSourceUrl: 'https://bucket.example/bricks-thumbnails/page-3-uuid.webp',
        pageLabel: 'Главная',
        pageAddressPath: '/glavnaya',
        blocksCount: 1,
        pageUpdatedAt: '2026-08-01T10:00:00.000Z',
    };
}

/**
 * Ответ ручки создания: полная строка шаблона.
 *
 * @param name - Имя созданного шаблона.
 * @returns Строка шаблона.
 */
function buildCreatedTemplate(name: string) {
    return {
        id: 12,
        name,
        description: 'Герой и слайдер',
        thumbnailUrl: 'https://bucket.example/bricks-thumbnails/template-uuid.webp',
        schema: SCHEMA,
        pageMeta: { layout: 'default', backgroundColor: '#fff', viewportConfig: null },
        createdAt: '2026-08-19T10:00:00.000Z',
        updatedAt: '2026-08-19T10:00:00.000Z',
    };
}

/**
 * Монтирует форму внутри компонента: vee-validate живёт в setup-контексте, и
 * вызванная снаружи форма не проводит валидацию полей (проверено — `errors`
 * остаётся пустым на заведомо коротком имени).
 *
 * @param initialSource - Источник содержимого; `null` — модалка без источника.
 * @returns Форма, обёртка и колбэк успеха.
 */
function mountForm(initialSource: ITemplateSaveSource | null = buildSource()) {
    const onSaved = vi.fn();
    const source = ref<ITemplateSaveSource | null>(initialSource);
    let form: ReturnType<typeof useTemplateSaveForm> | undefined;

    const wrapper = mount(
        defineComponent({
            setup() {
                form = useTemplateSaveForm({ source: computed(() => source.value), onSaved });
                form.resetForm();

                return () => h('div');
            },
        })
    );

    if (!form) {
        throw new Error('Форма не создана');
    }

    return { form, wrapper, onSaved, source };
}
// #endregion

describe('useTemplateSaveForm: сохранение шаблона', () => {
    beforeEach(() => {
        apiFetcherMock.mockReset();
        resetNuxtStateStub();
    });

    it('подставляет подпись источника и отправляет содержимое с кадром-источником', async () => {
        apiFetcherMock.mockResolvedValue(buildCreatedTemplate('Главная'));

        const { form, onSaved } = mountForm();

        expect(form.name.value).toBe('Главная');
        expect(form.description.value).toBe('Герой и слайдер');

        await form.submitForm();

        expect(apiFetcherMock).toHaveBeenCalledWith('/api/bricks/templates', {
            method: 'POST',
            body: {
                name: 'Главная',
                description: 'Герой и слайдер',
                schema: SCHEMA,
                pageMeta: { layout: 'default', backgroundColor: '#fff', viewportConfig: null },
                thumbnailSourceUrl: 'https://bucket.example/bricks-thumbnails/page-3-uuid.webp',
            },
            timeout: expect.any(Number),
        });
        expect(onSaved).toHaveBeenCalledTimes(1);
    });

    it('созданный шаблон встаёт в начало списка сводкой, а не полной строкой', async () => {
        // Начало списка — то место, где он окажется после следующего чтения
        // (сервер отдаёт список по дате создания вниз); полная строка держала бы
        // схему в состоянии приложения ради одной карточки
        apiFetcherMock.mockResolvedValue(buildCreatedTemplate('Главная'));

        const { form } = mountForm();
        const { templates } = useTemplatesData();

        await form.submitForm();

        expect(templates.value).toHaveLength(1);
        expect(templates.value[0]).toEqual(
            expect.objectContaining({ id: 12, name: 'Главная', blocksCount: 1 })
        );
        expect(templates.value[0]).not.toHaveProperty('schema');
    });

    it('занятое имя встаёт под поле, а не в общий текст ошибки', async () => {
        apiFetcherMock.mockRejectedValue({
            statusCode: 409,
            data: { code: 'TEMPLATE_NAME_CONFLICT' },
        });

        const { form, onSaved } = mountForm();

        await form.submitForm();

        expect(form.errors.value.name).toBe('bricks.templates.errors.nameTaken');
        expect(form.generalError.value).toBe('');
        expect(onSaved).not.toHaveBeenCalled();
    });

    it('короткое имя не уходит на сервер вовсе', async () => {
        const { form } = mountForm();

        form.name.value = 'ab';
        await nextTick();

        await form.submitForm();

        expect(apiFetcherMock).not.toHaveBeenCalled();
        expect(form.errors.value.name).toBe('bricks.templates.validation.nameTooShort');
    });

    it('имя из одних пробелов не отправляется: границы мерятся по обрезанному', async () => {
        // Форма отправляет обрезанное значение, и серверный валидатор мерит его
        // же — без trim в схеме «  ab  » прошёл бы клиентский минимум и вернулся
        // generic-отказом сервера вместо подсказки под полем
        const { form } = mountForm();

        form.name.value = '  ab  ';
        await nextTick();

        await form.submitForm();

        expect(apiFetcherMock).not.toHaveBeenCalled();
        expect(form.errors.value.name).toBe('bricks.templates.validation.nameTooShort');
    });

    it('отказ сервера объясняется по статусу и не закрывает форму', async () => {
        apiFetcherMock.mockRejectedValue({ statusCode: 403 });

        const { form, onSaved } = mountForm();

        await form.submitForm();

        expect(form.generalError.value).toBe('bricks.templates.errors.insufficientRole');
        expect(onSaved).not.toHaveBeenCalled();
    });

    it('обрыв по потолку ожидания: исход неизвестен, список перечитывается', async () => {
        // Сервер мог сохранить шаблон и не успеть ответить: «не получилось» было бы
        // неправдой, а вторая попытка упёрлась бы в имя, занятое ею же
        const timeoutError = new Error('Aborted by the waiting ceiling');
        timeoutError.name = 'TimeoutError';

        apiFetcherMock.mockRejectedValueOnce(timeoutError).mockResolvedValueOnce({ templates: [] });

        const { form, onSaved } = mountForm();

        await form.submitForm();

        expect(form.generalError.value).toBe('bricks.templates.errors.saveOutcomeUnknown');
        expect(apiFetcherMock).toHaveBeenCalledTimes(2);
        expect(apiFetcherMock.mock.calls[1]?.[0]).toBe('/api/bricks/templates');
        expect(onSaved).not.toHaveBeenCalled();
        expect(form.isSubmitting.value).toBe(false);
    });

    it('без источника форма не отправляется', async () => {
        // Модалку могли закрыть, пока читалась схема страницы: отправлять нечего
        const { form, onSaved } = mountForm(null);

        form.name.value = 'Лендинг продукта';
        await nextTick();

        await form.submitForm();

        expect(apiFetcherMock).not.toHaveBeenCalled();
        expect(onSaved).not.toHaveBeenCalled();
    });
});
