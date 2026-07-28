/**
 * Контракты build-time хелперов setup'а (`src/module-setup.ts`): активные
 * поверхности модуля и контекст регистрации файловых сущностей.
 */
import type { Resolver } from '@nuxt/kit';
import type { IBricksRoutePrefixes } from '../runtime/modules/common/utils/bricks/routePaths';

/** Активные поверхности модуля: префиксы маршрутов + feature flags. */
export interface IBricksSurfaces {
    /** Валидированные префиксы билдера/превью. */
    routePrefixes: IBricksRoutePrefixes;
    /** UI билдера включён (страницы, плагины редактора, editorial API, i18n, Pinia). */
    isBuilderEnabled: boolean;
    /** Catch-all маршруты live-рендера включены. */
    arePublishedPagesEnabled: boolean;
}

/** Контекст регистрации файловых сущностей (страницы, ручки). */
export interface IBricksRegistrationContext {
    /** resolver модуля (createResolver(import.meta.url).resolve). */
    resolve: Resolver['resolve'];
    /** Абсолютный путь src/runtime. */
    runtimeDir: string;
    /** Активные поверхности. */
    surfaces: IBricksSurfaces;
}
