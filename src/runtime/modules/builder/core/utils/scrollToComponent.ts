/**
 * Scrolls the canvas to the element carrying the given component id.
 * In Figma mode the lookup is scoped to the named viewport, so it does not scroll
 * to the twin of the same component rendered in another viewport.
 *
 * @param componentId - Id of the component to scroll to.
 * @param viewport - Device key of the viewport that scopes the lookup in Figma mode.
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
