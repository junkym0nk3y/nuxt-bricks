/**
 * @vitest-environment happy-dom
 *
 * Права роли на программных путях галереи медиатеки — тех, что остаются
 * достижимыми при убранных кнопках: приёмник файлов ловит перетаскивание на всю
 * сетку, а панель метаданных шлёт свои события компоненту, а не серверу.
 * Скрытые контролы проверяются отдельно (test/builder/mediaPermissions.spec.ts);
 * здесь — что за ними стоит отказ, а не только отсутствие кнопки.
 *
 * Границы разные: загрузка и правка метаданных — запись (`editor` и выше),
 * удаление файла — только `admin`.
 */

// #region Imports
// Vitest
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Types
import type { IMediaItem } from '../../src/runtime/modules/common/types/media';
import type { IMediaUploadProgress } from '../../src/runtime/modules/builder/media/types/media';
import type { IMediaGalleryFileDropOptions } from '../../src/runtime/modules/builder/media/types/composables';
import type { TBricksUserRole } from '../../src/runtime/modules/common/types/auth';

// Vue
import { defineComponent, h, ref } from 'vue';
import { mount, type VueWrapper } from '@vue/test-utils';
// #endregion

// #region Mocks
const { requestContext, mediaStoreMock, categoriesStoreMock, uploadFilesMock, fileDropBridge } =
    vi.hoisted(() => ({
        requestContext: { role: 'admin' as TBricksUserRole },
        mediaStoreMock: {
            items: [] as unknown[],
            isUploading: false,
            loadItems: vi.fn(() => Promise.resolve()),
            updateItemMeta: vi.fn(() => Promise.resolve()),
            updateItemCategory: vi.fn(() => Promise.resolve()),
            removeItem: vi.fn(() => Promise.resolve()),
        },
        categoriesStoreMock: {
            categories: [] as unknown[],
            loadCategories: vi.fn(() => Promise.resolve()),
            createCategory: vi.fn(),
            deleteCategory: vi.fn(),
        },
        uploadFilesMock: vi.fn(() => Promise.resolve()),
        // Приёмник файлов подменён, чтобы дотянуться до его колбэка: именно он —
        // тот вход в загрузку, который остаётся у роли с убранными кнопками
        fileDropBridge: { onFiles: null as ((files: File[]) => void) | null },
    }));

vi.mock('#imports', async (importOriginal) => {
    const actual = await importOriginal<Record<string, unknown>>();

    return {
        ...actual,
        useRuntimeConfig: () => ({ public: { bricksAuthMode: 'database' } }),
        useRequestEvent: () => ({ context: { bricksUser: { role: requestContext.role } } }),
    };
});

vi.mock('vue-i18n', () => ({
    useI18n: () => ({ t: (key: string) => key }),
}));

vi.mock('../../src/runtime/modules/builder/media/stores/media', () => ({
    useMediaStore: () => mediaStoreMock,
}));

vi.mock('../../src/runtime/modules/builder/media/stores/mediaCategories', () => ({
    useMediaCategoriesStore: () => categoriesStoreMock,
}));

vi.mock('../../src/runtime/modules/builder/media/composables/useMediaUpload', () => ({
    useMediaUpload: () => ({
        maxImageSizeMb: 10,
        maxVideoSizeMb: 50,
        defaultOptimization: { format: 'webp', quality: 80, maxWidth: 1920 },
        uploadProgress: ref<IMediaUploadProgress | null>(null),
        uploadFiles: uploadFilesMock,
    }),
}));

vi.mock('../../src/runtime/modules/builder/media/composables/useMediaGalleryFileDrop', () => ({
    useMediaGalleryFileDrop: (options: IMediaGalleryFileDropOptions) => {
        fileDropBridge.onFiles = options.onFiles;

        return {
            draggedFileCount: ref(0),
            isDraggingFiles: ref(false),
            handleDragOver: vi.fn(),
            handleDragEnter: vi.fn(),
            handleDragLeave: vi.fn(),
            handleDrop: vi.fn(),
            resetFileDrop: vi.fn(),
        };
    },
}));
// #endregion

import TheBuilderMediaGalleryModal from '../../src/runtime/modules/builder/media/components/TheBuilderMediaGalleryModal.vue';
import { resetNuxtStateStub } from '../stubs/nuxt-imports';

// #region Helpers
/** Файл медиатеки, на котором проверяются правки метаданных и удаление. */
const MEDIA_ITEM: IMediaItem = {
    id: 42,
    url: 'https://storage.example.com/bricks-media/photo.webp',
    filename: 'photo.webp',
    alt: '',
    size: 2048,
    uploadedAt: '2026-08-01T10:00:00Z',
    mimeType: 'image/webp',
    category: null,
    svgContent: null,
    width: 800,
    height: 600,
    previewUrl: null,
    mockUrl: null,
};

