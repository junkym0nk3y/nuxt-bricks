/**
 * Comment-only diff check: proves a translation pass moved no logic.
 *
 * Every changed file is projected down to its code in both revisions, and the
 * projections must be identical. That is stronger than any linter — it shows the
 * logic did not change, instead of showing that the changed logic still passes.
 */

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { projectCode } from './comment-lines.mjs';
import { ROOT, isScannedPath, listFiles, resolveArea } from './comment-sprint-areas.mjs';

/**
 * Reports the first place two code projections diverge.
 *
 * @param {string[]} previous - Code lines before.
 * @param {string[]} current - Code lines after.
 * @returns {string} Human-readable description of the divergence.
 */
function describeDivergence(previous, current) {
    const limit = Math.min(previous.length, current.length);

    for (let position = 0; position < limit; position += 1) {
        if (previous[position] !== current[position]) {
            return `code line ${position + 1} of the projection changed: ${previous[position]} -> ${current[position]}`;
        }
    }

    return `code line count changed: ${previous.length} -> ${current.length}`;
}

/**
 * Asserts that a diff changed comments only.
 *
 * Every changed file is projected down to its code (comments blanked, blank
 * lines dropped) in both revisions, and the projections must be identical.
 * Comparing projections rather than asking whether each changed line "is a
 * comment line" is what makes the check honest: a line carrying a trailing
 * comment is a comment line by that weaker rule, so rewriting the code on it
 * would pass.
 *
 * @param {string} ref - Git ref to compare against.
 * @returns {boolean} The diff is comment-only.
 */
export function verifyDiff(ref) {
    const changed = execFileSync('git', ['diff', '--name-status', ref], {
        cwd: ROOT,
        encoding: 'utf8',
        maxBuffer: 64 * 1024 * 1024,
    })
        .split('\n')
        .filter(Boolean)
        .map((line) => line.split('\t'));
    const violations = [];
    const skipped = [];
    const textChanged = [];
    let inspected = 0;

    // Untracked files are invisible to `git diff`, so a file created during the
    // stage — or a rename done as delete plus untracked add — would pass unseen.
    // They are not comment-verifiable: there is no previous revision to compare
    for (const path of listFiles({ untrackedOnly: true })) {
        if (!resolveArea(path)) {
            skipped.push(path);
            continue;
        }

        violations.push(`${path}: untracked — a new file cannot be a comment-only change`);
    }

    for (const [status, path] of changed) {
        // Out-of-scope paths are skipped rather than failed: sprint bookkeeping
        // lands in `docs/**` and `PAPERCUTS.md` in the same working tree, and a
        // note about the translation is not a translation
        if (!resolveArea(path)) {
            skipped.push(path);
            continue;
        }

        if (!isScannedPath(path)) {
            violations.push(`${path}: file type is not comment-checkable`);
            continue;
        }

        if (status !== 'M') {
            violations.push(
                `${path}: ${status} — added or removed whole files cannot be comment-only`
            );
            continue;
        }

        inspected += 1;
        const previous = execFileSync('git', ['show', `${ref}:${path}`], {
            cwd: ROOT,
            encoding: 'utf8',
            maxBuffer: 64 * 1024 * 1024,
        });
        const current = readFileSync(resolve(ROOT, path), 'utf8');
        const before = projectCode(path, previous);
        const after = projectCode(path, current);

        if (before.join('\n') !== after.join('\n')) {
            violations.push(`${path}: ${describeDivergence(before, after)}`);
            continue;
        }

        // Text the sprint translates outside comments (dev messages, case titles,
        // comments of generated CSS/SQL) is collapsed by the projection, so a
        // rewrite of it lands here rather than among the violations. Reported all
        // the same: "code identical" and "code identical, one message rewritten"
        // are different claims, and silence would hide the second one
        const strict = { normalizeText: false };

        if (
            projectCode(path, previous, strict).join('\n') !==
            projectCode(path, current, strict).join('\n')
        ) {
            textChanged.push(path);
        }
    }

    console.log(
        `Diff against ${ref}: ${inspected} file(s) inspected` +
            (skipped.length > 0 ? `, ${skipped.length} out of scope (${skipped.join(', ')})` : '') +
            (textChanged.length > 0
                ? `, ${textChanged.length} with translated text outside comments (${textChanged.join(', ')})`
                : '')
    );

    if (violations.length === 0) {
        console.log('Comment-only diff confirmed');

        return true;
    }

    console.error(`\n${violations.length} file(s) changed outside comments:`);

    for (const violation of violations) {
        console.error(`  ${violation}`);
    }

    return false;
}
