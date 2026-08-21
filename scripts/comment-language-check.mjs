#!/usr/bin/env node
/**
 * Comment language gate: counts Russian comment lines left in the codebase and
 * proves that a translation pass touched comments only.
 *
 * Two modes:
 *   - report (default) — Cyrillic comment lines per sprint area, plus comments
 *     left in `<template>`/`<style>` sections. Fails only for areas marked
 *     `done` below, so areas still queued never break the gate;
 *   - `--diff` — reads a diff and asserts every added and removed line is a
 *     comment line or blank. That is stronger than any linter: it proves no
 *     logic moved, instead of proving the moved logic still passes.
 *
 * Usage:
 *   node scripts/comment-language-check.mjs                  # full report
 *   node scripts/comment-language-check.mjs --area=1         # one area, fails unless zero
 *   node scripts/comment-language-check.mjs --area=21+22 --metric=comments
 *   node scripts/comment-language-check.mjs --list           # print every offending line
 *   node scripts/comment-language-check.mjs --diff           # working tree vs HEAD
 *   node scripts/comment-language-check.mjs --diff=main      # working tree vs a ref
 *   node scripts/comment-language-check.mjs --json           # machine-readable report
 *
 * Comments themselves are found by `comment-scanner.mjs` and turned into lines
 * by `comment-lines.mjs`; the stage map lives in `comment-sprint-areas.mjs` and
 * the `--diff` mode in `comment-diff-check.mjs`.
 *
 * Deliberately not part of `lint:check`: the owner runs the regular checks, and
 * a half-translated codebase must not turn them red.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { CYRILLIC } from './comment-scanner.mjs';
import { collectComments, collectDevMessages, collectTestTitles } from './comment-lines.mjs';
import {
    AREAS,
    LITERAL_GATED,
    MARKUP_COMMENT_ALLOWED,
    ROOT,
    isExcluded,
    isScannedPath,
    listFiles,
    resolveArea,
} from './comment-sprint-areas.mjs';
import { verifyDiff } from './comment-diff-check.mjs';

/**
 * Counters a stage has to bring to zero. Stages 21 and 22 share the `test/`
 * tree but close separately — comments first, case titles after — so closure is
 * tracked per metric rather than per area.
 */
const METRICS = ['comments', 'markup', 'gatedLiterals', 'messages', 'titles'];

/**
 * Counts everything one file owes the sprint into its area bucket.
 *
 * @param {string} path - Repository-relative path.
 * @param {object} bucket - Area report to add to.
 * @returns {Array<{ line: number, kind: string, text: string }>} Offending lines.
 */
function countFile(path, bucket) {
    const source = readFileSync(resolve(ROOT, path), 'utf8');
    const { commentLines, literalLines } = collectComments(path, source);
    const literalGated = LITERAL_GATED.has(path);
    const hits = [];

    for (const entry of commentLines) {
        const isCyrillic = CYRILLIC.test(entry.text);
        const isMarkup = entry.section === 'template' || entry.section === 'style';

        if (isCyrillic) {
            bucket.comments += 1;
            hits.push({ line: entry.line, kind: 'cyrillic', text: entry.text.trim() });
        }

        if (isMarkup && !entry.directive && !MARKUP_COMMENT_ALLOWED.has(path)) {
            bucket.markup += 1;

            if (!isCyrillic) {
                hits.push({ line: entry.line, kind: 'markup', text: entry.text.trim() });
            }
        }
    }

    for (const line of literalLines) {
        bucket.literalLines += 1;
        bucket.gatedLiterals += literalGated ? 1 : 0;
        hits.push({ line, kind: literalGated ? 'literal (gated)' : 'literal', text: '' });
    }

    for (const message of collectDevMessages(path, source)) {
        bucket.messages += 1;
        hits.push({ line: message.line, kind: 'message', text: message.text });
    }

    if (path.startsWith('test/') && /\.(ts|vue)$/.test(path)) {
        for (const title of collectTestTitles(source)) {
            bucket.titles += 1;
            hits.push({ line: title.line, kind: 'title', text: title.text });
        }
    }

    return hits;
}

/**
 * Builds the report over the whole repository.
 *
 * @returns {{ areas: Map<string, object>, unassigned: string[] }} Report data.
 */
function buildReport() {
    const areas = new Map();
    const unassigned = [];

    for (const area of AREAS) {
        areas.set(area.id, {
            id: area.id,
            title: area.title,
            done: area.done,
            comments: 0,
            markup: 0,
            literalLines: 0,
            gatedLiterals: 0,
            messages: 0,
            titles: 0,
            files: new Map(),
        });
    }

    for (const path of listFiles()) {
        if (!isScannedPath(path)) {
            continue;
        }

        if (isExcluded(path)) {
            continue;
        }

        const area = resolveArea(path);

        // A path no stage claims would otherwise stay Russian forever without
        // ever showing up as remaining work, so it is reported instead of
        // skipped: a new top-level directory must not slip past the map
        if (!area) {
            unassigned.push(path);
            continue;
        }

        const bucket = areas.get(area.id);
        const hits = countFile(path, bucket);

        if (hits.length > 0) {
            bucket.files.set(
                path,
                hits.sort((left, right) => left.line - right.line)
            );
        }
    }

    return { areas, unassigned };
}

/**
 * Human-readable closure state of an area.
 *
 * @param {object} area - Area report.
 * @returns {string} `queued`, `done`, or the list of closed metrics.
 */
