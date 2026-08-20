/**
 * Confirm Modal types
 */

export interface IBricksConfirmModalProps {
    isOpen: boolean;
    title: string;
    description?: string;
    confirmText?: string;
    cancelText?: string;
    confirmVariant?: import('../base/button/types.d.ts').TBricksButtonVariant;
    isLoading?: boolean;
}

export interface IBricksConfirmModalEmits {
    close: [];
    confirm: [];
    /** Диалог ушёл из DOM — можно открывать следующую модалку (см. IBricksModalEmits). */
    afterLeave: [];
}

/**
 * Toast types
 */

export type TBricksToastVariant = 'success' | 'error' | 'info';

export interface IBricksToastProps {
    visible: boolean;
    message: string;
    variant?: TBricksToastVariant;
    autoHide?: boolean;
    duration?: number;
    /**
     * Подпись кнопки действия. Пустая — тост без действия: ни кнопки, ни реакции
     * на клик по телу.
     */
    actionLabel?: string;
}

export interface IBricksToastEmits {
    'update:visible': [value: boolean];
    /** Нажата кнопка действия. */
    action: [];
    /**
     * Клик по телу тоста мимо кнопок. Отдельно от `action`: кнопка — короткий
     * путь к самому действию, тело — «покажи подробности», и сводить их в одно
     * событие значит терять эту разницу.
     */
    select: [];
}

/**
 * Размер пустого состояния:
 * - `md` — раздел или модалка: глиф в круге, заголовок `1.6rem`, описание и
 *   место под действие;
 * - `sm` — панель сайдбара и поповер: круга нет, кегли на ступень ниже.
 *
 * Две ступени вместо двух компонентов: разница ровно в круге и кеглях, а
 * структура (глиф, заголовок, описание, действие) одна и та же.
 */
export type TBricksEmptyStateSize = 'md' | 'sm';

export interface IBricksEmptyStateProps {
    /** Заголовок состояния — что именно пусто */
    title: string;
    /** Глиф; без него состояние остаётся текстовым */
    icon?: string;
    /** Пояснение под заголовком: что сделать, чтобы стало непусто */
    description?: string;
    size?: TBricksEmptyStateSize;
}

/**
 * Форма заглушки: `line` — строка текста (радиус-пилюля), `block` — плитка или
 * превью (радиус `xs`).
 *
 * Геометрию (ширину, высоту, пропорции) задаёт вызывающий своим классом: у
 * четырёх мест, где заглушки уже написаны, она разная во всех, а перекрывать
 * класс классом — значит зависеть от порядка стилей. Общее у них ровно фон,
 * который и переезжает сюда: он же и разъехался (`base-100` против `base-200` в
 * медиатеке).
 */
export type TBricksSkeletonShape = 'line' | 'block';

export interface IBricksSkeletonProps {
    shape?: TBricksSkeletonShape;
}
