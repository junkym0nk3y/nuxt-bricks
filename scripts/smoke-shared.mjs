/**
 * Shared helpers of the smoke scripts (pack-smoke, integration-smoke): running
 * processes, assertions and booting the production server of the consumer from .output.
 */
import { spawn } from 'node:child_process';
import { access } from 'node:fs/promises';
import { join } from 'node:path';
import process from 'node:process';

/**
 * Runs a command, streams its output and fails on a non-zero exit code.
 *
 * @param {string} command - Executable.
 * @param {string[]} args - Arguments.
 * @param {{ cwd?: string, env?: Record<string, string> }} options - Working directory and env.
 * @returns {Promise<void>} Resolves on exit 0.
 */
export function run(command, args, options = {}) {
    return new Promise((resolve, reject) => {
        const child = spawn(command, args, {
            cwd: options.cwd ?? process.cwd(),
            env: { ...process.env, ...options.env },
            stdio: 'inherit',
        });
        child.on('error', reject);
        child.on('exit', (code) => {
            if (code === 0) {
                resolve();
                return;
            }
            reject(new Error(`${command} ${args.join(' ')} exited with code ${code}`));
        });
    });
}

/**
 * Runs a command and returns its stdout (for npm pack and CLI output).
 *
 * @param {string} command - Executable.
 * @param {string[]} args - Arguments.
 * @param {string} cwd - Working directory.
 * @param {string} [input] - Data for the stdin of the process. Without it stdin is
 * closed — a command waiting for input would hang or get an EOF instead of a value.
 * @returns {Promise<string>} The stdout of the process.
 */
export function runCapture(command, args, cwd, input) {
    return new Promise((resolve, reject) => {
        const child = spawn(command, args, {
            cwd,
            env: process.env,
            stdio: [input === undefined ? 'ignore' : 'pipe', 'pipe', 'inherit'],
        });

        if (input !== undefined) {
            child.stdin.end(input);
        }

        let stdout = '';
        child.stdout.on('data', (chunk) => {
            stdout += chunk;
        });
        child.on('error', reject);
        child.on('exit', (code) => {
            if (code === 0) {
                resolve(stdout);
                return;
            }
            reject(new Error(`${command} ${args.join(' ')} exited with code ${code}`));
        });
    });
}

/**
 * An assertion with a readable failure message.
 *
 * @param {boolean} condition - The condition.
 * @param {string} message - The message to report on failure.
 */
export function assertOk(condition, message) {
    if (!condition) {
        throw new Error(`Smoke check failed: ${message}`);
    }
}

/**
 * Checks that a file exists inside the installed package.
 *
 * @param {string} path - Absolute path.
 * @param {string} label - Human-readable name for the error.
 * @returns {Promise<void>} Resolves when the file is there.
 */
export async function assertFileExists(path, label) {
    try {
        await access(path);
    } catch {
        throw new Error(`Smoke check failed: the package has no ${label} (${path})`);
    }
}

/**
 * Waits for a child process to actually exit after a kill: without that the next
 * bootServer on the same port races the old process — a request may land in it while
 * the new server dies with EADDRINUSE.
 *
 * @param {import('node:child_process').ChildProcess} child - The process being stopped.
 * @returns {Promise<void>} Resolves after the exit event, or right away when the process
 * is already dead.
 */
export function waitForExit(child) {
    return new Promise((resolve) => {
        if (child.exitCode !== null || child.signalCode !== null) {
            resolve();
            return;
        }
        child.once('exit', () => resolve());
    });
}

/**
 * Boots the production server of the consumer from .output and waits for readiness.
 *
 * @param {string} consumerDir - The consumer directory.
 * @param {{ port: number, env?: Record<string, string>, bootTimeoutMs?: number }} options
 * - The port, extra env of the server and the readiness timeout.
 * @returns {Promise<import('node:child_process').ChildProcess>} The server process.
 */
export async function bootServer(consumerDir, options) {
    const { port, env = {}, bootTimeoutMs = 30_000 } = options;
    const origin = `http://127.0.0.1:${port}`;
    const server = spawn('node', [join(consumerDir, '.output', 'server', 'index.mjs')], {
        cwd: consumerDir,
        env: {
            ...process.env,
            PORT: String(port),
            HOST: '127.0.0.1',
            NODE_ENV: 'production',
            ...env,
        },
        stdio: 'inherit',
    });
    const deadline = Date.now() + bootTimeoutMs;
    while (Date.now() < deadline) {
        if (server.exitCode !== null) {
            throw new Error(`The server exited before readiness with code ${server.exitCode}`);
        }
        try {
            await fetch(`${origin}/`, { signal: AbortSignal.timeout(2000) });
            return server;
        } catch {
            await new Promise((resolve) => {
                setTimeout(resolve, 500);
            });
        }
    }
    server.kill('SIGKILL');
    throw new Error(`The server did not come up within ${bootTimeoutMs} ms`);
}
