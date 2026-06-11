// #region Imports
// Types
import type { ILayoutProperty } from '../types/layoutProperties';

// Utils
import { createInlineTextSegment } from '../../layouts-blocks/utils/inlineContent';
// #endregion

// #region Types
/**
 * Тип для конфигураций свойств layout, сгруппированных по имени layout
 */
type TLayoutPropertiesConfig = Record<string, ILayoutProperty[]>;
// #endregion

/**
 * Конфигурация свойств Grid layout
 */
const GRID_PROPERTIES: ILayoutProperty[] = [
    {
        name: 'columns',
        type: 'number' as const,
        label: 'Колонки',
        default: 4,
        min: 1,
        description: 'Количество колонок в сетке (1-12)',
    },
    {
        name: 'rows',
        type: 'number' as const,
        label: 'Строки',
        default: 1,
        min: 1,
        description: 'Количество строк в сетке',
    },
    {
        name: 'gap',
        type: 'number' as const,
        label: 'Отступ',
        default: 24,
        min: 0,
        description: 'Расстояние между элементами в пикселях',
    },
    {
        name: 'variant',
        type: 'select' as const,
        label: 'Вариант Bento',
        default: 'default',
        description: 'Предустановленные варианты расположения элементов',
        options: [
            { label: 'По умолчанию', value: 'default' },
            { label: 'Ведущий слева', value: 'lead-left' },
            { label: 'Ведущий справа', value: 'lead-right' },
        ],
    },
    {
        name: 'rowHeight',
        type: 'select' as const,
        label: 'Высота строки',
        default: 'auto',
        description: 'Режим высоты строк грида',
        options: [
            { label: 'Авто (по контенту)', value: 'auto' },
            { label: 'Равные строки (1fr)', value: '1fr' },
            { label: 'Минимум контента', value: 'min-content' },
            { label: 'Максимум контента', value: 'max-content' },
        ],
    },
    {
        name: 'minRowHeight',
        type: 'number' as const,
        label: 'Мин. высота строки (rem)',
        default: 0,
        min: 0,
        description: 'Минимальная высота строки в rem (0 = без ограничения)',
    },
    {
        name: 'paddingX',
        type: 'number' as const,
        label: 'Padding горизонтальный (rem)',
        default: 0,
        min: 0,
        step: 0.2,
        description: 'Горизонтальный внутренний отступ контейнера в rem',
    },
    {
        name: 'paddingY',
        type: 'number' as const,
        label: 'Padding вертикальный (rem)',
        default: 0,
        min: 0,
        step: 0.2,
        description: 'Вертикальный внутренний отступ контейнера в rem',
    },
];

/**
 * Конфигурация свойств Flex layout
 */
const FLEX_PROPERTIES: ILayoutProperty[] = [
    {
        name: 'direction',
        type: 'select' as const,
        label: 'Направление',
        default: 'row',
        description: 'Направление расположения элементов',
        options: [
            { label: 'Горизонтально', value: 'row' },
            { label: 'Вертикально', value: 'column' },
        ],
    },
    {
        name: 'justify',
        type: 'select' as const,
        label: 'По главной оси',
        default: 'start',
        description: 'Для row: по горизонтали; для column: по вертикали',
        options: [
            { label: 'В начале', value: 'start' },
            { label: 'По центру', value: 'center' },
            { label: 'В конце', value: 'end' },
            { label: 'Равномерно', value: 'space-between' },
            { label: 'С отступами', value: 'space-around' },
        ],
    },
    {
        name: 'align',
        type: 'select' as const,
        label: 'По поперечной оси',
        default: 'stretch',
        description: 'Для row: по вертикали; для column: по горизонтали',
        options: [
            { label: 'Растянуть', value: 'stretch' },
            { label: 'В начале', value: 'start' },
            { label: 'По центру', value: 'center' },
            { label: 'В конце', value: 'end' },
            { label: 'По базовой линии', value: 'baseline' },
        ],
    },
    {
        name: 'gap',
        type: 'number' as const,
        label: 'Отступ',
        default: 24,
        min: 0,
        description: 'Расстояние между элементами в пикселях',
    },
    {
        name: 'wrap',
        type: 'boolean' as const,
        label: 'Перенос строк',
        default: true,
        description: 'Переносить элементы на новую строку при нехватке места',
    },
    {
        name: 'paddingX',
        type: 'number' as const,
        label: 'Padding горизонтальный (rem)',
        default: 0,
        min: 0,
        step: 0.2,
        description: 'Горизонтальный внутренний отступ контейнера в rem',
    },
    {
        name: 'paddingY',
        type: 'number' as const,
        label: 'Padding вертикальный (rem)',
        default: 0,
        min: 0,
        step: 0.2,
        description: 'Вертикальный внутренний отступ контейнера в rem',
    },
];

