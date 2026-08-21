/**
 * @vitest-environment happy-dom
 *
 * Медиатека как раздел дашборда: что видно в рейле и шапке, и что стоит за
 * действиями поверхности, когда кнопок уже нет.
 *
 * Границы разные и обе проверяются от роли, а не от админа: сам раздел виден
 * всем (файлы — сведения), загрузка и правка метаданных начинаются с `editor`, а
 * удаление файла — только `admin`.
 */

// #region Imports
// Vitest
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Types
import type { IMediaItem } from '../../src/runtime/modules/common/types/media';
import type {
    IMediaUploadOptions,
    IMediaUploadProgress,
} from '../../src/runtime/modules/builder/media/types/media';
import type { TBricksUserRole } from '../../src/runtime/modules/common/types/auth';

// Vue
import { defineComponent, h, ref } from 'vue';
import { mount } from '@vue/test-utils';
// #endregion

// #region Mocks
const { requestContext, mediaStoreMock, uploadFilesMock, uploadBridge } = vi.hoisted(() => ({
    requestContext: { role: 'admin' as TBricksUserRole },
    mediaStoreMock: {
        items: [] as unknown[],
        isUploading: false,
        hasLoadedItemsSnapshot: false,
        loadItems: vi.fn(() => Promise.resolve()),
        updateItemMeta: vi.fn(() => Promise.resolve()),
        updateItemCategory: vi.fn(() => Promise.resolve()),
        removeItem: vi.fn(() => Promise.resolve()),
    },
    uploadFilesMock: vi.fn(() => Promise.resolve()),
    // Композабл загрузки подменён, чтобы дотянуться до `resolveCategory`: именно
    // он решает, в какую категорию лягут файлы, а вызывает его сама загрузка
    uploadBridge: { options: null as IMediaUploadOptions | null },
}));

vi.mock('#imports', async (importOriginal) => {
    const actual = await importOriginal<Record<string, unknown>>();

    return {
        ...actual,
        useRuntimeConfig: () => ({ public: { bricksAuthMode: 'database' } }),
        // Пользователь запроса полный: из него оболочка берёт и роль (права), и
        // профиль для аватара в углу — половинчатый контекст ронял бы монтаж на
        // подписи аватара, а не на проверяемом гейте
        useRequestEvent: () => ({
            context: {
                bricksUser: {
                    id: 1,
                    username: 'admin',
                    role: requestContext.role,
                    displayName: null,
                    avatarUrl: null,
                },
            },
        }),
    };
});

vi.mock('vue-i18n', () => ({
    useI18n: () => ({ t: (key: string) => key, locale: ref('ru') }),
}));

// Оболочка тянет меню профиля, а оно — клиент API: в тестах `$fetch` глобально
// не существует, и без мока падал бы сам монтаж, а не проверяемые гейты
vi.mock('../../src/runtime/modules/common/composables/useApiClient', () => ({
    useApiClient: () => ({ apiFetcher: vi.fn() }),
}));

vi.mock('../../src/runtime/modules/builder/media/stores/media', () => ({
    useMediaStore: () => mediaStoreMock,
}));

vi.mock('../../src/runtime/modules/builder/media/composables/useMediaUpload', () => ({
    useMediaUpload: (options: IMediaUploadOptions) => {
        uploadBridge.options = options;

        return {
            maxImageSizeMb: 10,
            maxVideoSizeMb: 50,
            defaultOptimization: { format: 'webp', quality: 80, maxWidth: 1920 },
            uploadProgress: ref<IMediaUploadProgress | null>(null),
            uploadFiles: uploadFilesMock,
        };
    },
}));
// #endregion

import BuilderPublishDashboardNav from '../../src/runtime/modules/builder/publish/components/BuilderPublishDashboardNav.vue';
import TheBuilderPublishDashboard from '../../src/runtime/modules/builder/publish/components/TheBuilderPublishDashboard.vue';
import { usePublishMediaSurface } from '../../src/runtime/modules/builder/publish/composables/usePublishMediaSurface';
import { resetNuxtStateStub } from '../stubs/nuxt-imports';

