/**
 * @vitest-environment happy-dom
 *
 * Создание страницы из шаблона: что именно шаблон приносит новой странице.
 *
 * Шаблон — отпечаток содержимого И оформления: схема, раскладка, фон и набор
 * устройств. Проверяется здесь потому, что оформление легко потерять — оно не
 * редактируется формой и приезжает отдельным колбэком, а не полем; страница,
 * созданная с дефолтным фоном вместо шаблонного, выглядит как «шаблон применился
 * не полностью». Обратная половина правила не менее важна: адрес, SEO и статус
 * публикации задаёт сама форма, иначе две страницы из одного шаблона родились бы
 * с одинаковым адресом.
 */

// #region Imports
// Vitest
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Pinia
import { createPinia, setActivePinia } from 'pinia';

// Vue
import { defineComponent, h } from 'vue';

// Test utils
import { mount } from '@vue/test-utils';

// Types
import type { IBricksSchema } from '../../src/runtime/modules/common/types/brick';
import type { TBricksPageDeviceSet } from '../../src/runtime/modules/common/types/devices';
// #endregion

// #region Mocks
const { routerMock, apiFetcherMock } = vi.hoisted(() => ({
    routerMock: { push: vi.fn(), replace: vi.fn(), resolve: () => ({ matched: [] }) },
    apiFetcherMock: vi.fn(),
}));

vi.mock('#imports', async (importOriginal) => {
    const original = await importOriginal<Record<string, unknown>>();

    return {
        ...original,
        useRoute: () => ({ name: 'bricks-builder-pagename', params: {} }),
        useRouter: () => routerMock,
        useRuntimeConfig: () => ({ public: {} }),
    };
});

vi.mock('nuxt/app', () => ({
    useRuntimeConfig: () => ({ public: {} }),
}));

vi.mock('vue-i18n', () => ({
    useI18n: () => ({ t: (key: string) => key }),
}));

vi.mock('../../src/runtime/modules/common/composables/useApiClient', () => ({
    useApiClient: () => ({ apiFetcher: apiFetcherMock }),
}));
// #endregion

import { usePublishCreatePageForm } from '../../src/runtime/modules/builder/publish/composables/usePublishCreatePageForm';
import { usePublishStore } from '../../src/runtime/modules/builder/publish/stores/publish';

// #region Fixtures
/** Схема шаблона: один блок. */
const TEMPLATE_SCHEMA: IBricksSchema = {
    components: [
        {
            id: 'text-1',
            type: 'component',
            componentName: 'Text',
            brickPath: 'content/text',
            zIndex: 1,
            props: {},
        },
    ],
};

/** Набор устройств шаблона — тот, в котором собирали его страницу. */
const TEMPLATE_DEVICES: TBricksPageDeviceSet = [
    { key: 'mobile', label: 'Mobile', icon: 'device-mobile', width: 390, aside: 0 },
    { key: 'desktop', label: 'Desktop', icon: 'device-desktop', width: 1440, aside: 0 },
];

/**
 * Монтирует форму создания внутри компонента: vee-validate живёт в
 * setup-контексте.
 *
 * @param options - Колбэки источника содержимого и оформления.
 * @returns Форма и колбэк успешного создания.
 */
function mountCreateForm(options: {
    schema: IBricksSchema;
    viewportConfig?: TBricksPageDeviceSet | null;
    appearance?: { layout: string | null; backgroundColor: string | null } | null;
}) {
    const onCreated = vi.fn();
    let form: ReturnType<typeof usePublishCreatePageForm> | undefined;

    mount(
        defineComponent({
            setup() {
                form = usePublishCreatePageForm({
                    onCreated,
                    resolveSchema: () => Promise.resolve(options.schema),
                    resolveViewportConfig: () => options.viewportConfig ?? null,
                    resolveAppearance: () => options.appearance ?? null,
                });

                return () => h('div');
            },
        })
    );

    if (!form) {
        throw new Error('Форма не создана');
    }

    return { form, onCreated };
}
// #endregion

describe('создание страницы из шаблона', () => {
    beforeEach(() => {
        setActivePinia(createPinia());
        apiFetcherMock.mockReset();
        apiFetcherMock.mockResolvedValue({ id: 42, pagename: 'promo', revision: 1 });
    });

    it('уносит в страницу схему, набор устройств, раскладку и фон шаблона', async () => {
        const store = usePublishStore();
        const createPage = vi.spyOn(store, 'createPage').mockResolvedValue(42);
        const { form, onCreated } = mountCreateForm({
            schema: TEMPLATE_SCHEMA,
            viewportConfig: TEMPLATE_DEVICES,
            appearance: { layout: 'landing', backgroundColor: '#101010' },
        });

        form.title.value = 'Акция';
        form.setPagename('promo-black-friday');
        // Описание обязательно общей схемой формы: без него сабмит не доходит до
        // записи вовсе
        form.description.value = 'Промо-страница «Чёрная пятница»';

        await form.submitForm();

        expect(createPage).toHaveBeenCalledTimes(1);
        expect(createPage.mock.calls[0][0]).toEqual(TEMPLATE_SCHEMA);
        expect(createPage.mock.calls[0][1]).toEqual(
            expect.objectContaining({
                pagename: 'promo-black-friday',
                title: 'Акция',
                layout: 'landing',
                backgroundColor: '#101010',
                viewportConfig: TEMPLATE_DEVICES,
            })
        );
        expect(onCreated).toHaveBeenCalledWith({ pagename: 'promo-black-friday', urlPrefix: null });
    });

    it('шаблон без оформления оставляет дефолты проекта, а не пишет пустые значения', async () => {
        // Страница-источник могла не задавать ни раскладку, ни фон: пустое значение
        // обязано оставить дефолт, иначе страница родилась бы без layout вовсе
        const store = usePublishStore();
        const createPage = vi.spyOn(store, 'createPage').mockResolvedValue(43);
        const { form } = mountCreateForm({
            schema: TEMPLATE_SCHEMA,
            appearance: { layout: null, backgroundColor: null },
        });

        form.title.value = 'Контакты';
        form.setPagename('contacts');
        form.description.value = 'Карта, форма и реквизиты компании';

        await form.submitForm();

        const formState = createPage.mock.calls[0][1];

        expect(formState.layout).toBeTruthy();
        expect(formState.backgroundColor).toBeTruthy();
        expect(formState.viewportConfig).toBeNull();
    });

    it('адрес, SEO и публикация остаются за формой, а не за шаблоном', async () => {
        // Иначе две страницы из одного шаблона получили бы один адрес — то есть
        // отказ уникального индекса
        const store = usePublishStore();
        const createPage = vi.spyOn(store, 'createPage').mockResolvedValue(44);
        const { form } = mountCreateForm({
            schema: TEMPLATE_SCHEMA,
            appearance: { layout: 'landing', backgroundColor: '#101010' },
        });

        form.title.value = 'Промо';
        form.setPagename('promo-2');
        form.description.value = 'Своё описание страницы';
        form.urlPrefix.value = 'blog';

        await form.submitForm();

        expect(createPage.mock.calls[0][1]).toEqual(
            expect.objectContaining({
                pagename: 'promo-2',
                urlPrefix: 'blog',
                description: 'Своё описание страницы',
                published: false,
            })
        );
    });
});
