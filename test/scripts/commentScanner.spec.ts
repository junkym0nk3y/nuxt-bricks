import { describe, expect, it } from 'vitest';

import {
    collectComments,
    collectDevMessages,
    collectTestTitles,
    projectCode,
} from '../../scripts/comment-lines.mjs';

/**
 * Reports the comment lines of a source string.
 *
 * @param path - Path deciding which syntax is used.
 * @param source - Source to scan.
 * @returns One-based line numbers holding a comment.
 */
function commentLines(path: string, source: string): number[] {
    return collectComments(path, source).commentLines.map((entry) => entry.line);
}

describe('comment scanner', () => {
    it('counts every line of a multi-line block, including continuations', () => {
        const source = ['/**', ' * first', ' * second', ' */', 'const value = 1;'].join('\n');

        expect(commentLines('a.ts', source)).toEqual([1, 2, 3, 4]);
    });

    it('ignores comment markers inside string and regexp literals', () => {
        const source = [
            "const url = 'https://host/path';",
            'const svg = /^<!--[\\s\\S]*?-->$/;',
            '// real comment',
        ].join('\n');

        expect(commentLines('a.ts', source)).toEqual([3]);
    });

    it('separates division from a regexp literal', () => {
        const source = ['const half = total / 2;', 'const rest = half / 2; // trailing'].join('\n');

        expect(commentLines('a.ts', source)).toEqual([2]);
    });

    it('divides after a postfix operator and after a closing quote', () => {
        expect(commentLines('a.ts', 'const ratio = value++ / divisor; // trailing')).toEqual([1]);
        expect(commentLines('a.ts', 'const ratio = value-- / divisor; // trailing')).toEqual([1]);
        expect(commentLines('a.ts', "const ratio = 'a' / divisor; // trailing")).toEqual([1]);
    });

    it('finds comments inside a template literal substitution but not in its text', () => {
        const source = [
            'const css = `',
            '    /* not a comment, generated output */',
            '    ${build(/* real comment */ value)}',
            '`;',
        ].join('\n');

        expect(commentLines('a.ts', source)).toEqual([3]);
    });

    it('reports Cyrillic lines of a template literal separately from comments', () => {
        const source = ['const css = `', '    /* русский текст в литерале */', '`;'].join('\n');
        const { commentLines: comments, literalLines } = collectComments('a.ts', source);

        expect(comments).toEqual([]);
        expect(literalLines).toEqual([2]);
    });

    it('tags Vue sections so that markup and script comments are told apart', () => {
        const source = [
            '<script setup lang="ts">',
            '// script comment',
            '</script>',
            '',
            '<template>',
            '    <!-- template comment -->',
            '    <template #slot>',
            '        <span />',
            '    </template>',
            '</template>',
            '',
            '<style module lang="scss">',
            '// style comment',
            '</style>',
        ].join('\n');
        const sections = collectComments('a.vue', source).commentLines.map((entry) => [
            entry.line,
            entry.section,
        ]);

        expect(sections).toEqual([
            [2, 'code'],
            [6, 'template'],
            [13, 'style'],
        ]);
    });

    it('keeps a block closed on its own opening line from swallowing the file', () => {
        const source = [
            '<script setup lang="ts"></script>',
            '',
            '<template>',
            '    <!-- template comment -->',
            '</template>',
        ].join('\n');
        const sections = collectComments('a.vue', source).commentLines.map((entry) => [
            entry.line,
            entry.section,
        ]);

        expect(sections).toEqual([[4, 'template']]);
    });

    it('marks tool directives so the markup cleanup keeps them', () => {
        const source = [
            '<template>',
            '    <!-- eslint-disable-next-line vue/no-v-html -->',
            '    <!-- explanation -->',
            '</template>',
        ].join('\n');
        const flags = collectComments('a.vue', source).commentLines.map((entry) => [
            entry.line,
            entry.directive,
        ]);

        expect(flags).toEqual([
            [2, true],
            [3, false],
        ]);
    });

    it('reads SQL and YAML comment syntax', () => {
        expect(commentLines('m.sql', "-- comment\nSELECT '--not a comment';")).toEqual([1]);
        expect(commentLines('c.yml', "# comment\nkey: 'value # not a comment'")).toEqual([1]);
    });

    it('treats every non-empty Markdown line as translatable prose', () => {
        expect(commentLines('README.md', 'Заголовок\n\nТекст')).toEqual([1, 3]);
    });
});

describe('test title collection', () => {
    it('collects Russian case titles and leaves asserted values alone', () => {
        // Titles are spliced in from constants rather than written inline: as
        // literal text they would read as real Russian case names to the gate,
        // which scans this file too
        const blockTitle = 'русский блок';
        const caseTitle = 'возвращает значение';
        const source = [
            `describe('${blockTitle}', () => {`,
            `    it('${caseTitle}', () => {`,
            "        expect(slugify('Привет')).toBe('privet');",
            '    });',
            "    it('english case', () => {});",
            '});',
        ].join('\n');

        expect(collectTestTitles(source)).toEqual([
            { line: 1, text: blockTitle },
            { line: 2, text: caseTitle },
        ]);
    });

    it('finds the title of a table-driven case past its table argument', () => {
        const inlineTitle = 'отказ %i помечает раздел недоступным';
        const multilineTitle = 'значение %s даёт прочерк';
        const source = [
            `    it.each([403, 404])('${inlineTitle}', async (status) => {});`,
            '    it.each([',
            "        ['a', fn(1)],",
            "        ['b', fn(2)],",
            `    ])('${multilineTitle}', (value) => {});`,
        ].join('\n');

        expect(collectTestTitles(source)).toEqual([
            { line: 1, text: inlineTitle },
            { line: 2, text: multilineTitle },
        ]);
    });
});

describe('developer message collection', () => {
    it('collects Russian text handed to throw and console, and nothing else', () => {
        const thrown = 'ожидается строка';
        const logged = 'папка сохранена';
        const source = [
            `throw createBrickSourceError(source, start, path, '${thrown}');`,
            `console.warn('${logged}');`,
            "const label = 'обычная строка, не сообщение';",
        ].join('\n');
        const messages = collectDevMessages('a.ts', source).map((entry) => entry.line);

        expect(messages).toEqual([1, 2]);
    });
});

describe('code projection', () => {
    it('ignores comment edits and blank lines', () => {
        const before = ['// старый комментарий', '', 'const value = 1;'].join('\n');
        const after = ['/**', ' * a new block comment', ' */', 'const value = 1;'].join('\n');

        expect(projectCode('a.ts', before)).toEqual(projectCode('a.ts', after));
    });

    it('reports code rewritten next to a trailing comment', () => {
        const before = "credentials: 'include', // тот же комментарий";
        const after = "credentials: 'omit', // тот же комментарий";

        expect(projectCode('a.ts', before)).not.toEqual(projectCode('a.ts', after));
    });

    it('projects prose files to nothing so a translated README verifies', () => {
        expect(projectCode('README.md', 'Заголовок\n\nТекст')).toEqual([]);
    });

    it('keeps indentation of whitespace-sensitive formats', () => {
        const before = ['jobs:', '  build:', '    steps: 1'].join('\n');
        const after = ['jobs:', '  build:', '      steps: 1'].join('\n');

        expect(projectCode('ci.yml', before)).not.toEqual(projectCode('ci.yml', after));
    });
});
