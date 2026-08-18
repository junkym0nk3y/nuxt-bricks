/**
 * Типы UI-домена авторизации (страница логина, сессия, свой профиль).
 */
import type { ComputedRef, Ref } from 'vue';
import type { TBricksUserRole } from '../../../common/types/auth';

/** Значения формы логина. */
export interface IAuthLoginFormValues {
    username: string;
    password: string;
}

/** Значения формы «Профиль». */
export interface IAuthProfileFormValues {
    displayName: string;
}

/** Значения формы «Пароль» (смена своего пароля). */
export interface IAuthOwnPasswordFormValues {
    currentPassword: string;
    newPassword: string;
}

/**
 * Контекст фабрик yup-схем auth-домена: переводчик передаётся снаружи, поэтому
 * сообщения-функции реактивны к смене локали. Параметры нужны сообщениям с
 * границами («не длиннее 64 символов») — число берётся из общей константы, а не
 * переписывается в текст перевода.
 */
export interface IAuthValidationSchemaOptions {
    t: (key: string, params?: Record<string, unknown>) => string;
}

/** Пользователь сессии в ответах auth-ручек (login/me). */
export interface IAuthSessionUserPayload {
    id: number;
    username: string;
    role: TBricksUserRole;
    /**
     * Профиль отдаётся только ручкой `me`: ответу логина он не нужен —
     * форма сразу уходит с страницы, а угол экрана наполняет уже билдер.
     */
    displayName?: string | null;
    avatarUrl?: string | null;
}

/** Ответ ручек login/me. */
export interface IAuthSessionResponse {
    user: IAuthSessionUserPayload;
}

/**
 * Профиль текущей сессии в состоянии приложения.
 *
 * Отдельно от `IAuthSessionUserPayload` не по стилю: там имя и фото
 * необязательны, потому что ответ логина их не несёт, — а в состоянии «фото нет»
 * и «не знаем, есть ли фото» обязаны быть различимы, иначе угол экрана не может
 * решить, рисовать букву или ждать. Форма совпадает с серверной проекцией
 * `toAuthProfileUser`, одинаковой у `auth/me` и всех ручек профиля.
 */
export interface IAuthProfile {
    id: number;
    username: string;
    role: TBricksUserRole;
    displayName: string | null;
    avatarUrl: string | null;
}

/** Ответ ручек профиля (`PATCH /users/me`, оба `users/me/avatar`). */
export interface IAuthProfileResponse {
    user: IAuthProfile;
}

/**
 * Квадратная рамка кадрирования в пикселях ОРИЕНТИРОВАННОГО изображения — того,
 * что видит браузер после применения EXIF-ориентации. Сервер проверяет границы
 * по `metadata().autoOrient`, то есть в этих же координатах.
 */
export interface IAuthAvatarCropFrame {
    left: number;
    top: number;
    side: number;
}

/** Профиль сессии и операции над ним (`useAuthProfile`). */
export interface IUseAuthProfileReturn {
    /** Профиль сессии; null — учёток нет (basic-режим) либо профиль неизвестен. */
    profile: ComputedRef<IAuthProfile | null>;
    /**
     * Подпись владельца: отображаемое имя, а без него — логин. Считается в одном
     * месте, потому что читают её три поверхности (угол, меню, модалка), и
     * разъехавшись, они показывали бы одному человеку два разных имени.
     */
    displayLabel: ComputedRef<string>;
    /** Досылает профиль, если контекст запроса его не дал (сборка без SSR). */
    ensureProfile(): Promise<void>;
    /** Пишет отображаемое имя; пустая строка снимает имя (показывается логин). */
    saveDisplayName(displayName: string): Promise<void>;
    /** Загружает фото с рамкой кадрирования; ставит новую ссылку в учётку. */
    uploadAvatar(file: File, frame: IAuthAvatarCropFrame): Promise<void>;
    /** Снимает фото (идемпотентно). */
    removeAvatar(): Promise<void>;
    /**
     * Меняет свой пароль. Успех рвёт ВСЕ сессии, включая текущую, — вызывающий
     * обязан увести человека на форму логина.
     */
    changeOwnPassword(currentPassword: string, newPassword: string): Promise<void>;
}

/** Монтирование и открытость модалки профиля (`useAuthProfileModal`). */
/** Вкладка модалки профиля, с которой она открывается. */
export type TAuthProfileTab = 'profile' | 'password';

