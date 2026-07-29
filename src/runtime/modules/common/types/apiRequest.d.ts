/**
 * Типы политики запросов билдера (`utils/apiRequestPolicy.ts`).
 */

// #region apiRequestPolicy
/**
 * Узкий срез опций запроса, которым распоряжается политика таймаутов.
 * Структурно совместим с `ResolvedFetchOptions` ofetch, но не тянет его тип:
 * политика — чистая утилита и о транспорте знать не обязана.
 */
export interface IApiRequestTimeoutTarget {
    /** HTTP-метод запроса; у GET ofetch его не заполняет. */
    method?: string;
    /** Потолок ожидания в миллисекундах. */
    timeout?: number;
    /** Сигнал отмены, переданный вызывающим. */
    signal?: AbortSignal | null;
}
// #endregion
