/**
 * @vitest-environment happy-dom
 *
 * The highlight of a layout drop zone: when it is taken down and when it survives.
 *
 * The defect the spec is written for: `handleDragEnter` raised a nesting counter on every
 * `dragenter` it received, and the handler sits on the container, so events bubbled up
 * from the children too. `handleDragLeave` left early on a move between children without
 * lowering anything, so the counter never came back to zero, and the first real exit of
 * the cursor did not take the highlight down — it stayed until the end of the drag
 * session.
 *
 * What is left unverified here is the order of the native Chromium events and the value
 * of `relatedTarget` when the pointer leaves for another window.
 */

// #region Imports
// Vitest
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Vue
import { ref } from 'vue';

// Composables
import { useLayoutDropZone } from '../../src/runtime/modules/layouts-blocks/composables/useLayoutDropZone';
// #endregion

/**
 * Builds a drop zone container with one child, the way a section with a single block
 * looks: the child is what the bubbled `dragenter` events come from.
 *
 * @returns The container element.
 */
function buildZoneContainer(): HTMLElement {
    document.body.innerHTML = `
        <div id="zone">
            <div id="child"></div>
        </div>
    `;

    return document.getElementById('zone') as HTMLElement;
}

/**
 * Minimal drag event: the payload type is what `applyDropEffect` reads.
 *
 * @param relatedTarget - Where the cursor is heading (the target of a leave).
 * @returns The event.
 */
function createDragEvent(relatedTarget: EventTarget | null = null): DragEvent {
    const event = new Event('dragenter') as DragEvent;

    return Object.assign(event, {
        relatedTarget,
        dataTransfer: {
            types: ['component-id'],
            dropEffect: '',
            getData: () => '',
        },
    });
}

/**
 * Sets up the zone over a prepared container.
 *
 * @param container - Container element of the zone.
 * @returns The zone handlers and its drag-over state.
 */
function createZone(container: HTMLElement) {
    return useLayoutDropZone({
        containerRef: ref(container),
        layoutId: () => 'layout-1',
        resolveDropIndex: () => 0,
    });
}

describe('useLayoutDropZone: taking the drag-over highlight down', () => {
    beforeEach(() => {
        document.body.innerHTML = '';
        // inject and onBeforeUnmount outside setup() — Vue warnings, unrelated to the subject
        vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    });

    it('one real exit takes the highlight down after several bubbled enters', () => {
        const container = buildZoneContainer();
        const { isDragOver, handleDragEnter, handleDragLeave } = createZone(container);

        handleDragEnter(createDragEvent());
        handleDragEnter(createDragEvent());
        handleDragEnter(createDragEvent());

        expect(isDragOver.value).toBe(true);

        handleDragLeave(createDragEvent(document.body));

        expect(isDragOver.value).toBe(false);
    });

    it('a move between children keeps the highlight', () => {
        const container = buildZoneContainer();
        const child = document.getElementById('child') as HTMLElement;
        const { isDragOver, handleDragEnter, handleDragLeave } = createZone(container);

        handleDragEnter(createDragEvent());
        handleDragLeave(createDragEvent(child));

        expect(isDragOver.value).toBe(true);
    });

    it('a leave with no target (another window) counts as a real exit', () => {
        const container = buildZoneContainer();
        const { isDragOver, handleDragEnter, handleDragLeave } = createZone(container);

        handleDragEnter(createDragEvent());
        handleDragLeave(createDragEvent(null));

        expect(isDragOver.value).toBe(false);
    });
});
