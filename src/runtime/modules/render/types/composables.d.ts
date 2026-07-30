import type { ComputedRef } from 'vue';

import type { IPublishedPage } from '../../common/types/bricks-api';

// #region useRendererDataSources
/**
 * Опции composable useRendererDataSources.
 */
export interface IRendererDataSourcesOptions {
    /** Данные текущей страницы (live-превью либо payload middleware). */
    page: ComputedRef<IPublishedPage | null>;
    pagename: string;
    isPreview: boolean;
}

/**
 * Результат прогона data sources в кеше `useAsyncData`: сами props и признак
 * того, что прогон неполон.
 *
 * Маркер лежит рядом с данными, а не в отдельном состоянии, потому что в payload
 * он обязан приехать вместе с ними: разъедься эти два значения — и клиент либо
 * повторял бы полный прогон, либо принимал бы неполный за полный.
 */
export interface IRendererDataSourcesData {
    /**
     * Слепок смёрдженных пропсов по компонентам. Ключ — `component.id` из схемы,
     * поэтому контейнер — `Map`: обычный объект при `id === '__proto__'` принял бы
     * пропсы в глобальный прототип.
     */
    props: Map<string, Record<string, unknown>>;
    /**
     * Прогон брошен по общему дедлайну: часть источников не ответила, и их
     * компоненты остались на fallback props.
     *
     * Смысл узкий — «прогон намеренно оборван по времени и требует одной
     * клиентской попытки». Превышение бюджета числа запросов, отказ отдельного
     * источника и ошибка импорта brick-файла сюда не входят: повтор их не
     * исправит, а на каждой published-странице стоил бы лишнего прогона.
     */
    isPartial: boolean;
}

/**
 * Возвращаемое значение composable useRendererDataSources.
 */
export interface IRendererDataSources {
    /** Слепок смёрдженных пропсов для всех компонентов с учётом data sources. */
    resolvedProps: ComputedRef<Map<string, Record<string, unknown>>>;
    /** Перезапускает выполнение data sources (например, при live-обновлении схемы). */
    refreshDataSources: () => Promise<void>;
    /** Промис первичного выполнения — await'ить на top-level setup (SSR-блокировка). */
    ready: Promise<unknown>;
}
// #endregion
