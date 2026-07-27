# Доработки манифеста brick-компонентов

**Дата среза:** 27 июля 2026 года
**Источник:** ревью Codex (`gpt-5.6-sol`, high) изменений «brick manifest transport +
path contract + dev watcher fix» + собственная перепроверка.

## Контекст (что уже сделано)

Резолв brick-компонентов был сломан: ключи `import.meta.glob` — всегда
`/components/<путь>.brick.ts` (Vite root = `nuxt.options.srcDir`), а генератор
сканировал от `process.cwd()` и писал в манифест `../playground/components/…`.
Совпасть они не могли, ~100 строк `generatePathVariations` их не находили,
параметр `isPlayground` был мёртвым.

Сделано:

- **Контракт путей.** `brickPath` == ключ glob == `/` + путь относительно `srcDir`.
  Один паттерн `components/**/*.brick.ts`, прямой lookup без вариантов пути.
- **Транспорт.** Манифест уехал из `public/bricks.json` (чтение через
  `process.cwd()`) в `<buildDir>/bricks/manifest.json` + Nitro `serverAssets`;
  генерация — в хуке `build:before`. Работает при деплое одного `.output`.
- **Вотчер.** `import.meta.glob` не подхватывал новые файлы при SSR: vite-node
  сбрасывает кеш через `clientServer.watcher.on('all')` → `getModulesByFile` →
  обход импортёров, а для нового файла модулей в графе нет. Первым решением было
  синтетическое событие по файлу самого glob-модуля; заменено на мягкий рестарт —
  см. BM-12 в разделе «Сделано».
- **Удалено:** `layers/**`, `generatePathVariations`, CLI `bricks-gen` с
  `.mjs`-копией генератора, `npm run bricks:gen`, папка `common/utils/routing/`.

Ключевые файлы: `src/bricks-manifest.ts`,
`src/module.ts` (регион «Манифест brick-компонентов и dev-вотчер»),
`src/runtime/modules/common/composables/useBrickImports.ts`,
`src/runtime/server/utils/bricksComponents.ts`,
`src/runtime/modules/common/{constants,types}/brickManifest.*`.

Проверено вживую: dev (add/unlink/change без ручного перезапуска), `nuxi prepare`,
prod-сборка, запуск `.output` из чужого cwd, библиотека в билдере через Playwright.
Отдельно проверен SSR published-страницы с настоящим brick-компонентом: и в dev,
и в prod-сборке из постороннего cwd компонент с пропом из схемы попадает в сырой
HTML, ошибок гидрации нет. `type-check`, `lint:check`, 577/577 тестов, бюджеты
бандла — зелёные.

---

## Сделано

### BM-01. Генерация манифеста сериализована, публикация атомарна

**Выполнено 27 июля 2026 года.**

Три обязательных пункта закрыты, все три — в `src/bricks-manifest.ts`
и `src/module.ts` (регион «Манифест brick-компонентов и dev-вотчер»).

**1. Очередь.** `createBricksManifestQueue({ srcDir, manifestDir })` — один
инстанс на инстанс Nuxt, через него идут и `build:before`, и `builder:watch`.
Одновременно работает не больше одного скана; заявки, пришедшие во время
работы, склеиваются в один догоняющий прогон (`running` + `queued`, глубина
цепочки максимум 2 — прогон всё равно читает ФС заново, промежуточные проходы
ничего не добавляют). Возвращённый промис всегда относится к скану,
начавшемуся **после** вызова, поэтому `build:before` не может получить
результат более раннего прохода.

**2. Отказоустойчивость.** Обработчик `builder:watch` целиком в `try/catch`
(включая `nuxt.callHook('restart')` и `hot.send`): Nuxt зовёт хук без `await`,
так что любой реджект уходил бы в необслуженный промис, а Node с дефолтным
`--unhandled-rejections=throw` на этом убивает dev-сервер. Отдельно
`readManifestEntry` глотает ENOENT и пропускает файл: атомарное сохранение
редактора и `git checkout` дают ровно эту гонку между `globby` и `readFile`,
а удаление всё равно придёт отдельным событием вотчера. `build:before` ошибку
по-прежнему пробрасывает — сборка не должна тихо уехать в прод без манифеста.

**3. Атомарная публикация.** `publishManifest` пишет во временный файл в том
же каталоге (`manifest.json.<pid>.<n>.tmp`) и делает `rename`; при обрыве
временный файл удаляется. Ручка `/api/bricks/components` читает файл целиком,
недописанного JSON она больше увидеть не может (раньше это давало не падение,
а пустую библиотеку: `destr` возвращал строку, `manifest?.bricks` — undefined).
Монтирование server asset получило `ignore: ['**/*.tmp']` — nitro отдаёт этот
список и в `globby` prod-запекания (`rollup/index.mjs:1488`), и в dev-fsDriver
(`:1519`), так что временный файл не может стать ключом namespace `bricks`.
Суффикс — общая константа `BRICKS_MANIFEST_TEMP_SUFFIX`, чтобы имя и фильтр не
разъехались.

**Гонка старого инстанса с новым** закрыта `dispose()` на хуке `close`:
`@nuxt/cli` делает `await this.close()` до загрузки нового инстанса
(`DevServer#load`, `dev-DFnFBwYf.mjs:550`, `:578`), поэтому к моменту
`build:before` нового инстанса скан старого либо дописан, либо (если ещё стоял
в очереди) отменён — `enqueue()` после `dispose()` не сканирует и не пишет.

**Тесты:** `test/module/bricksManifestQueue.spec.ts` (9 кейсов). Тайминговых
ожиданий нет: моки `globby` и `node:fs/promises` парковывают прогон на выбранной
стадии (`globby:listed` — список файлов уже снят; `write:parked` — временный
файл ещё не записан) и ведут хронологию стадий всех прогонов, поэтому порядок
операций проверяется строгим сравнением последовательности. Покрыто: `rename`
только после полной записи temp и на нетронутую цель, отсутствие temp-мусора,
имя temp-файла, пропуск исчезнувшего файла, строгая парность стадий двух
прогонов (второй скан не начинается до `rename` первого), склейка поздних
заявок в один прогон, «догоняющий прогон видит файл, созданный после снятия
списка первым», живучесть очереди после упавшего прогона, `dispose` не
возвращается до публикации активного прогона, идемпотентность `dispose`,
отмена догоняющего прогона.

**Мутационная проверка тестов** (реализация ломалась, набор должен краснеть):
снятие сериализации (`enqueue` всегда стартует новый прогон) — 2 падения;
наивная коалесценция (возврат уже идущего прогона вместо догоняющего) — 3;
`writeFile` без `await` — 2; прямая запись в целевой файл вместо temp + `rename`
— 6; `dispose` без гашения догоняющего прогона — 1.

