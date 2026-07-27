import { describe, expect, it } from 'vitest';

import type { IBricksSchema } from '../../src/runtime/modules/common/types/brick';
import {
    extractSchemaImageUrls,
    getPlaceholderImageUrl,
    replaceSchemaImageUrls,
} from '../../src/runtime/modules/builder/media/utils/schemaImageExtractor';

/**
 * Схема с одним компонентом и заданными props.
 */
function makeSchema(props: Record<string, unknown>): IBricksSchema {
    return {
        components: [
            {
                id: 'c1',
                componentName: 'TestBrick',
                type: 'brick',
                props,
            },
        ],
    } as unknown as IBricksSchema;
}

describe('schemaImageExtractor: placeholder', () => {
    it('getPlaceholderImageUrl учитывает app.baseURL', () => {
        expect(getPlaceholderImageUrl('/')).toBe('/_bricks/images/brick-empty.webp');
        expect(getPlaceholderImageUrl('/app/')).toBe('/app/_bricks/images/brick-empty.webp');
    });

    it('не извлекает плейсхолдер независимо от base-префикса URL', () => {
        const schema = makeSchema({
            bare: '/images/brick-empty.webp',
            current: '/_bricks/images/brick-empty.webp',
            withBase: '/app/_bricks/images/brick-empty.webp',
            real: '/uploads/photo.webp',
        });

        const urls = extractSchemaImageUrls(schema).map((item) => item.url);

        expect(urls).toEqual(['/uploads/photo.webp']);
    });
});

/**
 * BM-14 №7: пересборка пропсов при замене картинок шла присваиванием
 * `newProps[propName] = value`. Имена пропов приходят из схемы, в том числе
 * импортированной руками, поэтому `__proto__` подменял прототип нового объекта
 * вместо записи ключа.
 */
describe('schemaImageExtractor: замена URL при именах пропов из Object.prototype', () => {
    it('сохраняет собственные пропы со специальными именами', () => {
        const schema = makeSchema(
            JSON.parse('{"constructor": "/old.webp", "toString": "keep", "title": "text"}')
        );

        const replaced = replaceSchemaImageUrls(schema, new Map([['/old.webp', '/new.webp']]));
        const props = replaced.components[0].props as Record<string, unknown>;

        expect(Object.getOwnPropertyNames(props)).toEqual(['constructor', 'toString', 'title']);
        expect(props.constructor).toBe('/new.webp');
        expect(props.toString).toBe('keep');
    });

    it('не подменяет прототип пересобранных пропсов через __proto__', () => {
        const schema = makeSchema(
            JSON.parse('{"__proto__": {"polluted": true}, "image": "/old.webp"}')
        );

        const replaced = replaceSchemaImageUrls(schema, new Map([['/old.webp', '/new.webp']]));
        const props = replaced.components[0].props as Record<string, unknown>;

        expect(Object.getPrototypeOf(props)).toBe(Object.prototype);
        expect(Object.getOwnPropertyNames(props)).toEqual(['image']);
        expect(props.polluted).toBeUndefined();
    });
});
