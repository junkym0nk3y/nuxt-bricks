/**
 * Публичный вход `nuxt-bricks/sanitize` — санитайзеры для кастомных
 * brick-компонентов потребителя, рендерящих raw HTML/SVG (v-html) из схемы.
 * Встроенные блоки модуля уже санитизируют вывод этими же функциями.
 */
export { sanitizeRichTextHtml } from './sanitizeRichText';
export { sanitizeSvgMarkup } from './sanitizeSvg';
