/**
 * Типы раздела «Шаблоны» дашборда: состояние списка, формы и контракты
 * компонентов.
 *
 * Сам шаблон описан в `common/types/templates` (`TBricksTemplateSummary`,
 * `IBricksTemplateRow`) — форма ответа ручек одна на сервер и клиент, и второе
 * объявление здесь разошлось бы с серверным молча.
 */
import type { ComputedRef, Ref } from 'vue';
import type { IBricksSchema } from '../../../common/types/brick';
import type {
    IBricksTemplatePageMeta,
    IBricksTemplateRow,
    TBricksTemplateSummary,
} from '../../../common/types/templates';
import type { TBricksToastVariant } from '../../../ui/feedback/types';

/**
 * Состояние загрузки раздела.
 *
 * Состояния «раздела в этой установке нет» здесь нет, в отличие от учёток: ручки
 * шаблонов приезжают вместе с модулем и не выключаются ни флагом, ни режимом
 * авторизации, поэтому любой отказ чтения — временная неисправность, у которой
 * есть смысл в кнопке повтора.
 */
export type TTemplatesStatus = 'idle' | 'loading' | 'ready' | 'error';

/**
 * Общее состояние раздела: список сводок и признак готовности.
 *
 * Живёт в `useState` — счётчик рейла рисуется в первом кадре вместе с самим
 * пунктом раздела, а модуль-глобальный `ref` смешал бы списки разных запросов в
 * одном серверном процессе.
 */
export interface ITemplatesState {
    templates: TBricksTemplateSummary[];
    status: TTemplatesStatus;
}

/** Ответ `GET /api/bricks/templates`. */
export interface ITemplatesListResponse {
    templates: TBricksTemplateSummary[];
}

export interface IUseTemplatesDataReturn {
    templates: ComputedRef<TBricksTemplateSummary[]>;
    status: ComputedRef<TTemplatesStatus>;
    /**
     * Число шаблонов для счётчика рейла; `null` — список ещё не прочитан.
     * Ноль здесь — законное значение (шаблонов может не быть вовсе), поэтому
     * состояние загрузки отличается от нуля именно `null`.
     */
    templatesCount: ComputedRef<number | null>;
    /** Дата создания самого свежего шаблона; `null` — список пуст. */
    lastSavedAt: ComputedRef<string | null>;
    /** Загружает список, если он ещё не прочитан; повторные вызовы ждут первый. */
    ensureTemplates: () => Promise<void>;
    /** Перечитывает список принудительно (повтор после отказа). */
    refreshTemplates: () => Promise<void>;
    /** Кладёт шаблон в список: новый — в начало, известный — на его место. */
    upsertTemplate: (template: TBricksTemplateSummary) => void;
    /** Убирает шаблон из списка после удаления. */
    removeTemplate: (templateId: number) => void;
}

export interface IUseTemplatesListReturn {
    /** Шаблоны, прошедшие поиск из шапки дашборда. */
    filteredTemplates: ComputedRef<TBricksTemplateSummary[]>;
    /** Поиск задан и ничего не нашёл — состояние «ничего не найдено». */
    isSearchEmpty: ComputedRef<boolean>;
}

/**
 * Содержимое будущего шаблона плюс то, чем описать его источник в модалке.
 *
 * Собирает источник ВЫЗЫВАЮЩИЙ, а не модалка: точек входа две и приносят они
 * разное — строка списка страниц отдаёт сохранённую схему из базы и готовый кадр,
 * билдер отдаёт текущий канвас с несохранёнными правками. Модалка при этом
 * одинакова, и знать про страницы ей не нужно вовсе.
 */
export interface ITemplateSaveSource {
    /** Предложенное имя шаблона (название страницы). */
    suggestedName: string;
    /** Предложенное описание (описание страницы). */
    suggestedDescription: string;
    schema: IBricksSchema;
    pageMeta: IBricksTemplatePageMeta;
    /**
     * Кадр страницы, из которого сервер скопирует превью шаблона; `null` —
     * страницу ни разу не сохраняли, и шаблон останется без картинки.
     */
    thumbnailSourceUrl: string | null;
    /** Подпись источника в модалке: чем человек узнаёт страницу. */
    pageLabel: string;
    /** Адрес страницы-источника (`/blog/post`); пусто — страница ещё не сохранена. */
    pageAddressPath: string;
    /** Число блоков в схеме — то же число покажет карточка шаблона. */
    blocksCount: number;
    /**
     * Дата последнего сохранения страницы; `null` — страницы в базе ещё нет, и в
     * шаблон уедет только то, что сейчас на канвасе.
     */
    pageUpdatedAt: string | null;
}

