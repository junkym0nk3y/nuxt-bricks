// #region Imports
// Types
import type { IBuilderPageWriteOptions, IUseBuilderPageWriteReturn } from '../types/composables';

// Vue
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';

// Composables
import { useBuilderToast } from '../../core/composables/useBuilderToast';
import { usePageThumbnail } from './usePageThumbnail';

// Pinia
import { useComponentsStore } from '../../core/stores/components';
import { usePublishStore } from '../../publish/stores/publish';
// #endregion

/**
 * Запись открытой страницы билдера: сохранение (черновик или публикация) и Save
 * as Copy вместе с переходом сессии, снимком превью для дашборда и тостами
 * исхода.
 *
 * Выделено из фасада страницы: у операций записи своя цельная логика — сверка
 * токена сессии, порядок перехода на сохранённый pagename, контекст страницы в
 * сообщениях, — и в общем фасаде она мешалась с проводкой shell'а.
 *
 * @param options - Токен сессии, переход/фиксация сессии и открытие панели
 * публикации: они принадлежат composition root'у, а не записи.
 */
export function useBuilderPageWrite(options: IBuilderPageWriteOptions): IUseBuilderPageWriteReturn {
    const { sessionToken, renameSession, switchToSavedPage, commitSavedSnapshot } = options;

    // #region Stores & Composables
    const { t } = useI18n();
    const componentsStore = useComponentsStore();
    const publishStore = usePublishStore();
    const { showToast } = useBuilderToast();
    const { captureAndUploadThumbnail } = usePageThumbnail(sessionToken);
    // #endregion

    // #region Computed
    const isEditingExistingPage = computed(() => publishStore.editingPageId !== null);
    const currentPublishPageTitle = computed(() => {
        const { title, pagename } = publishStore.currentFormState;
        return (title ?? '').trim() || (pagename ?? '').trim() || '';
    });
    // #endregion

    // #region Methods
    /**
     * Приписывает сообщению страницу, к которой оно относится. Нужно только для
     * операций, доехавших в уже другую сессию: там на экране чужая страница, и
     * без метки сообщение выглядит относящимся к ней.
     *
     * @param message - Текст сообщения.
     * @param pageLabel - Метка страницы, снятая на старте операции.
     * @returns Сообщение с контекстом либо исходное, если метки нет.
     */
    function withPageContext(message: string, pageLabel: string): string {
        if (!pageLabel) {
            return message;
        }

        return t('bricks.publish.toasts.forPage', { page: pageLabel, message });
    }

    /**
     * Сохраняет лендинг с указанным статусом публикации.
     * При успехе показывает toast с сообщением, при ошибке откатывает статус.
     *
     * @param published - Флаг публикации (true = опубликовано, false = черновик).
     * @param successMessage - Сообщение для отображения при успехе.
     * @returns true при успешном сохранении, false при ошибке.
     */
    async function submitPageWithPublishState(
        published: boolean,
        successMessage: string
    ): Promise<boolean> {
        const previousPublished = publishStore.currentFormState.published;
        publishStore.setCurrentFormField('published', published);
        const schema = componentsStore.exportSchema();
        const startedIn = sessionToken.capture();
        // Метка снимается до await: после него форма принадлежит уже открытой
        // странице, и тост о вытесненной операции назвал бы чужую
        const operationPageLabel = currentPublishPageTitle.value;
        const result = await publishStore.publishCurrentPage(schema, {
            isInitiatorCurrent: () => sessionToken.isCurrent(startedIn),
        });

        // Сохранение прежней страницы, доехавшее после открытия новой, её состояния
        // не касается: `startEditingPage` переписал бы форму, `commitSavedSnapshot`
        // объявил бы её черновик лишним и удалил его, снимок превью снял бы чужой
        // канвас, а `renameSession` увёл бы URL. Факт записи при этом сообщаем —
        // страница пользователя действительно сохранена
        const isCurrent = sessionToken.isCurrent(startedIn);

        if (result !== null) {
            if (!isCurrent) {
                showToast(withPageContext(successMessage, operationPageLabel), 'success');
                return true;
            }

            showToast(successMessage, 'success');

            if (publishStore.editingPageId === null) {
                publishStore.startEditingPage(result);
            }

            // Fire-and-forget: превью страницы для дашборда, сохранение не блокируем
            captureAndUploadThumbnail(result, startedIn);

            const currentPagename = publishStore.currentFormState.pagename;
            if (currentPagename) {
                // Переносим сессию на сохранённый pagename (URL + ключ черновиков),
                // затем фиксируем снапшот и подчищаем черновик по актуальному ключу.
                // Токен передаётся внутрь: `renameSession` ждёт `router.replace`, и
                // перехваченная за это время навигация сделала бы фиксацию чужой
                await renameSession(currentPagename);
                commitSavedSnapshot(startedIn);
            }
            return true;
        }

        // `generalError` — поле формы уже открытой страницы: у вытесненной
        // операции оно относится не к ней (или пусто, если новую форму уже
        // очистили), поэтому в её тост идёт только общий текст с меткой страницы
        if (!isCurrent) {
            showToast(
                withPageContext(t('bricks.publish.toasts.savePageFailed'), operationPageLabel),
                'error'
            );
            return false;
        }

        const errorMessage = publishStore.generalError || t('bricks.publish.toasts.savePageFailed');
        showToast(errorMessage, 'error');

        publishStore.setCurrentFormField('published', previousPublished);
        options.ensurePublishSettingsVisible(errorMessage);
        return false;
    }

    /**
     * Сохраняет лендинг как черновик или обновляет существующую страницу.
     * Сообщение зависит от того, редактируется ли существующая страница и её статуса публикации.
     */
    async function handleSaveDraft(): Promise<void> {
        const published = publishStore.currentFormState.published;
        const message = isEditingExistingPage.value
            ? published
                ? t('bricks.publish.toasts.pageUpdated')
                : t('bricks.publish.toasts.draftUpdated')
            : published
              ? t('bricks.publish.toasts.pagePublished')
              : t('bricks.publish.toasts.draftSaved');
        await submitPageWithPublishState(published, message);
    }

    /**
     * Сохраняет текущий лендинг как копию с новым ID.
     * Единый переход сессии (`switchToSavedPage`, фиксированный порядок: store в
     * edit mode → renameSession → savedSnapshot) выполняется до toast/thumbnail —
     * иначе URL и ключ черновика localStorage остаются от оригинала (автосейв
     * копии писал бы контент под slug оригинала, reload оригинала предлагал бы
     * восстановить чужие данные).
     */
    async function handleSaveAsCopy(): Promise<void> {
        const schema = componentsStore.exportSchema();
        const startedIn = sessionToken.capture();
        // Метка исходной страницы — до await, по той же причине, что и в обычном
        // сохранении
        const operationPageLabel = currentPublishPageTitle.value;
        const copy = await publishStore.saveCurrentPageAsCopy(schema, {
            isInitiatorCurrent: () => sessionToken.isCurrent(startedIn),
        });

        const isCurrent = sessionToken.isCurrent(startedIn);

        if (copy === null) {
            if (!isCurrent) {
                showToast(
                    withPageContext(t('bricks.publish.toasts.copyFailed'), operationPageLabel),
                    'error'
                );
                return;
            }

            const errorMessage = publishStore.generalError || t('bricks.publish.toasts.copyFailed');
            showToast(errorMessage, 'error');
            options.ensurePublishSettingsVisible(errorMessage);
            return;
        }

        const copySavedMessage = t('bricks.publish.toasts.copySaved');

        // Пользователь ушёл на другую страницу, пока летел POST: копия создана и
        // уже в списке — факт сообщаем, но переводить на неё чужую сессию нельзя,
        // а снимок превью снял бы чужой канвас. Метка — созданной копии, а не
        // исходной страницы: искать в списке пользователь будет именно копию
        if (!isCurrent) {
            showToast(withPageContext(copySavedMessage, copy.title || copy.pagename), 'success');
            return;
        }

        await switchToSavedPage(copy);

        // Вторая асинхронная граница: переход ждёт `router.replace`, и за это время
        // пользователя могло увести на другую страницу. `commitSavedSnapshot` и
        // снимок превью защищены своими проверками токена, а тост — нет: без этой
        // сверки он лёг бы поверх чужой страницы без имени копии
        if (!sessionToken.isCurrent(startedIn)) {
            showToast(withPageContext(copySavedMessage, copy.title || copy.pagename), 'success');
            return;
        }

        showToast(copySavedMessage, 'success');

        // Fire-and-forget: у копии свой S3-ключ превью — снимаем сразу после сохранения.
        // Токен — от старта Save as Copy: `switchToSavedPage` выше ждёт
        // `router.replace`, и перехваченная за это время навигация иначе дала бы
        // съёмку чужого канваса под id копии
        captureAndUploadThumbnail(copy.id, startedIn);
    }
    // #endregion

    return {
        isEditingExistingPage,
        currentPublishPageTitle,
        handleSaveDraft,
        handleSaveAsCopy,
    };
}
