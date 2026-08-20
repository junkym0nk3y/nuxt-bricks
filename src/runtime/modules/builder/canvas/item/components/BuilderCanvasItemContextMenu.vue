<script setup lang="ts">
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

/** Позиция после подгонки под границы viewport; до замера меню скрыто */
const clampedPosition = ref({ x: props.position.x, y: props.position.y });
const isPositioned = ref(false);

const isDeviceSubmenuOpen = ref(false);

/** Сторона раскрытия flyout видимости устройств ('right' | 'left') */
const submenuSide = ref<'right' | 'left'>('right');

/** Ширина flyout для проверки, помещается ли он справа от меню */
const SUBMENU_WIDTH = 160;
const VIEWPORT_MARGIN = 8;

const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform ?? '');
// #endregion

// #region Computed
const menuStyle = computed(() => ({
    left: `${clampedPosition.value.x}px`,
    top: `${clampedPosition.value.y}px`,
    visibility: isPositioned.value ? undefined : ('hidden' as const),
}));

/**
 * Секции пунктов меню: редактирование, буфер обмена, перемещение, toggles.
 * Пункт видимости на устройствах рендерится отдельно (flyout).
 * `closesMenu` — только для действий, после которых меню теряет смысл.
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
 * Строки флайаута видимости: по одной на устройство набора страницы.
 * Отсутствие флага в схеме означает «видно» — набор у страниц разный, и
 * перечислять все ключи со значением `true` пришлось бы заново при каждой
 * правке набора.
 */
const deviceRows = computed(() =>
    canvasStore.devices.map((device) => ({
        key: device.key,
        label: device.label,
        isVisible: props.deviceVisibility?.[device.key] !== false,
    }))
);

/**
 * Скрыт ли компонент хотя бы на одном устройстве (индикатор у пункта сабменю).
 */
const hasDeviceOverrides = computed<boolean>(() => deviceRows.value.some((row) => !row.isVisible));
// #endregion

// #region Methods
/**
 * Эмитит событие действия по идентификатору пункта меню.
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
 * Обрабатывает клик по пункту меню: выполняет действие; меню закрывается
 * только для терминальных действий (`closesMenu`), toggles оставляют меню открытым.
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
 * Переключает видимость на устройстве; flyout остаётся открытым
 * для переключения нескольких устройств подряд.
 */
function handleToggleDevice(device: TBricksDeviceKey): void {
    emit('toggle-device', device);
}

/**
 * Подгоняет меню под границы viewport и выбирает сторону flyout.
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
 * Закрывает меню при pointerdown вне его (capture — до stopPropagation в канвасе).
 */
function handleOutsidePointerDown(event: PointerEvent): void {
    const target = event.target as HTMLElement;
    if (menuRef.value && !menuRef.value.contains(target)) {
        emit('close');
    }
}

/**
 * Закрывает меню по Escape; stopPropagation защищает выделение компонента
 * от Escape-шортката билдера (сброс выбора).
 */
function handleKeyDown(event: KeyboardEvent): void {
    if (event.key !== 'Escape') {
        return;
    }

    event.stopPropagation();
    emit('close');
}

/**
 * Закрывает меню при скролле/зуме канваса — иначе меню отрывается от компонента.
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
        <!-- Имя компонента + закрытие -->
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

        <!-- Видимость на устройствах (flyout) -->
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
/*
    Поверхность здесь написана руками, а не взята из `BricksPopoverSurface`:
    ссылка на этот узел нужна как элемент — по нему проверяется попадание курсора
    и считается место для авторазмещения меню. Инстанс компонента заставил бы
    тащить `$el` в три места логики ради одинакового вида. Тень `lg` осознанная:
    меню всплывает над содержимым канваса, а не над панелью интерфейса.
*/
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
    color: var(--bricks-base-400);
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
    color: var(--bricks-base-400);
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

// Flyout примыкает к wrapper без зазора (left: 100%) — зазор разрывал
// hover-цепочку mouseenter/mouseleave и закрывал сабменю при переходе курсора
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
