#!/usr/bin/env node
/**
 * Bundle budget: checks the size of the client JS of the playground production build.
 *
 * Walking the Nuxt client manifest (client.precomputed.mjs), it takes the transitive
 * closure of the chunks for two surfaces and compares the gzip totals with the budgets:
 *   - entry        — what every visitor of any page loads;
 *   - published    — entry plus the route chunk of a published page
 *                    (render/pages/[pagename].vue), that is the full initial JS of a
 *                    visitor of a published page.
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
const OUTPUT_DIR = resolve(ROOT, 'playground/.output');
const MANIFEST_PATH = resolve(OUTPUT_DIR, 'server/chunks/build/client.precomputed.mjs');
const CLIENT_DIR = resolve(OUTPUT_DIR, 'public/_nuxt');

const PUBLISHED_PAGE_MODULE = '../src/runtime/modules/render/pages/[pagename].vue';

// Gzip budgets, KB. Fixed from the actual sizes measured on 2026-07-11 (entry 111 KB,
// published 120 KB) plus roughly 10% of headroom.
const BUDGETS_GZIP_KB = {
    entry: 122,
    published: 132,
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
 * @param {Set<string>} files - File names inside CLIENT_DIR.
 * @returns {number} The sum of the gzip byte sizes.
 */
function gzipTotal(files) {
    let total = 0;
    for (const file of files) {
        const content = readFileSync(resolve(CLIENT_DIR, file));
        total += gzipSync(content).length;
    }
    return total;
}

const manifestModule = await import(pathToFileURL(MANIFEST_PATH).href).catch(() => null);
const manifest = manifestModule?.default ?? manifestModule;

if (!manifest?.dependencies || !manifest?.entrypoints?.length) {
    console.error(
        `[bundle-budget] Manifest missing or empty: ${MANIFEST_PATH}\n` +
            'Build the playground first: npm run dev:build'
    );
    process.exit(1);
}

const { dependencies, entrypoints } = manifest;

if (!dependencies[PUBLISHED_PAGE_MODULE]) {
    console.error(
        `[bundle-budget] The manifest has no route module of a published page: ${PUBLISHED_PAGE_MODULE}`
    );
    process.exit(1);
}

const surfaces = {
    entry: collectChunkFiles(dependencies, entrypoints),
    published: collectChunkFiles(dependencies, [...entrypoints, PUBLISHED_PAGE_MODULE]),
};

let failed = false;

for (const [name, files] of Object.entries(surfaces)) {
    const gzipKb = Math.round(gzipTotal(files) / 1024);
    const budgetKb = BUDGETS_GZIP_KB[name];
    const ok = gzipKb <= budgetKb;
    failed ||= !ok;
    console.log(
        `[bundle-budget] ${name}: ${gzipKb} KB gzip (${files.size} chunks), budget ${budgetKb} KB — ${ok ? 'OK' : 'OVER BUDGET'}`
    );
    if (!ok) {
        console.error(
            `[bundle-budget] Surface "${name}" is over its budget. ` +
                'Check that no builder-only code got into the initial graph (nuxi analyze playground), ' +
                'or raise the budget in scripts/bundle-budget.mjs deliberately.'
        );
    }
}

process.exit(failed ? 1 : 0);
