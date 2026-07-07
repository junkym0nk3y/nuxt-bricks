// #region Imports
import type { NodeViewRendererProps } from '@tiptap/core';
import Image from '@tiptap/extension-image';
import { Plugin, PluginKey } from '@tiptap/pm/state';
// #endregion

/**
 * Внутренние поля ResizableNodeView — @tiptap/extension-image не экспортирует
 * тип, поэтому доступ идёт через нормализацию `getNodeViewInternals`.
 */
interface IResizableNodeViewInternals {
    dom?: HTMLElement;
    node?: { attrs?: { width?: unknown; height?: unknown } };
    element?: HTMLElement;
    applyInitialSize?: () => void;
}

/**
 * Нормализует результат родительской NodeView-фабрики к внутренним полям.
 *
 * @param view - NodeView, возвращённый parent-фабрикой.
 * @returns Объект с опциональными внутренними полями NodeView.
 */
function getNodeViewInternals(view: unknown): IResizableNodeViewInternals {
    return (view ?? {}) as IResizableNodeViewInternals;
}

const FLOAT_CLASSES = ['float-left', 'float-right', 'float-none'] as const;
const VALIGN_CLASSES = ['valign-baseline', 'valign-middle', 'valign-top', 'valign-bottom'] as const;
const floatSyncPluginKey = new PluginKey('resizableImageFloatSync');
const customSizeClearPluginKey = new PluginKey('resizableImageCustomSizeClear');
const DEFAULT_IMAGE_WIDTH = 300;

/**
 * Извлекает размерность с единицей измерения (rem, em, %) из inline style элемента.
 * Возвращает null для px-значений — они обрабатываются стандартными width/height атрибутами.
 */
function extractStyledDimension(element: HTMLElement, prop: 'width' | 'height'): string | null {
    const style = element.getAttribute('style');
    if (!style) {
        return null;
    }

    const regex = new RegExp(`(?:^|;)\\s*${prop}\\s*:\\s*(\\d+(?:\\.\\d+)?(?:rem|em|%))`, 'i');
    const match = style.match(regex);
    return match ? match[1] : null;
}

/**
 * Применяет custom-размер к DOM-элементу контейнера.
 * Для em-значений конвертирует в px на основе computed font-size элемента,
 * т.к. контекст font-size различается между sidebar-редактором и canvas.
 */
function applyCustomDimension(
    container: HTMLElement,
    prop: 'width' | 'height',
    value: string
): void {
    const emMatch = value.match(/^(\d+(?:\.\d+)?)em$/);

    if (emMatch) {
        const num = parseFloat(emMatch[1]);
        const computedFontSize = parseFloat(getComputedStyle(container).fontSize) || 16;
        container.style[prop] = `${num * computedFontSize}px`;
        return;
    }

    container.style[prop] = value;
}

/**
 * Расширение официального Image extension с поддержкой float (обтекание текстом)
 * и встроенного resize из TipTap v3.
 *
 * Float реализован через CSS-классы (float-left, float-right, float-none).
 * ParseHTML поддерживает как новый формат (CSS-классы), так и старый (data-float атрибут).
 * Использует parseHTML-селектор `img[src]:not([data-segment-id])` для избежания конфликта
 * с InlineSegmentImage.
 *
 * Включает ProseMirror plugin для синхронизации float-атрибута с DOM в режиме редактирования,
 * т.к. ResizableNodeView не применяет renderHTML-атрибуты к DOM-элементам.
 */
