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
  `process.cwd()`) в `<buildDir>/nuxt-bricks-manifest/manifest.json` (имя
  каталога и namespace — из BM-03) + Nitro `serverAssets`;
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
`src/runtime/modules/common/{constants,types}/brickManifest.*`,
`src/types/bricksManifest.d.ts` (типы генератора, см. BM-04).

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
(`:1519`), так что временный файл не может стать ключом namespace манифеста
(тогда — `bricks`, после BM-03 — `nuxt-bricks-manifest`).
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

### BM-15. Прототипные ключи: оставшиеся места, дрейф `toSafeRecord`, цель сборки

**Выполнено 28 июля 2026 года.** Источник — ревью Codex (`gpt-5.6-sol`, high)
правки BM-14. Все семь пунктов закрыты; по двум выводы ревью пришлось поправить
по фактам (см. ниже), скан сверх списка нашёл ещё четыре места.

**1. `replaceSchemaImageUrls` больше ничего не теряет.** Политика вынесена из
утилиты в единственную точку входа схемы. `Object.fromEntries` собирает
own-свойство даже для `__proto__` (CreateDataProperty, а не присваивание), так
что защита от подмены прототипа сохраняется без отбрасывания ключа, и контракт
функции («остальной контент не трогает») выполняется. Отбрасывание переехало в
`common/utils/bricks/components.ts` → `cloneComponentProps`: реплейсер
`JSON.stringify` вырезает own-ключ `__proto__` на любой глубине, включая
элементы массивов. Это единственная воронка копирования пропсов в билдере
(`deserializeSchema`, история, буфер обмена, дублирование), и дополнительного
прохода она не стоит — round-trip через JSON там уже был.

**Достижимость уточнена.** Ревью считало, что ключ приходит и из API
(«схема через `JSON.parse`»). Фактически нет: ofetch парсит ответ через `destr`,
который такой ключ выбрасывает сам — в dev-логе видно
`WARN [destr] Dropping "__proto__" key to prevent prototype pollution`, а в сыром
HTTP-ответе `/api/bricks/pages/<name>` ключа уже нет. Остаётся единственный путь —
ручной импорт JSON-файла (`useSchemaFileTransfer` зовёт голый `JSON.parse`).
Побочно это значит, что published-страница с таким ключом в БД **не** падает:
до payload он не доезжает (проверено — 200 и компонент в сыром HTML).

**2. Действия резолвера изображений — `Map`.** `IImageResolverState.actions`
стал `Map<string, TImageResolveAction>`; обновлены `useSchemaImageResolver`
(инициализация, сброс, `setImageAction`, `setGlobalAction`, `handleConfirm`) и
`TheBuilderMediaImageResolverModal.vue`. Ключ — URL картинки из схемы, состояние
локальное и в payload не уезжает, ограничений на `Map` нет.

**3. `readOwnKey` на brick-объявленные имена.** `variantBuilders.ts` — десять
чтений свёрнуты в одну функцию `readPropValue(context)`; `inlineEditableProp.ts`
и `usePropertyVariants.ts` — сверка `showWhen.field`; `useSidebarPropertiesPanel.ts`
— «текущее значение» для приведения типов.

**4+5. Параметры data source — `Map`, тест переписан.** `params` в
`useBricksDataSources` собирается в `Map`, `buildDataSourceUrl` читает через
`has`/`get`. Кейс `test/render/dataSourceParamsPrototypeKeys.spec.ts` про
`__proto__` разделён на два: новый берёт `url: '/api/items/:__proto__'` и
действительно различает реализации, старый оставлен как проверка «ключ никуда не
утёк».

**Оговорка по достижимости.** В обычном объектном литерале `__proto__: value`
подменяет прототип и own-свойства не создаёт (проверено), поэтому brick-файл,
написанный руками, такой параметр в `Object.entries(source.params)` не отдаст.
Нужен вычисляемый ключ `['__proto__']` или объект, собранный динамически. То
есть №4 — устранение асимметрии, а не наблюдаемый в обычном коде отказ; живая
проверка ниже делалась именно на вычисляемом ключе.

**6. Цель сборки: `.browserslistrc` оставлен, обоснования переписаны.** Ревью
утверждало, что файл «не читает ни один конфиг сборки». Буквально ссылки в
конфигах нет, но autoprefixer Nuxt включает по умолчанию и подхватывает
`.browserslistrc` сам — проверено, из текущего списка приезжают `-webkit-sticky`,
`-webkit-user-select`, `-webkit-backdrop-filter`. Решение (28 июля 2026):

- `> 0.2% and not dead` остаётся как **цель CSS-префиксов**; в файл добавлен
  комментарий, что JS им не управляется;
- **фактический JS-пол — `safari 16` / `chrome 107`**: у Vite 7 дефолтный
  `build.target` — `baseline-widely-available`
  (`chrome107 / edge107 / firefox104 / safari16`). Встроенные методы Vite не
  полифилит, синтаксис задаёт таргет, так что бандл на iOS 11 не распарсится
  независимо от нашего кода;
- правило для кода — не брать встроенные методы новее `safari 16`. Скан всего
  клиентского рантайма нарушений не нашёл: `.at` и `Object.hasOwn` — 15.4,
  `AbortSignal.timeout` — 16.0, `AbortSignal.any` — 17.4, но там feature-detect с
  fallback, `Object.fromEntries` — 12.1, `.flatMap` — 12, `globalThis` — 12.1,
  `ResizeObserver` — 13.1, `matchAll` — 13;
- вывод BM-02 про `Map.groupBy` в силе, но по исправленной причине: Safari 17.4
  выше цели сборки, а не «в списке есть `ios_saf 11`». Обоснование в
  `safeRecord.ts` тоже переписано: `hasOwnProperty.call` оставлен как привычка к
  широкой совместимости, а не по необходимости — менять форму записи не на что.

**7. `as unknown as` из тестов убран.** Носители загрязнения типизированы как
`object` и читаются через `Reflect.get`; фикстуры компонента и схемы заполнены
целиком (заодно исправлен невалидный `type: 'brick'`); drag-событие строится от
настоящего `Event` (в Node он есть) — приведение стало сужением до подтипа.

