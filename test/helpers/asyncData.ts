// #region Imports
// Types
import type { IAsyncDataStub } from './types';

// Vue
import { shallowRef } from 'vue';
// #endregion

/**
 * Собирает стаб `useAsyncData` для unit-тестов композаблов.
 *
 * Воспроизводит два поведения Nuxt, от которых зависит тестируемый код: handler
 * исполняется сразу (кроме режима готового ответа, см. `cachedData`), а отказ
 * сбрасывает `data` в дефолт — то есть неудачный повтор результат прошлой
 * успешной загрузки не сохраняет.
 *
 * `data` — `shallowRef`, хотя в приложении конфигурация даёт глубокий
 * (`asyncDataDefaults.deep` = true): стаб намеренно отдаёт собранный объект, а не
 * прокси Vue поверх него. Иначе прокси перекрывал бы у полезной нагрузки члены
 * прототипа (`hasOwnProperty` и подобные) своими инструментами, и спеки про
 * прототипные ключи проверяли бы поведение реактивности вместо сборки значения.
 *
 * Кеш по ключу, число потребителей и очистку после размонтирования стаб не
 * моделирует: где это важно, тест поднимает новый экземпляр композабла сам.
 *
 * @param cachedData - Готовый ответ из payload: с ним handler на первом заходе
 * не исполняется — так ведёт себя гидрация, и код, читающий результат только
 * внутри handler'а, на клиенте не получил бы его вовсе.
 * @returns Функция в форме `useAsyncData(key, handler)`.
 */
export function createUseAsyncDataStub<TData>(cachedData?: TData) {
    return async function useAsyncDataStub(
        _key: string,
        handler: () => Promise<TData>
    ): Promise<IAsyncDataStub<TData>> {
        const hasCachedData = cachedData !== undefined;
        const data = shallowRef<TData | null>(hasCachedData ? (cachedData as TData) : null);
        const error = shallowRef<unknown>(null);
        const status = shallowRef<string>(hasCachedData ? 'success' : 'idle');

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

        if (!hasCachedData) {
            await refresh();
        }

        return { data, error, status, refresh };
    };
}
