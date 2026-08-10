/**
 * Разбор содержимого перетаскивания для приёмника галереи.
 *
 * Отдельно от компонента ради проверяемости: в `dragenter` сами файлы браузер не
 * отдаёт (`dataTransfer.files` пуст до `drop`), доступен только список `items` с
 * их видом, поэтому «сколько файлов тащат» — единственное, что можно узнать
 * заранее, и считать это надо ровно одним способом.
 */

/**
 * Сколько файлов в перетаскивании.
 *
 * Учитываются только элементы с `kind === 'file'`: выделенный текст и ссылка
 * тоже приезжают в `items`, но `drop` их не принимает.
 *
 * @param dataTransfer - Данные события перетаскивания.
 * @returns Число перетаскиваемых файлов; 0, если файлов нет.
 */
export function countDraggedFiles(dataTransfer: DataTransfer | null): number {
    if (!dataTransfer) {
        return 0;
    }

    return Array.from(dataTransfer.items).filter((item) => item.kind === 'file').length;
}
