# builder/publish/composables

| Файл                          | Назначение                                                                                                  |
| ----------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `usePublishDashboard.ts`      | Состояние дашборда страниц: поиск с debounce, сегмент-фильтр, счётчики фильтров                             |
| `usePublishPageForm.ts`       | Локальная форма meta панели деталей: vee-validate + общая схема, dirty-детект, сохранение через `patchPage` |
| `usePublishCreatePageForm.ts` | Форма модалки создания страницы: авто-slugify от названия, общая схема, создание через `createPage` store'а |
| `usePublishDetailsUrl.ts`     | Live-URL панели деталей от полей формы (pagename/urlPrefix/subdomain) + копирование в буфер обмена          |
| `usePublishPageVersions.ts`   | Версии страницы для панели деталей: список сводок (`loadVersions`) + превью снапшота (`previewVersion`)     |
| `usePublishPreview.ts`        | Превью лендинга/версии: снапшот в localStorage (`bricks-preview-page`) + открытие `/preview/[pagename]`     |
| `usePublishVersionRestore.ts` | Confirm-флоу отката к версии: состояние модалки подтверждения + вызов `restorePageVersion` стора            |
