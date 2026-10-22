// #region Imports
// Vitest
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Pinia
import { createPinia, setActivePinia } from 'pinia';

// Types
import type { IBricksSchema } from '../../src/runtime/modules/common/types/brick';
// #endregion

/**
 * Выбранное действие копилось присваиванием `state.actions[url] = …`,
 * а ключ — URL картинки из схемы. У `<img src="__proto__">` присваивание уходило
 * в сеттер прототипа (для строкового значения — молчаливый no-op), чтение
 * возвращало `Object.prototype`: значение истинное, но не равное `'placeholder'`,
 * так что замена на плейсхолдер для этой картинки игнорировалась.
 */

// #region Mocks
const { mediaStoreMock } = vi.hoisted(() => ({
    mediaStoreMock: {
        items: [] as Array<{ url: string }>,
        // Виден ли весь состав медиатеки. Тесты выставляют его явно: от него
        // зависит, доверяет ли резолвер списку — и открывает ли модалку вообще
        hasLoadedItemsSnapshot: true,
        loadItems: vi.fn(),
    },
}));

vi.mock('../../src/runtime/modules/builder/media/stores/media', () => ({
    useMediaStore: () => mediaStoreMock,
}));

vi.mock('../../src/runtime/modules/common/composables/useBricksAssetUrl', () => ({
    useBricksAssetUrl: () => ({
        baseURL: '/',
        resolveAssetUrl: (assetPath: string) => `/_bricks/${assetPath}`,
    }),
}));
// #endregion

import { useSchemaImageResolver } from '../../src/runtime/modules/builder/media/composables/useSchemaImageResolver';

const PLACEHOLDER_URL = '/_bricks/images/brick-empty.webp';

/**
 * Собирает схему с одним компонентом и заданными пропсами.
 *
 * @param props - Пропсы компонента схемы.
 * @returns Схема для фикстуры.
 */
function makeSchema(props: Record<string, unknown>): IBricksSchema {
    return {
        components: [
            {
                id: 'c1',
                type: 'component',
                componentName: 'TestBrick',
                brickPath: 'bricks/TestBrick.brick.ts',
                zIndex: 1,
                props,
            },
        ],
    };
}

/**
 * Достаёт пропсы первого компонента резолвленной схемы.
 *
 * @param schema - Схема, вернувшаяся из резолвера.
 * @returns Пропсы компонента.
 */
function firstProps(schema: IBricksSchema | null): Record<string, unknown> {
    expect(schema).not.toBeNull();
    return (schema as IBricksSchema).components[0].props;
}

/**
 * Даёт `startResolving` дойти до открытия модалки: композабл ждёт загрузку
 * галереи, поэтому состояние заполняется на следующем тике, а не синхронно.
 */
function flushMicrotasks(): Promise<void> {
    return new Promise((resolve) => {
        setTimeout(resolve, 0);
    });
}

