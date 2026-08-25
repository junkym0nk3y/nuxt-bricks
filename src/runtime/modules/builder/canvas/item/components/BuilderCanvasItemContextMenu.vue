<script setup lang="ts">
/**
 * @description Context menu of a canvas block: sections of actions plus a flyout with
 * per-device visibility.
 *
 * The surface is written by hand instead of being taken from `BricksPopoverSurface`: the
 * reference to this node is needed as an element — hit-testing the cursor and placing the
 * menu automatically both read it — and an instance of the component would drag `$el`
 * into three places of the logic for the sake of an identical look. The `lg` shadow is
 * deliberate: the menu floats above the content of the canvas, not above a panel of the
 * interface.
 *
 * Its translucency with a blurred backdrop is a decision of the owner: the menu is meant
 * to show which part of the page it hangs over. The general ban on `backdrop-filter` in
 * the style rules does not reach this node (it stands on the list of conscious
 * exceptions), and the pair works only together — without `opacity` there would be
 * nothing to blur.
 */

// #region Imports
// Types
import type {
    ICanvasItemContextMenuProps,
    ICanvasItemContextMenuEmits,
    ICanvasContextMenuItem,
    TCanvasContextMenuAction,
} from '../../types/components';
import type { TBricksDeviceKey } from '../../../../common/types/brick';

// Vue
import { ref, computed, onMounted, onBeforeUnmount, nextTick } from 'vue';
import { useI18n } from 'vue-i18n';

// Pinia
import { useCanvasStore } from '../../../core/stores/canvas';

// Utils
import { isApplePlatform } from '../utils/platform';

// Components
import BricksCheckbox from '../../../../ui/base/checkbox/BricksCheckbox.vue';
import BricksIconButton from '../../../../ui/base/icon-button/BricksIconButton.vue';
import BricksPopoverSurface from '../../../../ui/base/popover/BricksPopoverSurface.vue';
// #endregion

// #region Props
const props = withDefaults(defineProps<ICanvasItemContextMenuProps>(), {
    deviceVisibility: undefined,
    isInteractivePreview: false,
    canPaste: false,
});
// #endregion

// #region Emits
const emit = defineEmits<ICanvasItemContextMenuEmits>();
// #endregion

// #region Data
const { t } = useI18n();
const canvasStore = useCanvasStore();
const menuRef = ref<HTMLElement | null>(null);

/** Position after clamping to the viewport bounds; until it is measured the menu is hidden */
const clampedPosition = ref({ x: props.position.x, y: props.position.y });
const isPositioned = ref(false);

/**
 * Whether the device visibility flyout is open. It follows hover and abuts the wrapper
 * with no gap (`left: 100%`): a gap broke the mouseenter/mouseleave chain and closed the
 * submenu while the cursor was crossing it.
 */
const isDeviceSubmenuOpen = ref(false);

/** Side the device visibility flyout opens to ('right' | 'left') */
const submenuSide = ref<'right' | 'left'>('right');

/** Flyout width, used to check whether it fits to the right of the menu */
const SUBMENU_WIDTH = 160;
const VIEWPORT_MARGIN = 8;

/** Whether the shortcut captions follow macOS (⌘ and ⌫) */
const isMac = isApplePlatform();
// #endregion

// #region Computed
const menuStyle = computed(() => ({
    left: `${clampedPosition.value.x}px`,
    top: `${clampedPosition.value.y}px`,
    visibility: isPositioned.value ? undefined : ('hidden' as const),
}));

/**
 * Sections of menu items: editing, clipboard, moving, toggles.
 * The device visibility item is rendered separately, as a flyout.
 * `closesMenu` marks only the actions after which the menu makes no sense.
 */
const sections = computed<ICanvasContextMenuItem[][]>(() => {
    const mod = isMac ? '⌘' : 'Ctrl+';

    return [
        [{ id: 'edit', label: t('bricks.canvas.edit'), closesMenu: true }],
        [
            { id: 'copy', label: t('bricks.canvas.copy'), shortcut: `${mod}C` },
            {
                id: 'paste',
                label: t('bricks.canvas.paste'),
                shortcut: `${mod}V`,
                disabled: !props.canPaste,
                closesMenu: true,
            },
            { id: 'duplicate', label: t('bricks.canvas.duplicate'), closesMenu: true },
            {
                id: 'delete',
                label: t('bricks.common.delete'),
                shortcut: isMac ? '⌫' : 'Del',
                closesMenu: true,
            },
        ],
        [
            { id: 'move-up', label: t('bricks.canvas.moveUp'), disabled: !props.canMoveUp },
            { id: 'move-down', label: t('bricks.canvas.moveDown'), disabled: !props.canMoveDown },
        ],
        [
            { id: 'toggle-favorite', label: t('bricks.canvas.favorite'), active: props.isFavorite },
            {
                id: 'toggle-interactive-preview',
                label: props.isInteractivePreview
                    ? t('bricks.canvas.previewExit')
                    : t('bricks.canvas.previewEnter'),
                active: props.isInteractivePreview,
            },
            {
                id: 'toggle-hidden',
                label: props.isHidden ? t('bricks.canvas.enable') : t('bricks.canvas.disable'),
                active: props.isHidden,
            },
        ],
    ];
});

