import type { IComponentSlotDefinition } from '../../../common/types/brick';
import type { IBrickFileStructure, IBrickSlotDefinition } from '../../../common/types/index';

/**
 * Извлекает определения слотов из данных brick.
 *
 * @param brickData - Данные brick компонента.
 * @returns Нормализованный массив слотов или undefined.
 */
export function extractBrickSlots(
    brickData: Partial<IBrickFileStructure> | null | undefined
): IComponentSlotDefinition[] | undefined {
    const rawSlots = brickData?.slots;
    if (!rawSlots) {
        return undefined;
    }

    if (Array.isArray(rawSlots)) {
        const normalized = rawSlots
            .map((slot: string | IBrickSlotDefinition) => {
                if (typeof slot === 'string') {
                    return {
                        name: slot,
                        label: slot,
                        allowMultiple: true,
                    };
                }
                if (slot && typeof slot === 'object' && typeof slot.name === 'string') {
                    return {
                        name: slot.name,
                        label: slot.label ?? slot.name,
                        description: slot.description,
                        allowMultiple:
                            typeof slot.allowMultiple === 'boolean' ? slot.allowMultiple : true,
                    };
                }
                return null;
            })
            .filter(Boolean) as IComponentSlotDefinition[];
        return normalized.length > 0 ? normalized : undefined;
    }

    if (typeof rawSlots === 'object') {
        const entries = Object.entries(rawSlots).map(([name, config]) => {
            if (config && typeof config === 'object') {
                return {
                    name,
                    label: config.label ?? name,
                    description: config.description,
                    allowMultiple:
                        typeof config.allowMultiple === 'boolean' ? config.allowMultiple : true,
                };
            }
            return {
                name,
                label: name,
                allowMultiple: true,
            };
        });
        return entries.length > 0 ? entries : undefined;
    }

    return undefined;
}
