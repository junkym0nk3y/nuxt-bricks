# builder/core/utils

| Файл                    | Назначение                                                                                                                                                                |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `canvasFlow.ts`         | Глушение move-переходов потока канваса (`bricks-canvas--flow-instant`) на кадры, где геометрия меняется без перестановки блоков                                           |
| `history.ts`            | Ограничение размера истории undo/redo и позиции индекса                                                                                                                   |
| `inlineEditableProp.ts` | Определение inline-editable пропов layout-компонентов (без `input` — ловил CSS-пропы)                                                                                     |
| `layoutProperties.ts`   | Тонкая обёртка над registry layout-блоков: конфигурация свойств по имени layout                                                                                           |
| `scrollToComponent.ts`  | Скролл канваса к компоненту по id (со скоупом на viewport в Figma-режиме)                                                                                                 |
| `slots.ts`              | Инициализация слотов layout-компонента из метаданных brick                                                                                                                |
| `dragVisuals.ts`        | Лёгкий skeleton drag-image без клонирования DOM, CSS-переменные размера плейсхолдера и `buildDropFlowEntries` — keyed-поток «блоки + место вставки» для `TransitionGroup` |
