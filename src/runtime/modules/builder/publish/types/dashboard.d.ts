/**
 * Pages Manager dashboard types.
 */

import type { IBricksResolvedDevice, TBricksPageDeviceSet } from '../../../common/types/devices';
import type { TBricksModalLayer } from '../../../ui/base/modal/types';
import type { IPageVersionSummary, TPublishedPageSummary } from '../../../common/types/bricks-api';
import type { IBricksComponent, IBricksSchema } from '../../../common/types/brick';
import type { IBricksPageAddress } from '../../../common/types/pageAddress';
import type { IParsedSchemaFile } from './composables';

export type TPublishDashboardSection = 'pages' | 'templates' | 'users';

export type TPublishPagesFilter = 'all' | 'published' | 'drafts';

export interface IPublishPagesFilterCounts {
    all: number;
    published: number;
    drafts: number;
}

export interface IPublishDashboardProps {
    activeSection: TPublishDashboardSection;
    searchQuery: string;
    pagesCount: number;
    /**
     * Число учёток для счётчика рейла; `null` — список ещё не прочитан, и
     * счётчик не рисуется вовсе: ноль во время загрузки читался бы как «учёток
     * нет», чего не бывает — кто-то же вошёл.
     */
    usersCount: number | null;
    /**
     * Показывать ли раздел «Пользователи». Складывается из двух разных вещей —
     * прав на управление учётками и того, отвечают ли ручки вообще (в установке
     * без них раздела нет), — поэтому решает хост, а не сам рейл: право он
     * прочитал бы сам, а состояние загрузки правом не является.
     */
    isUsersSectionVisible: boolean;
    isDarkMode: boolean;
}

export interface IPublishDashboardEmits {
    'update:searchQuery': [value: string];
    'select-section': [section: TPublishDashboardSection];
    'create-page': [];
    /** Первичная кнопка шапки в разделе «Пользователи». */
    'create-user': [];
    'open-media': [];
    'open-docs': [];
    'toggle-dark-mode': [];
    'toggle-locale': [];
    /** Меню профиля в углу шапки: открыть модалку профиля. */
    'open-profile': [];
    logout: [];
}

export interface IPublishDashboardNavProps {
    activeSection: TPublishDashboardSection;
    pagesCount: number;
    /** Число учёток; `null` — не прочитано, счётчик скрыт. */
    usersCount: number | null;
    /** Раздел «Пользователи» доступен: есть права и ручки отвечают. */
    isUsersSectionVisible: boolean;
    locale: string;
    isDarkMode: boolean;
}

export interface IPublishDashboardNavEmits {
    'select-section': [section: TPublishDashboardSection];
    'open-media': [];
    'open-docs': [];
    'toggle-dark-mode': [];
    'toggle-locale': [];
}

export interface IPublishPagesListProps {
    pages: TPublishedPageSummary[];
    activeFilter: TPublishPagesFilter;
    counts: IPublishPagesFilterCounts;
    isLoading: boolean;
    hasAnyPages: boolean;
    duplicatingPageId: string | null;
    selectedPageId: string | null;
}

export interface IPublishPagesListEmits {
    'update:activeFilter': [filter: TPublishPagesFilter];
    'create-page': [];
    'preview-thumbnail': [page: TPublishedPageSummary];
    select: [page: TPublishedPageSummary];
    edit: [page: TPublishedPageSummary];
    preview: [page: TPublishedPageSummary];
    duplicate: [page: TPublishedPageSummary];
    delete: [page: TPublishedPageSummary];
}

export interface IPublishPagesListRowProps {
    page: TPublishedPageSummary;
    isDuplicating?: boolean;
    isSelected?: boolean;
}

export interface IPublishPagesListRowEmits {
    'preview-thumbnail': [page: TPublishedPageSummary];
    select: [page: TPublishedPageSummary];
    edit: [page: TPublishedPageSummary];
    preview: [page: TPublishedPageSummary];
    duplicate: [page: TPublishedPageSummary];
    delete: [page: TPublishedPageSummary];
}

