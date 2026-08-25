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
                type: 'component',
                componentName: 'TestBrick',
                brickPath: 'bricks/TestBrick.brick.ts',
                zIndex: 0,
                props,
            },
        ],
    };
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

describe('schemaImageExtractor: узнавание картинки по хосту', () => {
    it('ссылка без расширения узнаётся по хосту из настройки установки', () => {
        const schema = makeSchema({
            own: 'https://bucket.s3.amazonaws.com/signed/abc123',
            configured: 'https://media.example.com/image/abc123',
            foreign: 'https://api.example.org/v1/orders/17',
        });

        const urls = extractSchemaImageUrls(schema, ['media.example.com']).map((item) => item.url);

        // The configured host is recognized; the configured list replaces the default one,
        // so amazonaws is out of it here, and an unrelated URL in a string prop does not
        // become an image: a string prop is free to be an ordinary link
        expect(urls).toEqual(['https://media.example.com/image/abc123']);
    });

    it('сверка идёт по границе метки хоста, а не подстрокой', () => {
        const schema = makeSchema({
            lookalike: 'https://notamazonaws.com/signed/abc123',
            real: 'https://bucket.s3.amazonaws.com/signed/abc123',
        });

        const urls = extractSchemaImageUrls(schema, ['amazonaws.com']).map((item) => item.url);

        expect(urls).toEqual(['https://bucket.s3.amazonaws.com/signed/abc123']);
    });

    it('пустой список хостов оставляет узнавание по расширению файла', () => {
        const schema = makeSchema({
            extension: 'https://media.example.com/photo.webp',
            signed: 'https://media.example.com/image/abc123',
        });

        const urls = extractSchemaImageUrls(schema, []).map((item) => item.url);

        expect(urls).toEqual(['https://media.example.com/photo.webp']);
    });
});

/**
 * Пересборка пропсов при замене картинок шла присваиванием
 * `newProps[propName] = value`. Имена пропов приходят из схемы, в том числе
 * импортированной руками, поэтому `__proto__` подменял прототип нового объекта
 * вместо записи ключа.
 */
describe('schemaImageExtractor: область замены в HTML-пропе', () => {
    it('меняет только src у img, не трогая href, текст и data-атрибуты', () => {
        // The replacement used to walk the whole string, so one URL was swapped in
        // every place at once — including the ones the extraction never showed the
        // user
        const schema = makeSchema({
            content:
                '<a href="/uploads/a.png" data-preview="/uploads/a.png">/uploads/a.png' +
                '<img src="/uploads/a.png"></a>',
        });

        const replaced = replaceSchemaImageUrls(
            schema,
            new Map([['/uploads/a.png', '/placeholder.webp']])
        );

        expect(replaced.components[0].props?.content).toBe(
            '<a href="/uploads/a.png" data-preview="/uploads/a.png">/uploads/a.png' +
                '<img src="/placeholder.webp"></a>'
        );
    });

    it('URL, являющийся префиксом другого, получает свою замену', () => {
        // The shorter key stands first on purpose: with a substring replacement it
        // used to turn the second src into `<the new URL>?v=2` — a broken link
        const schema = makeSchema({
            content: '<img src="/uploads/a.png"><img src="/uploads/a.png?v=2">',
        });

        const replaced = replaceSchemaImageUrls(
            schema,
            new Map([
                ['/uploads/a.png', '/first.webp'],
                ['/uploads/a.png?v=2', '/second.webp'],
            ])
        );

        expect(replaced.components[0].props?.content).toBe(
            '<img src="/first.webp"><img src="/second.webp">'
        );
    });

    it('data-src ленивого загрузчика не считается картинкой страницы', () => {
        const schema = makeSchema({
            content: '<img data-src="/uploads/lazy.png" src="/uploads/real.png">',
        });

        expect(extractSchemaImageUrls(schema).map((entry) => entry.url)).toEqual([
            '/uploads/real.png',
        ]);
    });

    it('кавычки и остальная разметка сохраняются как были', () => {
        const schema = makeSchema({
            content: "<img class='hero' src='/uploads/a.png' alt='hero'>",
        });

        const replaced = replaceSchemaImageUrls(
            schema,
            new Map([['/uploads/a.png', '/placeholder.webp']])
        );

        expect(replaced.components[0].props?.content).toBe(
            "<img class='hero' src='/placeholder.webp' alt='hero'>"
        );
    });
});

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
        expect(props.polluted).toBeUndefined();
        expect(({} as { polluted?: boolean }).polluted).toBeUndefined();
    });
});

/**
 * `toSafeRecord` отбрасывал own-ключ `__proto__` при пересборке пропсов,
 * то есть запись из схемы исчезала — и только когда URL совпал с маппингом.
 * Функция объявляет «остальной контент не трогает»; отбрасывание перенесено на
 * вход схемы в стор (`cloneComponentProps`), где оно безусловно.
 */
describe('schemaImageExtractor: замена URL не меняет состав пропсов', () => {
    it('сохраняет own-ключ __proto__ при замене картинки', () => {
        const schema = makeSchema(
            JSON.parse('{"__proto__": {"mode": "custom"}, "image": "/old.webp"}')
        );

        const replaced = replaceSchemaImageUrls(schema, new Map([['/old.webp', '/new.webp']]));
        const props = replaced.components[0].props as Record<string, unknown>;

        expect(Object.getOwnPropertyNames(props)).toEqual(['__proto__', 'image']);
        expect(props.image).toBe('/new.webp');
    });

    it('состав ключей одинаков при совпавшем и несовпавшем маппинге', () => {
        const props = JSON.parse('{"__proto__": {"mode": "custom"}, "image": "/old.webp"}');

        const changed = replaceSchemaImageUrls(
            makeSchema(props),
            new Map([['/old.webp', '/new.webp']])
        );
        const untouched = replaceSchemaImageUrls(
            makeSchema(props),
            new Map([['/other.webp', '/new.webp']])
        );

        expect(Object.getOwnPropertyNames(changed.components[0].props)).toEqual(
            Object.getOwnPropertyNames(untouched.components[0].props)
        );
    });
});