**Проверено вживую** (playground, dev):

- `add` brick-файла → рестарт, запись в манифесте, temp-мусора нет;
- 12 быстрых `change` подряд → рестарта нет, манифест содержит последнее
  состояние (`Probe12`), лишних сканов в логе нет, процесс жив;
- churn как при `git checkout` (3 раунда × 6 файлов add + unlink + `change`
  между ними) → манифест точно соответствует диску, процесс жив. Побочно
  видно, что создание и удаление файла в пределах одного батча fsevents
  вотчером не наблюдается вовсе — событий нет, рассинхрона тоже;
- гонка «`change` одновременно с удалением 30 из 62 brick-файлов» → 30
  последовательных рестартов (по одному на `unlink`; в моменте Vite ругается
  `WebSocket server error: Port 24680 is already in use`), но dev-сервер
  восстанавливается сам, финальный манифест = 32 записи = содержимое диска,
  ручка `/api/bricks/components` отдаёт их же. Каскад рестартов на массовом
  удалении — свойство схемы из BM-12, не регрессия BM-01: наша сторона
  коалесцирована самим `@nuxt/cli` (`unsub()` — один рестарт на инстанс);
- `unlink` последнего файла и удаление каталога → пустой манифест;
- после добавления `ignore` в монтирование: `add` и `change` по-прежнему
  доезжают до ручки `/api/bricks/components` (фильтр `getItem` не задевает);
- prod: `npm run dev:build` — манифест запечён в `chunks/raw/manifest.mjs`,
  временных файлов в server assets нет.

`type-check`, `lint:check` (oxlint + stylelint + `deps:check` + `knip`),
586/586 тестов, бюджеты бандла (entry 111 KB, published 122 KB gzip) — зелёные.

**Ревью:** Codex (`gpt-5.6-sol`, high) 27 июля 2026. Blocker'ов нет, все четыре
гарантии признаны закрытыми. По находкам сделано: `ignore` на temp в server
assets, тесты переписаны с таймингов на детерминированные парковки (три
находки — `maxActive` мерил параллельность только `globby`; проверка «скан
начался после заявки» проходила бы и на наивной коалесценции; граница
«temp записан до rename» не была детерминированной). Отклонена находка про
отсутствующий `@returns` у `publishManifest`: в `src/` у void-функций `@returns`
опускают в 250 случаях против 47 — правка была бы против фактической конвенции.

### BM-02. Категории с именами из `Object.prototype` больше не роняют ручку и сайдбар

**Выполнено 27 июля 2026 года.**

Категория из brick-файла больше нигде не становится ключом обычного объекта.

**Серверная сторона** (`src/runtime/server/utils/bricksComponents.ts`).
`groupByCategory` удалена целиком. Наружу уходит ровно одна категория, поэтому
корзины остальных строить незачем: `resolveBricksComponents` фильтрует
`manifest.bricks` напрямую и мапит найденное в `{ name, brickPath }`. Пропала
и группировка, и аккумулятор, и перебор `Object.keys(...).find(...)`; 404
теперь по пустому результату фильтра.

**Клиентская сторона.** В исходном пункте её не было, нашлась при проверке:
`builder/shell/sidebar/components/BuilderShellSidebarComponentsView.vue`
группировал библиотеку тем же способом (`if (!grouped[category]) grouped[category] = []`

- `push`). Симптом там тяжелее, чем на ручке: компонент рендерится на SSR, так
  что brick с категорией `__proto__` роняет **всю страницу редактора** в 500, а не
  одну ручку (проверено вживую: `grouped[component.category].push is not a function`).
  Группировка вынесена в чистую утилиту
  `builder/shell/sidebar/utils/componentCategories.ts` — она копит группы в `Map`
  в один проход; `categorizedComponents` теперь её вызов, `v-for` идёт по entries,
  `hasFilteredResults` — по `.size`. Слияния регистров в сайдбаре нет и не должно
  быть: там категория — заголовок группы и показывается как написана.

**Побочно исправлена потеря категорий, различающихся регистром.** Прежний
`Object.keys(...).find(...)` возвращал первый подходящий ключ, поэтому при
существующем `Marketing` компоненты из `marketing` в ответ ручки не попадали.
Теперь сравнение регистронезависимое в обе стороны и в ответ идут обе записи —
иначе регистронезависимый lookup молча отдаёт половину. Внутренних потребителей
у ветки `?category=` нет: и `useComponentLibrary`, и `useModalOptions` дёргают
ручку без параметра и получают нетронутый манифест, так что изменение касается
только внешнего HTTP-контракта.

**BM-08 частично закрыт:** мутация аккумулятора и массива `components` в
`groupByCategory` ушла вместе с самой функцией.

**Тесты:**

- `test/server/bricksComponentsCategories.spec.ts` (8 кейсов): `__proto__`,
  `constructor`, `toString`, `hasOwnProperty`, слияние регистров, манифест
  целиком, 404 на неизвестной категории, несгенерированный манифест;
- `test/builder/sidebarComponentCategories.spec.ts` (8 кейсов): те же четыре
  прототипных имени, исключение категории `Modal`, порядок групп и элементов,
  раздельные группы для разного регистра, пустой вход.

**Мутационная проверка тестов.** Серверный набор: возврат прежней реализации
(`Record` + `||=` + `push` + `Object.keys().find()`) роняет 5 кейсов из 8,
остальные три проверяют не затронутые правкой ветки. Клиентский набор: возврат
объектной группировки в утилиту роняет 4 кейса из 8. Тест «манифест не
мутируется» был написан и удалён: он проходил и на сломанной реализации —
прежний код тоже не трогал манифест (корзины и элементы создавались заново), то
есть кейс ничего не различал.

**Проверено вживую** (playground, dev, пять пробных brick-файлов с категориями
`__proto__`, `constructor`, `Marketing`, `marketing`, `Modal`):

- `GET /api/bricks/components?category=__proto__` и `?category=constructor` →
  200 с нужным компонентом;
- `?category=MARKETING` → обе записи, и `Marketing`, и `marketing`;
- `?category=nope` → 404, запрос без параметра отдаёт манифест целиком;
- сайдбар билдера рендерит все пять категорий (`Layout`, `marketing`,
  `Marketing`, `constructor`, `__proto__`), `Modal` из библиотеки исключён,
  ошибок в консоли нет;
- поиск без совпадений → «Ничего не найдено», то есть `hasFilteredResults` на
  `Map.size` работает;
- на откате файла к прежнему коду та же страница отдаёт 500 — проверка
  различающая, а не «и так работало».

`type-check`, `lint:check` (oxlint + stylelint + `deps:check` + `knip`),
602/602 тестов, `npm run dev:build`, бюджеты бандла (entry 111 KB,
published 122 KB gzip) — зелёные.

