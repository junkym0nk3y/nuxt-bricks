// #region Imports
// Vitest
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Vue
import { effectScope, reactive, ref } from 'vue';

// Types
import type { TPublishedPageSummary } from '../../src/runtime/modules/common/types/bricks-api';
import type { IUsePublishSchemaImportReturn } from '../../src/runtime/modules/builder/publish/types/composables';

// Helpers
import { buildTransferFile, createPageSummaryBuilder } from '../helpers/publishFixtures';
// #endregion

/**
 * Переопределения для устройств, которых в наборе страницы нет, остаются в схеме,
 * но CSS их не выбирает. Молчать об этом нельзя: раскладка разойдётся с той, что
 * была у источника файла, и для пользователя это выглядит как баг рендера.
 */

// #region Mocks
const { toasts, publishStoreMock, resolverMock } = vi.hoisted(() => ({
    toasts: [] as Array<{ message: string; variant: string }>,
    resolverMock: { startResolving: vi.fn(), handleCancel: vi.fn() },
    publishStoreMock: {
        pages: [] as TPublishedPageSummary[],
        patchPage: vi.fn(),
    },
}));

vi.mock('nuxt/app', () => ({
    // Набор устройств читается из runtimeConfig; пустой public даёт дефолтный
    // набор проекта — mobile/tablet/desktop
    useRuntimeConfig: () => ({ public: {} }),
}));

vi.mock('vue-i18n', () => ({
    useI18n: () => ({
        t: (key: string, params?: Record<string, unknown>) =>
            params ? `${key}:${JSON.stringify(params)}` : key,
    }),
}));

vi.mock('../../src/runtime/modules/builder/publish/stores/publish', () => ({
    usePublishStore: () => ({
        getPageById: (id: string | number) =>
            publishStoreMock.pages.find((page) => String(page.id) === String(id)),
        patchPage: publishStoreMock.patchPage,
    }),
}));

vi.mock('../../src/runtime/modules/builder/media/composables/useSchemaImageResolver', () => ({
    useSchemaImageResolver: () => ({
        isModalOpen: ref(false),
        state: reactive({ newImages: [], actions: new Map(), globalAction: 'keep' }),
        startResolving: resolverMock.startResolving,
        handleConfirm: vi.fn(),
        handleCancel: resolverMock.handleCancel,
        handleSkip: vi.fn(),
        setImageAction: vi.fn(),
        setGlobalAction: vi.fn(),
    }),
}));
// #endregion

import { usePublishSchemaImport } from '../../src/runtime/modules/builder/publish/composables/usePublishSchemaImport';

const buildPageSummary = createPageSummaryBuilder({ published: false });

/**
 * Проводит импорт файла в страницу до конца и возвращает показанные тосты.
 *
 * @param responsive - Переопределения блока по ключам устройств.
 * @param pageViewportConfig - Набор целевой страницы (`null` — набор проекта).
 * @returns Показанные пользователю тосты.
 */
async function runImport(
    responsive: Record<string, Record<string, unknown>>,
    pageViewportConfig: TPublishedPageSummary['viewportConfig'] = null
): Promise<Array<{ message: string; variant: string }>> {
    const page = buildPageSummary({
        id: 1,
        pagename: 'page-a',
        revision: 3,
        viewportConfig: pageViewportConfig,
    });
    publishStoreMock.pages = [page];

    const schema = {
        components: [
            {
                id: 'grid-1',
                type: 'layout' as const,
                componentName: 'grid',
                brickPath: '/layouts/grid',
                zIndex: 1,
                props: { responsive },
                children: [],
            },
        ],
    };

    // Файл про набор молчит: страница остаётся на своём, и сироты считаются
    // против него
    const file = buildTransferFile('own.json', { kind: 'legacy', schema, blocksCount: 1 });
    resolverMock.startResolving.mockResolvedValue({ schema, isComparisonSkipped: false });

    const scope = effectScope();
    const coordinator = scope.run(() =>
        usePublishSchemaImport({
            onNotify: (message, variant) => toasts.push({ message, variant }),
            isTargetSelected: () => true,
        })
    ) as IUsePublishSchemaImportReturn;

    coordinator.requestPageImport(page, file);
    coordinator.confirmReplace();
    await coordinator.handleConfirmationAfterLeave();
    scope.stop();

    return toasts;
}

