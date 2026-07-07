// #region Imports
import type { InjectionKey, Ref } from 'vue';
import type { TBricksDeviceKey } from '../types/brick';
import type { IInlineEditorHost } from '../types/inlineEditing';
// #endregion

/**
 * Активный viewport канваса (реактивный).
 * Провайдится `TheBuilderCanvas` (обычный режим, из canvas-store) и `BuilderCanvasViewport`
 * (Figma mode, per-viewport — ближайший провайдер выигрывает).
 * На published-странице провайдера нет — потребители используют fallback.
 */
export const CANVAS_VIEWPORT_KEY: InjectionKey<Ref<TBricksDeviceKey>> = Symbol('canvasViewport');

/**
 * Порт inline editing к состоянию билдера (пропы + история).
 * Провайдится `TheBuilderCanvas`; на published-странице провайдера нет —
 * `useInlineEditor` без хоста не инициализирует редактор.
 */
export const INLINE_EDITOR_HOST_KEY: InjectionKey<IInlineEditorHost> = Symbol('inlineEditorHost');
