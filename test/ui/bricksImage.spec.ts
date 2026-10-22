/**
 * @vitest-environment happy-dom
 *
 * DOM-окружение включено только для этого файла: серверный рендер проверяется
 * `renderToString`, а гонка предзагрузки — монтированием, которому нужен document.
 */

// #region Imports
// Vitest
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

// Vue
import { renderToString } from '@vue/server-renderer';
import { createSSRApp, h, nextTick } from 'vue';
import { mount } from '@vue/test-utils';

// Types
import type { IBricksImageProps } from '../../src/runtime/modules/ui/base/image/types';

// Components
import BricksImage from '../../src/runtime/modules/ui/base/image/BricksImage.vue';
// #endregion

const FULL = 'https://cdn.example.com/bricks-media/a.webp';
const PREVIEW = 'https://cdn.example.com/bricks-media/a-preview.webp';
const MOCK = 'https://cdn.example.com/bricks-media/a-mock.webp';

/**
 * Рендерит компонент на «сервере» — проверяется именно та разметка, которую
 * получает браузер до гидрации.
 *
 * @param props - Пропы компонента.
 * @returns HTML серверного рендера.
 */
function renderSsr(props: IBricksImageProps): Promise<string> {
    return renderToString(createSSRApp({ render: () => h(BricksImage, props) }));
}

describe('BricksImage: серверный рендер содержит картинку, а не пустой span', () => {
    it('режим off отдаёт полный файл сразу', async () => {
        const html = await renderSsr({ src: FULL, mode: 'off' });

        expect(html).toContain(FULL);
    });

    it('eager отдаёт полный файл с fetchpriority="high" — иначе LCP-подсказка бесполезна', async () => {
        const html = await renderSsr({
            src: FULL,
            previewSrc: PREVIEW,
            mode: 'two-step',
            eager: true,
        });

        expect(html).toContain(FULL);
        expect(html).toContain('fetchpriority="high"');
        expect(html).not.toContain(PREVIEW);
    });

    it('three-step отдаёт заглушку, но НЕ полный файл: иначе постепенной загрузки не остаётся', async () => {
        const html = await renderSsr({
            src: FULL,
            previewSrc: PREVIEW,
            mockSrc: MOCK,
            mode: 'three-step',
        });

        expect(html).toContain(MOCK);
        expect(html).not.toContain(FULL);
    });

    it('без вариантов постепенная загрузка не включается даже в progressive-режиме', async () => {
        const html = await renderSsr({ src: FULL, mode: 'three-step' });

        expect(html).toContain(FULL);
    });

    it('two-step при известных размерах не грузит превью до вьюпорта — место держит пропорция', async () => {
        // Иначе страница со сотней блоков скачивает сотню превью сразу и
        // экономия постепенной загрузки почти вся теряется
        const html = await renderSsr({
            src: FULL,
            previewSrc: PREVIEW,
            mode: 'two-step',
            naturalWidth: 1600,
            naturalHeight: 900,
        });

        expect(html).toContain('data:image/gif;base64,');
        expect(html).not.toContain(PREVIEW);
        expect(html).not.toContain(FULL);
        expect(html).toContain('aspect-ratio:1600 / 900');
    });

    it('без размеров превью остаётся в разметке: прыгающая раскладка хуже лишнего запроса', async () => {
        const html = await renderSsr({ src: FULL, previewSrc: PREVIEW, mode: 'two-step' });

        expect(html).toContain(PREVIEW);
        expect(html).not.toContain('aspect-ratio');
    });

    it('three-step с mock и без превью сохраняет этап, а не грузит полный файл', async () => {
        // Варианты строятся независимо: mock мог собраться, а превью — нет.
        // Проверка «нет превью» до ветки mock'а молча отключала бы этап
        const html = await renderSsr({ src: FULL, mockSrc: MOCK, mode: 'three-step' });

        expect(html).toContain(MOCK);
        expect(html).not.toContain(FULL);
    });

    it('нулевые размеры не включают прозрачный 1×1: держать место было бы нечем', async () => {
        const html = await renderSsr({
            src: FULL,
            previewSrc: PREVIEW,
            mode: 'two-step',
            naturalWidth: 0,
            naturalHeight: 0,
        });

        expect(html).toContain(PREVIEW);
        expect(html).not.toContain('data:image/gif;base64,');
    });

    it('отрицательные размеры не считаются известными: пропорция вышла бы невалидной', async () => {
        const html = await renderSsr({
            src: FULL,
            previewSrc: PREVIEW,
            mode: 'two-step',
            naturalWidth: -1,
            naturalHeight: 900,
        });

        expect(html).toContain(PREVIEW);
        expect(html).not.toContain('data:image/gif;base64,');
        expect(html).not.toContain('aspect-ratio');
    });

    it('подпись живёт на корне: слоёв в разметке может не быть, а имя нужно всегда', async () => {
        const html = await renderSsr({
            src: FULL,
            previewSrc: PREVIEW,
            mode: 'two-step',
            naturalWidth: 4,
            naturalHeight: 3,
            alt: 'Схема сборки',
        });

        expect(html).toContain('role="img"');
        expect(html).toContain('aria-label="Схема сборки"');
    });
});