**Ревью:** Codex (`gpt-5.6-sol`, high) 27 июля 2026. Blocker'ов нет, обе правки
признаны функционально корректными; шаблон проверен на компиляцию
`renderList(categorizedComponents, ([category, groupedComponents]) => …)` —
реактивность, ключи и порядок групп сохраняются. По его находкам сделано:
серверная группировка убрана целиком (была квадратичной из-за копирования
корзины на каждый элемент и всё равно мутировала аккумулятор через `Map.set`),
клиентская вынесена в утилиту и покрыта тестами (раньше сайдбарная половина
BM-02 не имела автоматической защиты — откат только этого файла оставлял набор
зелёным), формулировка про мутацию в тексте выше приведена в соответствие коду.
Предложение перейти на `Map.groupBy` принято только для серверной стороны в виде
отказа от группировки: по `.browserslistrc` проекта (`> 0.2% and not dead`) в
целевых браузерах есть `chrome 103` и `ios_saf 11`, а `Map.groupBy` требует
Chrome 117+/Safari 17.4+, так что в клиентском бандле он недопустим — там
одиночный проход с `push` в локальную корзину и комментарием, почему не spread.
Восемь находок того же класса в других модулях вынесены отдельным пунктом BM-14.

### BM-14. Прототипные ключи закрыты во всех восьми оставшихся местах

**Выполнено 27 июля 2026 года.** Источник — ревью Codex (`gpt-5.6-sol`, high)
правки BM-02. BM-02 закрыл только категории; строки из схемы страницы и
brick-файлов становились ключами обычных объектов ещё в восьми местах.

**Общий хелпер.** `common/utils/safeRecord.ts`: `hasOwnKey` (через
`Object.prototype.hasOwnProperty.call` — `Object.hasOwn` требует Safari 15.4+,
а в `.browserslistrc` есть `ios_saf 11`, как и в решении BM-02 про `Map.groupBy`),
`readOwnKey` и `toSafeRecord` (сборка объекта из пар вместо присваивания в
аккумулятор). Контейнеры, ключ которых приходит извне целиком, переведены на
`Map` — там ограничений нет.

**Почему `toSafeRecord` отбрасывает `__proto__`.** Own-ключ `__proto__` в
обычном объекте непредставим в Nuxt payload: devalue бросает
«Cannot stringify objects with `__proto__` keys» (проверено). `constructor`,
`toString`, `hasOwnProperty` как own-ключи devalue переживают и работают
корректно — их `Object.fromEntries` создаёт правильно. Поэтому `__proto__`
отбрасывается там, где объект payload-bound, и сохраняется через `Map` там, где
контейнер это позволяет (`resolvedProps`, `slotStates`).

**Что сделано по местам:**

1. `render/composables/useRendererDataSources.ts` — **самое тяжёлое, SSR-путь
   published-страниц.** Аккумулятор `result[component.id] ||= {}` заменён на
   `Map<string, Map<string, unknown>>` с финальным `toSafeRecord` по внутренним
   корзинам; `propName in mapped` → `hasOwnKey`. Тип `resolvedProps` стал
   `Map<string, Record<string, unknown>>` — прошёл в `render/types/render.d.ts`
   и `TheRenderer.vue` (`props.resolvedProps?.get(component.id)`).
2. `layouts-blocks/registry.ts` — `getBlockDefinition` читает `BLOCK_REGISTRY`
   через `readOwnKey`; регистронезависимый fallback не тронут.
3. `builder/canvas/item/composables/useSlotDragDrop.ts` — `slotStates` теперь
   `reactive(new Map())`; `ensureSlotState` возвращает значение через `get`
   (нужен реактивный прокси), `resetAllSlotStates` идёт по `keys()`.
4. `common/composables/useBrickImports.ts` — lookup лоадера через `readOwnKey`,
   так что промах логируется, а не отдаёт `Object.prototype` под видом лоадера.
5. `builder/app/composables/useComponentLibrary.ts` — `defaultProps` собираются
   `toSafeRecord`, прототип аккумулятора больше не подменяется.
6. `render/composables/useBricksDataSources.ts` — `segment in acc` в
   `getValueByPath` и `key in params` в `buildDataSourceUrl` → `hasOwnKey`,
   набор параметров собирается `toSafeRecord`.
7. `builder/media/utils/schemaImageExtractor.ts` — пересборка пропсов идёт через
   массив пар + `toSafeRecord`.
8. `builder/canvas/item/composables/useCanvasItemLoader.ts` — снимок
   forceRender-пропов вынесен в чистую утилиту
   `builder/canvas/item/utils/forceRenderSnapshot.ts` (по образцу BM-02, ради
   тестируемости) и сериализуется **парами**, а не объектом: в объекте проп
   `__proto__` own-ключа не создавал, поэтому его правка не меняла снимок и
   перерендер не срабатывал. Это единственное место, где `Object.fromEntries`
   ничего бы не дал: снимок не payload-bound, но и объект тут не нужен.

**Полнота списка — скан оказался неполным, см. BM-15.** Искали по шаблонам, где
недоверенным был **ключ** (`obj[key] ||=`, `if (!obj[key])`, `key in obj`,
`acc[key] =`). Два других класса шаблон не ловил: чтение brick-объявленного имени
с объекта пропсов из схемы (`obj[property.name]`, десять мест в сайдбаре) и
накопитель, ключом которого становится URL изображения. Они вынесены в BM-15
вместе с дрейфом контракта `toSafeRecord`.

Четыре места, сознательно оставленные как есть, ревью перепроверило и признало
корректными: ключ во всех четырёх внутренний, а не из схемы — `registry.ts:176` и
`layouts-blocks/utils/publishedProps.ts:21` ходят по `property.name` из наших
же definitions (прототипных имён среди них нет — проверено грепом),
`builder/core/stores/actions/properties.ts:139` — по `TBricksDeviceKey`
(`mobile`/`tablet`/`desktop`), `sidebar/utils/variantBuilders.ts:255` — по
`TPropertyEditorType`.

**Тесты** (+63 кейса, 665 всего):

- `test/common/safeRecord.spec.ts` (12) — сам хелпер;
- `test/common/brickImportsPrototypeKeys.spec.ts` (5);
- `test/layouts-blocks/blockRegistryPrototypeKeys.spec.ts` (13);
- `test/render/dataSourcesPrototypeKeys.spec.ts` (6) — id компонента,
  отсутствие подстановки метода прототипа, own-значение с тем же именем;
- `test/render/dataSourceParamsPrototypeKeys.spec.ts` (11) — плейсхолдеры,
  пути `component.*`, own-параметры;
