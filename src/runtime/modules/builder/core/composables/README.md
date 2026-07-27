# builder/core/composables

| Файл                        | Назначение                                                                                                                                                             |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `useBuilderToast.ts`        | Состояние toast-уведомления билдера и единая функция показа (тип — `../types/toast.d.ts`)                                                                              |
| `useComponentProperties.ts` | Работа со свойствами компонентов: загрузка properties из brick, варианты select/tabs/modal-select                                                                      |
| `useModalOptions.ts`        | Кеш модалок из манифеста brick-компонентов: `loadModals`, `getModalOptions` (опции селектора), `getCachedModal`, `isModalsCacheLoaded` (типы — `../types/modals.d.ts`) |
