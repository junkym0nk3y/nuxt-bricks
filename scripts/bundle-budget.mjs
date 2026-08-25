#!/usr/bin/env node
/**
 * Bundle budget: checks the size of the client JS of the playground production build.
 *
 * Walking the Nuxt client manifest (client.precomputed.mjs), it takes the transitive
 * closure of the chunks for three surfaces and compares the gzip totals with the
 * budgets:
 *   - entry        — what every visitor of any page loads;
 *   - published    — entry plus the route chunk of a published page
 *                    (render/pages/[pagename].vue), that is the full initial JS of a
 *                    visitor of a published page;
 *   - editor       — the ADDITION of the editor over the published surface: its own
 *                    code, the text editor and the kit, minus every chunk a visitor
 *                    of a published page has already downloaded.
 *
 * The first two are totals — what one visitor loads. The third is an increment: the
 * editor is opened by whoever already has the entry, and counting the entry into it
 * again would let a growth of the entry eat the headroom of the editor.
 *
 * The editor is measured over the module keys rather than over the route of the
 * builder page: that page is a thin shell, everything arrives through
 * `defineAsyncComponent`, and a budget built on its route would be green whatever
 * happened behind the lazy imports.
 *
 * Run it with `npm run budget:bundle` (a fresh `npm run dev:build` is required).
 * The budgets are the constants below; a deliberate growth is raised by the number in
 * this file — a reviewer sees the diff of the budget, and an unnoticed growth is caught
 * by CI.
 */

import { gzipSync } from 'node:zlib';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DEFAULT_OUTPUT_DIR = resolve(ROOT, 'playground/.output');

const PUBLISHED_PAGE_MODULE = '../src/runtime/modules/render/pages/[pagename].vue';

/**
 * The module keys of the editor surface. The kit is here as well: it has no consumer
 * outside the builder, so its weight belongs to whoever opens the editor.
 */
const EDITOR_MODULE_PATTERN =
    /\/modules\/(builder|text-editor|ui)\/|\/docs\/guide\/|\/plugins\/builder\/|\/plugins\/icons\/builderIcons/;

// Gzip budgets, KB. Fixed from the actual sizes measured on 2026-07-11 (entry 111 KB,
// published 120 KB) and on 2026-08-25 (editor 349 KB over published) plus roughly 10%
// of headroom.
const BUDGETS_GZIP_KB = {
    entry: 122,
    published: 132,
    editor: 384,
};

/**
 * Transitive closure of the script chunks from a set of manifest keys.
 *
 * @param {Record<string, any>} dependencies - The dependencies section of the manifest.
 * @param {string[]} startKeys - Starting keys (the entrypoint, route modules).
 * @returns {Set<string>} Chunk file names.
 */
function collectChunkFiles(dependencies, startKeys) {
    const seen = new Set();
    const files = new Set();
    const stack = [...startKeys];

    while (stack.length > 0) {
        const key = stack.pop();
        if (seen.has(key)) {
            continue;
        }
        seen.add(key);

        if (key.startsWith('_')) {
            files.add(key.slice(1));
        }

        const record = dependencies[key];
        if (!record) {
            continue;
        }

        for (const bag of ['scripts', 'preload']) {
            for (const [depKey, dep] of Object.entries(record[bag] ?? {})) {
                if (dep.resourceType === 'script' && dep.file) {
                    files.add(dep.file);
                }
                if (dependencies[depKey]) {
                    stack.push(depKey);
                }
            }
        }
    }

    return files;
}

/**
 * Total gzip size of a set of chunks, in bytes.
 *
 * @param {Set<string>} files - File names inside the client directory.
 * @param {string} clientDir - The directory of the built client chunks.
 * @returns {number} The sum of the gzip byte sizes.
 */
function gzipTotal(files, clientDir) {
    let total = 0;
    for (const file of files) {
        const content = readFileSync(resolve(clientDir, file));
        total += gzipSync(content).length;
    }
    return total;
}

/**
 * Checks the budgets of one build.
 *
 * Returns an exit code rather than calling `process.exit`, so the checks of the script
 * itself can be run without ending the process.
 *
 * @param {{ outputDir?: string, budgets?: Record<string, number>, log?: (message: string) => void, logError?: (message: string) => void }} [options]
 * @returns {number} 0 — every surface is within its budget.
 */