describe('useSchemaImageResolver: URL картинки как ключ выбранного действия', () => {
    beforeEach(() => {
        setActivePinia(createPinia());
        mediaStoreMock.items.length = 0;
        mediaStoreMock.hasLoadedItemsSnapshot = true;
        mediaStoreMock.loadItems = vi.fn();
    });

    it('замена на плейсхолдер срабатывает для src="__proto__"', async () => {
        const resolver = useSchemaImageResolver();
        const pending = resolver.startResolving(
            makeSchema({ content: '<img src="__proto__"><img src="/photo.webp">' })
        );
        await flushMicrotasks();

        expect(resolver.isModalOpen.value).toBe(true);
        expect([...resolver.state.actions.keys()]).toEqual(['__proto__', '/photo.webp']);

        resolver.setImageAction('__proto__', 'placeholder');
        expect(resolver.state.actions.get('__proto__')).toBe('placeholder');

        resolver.handleConfirm();

        expect(firstProps((await pending).schema).content).toBe(
            `<img src="${PLACEHOLDER_URL}"><img src="/photo.webp">`
        );
    });

    it('глобальное действие накрывает src="__proto__" вместе с остальными', async () => {
        const resolver = useSchemaImageResolver();
        const pending = resolver.startResolving(
            makeSchema({ content: '<img src="__proto__"><img src="/photo.webp">' })
        );
        await flushMicrotasks();

        resolver.setGlobalAction('placeholder');
        resolver.handleConfirm();

        expect(firstProps((await pending).schema).content).toBe(
            `<img src="${PLACEHOLDER_URL}"><img src="${PLACEHOLDER_URL}">`
        );
    });

    it('действие по умолчанию оставляет URL нетронутым', async () => {
        const resolver = useSchemaImageResolver();
        const pending = resolver.startResolving(makeSchema({ content: '<img src="__proto__">' }));
        await flushMicrotasks();

        resolver.handleConfirm();

        expect(firstProps((await pending).schema).content).toBe('<img src="__proto__">');
    });

    it('состояние сбрасывается между импортами', async () => {
        const resolver = useSchemaImageResolver();
        const first = resolver.startResolving(makeSchema({ content: '<img src="__proto__">' }));
        await flushMicrotasks();
        resolver.setImageAction('__proto__', 'placeholder');
        resolver.handleConfirm();
        await first;

        expect(resolver.state.actions.size).toBe(0);

        const second = resolver.startResolving(makeSchema({ content: '<img src="__proto__">' }));
        await flushMicrotasks();
        expect(resolver.state.actions.get('__proto__')).toBe('keep');

        resolver.handleConfirm();
        expect(firstProps((await second).schema).content).toBe('<img src="__proto__">');
    });
});

