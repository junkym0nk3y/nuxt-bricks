import type {
    IBricksSchema,
    IDeviceVisibilityConfig,
    TBricksDeviceKey,
    IBricksSchemaMeta,
} from '../../../../common/types/brick';
import { deserializeSchema, serializeSchema } from '../../utils/history';
import { useSidebarStore } from '../sidebar';
import { useHistoryStore } from '../history';
import { useNavigationStore } from '../navigation';
import type { IComponentsSchemaActions, IComponentsStore } from '../types';
import { normalizeDeviceVisibility } from '../../../../common/utils/bricks/deviceVisibility';
import { useDebounceFn } from '@vueuse/core';

const debouncedSaveToHistory = useDebounceFn((store: IComponentsStore) => {
    store.saveToHistory();
}, 300);

/**
 * Собирает meta из navigation store для включения в схему.
 */
function collectSchemaMeta(): IBricksSchemaMeta | undefined {
    const navigationStore = useNavigationStore();
    const meta: IBricksSchemaMeta = {};

    if (navigationStore.hasItems) {
        meta.navigation = navigationStore.toMeta();
    }

    return Object.keys(meta).length > 0 ? meta : undefined;
}

/**
 * Действия, связанные с экспортом/импортом схемы и взаимодействием с историей.
 */
export const schemaActions: IComponentsSchemaActions = {
    /**
     * Включает режим растягивания компонента на всю ширину или отключает его.
     *
     * @param id - Целевой компонент.
     * @param fullWidth - Новое значение признака.
     */
    setComponentFullWidth(this: IComponentsStore, id: string, fullWidth: boolean) {
        const component = this.getComponentById(id);
        if (!component) {
            return;
        }

        component.fullWidth = fullWidth;
        this.saveToHistory();
    },

    /**
     * Устанавливает кастомный HTML id для якорной навигации.
     *
     * @param id - Целевой компонент.
     * @param htmlId - Значение атрибута id (пустая строка — удаляет).
     */
    setComponentHtmlId(this: IComponentsStore, id: string, htmlId: string) {
        const component = this.getComponentById(id);
        if (!component) {
            return;
        }

        component.htmlId = htmlId || undefined;
        debouncedSaveToHistory(this);
    },

    /**
     * Включает или выключает отображение компонента.
     *
     * @param id - Целевой компонент.
     * @param hidden - Новое значение признака скрытия.
     */
    setComponentHidden(this: IComponentsStore, id: string, hidden: boolean) {
        const component = this.getComponentById(id);
        if (!component) {
            return;
        }

        component.isHidden = hidden;
        this.saveToHistory();
    },

    /**
     * Устанавливает видимость компонента по устройствам (mobile/tablet/desktop).
     *
     * @param id - Целевой компонент.
     * @param visibility - Новая конфигурация видимости.
     */
    setComponentDeviceVisibility(
        this: IComponentsStore,
        id: string,
        visibility: Partial<IDeviceVisibilityConfig>
    ) {
        const component = this.getComponentById(id);
        if (!component) {
            return;
        }

        component.deviceVisibility = normalizeDeviceVisibility(visibility);
        this.saveToHistory();
    },

    /**
     * Устанавливает флаг видимости для конкретного устройства.
     *
     * @param id - Целевой компонент.
     * @param device - Ключ устройства.
     * @param value - Новый флаг видимости.
     */
    setComponentDeviceVisibilityFlag(
        this: IComponentsStore,
        id: string,
        device: TBricksDeviceKey,
        value: boolean
    ) {
        const component = this.getComponentById(id);
        if (!component) {
            return;
        }

        const current = normalizeDeviceVisibility(component.deviceVisibility);
        component.deviceVisibility = {
            ...current,
            [device]: Boolean(value),
        };
        this.saveToHistory();
    },

    /**
     * Собирает текущую схему и выводит полезную информацию в консоль для отладки.
     *
     * @returns Сериализованная схема страницы.
     */
    exportSchema(this: IComponentsStore) {
        console.log('[Bricks Store] Exporting schema:', {
            components: this.components.length,
            componentProps: this.components.map((component) => ({
                id: component.id,
                componentName: component.componentName,
                props: component.props,
            })),
        });

        return serializeSchema(this.components, collectSchemaMeta());
    },

    /**
     * Сохраняет текущее состояние схемы в историю.
     */
    saveToHistory(this: IComponentsStore) {
        const historyStore = useHistoryStore();
        const schema = serializeSchema(this.components, collectSchemaMeta());
        historyStore.capture(schema);
    },

    /**
     * Выполняет undo: восстанавливает предыдущую схему из истории.
     */
    undo(this: IComponentsStore) {
        const historyStore = useHistoryStore();
        const schema = historyStore.undo();
        if (schema) {
            this.loadSchema(schema);
        }
    },

    /**
     * Выполняет redo и применяет полученную схему к текущему состоянию.
     */
    redo(this: IComponentsStore) {
        const historyStore = useHistoryStore();
        const schema = historyStore.redo();
        if (schema) {
            this.loadSchema(schema);
        }
    },

    /**
     * Загружает сериализованную схему в стор, синхронизируя выбор и сбрасывая историю по запросу.
     *
     * @param schema - DTO компонента/канваса.
     * @param options - Дополнительные флаги (например, сброс истории).
     */
    loadSchema(
        this: IComponentsStore,
        schema: IBricksSchema,
        options?: { resetHistory?: boolean }
    ) {
        this.components = deserializeSchema(schema);

        this.components.forEach((component) => {
            if (!component.parent && component.fullWidth === undefined) {
                component.fullWidth = false;
            }
        });

        // Синхронизируем навигацию из meta
        const navigationStore = useNavigationStore();
        navigationStore.loadFromMeta(schema.meta);

        if (
            this.selectedComponent &&
            !this.components.some((component) => component.id === this.selectedComponent?.id)
        ) {
            this.selectedComponent = null;
            const sidebarStore = useSidebarStore();
            sidebarStore.hidePropertiesPanel();
        }

        if (options?.resetHistory) {
            const historyStore = useHistoryStore();
            historyStore.reset();
            historyStore.capture(serializeSchema(this.components, collectSchemaMeta()));
        }
    },
};