/**
 * Конфигурация свойств Section layout
 */
const SECTION_PROPERTIES: ILayoutProperty[] = [
    {
        name: 'backgroundColor',
        type: 'color' as const,
        label: 'Цвет фона',
        default: '',
        description: 'CSS color или CSS variable (например, var(--bricks-base-900))',
        group: 'Фон',
    },
    {
        name: 'backgroundImage',
        type: 'image' as const,
        label: 'Фоновое изображение',
        default: '',
        description: 'URL фонового изображения',
        group: 'Фон',
    },
    {
        name: 'paddingTop',
        type: 'number' as const,
        label: 'Padding сверху (rem)',
        default: 4,
        min: 0,
        step: 0.2,
        group: 'Отступы',
        responsive: true,
    },
    {
        name: 'paddingBottom',
        type: 'number' as const,
        label: 'Padding снизу (rem)',
        default: 4,
        min: 0,
        step: 0.2,
        group: 'Отступы',
        responsive: true,
    },
    {
        name: 'paddingX',
        type: 'number' as const,
        label: 'Padding горизонтальный (rem)',
        default: 0,
        min: 0,
        step: 0.2,
        group: 'Отступы',
        responsive: true,
    },
    {
        name: 'borderRadius',
        type: 'number' as const,
        label: 'Скругление углов (rem)',
        default: 0,
        min: 0,
        step: 0.2,
        responsive: true,
    },
    {
        name: 'minHeight',
        type: 'number' as const,
        label: 'Мин. высота (rem)',
        default: 0,
        min: 0,
        step: 0.2,
        description: 'Минимальная высота секции (0 = по контенту)',
        responsive: true,
    },
];

/**
 * Конфигурация свойств Space layout
 */
const SPACE_PROPERTIES: ILayoutProperty[] = [
    {
        name: 'size',
        type: 'number' as const,
        label: 'Размер (rem)',
        default: 2.4,
        min: 0,
        step: 0.2,
        description: 'Величина отступа в rem',
        responsive: true,
    },
    {
        name: 'direction',
        type: 'select' as const,
        label: 'Направление',
        default: 'vertical',
        description: 'В каком направлении применяется отступ',
        options: [
            { label: 'Вертикально', value: 'vertical' },
            { label: 'Горизонтально', value: 'horizontal' },
            { label: 'Оба направления', value: 'both' },
        ],
    },
    {
        name: 'showDivider',
        type: 'boolean' as const,
        label: 'Показать разделитель',
        default: false,
        description: 'Отображать линию-разделитель',
        group: 'Разделитель',
    },
    {
        name: 'dividerColor',
        type: 'color' as const,
        label: 'Цвет разделителя',
        default: '',
        description: 'Пустое значение = var(--bricks-base-200)',
        group: 'Разделитель',
    },
    {
        name: 'dividerWidth',
        type: 'number' as const,
        label: 'Толщина разделителя (px)',
        default: 1,
        min: 1,
        max: 10,
        group: 'Разделитель',
    },
    {
        name: 'dividerStyle',
        type: 'select' as const,
        label: 'Стиль разделителя',
        default: 'solid',
        options: [
            { label: 'Сплошная', value: 'solid' },
            { label: 'Пунктирная', value: 'dashed' },
            { label: 'Точечная', value: 'dotted' },
        ],
        group: 'Разделитель',
    },
    {
        name: 'dividerMarginX',
        type: 'number' as const,
        label: 'Отступы разделителя по бокам (rem)',
        default: 0,
        min: 0,
        step: 0.2,
        description: 'Горизонтальные отступы разделителя от краёв в rem',
        group: 'Разделитель',
        responsive: true,
    },
];

