// #region Imports
// Types
import type { ISessionSaveGuardOptions } from '../types/builder';
// #endregion

/**
 * Пропускает сохранение только в согласованную сессию. Пока готовности нет,
 * `startEditingPage` уже заполнил форму и `editingPageId`, а схемы на канвасе ещё
 * нет — PUT ушёл бы с пустым холстом и затёр страницу в БД. Окно открыто не только
 * при отказе bootstrap'а, но и на обычной загрузке: лоадер прячется через один
 * цикл анимации независимо от `isSessionLoading`.
 *
 * Правило вынесено из composition root'а сюда, чтобы проверяться поведением:
 * в шаблоне его можно было бы сверить только по тексту, а такой кейс остаётся
 * зелёным, например, на потерянном `return`.
 *
 * @param options - Готовность сессии, действие сохранения и реакция на отказ.
 * @returns Было ли выполнено сохранение.
 */
export async function runSaveWhenSessionReady(options: ISessionSaveGuardOptions): Promise<boolean> {
    if (!options.isSessionReady()) {
        options.onBlocked();
        return false;
    }

    await options.save();

    return true;
}

/**
 * Оборачивает обработчик события правилом готовности сессии. Нужен там, где
 * барьеры разметки не работают: глобальный `keydown` висит на `window`, поэтому
 * ни щит, ни `inert` его не останавливают, а undo/delete/paste до готовности
 * правят канвас, который вот-вот затрёт пришедшая схема.
 *
 * @param isSessionReady - Открыта ли сессия до согласованного состояния.
 * @param handler - Обработчик, вызываемый только в согласованной сессии.
 * @returns Обработчик с проверкой готовности.
 */
export function withSessionReadyGuard<TEvent>(
    isSessionReady: () => boolean,
    handler: (event: TEvent) => void
): (event: TEvent) => void {
    return (event: TEvent) => {
        if (!isSessionReady()) {
            return;
        }

        handler(event);
    };
}
