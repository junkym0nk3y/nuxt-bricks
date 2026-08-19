// #region Imports
// Types
import type {
    IAuthAvatarCropFrame,
    IAuthProfile,
    IAuthProfileResponse,
    IAuthSessionUserPayload,
    IUseAuthProfileReturn,
} from '../types/auth';

// Vue
import { computed } from 'vue';

// Composables
import { useApiClient } from '../../../common/composables/useApiClient';
import { useAuthSession } from './useAuthSession';

// Constants
import {
    BRICKS_AUTH_REQUEST_TIMEOUT_MS,
    BRICKS_THUMBNAIL_UPLOAD_TIMEOUT_MS,
} from '../../../common/constants/apiTimeouts';

// Nuxt
import { useRequestEvent, useState } from '#imports';
// #endregion

// #region Data
/** Ключ общего состояния профиля: одно значение на приложение. */
const PROFILE_STATE_KEY = 'bricks-session-profile';

/**
 * Ключ состояния «пароль всё ещё дефолтный».
 *
 * Отдельно от профиля намеренно: профиль перезаписывается ответом каждой правки
 * (имя, фото), а флаг относится не к профилю, а к креденшелам — держи он одно
 * состояние с профилем, смена аватара стирала бы предупреждение.
 */
const DEFAULT_PASSWORD_STATE_KEY = 'bricks-session-default-password';

/**
 * Пути ручек своего профиля.
 *
 * Совпадать с гардом они обязаны буквально: послабление прав держится
 * allowlist'ом пар «метод + путь» (`server/utils/auth/rolePolicy.ts`), и лишний
 * сегмент или слэш в конце превращают правку своего профиля в админский маршрут
 * — наблюдатель получил бы 403 на своё же фото.
 */
const PROFILE_ENDPOINT = '/api/bricks/users/me';
const AVATAR_ENDPOINT = '/api/bricks/users/me/avatar';
const OWN_PASSWORD_ENDPOINT = '/api/bricks/users/me/password';
// #endregion

// #region Methods
/**
 * Приводит пользователя сессии из контекста запроса к клиентскому профилю.
 *
 * Проекция обязательна, а не «положим объект как есть»: в контексте лежит
 * `authVersion` и признак активности, а это состояние уезжает в payload
 * гидрации, то есть в исходник страницы. Поколение креденшелов там не нужно
 * никому, кроме того, кто соберётся его подделать.
 *
 * Принимается любая форма ответа «кто я» — и пользователь сессии из контекста, и
 * payload ручки `me`, где имя с фото объявлены необязательными (ответ логина их
 * не несёт). Наружу уходит одна форма, в которой «фото нет» — это `null`, а не
 * `undefined`: иначе угол экрана не может отличить «нет фото» от «ещё не знаем».
 *
 * @param user - Пользователь сессии или payload ручки `me`.
 * @returns Публичная часть профиля или null, если сессии нет.
 */
function toClientProfile(user: IAuthSessionUserPayload | undefined): IAuthProfile | null {
    if (!user) {
        return null;
    }

    return {
        id: user.id,
        username: user.username,
        role: user.role,
        displayName: user.displayName ?? null,
        avatarUrl: user.avatarUrl ?? null,
    };
}
// #endregion

/**
 * Профиль текущей сессии: имя, логин, роль и фото — плюс операции над ними.
 *
 * Состояние одно на приложение и наполняется контекстом запроса на SSR: роль и
 * профиль уже разрешил auth-middleware для самой HTML-страницы, поэтому угол
 * экрана рисуется в первом кадре без запроса. Клиентская досылка (`ensureProfile`)
 * остаётся фоллбэком для сборок без SSR — там серверной разметки нет вовсе, и
 * расходиться с ней аватару не с чем.
 *
 * Роль здесь — для показа (шапка меню), а права по-прежнему считает
 * `useBuilderPermissions`: одно состояние на два разных вопроса свести нельзя, и
 * подхватывать свежую роль посреди сессии права не должны — канвас, панель
 * свойств и гарды собраны под прежнюю, а на понижении сервер всё равно откажет
 * в записи.
 *
 * Все четыре ручки профиля отдают ОДНУ проекцию (`toAuthProfileUser`), и каждая
 * успешная правка пишет её в это же состояние: угол дашборда, угол билдера и
 * модалка читают одно значение и не могут разойтись.
 *
 * @returns Профиль сессии и операции правки.
 */