/**
 * Конфигурация свойств Slider layout
 */
const SLIDER_PROPERTIES: ILayoutProperty[] = [
    {
        name: 'spaceBetween',
        type: 'number' as const,
        label: 'Space Between (px)',
        default: 16,
    },
    {
        name: 'slidesPerViewDesktop',
        type: 'number' as const,
        label: 'Slides per view (desktop)',
        default: 3,
    },
    {
        name: 'slidesPerViewTablet',
        type: 'number' as const,
        label: 'Slides per view (tablet)',
        default: 2,
    },
    {
        name: 'slidesPerViewMobile',
        type: 'number' as const,
        label: 'Slides per view (mobile)',
        default: 1,
    },
    {
        name: 'loop',
        type: 'boolean' as const,
        label: 'Loop slides',
        default: false,
    },
    {
        name: 'autoplay',
        type: 'boolean' as const,
        label: 'Autoplay',
        default: false,
    },
    {
        name: 'autoplayDelay',
        type: 'number' as const,
        label: 'Autoplay Delay (ms)',
        default: 3000,
    },
    {
        name: 'showNavigation',
        type: 'boolean' as const,
        label: 'Show Navigation',
        default: true,
    },
    {
        name: 'showPagination',
        type: 'boolean' as const,
        label: 'Show Pagination',
        default: false,
    },
    {
        name: 'captions',
        type: 'textarea' as const,
        label: 'Caption-табы (JSON)',
        default: '[]',
        description: 'Массив объектов [{text, subtitle?}] для текстовых табов навигации',
    },
    {
        name: 'captionPosition',
        type: 'select' as const,
        label: 'Позиция caption-табов',
        default: 'top',
        options: [
            { label: 'Сверху', value: 'top' },
            { label: 'Снизу', value: 'bottom' },
        ],
    },
    {
        name: 'showCaptionNavigation',
        type: 'boolean' as const,
        label: 'Кликабельные caption-табы',
        default: true,
        description: 'Клик по табу переключает слайд',
    },
];

/**
 * Конфигурация свойств Title layout
 *
 * @param availableFonts - Список доступных семейств шрифтов
 * @returns Массив свойств title с опциями шрифтов
 */
function getTitleProperties(availableFonts: string[]): ILayoutProperty[] {
    return [
        {
            name: 'inlineContent',
            type: 'inline-content' as const,
            label: 'Inline Content',
            default: [createInlineTextSegment('Текст заголовка')],
            description: 'Добавьте текстовые и медиа элементы внутри заголовка',
        },
        {
            name: 'headingType',
            type: 'select' as const,
            label: 'Heading Type',
            default: 'h2',
            options: [
                { label: 'H1', value: 'h1' },
                { label: 'H2', value: 'h2' },
                { label: 'H3', value: 'h3' },
                { label: 'H4', value: 'h4' },
                { label: 'H5', value: 'h5' },
                { label: 'H6', value: 'h6' },
            ],
        },
        {
            name: 'fontFamily',
            type: 'select' as const,
            label: 'Font Family',
            default: '',
            options: [
                { label: 'По-умолчанию', value: '' },
                ...availableFonts.map((font: string) => ({ label: font, value: font })),
            ],
        },
        {
            name: 'fontWeight',
            type: 'select' as const,
            label: 'Font Weight',
            default: 600,
            options: [
                { label: '100 (Thin)', value: 100 },
                { label: '200 (Extra Light)', value: 200 },
                { label: '300 (Light)', value: 300 },
                { label: '400 (Regular)', value: 400 },
                { label: '500 (Medium)', value: 500 },
                { label: '600 (Semi Bold)', value: 600 },
                { label: '700 (Bold)', value: 700 },
                { label: '800 (Extra Bold)', value: 800 },
                { label: '900 (Black)', value: 900 },
            ],
        },
        {
            name: 'textAlign',
            type: 'select' as const,
            label: 'Text Align',
            default: 'left',
            options: [
                { label: 'Left', value: 'left' },
                { label: 'Center', value: 'center' },
                { label: 'Right', value: 'right' },
            ],
        },
        {
            name: 'fontSize',
            type: 'number' as const,
            label: 'Font Size (rem)',
            default: 0,
            min: 0,
            step: 0.2,
        },
        {
            name: 'lineHeight',
            type: 'number' as const,
            label: 'Line Height',
            default: 0,
            min: 0,
            step: 0.1,
            description: 'Межстрочный интервал (0 = по-умолчанию 1.2)',
        },
        {
            name: 'letterSpacing',
            type: 'select' as const,
            label: 'Letter Spacing',
            default: '',
            description: 'Межбуквенный интервал',
            options: [
                { label: 'Обычный', value: '' },
                { label: '-0.2rem', value: '-0.2rem' },
                { label: '-0.1rem', value: '-0.1rem' },
                { label: '0rem', value: '0rem' },
                { label: '0.05rem', value: '0.05rem' },
                { label: '0.1rem', value: '0.1rem' },
                { label: '0.15rem', value: '0.15rem' },
                { label: '0.2rem', value: '0.2rem' },
                { label: '0.25rem', value: '0.25rem' },
                { label: '0.3rem', value: '0.3rem' },
                { label: '0.4rem', value: '0.4rem' },
                { label: '0.5rem', value: '0.5rem' },
            ],
        },
        {
            name: 'marginTop',
            type: 'number' as const,
            label: 'Margin Top (rem)',
            default: 0,
            min: 0,
            step: 0.2,
        },
        {
            name: 'marginBottom',
            type: 'number' as const,
            label: 'Margin Bottom (rem)',
            default: 2,
            min: 0,
            step: 0.2,
        },
    ];
}