**Повторный скан по обоим шаблонам нашёл четыре места сверх списка ревью:**

- `builder/canvas/viewport/components/TheBuilderCanvas.vue` — `getPropValue`
  порта inline-редактирования читал `props[propName]` (имя из brick-файла) →
  `readOwnKey`;
- `builder/shell/sidebar/composables/useSidebarMediaSelection.ts` — четыре
  чтения `props[property.name]`; наблюдаемого дефекта нет (спасал
  `Array.isArray`), переведены ради однородности;
- `layouts-blocks/utils/responsiveVars.ts` — `key in overrides` по объекту из
  `props.responsive` схемы → `hasOwnKey`.

Проверено и **оставлено как есть**: запись `component.props = { ...props, [propName]: v }`
в `builder/core/stores/actions/properties.ts` — вычисляемый ключ в литерале
создаёт own-свойство и прототип не трогает (проверено); `resolveSystemIcon`
(`plugins/icons/systemIconsRegistry.ts`) — все `:icon` в шаблонах приходят из
внутренних списков, схема туда не попадает; четыре места из BM-14 с внутренними
ключами.

**Тесты** (+55 кейсов, 720 всего):

- `test/builder/variantBuildersPrototypeKeys.spec.ts` (29) — все билдеры
  вариантов на прототипных именах;
- `test/builder/showWhenPrototypeKeys.spec.ts` (13) — `showWhen` в
  `inlineEditableProp` и `usePropertyVariants`;
- `test/builder/schemaImageResolverActions.spec.ts` (4) — действие по URL
  `__proto__`, глобальное действие, дефолт, сброс между импортами;
- `test/builder/sidebarPropertiesPanelPrototypeKeys.spec.ts` (3) — «текущее
  значение» при приведении;
- `test/builder/coreHistory.spec.ts` — +3 кейса на отбрасывание `__proto__` в
  `deserializeSchema` (верхний уровень, глубина, массивы; `constructor`/`toString`
  остаются);
- `test/builder/schemaImageExtractor.spec.ts` — +2 кейса на сохранность состава
  пропсов.

**Мутационная проверка тестов.** Клон без реплейсера — 2 падения; возврат
`toSafeRecord` в `replaceSchemaImageUrls` — 2; `actions` обратно в `Record` — 2
поведенческих (на варианте спека без Map-API-ассертов, чтобы падало поведение, а
не отсутствующий метод); возврат прямого `obj[имя]` во всех четырёх местах
пункта 3 — 20 падений из 45; возврат `params` к `toSafeRecord` — 1.

**Слабое место набора, зафиксировано честно:** из 13 кейсов `showWhen` на откате
краснеет один. Остальные проходят в обеих версиях — метод прототипа не равен
строковому `equals` ни там, ни там, так что различает только `equals: undefined`.
Правка пункта 3 в этой части защитная; наблюдаемый эффект даёт ветка
`variantBuilders` (`Boolean(...)` от метода прототипа — всегда `true`).

**Проверено вживую** (playground, dev, Chrome DevTools MCP):

- импорт JSON-файла с пропсами `{"__proto__": {...}, "content": "<img src=\"__proto__\"><img src=\"/uploads/photo.webp\">"}`:
  модалка резолвера показывает обе картинки, включая URL `__proto__`; выбор
  «Placeholder» **для неё одной** срабатывает — в канвасе `src` меняется на
  `/_bricks/images/brick-empty.webp`, соседняя с «Keep» не тронута (пункт 2);
- после сохранения в БД у компонента остаются `content`, `marginTop`,
  `marginBottom` — own-ключ `__proto__` отброшен (пункт 1);
- **различающая проверка безусловности:** тот же импорт с «Skip» (ни одна
  картинка не менялась) — ключ **всё равно** отброшен, а `content` не тронут
  (`src="__proto__"` на месте). Раньше ветки вели себя по-разному;
- панель свойств выбранного компонента рендерится, консоль чистая (кроме
  ожидаемых 404 на выдуманный `/uploads/photo.webp` и того самого
  предупреждения `destr`);
- data source: временный `playground/components/ProbeDs.brick.ts` с
  `url: '/api/bricks/health?probe=:__proto__'` и параметром с вычисляемым ключом
  `['__proto__']` — published-страница отдаёт `DS:OK {"status":"ok"}` в сыром SSR-HTML;
  на откате `params` к `toSafeRecord` та же страница отдаёт `DS:MISSING`, а в лог
  уходит `Skip - unresolved params` (пункты 4/5).

**Ловушка при живой проверке (сохраняем на будущее).** Правки в
`src/runtime/**` dev-сервер в SSR-бандл по HMR не подхватывает: три подряд
мутации `useBricksDataSources` дали одинаковый ответ, пока сервер не был
перезапущен. Мутационные проверки на published-странице делать только с
рестартом `npm run dev`.

`type-check`, `lint:check` (oxlint + stylelint + `deps:check` + `knip`),
`prettier --check`, 720/720 тестов, `npm run dev:build`, бюджеты бандла
(entry 111 KB, published 122 KB gzip) — зелёные.

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

### BM-03. Namespace и каталог манифеста квалифицированы именем пакета

**Выполнено 28 июля 2026 года.**

`baseName` Nitro server asset и подкаталог в `buildDir` больше не короткое
`bricks`: оба — `nuxt-bricks-manifest`
(`src/runtime/modules/common/constants/brickManifest.ts`). Правка ровно в двух
константах — все три стороны транспорта берут их оттуда: генератор
(`src/bricks-manifest.ts`), монтирование (`src/module.ts`), читатель
(`src/runtime/server/utils/bricksComponents.ts`).

Правка не делает коллизию невозможной — занять ровно `nuxt-bricks-manifest`
потребителю никто не мешает, — но исключает реалистичный случай: совпадение на
общем слове `bricks`.

