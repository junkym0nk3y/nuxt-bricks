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

export interface IBricksButtonProps {
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

export interface IBricksButtonEmits {
    click: [event: MouseEvent];
}
