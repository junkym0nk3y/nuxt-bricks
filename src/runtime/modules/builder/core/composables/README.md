# builder/core/composables

| Файл                            | Назначение                                                                                                                                                                                            |
| ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `useBrickMetadata.ts`           | Индекс метаданных бриков по `brickPath` из ответа ручки компонентов: `replaceBrickMetadata` (пишет `useComponentLibrary`), `readBrickMetadata`; типы — `../types/componentLibrary.d.ts`               |
| `useBuilderToast.ts`            | Состояние toast-уведомления билдера: показ (`showToast`), тост с действием без автоскрытия (`showActionToast`) и гашение своего по номеру показа (`hideToast`); типы — `../types/toast.d.ts`          |
| `useComponentEditorMetadata.ts` | Данные панели свойств по компоненту канваса: layout-definitions либо индекс метаданных; один резолвер для выбора кликом и через дерево схемы                                                          |
| `useComponentProperties.ts`     | Работа со свойствами компонентов: загрузка properties из brick, варианты select/tabs/modal-select                                                                                                     |
| `useModalOptions.ts`            | Кеш модалок из манифеста brick-компонентов: `replaceModalsCache` (заполняется ответом ручки компонентов из `useComponentLibrary`), `getModalOptions` (опции селектора); типы — `../types/modals.d.ts` |
