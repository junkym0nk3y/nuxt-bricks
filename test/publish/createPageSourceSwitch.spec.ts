/**
 * @vitest-environment happy-dom
 *
 * Источник содержимого новой страницы — ОДИН: шаблон, JSON-файл или пустой холст.
 *
 * Что здесь сторожится: смена источника обязана уносить всё, что принёс прежний.
 * Оформление шаблона (раскладка и фон) читается в форму при выборе и живёт в ней
 * до сабмита, поэтому файл, выбранный поверх шаблона, создавал бы страницу из
 * файла — но с раскладкой и фоном шаблона. Симметрично: шаблон поверх файла не
 * должен оставлять в форме прежнюю схему.
 */

// #region Imports
// Vitest
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Pinia
import { createPinia, setActivePinia } from 'pinia';

// Test utils
import { mount } from '@vue/test-utils';

// Types
import type { IBricksSchema } from '../../src/runtime/modules/common/types/brick';
// #endregion

// #region Mocks
const { routerMock, apiFetcherMock, readSelectedFileMock } = vi.hoisted(() => ({
    routerMock: { push: vi.fn(), replace: vi.fn(), resolve: () => ({ matched: [] }) },
    apiFetcherMock: vi.fn(),
    readSelectedFileMock: vi.fn(),
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
    useI18n: () => ({
        t: (key: string, params?: Record<string, unknown>) =>
            params ? `${key} ${JSON.stringify(params)}` : key,
    }),
}));

vi.mock('../../src/runtime/modules/common/composables/useApiClient', () => ({
    useApiClient: () => ({ apiFetcher: apiFetcherMock }),
}));

// Чтение файла подменяется целиком: настоящий `input[type=file]` в unit-среде не
// заполнить, а проверяется здесь не разбор файла, а вытеснение источника
vi.mock('../../src/runtime/modules/builder/publish/composables/useSchemaFileTransfer', () => ({
    useSchemaFileTransfer: () => ({
        fileInputRef: { value: null },
        openFilePicker: vi.fn(),
        readSelectedFile: readSelectedFileMock,
    }),
}));
// #endregion

import TheBuilderPublishCreatePageModal from '../../src/runtime/modules/builder/publish/components/TheBuilderPublishCreatePageModal.vue';

// #region Fixtures
/** Схема шаблона: один блок — отличима от файловой по числу блоков. */
const TEMPLATE_SCHEMA = {
    components: [
        {
            id: 'template-block',
            type: 'component',
            componentName: 'Text',
            brickPath: 'content/text',
            zIndex: 1,
            props: {},
        },
    ],
};

/** Схема файла: два блока. */
const FILE_SCHEMA = {
    components: [
        ...TEMPLATE_SCHEMA.components,
        {
            id: 'file-block',
            type: 'component',
            componentName: 'Text',
            brickPath: 'content/text',
            zIndex: 2,
            props: {},
        },
    ],
};

/** Набор устройств шаблона: приезжает вместе с содержимым при выборе. */
const TEMPLATE_DEVICES = [
    { key: 'mobile', label: 'Mobile', icon: 'device-mobile', width: 390, aside: 0 },
    { key: 'desktop', label: 'Desktop', icon: 'device-desktop', width: 1440, aside: 0 },
];

/** Набор, заданный человеком в группе «Устройства». */
const MANUAL_DEVICES = [
    { key: 'mobile', label: 'Mobile', icon: 'device-mobile', width: 375, aside: 0 },
    { key: 'desktop', label: 'Desktop', icon: 'device-desktop', width: 1280, aside: 0 },
];

/** Полный шаблон, который отдаёт point-lookup при выборе. */
const TEMPLATE_ROW = {
    id: 7,
    name: 'Лендинг',
    description: null,
    thumbnailUrl: null,
    schema: TEMPLATE_SCHEMA,
    pageMeta: {
        layout: 'landing',
        backgroundColor: '#101010',
        viewportConfig: TEMPLATE_DEVICES,
    },
    createdAt: '2026-08-19T10:00:00.000Z',
    updatedAt: '2026-08-19T10:00:00.000Z',
};

/**
 * Монтирует форму создания страницы с открытым окном.
 *
 * @returns Обёртка теста.
 */
function mountModal() {
    return mount(TheBuilderPublishCreatePageModal, {
        props: {
            isOpen: true,
            initialTemplate: null,
            resolveImportedSchema: (schema: IBricksSchema) => Promise.resolve(schema),
        },
        global: { stubs: { BricksIcon: true } },
    });
}
// #endregion

