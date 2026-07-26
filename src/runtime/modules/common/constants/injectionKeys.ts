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
 * Активна ли drag-сессия на canvas. Layout-блоки используют сигнал, чтобы скрыть
 * пустые drop-маркеры («Drop components here») и сбросить локальное drag-состояние
 * зоны по завершении сессии. Вспомогательная сетка (тумблер) при драге остаётся.
 */
export const CANVAS_DRAG_ACTIVE_KEY = Symbol.for('nuxt-bricks.canvasDragActive') as InjectionKey<
    Ref<boolean>
>;

/**
 * Порт inline editing к состоянию билдера (пропы + история).
 * Провайдится `TheBuilderCanvas`; на published-странице провайдера нет —
 * `useInlineEditor` без хоста не инициализирует редактор.
 */
export const INLINE_EDITOR_HOST_KEY: InjectionKey<IInlineEditorHost> = Symbol('inlineEditorHost');
