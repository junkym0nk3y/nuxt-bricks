# builder/core/utils

| Файл                    | Назначение                                                                            |
| ----------------------- | ------------------------------------------------------------------------------------- |
| `history.ts`            | Ограничение размера истории undo/redo и позиции индекса                               |
| `inlineEditableProp.ts` | Определение inline-editable пропов layout-компонентов (без `input` — ловил CSS-пропы) |
| `layoutProperties.ts`   | Тонкая обёртка над registry layout-блоков: конфигурация свойств по имени layout       |
| `scrollToComponent.ts`  | Скролл канваса к компоненту по id (со скоупом на viewport в Figma-режиме)             |
| `slots.ts`              | Инициализация слотов layout-компонента из метаданных brick                            |
