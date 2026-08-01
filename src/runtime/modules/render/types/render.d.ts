import type { Ref, VNodeChild } from 'vue';
import type { IBricksComponent } from '../../common/types/brick';
import type { IBrickExportModule } from '../../common/types/index';
import type { TApiRequestOptions } from '../../common/types/composables';

export interface IRendererBrickResolverOptions {
    findImportModule: (brickPath: string) => (() => Promise<IBrickExportModule>) | undefined;
}

export interface IRendererProps {
    component: IBricksComponent;
    allComponents?: IBricksComponent[];
    /** Ключ — `component.id` из схемы, поэтому контейнер — `Map`. */
    resolvedProps?: Map<string, Record<string, unknown>>;
}

export type TRendererChildRenderer = (component: IBricksComponent) => VNodeChild;

export interface IRendererLayoutsOptions {
    allComponents: Ref<IBricksComponent[]>;
    styles: Record<string, string>;
    renderChild: TRendererChildRenderer;
}

export interface IRendererPlaceholderProps {
    title?: string;
    description?: string;
}

/**
 * Опции одного запроса публичных клиентов рендера (lookup published-страницы,
 * data sources). Форма — та же, что у клиента билдера: под обоими один ofetch.
 *
 * Вместе с формой наследуется и запрет хуков с политикой повторов. Публичным
 * клиентам он не нужен по той же причине (им нечего утекать — identity они не
 * пробрасывают вовсе, `credentials: 'omit'`), но контракт транспорта у всех
 * клиентов модуля одинаковый, и более узкий из двух — безопасный. Снятия
 * ключей в рантайме у них нет: оно защищает identity, которой здесь не бывает.
 */
export type TPublicRequestOptions = TApiRequestOptions;