/**
 * Значения формы meta панели деталей. `layout`/`backgroundColor` не редактируются
 * панелью, но входят в значения — их требует общая схема валидации.
 */
export interface IPublishPageFormValues {
    pagename: string;
    title: string;
    description: string;
    keywords: string;
    socialImage: string;
    urlPrefix: string;
    subdomain: string;
    layout: string;
    backgroundColor: string;
}

export interface IPublishPageFormOptions {
    onSaveSuccess: () => void;
    onSaveError: (message: string) => void;
}

export interface IPublishCreatePageFormOptions {
    /**
     * Созданная страница — адресом, а не одним именем: вызывающий уводит в её
     * редактор, а адрес редактора включает префикс. По одному имени переход
     * открывал бы `<builderPrefix>/<pagename>` — либо чужую одноимённую
     * страницу, либо пустую форму новой.
     */
    onCreated: (address: IBricksPageAddress) => void;
    /**
     * Отдаёт схему новой страницы: пустой холст либо разобранный JSON-файл,
     * прогнанный через резолвер картинок. `null` — создание отменено (резолвер
     * закрыли), POST не уходит.
     */
    resolveSchema: () => Promise<IBricksSchema | null>;
    /**
     * Отдаёт набор устройств новой страницы: правку из группы «Устройства» либо
     * набор из импортированного конверта. `null` — страница наследует набор
     * проекта.
     *
     * Отдельным колбэком, а не полем формы: набор правится своей модалкой, и
     * его состояние живёт рядом с ней, а не в схеме валидации meta-полей.
     */
    resolveViewportConfig?: () => TBricksPageDeviceSet | null;
}

/**
 * Прогон схемы через резолвер картинок дашборда. `null` — импорт отменён.
 *
 * Функцией-пропом, а не своим экземпляром резолвера в модалке: резолвер один на
 * весь дашборд, иначе две его модалки открывались бы поверх друг друга и
 * параллельно правили одно состояние медиатеки.
 */
export type TResolveImportedSchema = (schema: IBricksSchema) => Promise<IBricksSchema | null>;

export interface IPublishCreatePageModalProps {
    isOpen: boolean;
    resolveImportedSchema: TResolveImportedSchema;
}

export interface IPublishCreatePageModalEmits {
    close: [];
    created: [address: IBricksPageAddress];
}

export interface IPublishDetailsPanelProps {
    page: TPublishedPageSummary;
    isDuplicating?: boolean;
    /** Идёт импорт схемы (координатор импорта живёт в контроллере дашборда). */
    isImporting?: boolean;
}

export interface IPublishDetailsPanelEmits {
    close: [];
    edit: [page: TPublishedPageSummary];
    duplicate: [page: TPublishedPageSummary];
    delete: [page: TPublishedPageSummary];
    'toggle-published': [page: TPublishedPageSummary, published: boolean];
    'open-media': [];
    'restore-version': [page: TPublishedPageSummary, version: IPageVersionSummary];
    /** Файл схемы выбран и разобран; подтверждение и запись — на контроллере. */
    'import-schema-file': [page: TPublishedPageSummary, file: IParsedSchemaFile];
    notify: [message: string, variant: 'success' | 'error'];
}

/** Ошибки валидации формы meta по полям (vee-validate `errors`). */
export type TPublishFormErrors = Partial<Record<keyof IPublishPageFormValues, string>>;

export interface IPublishDetailsPanelOgImageProps {
    socialImage: string;
    error?: string;
    /**
     * Управление выбором картинки закрыто. Причин две и они разной природы:
     * идёт сохранение (временно) и роль без права правки (постоянно), поэтому
     * проп называется по следствию, а не по одной из причин: имя `isSaving`
     * обещало бы временное состояние, и естественный для него спиннер достался
     * бы наблюдателю навсегда.
     */
    isDisabled: boolean;
}