// #region Helpers
/** Файл медиатеки, на котором проверяются правки и удаление. */
const MEDIA_ITEM: IMediaItem = {
    id: 42,
    url: '/bricks-media/photo.webp',
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

/**
 * Монтирует рейл дашборда.
 *
 * @param props - Пропы, отличающиеся от дефолтных.
 * @returns Обёртка теста.
 */
function mountNav(props: Record<string, unknown> = {}) {
    return mount(BuilderPublishDashboardNav, {
        props: {
            activeSection: 'pages',
            pagesCount: 4,
            templatesCount: null,
            usersCount: null,
            mediaCount: null,
            isUsersSectionVisible: true,
            locale: 'ru',
            isDarkMode: false,
            ...props,
        },
        global: { components: { BricksIcon: BricksIconStub } },
    });
}

/**
 * Монтирует оболочку дашборда со слотами медиатеки.
 *
 * @param role - Роль сессии.
 * @returns Обёртка теста.
 */
function mountDashboard(role: TBricksUserRole) {
    requestContext.role = role;

    return mount(TheBuilderPublishDashboard, {
        props: {
            activeSection: 'media',
            searchQuery: '',
            pagesCount: 4,
            templatesCount: null,
            usersCount: null,
            mediaCount: 12,
            isUsersSectionVisible: true,
            isDarkMode: false,
        },
        slots: {
            list: () => h('div', { 'data-slot': 'list' }),
            media: () => h('div', { 'data-slot': 'media' }),
            mediaDetails: () => h('div', { 'data-slot': 'media-details' }),
            headerAction: () => h('div', { 'data-slot': 'header-action' }),
        },
        global: { components: { BricksIcon: BricksIconStub } },
    });
}

/**
 * Создаёт поверхность медиатеки внутри компонента: внутри `useI18n` и права
 * сессии, а им нужен setup-контекст.
 *
 * @param role - Роль сессии.
 * @returns Поверхность и собранные тосты.
 */
function createSurface(role: TBricksUserRole) {
    requestContext.role = role;

    const notifications: { message: string; variant: string }[] = [];
    let surface: ReturnType<typeof usePublishMediaSurface> | null = null;

    mount(
        defineComponent({
            setup() {
                surface = usePublishMediaSurface({
                    onNotify: (message, variant) => notifications.push({ message, variant }),
                });

                return () => h('div');
            },
        })
    );

    if (!surface) {
        throw new Error('Поверхность медиатеки не создалась');
    }

    return { surface: surface as ReturnType<typeof usePublishMediaSurface>, notifications };
}
// #endregion

describe('Медиатека в рейле дашборда', () => {
    beforeEach(() => {
        requestContext.role = 'admin';
        resetNuxtStateStub();
    });

    // Пункт перестал быть действием под `canEdit`: раздел показывает файлы, а
    // они — сведения. Право проверяется у загрузки и правки, а не у входа
    it('пункт есть и у роли без права правки', () => {
        requestContext.role = 'viewer';

        const wrapper = mountNav();

        expect(wrapper.text()).toContain('bricks.publish.dashboard.nav.media');
        expect(wrapper.find('[data-icon="ta:outline-photo-video"]').exists()).toBe(true);
    });

    it('счётчик файлов появляется только с прочитанным списком', () => {
        const unknownCount = mountNav({ mediaCount: null });
        const knownCount = mountNav({ mediaCount: 12 });

        expect(unknownCount.text()).not.toContain('12');
        expect(knownCount.text()).toContain('12');
    });

    it('выбор пункта уходит наверх разделом, а не отдельным событием', async () => {
        const wrapper = mountNav();
        const mediaButton = wrapper
            .findAll('button')
            .find((button) => button.text().includes('bricks.publish.dashboard.nav.media'));

        await mediaButton?.trigger('click');

        expect(wrapper.emitted('select-section')).toEqual([['media']]);
    });
});

describe('Оболочка дашборда в разделе медиатеки', () => {
    beforeEach(() => {
        requestContext.role = 'admin';
        resetNuxtStateStub();
    });

    it('рисует тело раздела и панель деталей, а не список страниц', () => {
        const wrapper = mountDashboard('admin');

        expect(wrapper.find('[data-slot="media"]').exists()).toBe(true);
        expect(wrapper.find('[data-slot="media-details"]').exists()).toBe(true);
        expect(wrapper.find('[data-slot="list"]').exists()).toBe(false);
    });

    // Контролы загрузки приносит хост слотом, но решение «показывать ли» — за
    // оболочкой: там же, где такое же решение про создание страницы и учётки.
    // Роли в разных тестах, а не в одном: право сессии кешируется в состоянии
    // Nuxt, и вторая монтировка в том же тесте читала бы роль первой
    it('слот первичного действия отдаётся редактору', () => {
        const wrapper = mountDashboard('editor');

        expect(wrapper.find('[data-slot="header-action"]').exists()).toBe(true);
    });

    it('наблюдателю слот первичного действия не отдаётся', () => {
        const wrapper = mountDashboard('viewer');

        expect(wrapper.find('[data-slot="header-action"]').exists()).toBe(false);
    });
});

describe('Поверхность медиатеки: что стоит за действиями', () => {
    beforeEach(() => {
        requestContext.role = 'admin';
        mediaStoreMock.items = [MEDIA_ITEM];
        mediaStoreMock.hasLoadedItemsSnapshot = false;
        vi.clearAllMocks();
        resetNuxtStateStub();
    });

    // Категорию загрузки задаёт дорожка раздела, а кнопка загрузки стоит в
    // шапке: без общего владельца файл лёг бы не в ту категорию, которую видно
    it('файлы грузятся в категорию, выбранную в дорожке', () => {
        const { surface } = createSurface('admin');

        expect(uploadBridge.options?.resolveCategory()).toBeNull();

        surface.categoryFilter.value = 'promo';

        expect(uploadBridge.options?.resolveCategory()).toBe('promo');
    });

    it('счётчик рейла молчит, пока список не прочитан', () => {
        const beforeSnapshot = createSurface('admin').surface;

        expect(beforeSnapshot.mediaCount.value).toBeNull();

        // Снимок объявляется до создания второй поверхности: стор здесь —
        // обычный объект, и computed на его мутацию не пересчитался бы
        mediaStoreMock.hasLoadedItemsSnapshot = true;

        expect(createSurface('admin').surface.mediaCount.value).toBe(1);
    });

    it('уход с раздела возвращает категорию, выбор и параметры загрузки к исходным', () => {
        const { surface } = createSurface('admin');

        surface.categoryFilter.value = 'promo';
        surface.selectItem(MEDIA_ITEM);
        surface.setOptimization({ format: 'original', quality: 60, maxWidth: 640 });
        surface.requestDelete();

        surface.resetSurface();

        expect(surface.categoryFilter.value).toBe('all');
        expect(surface.selectedItemId.value).toBeNull();
        expect(surface.isDeleteConfirmOpen.value).toBe(false);
        expect(surface.uploadOptimization.value).toEqual({
            format: 'webp',
            quality: 80,
            maxWidth: 1920,
        });
    });

    // Загрузка перетаскиванием остаётся достижимой у роли с убранной кнопкой:
    // приёмник накрывает всю сетку раздела
    it('наблюдатель не грузит файлы и не правит метаданные', async () => {
        const { surface } = createSurface('viewer');

        surface.selectItem(MEDIA_ITEM);
        await surface.uploadFiles([new File(['x'], 'photo.webp', { type: 'image/webp' })]);
        await surface.updateMeta({ filename: 'renamed.webp' });
        await surface.updateCategory('promo');

        expect(uploadFilesMock).not.toHaveBeenCalled();
        expect(mediaStoreMock.updateItemMeta).not.toHaveBeenCalled();
        expect(mediaStoreMock.updateItemCategory).not.toHaveBeenCalled();
    });

    it('редактор правит метаданные, но файл не удаляет', async () => {
        const { surface } = createSurface('editor');

        surface.selectItem(MEDIA_ITEM);
        await surface.updateMeta({ filename: 'renamed.webp' });
        await surface.confirmDelete();

        expect(mediaStoreMock.updateItemMeta).toHaveBeenCalledWith(42, {
            filename: 'renamed.webp',
        });
        expect(mediaStoreMock.removeItem).not.toHaveBeenCalled();
    });

    it('администратор удаляет файл и закрывает вместе с ним панель деталей', async () => {
        const { surface } = createSurface('admin');

        surface.selectItem(MEDIA_ITEM);
        surface.requestDelete();
        await surface.confirmDelete();

        expect(mediaStoreMock.removeItem).toHaveBeenCalledWith(42);
        expect(surface.selectedItemId.value).toBeNull();
        expect(surface.isDeleteConfirmOpen.value).toBe(false);
    });

    it('прочитанный список повторно не запрашивается', async () => {
        const { surface } = createSurface('admin');

        await surface.ensureMedia();

        expect(mediaStoreMock.loadItems).toHaveBeenCalledTimes(1);

        mediaStoreMock.hasLoadedItemsSnapshot = true;
        await surface.ensureMedia();

        expect(mediaStoreMock.loadItems).toHaveBeenCalledTimes(1);
    });
});
