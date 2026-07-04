/**
 * Контракты registry layout-блоков (Часть B architecture-cleanup).
 * Definition описывает блок целиком: метаданные библиотеки, свойства панели,
 * responsive-режим и escape hatches для канваса/published-рендера.
 */

import type { VNode, VNodeChild } from 'vue';
import type { IBricksComponent } from '../../common/types/brick';
import type { ILayoutProperty } from '../../common/types/layoutProperty';

/** Контекст рендера published-страницы (из TheRenderer) */
export interface IBlockRenderContext {
    component: IBricksComponent;
    extraClasses: string[];
    extraAttrs: Record<string, string | undefined>;
    styles: Record<string, string>; // CSS module
    renderChild: (child: IBricksComponent) => VNodeChild;
    getChildComponents: (c: IBricksComponent) => IBricksComponent[];
}

/** Контекст биндинга на канвасе (из BuilderCanvasItemLayout) */
export interface IBlockCanvasContext {
    component: IBricksComponent;
    layoutProps: Record<string, unknown>; // уже resolved по viewport
    boundProps: Record<string, unknown>; // componentBoundProps
    childComponents: IBricksComponent[];
    renderChild: (child: IBricksComponent) => VNodeChild; // slider slides
}

export interface IBlockDefinition {
    name: string; // 'Grid' — componentName в схеме
    description: string;
    thumbnail: string; // '/images/layouts/grid.svg'
    isInteractive?: boolean;
    hasChildren?: boolean; // контейнер: children в default slot
    /** Свойства панели */
    properties: ILayoutProperty[];
    /** Дефолты вне properties (Media: muted/controls…, Svg: svgContent) */
    extraDefaults?: Record<string, unknown>;
    /** 'all' — все пропсы device-scoped (Grid/Flex/Section/Space/Media/Svg) */
    responsiveMode: 'all' | 'none';
    /** Кастомный биндинг канваса; undefined = generic layout-props */
    canvasBind?: (ctx: IBlockCanvasContext) => Record<string, unknown>;
    /** Кастомный published-рендер; undefined = generic h(component, props) */
    renderPublished?: (ctx: IBlockRenderContext) => VNode;
    /** Генерация responsive CSS-vars (шаг B6) */
    responsiveCssVars?: { prefix: string; vars: string[] };
}