- `test/builder/slotDragDropPrototypeKeys.spec.ts` (8) — без jsdom, контейнер
  и `Node` подменены заглушками; проверяется в том числе, что состояние слота
  не протекает между элементами канваса;
- `test/builder/componentLibraryDefaultProps.spec.ts` (2);
- `test/builder/forceRenderSnapshot.spec.ts` (4);
- `test/builder/schemaImageExtractor.spec.ts` — +2 кейса.

**Мутационная проверка тестов.** Наивный `safeRecord` (`key in target`,
`target[key]`, `reduce` с присваиванием) — 34 падения в 7 файлах; возврат
аккумулятора resolvedProps к обычному объекту — 7; возврат `slotStates` к
`reactive<Record>` — 8; возврат снимка forceRender к объектной форме — 2.
`test/builder/forceRenderSnapshot.spec.ts` на первую мутацию не реагирует —
там `readOwnKey` защитный: значение члена прототипа всё равно функция, а
`JSON.stringify` выбрасывает её и в исправленной, и в сломанной версии.

**Проверено вживую** (playground, dev, временные brick-компоненты `ProbeCard`
с dataSource и слотом + `ProbeStatic` без dataSource как детектор загрязнения):

- published-страница с компонентом `id: "__proto__"` → 200, проп из dataSource
  в сыром SSR-HTML, `ProbeStatic` показывает свой `static-fallback`;
- **`Map` переживает Nuxt payload:** в `<script data-nuxt-data>` есть маркер
  `"Map"` (devalue сериализует его штатно), после гидрации в браузере проп из
  dataSource на месте, консоль чистая — ноль ошибок и ноль предупреждений,
  рассинхрона SSR/клиент нет;
- **проверка различающая:** с прежним `result[component.id] ||= {}` та же
  страница на холодном старте валит **весь dev-сервер** — `Object.prototype`
  получает ключ `headline`, его подхватывает `for...in` в vue-router по
  компонентам маршрута, и любой запрос отдаёт 500
  «Component "headline" in record … is not a valid component». То есть №1 —
  действительно отказ процесса, а не одной страницы;
- сайдбар билдера показывает категорию `Probe` с обоими компонентами,
  редактор страницы с `id: "__proto__"` открывается без ошибок;
- drag&drop в слот компонента с `id: "__proto__"`: плейсхолдер появляется на
  `dragover`, сбрасывается на `dragleave`, drop кладёт ребёнка в слот;
  `Object.prototype` и `Object` чисты.

**Упирается в Vue, а не в нас: слот с именем `__proto__` нерендерим в принципе.**
`ssrRenderSlotInner` делает `const slotFn = slots[slotName]` по обычному объекту
(`@vue/server-renderer/dist/server-renderer.cjs.js:126`), поэтому
`<slot name="__proto__" />` получает `Object.prototype` и падает с
`slotFn is not a function` ещё до нашего кода (воспроизведено: SSR 500).
Имена `constructor`/`toString`/`hasOwnProperty` рендерятся штатно. Значит
прототипное имя слота доходит до `useSlotDragDrop` не во всех вариантах, и
правка №3 — защита от загрязнения, покрытая юнит-тестами, а не наблюдаемый
сценарий целиком.

`type-check`, `lint:check` (oxlint + stylelint + `deps:check` + `knip`),
`prettier --check`, 665/665 тестов, `npm run dev:build`, бюджеты бандла
(entry 111 KB, published 122 KB gzip) — зелёные.

**Ревью:** Codex (`gpt-5.6-sol`, high) 28 июля 2026. Blocker'ов нет; переход
`resolvedProps` на `Map` проверен целиком (все потребители обновлены, devalue
5.8.1 гоняет `Map` через payload туда-обратно, включая own-ключ `__proto__` в
самой карте; реактивность на `Map.get()` и на замене карты сохраняется) и
четыре исключения «ключ внутренний» подтверждены. Пять оставшихся мест того же
класса, дрейф контракта `toSafeRecord` и один неразличающий тест вынесены в
BM-15 — BM-14 закрыт не полностью.

### BM-12. Vite-вотчер заменён на `builder:watch` + `nuxt.callHook('restart')`

**Выполнено 27 июля 2026 года.**

Состав `import.meta.glob` больше не пересобирается синтетическим событием
`server.watcher.emit('all', 'change', brickImportsFile)` — опоры на
недокументированную деталь vite-node в проекте нет. Вместо неё штатный ответ
Nuxt на «состав файлов изменился так, что на лету не пересобрать»: хук `restart`
(`@nuxt/schema/dist/index.d.mts:554`). Сам Nuxt вызывает его так же — для
`add`/`unlink` структурно значимых файлов и создания каталога компонентов
(`nuxt/dist/index.mjs:6310-6313`, `:3693`).

Итоговая раскладка (`src/module.ts`, регион «Манифест brick-компонентов и
dev-вотчер»):

- `add`/`unlink` → `nuxt.callHook('restart')`; рестарт сам прогоняет
  `build:before`, поэтому манифест перегенерируется без нашего участия;
- `change` → перегенерация манифеста + `full-reload` в клиентский Vite-сервер,
  полученный из хука `vite:serverCreated` (метаданные бриков закешированы в
  `useAsyncData('bricks-components')`, точечного HMR недостаточно — см. BM-06);
- фильтр — `isBrickFilePath(srcDir, path)` из `src/bricks-manifest.ts`: область
  та же, что у `BRICK_FILES_GLOB` (`components/**` + суффикс `.brick.ts`), так
  что `*.brick.ts` вне `components/` лишнего рестарта не вызывает;
- **вотчер регистрируется при `isBuilderEnabled || arePublishedPagesEnabled`.**
  Манифест нужен только билдеру, а карту загрузчиков читает и published-рендерер
  (`render/composables/useRendererDataSources.ts:56` и DI в
  `render/pages/[pagename].vue`), поэтому рестарт на `add`/`unlink` нужен обеим
  поверхностям; генерация манифеста и `full-reload` на `change` остались
  builder-only.

**Удалено:** `src/vite-brick-watch.ts` целиком (~100 строк) с
`IBrickWatchOptions`, синтетическое событие, `resolveRuntimeFile` с вычислением
пути до `useBrickImports`, гвардия `server.config.build.ssr`, вся связка с двумя
Vite-серверами Nuxt.

**Размен.** Плата — время мягкого рестарта на добавление или удаление
brick-файла вместо мгновенного подхвата. Измерено в playground (macOS,
Nuxt 3.21.8): `Vite client built in 6-15ms`, `Vite server built in 58-131ms`,
`Nuxt Nitro server built in 488-633ms` — порядка секунды до полной готовности,
прогрев Vite-зависимостей не повторяется (кеш `node_modules/.vite`).
Полную перезагрузку страницы мы делали и раньше, так что для глаз изменилось
только время ожидания. При этом `add`/`unlink` — редкое событие: файл создают
один раз, дальнейшая итерация идёт через `change`, который рестарта не требует
(а после BM-06 перестанет требовать и перезагрузки страницы).

