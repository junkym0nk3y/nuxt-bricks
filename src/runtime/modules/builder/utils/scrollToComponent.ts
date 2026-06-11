/**
 * Скроллит канвас до элемента с указанным component id.
 * В Figma-режиме скоупит поиск на указанный viewport,
 * чтобы не скроллить к дубликату из другого viewport-а.
 *
 * @param componentId - ID компонента для скролла.
 * @param viewport - Viewport для скоупинга поиска в Figma-режиме (mobile/tablet/desktop).
 */
export function scrollToComponentOnCanvas(componentId: string, viewport?: string): void {
    let el: HTMLElement | null = null;

    if (viewport) {
        const viewportContainer = document.querySelector<HTMLElement>(
            `[data-bricks-viewport="${viewport}"]`
        );
        if (viewportContainer) {
            el = viewportContainer.querySelector<HTMLElement>(
                `[data-component-id="${componentId}"]`
            );
        }
    }

    if (!el) {
        el = document.querySelector<HTMLElement>(`[data-component-id="${componentId}"]`);
    }

    if (!el) {
        return;
    }

    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
}
