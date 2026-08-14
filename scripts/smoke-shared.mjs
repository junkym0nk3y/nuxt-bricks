/**
 * Общие хелперы smoke-скриптов (pack-smoke, integration-smoke): запуск
 * процессов, утверждения и boot прод-сервера consumer'а из .output.
 */
import { spawn } from 'node:child_process';
import { access } from 'node:fs/promises';
import { join } from 'node:path';
import process from 'node:process';

/**
 * Запускает команду, стримит вывод и падает при ненулевом exit code.
 *
 * @param {string} command Исполняемый файл.
 * @param {string[]} args Аргументы.
 * @param {{ cwd?: string, env?: Record<string, string> }} options Рабочая папка и env.
 * @returns {Promise<void>} Резолвится при exit 0.
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
            reject(new Error(`${command} ${args.join(' ')} завершился с кодом ${code}`));
        });
    });
}

/**
 * Запускает команду и возвращает stdout (для npm pack, CLI-выводов).
 *
 * @param {string} command Исполняемый файл.
 * @param {string[]} args Аргументы.
 * @param {string} cwd Рабочая папка.
 * @param {string} [input] Данные на stdin процесса. Без него stdin закрыт —
 * команда, ожидающая ввода, повисла бы или получила EOF вместо значения.
 * @returns {Promise<string>} stdout процесса.
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
            reject(new Error(`${command} ${args.join(' ')} завершился с кодом ${code}`));
        });
    });
}

/**
 * Утверждение с понятным сообщением об ошибке.
 *
 * @param {boolean} condition Условие.
 * @param {string} message Сообщение при провале.
 */
export function assertOk(condition, message) {
    if (!condition) {
        throw new Error(`Smoke-проверка провалена: ${message}`);
    }
}

/**
 * Проверяет существование файла внутри установленного пакета.
 *
 * @param {string} path Абсолютный путь.
 * @param {string} label Человекочитаемое имя для ошибки.
 * @returns {Promise<void>} Резолвится, если файл есть.
 */
export async function assertFileExists(path, label) {
    try {
        await access(path);
    } catch {
        throw new Error(`Smoke-проверка провалена: в пакете нет ${label} (${path})`);
    }
}

/**
 * Ждёт фактического завершения child-процесса после kill: без этого следующий
 * bootServer на том же порту гоняется со старым процессом — запрос может
 * попасть в него, а новый сервер умереть с EADDRINUSE (ре-ревью P2).
 *
 * @param {import('node:child_process').ChildProcess} child Завершаемый процесс.
 * @returns {Promise<void>} Резолвится после события exit (или сразу, если процесс уже мёртв).
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
 * Поднимает прод-сервер consumer'а из .output и ждёт готовности.
 *
 * @param {string} consumerDir Папка consumer.
 * @param {{ port: number, env?: Record<string, string>, bootTimeoutMs?: number }} options
 * Порт, дополнительный env сервера и таймаут готовности.
 * @returns {Promise<import('node:child_process').ChildProcess>} Процесс сервера.
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
            throw new Error(`Сервер завершился до готовности с кодом ${server.exitCode}`);
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
    throw new Error(`Сервер не поднялся за ${bootTimeoutMs} мс`);
}