export interface IUseAuthProfileModalReturn {
    /** Компонент модалки нужно держать в разметке (латч первого открытия). */
    shouldMount: Ref<boolean>;
    isOpen: Ref<boolean>;
    /**
     * Вкладка, запрошенная при открытии. Нужна второй точке входа: ключ в своей
     * строке раздела «Пользователи» ведёт именно в смену своего пароля, а
     * админская ручка чужого пароля на своей учётке отказывает намеренно.
     */
    requestedTab: Ref<TAuthProfileTab>;
    open(tab?: TAuthProfileTab): void;
    close(): void;
}

/** Состояние кадрирования фото профиля (`useAuthAvatarCrop`). */
export interface IUseAuthAvatarCropReturn {
    /** Адрес выбранного файла для показа (object URL); null — файла нет. */
    imageUrl: Ref<string | null>;
    /** Масштаб: 1 — меньшая сторона снимка ровно накрывает круг. */
    zoom: Ref<number>;
    /** Потолок масштаба — дальше сторона рамки ушла бы под серверный минимум. */
    maxZoom: ComputedRef<number>;
    /** Стиль показа снимка (сдвиг и масштаб) — ставится на элемент кадра. */
    imageStyle: ComputedRef<Record<string, string>>;
    /** Рамка в пикселях ориентированного изображения — то, что уходит на сервер. */
    frame: ComputedRef<IAuthAvatarCropFrame | null>;
    /** Файл декодирован и рамку можно считать. */
    isReady: ComputedRef<boolean>;
    /** Открывает файл: декодирует, ставит начальный масштаб и центрирует. */
    openFile(file: File): Promise<void>;
    /** Двигает снимок под кругом на смещение курсора в пикселях кадра. */
    dragBy(deltaX: number, deltaY: number): void;
    /** Освобождает object URL и сбрасывает состояние. */
    release(): void;
}

/** Пропы модалки профиля. */
export interface IAuthProfileModalProps {
    isOpen: boolean;
    /**
     * Доступна ли вкладка «Пароль». Приходит пропом от хоста, а не читается
     * здесь: флаг живёт в правах билдера (`useBuilderPermissions`), которых
     * auth-домен не видит по границам модулей.
     */
    canChangePassword?: boolean;
    /**
     * Вкладка, с которой открывается модалка. Применяется на КАЖДОМ открытии, а
     * не однажды: иначе открытая раз паролем модалка так и продолжала бы
     * открываться на пароле из меню профиля.
     */
    initialTab?: TAuthProfileTab;
}

export interface IAuthProfileModalEmits {
    close: [];
    /** Текст для тоста хоста (сохранение имени, удаление фото). */
    notify: [message: string, variant: 'success' | 'error'];
}

/** Пропы формы «Профиль» (фото, имя, логин, роль). */
export interface IAuthProfileDetailsFormProps {
    profile: IAuthProfile;
}

export interface IAuthProfileDetailsFormEmits {
    /** Запрос выбора файла — кадрирование живёт в отдельной модалке. */
    'pick-photo': [];
    close: [];
    notify: [message: string, variant: 'success' | 'error'];
}

export interface IAuthProfilePasswordFormEmits {
    close: [];
}

/** Пропы модалки кадрирования фото. */
export interface IAuthAvatarCropModalProps {
    isOpen: boolean;
    /** Выбранный файл; null — модалка закрыта и декодировать нечего. */
    file: File | null;
}

export interface IAuthAvatarCropModalEmits {
    close: [];
    /** Фото загружено и ссылка в учётке обновлена. */
    uploaded: [];
    /**
     * Модалка ушла из DOM (конец leave-анимации). Нужен владельцу файла: снимать
     * его в начале закрытия значило бы показывать пустой кадр всё время, пока
     * модалка уезжает.
     */
    afterLeave: [];
}

export interface IAuthProfileMenuProps {
    /**
     * Рисовать вертикальную черту перед аватаром. Нужна в тулбаре билдера, где
     * аватар стоит вплотную к кнопкам панели; в шапке дашборда — нет. Черта
     * принадлежит компоненту, а не поверхности: вне database-режима он не
     * рисуется вовсе, и линия иначе висела бы в панели одна.
     */
    separated?: boolean;
}

export interface IAuthProfileMenuEmits {
    'open-profile': [];
    logout: [];
}
