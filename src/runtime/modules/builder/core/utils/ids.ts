/**
 * Собирает идентификатор из префикса, метки времени и случайного суффикса.
 *
 * `crypto.randomUUID` здесь не годится: в браузере он доступен только в secure
 * context, на HTTP его нет вовсе.
 *
 * `useId` (Vue 3.5; в Nuxt — deprecated ре-экспорт из Vue) — тоже не замена, и
 * не только потому, что оба генератора зовут из pinia-экшенов, где активного
 * инстанса нет (там он пишет warn и возвращает пустую строку). Он выдаёт
 * счётчик на инстанс приложения (`v-0`, `v-1`, …), который стартует заново на
 * каждой загрузке страницы, а эти id персистятся в схему и в БД — новый пункт
 * столкнулся бы с уже сохранённым. `useId` решает задачу стабильности id
 * DOM-атрибута между SSR и клиентом, а не уникальности между сессиями.
 *
 * @param prefix - Префикс идентификатора.
 * @returns Строка ID в формате `<prefix>-<timestamp>-<random>`.
 */
function generateId(prefix: string): string {
    return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

/**
 * Генерирует уникальный идентификатор компонента Canvas.
 *
 * @returns Строка ID в формате `component-<timestamp>-<random>`.
 */
export function generateComponentId(): string {
    return generateId('component');
}

/**
 * Генерирует уникальный идентификатор навигационного пункта.
 *
 * @returns Строка ID в формате `nav-<timestamp>-<random>`.
 */
export function generateNavigationItemId(): string {
    return generateId('nav');
}