**Ловушка (сохраняем на будущее).** Однострочник
`nuxt.options.watch.push(/\.brick\.ts$/)` не годится: цикл по
`nuxt.options.watch` (`nuxt/dist/index.mjs:6291-6304`) не фильтрует тип
события, поэтому рестарт случался бы на каждое сохранение brick-файла. Нужен
явный обработчик с проверкой `event` — он и стоит в коде.

**Проверено вживую** (playground, dev, пробная страница с прямым вызовом
`findImportModule`):

- до создания brick-файла — `GLOB:MISSING`;
- `add` → в логе `Restarting Nuxt…`, манифест получает запись, страница отдаёт
  `GLOB:FOUND CATEGORY:Probe` — то есть карта загрузчиков пересобрана, ручной
  перезапуск не нужен;
- `change` категории → рестарта в логе нет, манифест обновлён, SSR отдаёт новое
  значение, а в браузере (Playwright) страница перезагрузилась сама: метка на
  `window` исчезла, категория обновилась без ручного reload;
- `unlink` → рестарт, пустой манифест, страница вернулась к `GLOB:MISSING`;
- вложенный путь (`components/nested/…`) — рестарт ровно один, `brickPath` в
  манифесте верный;
- `*.brick.ts` вне `components/` (в `utils/`) — ни рестарта, ни изменения
  манифеста; рестарт вотчера отличается от нуксовского по строке
  `Directory … created`, которую пишет сам Nuxt;
- `features.builder: false` (render-only): `add` → рестарт есть (карта
  загрузчиков нужна рендереру), манифест не генерируется; `change` → ни
  рестарта, ни записи.

`type-check`, `oxlint`, `deps:check`, `knip`, 577/577 тестов,
`npm run dev:build`, бюджеты бандла (entry 111 KB, published 122 KB gzip) —
зелёные. README про подхват изменений в dev обновлён.

**Известное ограничение: `experimental.watcher: 'parcel'`.** Дефолт Nuxt —
`chokidar-granular` (Nuxt 3, `srcDir === rootDir`) либо `chokidar`
(`@nuxt/schema/dist/index.mjs:605-613`), и chokidar при удалении каталога
рекурсивно эмитит `unlink` по каждому файлу внутри (`chokidar/index.js:703`) —
наш фильтр их видит. Parcel же коалесцирует поддерево в одно событие по пути
каталога, а Nuxt мапит его в обычный `unlink`/`add`
(`nuxt/dist/index.mjs:7421`, `:7539`), теряя признак «каталог». Поэтому при
явном `watcher: 'parcel'` переименование или удаление каталога с brick-файлами
может пройти мимо вотчера: манифест и карта загрузчиков устареют согласованно до
следующего рестарта. Расширять фильтр на все `add`/`unlink` внутри `components/`
не стали — это давало бы рестарт на каждый новый `.vue`.

Три поддерживаемых сценария из «Проверить после правки» покрыты частично: dev
проверен на playground; отдельная проверка на конвенциональных Nuxt 3 и Nuxt 4 и
SSR published-страницы в prod-сборке из постороннего cwd после этой правки не
прогонялись — вотчер dev-only, prod-путь правка не затрагивает, но smoke на
`npm run smoke:pack` остаётся полезным перед релизом.

**Ревью:** Codex (`gpt-5.6-sol`, high) 27 июля 2026. Blocker'ов нет; по его
находкам сделано: фильтр сужен до области скана, вотчер расширен на render-only
поверхность, пересчёт BM-01 исправлен (гонка не ушла — см. выше), ограничение
parcel зафиксировано, координаты строк в пунктах ниже обновлены.

---

## P1

### BM-15. Прототипные ключи: пять оставшихся мест и дрейф контракта `toSafeRecord`

**Источник:** ревью Codex (`gpt-5.6-sol`, high) 28 июля 2026 правки BM-14. Все
семь пунктов перепроверены на своей стороне — координаты и механика сходятся,
поправка одна (пункт 6). Blocker'ов нет, но пункт 1 — тихая потеря данных схемы,
а пункт 5 обесценивает часть мутационной проверки BM-14.

**Почему скан BM-14 их не нашёл.** Искали шаблоны, где недоверенным был **ключ**.
Пропущены два других класса: brick-объявленное имя, читаемое с объекта пропсов из
схемы (`obj[property.name]` — объект недоверенной формы, ключ из brick-файла), и
накопитель, ключом которого становится URL изображения.

**1. Тихая потеря данных схемы при замене изображений.**
`builder/media/utils/schemaImageExtractor.ts:388`. `replaceSchemaImageUrls`
пересобирает пропсы через `toSafeRecord`, а тот отбрасывает own-ключ `__proto__`.
Схема приходит из API через `JSON.parse`, а он own-ключ `__proto__` создаёт
штатно, так что в билдере он вполне достижим. Сценарий: пропсы
`{"__proto__": {"mode":"custom"}, "image": "/old.webp"}`, пользователь меняет
картинку → запись `__proto__` исчезает. Причём **условно** — только когда
`hasChanges`, то есть при совпадении URL с маппингом. Это прямо противоречит
контракту самой функции на `:301` («Заменяет только сами URL, остальной контент
не трогает»). Точка не сериализационная, поэтому отбрасывание здесь не оправдано
ничем: нужно либо не терять ключ, либо отбрасывать его нормализацией на входе
схемы — одинаково, а не в зависимости от того, поменялась ли картинка.

**2. Накопитель действий по URL изображения.**
`builder/media/composables/useSchemaImageResolver.ts:113`, `:132`, `:143` —
запись `state.actions[img.url] = …`, чтение `:159` и
`components/TheBuilderMediaImageResolverModal.vue:132`. URL берётся из
`extractSchemaImageUrls`, то есть из схемы; при `<img src="__proto__">` в
импортируемом компоненте присваивание уходит в сеттер прототипа, а чтение
отдаёт `Object.prototype` — объект истинный, но не равный `'placeholder'`, так
что выбор «заменить на плейсхолдер» для этой картинки молча игнорируется.
Контейнер локальный и не payload-bound → `Map`.

