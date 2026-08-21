/** Button looks; every value here has a class of its own in `BricksButton.vue` */
export type TBricksButtonVariant = 'primary' | 'secondary' | 'ghost' | 'quiet' | 'danger';

export type TBricksButtonSize = 'sm' | 'md' | 'lg';

export interface IBricksButtonProps {
    variant?: TBricksButtonVariant;
    size?: TBricksButtonSize;
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
