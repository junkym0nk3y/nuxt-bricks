/**
 * The full icon set of the builder UI. Loaded as a lazy chunk on the first hit of a
 * builder route (see plugins/vue-icons.ts) — it never enters the bundle of
 * published pages. The core (photo/video/x/device-*) lives in
 * systemIconsRegistry.ts.
 */
// Types
import type { Component } from 'vue';

// A direct import of every icon (avoiding a barrel file)
import {
    // Builder icons (Tabler, a single style)
    TaFilledMoon,
    TaFilledStar,
    TaFilledSun,
    TaOutlineArrowBackUp,
    TaOutlineArrowDown,
    TaOutlineArrowForwardUp,
    TaOutlineArrowUp,
    TaOutlineBook,
    TaOutlineBrandFigma,
    TaOutlineBrowserShare,
    TaOutlineCheck,
    TaOutlineChevronDown,
    TaOutlineChevronLeft,
    TaOutlineChevronRight,
    TaOutlineChevronUp,
    TaOutlineCircleCheck,
    TaOutlineCircleX,
    TaOutlineClick,
    TaOutlineCloudUpload,
    TaOutlineCopy,
    TaOutlineDeviceFloppy,
    TaOutlineDownload,
    TaOutlineDragDrop,
    TaOutlineEye,
    TaOutlineEyeOff,
    TaOutlineFilePencil,
    TaOutlineFiles,
    TaOutlineFilter,
    TaOutlineFolderOpen,
    TaOutlineKey,
    TaOutlineGrid4X4,
    TaOutlineInfoCircle,
    TaOutlineLayoutGridAdd,
    TaOutlineLetterCase,
    TaOutlineLibraryPhoto,
    TaOutlineLoader2,
    TaOutlineLogout,
    TaOutlineLock,
    TaOutlineMinus,
    TaOutlinePackage,
    TaOutlinePencil,
    TaOutlinePhotoPlus,
    TaOutlinePhotoVideo,
    TaOutlinePlaylistAdd,
    TaOutlinePlus,
    TaOutlinePower,
    TaOutlinePuzzle,
    TaOutlineSearch,
    TaOutlineSettings,
    TaOutlineStar,
    TaOutlineTrash,
    TaOutlineUpload,
    TaOutlineUser,
    TaOutlineUserCheck,
    TaOutlineUserOff,
    TaOutlineUsers,
    TaOutlineZoomIn,
    TaOutlineZoomOut,
    // Text editor icons (already Tabler)
    TaOutlineAlignCenter,
    TaOutlineAlignJustified,
    TaOutlineAlignLeft,
    TaOutlineAlignRight,
    TaOutlineLetterSpacing,
    TaOutlineLineHeight,
    TaOutlineLink,
    TaOutlineList,
    TaOutlineListNumbers,
    TaOutlinePhoto,
    TaOutlineSeparator,
    TaOutlineTextSize,
    TaOutlineTypography,
} from '@kalimahapps/vue-icons/ta';
// Text editor icons outside Tabler (candidates for a second migration pass)
import {
    PhArrowsOut,
    PhCircleHalfTilt,
    PhCode,
    PhEye,
    PhLink,
    PhLinkBreak,
    PhX,
} from '@kalimahapps/vue-icons/ph';
import { BsTextIndentLeft, BsTextIndentRight } from '@kalimahapps/vue-icons/bs';
import {
    MdVerticalAlignBottom,
    MdVerticalAlignCenter,
    MdVerticalAlignTop,
} from '@kalimahapps/vue-icons/md';
import { LaTextWidthSolid } from '@kalimahapps/vue-icons/la';

