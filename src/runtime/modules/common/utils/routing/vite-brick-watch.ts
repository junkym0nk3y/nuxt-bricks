import type { Plugin, ViteDevServer, HotUpdateOptions } from 'vite';
import generateStoriesJson from './generate-stories-json.mjs';

const BRICK_PATTERN = /\.brick\.ts$/;

/**
 * Sends full-reload to connected clients.
 * Vite 6+ uses server.hot, older versions use server.ws.
 */
function sendFullReload(server: ViteDevServer): void {
    const channel = server.hot ?? server.ws;
    channel?.send({ type: 'full-reload' });
}

/**
 * Vite plugin to watch *.brick.ts files,
 * re-generate the stories JSON, and force a full-reload.
 *
 * Примечание: при добавлении НОВЫХ файлов `import.meta.glob` может не подхватить их
 * без перезапуска dev server. В этом случае нужен hard refresh (Cmd+Shift+R)
 * или полный перезапуск: `rm -rf .nuxt node_modules/.vite && npm run dev`
 */
export function brickWatchPlugin(isPlayground = false): Plugin {
    return {
        name: 'brick-watch',
        apply: 'serve',
        configureServer(server) {
            /**
             * Обрабатывает добавление нового .brick.ts файла.
             */
            const handleFileAdd = async (file: string): Promise<void> => {
                if (!BRICK_PATTERN.test(file)) {
                    return;
                }

                console.log(`[brick-watch] File added: ${file}`);
                await generateStoriesJson(isPlayground);
                sendFullReload(server);
            };

            /**
             * Обрабатывает удаление .brick.ts файла.
             */
            const handleFileUnlink = async (file: string): Promise<void> => {
                if (!BRICK_PATTERN.test(file)) {
                    return;
                }

                console.log(`[brick-watch] File removed: ${file}`);
                await generateStoriesJson(isPlayground);
                sendFullReload(server);
            };

            server.watcher.on('add', handleFileAdd);
            server.watcher.on('unlink', handleFileUnlink);

            server.httpServer?.once('close', () => {
                server.watcher.off('add', handleFileAdd);
                server.watcher.off('unlink', handleFileUnlink);
            });
        },
        // Vite 6+ hook (приоритетный)
        hotUpdate(ctx: HotUpdateOptions) {
            if (BRICK_PATTERN.test(ctx.file)) {
                generateStoriesJson(isPlayground).then(() => {
                    sendFullReload(ctx.server);
                });
            }
        },
        // Vite 5 fallback (deprecated в Vite 6+, но нужен для Nuxt 3)
        async handleHotUpdate(ctx) {
            if (BRICK_PATTERN.test(ctx.file)) {
                await generateStoriesJson(isPlayground);
                sendFullReload(ctx.server);
            }
        },
    };
}