**Механика коллизии в исходном пункте описана неверно, уточнено по факту.**
Ожидалось, что в dev повторный `assets.mount(baseName, …)` перетирает
монтирование целиком. Фактически `mount` в unstorage 1.17.5 на занятой базе
**бросает** (`unstorage/dist/index.mjs:378-381`,
``throw new Error(`already mounted at ${base}`)``; двоеточие в наблюдаемом
сообщении — часть базы, `normalizeBaseKey` дописывает его в
`shared/unstorage.zVDD2mZo.mjs:129-131`), причём на верхнем уровне модуля
Nitro — падает не одна ручка, а весь сервер: любой запрос отдаёт 500
`already mounted at bricks:`. Prod-половина подтвердилась как есть: ключи
`baseName + '/' + file` сливаются пофайлово, оба файла оказываются в одном
namespace, коллизия проходит незамеченной. То есть расхождение dev/prod, ради
которого пункт и написан, резче ожидаемого: dev — полный отказ, prod — тишина.

**Каталог в `buildDir` переименован сверх исходного пункта.** Namespace-правка
закрывает одно направление — «потребитель занял наше имя». Обратное осталось бы:
nitro сканирует `dir` целиком (дефолтный паттерн — все файлы рекурсивно),
поэтому любой чужой файл, попавший в `<buildDir>/bricks/`, стал бы ключом нашего
server asset, вплоть до подмены `manifest.json`. `buildDir` общий для Nuxt и всех
модулей, так что каталог держим за именем пакета так же, как namespace; имя
каталога совпадает с namespace осознанно — ничего, кроме манифеста, туда попадать
не должно. Артефакт пересоздаётся на каждой сборке, миграция не нужна.

**Рантайм-детектор коллизии не добавлен.** Проверять было бы нечего до
`nitro:init`: `nitro:config` вызывается до `createNitro`
(`@nuxt/nitro-server/dist/index.mjs:544` против `:576`), то есть на момент нашего
push список ещё не финальный, а `nitro:init` (`:605`) уже видит итог. Смысла в
проверке нет: обычную двойную регистрацию самого модуля `defineNuxtModule`
подавляет по `meta.name` (`@nuxt/kit/dist/index.mjs:2108-2115`), а чужая запись с
тем же именем в dev и так падает громко — на верхнем уровне модуля Nitro, с
понятным текстом.

**Тесты:** `test/module/bricksManifestAssetNamespace.spec.ts` (4 кейса) — по
одному на каждую сторону транспорта: namespace и каталог начинаются с имени
пакета из `package.json` (инвариант, а не сверка литерала — на generic-имени тест
краснеет), генератор строит каталог из константы, монтирование берёт namespace из
константы, читатель — тот же namespace и то же имя файла. Монтирование
проверяется по тексту `src/module.ts`: поднять его из теста можно только с полным
фейком Nuxt, а без этого кейса хардкод литерала в `nitro:config` остался бы
незамеченным.

**Мутационная проверка тестов:** возврат `BRICKS_MANIFEST_ASSET_BASE` к `bricks`
— 1 падение; возврат `BRICKS_MANIFEST_DIR` — 1; хардкод `join(buildDir, 'bricks')`
в `resolveBricksManifestDir` — 1; хардкод `baseName: 'bricks'` в `src/module.ts`
— 1; хардкод `useStorage('assets:bricks')` в читателе — 1.

**Проверено вживую** (playground; коллизия воспроизведена так: потребитель
объявляет в `nuxt.config` свой `nitro.serverAssets` с `baseName: 'bricks'` и
файлом `probe.txt`, временная ручка `/api/probe-asset` читает и `assets:bricks`,
и `assets:nuxt-bricks-manifest`):

- dev с правкой: `/api/bricks/components` отдаёт запись пробного brick'а,
  `/api/probe-asset` — и файл потребителя, и манифест модуля; namespace'ы
  сосуществуют;
- **различающая проверка:** та же коллизия с namespace `bricks` — dev отдаёт 500
  на **любой** запрос (`already mounted at bricks:`), а prod-сборка того же
  состояния работает: в `chunks/nitro/nitro.mjs` рядом лежат
  `["bricks:probe.txt"]` и `["bricks:manifest.json"]`, ручка компонентов
  отвечает. Ровно то расхождение dev/prod, из-за которого пункт и заведён;
- prod с правкой: в бандле `["nuxt-bricks-manifest:manifest.json"]`, `.output`,
  запущенный из постороннего cwd, отдаёт манифест с пробным компонентом;
- новый каталог: манифест лежит в
  `playground/.nuxt/nuxt-bricks-manifest/manifest.json`, старый
  `playground/.nuxt/bricks/` не создаётся;
- вотчер на новом каталоге не сломан: `change` категории → манифест обновлён без
  рестарта, `unlink` → один рестарт и пустой манифест.

`type-check`, `lint:check` (oxlint + stylelint + `deps:check` + `knip`),
`prettier --check`, 724/724 тестов, `npm run dev:build`, бюджеты бандла
(entry 111 KB, published 122 KB gzip) — зелёные. Путь манифеста обновлён в
контексте выше и в скилле `.claude/skills/verify`.

**Ревью:** Codex (`gpt-5.6-sol`, high) 28 июля 2026. Blocker'ов нет; полнота
переименования подтверждена (старых литералов в `src`, `scripts`, smoke-тестах,
README и `.gitignore` не осталось), решение не добавлять рантайм-детектор
поддержано, совпадение имени каталога с namespace ловушкой не признано (риск
задаёт содержимое каталога, а не равенство имён; `pattern` тут не помог бы — prod
его учитывает, а dev-fsDriver получает только `dir` и `ignore`). По находкам
сделано: набор дополнен кейсами на генератор и монтирование (раньше хардкод в
`src/module.ts:377` или `src/bricks-manifest.ts:127` оставлял тест зелёным), спек
переехал в `test/module/` (три из четырёх сторон транспорта — build-time),
`as { name: string }` заменён на типизированный JSON-импорт, поправлены три
неточности формулировок: цитата исключения unstorage (двоеточие добавляет
`normalizeBaseKey`, а не литерал сообщения), «гарантия» → «исключает совпадение на
общем слове», старый namespace в тексте BM-01. Отставание `test/README.md` от
состава спеков вынесено отдельным пунктом BM-16.

