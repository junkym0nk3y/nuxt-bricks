// #region Imports
// Types
import type { IAsyncDataStub, TAsyncDataStubResult } from './types';

// Vue
import { shallowRef } from 'vue';
// #endregion

/**
 * Собирает стаб `useAsyncData` для unit-тестов композаблов.
 *
 * Воспроизводит поведения Nuxt, от которых зависит тестируемый код: handler
 * исполняется сразу (кроме режима готового ответа, см. `cachedData`), отказ
 * сбрасывает `data` в дефолт (то есть неудачный повтор результат прошлой
 * успешной загрузки не сохраняет), а возврат — одновременно объект состояния и
 * промис, как `AsyncData` у Nuxt. Последнее существенно: композабл читает
 * состояние до `await`, чтобы зарегистрировать хуки в живом scope.
 *
 * `data` — `shallowRef`, хотя в приложении конфигурация даёт глубокий
 * (`asyncDataDefaults.deep` = true): стаб намеренно отдаёт собранный объект, а не
 * прокси Vue поверх него. Иначе прокси перекрывал бы у полезной нагрузки члены
 * прототипа (`hasOwnProperty` и подобные) своими инструментами, и спеки про
 * прототипные ключи проверяли бы поведение реактивности вместо сборки значения.
 *
 * Кеш по ключу, число потребителей и очистку после размонтирования стаб не
 * моделирует: где это важно, тест поднимает новый экземпляр композабла сам. Не
 * моделирует и подмену повтора кешем во время гидрации — поэтому тесты вызывают
 * повтор через отложенный `onNuxtReady`, как это делает и рабочий код.
 *
 * @param cachedData - Готовый ответ из payload: с ним handler на первом заходе
 * не исполняется — так ведёт себя гидрация, и код, читающий результат только
 * внутри handler'а, на клиенте не получил бы его вовсе.
 * @param cachedError - Ошибка из payload (`_errors`): с ней Nuxt при гидрации
 * первый запрос тоже пропускает, то есть отказ SSR доезжает до клиента как
 * готовое состояние, а не как повторная попытка.
 * @returns Функция в форме `useAsyncData(key, handler)`.
 */
export function createUseAsyncDataStub<TData>(cachedData?: TData, cachedError?: unknown) {
    return function useAsyncDataStub(
        _key: string,
        handler: () => Promise<TData>
    ): TAsyncDataStubResult<TData> {
        const hasCachedData = cachedData !== undefined;
        const hasCachedError = cachedError !== undefined;
        const isHydrated = hasCachedData || hasCachedError;
        const data = shallowRef<TData | null>(hasCachedData ? (cachedData as TData) : null);
        const error = shallowRef<unknown>(hasCachedError ? cachedError : null);
        const status = shallowRef<string>(
            hasCachedError ? 'error' : hasCachedData ? 'success' : 'idle'
        );

        /**
         * Прогоняет handler, повторяя переходы состояний Nuxt.
         */
        async function refresh(): Promise<void> {
            status.value = 'pending';

            try {
                data.value = await handler();
                error.value = null;
                status.value = 'success';
            } catch (handlerError: unknown) {
                error.value = handlerError;
                data.value = null;
                status.value = 'error';
            }
        }

        const state: IAsyncDataStub<TData> = { data, error, status, refresh };
        const settled = isHydrated ? Promise.resolve() : refresh();

        return Object.assign(
            settled.then(() => state),
            state
        );
    };
}
