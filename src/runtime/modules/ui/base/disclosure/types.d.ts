export interface IBricksDisclosureProps {
    /** Заголовок секции — он же доступное имя кнопки раскрытия */
    label: string;
    /** Секция раскрыта. Состояние контролируемое: содержимое монтируется только на открытии */
    value: boolean;
}

export interface IBricksDisclosureEmits {
    'update:value': [value: boolean];
}