### BM-04. Типы build-time слоя переехали в `src/types/`

**Выполнено 28 июля 2026 года.**

Заведён каталог `src/types/` — типы build-time слоя больше не объявляются в
модулях. Решение по отложенному вопросу пункта: **перенесены все**, а не только
двое фигурантов, иначе конвенция осталась бы половинчатой ровно в том виде, из-за
которого пункт и написан.

**Раскладка — один файл на один build-time модуль**, имя camelCase (kebab-case
по `.claude/rules/naming.md` — только для самих build-time-скриптов):

| Файл                       | Модуль                     | Типы                                                                              |
| -------------------------- | -------------------------- | --------------------------------------------------------------------------------- |
| `module.d.ts`              | `module.ts`                | `IBricksModuleOptions`                                                            |
| `moduleSetup.d.ts`         | `module-setup.ts`          | `IBricksSurfaces`, `IBricksRegistrationContext`                                   |
| `moduleBackendConfig.d.ts` | `module-backend-config.ts` | `TBricksBackendMode`, `IBricksBackendResolutionInput`, `IBricksBackendResolution` |
| `bricksManifest.d.ts`      | `bricks-manifest.ts`       | `IBricksManifestOptions`, `IBricksManifestQueue`                                  |
| `apiHandlers.d.ts`         | `api-handlers.ts`          | `IBricksApiHandler`                                                               |

`src/types/bricksManifest.d.ts` — **производящая** сторона (опции скана,
контракт очереди); общий с рантаймом контракт самого манифеста остаётся в
`runtime/modules/common/types/brickManifest.d.ts`. Имена похожи на одну букву,
поэтому в шапке файла разница зафиксирована явно.

**Публичный тип пакета сохранён** ре-экспортом в `module.ts`
(`export type { IBricksModuleOptions }`). Механика — не `export *`, как
показалось сначала по застабленному `dist`: `@nuxt/module-builder` **перечисляет
типы модуля поимённо**, в собранном `dist/types.d.mts:9` стоит
`export { type IBricksModuleOptions } from './module.mjs'` (плюс отдельный алиас
`ModuleOptions`, выведенный через `NuxtModule<infer O>`). То есть без ре-экспорта
тип из публичной поверхности выпал бы — генератор берёт именно экспорты
`module.ts`. Проверено на реальной сборке: в `dist/module.d.mts` интерфейс
инлайнится целиком (rollup-dts подтягивает `.d.ts`), висячих ссылок на
`./types/…` нет. Типизация ключа `bricks` в `nuxt.config` от имени интерфейса
не зависела и не зависит — Nuxt выводит её из `NuxtModule<infer O>`
(`playground/.nuxt/types/schema.d.ts:183`).

**Побочно ушёл цикл на уровне типов.** `module-setup.ts` и
`module-runtime-config.ts` импортировали `IBricksModuleOptions` из `./module`,
который сам импортирует их обоих. Теперь оба берут тип из `./types/module`.

**Правило — на все типы, а не только на экспортируемые** (решение владельца,
28 июля 2026). Тип, объявленный внутри модуля, невозможно переиспользовать, не
переписав его рядом, а две копии расходятся молча — поэтому «нужен только здесь»
основанием оставить объявление в модуле не является. Ровно это и записано в
`.claude/rules/typescript.md`; на момент правки локальных объявлений в `src/*.ts`
не осталось, так что ужесточение не потребовало дополнительных переносов.

**Тест — не поведенческий, а конвенционный:**
`test/module/buildTimeTypeLocations.spec.ts` (1 кейс) обходит `src/*.ts` и падает
на любом объявлении типа. Разбор — **через AST компилятора**
(`typescript` и так в devDependencies), а не шаблоном по строкам: первая версия
кейса искала `^export (interface|type) X` и пропускала три легальные формы —
`export declare interface`, `export default interface` и перенос строки между
`export` и `interface` (все три компилируются, проверено), а объявление внутри
блочного комментария или шаблонной строки, наоборот, ловила ложно. Ре-экспорт
(`export type { X }`) — `ExportDeclaration`, а не объявление, поэтому единственная
разрешённая форма проходит. Без такого кейса конвенция снова осталась бы
непроверяемой — тем самым дрейфом, что описан в BM-16. Кейс страхуется проверкой `toContain('module.ts')`: переезд файлов не
должен превратить его в тавтологию на пустом списке.

**Мутационная проверка:** инлайновое объявление в `src/api-handlers.ts` во всех
трёх формах (`export declare interface`, `export default interface`,
`export` + перенос строки) — по 1 падению, в сообщении и файл, и имя типа;
то же объявление внутри блочного комментария — набор зелёный (ложного
срабатывания нет).

**Что специально не делалось.** `src/cli/**` не сканируется и под правило не
попадает — это самостоятельные скрипты, а не слой модуля. `test/README.md` новым
спеком не пополнен: пофайловый индекс отложен до сокращения набора (BM-16).

`type-check`, `lint:check` (oxlint + stylelint + `deps:check` + `knip`),
`prettier --check`, 726/726 тестов, `npm run build`, `npm run dev:build`,
бюджеты бандла (entry 111 KB, published 122 KB gzip) — зелёные.

**Ревью:** Codex (`gpt-5.6-sol`, high) 28 июля 2026. Поведение и полнота переноса
подтверждены (все девять прежних объявлений на месте, собранный `dist` содержит
интерфейс целиком). По находкам сделано: guard переписан с шаблона на AST
(три легальные обходные формы и ложное срабатывание в комментарии
перепроверены на своей стороне — воспроизводятся), формулировка про
`export *` исправлена по факту собранного `dist/types.d.mts`, экспортируемым
членам новых типов дописан JSDoc. Имя `bricksManifest.d.ts` ревью признало
приемлемым: `bricksManifestGenerator.d.ts` было бы однозначнее в отрыве от
контекста, но ломало бы правило «файл назван по своему build-time модулю».
Замечание про JSDoc **принято частично**: члены `IBricksApiHandler`,
`IBricksBackendResolution.mode` и `IUseBricksConfigReturn` дописаны, а листья
вложенных групп `IBricksModuleOptions` (`basicAuth.username`, `routes.*`,
`features.*`, `s3.*`) оставлены как есть — групповой JSDoc над каждой из них
описывает свои поля прозой, включая дефолты и ENV-переопределения, и дубль на
каждом листе был бы шумом, который разъедется с групповым текстом.