export async function checkBundleBudget(options = {}) {
    const {
        outputDir = DEFAULT_OUTPUT_DIR,
        budgets = BUDGETS_GZIP_KB,
        log = console.log,
        logError = console.error,
    } = options;

    const manifestPath = resolve(outputDir, 'server/chunks/build/client.precomputed.mjs');
    const clientDir = resolve(outputDir, 'public/_nuxt');

    const manifest = await readManifest(manifestPath);

    if (!manifest?.dependencies || !manifest?.entrypoints?.length) {
        logError(
            `[bundle-budget] Manifest missing or empty: ${manifestPath}\n` +
                'Build the playground first: npm run dev:build'
        );
        return 1;
    }

    const { dependencies, entrypoints } = manifest;

    if (!dependencies[PUBLISHED_PAGE_MODULE]) {
        logError(
            `[bundle-budget] The manifest has no route module of a published page: ${PUBLISHED_PAGE_MODULE}`
        );
        return 1;
    }

    const editorModules = Object.keys(dependencies).filter((key) =>
        EDITOR_MODULE_PATTERN.test(key)
    );

    // An empty selection would turn the editor budget into a check that always
    // passes: the renaming of a domain folder alone is enough for the pattern to stop
    // matching anything
    if (editorModules.length === 0) {
        logError(
            '[bundle-budget] No module of the editor surface was found in the manifest. ' +
                'The pattern of EDITOR_MODULE_PATTERN has fallen behind the layout of the domains.'
        );
        return 1;
    }

    const entryFiles = collectChunkFiles(dependencies, entrypoints);
    const publishedFiles = collectChunkFiles(dependencies, [...entrypoints, PUBLISHED_PAGE_MODULE]);
    const editorFiles = collectChunkFiles(dependencies, editorModules);

    const surfaces = {
        entry: entryFiles,
        published: publishedFiles,
        editor: exclude(editorFiles, publishedFiles),
    };

    if (surfaces.editor.size === 0) {
        logError(
            '[bundle-budget] The editor surface has no chunks of its own. ' +
                'Either the whole editor got into the initial graph, or the closure stopped reaching its chunks.'
        );
        return 1;
    }

    let failed = false;

    for (const [name, files] of Object.entries(surfaces)) {
        const gzipKb = Math.round(gzipTotal(files, clientDir) / 1024);
        const budgetKb = budgets[name];
        const ok = gzipKb <= budgetKb;
        failed ||= !ok;
        const measure = name === 'editor' ? 'KB gzip over published' : 'KB gzip';
        log(
            `[bundle-budget] ${name}: ${gzipKb} ${measure} (${files.size} chunks), budget ${budgetKb} KB — ${ok ? 'OK' : 'OVER BUDGET'}`
        );
        if (!ok) {
            logError(
                `[bundle-budget] Surface "${name}" is over its budget. ` +
                    'Check that no builder-only code got into the initial graph (nuxi analyze playground), ' +
                    'or raise the budget in scripts/bundle-budget.mjs deliberately.'
            );
        }
    }

    return failed ? 1 : 0;
}

/**
 * The chunks of a surface the published visitor has not downloaded already.
 *
 * @param {Set<string>} files - The closure of the surface.
 * @param {Set<string>} counted - Everything the published surface counted.
 * @returns {Set<string>} The files of this surface alone.
 */
function exclude(files, counted) {
    return new Set([...files].filter((file) => !counted.has(file)));
}

/**
 * Reads the client manifest; null when the module cannot be loaded.
 *
 * The manifest is not a JSON literal but a module that assembles the object out of
 * shared parts, so it is imported rather than parsed.
 *
 * @param {string} manifestPath - The path of client.precomputed.mjs.
 */
async function readManifest(manifestPath) {
    const module = await import(pathToFileURL(manifestPath).href).catch(() => null);

    return module?.default ?? module;
}

// The direct run: `npm run budget:bundle`. Under an import (the checks of the script)
// nothing runs by itself
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    process.exit(await checkBundleBudget());
}
