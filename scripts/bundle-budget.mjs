#!/usr/bin/env node
/**
 * Bundle budget: проверяет размер клиентского JS прод-сборки playground.
 *
 * Считает по клиентскому манифесту Nuxt (client.precomputed.mjs) транзитивное
 * замыкание чанков для двух поверхностей и сравнивает gzip-суммы с бюджетами:
 *   - entry        — то, что грузит каждый посетитель любой страницы;
 *   - published    — entry + route-чанк опубликованной страницы (render/pages/[pagename].vue),
 *                    т.е. полный initial JS посетителя published-страницы.
 *
 * Запуск: `npm run budget:bundle` (требует свежий `npm run dev:build`).
 * Бюджеты — константы ниже; при осознанном росте поднять числом в этом файле
 * (ревьюер видит diff бюджета, незаметный рост ловится CI).
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

// Бюджеты gzip, КБ. Зафиксированы от фактических размеров (2026-07-11:
// entry 111 KB, published 120 KB) + ~10% headroom.
const BUDGETS_GZIP_KB = {
    entry: 122,
    published: 132,
};

/**
 * Транзитивное замыкание script-чанков от набора ключей манифеста.
 *
 * @param {Record<string, any>} dependencies - Секция dependencies манифеста.
 * @param {string[]} startKeys - Стартовые ключи (entrypoint, route-модули).
 * @returns {Set<string>} Имена файлов чанков.
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
 * Суммарный gzip-размер набора чанков в байтах.
 *
 * @param {Set<string>} files - Имена файлов в CLIENT_DIR.
 * @returns {number} Сумма gzip-байтов.
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
        `[bundle-budget] Манифест не найден или пуст: ${MANIFEST_PATH}\n` +
            'Сначала соберите playground: npm run dev:build'
    );
    process.exit(1);
}

const { dependencies, entrypoints } = manifest;

if (!dependencies[PUBLISHED_PAGE_MODULE]) {
    console.error(
        `[bundle-budget] В манифесте нет route-модуля published-страницы: ${PUBLISHED_PAGE_MODULE}`
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
        `[bundle-budget] ${name}: ${gzipKb} KB gzip (${files.size} chunks), budget ${budgetKb} KB — ${ok ? 'OK' : 'ПРЕВЫШЕН'}`
    );
    if (!ok) {
        console.error(
            `[bundle-budget] Поверхность "${name}" превысила бюджет. ` +
                'Проверьте, что в initial-граф не попал builder-only код (nuxi analyze playground), ' +
                'либо осознанно поднимите бюджет в scripts/bundle-budget.mjs.'
        );
    }
}

process.exit(failed ? 1 : 0);
