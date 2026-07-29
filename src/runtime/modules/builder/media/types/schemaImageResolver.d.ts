/**
 * Типы для резолвинга изображений при импорте JSON-схемы.
 */

/**
 * Действие для обработки найденного изображения.
 * - keep: оставить URL как есть
 * - placeholder: заменить на placeholder-изображение
 */
export type TImageResolveAction = 'keep' | 'placeholder';

/**
 * Тип источника изображения внутри props компонента.
 */
export type TImageSourceType = 'simple-prop' | 'gallery-item' | 'inline-segment' | 'html-img';

/**
 * Местоположение изображения внутри схемы.
 */
export interface IImageLocation {
    componentIndex: number;
    componentId: string;
    componentName: string;
    propName: string;
    arrayIndex?: number;
    segmentIndex?: number;
    sourceType: TImageSourceType;
}

/**
 * Извлечённый URL изображения с информацией о местоположениях.
 */
export interface IExtractedImageUrl {
    url: string;
    locations: IImageLocation[];
}

/**
 * Состояние резолвера изображений.
 *
 * `actions` — именно Map: ключ приходит из схемы (URL картинки), а
 * `<img src="__proto__">` в импортированном компоненте превратил бы
 * присваивание в вызов сеттера прототипа, и выбор «заменить на плейсхолдер»
 * для этой картинки молча игнорировался бы. Состояние локальное и в
 * payload не уезжает, поэтому ограничений на Map тут нет.
 */
export interface IImageResolverState {
    newImages: IExtractedImageUrl[];
    actions: Map<string, TImageResolveAction>;
    globalAction: TImageResolveAction;
}