### BM-08. Мелочи стиля: явные типы возврата и `toSorted`

**Выполнено 28 июля 2026 года.** Оба пункта закрыты; попутно закрыт весь класс
в `common/composables/`, потому что README этой папки уже требовал ровно того же.

**1. `toSorted`.** `src/bricks-manifest.ts:199-201` —
`.filter(...).sort(...)` → `.filter(...).toSorted(...)`. Путь build-time-only
(генератор живёт в Node, в клиентский бандл не попадает), так что ограничение
цели сборки из BM-15 (`safari 16`) здесь не действует: хватает
`engines.node >= 22.17`.

**2. Типы возврата composables `common/`.** `useBrickImports()` из пункта — и
ещё три функции того же класса, найденные рядом. Возвращаемые интерфейсы уехали
в новый `src/runtime/modules/common/types/composables.d.ts`, где им и место по
правилу №1 из `common/composables/README.md` («интерфейсы хранятся в `types/`
домена, не инлайн в файлах»):

- `useBrickImports` → `IUseBrickImportsReturn` (типа не было вообще);
- `useApiClient` → `IUseApiClientReturn` (типа не было). Тип `apiFetcher`
  выражен как `ReturnType<typeof globalThis.$fetch.create>` — руками расписывать
  `$Fetch` нельзя, `ofetch` в наши `dependencies` не объявлен;
- `useBricksStyles` → `: void` (композабл только инъектит стили через `useHead`);
- `useBricksConfig` → `IUseBricksConfigReturn` (был анонимный инлайн-тип — ровно
  запрещённая форма из `.claude/rules/typescript.md`);
- `IUseBricksAssetUrlReturn` и `IUseBricksRoutePathsReturn` были объявлены
  инлайн в своих файлах — перенесены туда же, иначе в папке остались бы две
  конвенции сразу.

Границу правки держали по домену `common/`: те же инлайн-объявления есть ещё в
десяти композаблах других доменов, они вынесены в BM-17, а не втянуты сюда.

**Проверка, что аннотация `useApiClient` не съела дженерики.** Явный тип легко
выродить в `any` и не заметить: временный проб
`const bad: number = await apiFetcher<{ a: string }>('/api/probe')` даёт
`TS2322 Type '{ a: string; }' is not assignable to type 'number'` — дженерик
ответа по-прежнему протекает до вызывающего. Проб удалён.

**Тесты.** Типы `type-check` проверяет сам, отдельные кейсы им не нужны.
Сортировка манифеста автоматической защиты не имела вовсе, хотя коммент над ней
обещает стабильный хеш, — добавлен кейс в
`test/module/bricksManifestQueue.spec.ts` (10 кейсов в файле): у мока `globby`
появился флаг `reverseListing`, проверяются и порядок записей, и совпадение хеша
с прямым сканом. Вход **канонизируется перед переворотом** (`[...files].sort().reverse()`):
первая версия просто переворачивала то, что отдал реальный `globby`, а его
порядок зависит от ФС — на машине, где список уже приходит отсортированным,
переворот дал бы обратный порядок, но на любой другой мог бы случайно совпасть
с сортировкой и кейс перестал бы различать реализации.

**Мутационная проверка тестов:** сортировка снята (`.map((entry) => entry)`) —
1 падение; результат `toSorted` отброшен (`bricks.toSorted(...)` отдельным
выражением, классическая ловушка неизменяющего метода) — 1 падение.

**Третий пункт** — мутация аккумулятора в `groupByCategory` — был закрыт ещё в
BM-02 вместе с самой функцией.

**Проверено вживую** (playground, dev; два пробных brick-файла созданы в порядке
`ZProbeCard` → `AProbeCard`, то есть обратном сортировке):

- `playground/.nuxt/nuxt-bricks-manifest/manifest.json` и
  `GET /api/bricks/components` отдают `AProbeCard` перед `ZProbeCard`;
- `change` одного из файлов → хеш инвентаря не изменился (правка `values` в него
  не входит по определению — см. BM-06);
- published-страница `/test` — 200 и `bricks-container` в сыром SSR-HTML
  (`useApiClient` + `useBrickImports` на SSR-пути), `/bricks/login` — 200,
  ошибок и предупреждений в логе dev нет;
- `unlink` обоих пробников → манифест пуст, рабочее дерево чистое.

`type-check`, `lint:check` (oxlint + stylelint + `deps:check` + `knip`),
`prettier --check`, 726/726 тестов, `npm run build`, `npm run dev:build`,
бюджеты бандла (entry 111 KB, published 122 KB gzip) — зелёные.

**Ревью:** Codex (`gpt-5.6-sol`, high) 28 июля 2026. Blocker'ов по поведению нет.
`ReturnType<typeof globalThis.$fetch.create>` проверен через compiler API и
признан эквивалентным прежнему выводимому типу: совпадают и вызов известного
Nitro-роута, и явный дженерик ответа, и `.raw`, и повторный `.create`; `.native`
в Nitro-версии `$Fetch` нет вовсе, так что аннотация ничего не потеряла.
Перенос двух инлайновых интерфейсов признан правильным по локальному README и
`.claude/rules/naming.md`. По находке про мок сделано: порядок канонизируется
перед переворотом (см. выше), мутационная проверка на канонизированном входе
повторена. Десять оставшихся инлайн-объявлений в композаблах других доменов
вынесены в BM-17 — ревью отдельно просило не втягивать их в BM-08 молча.

### BM-05. Контракт манифеста в билдере — одно объявление на все стороны

**Выполнено 28 июля 2026 года.**