/** Значения формы шаблона — общие для сохранения и переименования. */
export interface ITemplateFormValues {
    name: string;
    description: string;
}

export interface IUseTemplateSaveFormOptions {
    /** Источник содержимого; `null` — модалка закрыта, форма не отправляется. */
    source: Ref<ITemplateSaveSource | null> | ComputedRef<ITemplateSaveSource | null>;
    /** Шаблон сохранён: тост и закрытие — на вызывающем. */
    onSaved: (template: TBricksTemplateSummary) => void;
}

export interface IUseTemplateRenameFormOptions {
    /** Шаблон, чью подпись правят; `null` — модалка закрыта. */
    template: Ref<TBricksTemplateSummary | null> | ComputedRef<TBricksTemplateSummary | null>;
    /** Подпись сохранена. */
    onSaved: (template: TBricksTemplateSummary) => void;
}

export interface IUseTemplateActionsOptions {
    onNotify: (message: string, variant: TBricksToastVariant) => void;
}

export interface IUseTemplateActionsReturn {
    /** Шаблон, над которым идёт операция; `null` — свободны все. */
    pendingTemplateId: ComputedRef<number | null>;
    isDeleteConfirmOpen: ComputedRef<boolean>;
    deleteConfirmDescription: ComputedRef<string>;
    isDeleting: ComputedRef<boolean>;
    /** Спрашивает подтверждение удаления шаблона. */
    requestDelete: (template: TBricksTemplateSummary) => void;
    /** Закрывает подтверждение, не удаляя. */
    closeDeleteConfirm: () => void;
    /** Удаляет шаблон, чьё удаление подтвердили. */
    confirmDelete: () => Promise<void>;
}

export interface ITemplatesSectionProps {
    /** Запрос из поля поиска шапки — свой у каждого раздела дашборда. */
    searchQuery: string;
}

export interface ITemplatesSectionEmits {
    notify: [message: string, variant: TBricksToastVariant];
    /** Пустой раздел ведёт к списку страниц: шаблон рождается из страницы. */
    'go-to-pages': [];
    /** Создать страницу из шаблона — форму создания открывает хост дашборда. */
    'create-page': [template: TBricksTemplateSummary];
    /** Открыть превью шаблона в лайтбоксе (лайтбокс живёт на дашборде). */
    'preview-thumbnail': [template: TBricksTemplateSummary];
}

export interface ITemplatesGridProps {
    templates: TBricksTemplateSummary[];
    isLoading: boolean;
    /** Список пуст сам по себе (а не из-за поиска) — разные пустые состояния. */
    hasAnyTemplates: boolean;
    /** Поиск ничего не нашёл. */
    isSearchEmpty: boolean;
    /** Шаблон, над которым идёт операция: его карточка занята. */
    pendingTemplateId: number | null;
}

export interface ITemplatesGridEmits {
    'create-page': [template: TBricksTemplateSummary];
    'preview-thumbnail': [template: TBricksTemplateSummary];
    rename: [template: TBricksTemplateSummary];
    delete: [template: TBricksTemplateSummary];
    'go-to-pages': [];
}

export interface ITemplatesCardProps {
    template: TBricksTemplateSummary;
    /** Над шаблоном идёт операция — действия карточки закрыты. */
    isPending?: boolean;
}

export interface ITemplatesCardEmits {
    'create-page': [template: TBricksTemplateSummary];
    'preview-thumbnail': [template: TBricksTemplateSummary];
    rename: [template: TBricksTemplateSummary];
    delete: [template: TBricksTemplateSummary];
}

export interface ITemplatesSaveModalProps {
    isOpen: boolean;
    /** Источник содержимого; `null` — модалка ещё не наполнена. */
    source: ITemplateSaveSource | null;
}

export interface ITemplatesSaveModalEmits {
    close: [];
    saved: [template: TBricksTemplateSummary];
}

export interface ITemplatesRenameModalProps {
    isOpen: boolean;
    template: TBricksTemplateSummary | null;
}

export interface ITemplatesRenameModalEmits {
    close: [];
    saved: [template: TBricksTemplateSummary];
}

export interface ITemplatesPickerListProps {
    templates: TBricksTemplateSummary[];
    isLoading: boolean;
    /** Ключ выбранного шаблона; `null` — не выбран ни один. */
    selectedTemplateId: number | null;
}

export interface ITemplatesPickerListEmits {
    select: [template: TBricksTemplateSummary];
}

/**
 * Полный шаблон, прочитанный point-lookup'ом: содержимое и оформление для
 * создания страницы.
 */
export type TTemplateContent = IBricksTemplateRow;
