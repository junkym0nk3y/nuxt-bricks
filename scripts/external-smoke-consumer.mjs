import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

/**
 * The consumer application of the external smoke: a Nuxt app on the packed
 * tarball, with an in-memory publish adapter so that the binaries never leave the
 * process and the smoke can prove that only the metadata travels to the backend.
 *
 * Kept apart from the checks themselves: writing the fixture and asserting the
 * contract are two jobs, and together they no longer fit the size ceiling of one
 * file.
 */

export const MEMORY_STORAGE_BASE = 'https://memory-storage.invalid/bucket/';

/** The text of the index page: what a public request must find in the answer */
export const PAGE_MARKER = 'bricks-external-smoke-ok';

/**
 * Creates the consumer application of the external mode: backend.mode in nuxt.config and
 * an in-memory publish adapter registered by a Nitro plugin through
 * nuxt-bricks/persistence.
 *
 * @param {string} consumerDir - The consumer directory.
 * @param {string} tarballPath - Absolute path to the tarball.
 * @returns {Promise<void>} Resolves once the files are written.
 */
export async function scaffoldConsumer(consumerDir, tarballPath) {
    await mkdir(join(consumerDir, 'pages'), { recursive: true });
    await mkdir(join(consumerDir, 'server', 'plugins'), { recursive: true });
    await writeFile(
        join(consumerDir, 'package.json'),
        JSON.stringify(
            {
                name: 'bricks-external-smoke-consumer',
                private: true,
                type: 'module',
                dependencies: {
                    nuxt: '^3.21.1',
                    'nuxt-bricks': `file:${tarballPath}`,
                },
            },
            null,
            2
        )
    );
    await writeFile(
        join(consumerDir, 'nuxt.config.ts'),
        [
            'export default defineNuxtConfig({',
            "    modules: ['nuxt-bricks'],",
            "    compatibilityDate: '2025-01-01',",
            '    bricks: {',
            "        backend: { mode: 'external' }, // url and token arrive at boot through NUXT_BRICKS_BACKEND_*",
            '    },',
            '});',
            '',
        ].join('\n')
    );
    await writeFile(
        join(consumerDir, 'server', 'plugins', 'memoryPublish.ts'),
        [
            "import { setBricksPublishAdapter } from 'nuxt-bricks/persistence';",
            '',
            `const STORAGE_BASE = '${MEMORY_STORAGE_BASE}';`,
            '// Keyed by the storage key rather than by the url: the listing and the head',
            '// read address an object by its key, while deletion arrives with a url — one',
            '// canonical key is what keeps the three from missing each other',
            'const objects = new Map<string, { buffer: Buffer; lastModified: string }>();',
            '',
            '// An in-memory publish adapter: the files never leave the consumer process —',
            '// the smoke proves that only the metadata travels to the external backend.',
            '// The bytes are kept, not just their length: the bucket import decides the',
            '// type of an object by the head of its content, so a storage that cannot be',
            '// read would make the import register nothing and pass silently',
            'export default defineNitroPlugin(() => {',
            '    setBricksPublishAdapter({',
            '        buildFileKey(kind, filename) {',
            '            return `bricks-media/${kind}-${filename}`;',
            '        },',
            '        async uploadFile({ buffer, key }) {',
            '            objects.set(key, { buffer, lastModified: new Date().toISOString() });',
            '            return { url: `${STORAGE_BASE}${key}`, key, size: buffer.length };',
            '        },',
            '        async uploadFileStream({ body, key }) {',
            '            const chunks: Buffer[] = [];',
            '            for await (const chunk of body) {',
            '                chunks.push(Buffer.from(chunk));',
            '            }',
            '            const buffer = Buffer.concat(chunks);',
            '            objects.set(key, { buffer, lastModified: new Date().toISOString() });',
            '            return { url: `${STORAGE_BASE}${key}`, key, size: buffer.length };',
            '        },',
            '        async deleteFile(url) {',
            '            if (!url.startsWith(STORAGE_BASE)) {',
            "                throw new Error('URL outside managed storage');",
            '            }',
            '            objects.delete(url.slice(STORAGE_BASE.length));',
            '        },',
            '        async listFiles(prefix) {',
            '            // Without a prefix the listing stays inside the media namespace, as the',
            '            // real adapter does with its configured one: the import walks whatever',
            '            // comes back, and avatars are promised to stay out of the gallery',
            "            const scope = prefix ?? 'bricks-media/media-';",
            '            return [...objects.entries()]',
            '                .filter(([key]) => key.startsWith(scope))',
            '                .map(([key, object]) => ({',
            '                    key,',
            '                    url: `${STORAGE_BASE}${key}`,',
            '                    size: object.buffer.length,',
            '                    lastModified: object.lastModified,',
            '                }));',
            '        },',
            '        async readFileHead(key, maxBytes) {',
            '            const object = objects.get(key);',
            '            if (!object) {',
            '                throw new Error(`No such object: ${key}`);',
            '            }',
            '            return object.buffer.subarray(0, maxBytes);',
            '        },',
            '        isOwnedUrl(url) {',
            '            return url.startsWith(STORAGE_BASE);',
            '        },',
            '    });',
            '});',
            '',
        ].join('\n')
    );
    await writeFile(
        join(consumerDir, 'pages', 'index.vue'),
        `<template>\n    <div>${PAGE_MARKER}</div>\n</template>\n`
    );
}