/**
 * Rows of the visibility flyout: one per device of the page set.
 * A missing flag in the schema means "visible" — the set differs from page to page, and
 * listing every key with the value `true` would have to be redone on every edit of the
 * set.
 */
const deviceRows = computed(() =>
    canvasStore.devices.map((device) => ({
        key: device.key,
        label: device.label,
        isVisible: props.deviceVisibility?.[device.key] !== false,
    }))
);

/**
 * Whether the component is hidden on at least one device (the indicator of the submenu
 * item).
 */
const hasDeviceOverrides = computed<boolean>(() => deviceRows.value.some((row) => !row.isVisible));
// #endregion

// #region Methods
/**
 * Emits the action event that matches the id of a menu item.
 */
function emitAction(action: TCanvasContextMenuAction): void {
    const emitters: Record<TCanvasContextMenuAction, () => void> = {
        edit: () => emit('edit'),
        copy: () => emit('copy'),
        paste: () => emit('paste'),
        duplicate: () => emit('duplicate'),
        delete: () => emit('delete'),
        'move-up': () => emit('move-up'),
        'move-down': () => emit('move-down'),
        'toggle-favorite': () => emit('toggle-favorite'),
        'toggle-interactive-preview': () => emit('toggle-interactive-preview'),
        'toggle-hidden': () => emit('toggle-hidden'),
    };

    emitters[action]();
}

/**
 * Handles a click on a menu item: runs the action. The menu closes only for terminal
 * actions (`closesMenu`); toggles leave it open.
 */
function handleItemClick(item: ICanvasContextMenuItem): void {
    if (item.disabled) {
        return;
    }

    emitAction(item.id);

    if (item.closesMenu) {
        emit('close');
    }
}

/**
 * Toggles visibility on a device; the flyout stays open so several devices can be
 * switched one after another.
 */
function handleToggleDevice(device: TBricksDeviceKey): void {
    emit('toggle-device', device);
}

/**
 * Fits the menu into the viewport bounds and picks the side of the flyout.
 */
function clampToViewport(): void {
    const el = menuRef.value;
    if (!el) {
        isPositioned.value = true;
        return;
    }

    const rect = el.getBoundingClientRect();
    const x = Math.max(
        VIEWPORT_MARGIN,
        Math.min(props.position.x, window.innerWidth - rect.width - VIEWPORT_MARGIN)
    );
    const y = Math.max(
        VIEWPORT_MARGIN,
        Math.min(props.position.y, window.innerHeight - rect.height - VIEWPORT_MARGIN)
    );

    clampedPosition.value = { x, y };
    submenuSide.value =
        x + rect.width + SUBMENU_WIDTH + VIEWPORT_MARGIN > window.innerWidth ? 'left' : 'right';
    isPositioned.value = true;
}

/**
 * Closes the menu on a pointerdown outside it (capture phase — ahead of any
 * stopPropagation on the canvas).
 */
function handleOutsidePointerDown(event: PointerEvent): void {
    const target = event.target as HTMLElement;
    if (menuRef.value && !menuRef.value.contains(target)) {
        emit('close');
    }
}

/**
 * Closes the menu on Escape; stopPropagation shields the selected component from the
 * Escape shortcut of the builder, which drops the selection.
 */
function handleKeyDown(event: KeyboardEvent): void {
    if (event.key !== 'Escape') {
        return;
    }

    event.stopPropagation();
    emit('close');
}

/**
 * Closes the menu when the canvas is scrolled or zoomed — otherwise the menu comes away
 * from its component.
 */
function handleWheel(): void {
    emit('close');
}
// #endregion

// #region Lifecycle
onMounted(async () => {
    await nextTick();
    clampToViewport();

    document.addEventListener('pointerdown', handleOutsidePointerDown, true);
    document.addEventListener('keydown', handleKeyDown, true);
    window.addEventListener('wheel', handleWheel, { passive: true });
});

onBeforeUnmount(() => {
    document.removeEventListener('pointerdown', handleOutsidePointerDown, true);
    document.removeEventListener('keydown', handleKeyDown, true);
    window.removeEventListener('wheel', handleWheel);
});
// #endregion
</script>