describe('импорт схемы: ключи устройств вне набора страницы', () => {
    beforeEach(() => {
        toasts.length = 0;
        publishStoreMock.patchPage.mockReset();
        publishStoreMock.patchPage.mockResolvedValue(undefined);
        resolverMock.startResolving.mockReset();
    });

    it('называет ключи, которые не будут применяться', async () => {
        expect(await runImport({ watch: { columns: 1 } })).toEqual([
            {
                message: 'bricks.schema.importedWithOrphanDevices:{"keys":"watch"}',
                variant: 'error',
            },
        ]);
    });

    it('ключи набора страницы предупреждения не вызывают', async () => {
        expect(await runImport({ tablet: { columns: 2 } })).toEqual([
            { message: 'bricks.publish.toasts.schemaImported', variant: 'success' },
        ]);
    });

    it('ключ считается против набора СТРАНИЦЫ, а не проекта', async () => {
        // У страницы свой набор с ноутбуком: те же переопределения `laptop`
        // сиротами уже не являются
        const own = [
            { key: 'mobile', label: 'Мобильный', icon: 'device-mobile', width: 375, aside: 0.4 },
            { key: 'laptop', label: 'Ноутбук', icon: 'device-laptop', width: 1280, aside: 1.2 },
            { key: 'desktop', label: 'Десктоп', icon: 'device-desktop', width: 1600, aside: 2 },
        ];

        expect(await runImport({ laptop: { columns: 3 } }, own)).toEqual([
            { message: 'bricks.publish.toasts.schemaImported', variant: 'success' },
        ]);
    });
});

describe('импорт схемы: снимок подтверждения', () => {
    beforeEach(() => {
        toasts.length = 0;
        publishStoreMock.patchPage.mockReset();
        publishStoreMock.patchPage.mockResolvedValue(undefined);
        resolverMock.startResolving.mockReset();
    });

    it('новый выбранный файл не подменяет уже подтверждённую схему', async () => {
        const page = buildPageSummary({ id: 1, pagename: 'page-a', revision: 3 });
        const confirmedSchema = {
            components: [
                {
                    id: 'confirmed-grid',
                    type: 'layout' as const,
                    componentName: 'Grid',
                    brickPath: '/layouts/grid',
                    zIndex: 1,
                    props: {},
                    children: [],
                },
            ],
        };
        const pendingSchema = {
            components: [{ ...confirmedSchema.components[0], id: 'pending-grid' }],
        };
        const confirmedFile = buildTransferFile('confirmed.json', {
            schema: confirmedSchema,
            blocksCount: 1,
        });
        const pendingFile = buildTransferFile('pending.json', {
            schema: pendingSchema,
            blocksCount: 1,
        });
        publishStoreMock.pages = [page];
        resolverMock.startResolving.mockImplementation((schema) =>
            Promise.resolve({ schema, isComparisonSkipped: false })
        );

        const scope = effectScope();
        const coordinator = scope.run(() =>
            usePublishSchemaImport({
                onNotify: (message, variant) => toasts.push({ message, variant }),
                isTargetSelected: () => true,
            })
        ) as IUsePublishSchemaImportReturn;

        coordinator.requestPageImport(page, confirmedFile);
        coordinator.confirmReplace();
        coordinator.requestPageImport(page, pendingFile);
        await coordinator.handleConfirmationAfterLeave();

        expect(resolverMock.startResolving).toHaveBeenCalledWith(confirmedSchema);
        expect(publishStoreMock.patchPage).toHaveBeenCalledWith(1, {
            schema: confirmedSchema,
            viewportConfig: null,
            expectedRevision: 3,
        });

        scope.stop();
    });
});
