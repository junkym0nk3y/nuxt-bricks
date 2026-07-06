# builder/canvas/viewport/composables

Композаблы корневой области канваса: масштаб, скролл, drag&drop на свободную область.

| Файл                              | Назначение                                                                                  |
| --------------------------------- | ------------------------------------------------------------------------------------------- |
| `useCanvas.ts`                    | Обёртка над стором холста: масштаб (`canvasTransform`), стили контейнера, реакция на resize |
| `useCanvasCentering.ts`           | Горизонтальное центрирование канваса (rAF-планировщик, watcher'ы на scale/width/sidebar)    |
| `useCanvasContainerMetrics.ts`    | Синхронизация высоты канваса с контентом (ResizeObserver, пересчёт при смене viewport)      |
| `useCanvasDrops.ts`               | Drag&drop-логика корневой области канваса                                                   |
| `useCanvasPan.ts`                 | Панорамирование средней кнопкой мыши                                                        |
| `useCanvasWheel.ts`               | Ctrl(⌘)+scroll — зум к курсору, Shift+scroll — горизонтальный скролл; зум кнопок ± к центру |
| `useCanvasRemBase.ts`             | Коэффициент rem-компенсации из `remBase` breakpoint'а (см. CLAUDE.md → Rem-компенсация)     |
| `useInteractivePreviewDismiss.ts` | Сброс интерактивного предпросмотра при клике вне компонента (capture pointerdown)           |