<template>
    <div
        ref="menuRef"
        :class="$style.BuilderCanvasItemContextMenu"
        :style="menuStyle"
        data-canvas-context-menu
        @click.stop
        @mousedown.stop
        @contextmenu.prevent.stop
    >
        <div :class="$style.header">
            <span :class="$style.headerName">{{ props.componentName }}</span>
            <BricksIconButton
                icon="ta:outline-x"
                :label="t('bricks.common.cancel')"
                variant="ghost"
                @click="emit('close')"
            />
        </div>

        <template v-for="(section, sectionIndex) in sections" :key="sectionIndex">
            <div :class="$style.separator" />

            <button
                v-for="item in section"
                :key="item.id"
                :class="[$style.item, { [$style.itemDisabled]: item.disabled }]"
                :disabled="item.disabled"
                type="button"
                @click="handleItemClick(item)"
            >
                <span :class="$style.label">{{ item.label }}</span>
                <span v-if="item.active" :class="$style.stateDot" />
                <span v-if="item.shortcut" :class="$style.shortcut">{{ item.shortcut }}</span>
            </button>
        </template>

        <div :class="$style.separator" />

        <div
            :class="$style.submenuWrapper"
            @mouseenter="isDeviceSubmenuOpen = true"
            @mouseleave="isDeviceSubmenuOpen = false"
        >
            <button
                :class="[$style.item, { [$style.itemOpen]: isDeviceSubmenuOpen }]"
                type="button"
            >
                <span :class="$style.label">{{ t('bricks.canvas.deviceVisibility') }}</span>
                <span v-if="hasDeviceOverrides" :class="$style.stateDot" />
                <span :class="$style.submenuArrow">›</span>
            </button>

            <BricksPopoverSurface
                v-if="isDeviceSubmenuOpen"
                elevation="lg"
                layer="none"
                :class="[$style.flyout, { [$style.flyoutLeft]: submenuSide === 'left' }]"
            >
                <div v-for="row in deviceRows" :key="row.key" :class="$style.deviceRow">
                    <BricksCheckbox
                        :value="row.isVisible"
                        size="sm"
                        :label="row.label"
                        @update:value="handleToggleDevice(row.key)"
                    />
                </div>
            </BricksPopoverSurface>
        </div>
    </div>
</template>

<style module lang="scss">
.BuilderCanvasItemContextMenu {
    position: fixed;
    z-index: var(--bricks-z-popover);
    min-width: 24rem;
    max-width: 30rem;
    padding: 0.6rem;
    border-radius: var(--bricks-border-radius-sm);
    border: 1px solid var(--bricks-base-200);
    background: var(--bricks-base-0);
    box-shadow: var(--bricks-shadow-lg);
    pointer-events: auto;
    user-select: none;
    backdrop-filter: blur(1rem);
    opacity: 0.9;
}

.header {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0.4rem 0.4rem 0.2rem 1rem;
    gap: 0.8rem;
}

.headerName {
    overflow: hidden;
    flex: 1;
    text-overflow: ellipsis;
    text-transform: uppercase;
    white-space: nowrap;
    font-size: 1rem;
    font-weight: 600;
    letter-spacing: 0.05rem;
    color: var(--bricks-text-muted);
}

.separator {
    margin: 0.4rem 0;
    border-top: 1px solid var(--bricks-base-200);
}

.item {
    display: flex;
    align-items: center;
    width: 100%;
    height: 3rem;
    padding: 0 1rem;
    border-radius: var(--bricks-border-radius-xs);
    border: none;
    background: transparent;
    text-align: left;
    font-size: 1.4rem;
    color: var(--bricks-base-900);
    transition:
        background var(--bricks-default-transition),
        color var(--bricks-default-transition);
    cursor: pointer;
    gap: 0.8rem;

    &:hover:not(.itemDisabled),
    &.itemOpen {
        background: var(--bricks-primary);
        color: var(--bricks-static-white);

        .shortcut,
        .submenuArrow {
            color: var(--bricks-static-white);
        }

        .stateDot {
            background: var(--bricks-static-white);
        }
    }
}

.itemDisabled {
    color: var(--bricks-base-400);
    cursor: not-allowed;
}

.stateDot {
    flex-shrink: 0;
    width: 0.6rem;
    height: 0.6rem;
    border-radius: var(--bricks-border-radius-pill);
    background: var(--bricks-primary);
    transition: background var(--bricks-default-transition);
}

.label {
    overflow: hidden;
    flex: 1;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.shortcut {
    flex-shrink: 0;
    font-size: 1.2rem;
    color: var(--bricks-text-muted);
}

.submenuArrow {
    flex-shrink: 0;
    font-size: 1.4rem;
    line-height: 1;
    color: var(--bricks-base-400);
}

.submenuWrapper {
    position: relative;
}

.flyout {
    position: absolute;
    top: -0.6rem;
    left: 100%;
    min-width: 16rem;
}

.flyoutLeft {
    right: 100%;
    left: auto;
}

.deviceRow {
    display: flex;
    align-items: center;
    height: 3rem;
    padding: 0 1rem 0 0.8rem;
    border-radius: var(--bricks-border-radius-xs);
    transition: background var(--bricks-default-transition);

    &:hover {
        background: var(--bricks-base-50);
    }
}
</style>