// Map string names to component objects
export const BUILDER_ICONS: Record<string, Component> = {
    // Canvas viewports
    'ta:outline-brand-figma': TaOutlineBrandFigma,

    // Canvas Toolbar
    'ta:outline-zoom-in': TaOutlineZoomIn,
    'ta:outline-zoom-out': TaOutlineZoomOut,
    'ta:outline-grid-4x4': TaOutlineGrid4X4,

    // Builder Toolbar
    'ta:outline-layout-grid-add': TaOutlineLayoutGridAdd,
    'ta:outline-settings': TaOutlineSettings,
    'ta:outline-eye': TaOutlineEye,
    'ta:outline-arrow-back-up': TaOutlineArrowBackUp,
    'ta:outline-arrow-forward-up': TaOutlineArrowForwardUp,
    'ta:outline-files': TaOutlineFiles,
    'ta:outline-photo-video': TaOutlinePhotoVideo,
    'ta:outline-browser-share': TaOutlineBrowserShare,
    'ta:outline-device-floppy': TaOutlineDeviceFloppy,
    'ta:outline-book': TaOutlineBook,
    'ta:outline-check': TaOutlineCheck,

    // Toast
    'ta:outline-circle-check': TaOutlineCircleCheck,
    'ta:outline-circle-x': TaOutlineCircleX,

    // Shared actions
    'ta:outline-plus': TaOutlinePlus,
    'ta:outline-lock': TaOutlineLock,
    'ta:outline-minus': TaOutlineMinus,
    'ta:outline-trash': TaOutlineTrash,
    'ta:outline-copy': TaOutlineCopy,
    'ta:outline-pencil': TaOutlinePencil,
    'ta:outline-power': TaOutlinePower,
    'ta:outline-search': TaOutlineSearch,
    'ta:outline-arrow-up': TaOutlineArrowUp,
    'ta:outline-arrow-down': TaOutlineArrowDown,
    'ta:outline-chevron-up': TaOutlineChevronUp,
    'ta:outline-chevron-down': TaOutlineChevronDown,
    'ta:outline-chevron-left': TaOutlineChevronLeft,
    'ta:outline-chevron-right': TaOutlineChevronRight,
    'ta:outline-star': TaOutlineStar,
    'ta:filled-star': TaFilledStar,
    'ta:outline-click': TaOutlineClick,
    'ta:outline-info-circle': TaOutlineInfoCircle,
    'ta:outline-loader-2': TaOutlineLoader2,
    'ta:outline-logout': TaOutlineLogout,
    'ta:outline-user': TaOutlineUser,
    'ta:outline-eye-off': TaOutlineEyeOff,

    // The Users section: the rail, the account password and the sign-in toggle
    'ta:outline-users': TaOutlineUsers,
    'ta:outline-key': TaOutlineKey,
    'ta:outline-user-off': TaOutlineUserOff,
    'ta:outline-user-check': TaOutlineUserCheck,

    // Sidebar / Library
    'ta:outline-package': TaOutlinePackage,
    'ta:outline-puzzle': TaOutlinePuzzle,
    'ta:outline-drag-drop': TaOutlineDragDrop,
    'ta:outline-letter-case': TaOutlineLetterCase,
    'ta:outline-playlist-add': TaOutlinePlaylistAdd,

    // MediaGallery / MediaPicker
    'ta:outline-cloud-upload': TaOutlineCloudUpload,
    'ta:outline-filter': TaOutlineFilter,
    'ta:outline-folder-open': TaOutlineFolderOpen,
    'ta:outline-photo-plus': TaOutlinePhotoPlus,
    'ta:outline-library-photo': TaOutlineLibraryPhoto,

    // Publish
    'ta:outline-file-pencil': TaOutlineFilePencil,

    // Export / Import
    'ta:outline-download': TaOutlineDownload,
    'ta:outline-upload': TaOutlineUpload,

    // Theme
    'ta:filled-moon': TaFilledMoon,
    'ta:filled-sun': TaFilledSun,

    // Text Editor Toolbar
    'ta:outline-text-size': TaOutlineTextSize,
    'ta:outline-typography': TaOutlineTypography,
    'ta:outline-line-height': TaOutlineLineHeight,
    'ta:outline-letter-spacing': TaOutlineLetterSpacing,
    'ta:outline-align-left': TaOutlineAlignLeft,
    'ta:outline-align-center': TaOutlineAlignCenter,
    'ta:outline-align-right': TaOutlineAlignRight,
    'ta:outline-align-justified': TaOutlineAlignJustified,
    'ta:outline-link': TaOutlineLink,
    'ta:outline-list': TaOutlineList,
    'ta:outline-list-numbers': TaOutlineListNumbers,
    'ta:outline-separator': TaOutlineSeparator,
    'ta:outline-photo': TaOutlinePhoto,
    'la:text-width-solid': LaTextWidthSolid,
    'ph:circle-half-tilt': PhCircleHalfTilt,
    'ph:code': PhCode,
    'ph:eye': PhEye,
    'ph:arrows-out': PhArrowsOut,
    'ph:x': PhX,
    'bs:text-indent-left': BsTextIndentLeft,
    'bs:text-indent-right': BsTextIndentRight,
    'md:vertical-align-top': MdVerticalAlignTop,
    'md:vertical-align-center': MdVerticalAlignCenter,
    'md:vertical-align-bottom': MdVerticalAlignBottom,

    // Image size panel (inline editing)
    'ph:link': PhLink,
    'ph:link-break': PhLinkBreak,
};
