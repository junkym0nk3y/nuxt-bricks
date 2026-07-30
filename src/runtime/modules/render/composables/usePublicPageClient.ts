// #region Imports
// Types
import type { TPublicRequestOptions } from '../types/render';

// Utils
import {
    applyApiRequestTimeout,
    normalizeRequestAbortError,
} from '../../common/utils/apiRequestPolicy';

// Nuxt
import { useRuntimeConfig } from '#imports';
// #endregion

// #region Data
/**
 * Таймаут запроса published-страницы: повисший backend не должен держать
 * посетителя дольше этого лимита (паттерн data sources).
 *
 * Оговорка про SSR: относительный URL на сервере выполняется внутренним вызовом
 * Nitro (`fetchNodeRequestHandler`), а он `AbortSignal` не слушает — этот
 * потолок там инертен. SSR-путь ограничивает внешний дедлайн вокруг lookup'а в
 * `bricks-page-layout.global.ts`; здесь потолок работает на клиенте и при
 * внешнем backend'е.
 */
export const PUBLIC_PAGE_REQUEST_TIMEOUT_MS = 10_000;
// #endregion

// #region Methods
/**
 * Резолвит base URL для запросов публичного read-model.
 * SSR: относительный `app.baseURL` — серверный `$fetch` (Nitro) выполняет
 * относительные запросы внутренним вызовом обработчика (в т.ч. через proxy
 * middleware /api/*), без построения origin из Host-заголовка.
 * Клиент: `origin + app.baseURL` — сразу под base, без 302 base-redirect.
 *
 * @param appBaseURL - `app.baseURL` приложения.
 * @param isServer - Выполняется ли код на сервере (SSR).
 * @param origin - `window.location.origin` (только на клиенте).
 */
export function resolvePublicPageBaseUrl(
    appBaseURL: string,
    isServer: boolean,
    origin?: string
): string {
    const basePath = appBaseURL.endsWith('/') ? appBaseURL : `${appBaseURL}/`;

    if (isServer) {
        return basePath;
    }

    return `${origin ?? ''}${basePath}`;
}
// #endregion

/**
 * Отдельный HTTP-клиент для lookup'а published-страницы (live-путь рендера) —
 * публичный контекст посетителя, политики намеренно отличаются от useApiClient
 * (клиента билдера): без проброса cookie и x-forwarded-* (identity посетителя
 * не утекает во внешний backend), без CSRF, без 401-редиректа на login
 * (ошибка публичного lookup'а не должна отправлять посетителя на страницу
 * логина билдера — она превращается в 404), с таймаутом и без ретраев
 * (детерминированный SSR). Паттерн — useDataSourceClient.
 *
 * Маршрутизация та же, что у остального API: относительные URL на SSR
 * выполняются внутренним вызовом Nitro (при сконфигурированной БД — локальные
 * persistence-ручки, иначе proxy middleware уводит /api/* на PROXY_URL),
 * на клиенте — под `app.baseURL`.
 *
 * @returns Фетчер публичного read-model.
 */
export function usePublicPageClient() {
    const config = useRuntimeConfig();
    const appBaseURL = (config.app?.baseURL as string | undefined) || '/';

    const baseURL = resolvePublicPageBaseUrl(
        appBaseURL,
        Boolean(import.meta.server),
        import.meta.client ? window.location.origin : undefined
    );

    // Потолка в опциях инстанса нет намеренно: его ставит обёртка ниже, и держать
    // второе объявление того же бюджета значило бы дать ему шанс разъехаться
    const rawPublicPageFetcher = globalThis.$fetch.create({
        baseURL,
        retry: 0,
        // Публичный контекст: cookies посетителя lookup'у страницы не нужны
        credentials: 'omit',
    });

    /**
     * Выполняет lookup с потолком ожидания на обе фазы ответа.
     *
     * Опция `timeout` выше — только декларация бюджета: её таймер ofetch снимает
     * на заголовках, и зависшее тело держало бы посетителя без границы. Политика
     * переводит бюджет в живой сигнал, а `normalizeRequestAbortError` возвращает
     * обрыву опознаваемое имя там, где платформа его потеряла (браузер на фазе
     * чтения тела). Через `.raw`, потому что на переменном URL вывод типа ответа
     * по Nitro-роутам упирается в предел рекурсии компилятора.
     *
     * @param request - Путь запроса.
     * @param options - Опции запроса.
     * @returns Тело ответа.
     */
    async function publicPageFetcher<T = unknown>(
        request: string,
        options: TPublicRequestOptions = {}
    ): Promise<T> {
        const requestOptions: TPublicRequestOptions = {
            timeout: PUBLIC_PAGE_REQUEST_TIMEOUT_MS,
            ...options,
        };
        const effectiveSignal = applyApiRequestTimeout(request, requestOptions);

        try {
            const response = await rawPublicPageFetcher.raw(request, requestOptions);

            return response._data as T;
        } catch (error: unknown) {
            throw normalizeRequestAbortError(error, effectiveSignal);
        }
    }

    return {
        publicPageFetcher,
    };
}