Самостоятельных объявлений контракта оказалось четыре, а не три: к
`IBrickListItem`, `IBricksResponse` и инлайн-дженерику `useModalOptions` скан
добавил `ICachedModal` — та же пара `name` + `brickPath`, объявленная своими
словами. Пятый фигурант, `IBrickCategory`, копией не был (он и так выводился
через `Pick` от канонической записи) — у него другой дефект, форма ответа, см.
пункт 3.

**Что сделано:**

1. `IBrickListItem` и `IBricksResponse` удалены из
   `builder/app/types/composables.d.ts`; `useComponentLibrary` типизирует ответ
   `GET /api/bricks/components` как `IBricksManifest`, элемент — как
   `IBrickManifestEntry`. Опциональная `category` в билдерской копии и была тем
   расхождением, из-за которого пункт заведён: генератор пишет категорию всегда.
2. `useModalOptions` — инлайн-дженерик
   `{ bricks: Array<{ name; category; brickPath }> }` заменён на `IBricksManifest`.
3. **Сверх пункта:** `IBrickCategory` заменён на
   `TBrickManifestRef = Pick<IBrickManifestEntry, 'name' | 'brickPath'>`.
   Интерфейс описывал ответ `?category=<name>` как `{ components: [...] }`, а
   ручка отдаёт голый массив (проверено живьём) — то есть форму, которой нет ни в
   одном payload, и использовался он только как `IBrickCategory['components']`.
4. **Сверх пункта:** `ICachedModal` → `TCachedModal = TBrickManifestRef`.
   Переименование, потому что алиас по `.claude/rules/typescript.md` — `T`, а не
   `I`; использований три, все в `useModalOptions.ts`.

**Фолбэк категории убран как недостижимый — в пределах манифеста, который
пишем мы сами.** В `useComponentLibrary` стояло
`brick.category || brickData?.category || 'Other'`. Для сгенерированной записи
обе подстановки — мёртвые ветки, противоречащие типу, поэтому оставлять их
рядом с общим контрактом нельзя: либо тип врёт, либо код. Проверено, а не
выведено: brick-файл с `category: ''` попадает в манифест как `Common`
(`extractCategory` подставляет дефолт на любом falsy-совпадении), так что
непустая категория — свойство генератора, а не совпадение. Граница утверждения:
запись валидирует только генератор, читатель (`readBricksManifest`) проверяет
наличие `manifest.bricks` и форму отдельных записей не смотрит — значит на
правленом руками или чужом манифесте без `category` сайдбар теперь упадёт на
`category.toLowerCase()` в `resolveCategoryLabel` вместо тихого `'Other'`.
Возвращать фолбэк ради этого не стали: артефакт лежит в `buildDir`,
пересоздаётся на каждой сборке и внешним источником не является; если понадобится
защита, её место — валидация записей в читателе, а не подстановка в билдере.
Обратный порядок (значение из brick-модуля важнее манифестного) сознательно не
вводился — это чинило бы симптом BM-11 в обход самого BM-11, см. отметку там.

**`IComponentLibraryItem` намеренно не наследует `IBrickManifestEntry`**, хотя
первые три поля совпадают буквально. В этот же тип попадают layout-блоки с
`brickPath: 'layout/grid'` — без ведущего слэша и без файла на диске, тогда как
контракт `IBrickManifestEntry.brickPath` — «путь относительно `srcDir` с ведущим
`/`, совпадающий с ключом `import.meta.glob`». Граница здесь смысловая, а не
типовая: `brickPath` в обоих типах — обычный `string`, TypeScript структурный, так
что присваивание layout-элемента записи манифеста он и с `extends`, и без него
пропустит. Ценность отказа в том, что тип не объявляет layout-элементы записями
манифеста и правка контракта записи не потянет за собой layout-половину.

**Тесты.** Правка типовая: отдельных кейсов нет, проверяет `type-check` — по
образцу BM-08. Честная оговорка: автоматической защиты от повторного
появления копии не существует, guard из BM-04/BM-17 проверяет **место**
объявления типа, а не его уникальность; такую сверку пришлось бы строить на
сравнении структур, и на текущем размере проекта это не окупается. Существующие
наборы на правку зелёные, но контракт между сторонами транспорта не проверяет ни
один: `bricksComponentsCategories` берёт серверную утилиту с подложенным
манифестом, `componentLibraryDefaultProps` — композабл с замоканной ручкой,
и стыка между ними в наборе нет.

**Проверено вживую** (playground, dev, Chrome DevTools MCP; временные
`ProbeCard.brick.ts` в категории `Probe` и `ProbeModal.brick.ts` в категории
`Modal`):

- ручка отдаёт **обе** формы, и типы им теперь соответствуют буквально:
  без параметра — `{ bricks: [...], hash }` (`IBricksManifest`), с
  `?category=modal` — `[{ name, brickPath }]` (`TBrickManifestRef[]`), то есть
  голый массив, а не `{ components: [...] }` прежнего `IBrickCategory`;
- сайдбар библиотеки показывает категорию `PROBE` с `ProbeCard`, `ProbeModal`
  из библиотеки исключён (категория `Modal`), категория в карточке — та, что в
  манифесте;
- **`useModalOptions` на новом типе:** схема с `ProbeCard` импортирована JSON-файлом,
  компонент выбран на канвасе, редактор свойства `modal-select` («Модалка»)
  раскрывается в `Disabled` + `ProbeModal` — то есть ответ ручки разобран и
  отфильтрован по `category === 'Modal'`; выбор пункта записывает значение в проп;
- канвас рендерит `PROBE:bm05` (проп из импортированной схемы), консоль браузера
  чистая — ноль ошибок и предупреждений;
- published-страница `/test` — 200, `bricks-container` в сыром SSR-HTML.

`type-check`, `lint:check` (oxlint + stylelint + `deps:check` + `knip`),
`prettier --check`, 726/726 тестов, `npm run dev:build`, бюджеты бандла
(entry 111 KB, published 122 KB gzip) — зелёные.

