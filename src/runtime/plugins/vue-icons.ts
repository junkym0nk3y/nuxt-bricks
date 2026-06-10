// plugins/vue-icons.ts
import { h, defineComponent } from 'vue';
import { defineNuxtPlugin } from '#imports';

// Прямые импорты каждой иконки (избегаем barrel file)
import {
    PhCheckCircle,
    PhXCircle,
    PhDownload,
    PhUpload,
    PhGearSix,
    PhEye,
    PhCode,
    PhPlus,
    PhMinus,
    PhInfo,
    PhDuotonePencil,
    PhMagnifyingGlass,
    PhX,
    PhPackage,
    PhCopy,
    PhTrash,
    PhPower,
    PhBoldArrowUp,
    PhBoldArrowDown,
    PhCaretDown,
    PhStar,
    PhFillStar,
    PhCursorClick,
    PhCaretRight,
    PhCaretLeft,
    PhCircleHalfTilt,
    PhBookOpenText,
    PhTable,
    PhArrowsOut,
    PhImage,
    PhLink,
    PhLinkBreak,
} from '@kalimahapps/vue-icons/ph';
import {
    MdClose,
    MdPreview,
    MdOutlinedDeleteSweep,
    MdCloudUpload,
    MdFilterList,
    MdOutlinedImage,
    MdDelete,
    MdSharpVideoLibrary,
    MdOutlinedPreview,
    MdFolderOpen,
    MdArrowUpward,
    MdArrowDownward,
    MdDeleteOutline,
    MdTextFields,
    MdOutlinedGrid3X3,
    MdOutlinedAddPhotoAlternate,
    MdOutlinedCollections,
    MdHorizontalRule,
    MdVerticalAlignBottom,
    MdVerticalAlignCenter,
    MdVerticalAlignTop,
} from '@kalimahapps/vue-icons/md';
import { ClNoteEdit, ClArrowUndoDownLeft, ClArrowUndoDownRight } from '@kalimahapps/vue-icons/cl';
import { UiLoading, UiComponent } from '@kalimahapps/vue-icons/ui';
import {
    AnOutlinedZoomOut,
    AnOutlinedZoomIn,
    AnOutlinedAppstoreAdd,
} from '@kalimahapps/vue-icons/an';
import {
    AkMobileDevice,
    AkCreditCardAlt1,
    AkDesktopDevice,
    AkSettingsHorizontal,
    AkFigmaFill,
} from '@kalimahapps/vue-icons/ak';
import { FaEye, FaRegEye, FaListUl, FaListOl } from '@kalimahapps/vue-icons/fa';
import { CaDocumentMultiple02 } from '@kalimahapps/vue-icons/ca';
import { CdFileMedia } from '@kalimahapps/vue-icons/cd';
import { ThSave } from '@kalimahapps/vue-icons/th';
import { TiOutlineDelete } from '@kalimahapps/vue-icons/ti';
import {
    BsTextLeft,
    BsTextCenter,
    BsTextRight,
    BsJustify,
    BsTextIndentLeft,
    BsTextIndentRight,
    BsMoonFill,
    BsSunFill,
    BsTypeBold,
} from '@kalimahapps/vue-icons/bs';
import { ReDragDropLine } from '@kalimahapps/vue-icons/re';
import { McLineHeightLine, McLetterSpacingLine, McTextColorLine } from '@kalimahapps/vue-icons/mc';
import { TaOutlineTextSize, TaOutlineTypography } from '@kalimahapps/vue-icons/ta';

