import type { IBuilderDraftEntry } from '../types/builderDrafts';
import { normalizeFormState } from './formState';

/**
 * Формирует ключ localStorage для черновика билдера.
 *
 * @param pagename - ЧПУ страницы.
 * @returns Ключ для localStorage.
 */
function buildBuilderDraftKey(pagename: string): string {
    return `bricks-builder:draft:${pagename}`;
}

/**
 * Возвращает черновик билдера из localStorage.
 *
 * @param pagename - ЧПУ страницы.
 */
export function getBuilderDraft(pagename: string): IBuilderDraftEntry | null {
    if (typeof window === 'undefined') {
        return null;
    }

    const key = buildBuilderDraftKey(pagename);
    const raw = window.localStorage.getItem(key);
    if (!raw) {
        return null;
    }

    try {
        return JSON.parse(raw) as IBuilderDraftEntry;
    } catch (error) {
        console.warn('[Publish Store] Failed to parse builder draft:', { key, error });
        return null;
    }
}

/**
 * Сохраняет черновик билдера в localStorage.
 *
 * @param draft - Данные черновика.
 */
export function setBuilderDraft(draft: IBuilderDraftEntry): void {
    if (typeof window === 'undefined') {
        return;
    }

    const normalized: IBuilderDraftEntry = {
        ...draft,
        draftSnapshot: {
            schema: draft.draftSnapshot.schema,
            formState: normalizeFormState(draft.draftSnapshot.formState),
        },
        savedSnapshot: draft.savedSnapshot
            ? {
                  schema: draft.savedSnapshot.schema,
                  formState: normalizeFormState(draft.savedSnapshot.formState),
              }
            : undefined,
    };

    const key = buildBuilderDraftKey(draft.pagename);
    try {
        window.localStorage.setItem(key, JSON.stringify(normalized));
    } catch (error) {
        console.warn('[Publish Store] Failed to save builder draft:', { key, error });
    }
}

/**
 * Удаляет черновик билдера.
 *
 * @param pagename - ЧПУ страницы.
 */
export function removeBuilderDraft(pagename: string): void {
    if (typeof window === 'undefined') {
        return;
    }

    const key = buildBuilderDraftKey(pagename);
    window.localStorage.removeItem(key);
}

/**
 * Переносит черновик билдера на новый pagename.
 *
 * @param fromPagename - Старый pagename.
 * @param toPagename - Новый pagename.
 */
export function migrateBuilderDraft(fromPagename: string, toPagename: string): void {
    if (typeof window === 'undefined') {
        return;
    }

    const fromKey = buildBuilderDraftKey(fromPagename);
    const toKey = buildBuilderDraftKey(toPagename);

    if (fromKey === toKey) {
        return;
    }

    const raw = window.localStorage.getItem(fromKey);
    if (!raw) {
        return;
    }

    try {
        const parsed = JSON.parse(raw) as IBuilderDraftEntry;
        parsed.pagename = toPagename;
        window.localStorage.setItem(toKey, JSON.stringify(parsed));
        window.localStorage.removeItem(fromKey);
    } catch (error) {
        console.warn('[Publish Store] Failed to migrate builder draft:', { error });
    }
}