**Ревью:** Codex (`gpt-5.6-sol`, high) 28 июля 2026. Blocker'ов нет. Оба
спорных решения подтверждены с уточнениями, и уточнения перенесены в текст выше:
удаление фолбэка проверено по всем трём каналам, откуда `category` могла бы
прийти пустой (внешний backend ответ не подменяет — `/api/bricks/**` остаётся
локальным в `useApiClient`; `?category=` с пустым значением превращается в
`undefined` и отдаёт манифест целиком; генератор пишет `Common`), но границу
«только для сгенерированного манифеста» ревью потребовало обозначить прямо —
формулировка и комментарий в коде исправлены. Отказ от `extends` признан
семантическим, а не типовым (структурная типизация присваивание всё равно
пропустит) — в тексте это теперь сказано. Полнота скана дублей и совпадение типов
с фактическими ветками `resolveBricksComponents` подтверждены независимо.
Поправлены три формулировки: счёт копий (пятый фигурант `IBrickCategory` копией
не был), «мёртвые ветки» → с оговоркой про источник манифеста, «покрывают обе
стороны транспорта» → в наборе нет стыка между серверным и клиентским спеком.
Решение не добавлять тесты поддержано: различающий кейс для BM-05 пришлось бы
строить на неподдерживаемом повреждённом манифесте или на тексте реализации.

### BM-13. `tiny-sha256` выпилен

**Выполнено 28 июля 2026 года.**

Рантайм-зависимость с шимом типов держалась ради одной строки — id
навигационного пункта.

- `navigation.ts` зовёт `generateNavigationItemId()` вместо
  ``sha256(`${Date.now()}-${Math.random()}`).slice(0, 12)``;
- **новый файл `builder/core/utils/ids.ts`, а не дописывание в
  `common/utils/bricks/paths.ts`** (пункт предлагал `paths.ts`): держать в файле
  «пути» две функции про id — углублять прежнюю неточность, поэтому туда переехал
  и `generateComponentId`. Приватный `generateId(prefix)` — одна реализация на оба
  генератора, `Math.random` и причина отказа от `crypto.randomUUID` (secure
  context) зафиксированы там же в JSDoc. Домен выбран по локальному README:
  `common/utils` — «утилиты, используемые 2+ доменами», а потребители id все в
  `builder/core` (`stores/navigation.ts`, `stores/actions/crud.ts`,
  `stores/actions/clipboard.ts`). Пока `generateComponentId` лежал в `common`, это
  правило уже нарушалось; после переезда — нет. Похожие генераторы в
  `sidebar/composables/useSidebarMediaSelection.ts` и
  `layouts-blocks/utils/inlineContent.ts` сюда не втягивались: у них другой формат
  (без метки времени, другой разделитель), а у второго id к тому же попадает в
  HTML-контент — унификация форматов к BM-13 не относится;
- удалены `common/types/shims-tiny-sha256.d.ts` и запись в `dependencies`.

**Комментарий «по идее можно поменять на `useId`» снят как отработанный, замена
не подходит** (проверено, а не выведено — прогон на `vue` 3.5.39 и
`@vue/server-renderer`):

- вне setup `useId()` берёт `getCurrentInstance()`, не находит его, пишет
  `[Vue warn]: useId() is called when there is no active component instance` и
  возвращает **пустую строку**. Оба генератора зовут из pinia-экшенов
  (`addItem`, `createComponent`) по клику — инстанса там нет, так что все пункты
  получили бы `id: ""`, а `removeItem`/`updateItem` били бы сразу по всем;
- даже в setup это не уникальный id, а счётчик на инстанс приложения:
  `(idPrefix || 'v') + '-' + i.ids[0] + i.ids[1]++`. Два независимых
  `createSSRApp` в пробе выдали одинаковые `v-0, v-1`, то есть счётчик стартует
  заново на каждой загрузке страницы. Наши id персистятся
  (`schema.meta.navigation.items[].id` → JSONB в БД), поэтому пункт, добавленный
  после перезагрузки, столкнулся бы с уже сохранённым;
- «`useId` от самих Nuxt» отдельной реализации не имеет:
  `nuxt/dist/app/composables/id.js` — это `export const useId = _useId` из Vue, и
  в `.d.ts` он помечен `@deprecated Use useId from vue`.

`useId` держит стабильность id DOM-атрибута между SSR и клиентом ради гидрации;
уникальность доменного id между сессиями — другая задача, и её закрывает только
случайность. Обоснование продублировано в JSDoc `generateId`, чтобы вопрос не
возвращался к следующему читателю.

**Формат id сменился** (12 hex → `nav-<timestamp>-<random>`), миграции не нужно:
формат id никто не разбирает — значение идёт в `:key` в
`BuilderShellSidebarNavigationEditor.vue` и сравнивается на равенство строк в
сторе (`removeItem`/`updateItem`). Дальше id только переносится как есть:
`loadFromMeta`/`toMeta` → снимок истории → JSONB `schema` в БД → published
projection; ни один из этих слоёв в него не заглядывает, поэтому сохранённые
схемы со старыми 12-символьными id продолжают работать рядом с новыми.

**Тестов не добавлено осознанно.** Замена хеша на `Math.random` поведение не
меняет, а кейс «id уникальны и с префиксом» проходит на любой реализации, кроме
константы — то есть не различает. `type-check` ловит переезд файла, остальное
покрыто живой проверкой ниже.

**Проверено вживую** (playground, dev, Chrome DevTools MCP):

- «Add item» дважды в редакторе навигации → в сторе
  `nav-1785242464512-luz4yhn8c` и `nav-1785242467645-svxizegf9`: префикс на
  месте, id разные;
- заполнение обоих пунктов и удаление первого оставляет ровно второй
  (`{ id: 'nav-…svxizegf9', target: '#two', label: 'second' }`) — lookup по id в
  `removeItem` работает на новом формате;
- в prod-сборке (`playground/.output/public/_nuxt`, 80 чанков) ни одного
  вхождения `tiny-sha256`/константы `428a2f98` — хешер ушёл из клиентского
  бандла целиком;
- консоль браузера чистая, published-страница `/test` — 200.

`type-check`, `lint:check` (oxlint + stylelint + `deps:check` + `knip`),
`prettier --check`, 726/726 тестов, `npm run dev:build`, бюджеты бандла
(entry 111 KB, published 122 KB gzip) — зелёные.

