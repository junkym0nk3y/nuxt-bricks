/**
 * The public entry `nuxt-bricks/sanitize` — sanitizers for the consumer's custom brick
 * components that render raw HTML/SVG (v-html) out of a schema. The built-in blocks of
 * the module already sanitize their output with these very functions.
 */
export { sanitizeRichTextHtml } from './sanitizeRichText';
export { sanitizeSvgMarkup } from './sanitizeSvg';
