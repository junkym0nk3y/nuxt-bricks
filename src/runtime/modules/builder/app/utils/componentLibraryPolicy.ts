/**
 * Политика загрузки библиотеки компонентов (чистые функции).
 *
 * Здесь живёт знание об одном исходе запроса манифеста — «ответ не дошёл за
 * SSR-дедлайн», — который обрабатывается иначе, чем остальные отказы: результат
 * деградирует до layout-блоков вместо отклонения загрузки.
 */

// #region Constants
/**
 * Имя ошибки SSR-дедлайна запроса манифеста. Отдельное имя, а не `TimeoutError`:
 * по нему загрузка отличает свой дедлайн от обрыва запроса на потолке транспорта
 * и от чужой ошибки с тем же именем. Совпади имена — любой транспортный таймаут
 * молча превращался бы в деградированную библиотеку с клиентским повтором.
 */
const COMPONENT_MANIFEST_DEADLINE_ERROR_NAME = 'BricksComponentManifestDeadlineError';
// #endregion

/**
 * Создаёт ошибку SSR-дедлайна запроса манифеста компонентов.
 *
 * @param deadlineMs - Дедлайн ожидания ответа ручки, мс.
 * @returns Ошибка с опознаваемым именем.
 */
export function createComponentManifestDeadlineError(deadlineMs: number): Error {
    const error = new Error(
        `Bricks components manifest request exceeded its deadline (${deadlineMs}ms budget)`
    );
    error.name = COMPONENT_MANIFEST_DEADLINE_ERROR_NAME;

    return error;
}

/**
 * Ошибка — SSR-дедлайн запроса манифеста компонентов.
 *
 * @param error - Произвольная ошибка.
 * @returns Это дедлайн запроса манифеста.
 */
export function isComponentManifestDeadlineError(error: unknown): boolean {
    return error instanceof Error && error.name === COMPONENT_MANIFEST_DEADLINE_ERROR_NAME;
}