/** BricksIcon приходит из auto-import Nuxt — вне приложения его нужно подменить. */
const BricksIconStub = defineComponent({
    name: 'BricksIcon',
    props: { icon: { type: String, default: '' } },
    setup: (props) => () => h('i', { 'data-icon': props.icon }),
});

/** Модалка кита рендерит содержимое слотом — без него внутренностей нет в DOM. */
const BricksModalStub = defineComponent({
    name: 'BricksModal',
    setup:
        (_, { slots }) =>
        () =>
            h('div', slots.default?.()),
});

/**
 * Монтирует галерею под заданной ролью.
 *
 * @param role - Роль сессии.
 * @returns Обёртка компонента.
 */
function mountGallery(role: TBricksUserRole): VueWrapper {
    requestContext.role = role;
    mediaStoreMock.items = [MEDIA_ITEM];

    return mount(TheBuilderMediaGalleryModal, {
        props: { visible: true, context: 'manager' },
        global: {
            components: { BricksIcon: BricksIconStub },
            stubs: {
                BricksModal: BricksModalStub,
                BricksButton: true,
                BricksCloseButton: true,
                BricksToast: true,
                BricksConfirmModal: true,
                BricksSearchInput: true,
                BuilderMediaGalleryFilters: true,
                BuilderMediaGalleryUploadControls: true,
                BuilderMediaGalleryDropOverlay: true,
                BuilderMediaGalleryGrid: true,
                BuilderMediaGalleryMetaPanel: true,
                BuilderMediaGalleryPreviewLightbox: true,
            },
        },
    });
}

/**
 * Выбирает файл в сетке — правки метаданных и удаление работают с выбранным.
 *
 * @param wrapper - Смонтированная галерея.
 */
async function selectItem(wrapper: VueWrapper): Promise<void> {
    wrapper.findComponent({ name: 'BuilderMediaGalleryGrid' }).vm.$emit('select', MEDIA_ITEM);
    await wrapper.vm.$nextTick();
}

/**
 * Прогоняет все программные пути записи: перетаскивание файла, правку
 * метаданных, смену категории и подтверждение удаления.
 *
 * @param role - Роль сессии.
 */
async function runGalleryWrites(role: TBricksUserRole): Promise<void> {
    const wrapper = mountGallery(role);
    await wrapper.vm.$nextTick();

    fileDropBridge.onFiles?.([new File(['x'], 'photo.webp', { type: 'image/webp' })]);

    await selectItem(wrapper);

    const metaPanel = wrapper.findComponent({ name: 'BuilderMediaGalleryMetaPanel' });
    metaPanel.vm.$emit('update-meta', { alt: 'Описание' });
    metaPanel.vm.$emit('update-category', 'promo');
    metaPanel.vm.$emit('remove');
    await wrapper.vm.$nextTick();

    // Первая из двух подтверждающих модалок — удаление файла (вторая удаляет
    // категорию и проверяется отдельной спекой)
    wrapper.findAllComponents({ name: 'BricksConfirmModal' })[0]?.vm.$emit('confirm');
    await wrapper.vm.$nextTick();

    wrapper.unmount();
}
// #endregion

describe('медиатека: программные пути записи по роли', () => {
    beforeEach(() => {
        resetNuxtStateStub();
        vi.clearAllMocks();
        fileDropBridge.onFiles = null;
    });

    it('наблюдателя не пускает никуда: ни загрузка, ни правка, ни удаление', async () => {
        await runGalleryWrites('viewer');

        expect(uploadFilesMock).not.toHaveBeenCalled();
        expect(mediaStoreMock.updateItemMeta).not.toHaveBeenCalled();
        expect(mediaStoreMock.updateItemCategory).not.toHaveBeenCalled();
        expect(mediaStoreMock.removeItem).not.toHaveBeenCalled();
    });

    it('редактору даёт загрузку и правку, но не удаление файла', async () => {
        await runGalleryWrites('editor');

        expect(uploadFilesMock).toHaveBeenCalled();
        expect(mediaStoreMock.updateItemMeta).toHaveBeenCalledWith(MEDIA_ITEM.id, {
            alt: 'Описание',
        });
        expect(mediaStoreMock.updateItemCategory).toHaveBeenCalledWith(MEDIA_ITEM.id, 'promo');
        expect(mediaStoreMock.removeItem).not.toHaveBeenCalled();
    });

    it('администратору разрешает и удаление', async () => {
        await runGalleryWrites('admin');

        expect(uploadFilesMock).toHaveBeenCalled();
        expect(mediaStoreMock.removeItem).toHaveBeenCalledWith(MEDIA_ITEM.id);
    });
});
