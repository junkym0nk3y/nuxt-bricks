// #region Imports
// Types
import type { ComponentSlotDefinition, LandingComponent } from '../../common/types/landing';
import type { ISlotRenderData, IUseComponentSlotsReturn } from '../types/composables';

// Vue
import { computed, ref, watch } from 'vue';

// Pinia
import { useLandingComponentsStore } from '../stores/components';

// Composables
import { useStoryImports } from '../../common/composables/useStoryImports';
// #endregion

/**
 * Нормализует сырые определения слотов из story-файлов в формат ComponentSlotDefinition.
 * Обрабатывает массивы, объекты и строковые определения слотов.
 *
 * @param rawSlots - Сырое определение слота из story-файла (массив, объект или null)
 * @returns Нормализованный массив определений слотов
 */
function normalizeStorySlots(rawSlots: unknown): ComponentSlotDefinition[] {
    if (!rawSlots) {
        return [];
    }

    if (Array.isArray(rawSlots)) {
        return rawSlots
            .map((slot: unknown) => {
                if (typeof slot === 'string') {
                    return {
                        name: slot,
                        label: slot,
                        allowMultiple: true,
                    } as ComponentSlotDefinition;
                }

                if (
                    slot &&
                    typeof slot === 'object' &&
                    typeof (slot as Record<string, unknown>).name === 'string'
                ) {
                    const slotObj = slot as Record<string, unknown>;
                    return {
                        name: slotObj.name as string,
                        label: (slotObj.label as string) ?? (slotObj.name as string),
                        description: slotObj.description as string | undefined,
                        allowMultiple:
                            typeof slotObj.allowMultiple === 'boolean'
                                ? slotObj.allowMultiple
                                : true,
                    } as ComponentSlotDefinition;
                }

                return null;
            })
            .filter(Boolean) as ComponentSlotDefinition[];
    }

    if (typeof rawSlots === 'object') {
        return Object.entries(rawSlots).map(([name, config]) => {
            if (config && typeof config === 'object') {
                const configObj = config as Record<string, unknown>;
                return {
                    name,
                    label: (configObj.label as string) ?? name,
                    description: configObj.description as string | undefined,
                    allowMultiple:
                        typeof configObj.allowMultiple === 'boolean'
                            ? configObj.allowMultiple
                            : true,
                } as ComponentSlotDefinition;
            }

            return {
                name,
                label: name,
                allowMultiple: true,
            } as ComponentSlotDefinition;
        });
    }

    return [];
}

/**
 * Composable для управления слотами компонента.
 * Обрабатывает загрузку, нормализацию и подготовку данных для рендеринга слотов.
 *
 * @param componentId - ID компонента для управления слотами
 * @param storyPath - Путь к story-файлу компонента
 * @param isLayout - Является ли компонент layout-компонентом
 * @param componentProps - Пропсы компонента для извлечения строкового контента слота
 * @returns Объект с данными для рендеринга слотов, строковым контентом и состоянием загрузки
 */
export function useComponentSlots(
    componentId: string,
    storyPath: string,
    isLayout: boolean,
    componentProps: Record<string, unknown> | undefined
): IUseComponentSlotsReturn {
    // #region Data
    const componentsStore = useLandingComponentsStore();
    const { findImportModule } = useStoryImports();
    const hasLoadedSlots = ref(false);
    // #endregion

    // #region Computed
    /**
     * Подготавливает данные для рендеринга слотов, связывая слоты с их дочерними компонентами
     */
    const slotRenderData = computed<ISlotRenderData[]>(() => {
        const component = componentsStore.getComponentById(componentId);
        if (!component) {
            return [];
        }

        const slots = component.slots;
        if (!Array.isArray(slots) || slots.length === 0) {
            return [];
        }

        return slots.map((slot) => ({
            slot,
            children: slot.children
                .map((childId) => componentsStore.getComponentById(childId))
                .filter(Boolean) as LandingComponent[],
        }));
    });

    /**
     * Извлекает строковый контент из пропсов компонента для дефолтного слота
     */
    const slotStringContent = computed<string>(() => {
        const source = componentProps || {};
        return typeof source.slot === 'string' ? source.slot : '';
    });
    // #endregion

    // #region Methods
    /**
     * Обеспечивает наличие загруженных определений слотов компонента.
     * Загружает метаданные слотов из story-файла, если они еще не загружены.
     */
    async function ensureComponentSlotsPresence(): Promise<void> {
        if (isLayout || hasLoadedSlots.value) {
            return;
        }

        const componentRef = componentsStore.getComponentById(componentId);
        if (!componentRef) {
            return;
        }

        if (Array.isArray(componentRef.slots) && componentRef.slots.length > 0) {
            hasLoadedSlots.value = true;
            return;
        }

        const moduleLoader = findImportModule(storyPath);
        if (!moduleLoader) {
            hasLoadedSlots.value = true;
            return;
        }

        try {
            const module = await moduleLoader();
            const storySlots = (module as Record<string, unknown>)?.story
                ? ((module as Record<string, unknown>).story as Record<string, unknown>).slots
                : undefined;
            const definitions = normalizeStorySlots(storySlots);
            if (definitions.length > 0) {
                componentsStore.initializeComponentSlots(componentId, definitions);
            }
        } catch (error) {
            console.error('[useComponentSlots] Failed to load slot metadata:', error);
        } finally {
            hasLoadedSlots.value = true;
        }
    }
    // #endregion

    // #region Lifecycle
    /**
     * Отслеживает слоты компонента и запускает загрузку при необходимости
     */
    watch(
        () => componentsStore.getComponentById(componentId)?.slots,
        (slots) => {
            if (Array.isArray(slots) && slots.length > 0) {
                hasLoadedSlots.value = true;
                return;
            }

            hasLoadedSlots.value = false;
            ensureComponentSlotsPresence();
        },
        { immediate: true }
    );
    // #endregion

    return {
        slotRenderData,
        slotStringContent,
        hasLoadedSlots,
    };
}
