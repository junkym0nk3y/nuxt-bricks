export type TIdaButtonVariant =
    | 'primary'
    | 'secondary'
    | 'ghost'
    | 'outline'
    | 'danger'
    | 'ascent'
    | 'red'
    | 'green'
    | 'yellow'
    | 'grey';

export type TIdaButtonSize = 'sm' | 'md' | 'lg';

export interface IIdaButtonProps {
    variant?: TIdaButtonVariant;
    size?: TIdaButtonSize;
    disabled?: boolean;
    block?: boolean;
    active?: boolean;
    type?: 'button' | 'submit' | 'reset';
    round?: boolean;
    fill?: boolean;
    equal?: boolean;
}

export interface IIdaButtonEmits {
    click: [event: MouseEvent];
}