**3. Brick-объявленные имена пропсов читаются с объекта из схемы.**
`builder/shell/sidebar/utils/variantBuilders.ts` — `componentProps[property.name]`
на строках 41, 69, 82, 94, 112, 124, 142, 179, 222, 244;
`builder/core/utils/inlineEditableProp.ts:65` — `componentProps[showWhen.field]`;
`builder/shell/sidebar/composables/usePropertyVariants.ts:126` — то же по
`showWhen.field`; `builder/shell/sidebar/composables/useSidebarPropertiesPanel.ts:162`
— `previewProps[property.name]`. Brick с value по имени `__proto__` даёт
`Boolean(componentProps['__proto__']) === true` (`:82`, `:94`) — чекбокс и свитч
всегда включены независимо от схемы; в `showWhen` сравнение `=== equals` наоборот
всегда ложно, и проп молча скрывается. Имя из brick-файла — тот же уровень
доверия, что и категория, которую BM-02 и BM-14 считают недоверенной; здесь
уровень доверия перепутан со стороной выражения. `readOwnKey` на все места.

**4. `toSafeRecord` отбрасывает годный параметр data source.**
`render/composables/useBricksDataSources.ts:273`. `params` — локальное состояние
сборки запроса, в payload не уезжает, но `__proto__` из него всё равно
выбрасывается: при `url: '/api/items/:__proto__'` и параметре с таким именем
плейсхолдер остаётся неразрешённым, `hasUnresolvedParams` срабатывает и
`executeDataSource` возвращает `null`. Заявленная в BM-14 политика («отбрасываем
только там, где объект payload-bound») здесь нарушена — контейнеру просится
`Map`, как в `resolvedProps` и `slotStates`.

**5. Тест не различает сломанную реализацию — это дефект набора, не мелочь.**
`test/render/dataSourceParamsPrototypeKeys.spec.ts:138` («параметр с именем
`__proto__` не подменяет прототип набора параметров») использует
`url: '/api/items/:id'`, а параметр называет `__proto__`. Проверено: на прежней
реализации проходят **все три** ассерта — присваивание `params['__proto__']`
меняет прототип самого `params`, а не `Object.prototype`, так что
`{}.polluted` остаётся `undefined`; `:id` не разрешается в любом случае, поэтому
`result === null` и фетчер не вызван и там, и там. Кейс не измеряет ничего, и
заявленный в BM-14 счётчик мутационной проверки по этому файлу настолько же
завышен. Чтобы тест начал различать, URL должен быть `:__proto__` — то есть
исправляется он вместе с пунктом 4, иначе останется красным по чужой причине.

**6. `Object.fromEntries` против заявленного `ios_saf 11` — поправка к
формулировке ревью.** `common/utils/safeRecord.ts:56` использует
`Object.fromEntries` (Safari 12.1+) в том же файле, где `Object.hasOwn`
сознательно не взят из-за `ios_saf 11` — обоснование внутренне противоречиво,
и это надо закрыть. Но «на iOS 11 упадёт с `TypeError`» — не тот вывод:
проверено, что `.browserslistrc` в проекте не читает ни один конфиг сборки (в
`package-lock` он только транзитивная зависимость CSS-тулинга), а
published-рендерер уже сыплет `??` (ES2020, iOS 14+) — на iOS 11 модуль
неработоспособен и без нашей правки. То есть дефект не в рантайме, а в
обоснованиях BM-02 и BM-14: сослались на цель, которую проект фактически не
держит. Решение принимать одно на оба места — либо зафиксировать реальную
цель сборки и разрешить `Object.hasOwn`, либо честно держать `.browserslistrc`.

**7. `as unknown as` в новых тестах** — нарушение `.claude/rules/typescript.md`,
не баг: `test/render/dataSourceParamsPrototypeKeys.spec.ts:49`,
`test/render/dataSourcesPrototypeKeys.spec.ts:76-78`,
`test/builder/slotDragDropPrototypeKeys.spec.ts:69`, `:92-94`,
`test/builder/schemaImageExtractor.spec.ts:23`. Заменить на фабрики-хелперы с
честными типами либо на `Partial<…>` + type guard.

**Порядок работ.** 1 и 3 — самостоятельные; 4 и 5 делаются одной правкой; 2 —
механический перевод на `Map`; 6 — решение, а не код; 7 — уборка. После 1 и 3
перепроверить полноту заново уже по обоим шаблонам (`obj[внешний ключ]` и
`obj[brick-объявленное имя]`), а не только по первому.

### BM-03. Слишком общий namespace Nitro server asset

**Файлы:** `src/runtime/modules/common/constants/brickManifest.ts:16`,
`src/module.ts:359-365`, `src/runtime/server/utils/bricksComponents.ts:20`.

`baseName: 'bricks'` может занять потребитель или другой модуль. В dev повторное
`assets.mount(baseName, …)` перетирает монтирование целиком, в prod ключи
`baseName + '/' + file` сливаются пофайлово — то есть при коллизии поведение dev
и prod разное.

**Статус проверки:** механика подтверждена по исходнику nitropack
(`dist/rollup/index.mjs`, `getAssetsDev` vs `getAssetProd`).

**Исправление:** package-qualified namespace, например `nuxt-bricks-manifest`.

### BM-04. Типы build-time файлов вынести в `*.d.ts`

**Файлы:** `src/bricks-manifest.ts:21` (`IBricksManifestOptions`), `:29`
(`IBricksManifestQueue`).

Правило хранения типов (`.claude/rules/typescript.md`) действует и для build-time
кода в `src/`, не только для рантайм-доменов. Существующий инлайн-прецедент
(`IBricksModuleOptions` в `module.ts`, `IBricksSurfaces` и
`IBricksRegistrationContext` в `module-setup.ts`) оправданием не является.
Второй фигурант пункта, `IBrickWatchOptions`, исчез вместе с
`src/vite-brick-watch.ts` в BM-12; `IBricksManifestQueue` добавлен в BM-01 в тот
же инлайн-регион — осознанно, чтобы перенести всё одним движением здесь.

**Исправление:** завести файл типов build-time слоя и перенести туда
`IBricksManifestOptions` и `IBricksManifestQueue`. Заодно решить, переносить ли
туда же существующие инлайновые интерфейсы `module.ts`/`module-setup.ts` — иначе
конвенция останется половинчатой.

---

## P2

### BM-05. Дублирование контракта манифеста в типах билдера

**Файлы:** `src/runtime/modules/common/types/brickManifest.d.ts:7`,
`src/runtime/modules/builder/app/types/composables.d.ts:32-43`,
`src/runtime/modules/builder/core/composables/useModalOptions.ts:32-34`.

`IBrickListItem` дублирует `IBrickManifestEntry`, но делает `category`
опциональной; `IBricksResponse` дублирует часть `IBricksManifest`;
`useModalOptions` объявляет ту же форму ответа инлайн в дженерике `apiFetcher`.
Расхождение клиентского и серверного контракта уже началось.