**Ревью:** Codex (`gpt-5.6-sol`, high) 28 июля 2026. Blocker'ов нет; отсутствие
следов `tiny-sha256` в коде, тестах, `package.json` и `package-lock.json`,
корректность переезда `generateComponentId` и ненужность миграции id
подтверждены независимо (id проходит через историю, JSONB и published projection
как непрозрачная строка). Решение не добавлять тесты поддержано: тест на префикс
закрепил бы внутренний формат, тест на уникальность вероятностный и прошёл бы и
на sha-версии. По находке про размещение сделано: файл переехал из
`common/utils/bricks/ids.ts` в `builder/core/utils/ids.ts` — `common/utils` по
локальному README только для утилит, используемых 2+ доменами, а все потребители
id в `builder/core`; обновлены оба README и три импорта. Формулировка «других
потребителей нет» уточнена до «формат id никто не разбирает» — само значение
переносится дальше по слоям.

---

## P2

### BM-06. Поле `hash` в манифесте: потребитель потерян при переносе

**Файлы:** `src/runtime/modules/common/types/brickManifest.d.ts:23`,
`src/bricks-manifest.ts:88-95`, `:205`,
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

**Файлы:** `src/runtime/modules/common/composables/useBrickImports.ts:44-49`,
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

### BM-17. Инлайновые типы композаблов вне домена `common`

**Источник:** ревью Codex (`gpt-5.6-sol`, high) правки BM-08, список
перепроверен грепом. BM-08 закрыл `common/composables/` — там правило №1
локального README требовало этого прямо. В остальных доменах то же правило
(`.claude/rules/naming.md`, раздел «Файлы типов и утилит») нарушается в десяти
композаблах: тип объявлен в самом файле, а не в `types/` домена. У части файлов
инлайн не только Return-, но и Options-интерфейс, часть объявлений даже не
экспортируется.

**Файлы:** `builder/publish/composables/usePublishDetailsUrl.ts:8`, `:14`,
`usePublishPageVersions.ts:9`, `usePublishPreview.ts:15`,
`usePublishVersionRestore.ts:10`, `:17`,
`builder/shell/sidebar/composables/useComponentCardDrag.ts:13`,
`render/composables/useRendererDataSources.ts:23`, `:30`,
`useRendererPreviewSync.ts:13`, `:26`,
`text-editor/composables/useInlineEditor.ts:31`, `:37`,
`useTextEditorArea.ts:33`, `useToolbarStateSync.ts:25`, `:30`.

**Исправление:** перенести все, включая неэкспортируемые — правило действует
независимо от экспорта (решение владельца, 28 июля 2026: локальный тип нельзя
переиспользовать, не переписав его рядом, а копии расходятся молча; зафиксировано
в `.claude/rules/typescript.md`). Механическая часть — по образцу BM-08:
`<домен>/types/composables.d.ts`, импорт типа в композабл.

**Проверяемость.** Guard из BM-04 (`buildTimeTypeLocations.spec.ts`) устроен
именно так, чтобы его можно было расширить на рантайм-домены: разбор идёт по AST,
достаточно добавить обход `src/runtime/modules/**/composables/*.ts`. Без такого
кейса правило снова окажется недоказуемым — ровно дрейф из BM-16.

---

## P3

### BM-09. Границы контракта путей не задокументированы

**Файлы:** `src/bricks-manifest.ts:26-33`, `README.md` (раздел «Brick-компоненты»).

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

**Файлы:** `src/bricks-manifest.ts:35`, `:83-84`.

`CATEGORY_RE` может совпасть с комментарием или посторонним вложенным объектом,
а `category: SOME_CONSTANT` молча превращается в `Common`. Поведение унаследовано
от прежнего генератора, но новый контракт манифеста подаёт значение как
авторитетное.

**Исправление:** зафиксировать и валидировать правило «категория — только
строковый литерал»: при совпадении с нелитеральной формой падать сборкой с
внятной ошибкой вместо тихого `Common`. Вариант «получать метаданные через
сгенерированный шаблон» отклонён вместе с BM-10.

**Отметка от BM-05.** У билдера авторитетное значение фактически на руках:
`useComponentLibrary` и так грузит brick-модуль ради `values`/`slots`, так что
`brickData.category` — настоящая категория, а не результат регулярки. Соблазн
починить симптом там (взять модульное значение вместо манифестного) отклонён:
это разошло бы категорию в библиотеке билдера с категорией в ручке и в манифесте,
то есть спрятало бы дефект вместо его устранения. Валидация в генераторе остаётся
единственным правильным местом.

### BM-16. `test/README.md` отстал от состава спеков

**Файлы:** `test/README.md`.

Файл документирует каждый спек по имени, но описано 65 из 87 — отсутствуют ровно
22, включая всё, что добавлено в BM-01, BM-02, BM-14, BM-15 и BM-03, а также
более раннее (`canvasDragState`, `componentOrder`, `dropFlowEntries`,
`flowPlaceholderAnimation`, `gridDropPlacement`, `layoutDragVisuals`). Найдено при
работе над BM-03 и подтверждено ревью Codex; дефект накопительный, к какому-то
одному пункту не привязан.

**Исправление:** сначала решить, держим ли конвенцию «строка на каждый спек» —
она даёт ровно этот дрейф и не проверяется ничем. Варианты: (а) синхронизировать
список и добавить тест, который сверяет `test/README.md` с диском (по образцу
`apiHandlersManifest.spec.ts`, где строковые пути тоже проверяются существованием
файла); (б) заменить пофайловый список описанием доменов, чтобы новый спек не
требовал правки README. Пункт (а) без теста бессмыслен — дрейф вернётся.

**Отложено (28 июля 2026, решение владельца).** Набор тестов признан избыточным,
планируется сокращение порядка 90%. До него пункт не делать: вариант (а) —
синхронизация плюс тест-сверка — обесценится вместе с вырезанными спеками. После
сокращения дефолт — вариант (б): пофайловый индекс на уцелевшем наборе не нужен.

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
