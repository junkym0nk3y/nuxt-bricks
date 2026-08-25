#!/usr/bin/env node
/**
 * Benchmark of the scrypt parameters of the password hashing.
 *
 * It exists because the parameters cannot be chosen by reading the recommendation:
 * the same configuration costs a different amount of time on every instance, and the
 * memory of one derivation is multiplied by the concurrency limit of the semaphore.
 * Re-run it after a change of the Node or OpenSSL version, of the parameters
 * themselves, or of the minimum production instance the installation is meant for.
 *
 * Not a test and not a CI gate: a threshold on time would be red on a loaded machine
 * and green on a fast one, which says nothing about either. The result is a
 * measurement to be read by a person and written down in the decision.
 *
 * Usage:
 *   node scripts/benchmark-scrypt.mjs
 *   node scripts/benchmark-scrypt.mjs --n=131072 --p=1 --runs=5
 *
 * The peak RSS is measured in a child process of its own: a high-water mark inside a
 * long-lived process keeps the peak of the previous profile, so every profile would
 * report the largest one measured so far.
 */

import { randomBytes, scrypt } from 'node:crypto';
import { fork } from 'node:child_process';
import { performance } from 'node:perf_hooks';
import { fileURLToPath } from 'node:url';

/** Derived key length in bytes — the same as the one the hashing uses */
const KEYLEN = 64;
/** Derivations thrown away before the measurement: the first ones pay for warm-up */
const WARMUP_RUNS = 2;
/** A password of an ordinary length: the cost of scrypt does not depend on it */
const PASSWORD = 'benchmark-password-of-average-length';

/**
 * Reads the arguments of the command line.
 *
 * @returns {{ n: number, r: number, p: number, concurrency: number, runs: number, child: boolean }}
 */
function readOptions() {
    const args = new Map(
        process.argv
            .slice(2)
            .filter((argument) => argument.startsWith('--'))
            .map((argument) => {
                const [name, value = 'true'] = argument.slice(2).split('=');
                return [name, value];
            })
    );

    return {
        n: Number(args.get('n') ?? 16384),
        r: Number(args.get('r') ?? 8),
        p: Number(args.get('p') ?? 5),
        concurrency: Number(args.get('concurrency') ?? 2),
        runs: Number(args.get('runs') ?? 10),
        child: args.get('child') === 'true',
    };
}

/**
 * The memory OpenSSL asks for one derivation: the V buffer plus the B buffer.
 *
 * @param {{ n: number, r: number, p: number }} params - The scrypt parameters.
 * @returns {number} Bytes.
 */
function derivationMemory({ n, r, p }) {
    return 128 * r * (n + 2) + 128 * r * p;
}

/**
 * One derivation.
 *
 * @param {{ n: number, r: number, p: number }} params - The scrypt parameters.
 * @param {number} maxmem - The memory ceiling passed to scrypt.
 */
function derive(params, maxmem) {
    return new Promise((resolve, reject) => {
        scrypt(
            PASSWORD,
            randomBytes(16),
            KEYLEN,
            { N: params.n, r: params.r, p: params.p, maxmem },
            (error, key) => (error ? reject(error) : resolve(key))
        );
    });
}

/**
 * The percentile of a sorted series.
 *
 * @param {number[]} sorted - Ascending durations.
 * @param {number} share - The share, from 0 to 1.
 */
function percentile(sorted, share) {
    const index = Math.min(sorted.length - 1, Math.ceil(share * sorted.length) - 1);

    return sorted[Math.max(0, index)];
}

/**
 * Serial derivations: the time a person waits for one sign-in.
 *
 * @param {{ n: number, r: number, p: number, runs: number }} options
 * @param {number} maxmem - The memory ceiling passed to scrypt.
 */
async function measureSerial(options, maxmem) {
    for (let index = 0; index < WARMUP_RUNS; index += 1) {
        await derive(options, maxmem);
    }

    const durations = [];

    for (let index = 0; index < options.runs; index += 1) {
        const started = performance.now();
        await derive(options, maxmem);
        durations.push(performance.now() - started);
    }

    durations.sort((first, second) => first - second);

    return {
        p50: percentile(durations, 0.5),
        p95: percentile(durations, 0.95),
        max: durations[durations.length - 1],
    };
}

/**
 * The child measurement: `concurrency` derivations at once and the high-water mark of
 * the RSS of this process.
 *
 * @param {{ n: number, r: number, p: number, concurrency: number }} options
 * @param {number} maxmem - The memory ceiling passed to scrypt.
 */
async function measureConcurrentPeak(options, maxmem) {
    const baselineRss = process.memoryUsage.rss();
    const started = performance.now();

    await Promise.all(Array.from({ length: options.concurrency }, () => derive(options, maxmem)));

    // resourceUsage().maxRSS is in kilobytes
    return {
        wallMs: performance.now() - started,
        baselineRssBytes: baselineRss,
        peakRssBytes: process.resourceUsage().maxRSS * 1024,
    };
}

/**
 * Runs the child measurement of the peak RSS.
 *
 * @param {{ n: number, r: number, p: number, concurrency: number }} options
 */
function runChild(options) {
    return new Promise((resolve, reject) => {
        const child = fork(fileURLToPath(import.meta.url), [
            '--child',
            `--n=${options.n}`,
            `--r=${options.r}`,
            `--p=${options.p}`,
            `--concurrency=${options.concurrency}`,
        ]);

        child.on('message', resolve);
        child.on('error', reject);
        child.on('exit', (code) => {
            if (code !== 0) {
                reject(new Error(`The child measurement exited with code ${code}`));
            }
        });
    });
}

const options = readOptions();
const memory = derivationMemory(options);
// The ceiling of the hashing itself: the parameters have to fit into it
const maxmem = 32 * 1024 * 1024;

if (options.child) {
    const peak = await measureConcurrentPeak(options, maxmem);
    process.send(peak);
    process.exit(0);
}

const label = `N=2^${Math.log2(options.n)} r=${options.r} p=${options.p}`;
const mib = (bytes) => `${(bytes / 1024 / 1024).toFixed(1)} MiB`;

console.log(`[benchmark-scrypt] ${label}, keylen ${KEYLEN}, maxmem ${mib(maxmem)}`);
console.log(`[benchmark-scrypt] one derivation asks for ${mib(memory)}`);

if (memory > maxmem) {
    console.error(
        `[benchmark-scrypt] These parameters do not fit into maxmem ${mib(maxmem)}: ` +
            'scrypt would refuse them. Raise the ceiling in passwords.ts deliberately, ' +
            'together with the concurrency of the semaphore.'
    );
    process.exit(1);
}

const serial = await measureSerial(options, maxmem);
console.log(
    `[benchmark-scrypt] serial (${options.runs} runs): p50 ${serial.p50.toFixed(0)} ms, ` +
        `p95 ${serial.p95.toFixed(0)} ms, max ${serial.max.toFixed(0)} ms`
);

const peak = await runChild(options);
console.log(
    `[benchmark-scrypt] ${options.concurrency} at once: wall ${peak.wallMs.toFixed(0)} ms, ` +
        `RSS ${mib(peak.baselineRssBytes)} → ${mib(peak.peakRssBytes)} ` +
        `(+${mib(peak.peakRssBytes - peak.baselineRssBytes)})`
);