**Исправление:** импортировать `IBricksManifest`/`IBrickManifestEntry` в билдере,
узкие формы выводить через `Pick`; инлайн-дженерик в `useModalOptions` убрать.

### BM-06. Поле `hash` в манифесте: потребитель потерян при переносе

**Файлы:** `src/runtime/modules/common/types/brickManifest.d.ts:23`,
`src/bricks-manifest.ts:102-110`, `:220`,
`src/runtime/server/utils/bricksComponents.ts:9`.

**Происхождение.** Поле не случайное: в прародителе проекта, `front-lib/ui-demo`,
у него был рабочий потребитель — `store/ui-demo-navigation.ts:71-105`. Стор
фетчил `{ stories, hash }`, сравнивал хеш с сохранённым `generatedHash` и при
совпадении **пропускал пересборку** списка (`handleConvertRoutesToStore`),
а при расхождении пересобирал и запоминал новый хеш. Хелпер —
`handleComputeHash` в `ui-demo/utils/navigation/set-store-routes.ts`.

При переносе в `front-lib/ida-landing` уехала только производящая половина
(`utils/routing/generate-stories-json.mjs` считает и пишет hash), потребитель
остался в ui-demo. В nuxt-bricks приехало то же наследство: генератор пишет,
тип объявляет, `EMPTY_MANIFEST` подставляет `''` — и всё.

**Почему нельзя просто «дописать сравнение».** Семантика хеша не та, что нужна
здесь. Хешируется `JSON.stringify(bricks)`, то есть инвентарь — имя, категория,
путь. Добавление или удаление brick'а и переименование категории хеш меняют, а
правка `values`, `slots` или `description` внутри brick-файла — нет. В ui-demo
это было корректно: там из `stories` строилось меню, и ничего кроме
имени/категории/пути в него не входило. В билдере же кешировать имеет смысл
именно `defaultProps` и `slots`, к которым инвентарный хеш слеп, — сравнение по
нему отдавало бы устаревшие метаданные.

**Что хеш дал бы здесь.** Выигрыш больше, чем в ui-demo: там гард экономил
пересборку меню, а тут `useComponentLibrary` на каждой загрузке билдера
**динамически импортирует каждый brick-модуль** ради `defaultProps` и `slots`.
Именно это и стоит закрывать кешем.

**Решение (27 июля 2026): доделать замысел, назначение — обновление списка
после HMR без перезагрузки страницы.**

Сейчас правка существующего brick-файла (поменяли дефолт, добавили проп) тянет
полную перезагрузку страницы, потому что результат
`useAsyncData('bricks-components')` закеширован, — и вместе с ней вылетает
модалка восстановления драфта. Это самая частая операция при разработке
компонента. Хеш должен её заменить: по HMR перефетчить манифест, сравнить хеш с
сохранённым, при расхождении обновить стор.

Что нужно сделать:

1. **Хеш по содержимому.** Сейчас хешируется `JSON.stringify(bricks)` —
   инвентарь, к правке `values` слепой. Считать по содержимому brick-файлов.
   Дёшево: `readManifestEntry` уже читает каждый файл целиком ради категории,
   строка на руках.
2. **Сравнение в сторе библиотеки** — по образцу `ui-demo`
   (`store/ui-demo-navigation.ts:71-105`): хранить последний применённый хеш,
   при совпадении ничего не делать.
3. **Убрать full-reload на `change`** из вотчера, когда сравнение заработает:
   `viteClientServer?.hot.send({ type: 'full-reload' })` в обработчике
   `builder:watch` (`src/module.ts`, регион «Манифест brick-компонентов»); тогда
   же уйдёт и подписка на `vite:serverCreated`.

**На клиенте хешировать не нужно.** В ui-demo `handleComputeHash` пересчитывал
хеш от только что полученных данных и сравнивал с сохранённым — избыточный шаг.
Достаточно сравнить строку с сервера с той, что лежит в сторе. Браузерный
хешер (`tiny-sha256`) этой задаче не нужен — см. BM-13.

**Чего хеш не решает ни в каком виде.** Сценарий «добавили новый brick-файл, он
не подхватился» им не лечится. Хеш управляет **списком**, а отказ живёт в
**карте загрузчиков** (`import.meta.glob`): обновлённый стор показал бы новый
компонент, но `useComponentLibrary` отфильтровал бы его на `findImportModule`
→ `undefined`. Это закрыто в BM-12 (рестарт на `add`/`unlink`). ETag на ручке
`/api/bricks/components` смысла почти не имеет — payload мал.

**Побочная выгода.** Тот же хеш потом закрывает кеш метаданных: сейчас
`useComponentLibrary` на каждой загрузке билдера динамически импортирует
**каждый** brick-модуль ради `defaultProps` и `slots`.

### BM-07. Логирование промаха: дорогое и неинформативное

**Файлы:** `src/runtime/modules/common/composables/useBrickImports.ts:38-41`,
`src/runtime/modules/builder/app/composables/useComponentLibrary.ts:41-44`.

Две стороны одной проблемы.

**Дорого.** На каждый промах сериализуются все ключи glob'а, при том что
вызывающие логируют тот же промах отдельно. Published-страница с несколькими
устаревшими компонентами выведет всю библиотеку по многу раз — и на SSR,
и на клиенте.

**Неинформативно.** Промах при наличии записи в манифесте — это ровно симптом
рассинхрона glob'а и манифеста, тот самый, с которого начался этот рефакторинг
(`[BricksBuilder] No loader for …`). Детектор, по сути, уже есть: у билдера на
руках обе стороны — манифест с сервера и ключи glob'а, — но сообщение не
подсказывает действие. Отдельный хеш для обнаружения не нужен и не помог бы:
сравнивать надо два множества ключей, а не одно контрольное значение
(см. BM-06). Починить рассинхрон в рантайме невозможно в принципе —
`import.meta.glob` разворачивается на этапе трансформации, добавить лоадер в
готовую карту нельзя.

**Исправление:** слой lookup'а сделать без side effects либо логировать только
запрошенный путь и количество ключей; полный список — под `import.meta.dev`.
В `useComponentLibrary`, где известны обе стороны, при промахе в dev писать
действие явно: «brick есть в манифесте, но отсутствует в glob — перезапустите
dev-сервер». Короткое замыкание на `layout*` оставить как есть.

