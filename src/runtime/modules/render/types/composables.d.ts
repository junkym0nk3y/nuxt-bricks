import type { ComputedRef, Ref } from 'vue';

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

// #region useBricksDataSources
/** Кеш ответов одного прогона: одинаковые (method + url) запросы выполняются один раз. */
export type TDataSourceRequestCache = Map<string, Promise<unknown>>;
// #endregion

// #region useRendererPreviewSync
/**
 * Опции composable useRendererPreviewSync.
 */
export interface IRendererPreviewSyncOptions {
    pagename: string;
    isPreview: boolean;
    /**
     * Id сохранённой версии из `?version=` (null — превью текущего состояния).
     * Вкладка версии показывает состояние из истории: live-синк с билдером и
     * снапшот из localStorage для неё выключены.
     */
    previewVersionId: number | null;
    /** Данные страницы из payload middleware (БД). */
    middlewarePageData: Ref<IPublishedPage | null>;
    /** Live-данные превью: заполняются из localStorage и BroadcastChannel. */
    livePreviewData: Ref<IPublishedPage | null>;
    /** Итоговые данные страницы (live-превью либо payload middleware). */
    page: ComputedRef<IPublishedPage | null>;
    /** Перезапуск data sources при смене данных страницы. */
    refreshDataSources: () => void;
}

/**
 * Device-брейкпоинт превью: порог ширины и иконка для баннера.
 */
export interface IPreviewDeviceBreakpoint {
    name: string;
    minWidth: number;
    icon: string;
}

/**
 * Возвращаемое значение composable useRendererPreviewSync.
 */
export interface IRendererPreviewSync {
    /** Активный device-брейкпоинт по текущей ширине окна (для баннера превью). */
    currentDevice: ComputedRef<IPreviewDeviceBreakpoint>;
    /** Текст текущего разрешения окна (для баннера превью). */
    resolutionText: ComputedRef<string>;
    /** Закрывает окно превью и очищает сохранённые данные превью. */
    closePreview: () => void;
}
// #endregion
