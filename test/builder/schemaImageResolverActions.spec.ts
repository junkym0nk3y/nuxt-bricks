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
const { mediaItemsMock } = vi.hoisted(() => ({
    mediaItemsMock: [] as Array<{ url: string }>,
}));

vi.mock('../../src/runtime/modules/builder/media/stores/media', () => ({
    useMediaStore: () => ({
        items: mediaItemsMock,
        loadItems: vi.fn(),
    }),
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
        mediaItemsMock.length = 0;
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

        expect(firstProps(await pending).content).toBe(
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

        expect(firstProps(await pending).content).toBe(
            `<img src="${PLACEHOLDER_URL}"><img src="${PLACEHOLDER_URL}">`
        );
    });

    it('действие по умолчанию оставляет URL нетронутым', async () => {
        const resolver = useSchemaImageResolver();
        const pending = resolver.startResolving(makeSchema({ content: '<img src="__proto__">' }));
        await flushMicrotasks();

        resolver.handleConfirm();

        expect(firstProps(await pending).content).toBe('<img src="__proto__">');
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
        expect(firstProps(await second).content).toBe('<img src="__proto__">');
    });
});
