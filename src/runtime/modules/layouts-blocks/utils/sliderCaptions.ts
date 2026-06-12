// Types
import type { ISliderCaption } from '../types/blockProps';

/**
 * Type guard: элемент является валидной подписью слайда.
 */
function isSliderCaption(item: unknown): item is ISliderCaption {
    return (
        typeof item === 'object' &&
        item !== null &&
        typeof (item as Record<string, unknown>).text === 'string'
    );
}

/**
 * Парсит captions слайдера из массива объектов или JSON-строки.
 * Невалидные элементы и ошибки парсинга дают пустой результат.
 */
export function parseSliderCaptions(raw: ISliderCaption[] | string | undefined): ISliderCaption[] {
    if (!raw) {
        return [];
    }

    if (Array.isArray(raw)) {
        return raw.filter(isSliderCaption);
    }

    if (typeof raw === 'string') {
        try {
            const parsed = JSON.parse(raw);
            if (Array.isArray(parsed)) {
                return parsed.filter(isSliderCaption);
            }
        } catch {
            return [];
        }
    }

    return [];
}
