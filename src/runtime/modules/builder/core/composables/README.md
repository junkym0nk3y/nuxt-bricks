# builder/core/composables

| Файл                         | Назначение                                                                                  |
| ---------------------------- | -------------------------------------------------------------------------------------------- |
| `useComponentProperties.ts`  | Работа со свойствами компонентов: загрузка properties из story, варианты select/tabs/modal-select. Tech-debt: импортирует `getModalOptions` из `app/composables/useModals` — кандидат на DI |