export interface IPublishDetailsPanelOgImageEmits {
    'open-media': [];
    clear: [];
}

export interface IPublishDetailsPanelRoutingProps {
    page: TPublishedPageSummary;
    urlPrefix: string;
    subdomain: string;
    errors: TPublishFormErrors;
    /** Поля закрыты для ввода: идёт сохранение либо у роли нет права правки. */
    isDisabled: boolean;
}

export interface IPublishDetailsPanelRoutingEmits {
    'update:urlPrefix': [value: string];
    'update:subdomain': [value: string];
}

export interface IPublishDetailsPanelVersionsProps {
    page: TPublishedPageSummary;
}

export interface IPublishDetailsPanelVersionsEmits {
    restore: [version: IPageVersionSummary];
    notify: [message: string, variant: 'success' | 'error'];
}

export interface IPublishDetailsPanelSchemaProps {
    page: TPublishedPageSummary;
    /** Идёт импорт схемы этой страницы (владеет им координатор на дашборде). */
    isImporting: boolean;
    /** Идёт сохранение meta-формы — запись схемы в это окно не начинают. */
    isSaving: boolean;
}

export interface IPublishDetailsPanelSchemaEmits {
    /**
     * Файл разобран и готов к применению; подтверждение спрашивает контроллер.
     * Страница передаётся снимком на момент выбора файла, а не читается из пропа
     * получателем: чтение файла переживает смену выбранной страницы.
     */
    'import-file': [page: TPublishedPageSummary, file: IParsedSchemaFile];
}

/** Источник содержимого новой страницы в модалке создания. */
export type TPublishCreatePageSource = 'blank' | 'template' | 'file';

export interface IPublishCreatePageStartOptionsProps {
    source: TPublishCreatePageSource;
    /** Разобранный JSON-файл, выбранный как источник (ждёт сабмита). */
    selectedFile: IParsedSchemaFile | null;
    error: string;
    isSubmitting: boolean;
}

export interface IPublishCreatePageStartOptionsEmits {
    'select-blank': [];
    'pick-file': [];
    'clear-file': [];
}

/**
 * Карточка галереи версий. `version === null` — текущее состояние страницы:
 * оно в списке версий не лежит (версия — снимок состояния, которое сохранение
 * вытеснило), но без него галерее не с чем сравнивать историю.
 * У текущей карточки нет действий: восстанавливать нечего, страница уже в этом
 * состоянии.
 */
export interface IPublishVersionCard {
    key: string;
    version: IPageVersionSummary | null;
    thumbnailUrl: string | null;
    date: string;
}

/**
 * Пропсы модалки «Устройства страницы».
 *
 * Набор приходит значением, а не читается из стора: модалка открывается и из
 * настроек сохранённой страницы, и из формы ещё не созданной, — у второй стора
 * с её набором нет вовсе.
 */
export interface IPublishDevicesModalProps {
    isOpen: boolean;
    /** Набор страницы; `null` — наследует набор проекта. */
    viewportConfig: TBricksPageDeviceSet | null;
    /** Резолвнутый набор проекта — то, что показывает выключенный тумблер. */
    projectDevices: IBricksResolvedDevice[];
    /** Ключ устройства, открытого на канвасе (подсветка сегмента шкалы). */
    activeDeviceKey: string;
    /**
     * Компоненты схемы: по ним считается число теряемых переопределений в
     * подтверждении удаления. У ещё не созданной страницы список пуст.
     */
    schemaComponents: IBricksComponent[];
    /** `nested` — модалка открыта поверх другой (форма создания страницы). */
    layer?: TBricksModalLayer;
}

export interface IPublishDevicesModalEmits {
    close: [];
    /** Набор подтверждён: уезжает в состояние редактора, а не на сервер. */
    save: [viewportConfig: TBricksPageDeviceSet | null];
}