/**
 * Конфигурация свойств Text layout
 */
const TEXT_PROPERTIES: ILayoutProperty[] = [
    {
        name: 'content',
        type: 'textarea' as const,
        label: 'Content',
        default: '<p>Enter your text content here...</p>',
    },
    {
        name: 'marginTop',
        type: 'number' as const,
        label: 'Margin Top (rem)',
        default: 0,
    },
    {
        name: 'marginBottom',
        type: 'number' as const,
        label: 'Margin Bottom (rem)',
        default: 2,
    },
];

/**
 * Конфигурация свойств Media layout
 */
const MEDIA_PROPERTIES: ILayoutProperty[] = [
    {
        name: 'type',
        type: 'select' as const,
        label: 'Тип медиа',
        default: 'image',
        options: [
            { label: 'Изображение', value: 'image' },
            { label: 'Видео', value: 'video' },
        ],
    },
    {
        name: 'src',
        type: 'image' as const,
        label: 'Источник',
        default: '',
    },
    {
        name: 'alt',
        type: 'input' as const,
        label: 'Alt текст',
        default: 'Media',
    },
    {
        name: 'objectFit',
        type: 'select' as const,
        label: 'Заполнение',
        default: 'cover',
        options: [
            { label: 'Вписать', value: 'contain' },
            { label: 'Заполнить', value: 'cover' },
            { label: 'Растянуть', value: 'fill' },
            { label: 'Без масштаба', value: 'none' },
            { label: 'Уменьшить', value: 'scale-down' },
        ],
    },
    {
        name: 'width',
        type: 'input' as const,
        label: 'Ширина',
        default: '100%',
        unit: 'rem',
        description: 'Ширина (rem, %, auto)',
        group: 'Размеры',
        responsive: true,
    },
    {
        name: 'height',
        type: 'input' as const,
        label: 'Высота',
        default: 'auto',
        unit: 'rem',
        description: 'Высота (rem, %, auto)',
        group: 'Размеры',
        responsive: true,
    },
    {
        name: 'borderRadius',
        type: 'input' as const,
        label: 'Скругление углов',
        default: '0',
        unit: 'rem',
        description: 'Скругление углов (rem)',
        group: 'Размеры',
        responsive: true,
    },
];

/**
 * Конфигурация свойств Svg layout
 */
