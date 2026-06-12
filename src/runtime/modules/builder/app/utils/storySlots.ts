import type { ComponentSlotDefinition } from '../../../common/types/brick';

/**
 * Извлекает определения слотов из данных story.
 *
 * @param storyData - Данные story компонента.
 * @returns Нормализованный массив слотов или undefined.
 */
export function extractStorySlots(storyData: any): ComponentSlotDefinition[] | undefined {
    const rawSlots = storyData?.slots;
    if (!rawSlots) {
        return undefined;
    }

    if (Array.isArray(rawSlots)) {
        const normalized = rawSlots
            .map((slot: any) => {
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
            .filter(Boolean) as ComponentSlotDefinition[];
        return normalized.length > 0 ? normalized : undefined;
    }

    if (typeof rawSlots === 'object') {
        const entries = Object.entries(rawSlots).map(([name, config]) => {
            if (config && typeof config === 'object') {
                return {
                    name,
                    label: (config as any).label ?? name,
                    description: (config as any).description,
                    allowMultiple:
                        typeof (config as any).allowMultiple === 'boolean'
                            ? (config as any).allowMultiple
                            : true,
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
