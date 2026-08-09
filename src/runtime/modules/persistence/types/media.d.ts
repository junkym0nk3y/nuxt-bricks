/**
 * Серверные типы обработки медиа (upload, оптимизация, валидация).
 * Контрактные data-типы (IMediaItem, ответы API) живут в common/types/media.d.ts,
 * там же — форма параметров оптимизации: она общая у клиента и сервера.
 */
import type { IBricksMediaOptimization } from '../../common/types/media';

/** Часть multipart-формы, прочитанной с лимитом (структурно совместима с h3 MultiPartData). */
export interface IUploadedFilePart {
    name?: string;
    filename?: string;
    type?: string;
    data: Buffer;
}

/**
 * Уменьшенные варианты растра для постепенной загрузки.
 *
 * Живёт здесь, а не рядом с политикой имён в `server/utils/mediaVariants.ts`:
 * этот файл описывает форму данных, и импорт типа ИЗ серверного рантайма
 * переворачивал бы зависимость — декларации начинали зависеть от реализации, а
 * перенос утилиты ломал бы сами декларации.
 */
export type TMediaVariant = 'preview' | 'mock';

export interface IResolvedMediaConfig {
    maxUploadSizeBytes: number;
    maxUploadSizeMb: number;
    maxVideoUploadSizeBytes: number;
    maxVideoUploadSizeMb: number;
    optimization: IBricksMediaOptimization;
}

/**
 * Подготовленный к загрузке файл: результат валидации и обработки одного
 * multipart-файла, который ручка загрузки передаёт оркестрации.
 */
export interface IPreparedUpload {
    buffer: Buffer;
    mimeType: string;
    targetExtension: string;
    svgContent: string | null;
    /** Пиксельные размеры полного файла; null у SVG и видео. */
    width: number | null;
    height: number | null;
    /** Уменьшенные варианты постепенной загрузки (без имён объектов). */
    variants: Partial<Record<TMediaVariant, IOptimizedImage>>;
}

export interface IValidatedVideo {
    buffer: Buffer;
    mimeType: string;
    targetExtension: string;
}

/** Готовый к загрузке уменьшенный вариант растра. */
export interface IUploadMediaVariant {
    buffer: Buffer;
    mimeType: string;
    /** Server-generated имя объекта варианта (`uuid-preview.webp`). */
    storedFilename: string;
}

/** Результат обработки растра: готовые байты и то, чем он оказался. */
export interface IOptimizedImage {
    buffer: Buffer;
    mimeType: string;
    extension: string;
    /** Пиксельные размеры результата; null — sharp не смог их определить. */
    width: number | null;
    height: number | null;
}

export interface IValidatedImage {
    optimizedBuffer: Buffer;
    mimeType: string;
    targetExtension: string;
    isSvg: boolean;
    /** Размеры полного файла; null у SVG (векторные размеры к пикселям не сводятся). */
    width: number | null;
    height: number | null;
    /**
     * Уменьшенные варианты постепенной загрузки. Пустой объект — вариантов нет
     * (SVG, либо sharp не справился с этим входом): потребитель обязан в таком
     * случае показывать полный файл сразу.
     */
    variants: Partial<Record<TMediaVariant, IOptimizedImage>>;
}
