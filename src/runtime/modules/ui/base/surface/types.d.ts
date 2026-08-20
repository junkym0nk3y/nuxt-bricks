/** Радиус карточки: `sm` — строка списка и карточка шаблона, `md` — плитка медиатеки. */
export type TBricksSurfaceCardRadius = 'sm' | 'md';

/** Ступень тени НА НАВЕДЕНИИ: в покое карточка тени не несёт нигде. */
export type TBricksSurfaceCardElevation = 'sm' | 'md';

/**
 * Тег корня. Строка списка и карточка шаблона — `article`: у каждой своё имя и
 * свои действия, то есть это самостоятельная единица содержимого, а не блок
 * раскладки. Подменять их на `div` ради общего компонента значило бы платить
 * семантикой за оформление.
 */
export type TBricksSurfaceCardTag = 'div' | 'article';

export interface IBricksSurfaceCardProps {
    as?: TBricksSurfaceCardTag;
    radius?: TBricksSurfaceCardRadius;
    /**
     * Карточка отзывается на наведение и фокус внутри: рамка и тень. Это про
     * ОТКЛИК, а не про кликабельность — строка учётки подсвечивается, чтобы
     * проявить свои кнопки, но сама никуда не ведёт.
     */
    interactive?: boolean;
    /**
     * У карточки есть действие по клику — курсор обязан об этом сообщать.
     * Отдельно от `interactive`: `cursor: pointer` на карточке без обработчика
     * обещает переход, которого не будет.
     */
    clickable?: boolean;
    elevation?: TBricksSurfaceCardElevation;
    /** Выбранная карточка держит вид наведения постоянно */
    selected?: boolean;
}
