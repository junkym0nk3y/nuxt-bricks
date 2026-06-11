// #region Imports
import type { InjectionKey, Ref } from 'vue';
import type { TBricksDeviceKey } from '../types/brick';
// #endregion

/**
 * Активный viewport канваса (реактивный).
 * Провайдится `TheCanvas` (обычный режим, из canvas-store) и `CanvasViewport`
 * (Figma mode, per-viewport — ближайший провайдер выигрывает).
 * На published-странице провайдера нет — потребители используют fallback.
 */
export const CANVAS_VIEWPORT_KEY: InjectionKey<Ref<TBricksDeviceKey>> = Symbol('canvasViewport');