describe('форма создания страницы: смена источника содержимого', () => {
    beforeEach(() => {
        setActivePinia(createPinia());
        apiFetcherMock.mockReset();
        readSelectedFileMock.mockReset();
        // Список шаблонов для выбора и point-lookup содержимого
        apiFetcherMock.mockImplementation((url: string) =>
            url.endsWith('/templates')
                ? Promise.resolve({ templates: [{ id: 7, name: 'Лендинг', blocksCount: 1 }] })
                : Promise.resolve(TEMPLATE_ROW)
        );
    });

    it('файл, выбранный поверх шаблона, уносит и его оформление', async () => {
        const wrapper = mountModal();
        const vm = wrapper.vm as unknown as {
            handleTemplateSelect: (template: unknown) => Promise<void>;
            handleFileSelect: () => Promise<void>;
            source: string;
            selectedTemplate: unknown;
        };

        await vm.handleTemplateSelect({ id: 7, name: 'Лендинг', blocksCount: 1 });

        expect(vm.source).toBe('template');
        expect(vm.selectedTemplate).not.toBeNull();

        readSelectedFileMock.mockResolvedValueOnce({
            status: 'ok',
            file: { filename: 'page.json', schema: FILE_SCHEMA, blocksCount: 2 },
        });

        await vm.handleFileSelect();

        expect(vm.source).toBe('file');
        // Шаблон снят целиком: и подпись строки под карточками, и прочитанное
        // содержимое, из которого бралось оформление
        expect(vm.selectedTemplate).toBeNull();
        expect(wrapper.text()).not.toContain('Лендинг');
    });

    it('шаблон, выбранный поверх файла, уносит файл', async () => {
        const wrapper = mountModal();
        const vm = wrapper.vm as unknown as {
            handleTemplateSelect: (template: unknown) => Promise<void>;
            handleFileSelect: () => Promise<void>;
            source: string;
            selectedFile: unknown;
        };

        readSelectedFileMock.mockResolvedValueOnce({
            status: 'ok',
            file: { filename: 'page.json', schema: FILE_SCHEMA, blocksCount: 2 },
        });

        await vm.handleFileSelect();

        expect(vm.source).toBe('file');

        await vm.handleTemplateSelect({ id: 7, name: 'Лендинг', blocksCount: 1 });

        expect(vm.source).toBe('template');
        expect(vm.selectedFile).toBeNull();
    });

    it('битый файл поверх шаблона снимает шаблон и его набор устройств', async () => {
        // Иначе форма показывала бы строку шаблона, активной считала пустую
        // страницу и создала бы пустую схему со ступенями шаблона
        const wrapper = mountModal();
        const vm = wrapper.vm as unknown as {
            handleTemplateSelect: (template: unknown) => Promise<void>;
            handleFileSelect: () => Promise<void>;
            source: string;
            selectedTemplate: unknown;
            viewportConfig: unknown;
            fileError: string;
        };

        await vm.handleTemplateSelect({ id: 8, name: 'С устройствами', blocksCount: 1 });

        expect(vm.viewportConfig).toEqual(TEMPLATE_DEVICES);

        readSelectedFileMock.mockResolvedValueOnce({ status: 'error', message: 'битый JSON' });

        await vm.handleFileSelect();

        expect(vm.source).toBe('blank');
        expect(vm.selectedTemplate).toBeNull();
        expect(vm.viewportConfig).toBeNull();
        expect(vm.fileError).toBe('битый JSON');
    });

    it('ручную правку набора устройств смена источника не стирает', async () => {
        // Набор, принесённый источником, уходит вместе с ним; правку человека —
        // нет: её делали осознанно и после выбора источника
        const wrapper = mountModal();
        const vm = wrapper.vm as unknown as {
            handleTemplateSelect: (template: unknown) => Promise<void>;
            handleDevicesSave: (config: unknown) => void;
            handleSelectBlank: () => void;
            viewportConfig: unknown;
        };

        await vm.handleTemplateSelect({ id: 8, name: 'С устройствами', blocksCount: 1 });
        vm.handleDevicesSave(MANUAL_DEVICES);
        vm.handleSelectBlank();

        expect(vm.viewportConfig).toEqual(MANUAL_DEVICES);
    });

    it('возврат к пустой странице снимает оба источника', async () => {
        const wrapper = mountModal();
        const vm = wrapper.vm as unknown as {
            handleTemplateSelect: (template: unknown) => Promise<void>;
            handleSelectBlank: () => void;
            source: string;
            selectedTemplate: unknown;
            selectedFile: unknown;
        };

        await vm.handleTemplateSelect({ id: 7, name: 'Лендинг', blocksCount: 1 });
        vm.handleSelectBlank();

        expect(vm.source).toBe('blank');
        expect(vm.selectedTemplate).toBeNull();
        expect(vm.selectedFile).toBeNull();
    });
});