const ResizableImageBase = Image.extend({
    addAttributes() {
        return {
            ...this.parent?.(),
            float: {
                default: null,
                parseHTML: (element: HTMLElement) => {
                    if (element.classList.contains('float-left')) {
                        return 'left';
                    }
                    if (element.classList.contains('float-right')) {
                        return 'right';
                    }

                    // Backward compat: data-float атрибут из старого формата
                    return element.getAttribute('data-float') || null;
                },
                renderHTML: (attributes: Record<string, unknown>) => {
                    if (!attributes.float) {
                        return {};
                    }

                    return { class: `float-${attributes.float}` };
                },
            },
            verticalAlign: {
                default: null,
                parseHTML: (element: HTMLElement) => {
                    for (const cls of VALIGN_CLASSES) {
                        if (element.classList.contains(cls)) {
                            return cls.replace('valign-', '');
                        }
                    }
                    return null;
                },
                renderHTML: (attributes: Record<string, unknown>) => {
                    if (!attributes.verticalAlign) {
                        return {};
                    }
                    return { class: `valign-${attributes.verticalAlign}` };
                },
            },
            customWidth: {
                default: null,
                parseHTML: (element: HTMLElement) =>
                    element.getAttribute('data-custom-width') ||
                    extractStyledDimension(element, 'width'),
                renderHTML: (attributes: Record<string, unknown>) => {
                    if (!attributes.customWidth) {
                        return {};
                    }
                    return {
                        'data-custom-width': attributes.customWidth,
                        style: `width: ${attributes.customWidth}; max-width: 100%`,
                    };
                },
            },
            customHeight: {
                default: null,
                parseHTML: (element: HTMLElement) =>
                    element.getAttribute('data-custom-height') ||
                    extractStyledDimension(element, 'height'),
                renderHTML: (attributes: Record<string, unknown>) => {
                    if (!attributes.customHeight) {
                        return {};
                    }
                    return {
                        'data-custom-height': attributes.customHeight,
                        style: `height: ${attributes.customHeight}`,
                    };
                },
            },
        };
    },

    parseHTML() {
        return [
            {
                tag: 'img[src]:not([data-segment-id])',
            },
        ];
    },

    /**
     * Override addNodeView для исправления бага ResizableNodeView:
     * applyInitialSize() вызывается в конструкторе ДО загрузки изображения,
     * поэтому initialWidth/Height = 0 и aspectRatio не вычисляется.
     *
     * Фикс: пересчитываем размеры после загрузки img, а для новых изображений
     * без явных width/height задаём DEFAULT_IMAGE_WIDTH.
     */
    addNodeView() {
        const parentFactory = this.parent?.();

        if (!parentFactory) {
            return null;
        }

        return (props: NodeViewRendererProps) => {
            const nodeView = parentFactory(props);
            const internals = getNodeViewInternals(nodeView);
            const dom = internals.dom;

            // Fix: TipTap ставит display:flex на контейнер, что растягивает его на всю ширину.
            // Для inline-изображений нужен inline-flex, чтобы контейнер облегал содержимое
            // и визуально совпадал с результатом после сохранения (plain <img>).
            if (dom instanceof HTMLElement) {
                dom.style.display = 'inline-flex';
            }

            const img = dom?.querySelector('img');

            if (!img) {
                return nodeView;
            }

            // Для новых изображений без явных размеров — задаём дефолтную ширину
            if (!internals.node?.attrs?.width && !internals.node?.attrs?.height) {
                img.addEventListener(
                    'load',
                    () => {
                        const naturalW = img.naturalWidth || DEFAULT_IMAGE_WIDTH;
                        const naturalH = img.naturalHeight || DEFAULT_IMAGE_WIDTH;
                        const aspectRatio = naturalW / naturalH;
                        const width = Math.min(naturalW, DEFAULT_IMAGE_WIDTH);
                        const height = Math.round(width / aspectRatio);

                        if (internals.element) {
                            internals.element.style.width = `${width}px`;
                            internals.element.style.height = `${height}px`;
                        }

                        internals.applyInitialSize?.();

                        // Персистим размеры в ProseMirror node attrs,
                        // иначе при сохранении (getHTML) width/height останутся null
                        const pos = props.getPos();

                        if (typeof pos === 'number') {
                            const { state } = props.editor.view;
                            const node = state.doc.nodeAt(pos);

                            if (node && node.type.name === 'image') {
                                const tr = state.tr.setNodeMarkup(pos, undefined, {
                                    ...node.attrs,
                                    width,
                                    height,
                                });

                                props.editor.view.dispatch(tr);
                            }
                        }
                    },
                    { once: true }
                );
            }

            return nodeView;
        };
    },

    /**
     * ProseMirror plugin для синхронизации float-атрибута image-нод с DOM.
     * ResizableNodeView (TipTap v3) не применяет renderHTML атрибуты к data-resize-container,
     * поэтому float-класс нужно проставлять вручную после каждой транзакции.
     */
    addProseMirrorPlugins() {
        return [
            new Plugin({
                key: floatSyncPluginKey,
                view() {
                    return {
                        update(view) {
                            view.state.doc.descendants((node, pos) => {
                                if (node.type.name !== 'image') {
                                    return;
                                }

                                const domNode = view.nodeDOM(pos);
                                if (!(domNode instanceof HTMLElement)) {
                                    return;
                                }

                                // domNode — data-resize-container (корень NodeView)
                                const container = domNode.hasAttribute('data-resize-container')
                                    ? domNode
                                    : domNode.closest('[data-resize-container]');

                                if (!container) {
                                    return;
                                }

                                container.classList.remove(...FLOAT_CLASSES, ...VALIGN_CLASSES);

                                if (node.attrs.float) {
                                    container.classList.add(`float-${node.attrs.float}`);
                                }

                                if (node.attrs.verticalAlign) {
                                    container.classList.add(`valign-${node.attrs.verticalAlign}`);
                                }

                                // Синхронизация custom-размеров (rem, em, %) с DOM-контейнером.
                                // Если задан только один — второй автопропорционируется.
                                const cw = node.attrs.customWidth as string | null;
                                const ch = node.attrs.customHeight as string | null;
                                const el = container as HTMLElement;

                                if (cw && ch) {
                                    applyCustomDimension(el, 'width', cw);
                                    applyCustomDimension(el, 'height', ch);
                                } else if (cw) {
                                    applyCustomDimension(el, 'width', cw);
                                    // offsetWidth даёт реальные пиксели после layout (rem/em → px)
                                    if (node.attrs.width && node.attrs.height) {
                                        const ratio = node.attrs.width / node.attrs.height;
                                        const actualW = el.offsetWidth;
                                        if (actualW && ratio) {
                                            el.style.height = `${Math.round(actualW / ratio)}px`;
                                        }
                                    }
                                } else if (ch) {
                                    applyCustomDimension(el, 'height', ch);
                                    if (node.attrs.width && node.attrs.height) {
                                        const ratio = node.attrs.width / node.attrs.height;
                                        const actualH = el.offsetHeight;
                                        if (actualH && ratio) {
                                            el.style.width = `${Math.round(actualH * ratio)}px`;
                                        }
                                    }
                                }
                            });
                        },
                    };
                },
            }),
            // Очистка customWidth/customHeight при drag-resize (когда width/height меняются без мета-флага)
            new Plugin({
                key: customSizeClearPluginKey,
                appendTransaction(transactions, oldState, newState) {
                    if (transactions.some((tr) => tr.getMeta('customSize'))) {
                        return null;
                    }

                    if (oldState.doc.eq(newState.doc)) {
                        return null;
                    }

                    let clearTr: ReturnType<typeof newState.tr.setNodeMarkup> | null = null;

                    newState.doc.descendants((newNode, pos) => {
                        if (newNode.type.name !== 'image') {
                            return;
                        }

                        if (!newNode.attrs.customWidth && !newNode.attrs.customHeight) {
                            return;
                        }

                        const oldNode = oldState.doc.nodeAt(pos);

                        if (
                            !oldNode ||
                            oldNode.type.name !== 'image' ||
                            oldNode.attrs.src !== newNode.attrs.src
                        ) {
                            return;
                        }

                        if (
                            newNode.attrs.width !== oldNode.attrs.width ||
                            newNode.attrs.height !== oldNode.attrs.height
                        ) {
                            if (!clearTr) {
                                clearTr = newState.tr;
                            }

                            clearTr.setNodeMarkup(pos, undefined, {
                                ...newNode.attrs,
                                customWidth: null,
                                customHeight: null,
                            });
                        }
                    });

                    return clearTr;
                },
            }),
        ];
    },
});

export const ResizableImage = ResizableImageBase.configure({
    inline: true,
    resize: {
        enabled: true,
        directions: ['top-left', 'top-right', 'bottom-left', 'bottom-right'],
        minWidth: 40,
        minHeight: 40,
        alwaysPreserveAspectRatio: true,
    },
});