const SVG_PROPERTIES: ILayoutProperty[] = [
    {
        name: 'src',
        type: 'image' as const,
        label: 'SVG изображение',
        default: '',
        description: 'Выберите SVG из медиа-галереи',
        svgContentProperty: 'svgContent',
    },
    {
        name: 'color',
        type: 'color' as const,
        label: 'Цвет',
        default: '',
        description: 'Применяется к fill/stroke SVG (пустое = оригинальные цвета)',
    },
    {
        name: 'width',
        type: 'input' as const,
        label: 'Ширина',
        default: '4.8rem',
        unit: 'rem',
        description: 'rem или CSS value (например, 4.8rem, 100%, auto)',
    },
    {
        name: 'height',
        type: 'input' as const,
        label: 'Высота',
        default: '4.8rem',
        unit: 'rem',
        description: 'rem или CSS value',
    },
    {
        name: 'alignment',
        type: 'select' as const,
        label: 'Выравнивание',
        default: 'left',
        options: [
            { label: 'Слева', value: 'left' },
            { label: 'По центру', value: 'center' },
            { label: 'Справа', value: 'right' },
        ],
    },
    {
        name: 'marginTop',
        type: 'number' as const,
        label: 'Margin Top (rem)',
        default: 0,
        min: 0,
        step: 0.2,
    },
    {
        name: 'marginBottom',
        type: 'number' as const,
        label: 'Margin Bottom (rem)',
        default: 0,
        min: 0,
        step: 0.2,
    },
];

/**
 * Конфигурация свойств Accordion layout
 */
const ACCORDION_PROPERTIES: ILayoutProperty[] = [
    {
        name: 'items',
        type: 'accordion-items' as const,
        label: 'Элементы',
        default: [{ title: 'Вопрос 1', content: '<p>Ответ на первый вопрос</p>' }],
        description: 'Список элементов аккордеона (массив объектов {title, content})',
    },
    {
        name: 'allowMultiple',
        type: 'boolean' as const,
        label: 'Открывать несколько',
        default: false,
        description: 'Разрешить одновременное открытие нескольких элементов',
    },
    {
        name: 'initialOpenIndex',
        type: 'number' as const,
        label: 'Открыт по умолчанию (индекс)',
        default: -1,
        description: 'Индекс элемента, открытого при загрузке (-1 = все закрыты)',
    },
    {
        name: 'gap',
        type: 'number' as const,
        label: 'Отступ между элементами (rem)',
        default: 0,
        min: 0,
        step: 0.2,
        description: 'Отступ между элементами (0 = единый блок, >0 = карточный режим)',
    },
    {
        name: 'borderRadius',
        type: 'number' as const,
        label: 'Скругление углов (rem)',
        default: 0.8,
        min: 0,
        step: 0.2,
        description: 'Радиус скругления углов аккордеона или карточек',
    },
    {
        name: 'accentColor',
        type: 'color' as const,
        label: 'Акцентный цвет',
        default: '',
        description: 'Акцентный цвет для hover, бордеров и фона',
    },
    {
        name: 'animationDuration',
        type: 'number' as const,
        label: 'Скорость анимации (ms)',
        default: 250,
        min: 0,
        step: 50,
        description: 'Длительность анимации раскрытия/закрытия в миллисекундах',
    },
];

/**
 * Получает конфигурацию свойств для конкретного типа layout.
 * Возвращает пустой массив для неизвестных типов layout.
 *
 * @param layoutName - Имя layout (grid, flex, space, title, text, media, accordion)
 * @param availableFonts - Опциональный список доступных семейств шрифтов для title/text layouts
 * @returns Массив определений свойств для типа layout
 */
export function getLayoutProperties(
    layoutName: string,
    availableFonts: string[] = []
): ILayoutProperty[] {
    const propertiesConfig: TLayoutPropertiesConfig = {
        grid: GRID_PROPERTIES,
        flex: FLEX_PROPERTIES,
        section: SECTION_PROPERTIES,
        space: SPACE_PROPERTIES,
        slider: SLIDER_PROPERTIES,
        title: getTitleProperties(availableFonts),
        text: TEXT_PROPERTIES,
        media: MEDIA_PROPERTIES,
        accordion: ACCORDION_PROPERTIES,
        svg: SVG_PROPERTIES,
    };

    return propertiesConfig[layoutName] || [];
}
