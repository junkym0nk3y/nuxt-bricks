import type { IComponentLibraryItem } from '../../../../common/types/brick';

/** Модалки в библиотеку не попадают: на канвас их не кладут. */
const HIDDEN_CATEGORY = 'Modal';

/**
 * Группирует компоненты библиотеки по категориям.
 *
 * Группы копятся в `Map`, а не в объекте: категория приходит из brick-файла
 * потребителя и может быть валидной строкой `__proto__` или `constructor` —
 * у объекта такой ключ читается как член `Object.prototype`, инициализация
 * корзины пропускается и группировка падает на `.push`. Компонент рендерится
 * на SSR, так что падение уносит всю страницу редактора в 500.
 *
 * @param components - Плоский список компонентов библиотеки.
 * @returns Map «категория → компоненты» в порядке первого появления категории.
 */
export function groupComponentsByCategory(
    components: IComponentLibraryItem[]
): Map<string, IComponentLibraryItem[]> {
    return components
        .filter((component) => component.category !== HIDDEN_CATEGORY)
        .reduce<Map<string, IComponentLibraryItem[]>>((grouped, component) => {
            const bucket = grouped.get(component.category);

            // push, а не spread: аккумулятор создан здесь же и наружу не течёт,
            // а копирование корзины на каждый элемент делало бы группировку
            // квадратичной — computed пересчитывается на каждый символ поиска
            if (bucket) {
                bucket.push(component);
            } else {
                grouped.set(component.category, [component]);
            }

            return grouped;
        }, new Map());
}