describe('BricksImage: предзагрузка превью не переживает смену файла', () => {
    const realImage = globalThis.Image;
    let loaders: { src: string; fire: () => void }[] = [];

    beforeEach(() => {
        loaders = [];
        // Управляемый Image: загрузка завершается только по нашей команде
        class FakeImage {
            onload: (() => void) | null = null;
            onerror: (() => void) | null = null;
            #src = '';

            set src(value: string) {
                this.#src = value;
                loaders.push({ src: value, fire: () => this.onload?.() });
            }

            get src(): string {
                return this.#src;
            }
        }

        globalThis.Image = FakeImage as unknown as typeof globalThis.Image;
        // Наблюдение за вьюпортом в jsdom не срабатывает само — компонент
        // проверяется на пути «обсервера нет», где полный файл грузится сразу
        Reflect.deleteProperty(globalThis, 'IntersectionObserver');
    });

    afterEach(() => {
        globalThis.Image = realImage;
    });

    it('превью прошлого файла не подкладывается под новый', async () => {
        const wrapper = mount(BricksImage, {
            props: { src: FULL, previewSrc: PREVIEW, mockSrc: MOCK, mode: 'three-step' },
        });

        await nextTick();
        expect(wrapper.html()).toContain(MOCK);

        // Файл сменился, пока превью первого ещё грузилось
        await wrapper.setProps({
            src: 'https://cdn.example.com/bricks-media/b.webp',
            previewSrc: 'https://cdn.example.com/bricks-media/b-preview.webp',
            mockSrc: 'https://cdn.example.com/bricks-media/b-mock.webp',
        });
        await nextTick();

        const stale = loaders.find((loader) => loader.src === PREVIEW);
        stale?.fire();
        await nextTick();

        expect(wrapper.html()).not.toContain(PREVIEW);
        wrapper.unmount();
    });

    it('смена одних размеров при том же адресе пересматривает первый слой', async () => {
        // Иначе прозрачный 1×1 остаётся в разметке уже без пропорции — то есть
        // квадрат 1:1 на месте картинки до попадания во вьюпорт
        const wrapper = mount(BricksImage, {
            props: {
                src: FULL,
                previewSrc: PREVIEW,
                mode: 'two-step',
                naturalWidth: 1600,
                naturalHeight: 900,
            },
        });

        await nextTick();
        expect(wrapper.html()).toContain('data:image/gif;base64,');

        await wrapper.setProps({ naturalWidth: 0, naturalHeight: 0 });
        await nextTick();

        expect(wrapper.html()).toContain(PREVIEW);
        expect(wrapper.html()).not.toContain('data:image/gif;base64,');
        wrapper.unmount();
    });
});