**После BM-12** это больше не страховка от отвалившейся инвалидации (её нет —
состав glob'а пересобирает рестарт), а просто внятная диагностика на случай
ручного рассинхрона, например устаревшего `brickPath` в сохранённой схеме
страницы. Ценность ниже, но правка та же и стоит ноль.

### BM-13. Выпилить зависимость `tiny-sha256`

**Файлы:** `src/runtime/modules/builder/core/stores/navigation.ts:10`, `:23`,
`src/runtime/modules/common/types/shims-tiny-sha256.d.ts` (удаляется),
`package.json` (`dependencies`).

Используется ровно в одном месте — генерация id навигационного пункта:

```ts
return sha256(`${Date.now()}-${Math.random()}`).slice(0, 12);
```

Целая рантайм-зависимость плюс шим типов ради случайной строки. Рядом уже есть
`generateComponentId()` в `common/utils/bricks/paths.ts`, который решает ту же
задачу без хеша.

Прежнее решение «tiny-sha256 остаётся» принималось в контексте чистки
`@idaproject/*` и пересмотрено 27 июля 2026 года: для BM-06 браузерный хешер не
нужен (клиент только сравнивает строку с сервера), build-time сторона считает
через `node:crypto`, других потребителей нет.

**Исправление:** заменить генерацию id на общий хелпер в
`common/utils/bricks/paths.ts` (в стиле `generateComponentId`), удалить импорт,
шим и запись из `dependencies`.

**Не использовать `crypto.randomUUID`.** В браузере он доступен только в secure
context (HTTPS/localhost); на HTTP его нет, и на этом уже ломались раньше.
Брать `Math.random`-подход, как в существующем `generateComponentId`.

### BM-08. Мелочи стиля

**Файлы:** `src/runtime/modules/common/composables/useBrickImports.ts:23`,
`src/bricks-manifest.ts:214-216`.

- `useBrickImports()` без явного типа возврата — правило требует типизации
  возвращаемых значений.
- `.filter(...).sort(...)` → `.toSorted(...)` (Node ≥22.17 позволяет).
- ~~`groupByCategory` мутирует аккумулятор и массив `components`~~ — закрыто
  в BM-02.

---

## P3

### BM-09. Границы контракта путей не задокументированы

**Файлы:** `src/bricks-manifest.ts:49-56`, `README.md` (раздел «Brick-компоненты»).

Контракт «`brickPath` = путь относительно `srcDir`» верен для playground,
обычного Nuxt 3, обычного Nuxt 4 и рядового кастомного `srcDir`. Не покрыты:

- `vite.root`, переопределённый независимо от `srcDir` — ключи сканера и glob'а
  сразу расходятся;
- кастомные каталоги компонентов: настраиваются верхнеуровневой опцией
  `components` (`components.dirs`), а не `dir.components` — brick в `~/ui`
  сканер пропустит (проверено: `dir.components` в схеме Nuxt нет);
- каталоги компонентов, унаследованные от слоёв Nuxt;
- симлинки за пределы Vite root — сканер их перечислит, а Vite может отклонить
  или канонизировать иначе.

**Исправление:** задокументировать перечисленное в README как неподдерживаемое.
Альтернатива «строить карту лоадеров из резолвнутых каталогов компонентов»
отклонена вместе с BM-10 — см. раздел «Отклонено».

### BM-11. Категория извлекается регуляркой по исходнику

**Файлы:** `src/bricks-manifest.ts:58`, `:98-99`.

`CATEGORY_RE` может совпасть с комментарием или посторонним вложенным объектом,
а `category: SOME_CONSTANT` молча превращается в `Common`. Поведение унаследовано
от прежнего генератора, но новый контракт манифеста подаёт значение как
авторитетное.

**Исправление:** зафиксировать и валидировать правило «категория — только
строковый литерал»: при совпадении с нелитеральной формой падать сборкой с
внятной ошибкой вместо тихого `Common`. Вариант «получать метаданные через
сгенерированный шаблон» отклонён вместе с BM-10.

---

## Отклонено

### BM-10. Переезд с `import.meta.glob` на Nuxt-шаблон — НЕ ДЕЛАТЬ

**Решение принято 27 июля 2026 года.** Пункт оставлен как зафиксированное
обоснование, а не как задача. Не начинать без явного пересмотра.

**Что предлагалось.** Заменить `import.meta.glob` на сгенерированный через
`addTemplate` + `updateTemplates` модуль с явной картой
`{ brickPath: () => import(…) }`. Плюсы были реальные: инвалидацию SSR Nuxt
делает сам через `app:templatesGenerated` (`@nuxt/vite-builder/dist/index.mjs:281-286`),
манифест и лоадеры собираются одним сканом, ключи перестают зависеть от Vite
root и физического расположения `useBrickImports`, рестарт на `add`/`unlink`
становится не нужен, BM-09 и BM-11 становятся решаемыми. Прецедент — сам Nuxt
так решает ту же задачу для авто-импорта компонентов (`nuxt/dist/index.mjs:3697`).

**Почему отклонено.**

1. **Размен не в нашу пользу.** Основная выгода обслуживает кастомные каталоги
   компонентов и слои Nuxt (BM-09). Поддерживаемых сценариев ровно три —
   playground, npm-модуль у потребителя, Nuxt 3 и 4 в конвенциональной
   раскладке, — и ни в одном из них этого нет.
2. **Единственная техническая претензия к текущей схеме уже закрыта.**
   Претензией была опора на внутренности vite-node (синтетическое событие
   инвалидации). В BM-12 она ушла вместе с `src/vite-brick-watch.ts`: состав
   glob'а пересобирает штатный хук `restart`, а не замена механизма импорта.
   Прод и корректность SSR ни тогда, ни сейчас не затрагивались.
3. **Обмен надёжного механизма на менее надёжный.** `import.meta.glob`
   разворачивает сам Vite, одинаково в клиентском и в SSR-бандле: рантайм-резолва
   нет, расхождения dev/prod нет. Импорт `#build/bricks-loaders.mjs` резолвится
   по-разному в dev (виртуальная ФС) и prod, и по-разному в клиентской и
   серверной сборке. `useBrickImports` лежит на SSR-пути published-страниц —
   это тот класс изменений, который зелёный в dev и разваливается в проде.

**Когда вернуться.** Только если мягкий рестарт на `add`/`unlink` окажется
неприемлемо дорогим на большом проекте потребителя, ИЛИ если появится реальная
потребность в кастомных каталогах компонентов/слоях. В обоих случаях начинать со
спайка на два бинарных вопроса: резолвится ли `#build/…` из `dist/runtime/`
установленного пакета (проверять на `npm run smoke:pack`, не в playground) и
находит ли `getModulesByFile('virtual:nuxt:<dst>')` модуль шаблона в нашей
конфигурации.

**Обязательное условие для любых будущих правок на этом пути:** проверять
published-страницу с настоящим brick-компонентом в prod-сборке (`.output`,
запущенный из постороннего cwd), а не только в dev. Текущее состояние такую
проверку проходит: компонент и его проп из схемы попадают в сырой SSR-HTML,
ошибок гидрации нет.
