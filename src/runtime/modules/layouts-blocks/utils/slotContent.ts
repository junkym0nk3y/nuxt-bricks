// #region Imports
// Vue
import { Comment, Fragment, Text, type VNode } from 'vue';
// #endregion

/**
 * Сколько узлов слота реально что-то рисуют.
 *
 * Проверка вида `!slots.default?.()` для этого не годится: слот возвращает
 * массив и тогда, когда рисовать нечего — внутри лежат анкоры-комментарии
 * `v-if`, пустые фрагменты `v-for` и пробелы шаблона. Массив истинный, и пустой
 * контейнер считается заполненным: на канвасе это гасит подсказку «бросьте
 * сюда» и оставляет объявленные строки грида нулевой высоты.
 *
 * @param nodes - Узлы слота (результат вызова слот-функции).
 * @returns Число рисуемых узлов.
 */
export function countSlotContent(nodes?: VNode[]): number {
    if (!nodes) {
        return 0;
    }

    return nodes.reduce((total, node) => {
        if (node.type === Comment) {
            return total;
        }

        if (node.type === Fragment) {
            return total + countSlotContent(node.children as VNode[] | undefined);
        }

        if (node.type === Text) {
            return String(node.children ?? '').trim() === '' ? total : total + 1;
        }

        return total + 1;
    }, 0);
}
