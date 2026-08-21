/**
 * @vitest-environment happy-dom
 *
 * Проводка раздела медиатеки: полноэкранный просмотр, место параметров загрузки
 * и переключение разделов дашборда.
 *
 * Отдельно от `mediaSectionSurfaces.spec.ts`, где под тестом права и состояние
 * поверхности: там файл упёрся в потолок в 500 строк, а предметы разные.
 */

// #region Imports
// Vitest
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Types
import type { IMediaItem } from '../../src/runtime/modules/common/types/media';
import type { TBricksUserRole } from '../../src/runtime/modules/common/types/auth';

// Vue
import { computed, defineComponent, h, nextTick, ref } from 'vue';
import { mount } from '@vue/test-utils';
// #endregion

// #region Mocks
const { requestContext } = vi.hoisted(() => ({
    requestContext: { role: 'admin' as TBricksUserRole },
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
    useI18n: () => ({ t: (key: string) => key, locale: ref('ru') }),
}));
// #endregion

import BricksTooltipHint from '../../src/runtime/modules/ui/base/tooltip/BricksTooltipHint.vue';
import BuilderMediaGalleryPreviewLightbox from '../../src/runtime/modules/builder/media/components/BuilderMediaGalleryPreviewLightbox.vue';
import BuilderMediaGalleryUploadControls from '../../src/runtime/modules/builder/media/components/BuilderMediaGalleryUploadControls.vue';
import BuilderMediaGalleryUploadOptionsPopover from '../../src/runtime/modules/builder/media/components/BuilderMediaGalleryUploadOptionsPopover.vue';
import { usePublishDashboardSections } from '../../src/runtime/modules/builder/publish/composables/usePublishDashboardSections';
import { resetNuxtStateStub } from '../stubs/nuxt-imports';

// #region Helpers
/** Файл медиатеки для лайтбокса. */
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

/** Тултип кита, отрисованный целиком: активатор и подсказка сразу в разметке. */
const TooltipInlineStub = defineComponent({
    name: 'BricksTooltip',
    setup:
        (_, { slots }) =>
        () =>
            h('span', [slots.activator?.(), slots.default?.()]),
});
// #endregion

describe('Полноэкранный просмотр на дашборде', () => {
    beforeEach(() => {
        requestContext.role = 'admin';
        resetNuxtStateStub();
    });

    // На дашборде лайтбокс живёт сам по себе — Reka-диалога над ним нет, и
    // Escape наследовать не от кого. Через него открываются снимок страницы,
    // снимок шаблона и файл медиатеки
    it('Escape закрывает просмотр', async () => {
        const wrapper = mount(BuilderMediaGalleryPreviewLightbox, {
            props: { item: MEDIA_ITEM },
            global: {
                components: { BricksIcon: BricksIconStub },
                stubs: { BricksImage: true, BricksCloseButton: true },
            },
        });

        await wrapper.find('[role="dialog"]').trigger('keydown', { key: 'Escape' });

        expect(wrapper.emitted('close')).toHaveLength(1);
    });
});

describe('Параметры загрузки: одно место на поверхность', () => {
    beforeEach(() => {
        requestContext.role = 'admin';
        resetNuxtStateStub();
    });

    /**
     * Монтирует контролы загрузки.
     *
     * @param showOptions - Показывать ли шестерёнку параметров.
     * @returns Обёртка теста.
     */
    function mountControls(showOptions: boolean) {
        return mount(BuilderMediaGalleryUploadControls, {
            props: {
                maxImageSizeMb: 10,
                maxVideoSizeMb: 50,
                optimization: { format: 'webp', quality: 80, maxWidth: 1920 },
                configuredMaxWidth: 1920,
                uploadProgress: null,
                showOptions,
            },
            shallow: true,
        });
    }

    // В модалке шестерёнка стоит в шапке рядом с кнопкой, в разделе дашборда —
    // в строке фильтров, рядом с дорожкой категорий. Две сразу означали бы два
    // места правды о том, с какими параметрами уедет файл
    it('в шапке шестерёнка есть по умолчанию', () => {
        const wrapper = mountControls(true);

        expect(wrapper.findComponent(BuilderMediaGalleryUploadOptionsPopover).exists()).toBe(true);
    });

    it('с выключенным пропом шестерёнки в шапке нет', () => {
        const wrapper = mountControls(false);

        expect(wrapper.findComponent(BuilderMediaGalleryUploadOptionsPopover).exists()).toBe(false);
    });

    // Область приёмника у поверхностей разная: в модалке это окно, в разделе
    // дашборда только его тело. Общая подсказка обещала бы приём там, где его нет
    it('подсказка кнопки берёт область приёмника у вызывающего', () => {
        const wrapper = mount(BuilderMediaGalleryUploadControls, {
            props: {
                maxImageSizeMb: 10,
                maxVideoSizeMb: 50,
                optimization: { format: 'webp', quality: 80, maxWidth: 1920 },
                configuredMaxWidth: 1920,
                uploadProgress: null,
                dropHint: 'в эту область',
            },
            global: {
                components: { BricksIcon: BricksIconStub },
                stubs: {
                    BricksButton: true,
                    BuilderMediaGalleryUploadOptionsPopover: true,
                    // Настоящий тултип держит подсказку в портале и показывает её
                    // только по наведению — здесь под тестом текст, а не показ
                    BricksTooltip: TooltipInlineStub,
                },
            },
        });

        expect(wrapper.findComponent(BricksTooltipHint).props('text')).toContain('в эту область');
    });
});

describe('Разделы дашборда: вход в медиатеку', () => {
    beforeEach(() => {
        requestContext.role = 'admin';
        resetNuxtStateStub();
    });

    // Первое чтение списка идёт на старте дашборда и может не дойти: без
    // повтора при входе раздел показывал бы «медиатека пуста» до перезагрузки
    // страницы, то есть врал бы про состав
    it('вход в раздел досылает чтение списка, уход — сбрасывает сессию', async () => {
        const enters: number[] = [];
        const leaves: number[] = [];
        let sections: ReturnType<typeof usePublishDashboardSections> | null = null;

        mount(
            defineComponent({
                setup() {
                    sections = usePublishDashboardSections({
                        pagesSearchQuery: ref(''),
                        isUsersSectionVisible: computed(() => true),
                        onEnterMedia: () => enters.push(1),
                        onLeaveMedia: () => leaves.push(1),
                    });

                    return () => h('div');
                },
            })
        );

        if (!sections) {
            throw new Error('Композабл разделов не создался');
        }

        const surface: ReturnType<typeof usePublishDashboardSections> = sections;

        surface.selectSection('media');
        await nextTick();

        expect(enters).toHaveLength(1);

        surface.selectSection('pages');
        await nextTick();

        expect(leaves).toHaveLength(1);

        surface.selectSection('media');
        await nextTick();

        // Повторный вход читает снова: гард по снимку живёт в поверхности
        expect(enters).toHaveLength(2);
    });
});