function describeStatus(area) {
    if (area.done === true) {
        return 'done';
    }

    return Array.isArray(area.done) && area.done.length > 0 ? area.done.join('+') : 'queued';
}

/**
 * Prints the report and returns the process exit code.
 *
 * @param {object} options - Parsed CLI options.
 * @returns {number} Exit code.
 */
function report(options) {
    const { areas, unassigned } = buildReport();
    const selected = options.area
        ? [...areas.values()].filter((area) => area.id === options.area)
        : [...areas.values()];

    if (options.area && selected.length === 0) {
        console.error(`Unknown area: ${options.area}`);

        return 1;
    }

    if (options.json) {
        console.log(
            JSON.stringify(
                selected.map((area) => ({
                    ...area,
                    files: Object.fromEntries(area.files),
                })),
                null,
                2
            )
        );
    } else {
        const header = [
            'area',
            'ru comments',
            'tpl/style',
            'literals',
            'gated',
            'ru msgs',
            'ru titles',
            'status',
        ];
        const rows = selected.map((area) => [
            `${area.id} ${area.title}`,
            String(area.comments),
            String(area.markup),
            String(area.literalLines),
            String(area.gatedLiterals),
            String(area.messages),
            String(area.titles),
            describeStatus(area),
        ]);
        const widths = header.map((cell, column) =>
            Math.max(cell.length, ...rows.map((row) => row[column].length))
        );

        /**
         * Pads a row into fixed-width columns.
         *
         * @param {string[]} row - Cells.
         * @returns {string} Rendered line.
         */
        function renderRow(row) {
            return row
                .map((cell, column) =>
                    column === 0 ? cell.padEnd(widths[column]) : cell.padStart(widths[column])
                )
                .join('  ');
        }

        console.log(renderRow(header));
        console.log(widths.map((width) => '-'.repeat(width)).join('  '));

        for (const row of rows) {
            console.log(renderRow(row));
        }

        const totals = selected.reduce(
            (accumulator, area) => ({
                comments: accumulator.comments + area.comments,
                markup: accumulator.markup + area.markup,
                literals: accumulator.literals + area.literalLines,
                gated: accumulator.gated + area.gatedLiterals,
                messages: accumulator.messages + area.messages,
                titles: accumulator.titles + area.titles,
            }),
            { comments: 0, markup: 0, literals: 0, gated: 0, messages: 0, titles: 0 }
        );

        console.log(
            renderRow([
                'total',
                String(totals.comments),
                String(totals.markup),
                String(totals.literals),
                String(totals.gated),
                String(totals.messages),
                String(totals.titles),
                '',
            ])
        );

        if (options.list) {
            for (const area of selected) {
                if (area.files.size === 0) {
                    continue;
                }

                console.log(`\n[${area.id}] ${area.title}`);

                for (const [path, hits] of area.files) {
                    for (const hit of hits) {
                        console.log(`  ${path}:${hit.line} ${hit.kind} ${hit.text}`.trimEnd());
                    }
                }
            }
        }
    }

    // An explicitly selected area is being closed, so anything left is a
    // failure; without a selection only areas already marked done can fail,
    // which keeps the gate usable while the sprint is in progress
    /**
     * Remaining work of an area that closing the stage must bring to zero.
     *
     * @param {object} area - Area report.
     * @returns {number} Blocking count.
     */
    function blocking(area) {
        return area.cyrillicComments + area.markupComments + area.testTitles + area.gatedLiterals;
    }

    const failing = selected.filter((area) =>
        options.area ? blocking(area) > 0 : area.done && blocking(area) > 0
    );

    if (!options.area && unassigned.length > 0) {
        console.error(`\nFAIL: ${unassigned.length} path(s) belong to no area:`);

        for (const path of unassigned) {
            console.error(`  ${path}`);
        }
    }

    if (failing.length === 0) {
        return unassigned.length > 0 && !options.area ? 1 : 0;
    }

    for (const area of failing) {
        console.error(`FAIL area ${area.id} (${area.title}): translation is incomplete`);
    }

    return 1;
}

/**
 * Parses command line arguments.
 *
 * @param {string[]} argv - Raw arguments.
 * @returns {object} Options.
 */
function parseArgs(argv) {
    const options = { area: null, metric: null, json: false, list: false, diff: null };

    for (const argument of argv) {
        if (argument === '--json') {
            options.json = true;
        } else if (argument === '--list') {
            options.list = true;
        } else if (argument === '--diff') {
            options.diff = 'HEAD';
        } else if (argument.startsWith('--diff=')) {
            options.diff = argument.slice(7);
        } else if (argument.startsWith('--area=')) {
            options.area = argument.slice(7);
        } else if (argument.startsWith('--metric=')) {
            options.metric = argument.slice(9);

            if (!METRICS.includes(options.metric)) {
                console.error(
                    `Unknown metric: ${options.metric}; expected one of ${METRICS.join(', ')}`
                );
                process.exitCode = 2;

                throw new Error(`Unknown metric: ${options.metric}`);
            }
        } else {
            console.error(`Unknown argument: ${argument}`);
            process.exitCode = 2;

            throw new Error(`Unknown argument: ${argument}`);
        }
    }

    return options;
}

const options = parseArgs(process.argv.slice(2));

// `process.exitCode`, not `process.exit()`: stdout is asynchronous when it is a
// pipe, and an immediate exit drops whatever is still buffered, which truncated
// the JSON report mid-string
process.exitCode = options.diff ? (verifyDiff(options.diff) ? 0 : 1) : report(options);
