import type {
    LandingSchema,
    IDeviceVisibilityConfig,
    TLandingDeviceKey,
    ILandingSchemaMeta,
} from '../../../types/landing';
import { deserializeSchema, serializeSchema } from '../../../builder/utils/history';
import { useLandingSidebarStore } from '../sidebar';
import { useLandingHistoryStore } from '../history';
import { useNavigationStore } from '../navigation';
import type { ILandingComponentsSchemaActions, ILandingComponentsStore } from '../types';
import { normalizeDeviceVisibility } from '../../../utils/landing/deviceVisibility';
import { debounce } from '../../../utils/main';

const debouncedSaveToHistory = debounce((store: ILandingComponentsStore) => {
    store.saveToHistory();
}, 300);

/**
 * Собирает meta из navigation store для включения в схему.
 */
function collectSchemaMeta(): ILandingSchemaMeta | undefined {
    const navigationStore = useNavigationStore();
    const meta: ILandingSchemaMeta = {};

    if (navigationStore.hasItems) {
        meta.navigation = navigationStore.toMeta();
    }

    return Object.keys(meta).length > 0 ? meta : undefined;
}

/**
 * Действия, связанные с экспортом/импортом схемы и взаимодействием с историей.
 */
export const schemaActions: ILandingComponentsSchemaActions = {
    /**
     * Включает режим растягивания компонента на всю ширину или отключает его.
     *
     * @param id - Целевой компонент.
     * @param fullWidth - Новое значение признака.
     */
    setComponentFullWidth(this: ILandingComponentsStore, id: string, fullWidth: boolean) {
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
    setComponentHtmlId(this: ILandingComponentsStore, id: string, htmlId: string) {
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
    setComponentHidden(this: ILandingComponentsStore, id: string, hidden: boolean) {
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
        this: ILandingComponentsStore,
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
        this: ILandingComponentsStore,
        id: string,
        device: TLandingDeviceKey,
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
     * @returns Сериализованная схема landing-страницы.
     */
    exportSchema(this: ILandingComponentsStore) {
        console.log('[Landing Store] Exporting schema:', {
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
    saveToHistory(this: ILandingComponentsStore) {
        const historyStore = useLandingHistoryStore();
        const schema = serializeSchema(this.components, collectSchemaMeta());
        historyStore.capture(schema);
    },

    /**
     * Выполняет undo: восстанавливает предыдущую схему из истории.
     */
    undo(this: ILandingComponentsStore) {
        const historyStore = useLandingHistoryStore();
        const schema = historyStore.undo();
        if (schema) {
            this.loadSchema(schema);
        }
    },

    /**
     * Выполняет redo и применяет полученную схему к текущему состоянию.
     */
    redo(this: ILandingComponentsStore) {
        const historyStore = useLandingHistoryStore();
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
        this: ILandingComponentsStore,
        schema: LandingSchema,
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
            const sidebarStore = useLandingSidebarStore();
            if (sidebarStore.activeView === 'properties') {
                sidebarStore.setActiveView('components');
            }
        }

        if (options?.resetHistory) {
            const historyStore = useLandingHistoryStore();
            historyStore.reset();
            historyStore.capture(serializeSchema(this.components, collectSchemaMeta()));
        }
    },
};