// Map string names to component objects
const SYSTEM_ICONS: Record<string, any> = {
    // Toast
    'ph:check-circle': PhCheckCircle,
    'ph:x-circle': PhXCircle,
    'gl:close': MdClose,

    // PublishedPageCard / Modal
    'md:preview': MdPreview,
    'cl:note-edit': ClNoteEdit,
    'md:outlined-delete-sweep': MdOutlinedDeleteSweep,

    // MediaGallery
    'md:cloud-upload': MdCloudUpload,
    'md:filter-list': MdFilterList,
    'md:outlined-image': MdOutlinedImage,
    'ui:loading': UiLoading,
    'md:delete': MdDelete,

    // Canvas Toolbar
    'an:outlined-zoom-out': AnOutlinedZoomOut,
    'an:outlined-zoom-in': AnOutlinedZoomIn,
    'ak:mobile-device': AkMobileDevice,
    'ak:credit-card-alt-1': AkCreditCardAlt1,
    'ak:desktop-device': AkDesktopDevice,
    'ak:figma-fill': AkFigmaFill,

    // Media / Placeholder
    'md:sharp-video-library': MdSharpVideoLibrary,

    // Builder Toolbar
    'md:outlined-grid-3x3': MdOutlinedGrid3X3,
    'an:outlined-appstore-add': AnOutlinedAppstoreAdd,
    'ak:settings-horizontal': AkSettingsHorizontal,
    'ph:gear-six': PhGearSix,
    'fa:eye': FaEye,
    'fa:reg-eye': FaRegEye,
    'cl:arrow-undo-down-left': ClArrowUndoDownLeft,
    'cl:arrow-undo-down-right': ClArrowUndoDownRight,
    'ca:document-multiple-02': CaDocumentMultiple02,
    'cd:file-media': CdFileMedia,
    'md:outlined-preview': MdOutlinedPreview,
    'th:save': ThSave,

    // Sidebar
    'ti:outline-delete': TiOutlineDelete,
    'ui:component': UiComponent,

    // MediaPicker
    'md:folder-open': MdFolderOpen,

    // InlineContentEditor
    'md:arrow-up': MdArrowUpward,
    'md:arrow-down': MdArrowDownward,
    'md:delete-outline': MdDeleteOutline,
    'md:folder-edit': MdFolderOpen,
    'md:text-box-outline': MdTextFields,
    'ph:pencil': PhDuotonePencil,

    // TextArea / Input
    'ph:info': PhInfo,
    'ph:eye': PhEye,
    'ph:code': PhCode,
    'ph:plus': PhPlus,
    'ph:minus': PhMinus,
    'bs:text-left': BsTextLeft,
    'bs:text-center': BsTextCenter,
    'bs:text-right': BsTextRight,
    'bs:justify': BsJustify,
    'fa:list-ul': FaListUl,
    'fa:list-ol': FaListOl,

    // Sidebar / Search
    'ph:magnifying-glass': PhMagnifyingGlass,
    'ph:x': PhX,
    'ph:package': PhPackage,
    'md:close': MdClose,

    // ImageGalleryEditor
    'md:image-plus': MdOutlinedAddPhotoAlternate,
    'md:image-multiple': MdOutlinedCollections,

    // Empty State
    're:drag-drop-line': ReDragDropLine,

    // Dark Mode Toggle
    'bs:moon-fill': BsMoonFill,
    'bs:sun-fill': BsSunFill,
    'ph:circle-half-tilt': PhCircleHalfTilt,

    // Export / Import
    'ph:download': PhDownload,
    'ph:upload': PhUpload,

    // Canvas Item Toolbar
    'ph:copy': PhCopy,
    'ph:trash': PhTrash,
    'ph:power': PhPower,
    'ph:arrow-up-bold': PhBoldArrowUp,
    'ph:arrow-down-bold': PhBoldArrowDown,
    'ph:caret-down': PhCaretDown,
    'ph:star': PhStar,
    'ph:star-fill': PhFillStar,
    'ph:cursor-click': PhCursorClick,
    'ph:caret-right': PhCaretRight,
    'ph:caret-left': PhCaretLeft,

    // Documentation
    'ph:book-open-text': PhBookOpenText,

    // Table
    'ph:table': PhTable,

    // Image (inline editing)
    'ph:image': PhImage,
    'bs:text-indent-left': BsTextIndentLeft,
    'bs:text-indent-right': BsTextIndentRight,
    'md:vertical-align-bottom': MdVerticalAlignBottom,
    'md:vertical-align-center': MdVerticalAlignCenter,
    'md:vertical-align-top': MdVerticalAlignTop,

    // Image size panel (inline editing)
    'ph:link': PhLink,
    'ph:link-break': PhLinkBreak,

    // Expand
    'ph:arrows-out': PhArrowsOut,

    // Text Editor Toolbar
    'mc:line-height-line': McLineHeightLine,
    'mc:letter-spacing-line': McLetterSpacingLine,
    'ta:outline-text-size': TaOutlineTextSize,
    'ta:outline-typography': TaOutlineTypography,
    'mc:text-color-line': McTextColorLine,
    'bs:type-bold': BsTypeBold,
    'md:horizontal-rule': MdHorizontalRule,
};

export default defineNuxtPlugin((nuxtApp) => {
    // Регистрируем глобальный компонент BricksLandIcon
    nuxtApp.vueApp.component(
        'BricksLandIcon',
        defineComponent({
            props: {
                icon: {
                    type: [String, Object, Function],
                    required: true,
                },
            },

            setup(props, { attrs }) {
                return () => {
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    let iconComponent: any;

                    if (typeof props.icon === 'string') {
                        iconComponent = SYSTEM_ICONS[props.icon];
                        if (!iconComponent) {
                            console.warn(`[BricksLandIcon] Icon not found: ${props.icon}`);
                            return null;
                        }
                    } else {
                        iconComponent = props.icon;
                    }

                    return h(iconComponent, attrs);
                };
            },
        })
    );
});
