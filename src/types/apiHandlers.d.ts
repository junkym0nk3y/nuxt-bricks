/**
 * Запись манифеста Nitro-ручек `/api/bricks/**` (`src/api-handlers.ts`):
 * маршрут, метод, файл относительно runtimeDir и признак public read-model.
 */

export interface IBricksApiHandler {
    /** Путь ручки целиком, включая параметры (`/api/bricks/:id`). */
    route: string;
    /** HTTP-метод; без него ручка отвечает на любой. */
    method?: 'get' | 'post' | 'put' | 'patch' | 'delete';
    /** Путь файла-обработчика от `runtimeDir`, без расширения. */
    file: string;
    /**
     * Public read-model (открыт без auth, нужен live-рендеру) — регистрируется
     * и в render-only режиме (features.builder: false); editorial/auth-ручки
     * без него пропускаются.
     */
    isPublic?: boolean;
}
