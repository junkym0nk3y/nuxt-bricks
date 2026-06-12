# text-editor/utils

| Файл                       | Назначение                                                                                |
| -------------------------- | -------------------------------------------------------------------------------------------- |
| `createTiptapEditor.ts`    | Фабрика TipTap-редактора (асинхронная загрузка расширений, начальное содержимое)              |
| `inlineContentTiptap.ts`   | Конвертация inline-content сегментов ↔ TipTap JSONContent (text/hardBreak/image atom)         |
| `insertMediaIntoEditor.ts` | Вставка медиа из галереи в редактор (видео — setVideo, изображение — setImage)                |
| `selectedMediaNode.ts`     | Поиск выбранного медиа-нода для попавера обтекания/размера                                    |
| `sizeUnits.ts`             | Чистые конверсии размеров медиа-нодов (px/rem/em/%)                                           |
