/**
 * Types of the `BricksAvatar` component.
 */

/**
 * Avatar size. Exactly three — the ones that exist on screen: the header corner
 * (36), a list row and the profile menu header (40), the profile modal (96).
 * There is deliberately no arbitrary number: the stored file is a single
 * webp 256×256, and every new size is one more place where the avatar differs
 * from the rest.
 */
export type TBricksAvatarSize = 'sm' | 'md' | 'lg';

export interface IBricksAvatarProps {
    /**
     * Caption of the avatar owner — display name or login. Not needed for
     * display: the fallback letter is taken from it when there is no photo.
     */
    name: string;
    /** Photo link; `null`/empty draws the letter instead */
    imageUrl?: string | null;
    size?: TBricksAvatarSize;
}