export function useAuthProfile(): IUseAuthProfileReturn {
    // #region Data
    const event = useRequestEvent();
    const { apiFetcher } = useApiClient();
    const { isDatabaseMode, fetchMe } = useAuthSession();

    const profileState = useState<IAuthProfile | null>(PROFILE_STATE_KEY, () =>
        toClientProfile(event?.context.bricksUser)
    );
    const isDefaultPasswordState = useState<boolean>(
        DEFAULT_PASSWORD_STATE_KEY,
        () => event?.context.bricksUser?.isDefaultPassword ?? false
    );
    // #endregion

    // #region Computed
    const profile = computed<IAuthProfile | null>(() => profileState.value);

    const isDefaultPassword = computed<boolean>(() => isDefaultPasswordState.value);

    const displayLabel = computed<string>(() => {
        const current = profileState.value;

        if (!current) {
            return '';
        }

        return current.displayName?.trim() || current.username;
    });
    // #endregion

    // #region Methods
    /**
     * Досылает профиль запросом `me`, если контекст запроса его не дал.
     *
     * Отказ не бросается наружу: вызывают это композишн-руты до первого кадра, и
     * упавший запрос унёс бы весь экран из-за аватара в углу. В basic-режиме
     * запроса нет вовсе — учёток там не существует, править нечего.
     */
    async function ensureProfile(): Promise<void> {
        if (!isDatabaseMode || profileState.value !== null) {
            return;
        }

        try {
            const session = await fetchMe();

            profileState.value = toClientProfile(session?.user);
            isDefaultPasswordState.value = session?.isDefaultPassword ?? false;
        } catch (error: unknown) {
            console.error('[Builder] Failed to resolve session profile:', error);
        }
    }

    /**
     * Пишет отображаемое имя.
     *
     * Пустая строка не отсекается на клиенте: сервер приводит её к `null` — это
     * и есть просьба показывать логин вместо имени.
     *
     * @param displayName - Новое отображаемое имя.
     */
    async function saveDisplayName(displayName: string): Promise<void> {
        const response = await apiFetcher<IAuthProfileResponse>(PROFILE_ENDPOINT, {
            method: 'PATCH',
            body: { displayName },
            // Короткая запись — один UPDATE строки учётки; общий потолок записи
            // держал бы кнопку формы втрое дольше нужного
            timeout: BRICKS_AUTH_REQUEST_TIMEOUT_MS,
        });

        profileState.value = response.user;
    }

    /**
     * Загружает фото с рамкой кадрирования.
     *
     * Content-type не ставится руками: его собирает `FormData` вместе с
     * boundary, а заданный вручную оставил бы запрос без boundary — сервер
     * ответил бы «ожидается multipart/form-data».
     *
     * @param file - Исходный файл фотографии.
     * @param frame - Рамка в пикселях ориентированного изображения.
     */
    async function uploadAvatar(file: File, frame: IAuthAvatarCropFrame): Promise<void> {
        const formData = new FormData();

        formData.append('file', file);
        formData.append('cropX', String(frame.left));
        formData.append('cropY', String(frame.top));
        formData.append('cropSide', String(frame.side));

        const response = await apiFetcher<IAuthProfileResponse>(AVATAR_ENDPOINT, {
            method: 'POST',
            body: formData,
            // Отдача файла плюс проход sharp и выгрузка в хранилище — тот же
            // порядок работы, что у снимка превью страницы
            timeout: BRICKS_THUMBNAIL_UPLOAD_TIMEOUT_MS,
        });

        profileState.value = response.user;
    }

    /**
     * Снимает фото профиля.
     */
    async function removeAvatar(): Promise<void> {
        const response = await apiFetcher<IAuthProfileResponse>(AVATAR_ENDPOINT, {
            method: 'DELETE',
        });

        profileState.value = response.user;
    }

    /**
     * Меняет свой пароль.
     *
     * Потолок — общий для записей (30 с), а не короткий как у логина: ручка
     * делает ДВА прохода scrypt (проверка текущего и хеширование нового) под
     * общим семафором, и на занятом сервере десяти секунд ей не хватит.
     *
     * Ответа с профилем здесь нет и быть не может: успех рвёт все сессии, включая
     * текущую, и cookie в этом же ответе гасится. Состояние профиля не трогаем —
     * вызывающий уводит человека на форму логина.
     *
     * @param currentPassword - Текущий пароль (обязателен всегда).
     * @param newPassword - Новый пароль.
     */
    async function changeOwnPassword(currentPassword: string, newPassword: string): Promise<void> {
        await apiFetcher(OWN_PASSWORD_ENDPOINT, {
            method: 'POST',
            body: { currentPassword, newPassword },
        });
    }
    // #endregion

    return {
        profile,
        displayLabel,
        isDefaultPassword,
        ensureProfile,
        saveDisplayName,
        uploadAvatar,
        removeAvatar,
        changeOwnPassword,
    };
}
