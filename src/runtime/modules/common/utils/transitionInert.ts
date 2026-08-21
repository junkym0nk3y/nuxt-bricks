/**
 * Interactivity of a node leaving by a leave animation.
 *
 * The `pointer-events: none` from `transitions.scss` shuts the pointer out only,
 * while the node stays in the DOM all that time: a focused button inside it can be
 * activated with Enter or Space, and it is available to assistive tech. That alone
 * is not the edge — the edge is that a transition between screens does not always
 * follow a human click: the accounts section of the dashboard closes by itself once
 * its endpoints start answering 403, and the page list goes into the loading state
 * on a background refresh. In transitions like those the focus stays inside the
 * leaving screen.
 *
 * The attribute is set imperatively: the template bindings of a leaving element are
 * no longer patched.
 *
 * There is deliberately no matching removal function. Every consumer switches
 * screens with `v-if`, and such a node is not reused: when the previous screen comes
 * back before the animation is over, Vue finishes the leave of the departing node
 * early (`afterLeave`, not `leaveCancelled` — that one only arrives for a reused
 * element, that is, with `v-show`), removes it and creates a new, already clean one.
 * There is nothing to remove the attribute from.
 *
 * A limitation: `inert` applies to a subtree, so content carried out of it by a
 * teleport (the reka menus live in a `DropdownMenuPortal`, that is, in `body`) is
 * not shut down by it. For the present places that is enough: the lifecycle of such
 * menus is owned by components inside the leaving subtree, and the teleported
 * content goes away when they unmount.
 */

/**
 * Shuts down the interactivity of a leaving node.
 *
 * @param element - Root element leaving by a leave animation.
 */
export function markLeavingInert(element: Element): void {
    element.setAttribute('inert', '');
}
