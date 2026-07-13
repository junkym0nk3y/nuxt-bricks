import { describe, expect, it } from 'vitest';

import type { IBricksSchema } from '../src/runtime/modules/common/types/brick';
import {
    extractSchemaImageUrls,
    getPlaceholderImageUrl,
} from '../src/runtime/modules/builder/media/utils/schemaImageExtractor';

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