describe('useSchemaImageResolver: сравнение с медиатекой', () => {
    beforeEach(() => {
        setActivePinia(createPinia());
        mediaStoreMock.items.length = 0;
        mediaStoreMock.hasLoadedItemsSnapshot = true;
        mediaStoreMock.loadItems = vi.fn();
    });

    it('недоступная медиатека не выдаёт известные URL за новые', async () => {
        // В списке лежит локально добавленный файл (загрузка кладёт его до
        // всякого GET'а), но состав медиатеки целиком не известен
        mediaStoreMock.items.push({ url: '/known.webp' });
        mediaStoreMock.hasLoadedItemsSnapshot = false;
        mediaStoreMock.loadItems = vi.fn(() => Promise.reject(new Error('media is down')));

        const resolver = useSchemaImageResolver();
        const result = await resolver.startResolving(
            makeSchema({ content: '<img src="/known.webp"><img src="/fresh.webp">' })
        );

        expect(resolver.isModalOpen.value).toBe(false);
        expect(result.isComparisonSkipped).toBe(true);
        expect(firstProps(result.schema).content).toBe(
            '<img src="/known.webp"><img src="/fresh.webp">'
        );
    });

    it('вытесненная загрузка списка не считается выполненным сравнением', async () => {
        mediaStoreMock.hasLoadedItemsSnapshot = false;
        // Более свежий запрос уже забрал номер: этот завершается без ошибки и
        // без применения ответа — списка после него по-прежнему нет
        mediaStoreMock.loadItems = vi.fn(() => Promise.resolve());

        const resolver = useSchemaImageResolver();
        const result = await resolver.startResolving(makeSchema({ image: '/fresh.webp' }));

        expect(resolver.isModalOpen.value).toBe(false);
        expect(result.isComparisonSkipped).toBe(true);
    });

    it('пустая, но достоверно загруженная медиатека даёт обычный разбор', async () => {
        const resolver = useSchemaImageResolver();
        const pending = resolver.startResolving(makeSchema({ image: '/fresh.webp' }));
        await flushMicrotasks();

        // Список пуст по факту, а не по незнанию: перезапрашивать нечего
        expect(mediaStoreMock.loadItems).not.toHaveBeenCalled();
        expect(resolver.isModalOpen.value).toBe(true);
        expect([...resolver.state.actions.keys()]).toEqual(['/fresh.webp']);

        resolver.handleConfirm();
        expect((await pending).isComparisonSkipped).toBe(false);
    });

    it('смена сессии во время загрузки списка не открывает модалку прежней схемы', async () => {
        mediaStoreMock.hasLoadedItemsSnapshot = false;

        let finishLoad: (() => void) | undefined;
        mediaStoreMock.loadItems = vi.fn(
            () =>
                new Promise<void>((resolve) => {
                    finishLoad = () => {
                        mediaStoreMock.hasLoadedItemsSnapshot = true;
                        resolve();
                    };
                })
        );

        const resolver = useSchemaImageResolver();
        const pending = resolver.startResolving(makeSchema({ image: '/fresh.webp' }));
        await flushMicrotasks();

        // Пользователь ушёл на другую страницу: сброс поверхностей, переживающих
        // сессию, зовёт `handleCancel` — гасить в этот момент нечего, модалки
        // ещё нет, и без поколения ответ открыл бы её уже поверх новой страницы
        resolver.handleCancel();

        finishLoad?.();
        const result = await pending;

        expect(resolver.isModalOpen.value).toBe(false);
        expect(result.schema).toBeNull();
        expect(result.isComparisonSkipped).toBe(false);
    });

    it('упавший запрос вытесненного импорта не кладёт свою схему на канвас', async () => {
        mediaStoreMock.hasLoadedItemsSnapshot = false;

        let failLoad: (() => void) | undefined;
        mediaStoreMock.loadItems = vi.fn(
            () =>
                new Promise<void>((_resolve, reject) => {
                    failLoad = () => reject(new Error('media is down'));
                })
        );

        const resolver = useSchemaImageResolver();
        const outdated = resolver.startResolving(makeSchema({ image: '/outdated.webp' }));
        await flushMicrotasks();

        // Второй импорт — схемы без изображений: он не ждёт медиатеку и
        // применяется сразу, вытеснив первый
        const fresh = await resolver.startResolving(makeSchema({ title: 'Свежая схема' }));
        expect(fresh.schema).not.toBeNull();

        // Теперь падает запрос первого импорта. Токен сессии его не отсекает —
        // сессия та же, вытеснение произошло внутри неё, — поэтому без проверки
        // поколения в ветке отказа старая схема легла бы поверх новой
        failLoad?.();
        const result = await outdated;

        expect(result.schema).toBeNull();
        expect(result.isComparisonSkipped).toBe(false);
    });

    it('новый импорт завершает начатый, а не бросает его промис', async () => {
        const resolver = useSchemaImageResolver();

        const first = resolver.startResolving(makeSchema({ image: '/first.webp' }));
        await flushMicrotasks();
        expect(resolver.isModalOpen.value).toBe(true);

        // Второй импорт до ответа на модалку: без завершения первого его
        // вызывающий ждал бы схему вечно — `pendingPromise` уже переписан
        const second = resolver.startResolving(makeSchema({ image: '/second.webp' }));
        await flushMicrotasks();

        await expect(first).resolves.toEqual({ schema: null, isComparisonSkipped: false });
        expect([...resolver.state.actions.keys()]).toEqual(['/second.webp']);

        resolver.handleSkip();
        expect((await second).schema).not.toBeNull();
    });

    it('схема без изображений не запрашивает медиатеку', async () => {
        mediaStoreMock.hasLoadedItemsSnapshot = false;

        const resolver = useSchemaImageResolver();
        const result = await resolver.startResolving(makeSchema({ title: 'Без картинок' }));

        expect(mediaStoreMock.loadItems).not.toHaveBeenCalled();
        expect(resolver.isModalOpen.value).toBe(false);
        expect(result.isComparisonSkipped).toBe(false);
        expect(firstProps(result.schema).title).toBe('Без картинок');
    });
});
