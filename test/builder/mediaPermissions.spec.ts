/**
 * @vitest-environment happy-dom
 *
 * Права роли в медиатеке. Проверяются оба слоя, потому что они закрывают разные
 * пути: скрытые контролы — то, что видит человек, а проверки в обработчиках —
 * то, что остаётся достижимым программно (приёмник файлов на всю сетку, вход в
 * галерею из будущих мест).
 *
 * Границы ролей здесь неочевидны и разные: создание категории — запись
 * (`editor` и выше), удаление — только `admin`. Ошибка на одну ступень не видна
 * глазом, но у редактора превращает ряд управления в ряд отказов сервера.
 */

// #region Imports
// Vitest
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Types
import type { TBricksUserRole } from '../../src/runtime/modules/common/types/auth';

// Vue
import { defineComponent, effectScope, h } from 'vue';
import { mount, type VueWrapper } from '@vue/test-utils';
// #endregion

// #region Mocks
const { requestContext, categoriesStoreMock } = vi.hoisted(() => ({
    requestContext: { role: 'admin' as TBricksUserRole },
    categoriesStoreMock: {
        categories: [] as unknown[],
        createCategory: vi.fn(),
        deleteCategory: vi.fn(),
    },
}));

// Роль приходит из контекста запроса — так её ставит auth-middleware
// HTML-странице билдера (см. useBuilderPermissions)
vi.mock('#imports', async (importOriginal) => {
    const actual = await importOriginal<Record<string, unknown>>();

    return {
        ...actual,
        useRuntimeConfig: () => ({ public: { bricksAuthMode: 'database' } }),
        useRequestEvent: () => ({ context: { bricksUser: { role: requestContext.role } } }),
    };
});

vi.mock('vue-i18n', () => ({
    useI18n: () => ({
        t: (key: string, params?: Record<string, unknown>) => `${key}:${params?.name ?? ''}`,
    }),
}));

vi.mock('../../src/runtime/modules/builder/media/stores/mediaCategories', () => ({
    useMediaCategoriesStore: () => categoriesStoreMock,
}));
// #endregion

import BuilderMediaGalleryFilters from '../../src/runtime/modules/builder/media/components/BuilderMediaGalleryFilters.vue';
import { useMediaCategoryActions } from '../../src/runtime/modules/builder/media/composables/useMediaCategoryActions';
import { resetNuxtStateStub } from '../stubs/nuxt-imports';

// #region Helpers
/** BricksIcon приходит из auto-import Nuxt — вне приложения его нужно подменить. */
const BricksIconStub = defineComponent({
    name: 'BricksIcon',
    props: { icon: { type: String, default: '' } },
    setup: (props) => () => h('i', { 'data-icon': props.icon }),
});

/** Кнопка кита: тест ищет её по `aria-label`. */
const BricksButtonStub = defineComponent({
    name: 'BricksButton',
    props: { ariaLabel: { type: String, default: '' } },
    setup:
        (props, { slots }) =>
        () =>
            h('button', { 'aria-label': props.ariaLabel }, slots.default?.()),
});

/** Тултип кита рендерит активатор слотом — без него кнопки не попадут в DOM. */
const BricksTooltipStub = defineComponent({
    name: 'BricksTooltip',
    setup:
        (_, { slots }) =>
        () =>
            h('span', slots.activator?.()),
});

/**
 * Монтирует дорожку категорий под заданной ролью.
 *
 * @param role - Роль сессии.
 * @returns Обёртка компонента.
 */
function mountFilters(role: TBricksUserRole): VueWrapper {
    requestContext.role = role;

    return mount(BuilderMediaGalleryFilters, {
        props: {
            categoryFilter: 'all',
            // Непустой список: переключатель режима управления показывается
            // только когда есть что удалять
            categories: [{ id: 1, slug: 'promo', label: 'Промо', sortOrder: 1 }],
            categoryCounts: {},
            totalCount: 0,
            isCreatingCategory: false,
        },
        global: {
            components: { BricksIcon: BricksIconStub },
            stubs: {
                BricksButton: BricksButtonStub,
                BricksTooltip: BricksTooltipStub,
                BricksInput: true,
                BricksTooltipHint: true,
                BuilderMediaGalleryCategoryTabs: true,
            },
        },
    });
}

/**
 * Собирает `aria-label` кнопок дорожки.
 *
 * @param wrapper - Смонтированная дорожка.
 * @returns Метки видимых кнопок.
 */
function buttonLabels(wrapper: VueWrapper): string[] {
    return wrapper.findAll('button').map((button) => button.attributes('aria-label') ?? '');
}

/**
 * Выполняет создание и удаление категории под заданной ролью.
 *
 * @param role - Роль сессии.
 */
async function runCategoryActions(role: TBricksUserRole): Promise<void> {
    requestContext.role = role;

    const scope = effectScope();

    await scope.run(async () => {
        const actions = useMediaCategoryActions({
            resolveCategoryCount: () => 0,
            onCategoryDeleted: vi.fn(),
            onError: vi.fn(),
        });

        await actions.handleCreateCategory('Промо');
        actions.handleRequestCategoryDelete('promo');
        await actions.handleConfirmCategoryDelete();
    });

    scope.stop();
}
// #endregion

describe('медиатека: контролы по роли', () => {
    beforeEach(() => {
        resetNuxtStateStub();
        vi.clearAllMocks();
    });

    it('наблюдателю не показывает ни создание категории, ни режим управления', () => {
        expect(buttonLabels(mountFilters('viewer'))).toEqual([]);
    });

    it('редактору даёт создание, но не режим управления: крестики удаления — админские', () => {
        const labels = buttonLabels(mountFilters('editor'));

        expect(labels).toContain('bricks.media.categoryCreate:');
        expect(labels).not.toContain('bricks.media.categoryManage:');
    });

    it('администратору даёт и создание, и режим управления', () => {
        const labels = buttonLabels(mountFilters('admin'));

        expect(labels).toContain('bricks.media.categoryCreate:');
        expect(labels).toContain('bricks.media.categoryManage:');
    });
});

describe('медиатека: обработчики категорий по роли', () => {
    beforeEach(() => {
        resetNuxtStateStub();
        vi.clearAllMocks();
    });

    it('наблюдателя не пускает ни в создание, ни в удаление', async () => {
        await runCategoryActions('viewer');

        expect(categoriesStoreMock.createCategory).not.toHaveBeenCalled();
        expect(categoriesStoreMock.deleteCategory).not.toHaveBeenCalled();
    });

    it('редактору разрешает создание и отказывает в удалении', async () => {
        await runCategoryActions('editor');

        expect(categoriesStoreMock.createCategory).toHaveBeenCalledWith('Промо');
        expect(categoriesStoreMock.deleteCategory).not.toHaveBeenCalled();
    });

    it('администратору разрешает обе операции', async () => {
        await runCategoryActions('admin');

        expect(categoriesStoreMock.createCategory).toHaveBeenCalledWith('Промо');
        expect(categoriesStoreMock.deleteCategory).toHaveBeenCalledWith('promo');
    });
});
