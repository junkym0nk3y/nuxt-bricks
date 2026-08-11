/**
 * Типы ingress-контроля чтения тела запроса
 * (`server/utils/requestBodyLimits.ts`).
 */

/**
 * Бюджет одновременно буферизуемых тел запросов.
 */
export interface IInflightBodyBudget {
    /**
     * Резервирует место под тело; 503, если места нет.
     *
     * @param bytes - Резервируемый объём.
     * @returns Освобождение резерва (идемпотентно).
     */
    reserve(bytes: number): () => void;
}

/**
 * Резерв тела запроса: потолок чтения и освобождение бюджета.
 */
export interface IBodyReservation {
    /** Сколько байт согласны прочитать — не больше зарезервированного. */
    limitBytes: number;
    release: () => void;
}
