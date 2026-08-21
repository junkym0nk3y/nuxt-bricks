// #region Imports
// Vue
import { Comment, Fragment, Text, type VNode } from 'vue';
// #endregion

/**
 * How many nodes of a slot really draw anything.
 *
 * A check of the form `!slots.default?.()` will not do here: the slot returns an array
 * even when there is nothing to draw — inside sit the comment anchors of `v-if`, empty
 * `v-for` fragments and template whitespace. The array is truthy, and an empty container
 * counts as filled: on the canvas that suppresses the "drop here" hint and leaves the
 * declared grid rows at zero height.
 *
 * @param nodes - Slot nodes (the result of calling the slot function).
 * @returns Number of nodes that draw.
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
