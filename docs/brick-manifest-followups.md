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

### BM-06. Хеш манифеста по содержимому; HMR-надстройка отклонена

**Выполнено 28 июля 2026 года; HMR-часть откачена — см. BM-18.**

**Решение (28 июля 2026, владелец): HMR-надстройка откатывается, хеш остаётся.**
Механика работает и проверена (см. ниже), но выигрыш не оправдывает конструкцию:
два триггера, HMR-граница и ловушка «правки файла загрузчиков не доезжают до
потребителей». Перезагрузка страницы билдера в dev признана терпимой — билдер
здесь инструмент отладки, черновик лежит в localStorage, а сборка страниц
происходит в проде. Что именно снимать и что оставить — в BM-18; после переноса
метаданных в манифест (BM-19) обновление списка по хешу станет тривиальным и
вернётся уже без HMR-хаков.

**Ревью Codex (`gpt-5.6-sol`, high) 28 июля 2026 подтвердило размен.** Вопрос
ставился узко: есть ли способ отдать браузеру свежий brick-модуль без узлов-сирот
в графе и без self-accept. Ответ — дешёвого нет:
`import.meta.hot.data` + `accept(newModule)` убрал бы `refreshBrickModules`,
query-копии и второй триггер, но self-accept остаётся принципиально (именно он
гасит propagation), а два сигнала из-за гонки с манифестом всё равно нужны;
`invalidate()` не помогает — продолжает propagation до того же reload;
`accept(deps, cb)` семантически лучший, но Vite требует статические литералы, то
есть список надо генерировать; собственный Vite-плагин с виртуальным
broker-модулем корректен, но «заметно дороже» (два окружения Nuxt, `add`/`unlink`,
ошибки трансформации, синхронизация с манифестом) и не окупается. Отдельно ревью
не советует опираться на семантику `?t=` Vite и собирать URL самостоятельно.

**Находка ревью, перепроверенная на своей стороне: «черновик цел» — неточность.**
В `useBuilderDraftPersistence` есть только debounce 800 мс и
`onScopeDispose(clearPersistTimer)`; слушателя `pagehide`/`beforeunload` нет, так
что при перезагрузке таймер гибнет вместе со страницей и изменения последних
≤800 мс теряются. К BM-06 это не относится — окно существует и сейчас (мягкий
рестарт на `add`/`unlink`, F5, закрытие вкладки). Вынесено в BM-20.

Поле `hash` получило потребителя, ради которого оно и приехало из прародителя
проекта (`front-lib/ui-demo`, `store/ui-demo-navigation.ts:71-105`): правка
brick-файла обновляет библиотеку компонентов прямо на открытой странице билдера.
Полная перезагрузка страницы, которую вотчер посылал на каждый `change`, убрана —
вместе с ней больше не теряются содержимое канваса и модалка восстановления
черновика.

**Замысел пункта оказался неполным: главного препятствия в нём не было.**
Метаданные (`values`, `slots`, `description`) в манифест не попадают — билдер
читает их динамическим импортом brick-модуля. После правки файла лоадер из
glob-карты ведёт на прежний URL, а браузер держит модуль по URL в ESM-кеше, так
что повторный `import()` отдаёт **старую** версию (проверено: на диске v6,
`import()` вернул v4). То есть «перефетчить манифест и сравнить хеш» само по себе
обновило бы только `category` и состав списка — при `change` состав не меняется,
и правка дефолта или нового свойства осталась бы невидимой до F5. Полный объём
согласован с владельцем 28 июля 2026: доделываем вместе с обновлением карты
загрузчиков.

**Что сделано.**

**1. Хеш — по содержимому brick-файлов.** `computeManifestHash`
(`src/bricks-manifest.ts`) хеширует пары «`brickPath`, исходник» в порядке
манифеста, разделяя их NUL. Прежний `computeHash(JSON.stringify(bricks))` считал
инвентарь (имя, категория, путь) и к правке `values` был слеп — то есть к самой
частой операции при разработке компонента. Файлы генератор и так читает целиком
ради категории, второго прохода по ФС правка не стоит. Сортировка записей
осталась единственным источником стабильности хеша: `globby` отдаёт порядок,
зависящий от ФС. Прочитанный файл ходит по генератору как
`IBrickManifestSource` (`entry` + `content`, `src/types/bricksManifest.d.ts`);
в манифест уходит только `entry`.

**2. Вотчер посылает событие вместо `full-reload`.** `src/module.ts`, регион
«Манифест brick-компонентов и dev-вотчер»: на `change` после перегенерации
манифеста уходит `hot.send({ type: 'custom', event: BRICKS_MANIFEST_HMR_EVENT,
data: { hash } })`. Константа события — в
`common/constants/brickManifest.ts`, рядом с namespace и именем файла; префикс —
имя пакета, канал общий для всех модулей приложения. Подписка на
`vite:serverCreated` осталась (через неё берётся клиентский Vite-сервер), хотя
BM-06 предполагал её удаление: канал нужен и для события.

**3. Карта загрузчиков переехала в свой модуль и обновляется в dev.**
`common/utils/bricks/brickModuleLoaders.ts` — `import.meta.glob`,
`getBrickModules()`, `refreshBrickModules(version)` и HMR-граница;
`useBrickImports` стал тонким и запрашивает карту на каждый lookup.
`refreshBrickModules` повторно импортирует **этот же модуль** с уникальной query
(`?bricks=<версия>`) и берёт карту у свежей копии: при трансформации Vite сам
подставляет в неё актуальные `?t=<timestamp>` изменённых brick-файлов, поэтому
URL не собираются вручную — `base`, `@fs`-префиксы и всё остальное остаются на
стороне Vite.

**4. Библиотека пересобирается по двум событиям.**
`builder/app/composables/useBrickLibraryHmr.ts`: `handleManifestChange` (событие
вотчера — при расхождении хеша с применённым) и `handleViteUpdate`
(`vite:afterUpdate` с обновлением карты загрузчиков — безусловно). Данные
`useAsyncData('bricks-components')` стали `{ hash, items }`
(`IComponentLibraryData`), так что «применённый хеш» лежит рядом со списком, из
которого он собран. Оба обработчика идемпотентны: сначала подмена карты, затем
`refresh()`.

**Почему событий два, а не одно.** Правка brick-файла порождает две независимые
цепочки, и порядок между ними не гарантирован: наш вотчер (`builder:watch`)
перегенерирует манифест, а Vite инвалидирует сам brick-файл. На практике вотчер
успевает **первым** — и обновление по одному его событию собирало библиотеку на
прежних метаданных (наблюдалось: в манифесте новый хеш, в `defaultProps` старое
значение), потому что на момент нашего reimport'а Vite ещё не поднял timestamp
brick-файла. Второе событие (`vite:afterUpdate` по URL модуля загрузчиков)
приходит уже после инвалидации, поэтому оно и приносит свежие метаданные, а
событие манифеста — свежую категорию. Цена — две пересборки списка на правку в
dev: один запрос к ручке плюс импорты из кеша браузера.

**Отвергнутый вариант: своя версия в URL brick-файлов.** Импорт по
собственноручно собранному адресу (`import.meta.env.BASE_URL` +
`components/X.brick.ts?bricks=<hash>`) от таймингов Vite не зависит вовсе (файл
на диске уже новый, трансформация — на запрос), и `BASE_URL` даёт ровно тот
префикс, который Vite подставляет сам (проверено: `/_nuxt/`). Отвергнут по факту: такой запрос заводит в графе Vite
модуль brick-файла **без импортёров**, и на следующей правке того же файла Vite
видит узел без HMR-границы и перезагружает страницу целиком (в логе
`page reload components/ProbeCard.brick.ts`). Query-копия модуля загрузчиков
такого эффекта не даёт — у неё есть свой `accept`.

**HMR-граница: почему без неё пункт не работает.** Наш `full-reload` был не
единственным. У brick-файлов своей границы нет (их импортёр — glob), поэтому
propagation упирается в тупик, и на тупике Vite перезагружает страницу сам —
проверено: после снятия нашего `hot.send` в логе появился
`page reload components/ProbeCard.brick.ts`. Пустой `import.meta.hot.accept()` в
модуле загрузчиков эту цепочку останавливает. Тупик возникает не всегда: при
первой загрузке страницы билдера метаданные приезжают из SSR-payload, и
brick-модули в клиентский граф не попадают, пока их не запросит превью карточки
библиотеки или элемент канваса — отсюда и расхождение первых наблюдений.

**Ловушка (сохраняем на будущее): `accept` гасит HMR самого файла.** Модуль с
`accept` считается самообновляемым, поэтому правки
`brickModuleLoaders.ts` до потребителей в dev не доезжают — они держат прежнюю
копию. Файл для того и сведён к карте и двум функциям; после его правки
dev-страницу нужно перезагрузить руками. Рядом стоит вторая, уже известная
ловушка: правки `src/module.ts` работающий dev-сервер не подхватывает вообще —
первый прогон этой проверки был недействительным, потому что рестарт в логе
относился к `add` brick-файла, а не к правке модуля.

**Что осталось за границей пункта.** Уже отрендеренные элементы канваса и панель
свойств выделенного компонента обновляются не мгновенно: Vue-компонент брика
подхватывает свой HMR сам, а `values`/`description` панель читает в
`selectSelf`, то есть при следующем выделении. Кеш метаданных (побочная выгода,
обещанная в исходном пункте — не импортировать каждый brick-модуль на каждой
загрузке билдера) не делался: он требует хранить `values`/`slots` вне
brick-модулей, а это отдельная работа со своим решением о build-time парсинге.

**Тесты** (+8 кейсов, 734 всего):

- `test/module/bricksManifestQueue.spec.ts` — +2: хеш меняется от правки внутри
  файла при неизменном инвентаре (на прежней, инвентарной реализации кейс краснеет) и не
  меняется на повторном скане без правок; у хелпера `writeBrickFile` появился
  параметр `values`, ради которого правка и наблюдается;
- `test/builder/brickLibraryHmr.spec.ts` (6) — порядок «карта → список»,
  молчание при совпадении хеша, событие без хеша, пересборка при неудачном
  обновлении карты, безусловная пересборка на HMR-обновлении карты, игнор
  обновления постороннего модуля.

**Мутационная проверка тестов.** Хеш обратно по инвентарю — 1 падение; обратный
порядок в `reloadLibrary` (список до карты) — 1; снятие сверки хеша — 1; снятие
фильтра обновлений в `handleViteUpdate` (реакция на любое `vite:afterUpdate`) — 1.
Автоматической защиты нет у самого `refreshBrickModules` и у HMR-границы: оба
требуют живого Vite dev-сервера, и проверены живыми различающими наблюдениями
(см. выше — старые метаданные без обновления карты, `page reload` без `accept`).

**Проверено вживую** (playground, dev, Playwright; пробные
`ProbeCard.brick.ts` + `ProbeCard.vue`, маркер `window.__bm06` как детектор
перезагрузки, превью карточки библиотеки рендерит `defaultProps.headline`):

- правка дефолта, описания и категории одним сохранением: маркер на месте
  (перезагрузки нет), заголовок группы стал `PROBEHOT`, карточка показывает
  `PROBE:v10-live`, в данных `useAsyncData` — новые `category`, `description`,
  `defaultProps`; консоль браузера чистая (0 ошибок, 0 предупреждений);
- вторая правка подряд — тот же результат (`v11-second-edit`), то есть
  query-копии модуля в графе ничего не ломают; `page reload` в логе dev за весь
  прогон — ноль;
- `add` второго brick-файла → один мягкий рестарт, в манифесте и в ответе ручки
  обе записи; `unlink` → один рестарт, снова одна запись;
- published-страница `/test` — 200, `bricks-container` в сыром SSR-HTML;
- prod: `npm run dev:build` — манифест запечён в `chunks/raw/manifest.mjs` с
  хешем по содержимому; в клиентском бандле нет ни `bricks=`, ни
  `import.meta.hot` (dev-ветки вырезаны); `.output`, запущенный из постороннего
  cwd, отдаёт `/test` 200 и манифест через ручку.

`type-check`, `lint:check` (oxlint + stylelint + `deps:check` + `knip`),
`prettier --check`, 734/734 тестов, `npm run dev:build`, бюджеты бандла
(entry 111 KB, published 122 KB gzip) — зелёные. README на момент правки был
обновлён под поведение «без перезагрузки»; вместе с откатом (BM-18) формулировка
вернулась к перезагрузке страницы.

### BM-18. HMR-надстройка BM-06 откачена, хеш и форма данных оставлены

**Выполнено 28 июля 2026 года** по решению владельца из BM-06: правка
brick-файла снова перезагружает страницу билдера в dev, а весь код, который
этого избегал, снят.

**Удалено целиком** (4 файла): `common/utils/bricks/brickModuleLoaders.ts`
(glob-карта, `getBrickModules`, `refreshBrickModules`,
`BRICK_LOADERS_MODULE_URL`, пустой `import.meta.hot.accept()`),
`common/types/brickModuleLoaders.d.ts` (`TBrickModulesMap`,
`IBrickModuleLoaders`), `builder/app/composables/useBrickLibraryHmr.ts`,
`test/builder/brickLibraryHmr.spec.ts` (6 кейсов).

**Правки выполнены все семь по плану.** Шесть файлов после отката совпали с
предыдущим коммитом **побайтово** (`git status` их не показывает):
`useBrickImports.ts` (glob вернулся в сам файл), `constants/brickManifest.ts`
(`BRICKS_MANIFEST_HMR_EVENT` удалён), `common/types/global.d.ts` (шим
`IViteHotContext` и поля `hot`/`env` — `import.meta.hot` и `import.meta.env` в
`src/` больше не встречаются, проверено грепом) и три локальных README
(`common/composables/`, `common/utils/`, `builder/app/composables/`; в первом
откат вернул и ширину столбцов таблицы). В `src/module.ts` осталось единственное
отличие от прежнего кода — ссылка в комментарии: BM-06 → BM-19.

**Оставлено — это и есть результат BM-06:** `computeManifestHash` по содержимому,
`IBrickManifestSource`, два кейса про хеш в `bricksManifestQueue.spec.ts` и форма
`{ hash, items }` с типом `IComponentLibraryData`. У поля `hash` снова нет
потребителя, и все четыре описания снятой механики переписаны под это: JSDoc
`useComponentLibrary`, комментарий `IComponentLibraryData`, JSDoc
`computeManifestHash` (утверждал, что билдер перефетчивает библиотеку при
расхождении) и два причинных комментария в `bricksManifestQueue.spec.ts`.
Формулировка контракта ослаблена сознательно: `hash` — хеш из ответа ручки, а не
«применённое состояние», потому что метаданные внутри `items` до BM-19 могут
отставать от него (см. ниже).

**Проверка полноты — `knip`.** Он и был причиной прогонять `lint:check` целиком:
экспорт, оставшийся без потребителя (например `IComponentLibraryData`, если бы
форма данных откатилась вместе с HMR), красит его. Прогон чистый.

**Тест на оставленный контракт** (+2 кейса, 730 всего):
`test/builder/componentLibraryData.spec.ts` — хеш из ответа ручки уезжает в данные
`useAsyncData` рядом со списком, ответ без хеша даёт пустую строку и не ломает
список. Кейсы читают результат handler'а через мок `useAsyncData`: наружу
композабл отдаёт только `componentLibraryList`, поэтому иначе перенос хеша
проверить нечем — на это указало ревью, и оно право.

**Мутационная проверка.** Подмена `hash: response?.hash || ''` на константу —
1 падение (существующий `componentLibraryDefaultProps.spec.ts` при этом зелёный,
то есть новый спек закрывает ровно незащищённое место). Прямой lookup
`brickModules[normalizeBrickPath(brickPath)]` вместо `readOwnKey` — 4 падения из
5 в `test/common/brickImportsPrototypeKeys.spec.ts`: glob вернулся в файл, и
проверено, что защита BM-14 осталась различающей. Больше в откате мутировать
нечего — удалённый спек был единственной автоматической защитой снятой механики.

**Проверено вживую** (playground, dev, Playwright; пробники
`playground/components/ProbeCard.{vue,brick.ts}`, verify-пользователь по скиллу
`.claude/skills/verify`, маркер `window.__bm18` как детектор перезагрузки,
редактор `/bricks/test`):

- форма данных на месте: `__NUXT__.data['bricks-components']` — `{ hash, items }`,
  хеш совпадает с ответом ручки;
- правка brick-файла (`category`, `description`, `default` одним сохранением) →
  маркер исчез, то есть страница перезагрузилась; в логе dev рестарта нет,
  манифест и ручка отдают новую категорию и новый хеш;
- `add` второго brick-файла → ровно один мягкий рестарт, в манифесте и в ручке
  обе записи; `unlink` → второй рестарт, снова одна запись, хеш вернулся к
  прежнему значению (детерминированность хеша);
- сайдбар билдера показывает группу с новой категорией и карточку `ProbeCard`,
  консоль браузера чистая — 0 ошибок, 0 предупреждений;
- published-страница `/test` — 200, `bricks-container` в сыром SSR-HTML;
- prod (до старта dev): `npm run dev:build` зелёный, в клиентском бандле нет ни
  `bricks=`, ни `manifest-changed`, ни `import.meta.hot`.

**Найдено при живой проверке: метаданные отстают на одну загрузку страницы.**
После правки brick-файла свежими сразу видны только `category` и `hash` — они
приходят из манифеста, который вотчер перегенерирует до отправки `full-reload`.
`description`, `values` и слоты билдер читает импортом самого brick-модуля, и в
ту перезагрузку, которую вызвала правка, они не попадают: Vite инвалидирует
brick-файл позже, чем уходит сигнал перезагрузки. Наблюдалось стабильно на двух
правках подряд (`category: ProbeChanged` при `description: probe v1`, затем
`ProbeThird` при `probe v2`), а ручная перезагрузка сразу после этого отдаёт
свежие значения — то есть инвалидация происходит, просто позже.

**Это не регрессия отката, а вскрытое свойство прежнего поведения.** По этому
пути код побайтово равен коду до BM-06, а незамеченным эффект остался потому, что
живая проверка BM-12 сверяла на `change` только категорию. Ровно эту гонку BM-06 и
описывал со своей стороны («на практике вотчер успевает первым»), только там её
закрывал второй триггер на клиенте. Корень снимает BM-19: когда метаданные
переедут в манифест, импорта brick-модулей на этом пути не останется вовсе.
Сверх объёма пункта оговорка про отставание дописана в `README.md` — прежняя
формулировка «правка обновляет манифест и перезагружает страницу» формально верна,
но читается как «после перезагрузки увидишь свои правки».

`type-check`, `lint:check` (oxlint + stylelint + `deps:check` + `knip`),
`prettier --check`, 730/730 тестов (было 734: минус 6 удалённых, плюс 2 новых),
`npm run dev:build`, бюджеты бандла (entry 111 KB, published 122 KB gzip) —
зелёные.

**Ревью:** Codex (`gpt-5.6-sol`, high) 28 июля 2026. Blocker'ов нет, следов
удалённых символов и файлов не осталось, вывод «отставание не создано неполным
откатом» подтверждён независимо. По находкам сделано: переписаны четыре
устаревших описания снятой механики (перечислены выше), формулировка контракта
ослаблена до «хеш из ответа ручки», «пять файлов побайтово» исправлено на шесть
(ревью пересчитало — я перечислил пять и шестой отдельно), добавлен спек на
перенос хеша.

**Отклонена находка «отставание метаданных можно снять дёшево здесь же».**
Предлагалось сохранить из `vite:serverCreated` не только клиентский, но и
SSR-сервер и перед отправкой `full-reload` вызвать `moduleGraph.onFileChange(path)`
для обоих. Проверено по коду Nuxt 3.21.8 / vite-node 5.3.0: **не сработало бы.**
SSR-кеш модулей сбрасывается не через граф — рендер начинается с
`getInvalidates()` → `runner.moduleCache.invalidateDepTree(invalidates)`
(`@nuxt/vite-builder/dist/vite-node-entry.mjs:10-11`), а Set `invalidates`
пополняется единственным местом — listener'ом Nuxt на `clientServer.watcher`
(`dist/index.mjs:287-289`, `invalidates.add(file)` плюс импортёры через
`getModulesByFile`). Set живёт в замыкании `ViteNodePlugin` и снаружи недоступен,
а `onFileChange` в него не пишет, так что `runner.moduleCache` продолжил бы
отдавать прежний brick-модуль. Заодно видно и происхождение гонки: наш вотчер
висит на `builder:watch` (chokidar самого Nuxt), а инвалидация SSR — на отдельном
chokidar Vite, то есть порядок между двумя независимыми watcher-инстансами не
определён в принципе.

**Разобранный вариант, оставленный BM-19.** Подписаться на `clientServer.watcher`
напрямую — тогда наш listener регистрируется после нуксовского (`vite:serverCreated`
вызывается уже после создания сервера), и к моменту `full-reload` файл лежал бы в
`invalidates`. Не делаем: это опора на внутренний watcher Vite, ровно того класса,
от которого BM-12 сознательно ушёл, и требует живой проверки сброса
`runner.moduleCache`. BM-19 снимает вопрос без этого — импорта brick-модулей на
SSR-пути библиотеки не останется вовсе.

### BM-20. Черновик билдера больше не теряет последние 800 мс при перезагрузке

**Выполнено 28 июля 2026 года.**

**Файлы:** `src/runtime/modules/builder/app/composables/useBuilderDraftPersistence.ts`,
`test/helpers/builderSessionHarness.ts`, `test/builder/draftPersistence.spec.ts`.

Автосохранение оставалось `setTimeout(..., 800)` без слушателя выгрузки: таймер
гиб вместе со страницей, изменения последних ≤800 мс в localStorage не попадали.
Добавлен `window.addEventListener('pagehide', flushDraft)`; сброс — синхронный
вызов существующего `persistDraftNow()`, слушатель снимается в `onScopeDispose`
рядом с `clearPersistTimer`.

**Сохраняем безусловно, а не только при запланированном таймере.** Первая
реализация выходила на `persistTimer === null`, чтобы слушатель не стал вторым,
неявным триггером автосейва помимо `watch`. Ревью показало, что условие неверно:
`updateComponentProp`, responsive-props и `setComponentHtmlId` меняют компонент в
сторе синхронно, а `saveToHistory` вызывают через собственный debounce 300 мс
(`core/stores/actions/properties.ts`, `actions/schema.ts`). В это окно
`historyIndex` ещё прежний, watch автосейва не срабатывал и таймера нет — а
`buildCurrentSnapshot()` уже отдаёт новое значение, то есть «таймера нет» не
значит «нечего сохранять». Правка пропса — самая частая правка канваса, так что
guard выбрасывал главный случай. Цена безусловного сброса — лишняя запись в
localStorage, когда таймер успел отработать перед выгрузкой; нового состояния
восстановления она не создаёт (в edit-режиме `persistDraftNow` сверяется с
`savedSnapshot`, `updatedAt` черновика никто не читает).

**Добавлен `isSessionReady`** — признак успешного bootstrap'а сессии, отдельный от
`isSessionLoading`. Без него безусловный сброс открывал новый способ **потерять**
работу: `openBuilderSession` фиксирует `sessionPagename`, обнуляет `savedSnapshot`
и может упасть на `loadAllPages()` до чтения черновика, а `isSessionLoading`
снимается в `finally`. Дальше `pagehide` проходил guard'ы и писал под ключом
сессии дефолты (или остатки прошлой страницы) — поверх валидного черновика.
Флаг ставится **единственной точкой** — после всех ветвей bootstrap'а: их тело
вынесено в `bootstrapSession`, а `isSessionReady.value = true` стоит после его
`await` в `try`. Первая версия поднимала флаг раньше применения черновика
(`applySnapshot`), и падение на повреждённом черновике оставляло сессию
«готовой» — сброс на выгрузке затёр бы этот черновик недособранным состоянием
(находка ревью раунда 3). Проверяется флаг в `persistDraftNow` и
`scheduleDraftPersist`.

Уточнение по границам флага (ревью раунда 4 поправило мою прежнюю формулировку):
на **таймерном** пути ошибки bootstrap'а и не было. `startEditingPage` меняет форму
внутри `openBuilderSession`, то есть при `isSessionLoading === true`, а watch
выполняется тем же тиком — `scheduleDraftPersist` выходит по своему guard'у и таймер
не заводится. Значение `isSessionReady` — именно в терминальных путях
(`pagehide`, dispose, смена маршрута), где сброс безусловный.

Цена флага — тихая потеря правок, если сессия не открылась, а пользователь
продолжил редактировать: редактор остаётся интерактивным. Вынесено в BM-23 и
закрыто там же — блокирующим экраном с кнопкой «Повторить».

**`visibilitychange` → `hidden` не добавлен.** Все перечисленные в пункте случаи
(F5, закрытие вкладки, мягкий рестарт dev-сервера на правку brick-файла) дают
`pagehide`; страховка нужна там, где вкладку убивают из фона без него — сценарий
мобильного браузера, а билдер с drag-and-drop канвасом на мобильных не работает.
Добавляется одной функцией, если понадобится.

**Тесты.** `draftPersistence.spec.ts` — пять кейсов на сброс (в файле их восемь, остальные — BM-21 и BM-22): правка формы внутри
окна debounce уходит в localStorage по `pagehide` (и повторно не сохраняется
после истечения таймера — сверяется `updatedAt`, потому что содержимое повторной
записи совпало бы); правка пропса внутри окна debounce истории не теряется
(таймера нет вовсе); `pagehide` после ошибки открытия сессии не затирает лежащий
черновик; сброс после успешного сохранения не воскрешает удалённый черновик;
слушатель снимается со scope страницы — сверяется та же ссылка на функцию, что
регистрировалась.

Различающими проверены четыре из пяти — откатом соответствующей части правки: без
слушателя падают кейс с формой и кейс со снятием слушателя, с guard'ом на таймер —
кейс с пропсом, без `isSessionReady` — кейс с ошибкой bootstrap'а (черновик
перезаписывается), без `clearPersistTimer` в сбросе — проверка `updatedAt`. Кейс
«после сохранения не воскрешает» различающим не является и оставлен регрессионным:
он держит проход сброса через guard'ы `persistDraftNow`, а не мимо них.

jsdom в наборе по-прежнему нет: `window`-стаб с шиной событий вынесен в harness
(`createWindowStub`, типы — `test/helpers/types.d.ts`), оба существующих
session-спека переведены на него вместо копий стаба.

**Проверено вживую** (playground, Playwright), три сценария по 150 мс между
правкой и `location.reload()`:

- заголовок в настройках публикации → после перезагрузки черновик содержит новое
  значение;
- undo на канвасе (после drag&drop блока) → `components: 0` в черновике, канвас
  восстановился пустым;
- `htmlId` компонента (тот самый debounce истории 300 мс, где таймера автосейва
  нет вовсе) → `htmlId: 'anchor-bm20'` в черновике, после перезагрузки узел с
  этим id есть на канвасе.

Контрольные прогоны того же: без слушателя `title` остаётся пустым, с guard'ом на
таймер `htmlId` теряется (`null`, узла на канвасе нет). Все три вектора нужны —
watch слушает историю канваса и `currentFormState`, а правка пропса не задевает ни
одного из них сразу (историю — только через свой debounce 300 мс). После добавления `isSessionReady` сценарий с формой прогнан
заново: новый guard мог бы отключить автосейв целиком, но черновик по-прежнему
содержит правку.

`type-check`, `oxlint`, `prettier --check`, `lint:check` (с knip), `deps:check`,
738/738 тестов — зелёные (счёт по итогу всей тройки BM-20/21/22).

**Ревью:** Codex (`gpt-5.6-sol`, high) 28 июля 2026, четыре раунда; все находки
приняты и подтверждены на своей стороне по коду, а все про потерю данных — ещё и
контрольными прогонами.

Раунд 1: guard на таймер снят (см. выше); слабая проверка «сохранение не
повторяется» переписана с `title` на `updatedAt`; `IWindowStub`/`IBuilderContext`
вынесены в `test/helpers/types.d.ts` (правило «типы в файлах типов» действует и в
`test/`: прежний инлайн `IBuilderContext` — долг, а не прецедент); `as unknown as`
из стаба таймеров убран в пользу `Number()`. Вторая находка раунда — молчащий
автосейв канваса после 50 снапшотов истории — к BM-20 не относится и вынесена в
BM-22.

Раунд 2 (по исправлениям): найдена регрессия от снятого guard'а — `pagehide` после
ошибки bootstrap'а затирал валидный черновик; закрыто `isSessionReady` (см. выше)
плюс различающий тест. Ослаблены два переоценивающих утверждения: «лишних записей
не создаёт» (запись возможна, не возникает нового состояния восстановления) и
«каждая проверка различающая» (одна из пяти — регрессионная). Подтверждено
независимо: стаб таймеров корректен для Vitest 3.2.7 (fake `Timeout` реализует
`Symbol.toPrimitive`), проверка `updatedAt` надёжна, гонки таймер/`pagehide` нет —
таймер снимается первым.

Раунд 3: вскрыт второй выход из редактора без unmount (переход между страницами
билдера, см. BM-21), поднятая раньше времени готовность сессии (закрыто выносом
`bootstrapSession`) и тихая потеря правок после ошибки bootstrap'а (вынесено в
BM-23). Тест BM-22 ужесточён по замечанию: без этого он мог проходить на таймере от
контрольного `saveToHistory`, а не на capture'е за лимитом.

Раунд 4: находки не про эту правку — две гонки переключения сессии, существующие
независимо от неё (BM-24, BM-25); подтверждены по коду и заведены пунктами. Мой
вывод «падение `fetchPageRequest` планировало сохранение по таймеру» оказался
неверным и исправлен выше: watch выполняется при `isSessionLoading === true` и
таймер не заводит. Подтверждено независимо: для одиночного перехода между
страницами порядок sync-сброса верен (колбэк видит прежний ключ), rename и повторный
rename упорядочены правильно, отложенной двойной записи нет — таймер снимается до
записи.

**Остаток этого класса закрыт следом:** BM-21 (уход из редактора SPA-навигацией) и
BM-22 (молчащий автосейв канваса после лимита истории) — ниже.

### BM-21. Уход из редактора SPA-навигацией больше не теряет правку

**Выполнено 28 июля 2026 года.**

**Файлы:** `src/runtime/modules/builder/app/composables/useBuilderDraftPersistence.ts`,
`test/builder/draftPersistence.spec.ts`.

Заведено при реализации BM-20: `pagehide` закрывает выгрузку документа, но уход из
редактора на дашборд — не выгрузка. Vue Router размонтирует страницу, scope
останавливается, и `onScopeDispose` вызывал `clearPersistTimer()`, то есть
запланированное сохранение **отбрасывал**. В `onScopeDispose` теперь `flushDraft()`.

**Второй выход из редактора — без unmount вообще** (найдено ревью раунда 3): у
страницы статический page key (`definePageMeta({ key: 'bricks-builder-pagename' })`),
поэтому переход между двумя `/bricks/<pagename>` — back/forward — страницу не
перемонтирует. Dispose не срабатывает, а watcher сессии успевает переписать
`sessionPagename` и снять `isSessionReady`, так что отложенное сохранение прежней
страницы либо отбрасывалось на guard'е, либо уезжало под ключ новой. Добавлен
`watch(routePagename, flushDraft, { flush: 'sync' })`: **sync обязателен** — обычный
watcher выполнился бы после watcher'а сессии (тот зарегистрирован раньше), то есть
уже с чужим ключом. На rename это безвредно: `renameSession` меняет
`sessionPagename` и переносит черновик до `router.replace`, поэтому сброс пишет уже
по новому ключу (проверяется существующим спеком про миграцию черновика). Оговорка:
если сессию переименовал **преждевременный** rename во время медленного Save as
Copy, сброс запишет состояние под ключ копии — но черновик туда уже перенесла сама
`renameSession`, так что нового повреждения сброс не добавляет; сам преждевременный
rename — отдельный дефект, см. BM-25.

Риск, записанный в самом пункте, проверен и не реализуется: ни `useBuilderSession`,
ни `[pagename].vue` при unmount сторы не сбрасывают (в `onBeforeUnmount` страницы
только снятие `keydown`-слушателя), а Pinia живёт на уровне приложения — снимок на
dispose честный. От записи мусора при неудачном bootstrap'е страхует
`isSessionReady` из BM-20.

**Различающие тесты:** правка формы → `scope.stop()` → черновик содержит правку
(с прежним `clearPersistTimer()` падает); правка формы → смена `routePagename` на
другую страницу → черновик прежней страницы содержит правку, а в черновик новой
она не уезжает (без sync-watcher'а падает).

**Проверено вживую** (playground, Playwright): создана временная страница, вход в
редактор SPA-переходом с дашборда, правка заголовка, через 150 мс `history.back()`.
На 302-й мс после правки — то есть внутри окна debounce 800 мс, до которого таймер
дожить не мог — черновик уже содержит правку, а до правки его не было вовсе.
Временная страница и черновики удалены.

Переход `A → B` между двумя страницами билдера живьём не ставился: сейчас UI такой
переход не порождает (логотип открывает дашборд в новой вкладке — `target="_blank"`,
карточки дашборда монтируют редактор заново), реальные смены `routePagename` без
unmount — это rename и Save as Copy. Сам переход закрыт спеком с контролем, а из
живых прогонов сделан тот, где новый sync-сброс мог навредить: rename сессии —
черновик по старому ключу пуст, содержимое под новым, URL заменён (то есть сброс не
воскрешает старый ключ поверх миграции).

### BM-22. Автосейв канваса больше не замолкает после заполнения истории

**Выполнено 28 июля 2026 года.**

**Файлы:** `src/runtime/modules/builder/app/composables/useBuilderDraftPersistence.ts`,
`test/builder/draftPersistence.spec.ts`.

Найдено ревью Codex при разборе BM-20. При достижении лимита 50 `capture()` пушит
снапшот и поднимает `historyIndex` до 50, затем `clampHistory` срезает первый
элемент и возвращает индекс на 49 — всё внутри одного действия. Watch автосейва
наблюдал сам индекс, а его старое и новое значения равны, поэтому колбэк не
выполнялся: после 50 снапшотов правки канваса не автосохранялись вообще, пока
черновик не запланирует форма публикации.

**Исправление:** watch наблюдает ссылку на текущий снапшот
(`history[historyIndex]`) вместо индекса. Объект снапшота новый на каждый
`capture`, а undo/redo двигают индекс — оба случая видны. Счётчик ревизии в сторе
не заводился: единственный потребитель `historyIndex` вне самого стора — этот
watch, и лишнее состояние ядру не нужно.

**Различающий тест:** заполнить историю до лимита, убедиться, что дальнейший
`capture` индекс не двигает, затем правка пропса — черновик обновился. С прежним
watch'ем падает.

**Проверено вживую** (playground, Playwright): 52 правки канваса подряд
(`fullWidth`, который пишет историю синхронно) → следующая правка попадает в
черновик (`fullWidth` перевернулся, `updatedAt` сдвинулся). Контрольный прогон с
прежним watch'ем на том же сценарии: черновик замер — и значение, и `updatedAt`
остались от последней записи до лимита.

### BM-24. Переключение сессии билдера сериализовано поколением

**Выполнено 28 июля 2026 года.**

**Файлы:** `src/runtime/modules/builder/app/composables/useBuilderSession.ts`,
`test/builder/sessionOpening.spec.ts`, `test/helpers/builderSessionHarness.ts`,
`test/helpers/types.d.ts`.

`openBuilderSession` получил идентификатор поколения: инкремент на входе,
проверка `isCurrentSession(generation)` после **каждого** await и перед любой
записью, которая идёт **после асинхронной границы** (формулировка уточнена ревью:
`startEditingPage` выполняется до point-lookup'а, то есть до ближайшей проверки —
но и до момента, когда открытие может стать вытесненным). Только проверки на выходе было бы недостаточно — побочные
эффекты bootstrap'а идут внутри цепочки: `startEditingPage` до point-lookup'а,
`loadSchema` и `savedSnapshot` после него. Поэтому `bootstrapSession` принимает
поколение и выходит молча на двух границах: после `loadAllPages` и после
`fetchPageRequest`.

**Запись общего списка страниц вытесненным открытием оставлена.** `loadAllPages`
пишет кеш, одинаковый для всех страниц; отбрасывать его — значит второй раз
ходить за тем же списком. Проверка стоит **после** await'а, то есть список
запишется, а решения по нему (`getPageByPagename` → `startEditingPage` → схема)
принимает только актуальное поколение. Полностью безвредной эта запись, вопреки
первой формулировке, не является (уточнено ревью): поздний ответ может заменить
более свежий список, а на ошибке стор пишет `generalError` **до** того, как
управление вернётся в наш guard, — то есть текст ошибки вытесненного списка
доходит до текущей сессии через общий стор, хотя тост и блокирующий экран
подавлены. Оба следствия — свойства общего кеша, а не поколения; вынесены в
BM-26.

**Поколение живёт дольше своего экземпляра.** Счётчик локален вызову composable,
а незавершённое открытие переживает unmount страницы — сторы-то общие. Уход на
дашборд и открытие оттуда другой страницы поднимает новый экземпляр со своим
счётчиком, и поздний ответ покойного проходил проверку собственного, уже
неактуального поколения и писал схему в чужую сессию (находка ревью, подтверждена
тестом). Закрыто инкрементом поколения в `onScopeDispose`: он гасит все открытия
умирающего экземпляра разом.

**Переименование сессии тоже могло обойти поколение.** `renameSession` меняет
`sessionPagename` и URL, но не поколение, а watcher маршрута после этого
сознательно пропускает новое открытие (route догнал `sessionPagename`) — значит
незавершённый bootstrap считался бы актуальным и применил бы прежнюю страницу под
новым ключом. Дверь закрыта со стороны `useBuilderPagenameSync`: `isSessionRenamable`
теперь требует ещё и готовности сессии (см. BM-25).

**Гашение лоадера и тост тоже под поколением.** `finally` снимал
`isSessionLoading` безусловно — поздний ответ вытесненного открытия открывал
канвас, пока актуальное ещё грузилось. `catch` безусловно показывал тост — ошибка
страницы, с которой пользователь уже ушёл, всплывала поверх той, что грузится
нормально.

**Тесты** (+5 кейсов, `test/builder/sessionOpening.spec.ts`): по одному на каждую
границу поколения, плюс два по находкам ревью — поздний ответ покинутой страницы
не пишет в сторы новой сессии (два экземпляра composables на одном Pinia — ровно
уход на дашборд и возврат) и переименование не переносит сессию, пока открытие не
завершено. Тайминговых ожиданий нет — в harness добавлен `createDeferredApi`:
реестр отложенных ответов `apiFetcher`, порядок ответов задаёт сам тест
(`pending` в порядке вызова + `waitFor(url)`). Кейсы: поздняя схема вытесненного
открытия не попадает на канвас (список прогрет, гонка только на point-lookup'е);
поздний список не переводит стор на прежнюю страницу (список отложен, схемы
отвечают сразу — вытесненное открытие доезжает до конца в обеих версиях, поэтому
кейс детерминированный, а не «висит по таймауту»); ошибка вытесненного открытия
не гасит лоадер, не поднимает блокирующий экран BM-23 и не доходит до тоста.

**Мутационная проверка тестов:** снятие проверки после `fetchPageRequest` — 1
падение, после `loadAllPages` — 1, снятие проверок в `catch`/`finally` — 1,
пустой `onScopeDispose` — 1, `isSessionRenamable` без готовности — 1; каждая
мутация роняет ровно свой кейс.

**Проверено вживую** (playground, Playwright, `page.route`): point-lookup схемы
`test` (59 компонентов) отвечает с задержкой 3 с, страница
`draft-1783169727751` (2 компонента) — сразу. Заход на `/bricks/test`, через
400 мс SPA-переход `router.push('/bricks/draft-1783169727751')` (роутер достаётся
из `document.getElementById('__nuxt').__vue_app__` — `window.$nuxt` в Nuxt 3 нет).
После прихода позднего ответа: URL и канвас согласованы — 2 компонента.
**Контрольный прогон** с убранной проверкой после `fetchPageRequest`: на том же
URL `/bricks/draft-1783169727751` канвас показывает 59 компонентов страницы
`test`, то есть сохранение уехало бы под чужой ключ — дефект воспроизведён.

**Ревью:** Codex (`gpt-5.6-sol`, high) 28 июля 2026, раунд 1. Точки проверки
внутри одного живого экземпляра признаны выбранными верно; три находки приняты и
закрыты выше (жизнь поколения дольше экземпляра, обход через `renameSession`,
неполнота оговорки про общий список). Ещё две — про операции, не привязанные к
своей сессии, — подтверждены по коду и вынесены в BM-26: правка их не касается.

### BM-25. Медленный Save as Copy больше не переименовывает сессию

**Выполнено 28 июля 2026 года.**

**Файлы:** `src/runtime/modules/builder/app/composables/useBuilderPagenameSync.ts`,
`test/builder/saveAsCopySession.spec.ts`.

Условие «сессию можно переносить по форме» вынесено в `isSessionRenamable()` —
`isSessionReady && editingPageId === null && !isSubmitting` — и проверяется
**дважды**: в watcher'е и внутри таймера. Плюс ранние выходы watcher'а теперь
снимают уже поставленный таймер: он планировался под прежнее состояние формы.
Слагаемое `isSessionReady` добавлено по находке ревью и закрывает соседнюю дыру
из BM-24: перенос в незавершённом открытии менял ключ сессии и URL, не трогая
поколение, после чего watcher маршрута новое открытие пропускал, а старый
bootstrap применял прежнюю страницу под новым ключом. Composable получает
готовность отдельной опцией (`IBuilderPagenameSyncOptions`).

`saveCurrentPageAsCopy` на время POST ставит `editingPageId = null` и pagename
копии в форму, и слаг копии на сервере ещё не занят — то есть все прежние
проверки перенос проходил. Порядок в сторе при этом безопасен для нового guard'а:
форма и `isSubmitting` меняются синхронно, до первого await, а watcher (flush
`pre`) выполняется уже после — `isSubmitting` он видит поднятым.

**Размен, принятый осознанно.** Если пользователь правит pagename новой страницы и
жмёт «Сохранить» внутри окна 600 мс, отложенный перенос теперь отбрасывается.
На успешном сохранении это ничего не меняет — `submitPageWithPublishState` зовёт
`renameSession(currentPagename)` сам. Прежнее поведение — перенос посреди записи —
хуже ровно тем, из-за чего пункт и заведён.

**Что происходит после упавшей записи** (уточнено ревью — прежняя формулировка
«URL остаётся от прежнего слага до следующей правки поля» неверна). Восстановление
формы в `finally` само меняет наблюдаемое значение pagename, причём `isSubmitting`
к этому моменту уже снят, — watcher ставит новый таймер и через 600 мс переносит
сессию на слаг из формы. Для новой страницы это правильный итог: URL догоняет
форму, как и при обычном наборе. Для существующей переноса нет вовсе
(`editingPageId` восстановлен). То есть отбрасывается не перенос, а его попытка
во время записи.

**Тесты** (+2 кейса, `test/builder/saveAsCopySession.spec.ts`, POST отложен через
`createDeferredApi` из BM-24): медленный POST (дольше 600 мс) с последующей
ошибкой не уводит URL, `sessionPagename` и ключ черновика со слага оригинала;
уже запланированный перенос (пользователь набрал pagename и не дождался debounce)
во время Save as Copy не срабатывает.

**Мутационная проверка тестов:** `isSessionRenamable` без `isSubmitting` — оба
кейса краснеют. Два других механизма **избыточны по отдельности**, и это
зафиксировано честно: снятие внутренней перепроверки при живом `clearPagenameTimer`
— набор зелёный, снятие `clearPagenameTimer` при живой перепроверке — тоже; вместе
роняют второй кейс. Для сценария «таймер уже стоял» достаточно любого из двух,
оставлены оба.

**Проверено вживую** (playground, Playwright): на существующей странице `test`
POST копии отложен на 1.5 с и отвечает 500. После ошибки URL остался
`/bricks/test`, поле pagename — `test`, черновиков в localStorage нет, канвас цел.
**Контрольный прогон** с `isSessionRenamable` без `isSubmitting`: тот же сценарий
оставляет URL на `/bricks/test-copy-1` — слаге страницы, которой в БД нет
(`SELECT pagename FROM bricks_pages` после прогонов: `test`,
`draft-1783169727751`, `test-copy`, `wwew` — копия не создавалась), а форма
откатилась на `test`. Ровно расхождение из формулировки пункта.

### BM-23. Отказ открытия сессии больше не выглядит рабочим редактором

**Выполнено 28 июля 2026 года.**

**Файлы:** `src/runtime/modules/builder/app/composables/useBuilderSession.ts`,
`src/runtime/modules/ui/base/modal/BricksModal.vue`,
`builder/app/components/TheBuilderSessionError.vue` (новый),
`builder/app/utils/sessionGuards.ts` (новый), `builder/app/pages/[pagename].vue`,
`builder/app/types/builder.d.ts`,
`builder/shell/toolbar/components/{TheBuilderShellToolbar.vue,types.d.ts}`,
`src/runtime/assets/scss/common/transitions.scss`, `src/runtime/locales/{ru,en}.json`,
`test/builder/{sessionOpening,sessionGuards,sessionRestoreModal}.spec.ts` (все три новые).

**Решение по UX (владелец, 28 июля 2026): блокирующий экран, не баннер.** Баннер
оставляет редактор интерактивным, то есть тихую потерю превращает в громкую, но не
устраняет. `sessionError` в `useBuilderSession` держит причину отказа;
`TheBuilderSessionError.vue` — заголовок, описание, техническая причина
(`[GET] "…/api/bricks/2/": 500 …`) и две кнопки: «Повторить»
(`retryBuilderSession` → `openBuilderSession(routePagename)`) и «Мои страницы».
Состояние снимается на входе в любое следующее открытие, в том числе на повтор.

**Экран перекрывает всю рабочую область, а не только канвас** (`position:
absolute; inset: 0` внутри `.content`, `z-index: 90` — выше сайдбаров (50) и
вертикальной навигации (60), ниже лоадера). Причина: правки настроек публикации в
сайдбаре автосейв отклоняет тем же `!isSessionReady`, что и правки канваса, —
оставить панель формы живой значило бы закрыть половину пункта. Плата — на время
экрана недоступны и переключатели темы с локалью в навигации.

**То же окно закрыто и на незавершённом открытии — щитом** (по находке ревью,
раунд 2). Экран ошибки живёт только при `sessionError`, а он снимается на входе в
любое открытие, включая «Повторить», — значит на обычной загрузке и во время
повтора рабочая область снова была интерактивной при `isSessionReady === false`.
Правка в этом окне пропадала молча, причём тремя разными способами: правка канваса
затиралась пришедшей схемой; правка формы при медленном point-lookup'е попадала в
`savedSnapshot` (он собирается из **текущего** состояния стора уже после запроса),
то есть считалась сохранённой — черновик не создавался, и reload её терял; при
медленном `loadAllPages` форму перезаписывал сам bootstrap. Поэтому рядом с экраном
рендерится `sessionShield` — полупрозрачный слой того же размера и z-index при
`!isSessionReady`. Лоадер защитой не был: он закрывает только канвас и прячется
через один цикл анимации (2.4 с) независимо от `isSessionLoading`.

**Мышь — не единственный вход, поэтому щита мало** (раунд 3 ревью). Оверлей не
мешает ни Tab'у, ни уже сфокусированному полю, ни глобальному `keydown` на
`window`, а undo/delete/paste правят канвас, который вот-вот затрёт пришедшая
схема. Закрыто тремя разными средствами, потому что вход каждый раз свой:
рабочая область (навигация, сайдбары, канвас) обёрнута в `.workspace` с
`:inert="!isSessionReady"` — это же убирает её из accessibility tree; глобальный
обработчик клавиш идёт через `handleGuardedKeyDown`; действия тулбара, который
лежит **вне** `.content` и щитом не накрыт, выключаются тем же признаком
готовности. Обёртка — обычный div со своей flex-раскладкой, сайдбары
`position: fixed` и от неё не зависят.

**Медиагалерея и превью тоже пишут, вопреки прежней оговорке** (находка ревью).
Серверной записи у них действительно нет, но выбор картинки уходит в
`socialImage` через ещё смонтированный publish-сайдбар (`useSidebarPublishForm`),
то есть теряется вместе с остальными правками до готовности, а превью показывает
гибрид старого канваса и новой формы. Обе кнопки тулбара теперь `disabled` по
`isSessionReady`; «Мои страницы» остаётся активной — это выход из ситуации.

**Зависший запрос больше не запирает редактор навсегда.** Ответ, который не
приходит и не падает, делал `catch`/`finally` недостижимыми: лоадер прятался сам,
и оставался полупрозрачный щит без объяснения и без выхода. `withBootstrapTimeout`
ограничивает открытие 30 секундами и уводит сессию в обычное состояние ошибки с
«Повторить». Брошенное по таймауту открытие гасится инкрементом поколения прямо в
`catch` — иначе поздний ответ лёг бы на канвас поверх экрана ошибки. Плата
зафиксирована честно: сам запрос не отменяется (`AbortSignal` пришлось бы тянуть
через весь слой `publishApi`), поэтому легитимный ответ после дедлайна будет
проигнорирован, а повторные попытки накапливают висящие запросы. Порог в 30 секунд
осмыслен только при backend SLA существенно ниже — если появится метрика, что
загрузка страницы бывает дольше, порог поднимать, а не убирать.

**Доступность экрана.** `role="alertdialog"` с `aria-labelledby`/`aria-describedby`
и перенос фокуса на «Повторить» при монтировании: фокус мог остаться в поле,
уехавшем под `inert`, — тогда клавиатура осталась бы вообще без цели.

**Что осталось за границей пункта — сознательно.** Модалки билдера (медиагалерея,
резолвер импорта, контекстное меню) телепортируются в `body` и лежат **вне**
`.workspace`, поэтому `inert` их не касается. Открытую на странице A галерею или
резолвер можно подтвердить уже на странице B — и `handleImportSchema` безусловно
зальёт схему A в канвас B (проверено по коду: продолжение после `await
startResolving` не сверяется ни с чем). Проверки текущей готовности тут
недостаточно: к моменту подтверждения новая сессия уже готова, — нужен захваченный
токен сессии, то есть решение BM-26. Полумеру «гасить модалки на открытии сессии»
не делали: она разнесла бы владение состоянием модалок между двумя composables
ровно перед тем, как BM-26 введёт токен.

**Сохранение заблокировано — сверх исходной формулировки пункта.** Пункт описывал
тихую потерю правок, но у отказа есть вариант хуже: если bootstrap упал на
`fetchPageRequest`, то `startEditingPage` уже прошёл — `editingPageId` выставлен,
форма заполнена из сводки, а канвас пуст. «Сохранить» в этом состоянии отправляет
PUT с пустой схемой и **затирает страницу в БД**.

**Блокировка идёт по `isSessionReady`, а не по факту отказа** (исправлено по
находке ревью). Первая версия гасила кнопку по `Boolean(sessionError)` и
закрывала только окно после окончательной ошибки. Но то же самое окно открыто на
**обычной** загрузке и на повторе: форма и `editingPageId` уже заполнены, схемы
ещё нет, ошибки ещё нет — и кнопка активна. Лоадер от этого не спасает: он
закрывает только канвас и прячется через один цикл анимации (2.4 с) независимо от
фактического `isSessionLoading`, так что медленная загрузка выглядит готовым
редактором. Готовность строго сильнее: при отказе она тоже `false`, поэтому
`sessionError` для блокировки больше не нужен. Проп тулбара — `isSessionReady`,
`BricksActionButton` получает `:disabled="!props.isSessionReady"`, и оба действия
сохранения идут через guard `runSaveWhenSessionReady` с тостом-объяснением: кнопка
— состояние UI, guard — само правило. Горячей клавиши сохранения в билдере нет
(проверено в `useBuilderShortcuts`), так что других путей вызова сейчас не
существует.

Оба правила живут не в шаблоне, а в `builder/app/utils/sessionGuards.ts` — решение
по находкам ревью, повторённым дважды: в composition root'е такое правило
проверяется только по тексту, а текстовый кейс остаётся зелёным и на потерянном
`return` в ветке отказа, и на подменённом условии. `runSaveWhenSessionReady`
возвращает признак «сохранение выполнено», `withSessionReadyGuard` оборачивает
обработчик события; оба проверяются поведением.

**Тост оставлен вместе с экраном.** Экран объясняет состояние, тост отмечает сам
факт неудачи — без него повторный отказ по кнопке «Повторить» выглядел бы как
«ничего не произошло». Точная механика (ревью поймало противоречие в прежней
формулировке «экран висит до успешной попытки»): на повторе `sessionError`
снимается сразу, экран уступает место щиту и лоадеру, и возвращается, только если
попытка снова упала. Непрерывно закрыта рабочая область, а не конкретный экран.

**Жизненный цикл `isSessionReady` пришлось расширить** (раунды 5-7 ревью). Смысл
прежний — «сессия согласована», — но точек подъёма теперь две: конец bootstrap'а и
ответ на модалку восстановления. Модалка уезжает leave-transition'ом и всё это время
принимала клики, тогда как новое открытие уже сбросило `isRestoreDraftModalOpen` и
`pendingDraft`: запоздалый «Восстановить» поднимал бы готовность уже другой —
грузящейся или упавшей — сессии (а `catch` её обратно не опускает), запоздалая
«Открыть сохранённую» вдобавок удаляла бы черновик **новой** страницы, потому что
ключ брала у живой сессии.

Закрыто на двух уровнях, и оба нужны.

**Уровень разметки — уезжающая модалка перестала быть активируемой.** Мало обнулить
состояние: `force-mount` держит `DialogContent` в DOM до конца leave-анимации, и её
кнопки всё это время работают. Указатель закрывает `pointer-events: none` на
`.bricks-modal-fade-leave-active` **и её потомков** — одной обёртки не хватает,
кнопки ставят себе `pointer-events: auto` (проверено живьём: до правки настоящий
клик мышью по координатам уехавшей кнопки доходил до обработчика). Клавиатуру и
assistive tech закрывает `inert`, который `BricksModal` ставит императивно в хуке
`@leave`: у уезжающего элемента биндинги шаблона уже не патчатся, поэтому
`:inert="!isOpen"` не сработал бы. Обе правки общие для всех модалок билдера.

**Уровень состояния — ответ привязан к своему открытию и одноразов.**
`restoreDraftGeneration` хранит поколение открытия, показавшего модалку; ответ
применяется только при актуальном поколении и обнуляет его. Ключ для удаления
черновика берётся у самого `pendingDraft`.

**Перенос сессии снимает предложение целиком.** Поколение тут не спасает:
`renameSession` зовут напрямую уже начатые save и Save as Copy, то есть
`sessionPagename` меняется без смены поколения, а `migrateBuilderDraft` к этому
моменту уже унёс запись под новый ключ — «Восстановить» применил бы снапшот прежней
страницы, «Открыть сохранённую» удалила бы пустой старый ключ. Watcher на
`sessionPagename` закрывает модалку, сбрасывает `pendingDraft` и объявляет сессию
согласованной, **сам ничего не удаляя и не применяя**. Оговорка (уточнено ревью):
это про watcher, а не про исход в целом — продолжение обоих save-flow
(`switchToSavedPage` и `submitPageWithPublishState`) снимает черновик после
`renameSession` уже своим `removeBuilderDraft`, и это правильно: изменения к тому
моменту сохранены. Межсессионный вариант того же перехода — в BM-26. Побочный дефект самой миграции — она перезаписывает
черновик страницы-цели, если он есть, — принадлежит BM-26.

`sessionError` с готовностью по-прежнему не связан — это разные вещи (запрет записи
против объяснения пользователю).

**Тесты** (17 кейсов BM-23: 3 в `test/builder/sessionOpening.spec.ts`, 9 в
`sessionGuards.spec.ts`, 5 в `sessionRestoreModal.spec.ts` — второй и третий файлы
появились, когда первый дважды перевалил за лимит oxlint в 500 строк; остальные
5 кейсов первого файла принадлежат BM-24). Базовые: отказ bootstrap'а
поднимает состояние с причиной внутри (`toContain('Network down')`), лоадер снят,
готовности нет; повторная попытка снимает состояние, поднимает готовность и
доводит схему до канваса (падает только первый запрос списка). Кейс BM-24 про
вытесненное открытие дополнен проверкой, что его ошибка блокирующий экран **не**
поднимает.

Остальные — по находкам ревью. Один поведенческий на таймаут: зависшее
открытие через 30 с уходит в состояние ошибки, лоадер снят, а доехавший позже ответ
ничего не применяет. Три поведенческих на утилиты `sessionGuards`
(отказ не зовёт сохранение и зовёт `onBlocked`; готовая сессия — наоборот; guard
клавиатуры не пускает событие в несогласованную сессию). Пять на проводку: без них
весь набор оставался зелёным на снятии экрана, щита или `inert` из шаблона,
`:disabled` с любой из трёх кнопок тулбара, подмене готовности в guard'е на
`() => true` и на удалении ARIA с переносом фокуса из экрана ошибки. Смонтировать SFC нечем (jsdom в наборе нет), поэтому проводка
сверяется **по тексту** обоих компонентов — тот же приём, что в
`test/module/bricksManifestAssetNamespace.spec.ts` для монтирования server asset.
Это guard от молчаливого расцепления, а не доказательство поведения: он краснеет на
удалении строки, но не заметит, например, сломанного `isSessionReady` за пределами
этих двух файлов. Ровно поэтому само правило и уехало в утилиту.

**Мутационная проверка тестов:** отказ от записи в `sessionError` — 2 падения;
снятие сброса `sessionError` на входе в открытие — 1; снятие `:disabled` с кнопки
сохранения — 1; потерянный `return` в ветке отказа guard'а — 1; снятый щит — 1;
снятый `inert` — 1; снятый `:disabled` с медиагалереи — 1; `isSessionReady: () => true`
в одном из guarded-обработчиков — 1; открытие без `withBootstrapTimeout` — 1;
отказ от гашения поколения после ошибки — 1; guard клавиатуры без проверки — 1;
снятый перенос фокуса — 1; подъём готовности при открытой модалке восстановления —
2; `handleDiscardDraft` без подъёма готовности — 1; guard, захвативший готовность
при создании, — 1; ответ модалки без привязки к поколению — 1; `handleRestoreDraft`
без `applySnapshot` — 1; `handleDiscardDraft` без `removeBuilderDraft` — 2; ответ без
обнуления поколения (теряется одноразовость) — 1; ключ discard'а у живой сессии
вместо черновика — 1; перенос сессии без отмены предложения — 1; снятый `inert` на
leave — 1; CSS без селектора потомков — 1. Кейс про гашение поколения сначала проходил на
мутации: цепочка брошенного открытия не успевала дойти до записи к моменту
проверки, пришлось дофлашивать микрозадачи — записано как напоминание, что
«зелёный» у асинхронного кейса стоит перепроверять мутацией всегда.

**Проверено вживую** (playground, Playwright, `page.route` на 500 для
`/api/bricks/2/`):

- заход на `/bricks/test` → экран с заголовком «Страница не загрузилась»,
  описанием, технической причиной и двумя кнопками; кнопка «Сохранить» в тулбаре
  `disabled`; канвас пуст; черновиков в localStorage нет. При этом в тулбаре стоит
  заголовок страницы («Smoke ingress») — то самое состояние «форма заполнена,
  канвас пуст», из-за которого сохранение и заблокировано;
- снятие перехвата → «Повторить» → экран исчез, канвас получил все 59 компонентов
  страницы, «Сохранить» снова активна;
- **сессия после повтора действительно готова, а не только выглядит так:** правка
  поля в настройках публикации уехала в черновик
  `bricks-builder:draft:test` (`mode: edit`, 59 компонентов в снапшоте) — то есть
  `isSessionReady` поднялся и автосейв работает. Черновик и правка формы убраны
  после проверки, в БД страница не менялась;
- в консоли только внесённые проверкой 500-е и 401 на `/api/bricks/auth/me` до
  логина; собственных ошибок нет;
- **окно медленной загрузки** (point-lookup задержан на 6 с, страница открывается
  штатно): пока лоадер виден — «Сохранить» `disabled`, канвас пуст, а в тулбаре уже
  стоит заголовок страницы; **после того как лоадер спрятался сам** (2.4 с) и схема
  всё ещё грузится — кнопка по-прежнему `disabled`; после прихода схемы — активна,
  59 компонентов. Контрольный прогон без `:disabled`: в том же окне кнопка активна,
  то есть PUT ушёл бы с пустым холстом. Сам разрушительный клик не выполнялся —
  проверять его пришлось бы на настоящей странице в БД.

- **окно незавершённого открытия** (тот же задержанный point-lookup, лоадер уже
  спрятался): щит присутствует, перекрывает всю область (1512×741) и перехватывает
  попадание в кнопку сайдбара — `elementFromPoint` по кнопке «Настройки»
  вертикальной навигации возвращает `sessionShield`. После прихода схемы щит
  исчезает, канвас получает 59 компонентов. Контрольный прогон без щита: тот же
  момент отдаёт по этой точке саму кнопку, то есть панель настроек была
  интерактивной и правка в неё уходила в пустоту;
- **клавиатура и тулбар в том же окне:** у `.workspace` стоит `inert`, два Tab'а
  подряд фокус внутрь рабочей области не заводят (уходит на кнопку тулбара), в
  тулбаре выключены медиагалерея, превью и сохранение, а «Мои страницы» активна.
  После загрузки `inert` снимается, выключенных кнопок не остаётся, канвас — 59
  компонентов; раскладка после появления обёртки не изменилась (снимок экрана);
- **зависший запрос** (перехват без ответа вовсе): на 10-й секунде щит и `inert` на
  месте, экрана нет; после 30-секундного таймаута появляется экран ошибки с
  `role="alertdialog"`, текстом «страница не отвечает», активной кнопкой
  «Повторить», на которую переведён фокус, — рабочая область остаётся закрытой.

**Ревью:** Codex (`gpt-5.6-sol`, high) 28-29 июля 2026, девять раундов; все находки
приняты и подтверждены на своей стороне по коду, мутационно и живой проверкой.

Раунд 1: блокировка сохранения переехала с факта отказа на готовность сессии (окно
обычной загрузки оставалось открытым), проводка BM-23 получила мутационное
покрытие.

Раунд 2: закрыто главное — блокировалось только сохранение, но не редактирование,
поэтому исходная беда пункта (тихая потеря правок) на обычной загрузке и на повторе
оставалась; добавлен щит. Правило сохранения вынесено в утилиту, потому что
текстовый кейс проходил на потерянном `return`. Три расхождения текста с кодом
исправлены: противоречие про «экран висит до успешной попытки», слишком сильная
формулировка BM-24 про «любую запись в сторы» и неверное описание поведения URL
после упавшего Save as Copy.

Раунд 9: блокеров нет — класс запоздалых ответов модалки признан закрытым целиком,
`inert` на leave проверен на совместимость с focus trap Reka (trap снимается при
закрытии, возврат фокуса — на размонтировании). По двум неблокирующим замечаниям
кейсы усилены: перенос сессии теперь сверяет ещё и что черновик **не применён** на
канвас (мутация «watcher применяет снапшот» роняет кейс), а CSS-проверка связывает
селектор и объявление одним блоком (мутация «объявление переехало в чужое правило»
роняет кейс). Формулировка про «черновик остаётся на диске» уточнена — см. выше.

Раунд 8: закрыт остаток того же класса — `pointer-events` не мешает клавиатуре и
assistive tech (добавлен `inert` на leave), а мой собственный кейс про rename
оказался обманчивым: `migrateBuilderDraft` уносил черновик под новый ключ, поэтому
проверка «чужая запись цела» смотрела на мигрированную. Кейс переписан на проверку
содержимого, а сам сценарий закрыт отменой предложения при переносе сессии.

Раунд 7: у той же модалки нашлась вторая половина гонки — привязка «к текущему
поколению» не различала ответ за **следующую** модалку, а обоснование живого ключа
в `handleDiscardDraft` оказалось неверным (`renameSession` зовут напрямую и save, и
Save as Copy). Добавлены `pointer-events: none` на уезжающую модалку с потомками,
ключ по `pendingDraft` и три кейса: одноразовость ответа, ключ своего черновика,
поведение при уже перенесённой сессии.

Раунд 6: у модалки восстановления нашлось продолжение — ответ на неё не был
привязан к своей сессии, и клик по уезжающей модалке (200 мс leave-transition)
поднимал готовность уже другой сессии, а «Открыть сохранённую» удаляла черновик
новой страницы. Ответ привязан к поколению; заодно модальные кейсы усилены —
прежние проходили на обработчиках без `applySnapshot` и без `removeBuilderDraft`.

Раунд 5: найден ещё один путь внутри одной сессии — модалка восстановления
черновика. `bootstrapSession` в этой ветке возвращался, готовность поднималась, и
глобальный Ctrl+V проходил guard, пока автосейв всё отклонял по
`isRestoreDraftModalOpen`: вставка терялась молча. Готовность больше не поднимается
при открытой модалке — её поднимают оба обработчика ответа. Там же исправлен кейс
guard'а: две разные обёртки не различали реализацию, читающую готовность один раз
при создании (в проде обёртка создаётся до загрузки — осталась бы выключенной
навсегда), теперь обёртка одна, а готовность меняется между вызовами.

Раунд 4: закрыт клавиатурный guard поведенческим тестом (текстовый кейс проходил
на снятой проверке), у экрана ошибки покрыты ARIA и фокус, убран абзац, ещё
утверждавший, что галерею и превью гасить не нужно. Главная находка раунда — уже
открытые модалки и портальные поверхности живут вне `inert` и переживают смену
сессии — принята и вынесена в BM-26: правильное лечение там же, токеном сессии.

Раунд 3: щит держал только мышь — добавлены `inert` на рабочую область и guard на
глобальный обработчик клавиш; тулбар лежит вне щита, и его медиагалерея с превью
оказались реальным путём правки — выключены по готовности (оговорка «их безопасно
оставить активными» была неверной); зависший запрос запирал редактор навсегда —
добавлен таймаут открытия; текстовый кейс проходил на подмене готовности в
guard'е — ужесточён счётом вхождений; поправлен комментарий про «безвредную»
запись общего списка.

**Итог по тройке BM-23/24/25:** `type-check`, `oxlint`, `stylelint`,
`prettier --check`, `deps:check`, `knip`, 762/762 теста, `npm run dev:build`,
бюджеты бандла (entry 111 KB, published 122 KB gzip) — зелёные.

### BM-26. Начатые операции привязаны к сессии, которая их начала

**Выполнено 29 июля 2026 года.**

**Файлы:** `builder/app/composables/useBuilderSessionToken.ts` (новый),
`builder/app/composables/{useBuilderSession,useBuilderPage,usePageThumbnail,usePreviewSync}.ts`,
`builder/app/pages/[pagename].vue`, `builder/app/types/composables.d.ts`,
`builder/media/components/TheBuilderMediaGalleryModal.vue`,
`builder/publish/stores/publish.ts`,
`builder/publish/utils/currentPageWrite.ts` (новый),
`builder/publish/utils/README.md`, `builder/app/composables/README.md`,
`builder/publish/utils/draftStorage.ts`, `builder/publish/utils/requestErrors.ts`, `builder/publish/types/publishStore.d.ts` (новый),
`test/builder/{draftStorageMigration,pagenameSession,saveAsCopySession,draftPersistence}.spec.ts`,
`test/publish/storeLoadAllPages.spec.ts` (новый), `test/publish/requestErrors.spec.ts`, `test/helpers/{builderSessionHarness.ts,types.d.ts}`.

BM-24 сериализовал **открытия** сессии, но записи, начатые в одной сессии и
завершившиеся в другой, оставались без привязки к инициатору. Общий корень: и
результат, и побочный эффект применялись к текущему состоянию общих сторов, а не к
тому, из которого запрос вышел.

**Ядро — токен сессии.** Поколение из BM-24 было локальным `let` внутри
`useBuilderSession`, а сверяться с ним нужно и за пределами файла. Оно вынесено в
`useBuilderSessionToken`: `capture()` на старте операции, `isCurrent(captured)`
перед записью, `invalidate()` на входе в открытие и в `onScopeDispose`. Счётчик
по-прежнему один на страницу — токен создаётся composition root'ом и передаётся
и владельцу инкрементов (`useBuilderSession`), и потребителям.

**Токен намеренно локален экземпляру, а не глобален (не Pinia, не модульный
синглтон).** Именно инкремент на dispose гасит операции покойного экземпляра —
урок BM-24; с per-instance объектом эта семантика бесплатна, а глобальное
состояние пришлось бы сбрасывать руками, в том числе между тестами. Реактивное
значение (`token`) отдельно от `capture()` — на него подписаны сбросы поверхностей,
переживающих сессию.

1. **Save as Copy поверх другой страницы.** `saveCurrentPageAsCopy` принимает
   `IPublishOperationOptions.isInitiatorCurrent` (по умолчанию «да» — дашборд и
   прямые вызовы сессии не имеют). Под проверкой **только** откат формы:
   `currentFormState`, `editingPageId`, `validationErrors`, `generalError`.
   `syncPageInList` и снятие `isSubmitting` безусловны — копия действительно
   создана, а флаг записи общий. Ту же опцию получил `publishCurrentPage`: его
   `generalError` — то же общее поле формы, и ошибка покинутой страницы попадала в
   сайдбар открытой (в исходной формулировке пункта этого не было, нашлось при
   разборе пункта 2).

    `handleSaveAsCopy` при вытеснении показывает тост об успехе — страница реально
    создана и уже в списке, — но `switchToSavedPage` и снимок превью пропускает.

2. **Поздний `lastSuccessfulSaveAt`.** Watcher удалён совсем. Вместо него
   `useBuilderSession` отдаёт `commitSavedSnapshot()` (снапшот + удаление черновика
   по актуальному ключу), и `submitPageWithPublishState` зовёт его явно, сверив
   токен. Тем же токеном закрыты `startEditingPage(result)`, `renameSession` и
   thumbnail. Побочно исчезло расхождение: `switchToSavedPage` фиксировал снапшот
   сам, потому что для него метка стора не менялась, — теперь обе точки записи
   зовут одну функцию.

    **Токен сверяет сама фиксация,** а не вызывающий: у обоих путей между проверкой
    и `commitSavedSnapshot` стоит `await renameSession` (внутри — `router.replace`),
    и перехваченная за это время навигация возвращала бы ровно исходный дефект —
    снапшот чужой страницы и удаление её черновика. Поэтому `commitSavedSnapshot`
    принимает токен обязательным параметром (находка ревью: первая редакция
    проверяла только до await'а).

3. **Список страниц.** Два независимых следствия, оба закрыты на стороне стора, без
   участия токена. `loadAllPages` больше не пишет `generalError` (каждый вызывающий
   обрабатывает отказ сам: дашборд — тостом, bootstrap сессии — блокирующим
   экраном, `toPageWriteError` — конфликтом ревизии, освежение после создания —
   предупреждением в консоль), и получил счётчик запросов:
   `publishedPages` пишет только последний стартовавший, иначе устаревший ответ
   заменял более свежий список, а с ним разъезжались point-lookup по pagename,
   проверка занятости слага и дашборд.

    Обесценивание — грубая семантика: отбрасывается весь ответ, а не только
    конфликтующие записи, поэтому список может остаться слегка устаревшим до
    следующей загрузки. Размен принят осознанно, но одно следствие пришлось закрыть
    отдельно: `publishPage` полагался на `loadAllPages` как на единственный способ
    узнать созданную страницу, и обесцененный GET оставлял её вне списка — дальше
    `startEditingPage` молча не находил id, `editingPageId` оставался `null`, и
    следующее сохранение уходило вторым созданием. Теперь `publishPage` кладёт
    ответ POST в список сам (раунд 2 ревью: guard породил эту дыру).

    Счётчик обесценивают и **локальные записи** в список (`syncPageInList`,
    удаление страницы) — иначе он упорядочивал только GET относительно GET, а
    ровесник-запись оставался незамеченным: GET, стартовавший до Save as Copy,
    возвращал список без только что созданной копии и с прежней revision, то есть
    страница пропадала из дашборда, а следующее сохранение падало ложным 409
    (находка ревью; первая редакция закрывала только половину случая).

4. **Thumbnail.** `usePageThumbnail` получил токен и сверяет его на **трёх**
   границах, ни одна из которых не дублирует другую: на входе — до первой мутации
   общего стора; после подготовительных await — до чтения живого DOM; **после
   `await domToBlob`** — до отправки результата. Последняя и есть решающая. `domToBlob` клонирует DOM не сразу: `createContext`
   сначала ждёт загрузку всех `img`/`video` канваса (`waitUntilLoad`,
   modern-screenshot 4.7 `index.mjs:452`), и только потом идёт `cloneNode`
   (`:1497`). Переход внутри этого окна означает, что снят уже канвас другой
   страницы, — такой кадр нельзя грузить под зафиксированный `pageId`.

    Первая редакция проверяла только перед съёмкой и утверждала, что дальше блоб
    уже принадлежит `pageId`; **это было неверно** и воспроизводилось живьём
    (находка ревью, подтверждена чтением исходников библиотеки и контрольным
    прогоном).

    **Токен приходит от вызывающего** обязательным параметром. Снятый на месте, он
    делал обе проверки пустыми, если саму съёмку запустили уже после смены сессии
    — ровно случай `handleSaveAsCopy`, который зовёт её после
    `await switchToSavedPage`, то есть после `router.replace`. «Старт операции» для
    съёмки — момент начала сохранения, а не момент её вызова (раунд 2 ревью).

    Первая сверка стоит **до любого действия**, а не только до съёмки: съёмка
    начинается с `deselectComponent`, а это запись в общий стор — сброс выделения,
    выключение interactive preview и скрытие панели свойств. Вытесненное сохранение
    успевало снять выделение на канвасе уже другой страницы, то есть ровно тот же
    класс дефекта (раунд 3 ревью).

5. **Live preview.** `usePreviewSync` сбрасывает `previewPagename` и отложенную
   отправку по смене токена (`flush: 'sync'` — до того, как открытие уйдёт в await).
   Превью-вкладка прежней страницы просто перестаёт обновляться; её
   `request-schema` дальше отсекается сравнением с pagename формы.

6. **Миграция черновика.** `migrateBuilderDraft` не перезаписывает занятый ключ:
   исходная запись остаётся на месте, в консоль — предупреждение.
   **Остаток осознан и оставлен:** автосейв сессии через ~800 мс всё равно займёт
   новый ключ. Но это уже обычное «сессия владеет своим ключом», а не тихая
   подмена во время rename; закрыть его полностью — значит уйти от ключа-по-pagename
   для несохранённых страниц, что крупнее пункта.

7. **Модалки и портальные поверхности.** Один watcher на токен в `useBuilderPage`
   (`flush: 'sync'`) гасит резолвер импорта, медиагалерею, media-запрос
   inline-редактора и само inline-редактирование. Последнее добавлено по коду:
   `loadSchema` сбрасывает только `selectedComponent`, а `componentId` и экземпляр
   редактора оставались от компонента, которого на новом канвасе нет; гасится через
   мост (`IInlineMediaBridge.cancelInlineEditing`), чтобы builder-ядро не
   импортировало editor.

    Одного сброса мало, и это не перестраховка: до показа модалки резолвер ждёт
    загрузку медиа-галереи, а если новых изображений в схеме нет — возвращает её
    вовсе без модалки. Гасить в этом окне нечего, поэтому `handleImportSchema`
    снимает токен до `startResolving` и сверяет перед `loadSchema`. У галереи
    симметрично: токен снимается при открытии и сверяется в `handleMediaSelect` —
    второй барьер к сбросу, как у модалки восстановления в BM-23.

    Контекстное меню канваса и inline-overlay отдельного гашения не требуют:
    телепорт живёт внутри canvas-item'а, и новая схема размонтирует их вместе с
    хостом (проверено по коду, прежняя формулировка пункта их перечисляла наравне с
    остальными).

    **Вложенные поверхности галереи.** Закрытие галереи не снимало подтверждение
    удаления медиа: `BricksConfirmModal` отрисован **вне** `BricksModal` галереи и
    висит по собственному `isDeleteConfirmOpen`, а watcher `visible` сбрасывал
    состояние только при открытии. Диалог оставался поверх приложения — в том числе
    поверх уже другой сессии. Теперь `visible → false` гасит и его, и `previewItem`
    лайтбокса (сам лайтбокс лежит внутри модалки и размонтируется, но его ref
    всплывал бы при следующем открытии). Находка ревью, принята частично: заявленной
    там независимости лайтбокса от `props.visible` в коде нет.

**Watcher'ы и effect scope.** `useBuilderPage` — async, и его единственный await
(`useComponentLibrary()`) стоял **в начале**. После await активный scope теряется
(`getCurrentScope()` → `undefined`, проверено отдельным прогоном на `effectScope`),
то есть `watch`, зарегистрированный ниже, не останавливается на unmount: каждый
повторный заход в билдер оставлял живое замыкание на мёртвые refs, и мутация
глобального стора дёргала обработчики всех прошлых экземпляров. Await переехал в
конец — вся синхронная проводка, включая оба watcher'а, теперь в scope страницы, а
`componentLibraryList` нужен только в `return`. Дефект был и до BM-26 (watcher
media-запроса), правка его тоже закрывает (находка ревью).

**Разделение publish-стора.** С опциями стор перевалил лимит `max-lines` (500).
Два «сессионных» write-действия вынесены в `publish/utils/currentPageWrite.ts` по
образцу `pageVersionRestore.ts` — узкий контракт стора, тестируется без Pinia. Это
не косметика ради лимита: `publishCurrentPage` и `saveCurrentPageAsCopy` — ровно та
пара, что несёт `IPublishOperationOptions`, остальной стор про сессии не знает.
Позже туда же уехал `publishPage` — с описанной ниже правкой раунда 3 стор снова
перевалил лимит. Стор — 478 строк. Контракт `ICurrentPageWriteStoreDeps` лежит в
`publish/types/publishStore.d.ts` — по правилу «типы только в файлах типов»
(соседний `pageVersionRestore.ts` объявляет свой контракт инлайном; это
пред­существующее нарушение, не трогали).

**Тесты** (+11 кейсов; набор намеренно узкий — по одному различающему на пункт, где
он дёшев): вытесненный Save as Copy не откатывает форму открытой страницы
(`saveAsCopySession`); поздний `lastSuccessfulSaveAt` не трогает черновик открытой
страницы и фиксация с токеном прежней сессии — no-op (`pagenameSession`; обе
страницы существующие — только в edit-режиме черновик сверяется с `savedSnapshot`,
то есть только там поздняя фиксация его и удаляла); устаревший ответ `loadAllPages`
не заменяет свежий список, локальная запись обесценивает летящий GET, созданная
страница попадает в список даже при обесцененном GET, отказ и зависание обновления
списка не задерживают создание, ошибка не пишет `generalError`
(`storeLoadAllPages`, новый); занятый ключ миграции не
перезаписывается (`draftStorageMigration`, новый). Два прежних кейса переведены с
записи `lastSuccessfulSaveAt` на явный `commitSavedSnapshot(token)`.

**Мутационная проверка тестов:** безусловный откат формы в `finally` — падает кейс
Save as Copy; снятие счётчика запросов, снятие обесценивания на `syncPageInList` и
возврат записи `generalError` в `loadAllPages` — по своему кейсу каждая; снятие
проверки занятого ключа — кейс миграции; возврат watch'а на `lastSuccessfulSaveAt`
— кейс позднего сохранения; снятие сверки токена внутри `commitSavedSnapshot` — кейс
фиксации; `publishPage` без синхронизации ответом POST — кейс созданной страницы; возврат
`loadAllPages` в общий `try` создания — кейс отказа обновления; возврат `await refreshPagesAfterPublish(store)` вместо
намеренно не ожидаемого вызова — кейс зависания создания; безусловное
`await refreshPages()` в `toPageWriteError` — кейс зависания конфликта. Каждая мутация роняет ровно свой кейс. Первая редакция кейса на пункт 2
мутацию **не ловила** (обе страницы были новыми, и watcher выходил по
`editingPageId === null`) — переписана на существующие страницы.

**Что тестами не покрыто** (проверено только вживую): оркестрация `useBuilderPage`
целиком, thumbnail и вложенные портальные поверхности — для них пришлось бы
поднимать `useBuilderPage` с библиотекой компонентов, модалками и DOM, что против
курса на сокращение набора.

**Проверено вживую** (playground, Playwright; запросы замедлялись подменой
`window.fetch`, переходы — SPA-навигацией через роутер), каждый пункт с
контрольным прогоном на снятой проверке:

- **Пункт 1.** POST копии со страницы `test` задержан на 4 с, за это время открыта
  `wwew`. После приземления: URL `/bricks/wwew`, `editingPageId` 8, форма `wwew`,
  копия `test-copy-1` в общем списке. **Контроль:** URL `/bricks/wwew`, но
  `editingPageId` 2 и форма `test` («Smoke ingress») — состояние покинутой страницы
  поверх открытой, следующее сохранение ушло бы PUT'ом в `test` с чужим канвасом.
- **Пункт 2.** PUT страницы `test` задержан на 6 с, за это время открыта `wwew` и
  там сделана правка (черновик записан). После приземления черновик `wwew` цел.
  **Контроль:** черновик открытой `wwew` удалён поздним сохранением `test`.
- **Пункт 4, внешний барьер.** Сохранение `draft-1783169727751` (2 компонента)
  задержано, переход на `test` (59). Запроса `s3-page-thumbnail` нет вовсе.
  **Контроль** (снят guard в `submitPageWithPublishState`): снимок канваса `test`
  ушёл под `pageId=3` — страницы, с которой пользователь уже ушёл (S3 ответил 400,
  до БД не дошло, но запрос сформирован именно так).
- **Пункт 4, проверка после съёмки.** Окно внутри `domToBlob` сделано явно: в
  канвас `test` добавлено cross-origin изображение, ответ `s3-proxy` (его дёргает
  `fetchFn` уже после `waitUntilLoad`, до готового блоба) задержан на 8 с, переход
  на `draft-1783169727751` — строго после того, как прокси-запрос зафиксирован. Оба
  прогона доходят до прокси и до перехода; `s3-page-thumbnail` не уходит.
  **Контроль** (снята проверка после `domToBlob`): тот же сценарий грузит снимок —
  кадр чужой страницы под `pageId=2`.
- **Пункт 5.** Синк поднят штатным `request-schema` от вкладки превью `test`; после
  перехода на `draft-1783169727751` правка её канваса не породила ни одного
  сообщения, запись превью в localStorage осталась `test` / 59 компонентов.
  **Контроль:** схема новой страницы уехала в канал под именем `test`, и запись
  превью подменена двумя компонентами чужой страницы.
- **Пункт 7.** Импорт JSON на `test` с задержкой загрузки медиа-галереи на 5 с,
  переход на `draft-1783169727751` внутри окна: её канвас цел (2 компонента).
  **Контроль:** импортированная схема легла на канвас другой страницы — 2
  компонента заменились одним `bm26-imported-block`.

**Зависший запрос — отдельный класс от упавшего.** Тот же дефект нашёлся и в
`toPageWriteError`: на конфликте ревизии он ждал обновления списка через
`refreshPages().catch(...)`, то есть гасил отказ, но не зависание. Прикладного
таймаута у запросов нет, поэтому неотвечающий GET не давал управлению вернуться —
и `finally`, снимающий общий `isSubmitting`, не отрабатывал: тулбар оставался
заблокирован и в той сессии, куда пользователь успел уйти. Открепить этот запрос,
как освежение после создания, нельзя — его ответ нужен по существу, чтобы повтор
ушёл со свежей revision. Поэтому здесь ограниченное ожидание (5 с): конфликт
показывается в любом случае, а запрос долетает и обновляет список позже. Размен:
конфликт может быть показан со старой revision, и немедленный повтор получит
второй 409 (раунд 5 ревью).

Это третье локальное лечение одного корня — у запросов нет политики таймаутов.
Общее решение вынесено в BM-27; после него здешний дедлайн станет
переопределением дефолта, а не самостоятельным механизмом.

**Хрупкие места, оставленные осознанно** (вывод раунда 4; не дефекты, а то, на чём
легко повторить уже случившиеся регрессии):

- `loadAllPages(): Promise<void>` разрешается одинаково и когда ответ применён, и
  когда он молча обесценен. Будущий вызывающий примет «промис завершился» за
  «список обновлён» — ровно эта неявность и породила две регрессии подряд. Явный
  результат (`applied | superseded`) не вводим, пока нет потребителя, которому он
  нужен, но именно здесь надо смотреть в первую очередь.
- Список имеет два источника истины — ответы записи и полный GET; инвариант
  «`syncPageInList` строго до запуска освежения» держится только кодом и
  комментарием.
- Токен — обычный `number`, и правило «снять до первого await верхнеуровневой
  операции» типами не выражено. Если сессионных операций станет заметно больше,
  осмысленнее объект операции (`beginOperation()` → `{ isCurrent() }`), чем
  передача чисел; ради текущих пяти вызывающих такой рефакторинг не оправдан.

**Ревью, раунд 5** (закрывающий): Codex (`gpt-5.6-sol`, high) 29 июля 2026, тот же
расширенный формат. Одна находка — соседний путь того же класса, что раунд 4:
зависшее обновление списка при конфликте ревизии. Принята вместе с предложенным
решением (ограниченное ожидание, а не открепление — ответ там нужен по существу);
предложенный идиом сверен с `.oxlintrc.json` до реализации. Плюс две неточности
документации. Правка раунда 4 перепроверена отдельно — гонок между откреплённым
GET и локальными записями, перекрёстного влияния тестов и проблем на SSR-пути не
обнаружено.

**Ревью, раунд 4:** Codex (`gpt-5.6-sol`, high) 29 июля 2026, впервые в формате
«находка + предлагаемая починка + радиус поражения + возможный регресс + тест».
Формат сменён потому, что две из четырёх находок раундов 2-3 были регрессиями от
правок, которыми закрывались находки предыдущего раунда. Одна находка (зависший
GET держит `isSubmitting`) принята вместе с предложенным решением; предложение
дополнительно проверено по коду — существующие спеки `storeCreatePage` и
`storeDuplicatePage` от `await` не зависят, а `revision` приходит в ответе POST,
так что список после открепления не деградирует. Три расхождения документации с
кодом исправлены. Правки раундов 1-3 перепроверены: новых межсессионных записей
нет.

**Ревью, раунд 3:** Codex (`gpt-5.6-sol`, high) 29 июля 2026. Две находки, обе
приняты: съёмка превью успевала снять выделение на чужом канвасе до сверки токена
(проверка поднята в самое начало), и отказ обновления списка после успешного POST
проваливал создание. Третья — устаревшее число строк стора в этом разделе —
исправлена. Правки раундов 1-2 перепроверены: нормальный Save as Copy токен не
теряет, `syncPageInList` двойной записи не создаёт, новых сессионных гонок в
фиксации снапшота, импорте схемы, синке превью и портальных сбросах нет.

**Ревью, раунд 2:** Codex (`gpt-5.6-sol`, high) 29 июля 2026, по итогам правок
раунда 1. Две находки, обе приняты и закрыты выше: `handleSaveAsCopy` запускал
съёмку превью уже с токеном чужой сессии (токен стал обязательным параметром
`captureAndUploadThumbnail`), и обесценивание списка лишало `publishPage`
единственного способа узнать созданную страницу. Вторая — регрессия, внесённая
правкой раунда 1; она же показывает, зачем второй раунд нужен. Третья находка —
неполный перечень файлов в этом разделе — исправлена. Остальные пять правок раунда
1 перепроверены и новых дефектов не дали. Раунд 2 отдельно подтвердил, что перенос
await в конец `useBuilderPage` не сломал SSR/Suspense-порядок и что сброс галереи
не ломает штатные сценарии.

**Ревью, раунд 1:** Codex (`gpt-5.6-sol`, high) 29 июля 2026. Шесть находок, пять приняты и
закрыты выше: проверка thumbnail после `domToBlob` (подтверждена чтением
`modern-screenshot` и контрольным прогоном), обесценивание летящего GET локальной
записью, сверка токена внутри `commitSavedSnapshot`, вложенные поверхности
галереи, watcher'ы вне scope из-за раннего await. Две поправки к находкам:
лайтбокс галереи всё же лежит внутри `BricksModal` и размонтируется сам (сброшен
только его ref), а `ICurrentPageWriteStoreDeps` переехал в `types/` — но соседний
`pageVersionRestore.ts` нарушает то же правило и оставлен как есть.

**Отклонено:** переименование `useBuilderSessionToken` → `useSessionToken` по
правилу «композаблы без `Builder`-цепочки». Правило иллюстрируется фичевыми
поддоменами (`useCanvasItemDrag`, `useSidebarPropertiesPanel`), а здесь
composition root, где вся папка держит цепочку (`useBuilderSession`,
`useBuilderPage`, `useBuilderPagename`, `useBuilderPagenameSync`,
`useBuilderDraftPersistence`). Токен — деталь `useBuilderSession`, и разрыв
именования с непосредственным владельцем хуже, чем формальное следование правилу.
Если решение будет пересмотрено — переименовывать надо всю папку, а не один файл.

`type-check`, `lint:check` (oxlint + stylelint + prettier + knip), `deps:check`,
774/774 теста, `npm run dev:build`, бюджеты бандла (entry 111 KB, published
122 KB gzip) — зелёные.

### BM-27. Политика таймаутов запросов; SSR-инертность закрыта дедлайнами

**Выполнено 29 июля 2026 года частично; остаток открыт.** Решение обсуждалось с
Codex (`gpt-5.6-sol`, high) до реализации, в расширенном формате «способ починки —
радиус — регресс — проверка».

**Статус уточнён 30 июля 2026 по итогам раунда 2 (см. в конце пункта).** Потолок
ожидания сначала оказался поставлен только на фазу заголовков ответа: зависшее
**тело** держало запрос вечно, то есть исходный дефект пункта был закрыт наполовину.
Этапы 1 и 2 плана раунда 2 выполнены 30 июля 2026 (отчёт в конце пункта): потолок
переведён на живой сигнал и накрывает обе фазы, поэтому «зависание закрыто» теперь
читается буквально. Найденную живой проверкой границу — браузер теряет причину
аборта на фазе чтения тела, и обрыв выглядел отменой — закрыли там же, отдельным
решением владельца: транспорт восстанавливает причину по сигналу. Этапы 3 и 4
выполнены 30 июля 2026 (отчёт в конце пункта): неудачный SSR-прогон библиотеки
компонентов и неполный прогон data sources больше не оседают в payload как
окончательный результат — оба помечаются и догоняются одним клиентским запросом.
Этапы 5–7 плана открыты.

**Решения владельца (29 июля 2026).** Объём пункта — транспорт и SSR; записи
ограничиваются потолком с честным текстом «исход неизвестен». Найденный по ходу
слой проглоченных отказов и отсутствие серверного лимита на SQL вынесены в BM-28
и BM-29: без них зависание закрыто, но отказ местами остаётся невидимым.

**1. Потолок по методу плюс override на вызове.** `common/constants/apiTimeouts.ts`
— чтение 10 с (величина трёх остальных клиентов проекта), запись 30 с; отдельно
`login`/`logout` 10 с (короткая запись, которой общие 30 с держали бы кнопку формы
втрое дольше нужного), `s3-proxy` 15 с (у ручки свой upstream-лимит 10 с, наверх
должна доезжать её ошибка, а не наш обрыв), thumbnail 60 с, media upload 300 с
(сервер принимает видео до 100 МБ — потолок здесь про медленный канал).
`common/utils/apiRequestPolicy.ts` держит единственный список read-методов: от него
зависят и потолок, и выбор текста, иначе две копии одного знания разъехались бы.
Незнакомый глагол считается записью. URL внутри политики не разбирается — это была
бы вторая копия знания о роутах; знание «сколько нормально длится эта операция»
живёт на вызове.

**2. `retry: 0` — обоснование не то, которое казалось.** Гипотеза «с `timeout`
оборванный GET уходит на повтор и потолок удваивается» **опровергнута замером**:
повтор действительно запускается (при аборте `responseCode` падает в 500, а 500
входит в `retryStatusCodes`), но уходит с уже оборванным сигналом и падает
мгновенно, не доходя до сети — 508 мс при `timeout: 500` и один хит на сервере.
Повторы убраны по другой причине: дефолт ofetch мгновенно повторяет 408/409/425/429/5xx
без backoff и без учёта `Retry-After`. Плата — единственный автоматический повтор
GET на transient 5xx теперь виден пользователю.

**3. Потолок не исчезает при чужом сигнале.** ofetch строит внутренний
timeout-abort только когда `signal` не передан (1.5.1,
`shared/ofetch.*.mjs:261`), поэтому `applyApiRequestTimeout` комбинирует сигнал
вызывающего с `AbortSignal.timeout` через `combineAbortSignals`. Утилита переехала
из `render/utils/` в `common/utils/`: `common` — нижний слой и импортировать
`render` не может, а нужна она теперь обоим доменам. `timeout: 0` опт-аутом не
считается — это тихий возврат исходного дефекта.

Отмена **не протягивается** через `apiFetcher` → `publishApi` → вызывающих:
поздние ответы уже отсекают `pagesRequestId` и токен сессии, то есть correctness
отмена не добавляет, а опция `signal?` во всех двенадцати запросах раздула бы
пункт без потребителя. Побочно проверено, что «переключение категорий медиа-галереи»
кандидатом не является — фильтрация там локальная, запроса нет.

**4. Обрыв записи не выдаётся за отказ.** `isRequestTimeoutError` обходит цепочку
`cause` (оба пути дают `name === 'TimeoutError'`: внутренний abort ofetch и
DOMException от `AbortSignal.timeout`). В `toRequestError` проверка стоит **первой**
— раньше ранних возвратов: сообщение `FetchError` содержит URL, то есть подстроку
«/api/», и ветка «отдать как есть» пропустила бы таймаут наружу с англоязычным
транспортным текстом. `RequestError` получил проброс `cause`, иначе обёртка
уничтожала бы классификацию у вызывающих. Тексты разведены по существу:
чтение — «повторите», запись — «сервер не подтвердил операцию вовремя: она могла
завершиться» (`bricks.common.readTimeout` / `writeTimeout`).

После таймаута записи список страниц освежается, но **без ожидания**: по списку
видно, применилась ли операция (для создания это ещё и проверка занятости слага —
иначе повтор упёрся бы в собственный слаг как в чужой), а ждать результата нельзя,
иначе сообщение об исходе отложится ещё на один потолок чтения. Автоповтора записи
нет: для настоящей гарантии нужен idempotency key, то есть расширение серверного
контракта.

**5. Bootstrap сессии говорит одним языком.** `openBuilderSession` распознаёт
таймаут и показывает `bricks.publish.session.errorTimeout` — тот же продуктовый
текст, что и просроченный bootstrap целиком (BM-23). Иначе один экран объяснял бы
неотвечающий сервер двумя разными фразами в зависимости от того, чей таймер
сработал: с потолком 10 с на запрос собственный 30-секундный дедлайн операции почти
всегда проигрывает.

**6. SSR: `timeout` там инертен, и это не лечится транспортом.** Относительные URL
на сервере уходят в `fetchNodeRequestHandler` (`nitropack/dist/runtime/internal/app.mjs:100-109`),
а в `node-mock-http` слова `signal` нет вовсе — ни `timeout` ofetch, ни
собственный `AbortController` операции такой запрос не оборвут. Обещание «с
таймаутом» в докстрингах `usePublicPageClient` и `useDataSourceClient` на SSR не
выполнялось; формулировки исправлены. Закрыто тремя слоями:

- `common/utils/promiseDeadline.ts` (`withPromiseDeadline`) вокруг обоих lookup'ов
  в `bricks-page-layout.global.ts`. Гонка обработчик не останавливает — только
  перестаёт его ждать;
- **таймаут больше не превращается в 404.** `normalizeBricksError` подставлял
  fallback-статус, а у таймаута `statusCode` нет — живой lookup отдавал бы 404,
  который закешируется у CDN и будет понят краулером как отсутствие страницы.
  Теперь 504; ошибка дедлайна помечена именем `TimeoutError`, поэтому её
  классифицирует тот же предикат, что и обрыв на клиенте;
- дедлайн внутри двух операций, которые блокируют SSR своим ожиданием. Обе
  сначала были сделаны внешним `useAsyncData({ timeout })` и обе переделаны по
  находкам ревью — механизм у Nuxt рабочий (handler оборачивается в
  `new Promise`, и внешний промис отклоняется по merged-сигналу независимо от
  того, уладился ли handler, `nuxt/dist/app/composables/asyncData.js:373-385`),
  но границу он ставит не там, где нужно:
    - `useRendererDataSources` — дедлайн переехал **внутрь** прогона
      (`withPromiseDeadline` вокруг выполнения запросов, своя ошибка
      `BricksDataSourceDeadlineError`, гасится только она). Внешний отклонял
      handler целиком, поэтому уже полученные props отбрасывались вместе с
      зависшими: `abortController` на SSR-относительном URL ничего не обрывает,
      значит прогон не мог вернуть частичный результат сам. Теперь ждать
      перестаёт сам прогон и возвращает то, что успело дойти;
    - `useComponentLibrary` — дедлайн накрывает **только запрос манифеста**
      (server-only). Внешний охватывал ещё и `Promise.all` импортов
      brick-модулей, то есть отдавал им остаток бюджета запроса: ответ ручки на
      9-й секунде оставлял импортам полторы, а при их превышении библиотека
      обнулялась целиком, вместе с `LAYOUT_COMPONENTS`. Зависший импорт этим
      дедлайном не ограничен — на такое нужен свой честно названный бюджет, и в
      объём BM-27 он не входит;
    - `BRICKS_SSR_DEADLINE_MARGIN_MS` в обоих местах — запас над внутренним
      механизмом операции: при совпадении значений аварийная граница срабатывала
      бы одновременно со штатной.

На SSR-записи гонка не навешивается: их исход неизвестен, а обработчик всё равно
продолжит работу.

**7. Отмена вызывающего не теряется и на `Request`-объекте.** ofetch не копирует
в опции ни метод `Request`, ни его `signal`, а сигнал из опций по правилам fetch
перекрывает сигнал самого запроса — поэтому политика читает `signal` с запроса
так же, как метод (находка ревью). Явный `options.signal` приоритетнее, включая
`null` как осознанный отказ от сигнала. Внутренние вызовы проекта строковые, так
что правка закрывает публичный край `apiFetcher`, а не наблюдаемый сценарий.

**8. Удаление страницы тоже сверяется со списком.** `deletePage` пробрасывал
таймаут напрямую, минуя политику неизвестного исхода: сервер мог успеть удалить
страницу, а дашборд продолжал её показывать, и повтор получал бы 404. Теперь
DELETE идёт через тот же `toPageWriteError`, что update/patch/restore (находка
ревью).

**Тесты** (+14 кейсов, 788 всего):

- `test/common/apiRequestPolicy.spec.ts` (9) — потолок по методу, чтение метода с
  `Request`-объекта, сохранность явного override и замена нулевого, комбинация
  сигналов в обе стороны (таймаут и отмена вызывающего различимы), сигнал с
  `Request`-объекта и приоритет явного `signal`, обход цепочки `cause` включая
  циклическую, и сквозной кейс: зависшее чтение через сам `useApiClient` обрывается
  на дефолтном потолке, а на транспорт уходит ровно одна попытка;
- `test/publish/requestErrors.spec.ts` — +3 кейса: разные тексты для записи и
  чтения, сохранность `cause` после обёртки, освежение списка без ожидания;
- `test/render/dataSources.spec.ts` — +1 кейс: зависший источник не отбирает у
  страницы props, которые успели дойти;
- `test/publish/storeLoadAllPages.spec.ts` — +1 кейс: обрыв удаления освежает
  список;
- `test/render/abortSignals.spec.ts` переехал в `test/common/` вместе с утилитой.

**Ловушка тестов (сохраняем на будущее).** `AbortSignal.timeout` заводит
внутренний таймер Node, который подмена таймеров vitest не перехватывает:
проматывание времени комбинированный сигнал не абортит. Внутренний таймаут самого
ofetch, наоборот, фейковыми таймерами управляется — на нём сквозной кейс и стоит.
Ветка комбинации проверяется малым реальным потолком через `vi.waitFor`.

**Мутационная проверка тестов** (тринадцать правок по одной, каждая роняет свой
кейс): потолок всегда «чтение» — 2 падения; метод с `Request` не читается — 1;
явный override перетирается — 2; сигналы не комбинируются — 1; `retry: 0` убран —
1; политика не применяется в `useApiClient` — 1; таймаут без своего текста — 2;
`cause` не пробрасывается — 1; освежение списка ожидается — 1; сигнал с `Request`
не читается — 1; дедлайн прогона data sources снят — 1; при дедлайне возвращается
пустой результат — 1; DELETE без reconciliation — 1.

**Проверено вживую** (playground, dev; временный Nitro-middleware имитировал
зависший backend — цели читались из файла на каждый запрос, чтобы менять их без
перезапуска; после проверки удалён):

- зависший live-lookup published-страницы: **504 ровно на 10,0 с** вместо
  бесконечного ожидания посетителя;
- зависшее чтение списка на дашборде: запрос в сети `net::ERR_ABORTED`, в консоли
  `RequestError: The server did not respond in time`, лоадер снят, тост дашборда
  показан — то есть отказ дошёл и по классу, и по тексту;
- зависшее сохранение страницы: `PUT /api/bricks/2/` — `net::ERR_ABORTED`, сразу
  за ним `GET /api/bricks/` 200 (то самое отпущенное освежение списка), в тосте и в
  сайдбаре — «сервер не подтвердил операцию вовремя», кнопка Save снова активна,
  то есть `isSubmitting` снят;
- **различающая проверка** (обе точки сняты, dev перезапущен — правки в
  `src/runtime/**` в SSR-бандл по HMR не подхватываются, ловушка BM-15): та же
  зависшая ручка держит live-страницу до предела `curl --max-time 35` (status 000,
  exit 28), а сохранение через 45 с не показывает ничего и оставляет кнопку Save
  заблокированной — исходный дефект пункта воспроизведён;
- побочно: сырой Nuxt-`$fetch` (политика его не касается) на той же ручке висел
  больше двух минут — подтверждение, что зависание имитировано, а не отказ.

**Проверено вживую после правок по ревью** (тот же инструмент; временный
brick-компонент с двумя data source, один из которых подвешивался, и
published-страница со ним в БД — всё удалено после проверки):

- зависший манифест компонентов: SSR редактора отдаёт 200 **на 12,04 с**
  (`read + margin`) с отрендеренным канвасом — вместо бесконечного ожидания;
- зависший второй data source: published-страница отдаёт 200 **на 17,03 с**
  (`totalDeadline + margin`), причём проп успевшего источника в HTML **есть**
  (`FAST=<hash>`), а зависший упал на свой дефолт (`STUCK=STATUS:MISSING`); в логе
  подряд «Total deadline exceeded» и «Run abandoned after deadline — returning
  partial props»;
- **различающая проверка того же места:** если прогон снова отклоняется целиком
  (поведение до правки), в HTML пропадают **оба** пропа (`FAST=HASH:MISSING`) при
  том же времени ответа — то есть находка ревью подтверждена не только тестом;
- контроль: при отвечающих источниках оба пропа на месте, published-страница
  рендерится за 0,2 с.

`type-check`, `lint:check` (oxlint + stylelint + `deps:check` + `knip`),
`prettier --check`, 785/785 тестов, `npm run dev:build`, бюджеты бандла
(entry 112 KB, published 123 KB gzip) — зелёные. Рост на 1 KB в обоих бюджетах —
политика, константы и утилита дедлайна.

**Ревью, раунд 1:** Codex (`gpt-5.6-sol`, high) 29 июля 2026, расширенный формат (по каждой
находке — способ починки, радиус, регресс, проверка). Blocker'ов нет; незнакомые
методы как записи, значения override'ов, `retry: 0` и переход live-таймаута с 404
на 504 подтверждены. Четыре находки приняты и закрыты — все четыре выше по тексту:
дедлайн data sources переехал внутрь прогона (внешний отбрасывал уже полученные
props), дедлайн библиотеки сузился до запроса манифеста (внешний отдавал импортам
brick-модулей остаток бюджета запроса и обнулял библиотеку целиком), политика читает
`signal` с `Request`-объекта, DELETE пошёл через reconciliation. По первой находке
уточнение: запас над внутренним механизмом штатную деградацию **сохраняет** — но
только там, где abort работает (клиент, абсолютные URL); для SSR-относительного
вызова, где сигнал никто не слушает, прогон вообще не мог вернуться сам, и именно
это исправлено. Формулировка в тексте пункта была шире факта и переписана.

**Ревью, раунд 2** (30 июля 2026, отложенный раунд прогнан). Два независимых
прохода: Claude (`opus-5`) по коммитам целиком и Codex (`gpt-5.6-sol`, high, 9
минут) свободным ревью — Codex намеренно не получал список находок Claude, чтобы
совпадения означали подтверждение, а не эхо. Каждая находка Codex перепроверена по
коду на своей стороне; две уточнены, ни одна не отклонена целиком.

**Главная находка (Codex): потолок ожидания не покрывает зависшее тело ответа.**
`applyApiRequestTimeout` (`common/utils/apiRequestPolicy.ts:147-159`) ставит
отдельный `AbortSignal.timeout` только внутри `if (callerSignal)`; в остальных
случаях остаётся `options.timeout`, а его таймер ofetch снимает в `finally` вокруг
одного лишь `await fetch(...)` (`ofetch.CWycOUEr.mjs:287-291`) — тело же читается
позже, `await response.text()` на строке 300. `fetch` разрешается по заголовкам,
поэтому backend, отдавший статус и зависший посреди JSON, снова держит промис вечно
вместе с `isSubmitting`, `isUploading` и недостижимым `finally` — ровно тот дефект,
ради которого пункт делался. Тем же изъяном страдают все числовые override'ы (login,
s3-proxy, thumbnail, media upload) и оба публичных клиента
(`usePublicPageClient.ts:73-79`, `useDataSourceClient.ts:66-72`), где задан только
`timeout`; у data sources фаза тела покрыта побочно — прогон всегда передаёт общий
сигнал, и потолок оформляется комбинацией (`useBricksDataSources.ts:227-229`).

Замер (`retry: 0`; стаб `fetch` отдаёт `Response` с `ReadableStream`, который
кладёт в поток начало JSON, никогда не закрывается, а по `abort` переходит в
`controller.error(signal.reason)`): с одним `timeout: 400` запрос **не завершился за
2500 мс**, с `timeout: 400 + AbortSignal.timeout(400)` — отклонён на 401 мс с
`TimeoutError` в `cause`. Второе и означает, что классификация обрыва после правки
сохранится. Почему это пропустила живая проверка 29 июля: временный Nitro-middleware
имитировал зависание **до** ответа, то есть до заголовков, и обе фазы выглядели
одной. Отсюда правило на будущее: имитация зависшего backend'а обязана иметь
второй режим — «заголовки отданы, тело не досылается».

**Что сверено по исходникам зависимостей** (обоснования пункта подтвердились, кроме
разобранного выше): `onRequest` в ofetch вызывается до построения внутреннего
timeout-abort, поэтому мутация опций в хуке работает; `resolveFetchOptions` не
копирует в опции ни метод, ни `signal` из `Request`-объекта — то есть чтение того и
другого с запроса обосновано; `useAsyncData` промис не отклоняет — ошибка handler'а
уходит в `error`/`payload._errors` (`nuxt/dist/app/composables/asyncData.js:419-421`),
поэтому редактор при зависшем манифесте открывается, а не падает в 500.

**Остальные находки Codex** (проверены, приняты с уточнениями):

- освежение списка после оборванной записи запускается немедленно
  (`requestErrors.ts:148-153`, `currentPageWrite.ts:85-95` и `:213-219`), поэтому GET
  способен обогнать ещё не завершённый серверный handler и вернуть прежний список;
  повторной сверки нет. Значит формулировка «по списку видно, применилась ли
  операция» (`currentPageWrite.ts:58-62`, `requestErrors.ts:171-179`) обещает больше,
  чем даёт код. Уточнение к находке: «останется в дашборде до ручной перезагрузки» —
  не вполне так, дашборд освежает список сам (`publish/pages/index.vue:128-137`,
  вызов из `onMounted` на `:448`), устаревшим он остаётся, только пока дашборд уже
  открыт;
- новые тексты про неизвестный исход применены лишь к publish API: они живут
  внутри `toRequestError` (`builder/publish/utils/requestErrors.ts:244-268`), а
  остальные запросы того же `useApiClient` идут мимо. `removeItem`
  (`media/stores/media.ts:145-157`) пробрасывает сырую ошибку, и модалка галереи
  (`TheBuilderMediaGalleryModal.vue:173-186`) через `getBricksErrorMessage`
  (`common/utils/main.ts:137-145`, отдаёт `error.message`) покажет транспортное
  `[DELETE] "/api/…" <no response>` вместо честного «сервер не подтвердил операцию»;
  список медиа при этом не освежается. Рядом того же класса — `loadItems`
  (`media.ts:65`) и `useMediaUpload`, но их видимость отказов уже расписана в BM-28;
- документация дедлайнов разъехалась с кодом в двух местах, которых Claude не
  заметил: `apiTimeouts.ts:57-68` (докстринг `BRICKS_SSR_DEADLINE_MARGIN_MS`) и
  `useDataSourceClient.ts:29-34` всё ещё обещают внешний `useAsyncData({ timeout })`,
  хотя оба дедлайна переехали в `withPromiseDeadline`;
- `as unknown as` в новом сквозном тесте (`test/common/apiRequestPolicy.spec.ts:172`)
  формально нарушает запрет из `.claude/rules/typescript.md`. Уточнение: это не
  новшество коммита — в тестах проекта таких приведений 16 в десятке файлов, то
  есть вопрос об области действия правила, а не дефект правки;
- заголовки обоих коммитов содержат идентификатор спринта, который то же правило
  запрещает в сообщениях коммитов.

**Находки Claude, которых Codex не назвал:**

- зависший манифест обнуляет библиотеку компонентов **целиком, вместе с
  `LAYOUT_COMPONENTS`**, и повтора на клиенте не будет: handler отклоняется
  (`useComponentLibrary.ts:48-65` бросает, `:82-146` не перехватывает) → ошибка
  ложится в `payload._errors` → при гидрации Nuxt пропускает initial fetch, если
  ошибка есть (`nuxt/dist/app/composables/asyncData.js:114-118`), а
  `componentLibraryList` (`:148-150`) остаётся пустым. Сайдбар редактора остаётся
  пустым до полной перезагрузки, а перезагрузка снова уйдёт в SSR и снова прождёт
  12 с. Именно этот исход сужение дедлайна декларировало как недопустимый — устранён
  он только для медленных импортов, а на главном сценарии (ручка не отвечает)
  сохранился; layout-блоки при этом вообще не требуют сети;
- частичный результат прогона data sources закрепляется в payload как полный: при
  дедлайне handler **резолвится** (`useRendererDataSources.ts:253-276` гасит свою
  ошибку и возвращает накопленное), поэтому клиент данные видит и не
  перезапрашивает, и зависший источник остаётся на fallback props до перезагрузки, а
  ответ уходит как 200 без признака неполноты (в том числе в CDN-кеш). Регрессом это
  не является — до правки отклонённый handler давал ошибку, при которой клиент тоже
  не повторяет запрос, — то есть вопрос из списка раунда 2 закрыт ответом
  «закрепляется, но прежнее поведение было хуже»;
- знание о потолке чтения разъехалось на две константы:
  `PUBLIC_PAGE_REQUEST_TIMEOUT_MS` (`usePublicPageClient.ts:17`) держит своё
  значение, а внешний дедлайн вокруг того же вызова в middleware берёт
  `BRICKS_API_READ_TIMEOUT_MS` (`bricks-page-layout.global.ts:41-48`). Поднять
  клиентский потолок — и дедлайн начнёт обрезать клиентский путь раньше транспорта,
  превращая реальную ошибку сервера в 504. Там же единственное место, где внешний
  дедлайн поставлен без `BRICKS_SSR_DEADLINE_MARGIN_MS`, хотя докстринг константы
  объявляет запас обязательным;
- `usePageThumbnail.ts:80-84`: «без него зависший ресурс не давал бы `domToBlob`
  уладиться вовсе» — после введения дефолта потолок был бы 30 с, а не бесконечность;
  override сокращает 30 → 15 с, а не создаёт потолок;
- `applyApiRequestTimeout` зовёт `AbortSignal.timeout` безусловно
  (`apiRequestPolicy.ts:158`): при отсутствии этого API любой запрос с чужим сигналом
  упадёт `TypeError`'ом до отправки — при том что для самого сигнала в файле сделана
  структурная проверка на чужой realm (`:99-107`);
- вне объёма пункта: остаточные ссылки на идентификаторы прошлых спринтов в
  `scripts/`, `migrations/`, `src/cli/` — 16 мест, чистка `4a0ce4d` их не тронула.

**Что из списка вопросов раунда 2 закрыто проверкой и чем:** гашение только своей
ошибки прогона — имя `BricksDataSourceDeadlineError` уникально и с `TimeoutError`
не пересекается; поздние ответы зависших запросов безвредны — наружу отдаётся
копия (`new Map` + `toSafeRecord`), а реджекты остаются обслуженными, потому что
`Promise.race` подписан на прогон, то есть unhandled rejection на SSR нет;
`refresh` заводит новый контроллер и таймер, старый снимается в `finally`;
дедупликация `useAsyncData` по ключу `bricks-components` от снятия внешнего
`timeout` не пострадала — в `_hash` входят handler/transform/pick/getCachedData, а
не опции таймаута; `resolveApiRequestSignal` на URL-объекте даёт потолок чтения без
сигнала, уже аборченный сигнал `Request` абортит комбинированный сразу в обеих
ветках `combineAbortSignals`, а повторное применение политики к тем же опциям
неактуально — `retry: 0` стоит в дефолтах инстанса, и ретрай ofetch уходит через
`$fetchRaw` с уменьшенным счётчиком; `deletePage` через `toPageWriteError` лишнего
преобразования не делает, а ветка конфликта ревизии для DELETE недостижима —
серверный обработчик 409 не отдаёт.

**План работ (составлен 30 июля 2026).** Порядок отражает приоритет. Этапы 1 и 2
выполнены 30 июля 2026 — отчёт ниже, под списком; этапы 3 и 4 выполнены там же
одной правкой (механизм общий); этапы 5–7 открыты.

1. **P0. Потолок на обе фазы ответа.** `applyApiRequestTimeout`
   (`apiRequestPolicy.ts:147-159`) ставит `AbortSignal.timeout(timeoutMs)` **всегда**,
   комбинируя с сигналом вызывающего, когда тот есть; тогда внутренний механизм
   ofetch не включается вовсе (он строится только при отсутствии `signal`) и потолок
   накрывает и заголовки, и тело. `options.timeout` при этом оставить: он остаётся
   декларацией намерения в опциях, но реальную границу держит сигнал — это и надо
   написать в докстринге вместо нынешнего объяснения. То же — `usePublicPageClient`,
   `useDataSourceClient`, проверить серверный
   `persistence/server/http/httpClient.ts`. Классификация не ломается: при аборте на
   чтении тела `cause` остаётся `TimeoutError` (см. замер выше), поэтому тексты и
   reconciliation продолжают работать. Тесты: сквозной кейс
   (`test/common/apiRequestPolicy.spec.ts:183`) стоит на фейковых таймерах и на
   внутреннем таймере ofetch — после правки он теряет предмет, переписать на малый
   реальный потолок через `vi.waitFor` (ловушка с `AbortSignal.timeout` и подменой
   таймеров описана выше в пункте); добавить кейс «заголовки пришли, тело зависло» по
   схеме замера. Живую проверку повторить с имитацией, зависающей после заголовков.
2. **P1. Честные обоснования.** Шесть мест, где комментарий противоречит коду:
   `apiTimeouts.ts:57-68`, `useDataSourceClient.ts:29-34`, `currentPageWrite.ts:58-62`,
   `requestErrors.ts:110-113`, `usePageThumbnail.ts:80-84` и докстринг
   `applyApiRequestTimeout` из пункта 1. Там же переформулировать обещание
   отпущенного освежения на то, чем оно является: шанс увидеть исход, не гарантия.
   Второй отложенный refresh не вводить — это гадание о времени чужого коммита;
   настоящее решение (idempotency key) уже за объёмом пункта. Ориентир, как надо:
   тот же комментарий в `test/publish/storeLoadAllPages.spec.ts:151` уже обновлён
   правильно — «`await` держал бы `isSubmitting` поднятым до его собственного
   потолка».
3. **P1. Деградация вместо обнуления библиотеки.** При срабатывании SSR-дедлайна
   манифеста возвращать `{ hash: '', items: [...LAYOUT_COMPONENTS] }` и помечать
   прогон неполным в `IComponentLibraryData`
   (`builder/app/types/composables.d.ts:120-129`, рядом с `hash`); на клиенте по этому
   маркеру — один `refresh()`. Без маркера деградированный результат осядет в payload
   намертво. Повтор держать внутри composable, не расширяя
   `IUseComponentLibraryReturn`: тогда потребители (`useBuilderPage.ts:436`,
   `[pagename].vue:329`) не меняются вовсе. Восстановить и кейс на это — файл
   `test/builder/componentLibraryData.spec.ts` в рабочем дереве владельца удалён,
   проверить его судьбу перед правкой.
4. **P2. Частичный прогон data sources не выдаёт себя за полный.** Тот же маркер
   неполноты и одиночный клиентский повтор — делать одной правкой с пунктом 3,
   механизм общий. Кейс пристроить к существующему
   (`test/render/dataSources.spec.ts:307`, «зависший источник не отбирает у страницы
   уже полученные props»).
5. **P2. Тексты неизвестного исхода вне publish API.** Классификацию и оба текста
   вынести в `common` (сейчас доступны только через `toRequestError` в
   `builder/publish/utils/requestErrors.ts`), медиатеку провести через них. Видимость
   отказов медиа как таковую оставить в BM-28, где она уже описана; здесь — только
   подмена текста при неизвестном исходе.
6. **P3. Единый источник знания о потолке чтения.** Свести
   `PUBLIC_PAGE_REQUEST_TIMEOUT_MS` к `BRICKS_API_READ_TIMEOUT_MS` — всего два
   употребления (`usePublicPageClient.ts:17` и `:75`) плюс
   `test/render/publicPageClient.spec.ts:47` — и решить судьбу отсутствующего запаса
   в middleware (`bricks-page-layout.global.ts:42`).
7. **Решения владельца, не правки.** Распространять ли запрет `as unknown as` на
   тесты (16 мест — отдельная зачистка); переписывать ли заголовки коммитов
   `260416a`/`4a0ce4d`, где остался идентификатор спринта (история локальная);
   чистить ли остаточные идентификаторы в `scripts/`, `migrations/`, `src/cli/`.

После этапа 1 нужен ещё один раунд ревью: транспорт — самое опасное место пункта, а
правка там будет новым непроверенным кодом, то есть ровно тем классом, который в
BM-26 и здесь уже дважды давал регрессии.

Состояние проверок на момент составления плана: `npm test` (788/788),
`type-check`, `deps:check` и `prettier --check` зелёные, но прогнаны по чистому
HEAD — до появления параллельных незакоммиченных работ владельца (e2e/Playwright,
`vitest.config.ts`, часть тестов). Перед этапом 1 прогон повторить: база под ним
уже другая.

---

#### Этапы 1 и 2 выполнены (30 июля 2026)

База под правкой действительно оказалась другой: до правки 707 тестов в 95 файлах
вместо ожидавшихся 788 (часть спеков ушла в e2e), после — 717 в 96;
`test/builder/componentLibraryData.spec.ts` удалён — судьба его восстановления
остаётся вопросом этапа 3.

**Стратегия согласована с Codex до реализации** (`gpt-5.6-sol`, high, расширенный
формат). Приняты: сигнал всегда, `options.timeout` как эффективное значение,
`null`-семантика, перенос потолка data sources в клиент, документирование
ограничения повторов вместо скрытого состояния в опциях, схема теста на стабе
`fetch` вместо реального сервера. Он же назвал четыре места, которых не было в
плане: неверное «таким же дедлайном ограничен bootstrap» (фактически 30 с против
5 с), устаревшие описания в `common/utils/README.md` и шапке `abortSignals.ts`,
описание `signal` в `apiRequest.d.ts`, и — главное — отсутствие валидации
`bricks.dataSources.timeoutMs`. Все четыре подтверждены по коду и закрыты.

**Что сделано.**

1. **Потолок ставится живым сигналом всегда** (`applyApiRequestTimeout`), при чужом
   сигнале — комбинацией. Тогда внутренний механизм ofetch не включается вовсе, и
   граница накрывает обе фазы. `options.timeout` заполняется эффективным значением
   политики — читаемая декларация бюджета, но границу держит сигнал.
2. **`createTimeoutSignal` — в `common/utils/abortSignals.ts`**, рядом с
   `combineAbortSignals`: там уже живёт знание об устройстве сигналов и такой же
   feature-detect с fallback'ом. Fallback на своём контроллере закрывает и находку
   прошлого раунда — безусловный вызов `AbortSignal.timeout` ронял бы запрос
   `TypeError`'ом в окружении без этого API. Таймер fallback'а `unref()`-ится:
   иначе держал бы процесс Node живым до конца потолка.
3. **Мусорные значения нормализуются.** Замер: `AbortSignal.timeout` бросает
   синхронный `RangeError` на нецелом, `Infinity`, отрицательном и большем 2^31−1,
   а `setTimeout` те же значения принимает молча (обрезая большие до 1 мс). Так как
   `bricks.dataSources.timeoutMs` приходит из конфигурации без валидации,
   расхождение платформ недопустимо: `toTimerDelayMs` приводит значение к целому в
   допустимом диапазоне, а неинтерпретируемое — к максимальной задержке
   («фактически без потолка» лучше отказа всех запросов подряд). Политика при этом
   отвергает `Infinity`/`NaN` в override'е и падает на дефолт по методу.
4. **`signal: null` больше не отменяет потолок** — только отказ наследовать сигнал
   с `Request`-объекта; по той же логике, по которой опт-аутом не считается
   `timeout: 0`. Тест, фиксировавший сохранность `null`, переписан.
5. **Политику применяют все три транспорта**: клиент билдера и оба публичных
   клиента рендера через `onRequest`. Дефолты билдера туда не всплывают — у обоих
   `timeout` в опциях инстанса задан, а явный override политика уважает.
6. **Per-request потолок data sources переехал в клиент.** Раньше он собирался в
   прогоне (`useBricksDataSources.fetchDataSource`), поэтому фаза тела была покрыта
   лишь побочно — через то, что прогон всегда передаёт сигнал. Теперь знание о
   потолке одно, покрытие не зависит от вызывающего, а `timeoutMs` из возврата
   клиента убран. Кейс «per-request потолок при shared signal» переехал на уровень
   клиента (`test/render/dataSourceClient.spec.ts`), в спеке прогона остался кейс
   «сигнал прогона уходит в клиент как есть».
7. **Серверный `httpClient.ts` не менялся**: замер показал, что сигнал, переданный
   в голый `fetch`, обрывает и чтение тела — там потолок уже полный.
8. **Ограничение повторов задокументировано** в шапке политики: она рассчитана на
   `retry: 0` (стоит у всех трёх инстансов), потому что вторая попытка ушла бы с
   уже сработавшим сигналом и упала мгновенно. Маркер обработанных опций не
   вводился — он сохранил бы аборченный сигнал, а честное решение требует сначала
   выбрать, чей это бюджет: попытки или всего логического запроса.
9. **Этап 2** закрыл шесть мест плюс четыре из ревью. Убраны два прямо ложных
   утверждения «у запросов нет прикладного таймаута (`useApiClient` не задаёт ни
   `timeout`, ни `AbortSignal`)»: потолок есть, но ждать его в этих местах нельзя,
   потому что `isSubmitting` общий. Обещание отпущенного освежения списка ослаблено
   до того, чем оно является: единственная попытка увидеть исход, а не
   доказательство — GET уходит немедленно и может обогнать ещё работающий
   серверный handler. У `PAGE_CONFLICT_REFRESH_TIMEOUT_MS` описание «таким же
   дедлайном ограничен bootstrap» заменено на факт: это UX-дедлайн, намеренно
   вдвое короче потолка чтения. У s3-proxy override описан как сокращение 30 → 15 с
   (а не создание потолка) вместе с новым разменом: 15 с теперь накрывают и
   передачу base64 в ответе, поэтому крупный ресурс на медленном канале выпадет из
   снапшота — съёмка превью best-effort, потолок важнее полноты.

**Найдено живой проверкой: план ошибался про классификацию.** Пункт 1 плана
утверждал, что классификация не пострадает, потому что при аборте на чтении тела
`cause` остаётся `TimeoutError`. Это верно для Node, но **не для браузера**: Chrome
при аборте во время чтения тела подменяет ошибку на `AbortError` («The user aborted
a request», code 20) независимо от того, чем абортировали — проверено и нативным
`AbortSignal.timeout`, и своим контроллером с `reason`, у которого
`name === 'TimeoutError'`; результат одинаковый. На фазе заголовков Chrome, наоборот,
отдаёт `reason` как есть (`DOMException/TimeoutError: signal timed out` и
`Error/TimeoutError: свой таймаут`), поэтому классификация там сохранена и живой
текст неответа сервера дошёл. Node (undici) сохраняет `reason` на обеих фазах.

Следствие: зависание закрыто на всех путях, но в браузере обрыв именно на фазе тела
распознаётся как отмена, а не как таймаут, — значит на этом пути не включаются
честный текст неизвестного исхода для записи и сверка списка после оборванной
записи. Расширять классификатор на `AbortError` не стал: отмена вызывающего стала бы
неотличима, а тихая ложь в классификации хуже отсутствующего текста. Факт и его
границы зафиксированы в докстринге `isRequestTimeoutError`; решение — за владельцем
(варианты: принять как есть; дедлайн промиса рядом с сигналом, чтобы ошибка была
своя; обёртка транспорта, знающая о сработавшем сигнале).

**Тесты** (+10 кейсов, 717 всего): `createTimeoutSignal` — срабатывание с именем
`TimeoutError`, fallback-ветка через подмену нативного API, мусорные значения не
бросают ни в одной из ветвей; политика — потолок ставится и без чужого сигнала,
`signal: null` не отменяет потолок, неинтерпретируемый override отвергается;
сквозной кейс «заголовки пришли, тело зависло» для клиента билдера, публичного
клиента страницы и клиента data sources (стаб `fetch` с незакрывающимся
`ReadableStream`, который ошибается по аборту). Прежний сквозной кейс переписан:
он стоял на фейковых таймерах и внутреннем таймере ofetch, которого больше нет, —
теперь малый реальный потолок. Проверка «повтора нет» осталась на зависании до
заголовков: ошибка чтения тела идёт мимо `onError` ofetch и повторов не касается.

**Замена проверки текста на классификатор.** Прежний сквозной кейс ждал `/TimeoutError/`
в сообщении: внутренний abort ofetch писал имя в текст. Теперь текст обрыва —
транспортный (`<no response> …`), а имя лежит в цепочке `cause`, поэтому кейс
проверяет предикатом. Грепом подтверждено, что на текст сообщения не опирается
никакой код — только `isRequestTimeoutError` по имени.

**Мутационная проверка** (семь правок по одной, каждая роняет свой кейс): сигнал
только поверх чужого — 3 падения; клиент data sources без `onRequest` — 1;
публичный клиент без `onRequest` — 1; политика не проверяет интерпретируемость
override — 1; прогон снова подменяет сигнал своей комбинацией — 1; задержка уходит
в таймер без нормализации — 1; fallback абортит без имени `TimeoutError` — 1.

**Проверено вживую** (playground, dev; временный Nitro-middleware с двумя режимами,
переключаемыми через файл, — «молчание до заголовков» и «заголовки отданы, тело не
досылается»; срабатывал только на браузерных запросах, иначе SSR-вызов повис бы
намертво, потому что сигнал там инертен; после проверки всё удалено вместе с
временным пользователем БД):

- зависшее **тело** ответа на списке страниц: дашборд освобождается — тост, лоадер
  снят, интерфейс работает;
- **различающая проверка:** с прежним поведением политики тот же зависший ответ
  держит дашборд в «Loading…» **больше 28 с** при потолке чтения 10 с — исходный
  дефект пункта воспроизведён;
- зависание **до заголовков**: в консоли локализованный текст неответа сервера, то
  есть классификация на этой фазе правкой не сломана.

`npm test` (717/717), `type-check`, `lint:check` (oxlint, stylelint, `deps:check`,
`knip`), `prettier --check`, `npm run dev:build`, бюджеты бандла (entry 112 KB,
published 123 KB gzip — без роста) — зелёные.

**Ревью после реализации:** Codex (`gpt-5.6-sol`, high) 30 июля 2026, свободный
формат плюс расширенный по находке про Chrome. Blocker'ов нет: реализация потолка
признана корректной, отмена вызывающего не потеряна, SSR-дедлайны сохранены, перенос
потолка data sources в клиент — архитектурно верным. Четыре находки приняты и
закрыты здесь же:

- три новых приведения `as unknown as` в тестах — историческое исключение не
  разрешает добавлять новые; стабы объявлены сразу как `typeof globalThis.fetch`
  (заодно убрано и одно старое приведение в том же файле);
- тест нормализации проверял только «не бросило», поэтому мутация «всегда
  возвращать 1 мс» проходила бы, превратив мусорную конфигурацию в мгновенный
  обрыв. Теперь проверяется сама задержка: нативная ветвь — по аргументу
  `AbortSignal.timeout`, fallback — проматыванием времени. Мутация проверена и
  роняет оба кейса;
- три комментария всё ещё расходились с кодом: «каждое значение ниже» в
  `apiTimeouts.ts` захватывало `BRICKS_SSR_DEADLINE_MARGIN_MS`, который потолком
  запроса не является; докстринг освежения списка обещал «страница уже создана и
  уже в списке», хотя та же функция зовётся и после неизвестного исхода; докстринг
  SSR-дедлайна описывал инертный механизм как `timeout` ofetch, хотя потолок теперь
  держит сигнал;
- две редакционные ошибки в этом разделе.

**Разбор находки про Chrome (расширенный формат).** Codex предлагает чинить, и
предпочитает обёртку транспорта: `applyApiRequestTimeout` возвращает установленный
итоговый сигнал, а обёртка вокруг вызова превращает `AbortError` в `TimeoutError`,
если `signal.reason` — таймаут. Различимость сохраняется, потому что комбинированный
сигнал хранит причину первого аборта. Расширение классификатора на любой
`AbortError` он отверг по той же причине, что и я (уход пользователя и общий дедлайн
data sources стали бы таймаутами), второй promise-дедлайн — из-за спора двух таймеров
о бюджете. Радиус: установку потолка придётся вынести из `onRequest` в обёртку у всех
трёх клиентов (иначе финальный сигнал ей неизвестен), обёртка обязана сама
подставлять потолок инстанса, а типизация `apiFetcher` перестанет выводиться из
`$fetch.create` — проверено, что `.raw`/`.native`/`.create` в проекте не вызывается
ни разу, так что обёртка технически возможна. Его аргумент в пользу починки:
зависание именно на теле — самый вероятный случай, когда запись сервером уже
применена, то есть честный текст неизвестного исхода нужен там больше всего.

#### Починка классификации выполнена (решение владельца, 30 июля 2026)

Владелец выбрал обёртку транспорта. Сделано так:

- `applyApiRequestTimeout` возвращает поставленный сигнал, а
  `normalizeRequestAbortError` превращает `AbortError` в `TimeoutError` — но только
  когда сигнал сработал и его `reason` сам является таймаутом. Судим по сигналу, а
  не по ошибке: `reason` комбинированного сигнала хранит причину ПЕРВОГО аборта,
  поэтому отмена вызывающего и общий дедлайн прогона data sources таймаутами не
  становятся;
- потолок переехал из `onRequest` в обёртки всех трёх клиентов — иначе итоговый
  сигнал обёртке неизвестен. У публичных клиентов `timeout` из опций инстанса убран:
  бюджет теперь объявлен один раз, в самой обёртке, и разъехаться ему негде;
- `apiFetcher` стал функцией вместо инстанса ofetch (тип `IApiFetcher` в
  `common/types/composables.d.ts`). Цена — Nitro-типизация ответа по литералу URL
  здесь не выводится, тип задаёт дженерик вызова, как и раньше по факту;
- внутри обёрток вызывается `.raw`, а не сам инстанс: на переменном (не литеральном)
  URL вывод типа ответа по Nitro-роутам разворачивается в условные типы за пределом
  рекурсии компилятора — `vue-tsc` падал с `Excessive stack depth`. Тело ответа то
  же самое: прямой вызов ofetch возвращает ровно `_data` этого ответа.

**Проверено вживую после починки** (тот же инструмент, теперь с перехватом и GET
списка, и PUT сохранения; всё удалено после проверки):

- зависшее **тело** на чтении списка: в консоли «The server did not respond in
  time — please try again», то есть локализованный текст потолка чтения — там, где
  до починки было браузерное «The user aborted a request. (code: 20)»;
- зависшее **тело** на сохранении: «The server did not confirm the operation in
  time: it may have completed. Refresh the data before retrying» — честный текст
  неизвестного исхода, кнопка Save снова активна;
- сверка списка после оборванной записи ушла: в сети `GET /api/bricks/` сразу за
  оборванным `PUT /api/bricks/2/`. До починки эта ветка не включалась вовсе, потому
  что ошибка не проходила классификацию.

**Мутационная проверка починки** (пять правок по одной): нормализация по `reason`
снята — 2 падения; таймаутом считается любой `AbortError` — 2 (оба кейса отмены);
обёртка билдера не нормализует — 1; клиент data sources не нормализует — 1;
публичный клиент не ставит потолок — 1.

**E2E: падавший тест исправлен** (по решению владельца). `npm run test:e2e` — 5/5,
стабильно в трёх прогонах подряд. Причина падения — не остаточное состояние БД, как
я предположил вначале (`clearPages` чистит их в `beforeEach`), и не транспорт: тест
ждал `heading level=2 «Page B»`, которого в редакторе нет вовсе. Проверка ловила
короткоживущее промежуточное состояние — с искусственной паузой в две секунды тест
падал и в изолированном прогоне, то есть «проходил» он по гонке, а не по существу.
Заменено на устойчивый признак: заголовок шапки (`level=1`) содержит имя страницы,
и он держится, пока страница открыта. Финальные проверки самого сценария (значение
поля Title и URL после позднего ответа) не менялись.

**Консультация Codex перед реализацией: что принято и что поправлено.** Приняты
таксономия по методу с override'ами, обязательный потолок записей с честным
текстом, отказ от протягивания отмены, три слоя SSR, `retry: 0`, константы вместо
опции модуля, сохранение всех трёх локальных лечений. Его вывод про удвоение
потолка повторами оказался неверным (замер выше), поэтому обоснование `retry: 0`
переписано. Он же поправил мою ошибку про отмену при переключении категорий
галереи. Его список проглоченных отказов подтверждён по коду и вынесен в BM-28 —
включать его в BM-27 значило бы переработать auth/media/cache вместе с транспортом.

#### Этапы 3 и 4 выполнены (30 июля 2026)

Одной правкой, как и предполагал план: механизм общий — результат прогона несёт
признак неполноты, и по нему клиент делает **одну** попытку догнать. База под
правкой снова другая: 760 тестов в 104 файлах вместо 717 (владелец добавлял
спеки), после правки — 770 в 105.

**Общая суть.** До правки неудачный SSR-прогон становился окончательным: ошибка
ложилась в `payload._errors`, а при гидрации с ошибкой Nuxt initial fetch
пропускает (`asyncData.js:114`), то есть сайдбар редактора оставался пустым до
полной перезагрузки — которая снова уходила в тот же SSR и снова ждала дедлайн.
Симметрично у published-страницы: прогон data sources, брошенный по дедлайну,
резолвился частичным результатом, и клиент этому результату верил.

**Что сделано.**

1. **Библиотека компонентов деградирует, а не отклоняется.** SSR-дедлайн запроса
   манифеста ловится по собственному имени ошибки
   (`builder/app/utils/componentLibraryPolicy.ts`, имя
   `BricksComponentManifestDeadlineError`, по образцу `dataSourcePolicy.ts`) и
   возвращает `{ hash: '', isPartial: true, modals: [], items: [...LAYOUT_COMPONENTS] }`.
   Судим по своей ошибке, а не по `name === 'TimeoutError'`: совпади имена — любой
   транспортный таймаут молча превращался бы в деградированную библиотеку.
2. **Маркер неполноты — обязательное поле** `IComponentLibraryData.isPartial`
   (не опциональное: ветка, забывшая его выставить, выдавала бы неполный результат
   за полный). Смысл поля узкий: «прогон брошен по дедлайну и требует одной
   клиентской попытки». Отказ импорта отдельного brick-модуля сюда не входит —
   повтор его не исправит, а стоил бы запроса на каждом заходе.
3. **Частичный ответ не фиксируется как снимок.** `commitLoadedData` выходит
   раньше: иначе «последняя успешная загрузка» стала бы списком из одних
   layout-блоков, а `replaceModalsCache([])` обнулил бы опции модалок панели
   свойств, пришедшие с прошлой удачной загрузки. В `componentLibraryList`
   частичный ответ уступает снимку (обратный порядок неверен — снимок перекрывал бы
   свежий полный ответ).
4. **Деградация считается отказом для интерфейса.** `isComponentLibraryLoadFailed`
   поднимается и по `isPartial`, поэтому тост и блок повтора в сайдбаре работают
   как раньше, а признак снимается сам, если восстановление успевает. Размен
   осознанный: при удачном восстановлении пользователь всё же увидит тост об
   отказе — но альтернатива (молчать) оставляла бы пустой сайдбар без объяснения,
   если повтор не удастся.
5. **Восстановление повторяет два исхода** — деградацию и обычный отказ ручки.
   Второй важнее: для него повтор единственный шанс (ошибка из `payload._errors`
   гасит initial fetch). Ровно одна попытка: на клиенте деградировать нечему
   (SSR-дедлайна там нет), а отказ ручки способен повторяться сколько угодно —
   без флага получился бы цикл. Дальше — только кнопкой сайдбара.
6. **Прогон data sources отчитывается о неполноте** (`IRendererDataSourcesData`:
   `{ props, isPartial }` вместо голого `Map`; инлайн-интерфейсы того же composable
   переехали в `render/types/composables.d.ts` — правило «типы только в `types/`»).
   Маркер лежит рядом с данными, потому что в payload обязан приехать вместе с
   ними: разъедься эти значения — и клиент либо повторял бы полный прогон, либо
   принимал бы неполный за полный. Превышение бюджета числа запросов неполнотой
   **не** считается: повтор упрётся в тот же бюджет.
7. **Клиентский догон published-страницы** — один прогон на экземпляр страницы,
   только для серверного прогона (`!isPreview`), объединённый в один хук с
   dev-логированием: два независимых хука дали бы два прогона, из которых
   `dedupe: 'cancel'` отменил бы первый.
8. **Уход со страницы не даёт восстановлению начаться** (`onScopeDispose` со
   вторым аргументом — вне компонента он молчит, поэтому композаблы остаются
   вызываемыми в unit-тестах). Уже улетевший запрос это не отменяет: для настоящей
   отмены сигнал пришлось бы протаскивать через handler `useAsyncData` в транспорт.
   Ущерб от нерасторопного случая ограничен лишним запросом — данные новой
   страницы он не перезапишет, потому что пишет в кеш прежнего ключа.

**Главное уточнение к плану: `onMounted` для повтора не годится, и план об этом
не знал.** План предлагал запускать повтор сразу после `await useAsyncData`, Codex
поправил на `onMounted` — но не работает ни то, ни другое. `getDefaultCachedData`
при `nuxtApp.isHydrating` возвращает `payload.data[key]`
(`asyncData.js:459-466`), а `granularCachedData` по умолчанию `true`
(`@nuxt/schema/dist/index.mjs:662`), поэтому `refresh()` во время гидрации отдаёт
тот же ответ из payload, не обращаясь к ручке. Mounted-хуки же успевают
отработать раньше, чем Nuxt снимет `isHydrating`: флаг гасится в
`deferHydration()` вместе с `app:suspense:resolve` (`nuxt.js:42-57`), а Suspense
разрешается после монтирования дерева. Поэтому повтор стоит на `onNuxtReady` —
он подписан ровно на `app:suspense:resolve`. Регистрируется он синхронно, до
`await`, из-за того же ограничения, из-за которого вся проводка `useBuilderPage`
идёт до его единственного await: после await scope потерян. Технически это
возможно потому, что `AsyncData` у Nuxt — одновременно объект состояния и промис
(`asyncData.d.ts:97`), так что `data`/`error` доступны до `await`.

Живая проверка это подтвердила с обратной стороны: с прежним кодом dev-логовый
`onMounted(refresh)` в data sources не выполнял прогона вовсе — то есть эта строка
и раньше работала не так, как обещал её комментарий.

**Мутационная проверка поймала мёртвый код, который советовало ревью.** Codex
отдельно настаивал ставить маркер неполноты не только в момент истечения бюджета,
но и в `catch` аварийного дедлайна. Мутация «снять присваивание из `catch`» не
уронила ни одного кейса — и по коду видно, почему: аварийный дедлайн наступает
строго позже бюджета прогона (`totalDeadlineMs + BRICKS_SSR_DEADLINE_MARGIN_MS`),
то есть к моменту `catch` таймер уже отработал. Второе присваивание убрано, на его
месте — объяснение. Обратное же (маркер только в `catch`) неверно: там, где abort
работает (клиент, абсолютные URL), запросы честно падают по сигналу, прогон
завершается штатно и `catch` не срабатывает вовсе — этот путь закрыт отдельным
кейсом.

**Согласование с Codex до реализации** (`gpt-5.6-sol`, high, расширенный формат).
Приняты: собственная именованная ошибка вместо `TimeoutError`; отказ деградировать
любой SSR-отказ (503 остаётся видимым отказом, а мёртвое состояние закрывается тем,
что восстановление повторяет и `error`); guard в `commitLoadedData`; приоритет
снимка над частичным списком; отсутствие своего состояния загрузки (Nuxt сам
переводит статус в `pending`); форма `{ props, isPartial }` и перенос инлайн-типов;
отказ выносить общую утилиту детача (у трёх мест разные post-действия — библиотеке
нужна фиксация снимка, data sources ничего не коммитят, publish описывает
неизвестный исход записи). Его же замечание, что восстановление обязано идти через
`refreshComponentLibrary`, а не через голый `refresh()`, оказалось точным: иначе
успешный повтор не наполнил бы ни снимок, ни кеш модалок — мутация это
подтвердила. Отклонено одно: `onMounted` (разобрано выше).

**Тесты** (+10 кейсов, 770 всего; спек прогона выделен в отдельный файл — исходный
перевалил лимит 500 строк):

- `test/builder/componentLibraryFailure.spec.ts` — деградация по дедлайну
  (layout-блоки + признак отказа + сам факт деградации по логу), сохранность
  снимка и кеша модалок, отдельная проверка предиката: транспортный
  `TimeoutError` и 503 своим дедлайном не считаются;
- `test/builder/componentLibraryHydration.spec.ts` — частичный ответ из payload
  догоняется одним запросом и только после готовности приложения; отказ SSR из
  payload догоняется тем же одним запросом; успешное восстановление фиксирует
  снимок и кеш модалок; восстановление уходит ровно однажды, сколько бы раз хук ни
  позвали;
- `test/render/dataSourcesRunBudget.spec.ts` (новый) — маркер при зависшем
  источнике и при источнике, оборванном по сигналу (второй путь, где аварийного
  дедлайна нет); догон ровно одним прогоном; повторно неполный прогон не идёт на
  третий круг; уход со страницы отменяет не начатое восстановление; превышение
  бюджета запросов остаётся полным прогоном;
- `test/helpers/asyncData.ts` — стаб `useAsyncData` стал thenable (как `AsyncData`
  у Nuxt) и научился отдавать ошибку из payload; инлайн-стаб render-спеков теперь
  перезапускает handler на `refresh()` и держит данные в `shallowRef` (иначе
  `computed` над результатом не пересчитывался и повтор был непроверяем);
- `test/stubs/nuxt-imports.ts` — стаб `onNuxtReady` складывает колбэки, тест
  дёргает их сам: «отложенность» здесь и есть предмет проверки.

**Мутационная проверка** (четырнадцать правок по одной, каждая роняет свой кейс):
деградации нет — 1; частичный ответ коммитится в снимок — 1; прежний приоритет
списка — 1; деградация не считается отказом — 2; отказ SSR не восстанавливается —
2; восстановление без флага одиночности — 1; восстановление до готовности
приложения — 3; восстановление мимо фиксации снимка — 1; маркер не ставится при
истечении бюджета — 4; прогон всегда объявляет себя полным — 3; повтор прогона без
флага — 1; повтор до готовности приложения — 1; повтор без проверки живой
страницы — 1; восстановление только в превью — 2. Две мутации сначала не
различались: одна вскрыла мёртвый код (см. выше), другая — что кейс проверял
кеш модалок, доехавший из предыдущего кейса (кеш уровня модуля теперь гасится в
`beforeEach`).

**Проверено вживую** (playground, dev; временный Nitro-middleware + временный
brick с двумя data source, из которых второй зависает только на SSR; всё удалено
после проверки вместе с временным пользователем БД и восстановленной схемой
страницы):

- зависшая ручка манифеста: SSR редактора отдаёт **200 на 13,9 с** с
  layout-блоками, в payload `isPartial: true`, `hash: ''`, `modals: []`, а
  `_errors['bricks-components']` — `null`, то есть отказа нет;
- после гидрации браузерный запрос манифеста уходит (200), блок ошибки в панели
  компонентов отсутствует — признак снялся сам;
- **различающая проверка:** с прежним кодом тот же сценарий даёт
  `_errors['bricks-components'] = NuxtError`, в панели остаётся кнопка Retry, а
  браузерного запроса манифеста нет вовсе;
- зависший второй data source: published-страница отдаёт **200 на 5,04 с**
  (дедлайн 3 с + запас), в HTML `FAST:ok` и `STUCK:MISSING`, в payload
  `isPartial: true` и props только успевшего источника;
- после гидрации клиентский прогон догоняет пропавшее: в DOM `STUCK:recovered`, в
  сети по одному запросу на источник;
- **различающая проверка:** с прежним кодом `STUCK:MISSING` остаётся и спустя 8 с
  после гидрации, клиентских запросов нет ни одного;
- побочно проверена сериализация новой формы результата настоящим devalue: на
  странице без источников payload содержит `{ props: ['Map'], isPartial: false }`.

`npm test` (770/770 в 105 файлах), `type-check`, `lint:check` (oxlint, stylelint,
`deps:check`, `knip`), `prettier --check`, `npm run dev:build`, бюджеты бандла
(entry 112 KB, published 123 KB gzip — без роста) — зелёные.

**Ревью после реализации:** Codex (`gpt-5.6-sol`, high) 30 июля 2026, свободный
формат, тем же thread'ом, что и согласование. Blocker'ов нет; оба спорных решения
он проверил по коду и согласился с реализацией, добавив к первому подтверждение,
которого у меня не было: `NuxtPage` зовёт `done()` только в `Suspense.onResolve`
(`pages/runtime/page.js:149`), а последний `done()` сначала снимает `isHydrating`
и лишь затем вызывает `app:suspense:resolve` — то есть `onNuxtReady` гарантированно
попадает после снятия флага. Он же назвал цену этого выбора: колбэк идёт через
`requestIdleCallback` без потолка, поэтому под непрерывной нагрузкой восстановление
отложится. Принято как размен (библиотека уже показывает layout-блоки, догрузка —
работа фоновая), факт записан в комментарий рядом с хуком.

Три находки приняты и закрыты, одна отклонена по факту:

- **обещание отмены было шире кода.** `isPageAlive` не даёт восстановлению
  начаться, но улетевший запрос не отменяет: `_off()` не абортит
  `_abortController` (`asyncData.js:440`). Формулировки в обоих композаблах и в
  тексте выше сужены до того, что код действительно делает;
- **«без флага получился бы цикл» — сильнее факта.** `onNuxtReady` зовёт колбэк
  единожды (`hookOnce` + один `requestIdleCallback`), поэтому цикла в текущем коде
  нет и без флага; флаг защищает от второго вызывающего, и мутация доказывает
  именно это. Комментарии, имена и описание мутационной проверки поправлены;
- **тест проверял форму стаба, а не рабочего кода.** Инлайн-стаб `useAsyncData` в
  спеке прогона разрешался полезной нагрузкой, тогда как `AsyncData` у Nuxt
  разрешается объектом состояния (`Promise<_AsyncData> & _AsyncData`). Значит
  `(await ready).isPartial` в приложении не существует, а три assertion'а маркера
  опирались на выдумку стаба. Стаб выровнен по общему helper'у (промис отдаёт
  состояние, все три поля — refs), маркер читается там же, где его читает рабочий
  код — в `data.value`; заодно ушли три приведения `as IRendererDataSourcesData` и
  одно бессмысленное приведение handler'а. Мутации после правки перепроверены —
  все четыре по-прежнему роняют свои кейсы;
- **отклонено:** утверждение, что поздний ответ ушедшей страницы Nuxt отбросит по
  identity-check. `clearNuxtDataByKey` (`asyncData.js:291-305`) не удаляет промис
  из `_asyncDataPromises`, поэтому проверка `_asyncDataPromises[key] !== promise`
  проходит и результат применяется — `payload.data[key] = result` на `:405`. То
  есть кеш ключа поздний ответ как раз восстанавливает; на этом и держится смысл
  проверки «страница ещё жива». Формулировка в комментарии уточнена, но по существу
  оставлена.

Ещё поправлен докстринг `IComponentLibraryData.isPartial`: он утверждал, что
обычную ошибку ручки «повтор не исправит», хотя восстановление её как раз
повторяет. Правильное разделение — маркер описывает деградацию, обычный отказ
живёт в `error` того же `useAsyncData`.

### BM-28. Отказ запроса доходит до пользователя

**Выполнено 30 июля 2026 года.** Заведено 29 июля по ходу BM-27: потолок ожидания
превратил зависание в обычный отказ, и стало видно, что дальше отказ местами
теряется. Класс другой, чем у BM-27: там не завершался запрос, здесь не доходил
результат. Стратегия согласована с Codex (`gpt-5.6-sol`, high) до реализации, в
расширенном формате «способ починки — радиус — регресс — проверка».

**1. Медиа-стор: отказ не стирает список, а нераспознанный ответ — не пустая
галерея.** `loadItems` больше не обнуляет `items` в `catch`: уже показанная
галерея переживает transient-отказ повторного открытия, а сообщение получает
вызывающий. Ветка «ответ непонятной формы» (раньше — тоже молчаливое
опустошение) стала отказом контракта: проверка формы вынесена в
`media/utils/requestErrors.ts` (`isMediaListResponse`, только оболочка ответа —
поля элементов не валидируются осознанно). Legacy-ветка «Django отдаёт массив
напрямую» удалена: клиент всегда обращается к локальной ручке, а она всегда
отдаёт объект с `success`/`items`.

**2. Отказ записи медиа виден в интерфейсе.** `updateItemCategory`,
`updateItemMeta` и `uploadFile` пробрасывают отказ вызывающему; галерея
показывает тост, а `handleUpdateCategory` стал `async` — без ожидания реджект
стора уходил бы в необслуженный промис. `useMediaUpload` доносит отказ по
каждому файлу (`onError` с именем файла), включая неподдерживаемый тип, который
раньше оставался в `console.warn`; остальные файлы набора продолжают грузиться.

**3. Индикатор загрузки — счётчик.** `isUploading` стал getter'ом над
`uploadingCount`: у двух параллельных загрузок `finally` первой снимал индикатор,
пока вторая шла. Без `Math.max(0, …)` при декременте — он спрятал бы ошибку
жизненного цикла вместо её обнаружения (замечание Codex).

**4. Latest-wins для списка медиа — и против локальных записей.** `itemsRequestId`
по образцу `pagesRequestId`. Сверх текста пункта (там требовалось только
упорядочить GET относительно GET) добавлено обесценивание летящего GET успешной
локальной записью: иначе поздний ответ возвращал удалённый файл в галерею, терял
только что загруженный и откатывал правку метаданных. Обесценивание делается
**после** успешной записи, а не на её старте: определённо упавшая запись не
причина выбрасывать уже полученный список. Отказ вытесненного запроса вызывающему
не докладывается — тост об устаревшей попытке накрыл бы результат более свежей.

Там же закрыт край, не входивший в список: `updateItem*` брали `targetIndex` до
запроса, и удаление соседа за время полёта PATCH'а превращало `splice` в замену
чужого элемента. Теперь элемент ищется заново по `id`, и применяются только поля
своей операции — ответы двух параллельных PATCH'ей несут по одному свежему полю,
и поздний иначе откатывал бы правку раннего. Полный per-item порядок (два
одинаковых PATCH'а одного поля) остаётся неупорядоченным осознанно.

**5+7. Манифест компонентов грузится один раз, отказ виден и повторяем.** Пункт 5
(«`loadModals` ставит `isCacheLoaded` и в `catch`») закрыт не заплаткой, а
устранением второго загрузчика: селектор модалок и библиотека запрашивали один и
тот же `/api/bricks/components` двумя запросами с двумя независимыми кешами.
Теперь кеш модалок наполняет `useComponentLibrary` из того же ответа
(`replaceModalsCache`), а `loadModals`/`isModalsCacheLoaded` и мёртвый фасад
`app/composables/useModals.ts` (его `getModalComponent`/`getModalComponentLazy`
не вызывались ниоткуда) удалены. Вместе с фасадом ушло исключение
`builder-core-tech-debt-scope` из `.dependency-cruiser.cjs`: выход панели свойств
в composition root больше не нужен.

Заполнение кеша идёт **не только внутри handler'а** `useAsyncData`: на гидрации
handler не исполняется вовсе (ответ приезжает готовым в payload), и кеш остался бы
пустым именно на клиенте, где селектор и открывают. Признак отказа
(`isComponentLibraryLoadFailed`) отдан наружу вместе с `refreshComponentLibrary`,
и повтор доведён до UI сайдбара — возвращённая, но не подключённая функция была бы
мёртвым API (замечание Codex). Список при отказе больше не пустой: layout-блоки
манифеста не требуют, и забирать их у пользователя вместе с бриками незачем —
поэтому отказ пришлось сделать отдельным признаком, «список непуст» его больше не
описывает.

Отдельная находка, не предусмотренная ни планом, ни ревью: `useAsyncData` при
отказе сбрасывает `data` в дефолт (`nuxt/dist/app/composables/asyncData.js`:
`data.value = unref(options.default())`), то есть неудачный повтор забирал бы уже
загруженные брики. Держим снимок последней успешной загрузки сами; `watch` для
этого не годится — композабл await'ится, активный effect scope к этому моменту
потерян (та же причина, по которой вся синхронная проводка `useBuilderPage` стоит
до его единственного `await`).

**6. Проверка сессии отличима от её отсутствия.** `fetchMe` возвращает `null`
только для 401; 5xx и обрыв по потолку пробрасываются. Страница логина при отказе
проверки не редиректит и показывает своё сообщение (ошибка самого входа
приоритетнее — она относится к действию пользователя). Раньше недоступность
сервера выглядела как «не авторизован», и форма молча предлагала вход, который
упёрся бы в тот же сервер.

**8. Единое правило для подтверждений записи.** Определённый отказ (4xx/5xx)
оставляет диалог открытым — объект на месте, повтор безопасен и под рукой. Обрыв
по потолку ожидания диалог **закрывает**: исход неизвестен, и локаль
`bricks.common.writeTimeout` прямо просит обновить данные перед повторной
попыткой — открытый диалог предлагал бы обратное (поправка Codex к моему варианту
«оставлять открытым всегда»). Правило применено к трём destructive-флоу: удаление
медиа, удаление страницы, откат версии. Для медиа обрыв записи вдобавок
отпускает перечитывание списка — то же, что `toPageWriteError` уже делает для
страниц.

**9. Тост вытесненной операции несёт свою страницу.** Метка страницы снимается до
`await`: после него форма принадлежит уже открытой странице, и тост назвал бы
чужую. Отказ вытесненной операции больше не читает `publishStore.generalError` —
это поле формы открытой страницы, к вытесненной операции оно не относится
(поправка Codex). Метка добавляется только в ветке «сессия уже другая»: на экране
чужая страница, и без метки сообщение выглядит относящимся к ней; в актуальной
сессии метка была бы шумом. У Save as Copy успех называет созданную копию, а не
исходную страницу — искать в списке пользователь будет именно её.

**Сверх списка (найдено Codex, тот же класс).** Версии страницы в панели деталей:
ответ прежней страницы приземлялся после переключения панели и показывал её версии
как версии новой — с ними ушёл бы и откат; общий `isLoading` снимала первая из двух
параллельных загрузок; отказ стирал уже показанный список. Все три закрыты в
`usePublishPageVersions` (счётчик запроса + `resetVersions`, счётчик загрузок,
отказ не обнуляет список).

**Побочно.** `useBuilderPage` перевалил лимит `max-lines` (500) — запись открытой
страницы выделена в `useBuilderPageWrite.ts` (сохранение, Save as Copy, переход
сессии, снимок превью, тосты исхода). Выбор места правки, не размен: у операций
записи своя цельная логика, и в общем фасаде она мешалась с проводкой shell'а.
Инлайновые типы затронутых композаблов publish перенесены в
`publish/types/composables.d.ts` (частично закрывает BM-17), выбор текста обрыва
по методу вынесен в политику запросов (`resolveRequestTimeoutMessageKey`) — иначе
media и publish выбирали бы его по своей копии правила.

**Живая проверка (playground, dev).** Отказ ручки манифеста воспроизведён
намеренно: блок отказа с кнопкой повтора виден в сайдбаре, layout-блоки остаются
доступными, тост показывается, повтор после восстановления ручки доносит брики.
Проверены обе темы. Кеш модалок на гидрации подтверждён на настоящем
brick-модуле, добавленном в playground на время проверки. Смена категории медиа
доезжает до БД без ошибок в консоли.

Живая проверка нашла в самой правке два дефекта: иконка `ta:outline-cloud-off`
отсутствует в реестре `builderIcons.ts` (заменена на существующую), и тост об
отказе показывается страницей из `onMounted`, а не композаблом в setup — там он
выполнялся бы и на SSR, где показывать его некому. Отдельно стоит записать
методическую ошибку самой проверки: `ol[class*="viewport"]` на странице билдера
два (собственный тост страницы и тост медиа-галереи), и первые замеры читали не
тот — из-за этого я успел ошибочно решить, что тосты не работают вовсе. Проверять
такие вещи нужно по владельцу элемента (`__vueParentComponent`), а не по первому
совпадению селектора.

**Ревью Codex по факту правки: пять находок, все приняты и закрыты.**

1. **Срок жизни снимка библиотеки не совпадал с кешем модалок.** Снимок лежал в
   локальном `ref`, а кеш модалок — в модульном. При `purgeCachedData` (в
   сгенерированной конфигурации `true`) кеш keyed-запроса очищается с
   размонтированием последнего потребителя, поэтому после ухода из билдера и
   повторного захода с отказом ручки библиотека оставалась с layout-блоками, а
   селектор модалок показывал записи прежнего ответа. Снимок переехал в состояние
   уровня приложения (`useState`, заводится **до** `await` — после него композабл
   вне Nuxt-контекста), и оба значения теперь берутся из одного снимка.
2. **`loadAllPages` не отсекал отказ вытесненного запроса** — проверка `requestId`
   стояла только в успешной ветке. Отказ устаревшего GET'а после успеха свежего
   переводил в состояние ошибки актуальный bootstrap сессии, то есть показывал
   блокирующий экран поверх рабочей страницы. Тот же класс, что закрыт в этой
   правке у медиа и версий, — прецедент оказался слабее своих копий.
3. **`<select>` категории показывал несохранённое значение.** Нативный select
   меняет DOM-значение до обработчика, а источник (`selectedCategory`) — только
   после успешного ответа: при отказе тост говорил об ошибке, а на экране
   оставалась новая категория, и повторить её тем же выбором было нельзя —
   `change` больше не возникал. Теперь UI пессимистичный: обработчик синхронно
   возвращает select к сохранённому значению, успех приезжает из стора реактивно.
4. **Save as Copy не сверял токен после второй асинхронной границы.**
   `switchToSavedPage` ждёт `router.replace`, и уход со страницы за это время
   давал тост без имени копии поверх уже другой страницы (`commitSavedSnapshot` и
   снимок превью были защищены своими проверками, тост — нет).
5. **Тестовый хелпер нарушал правила и врал в комментарии.** Интерфейс стаба
   переехал в `test/helpers/types.d.ts`, двойное приведение `as unknown as` убрано
   (стаб стал дженериком по типу ответа), описание исправлено по факту: в этом
   проекте `asyncDataDefaults.deep` = **true**, а стаб намеренно отдаёт
   `shallowRef` — иначе прокси Vue перекрывал бы у полезной нагрузки члены
   прототипа своими инструментами, и спеки про прототипные ключи проверяли бы
   поведение реактивности вместо сборки значения.

Из пятой находки следует отдельный факт, который стоит держать в голове: в
приложении `defaultProps` действительно читаются через глубоко реактивный прокси,
и брик с пропом по имени члена прототипа (`hasOwnProperty`) получит инструмент
Vue вместо своего значения. Защита `toSafeRecord` от подмены прототипа при этом
работает; случай признан пренебрежимым и в работу не берётся.

**Проверки:** `type-check`, `lint:check` (oxlint + stylelint + deps + knip),
`prettier --check`, 760/760 тестов (добавлено 27 в шести спеках: медиа-стор,
загрузка медиа, отказ и гидрация библиотеки, сессия auth, тосты вытесненного
сохранения, подтверждение отката, порядок ответов версий). Каждая правка закрыта
различающим тестом, мутации прогнаны: возврат обнуления списка в `catch`, снятие
проверки id (в медиа и в списке страниц), boolean-семантика индикатора, полная
замена элемента ответом PATCH, кеш модалок только внутри handler'а, снимок в
локальном `ref` вместо состояния приложения, fallback `?? []` вместо
layout-блоков, безусловный `catch { return null }` в `fetchMe`, метка страницы
после `await`, чтение `generalError` в вытесненной ветке, потеря timeout-ветки у
подтверждения, снятая сверка токена после перехода на копию — все валят
соответствующие кейсы. Возврат `<select>` юнитом не покрыт (DOM-окружения в
наборе нет) и проверен вживую на обоих исходах: отказ оставляет сохранённую
категорию плюс тост, успех приводит select к новой.

**Что осталось (вынесено отдельными пунктами):** BM-30 — BM-33.

---

### BM-29. Серверный лимит времени SQL: соединение освобождает база

**Выполнено 30 июля 2026 года.** Заведено 29 июля по ходу BM-27: клиентские
потолки освобождают ожидающего, но не ресурс — отменённый на клиенте запрос
продолжает занимать соединение из конечного пула, поэтому серия таких запросов
исчерпала бы его, и лечение UX превратилось бы в отказ обслуживания. Стратегия
согласована с Codex (`gpt-5.6-sol`, high) до реализации, в расширенном формате
«способ починки — радиус — регресс — проверка».

**Спайк на живой БД до проектирования** (локальный PostgreSQL 16; замеры при
лимите 1000 мс):

- `statement_timeout` в конфигурации пула работает: `pg_sleep(3)` падает на
  1,02 с с SQLSTATE `57014`, `SHOW statement_timeout` возвращает заданное
  значение — параметр реально доезжает startup-пакетом соединения;
- **соединение переживает отмену** и переиспользуется пулом; внутри транзакции
  после отмены проходят и `ROLLBACK`, и следующий запрос на том же клиенте;
- `query_timeout` драйвера для этой задачи негоден: reject приходит вовремя, но
  запрос **остаётся активным на сервере** (проверено по `pg_stat_activity`) —
  ресурс не освобождается, то есть исходный дефект остаётся;
- `idle_in_transaction_session_timeout` отклонён по результату замера: он не
  отменяет запрос, а рвёт сессию, и FATAL `25P03` приходит **асинхронным
  событием `error` на выданном клиенте**. Слушатель пула такие соединения не
  обслуживает (он снимается при выдаче), поэтому без отдельного
  `client.on('error')` это падение процесса. Сценарий (пауза между statement'ами
  внутри транзакции) при нынешнем колбэке отсутствует — там только SQL.

**1. Лимит на пуле, значение — из конфигурации.** `postgres/poolConfig.ts` —
чистый модуль без импорта `pg` (драйвер — optional peer, а резолв значения нужно
проверять юнитами): `resolveStatementTimeoutMs` + `buildPostgresPoolConfig`, куда
переехали и размеры пула. Опция `bricks.database.statementTimeoutMs`, env
`NUXT_BRICKS_DATABASE_STATEMENT_TIMEOUT_MS`, ключ
`bricksDatabaseStatementTimeoutMs`.

**Значение применяется дважды, и это не дублирование.** Startup-параметр
соединения перекрывается строкой подключения (см. раунды ревью ниже), поэтому
источник истины — сессионный `SET` в хуке выдачи соединения; startup-параметр
остаётся как значение по умолчанию для самого раннего момента сессии.

**Дефолт 8000 мс, а не 9000, как предлагал Codex.** Величина ниже клиентского
потолка чтения (10 с) на принятый в проекте запас `BRICKS_SSR_DEADLINE_MARGIN_MS`
(2 с) — тот же приём «внутренний механизм срабатывает раньше внешней страховки».
Порядком это не является и обоснованием значения служить не может: лимит
ограничивает КАЖДЫЙ statement по отдельности, а один HTTP-запрос выполняет их
несколько (проверка сессии, `BEGIN`, снапшот, запись, очистка истории, `COMMIT`),
плюс до двух секунд может уйти на получение соединения из пула. Цель лимита —
освободить соединение; бюджет всей операции держит клиент.

**Опт-аута нет.** `0` и `false` трактуются как «не задано» и заменяются
дефолтом — по решению BM-27 о `timeout: 0`. Отброшенное значение при этом пишет
предупреждение: молча подставленный дефолт выглядел бы как принятая настройка, и
попытка выключить лимит нулём казалась бы удавшейся.

**2. SQLSTATE не выходит за пределы postgres-модуля.** Вариант Codex — проверять
`code === '57014'` прямо в `toHttpError` — отклонён: HTTP-слой сейчас о драйвере
не знает вовсе, а прецедент в проекте другой (unique violation превращается в
доменную ошибку в адаптере). `client.ts` переводит отмену в
`BricksStatementTimeoutError` (`storageErrors.ts`, реэкспорт из
`nuxt-bricks/persistence` — кастомный адаптер может сообщить то же состояние),
`toHttpError` маппит класс, как маппит конфликты. Прочие ошибки драйвера
проходят как есть — обёртка на всё сломала бы `isUniqueViolation`.

**3. 504 с машиночитаемым кодом, а не generic 500.** Причина известна и повтор
осмыслен, поэтому envelope с `errorId` здесь не нужен; 504, а не 503 —
недоступен не сервис целиком, а upstream не успел ответить. Текст PostgreSQL
наружу по-прежнему не отдаётся (проверено на живом ответе: ни `canceling
statement`, ни имени таблицы в теле нет).

**4. Клиент говорит своими словами.** Без разбора кода отказ доехал бы
англоязычным транспортным текстом: `toRequestError` возвращает ошибку с «/api/»
в сообщении как есть, а `toMediaRequestError` берёт сообщение сервера. Поэтому
`isStatementTimeoutError` (`common/utils/main.ts`, читает `data.data.code` с
fallback'ом на `data.code`) и общая локаль `bricks.common.statementTimeout`
подключены в обоих доменах **до** транспортного passthrough. Текст отличается от
обрыва по потолку по существу: там исход неизвестен, здесь незавершённая запись
определённо откатана. По той же причине `toPageWriteError` для него не освежает
список (сверять нечего), а правило BM-28 «определённый отказ оставляет диалог
подтверждения открытым» срабатывает само — `isRequestTimeoutError` этот отказ не
распознаёт, и это проверено вживую.

**5. Границы задокументированы** (README, «Встроенный PostgreSQL» → «Лимит
времени SQL-запроса»): лимит не касается `bricks-migrate` (у CLI свой
`pg.Client`, долгая DDL там законна) и кастомных storage-адаптеров; при пуллере в
transaction mode startup-параметры соединения могут не пройти — тогда лимит
задаётся на роли в самой БД. Точки подключения к PostgreSQL перепроверены: их
три — рантайм-пул, CLI миграций и `scripts/integration-smoke.mjs`.

**Тесты** (+12 кейсов, 782 всего): `test/persistence/postgresPoolConfig.spec.ts`
(табличный резолв, включая `0`/`'0'`/`false`/отрицательное/`NaN`/выше int32 →
дефолт с предупреждением, `'120000'` → 120000, дробь вниз; точная форма конфига —
есть `statement_timeout`, нет `query_timeout` и `options`),
`test/persistence/postgresClient.spec.ts` (значение доезжает до конструктора
пула, `57014` → доменная ошибка с сохранённой причиной, прочие SQLSTATE не
заворачиваются, отмена в транзакции даёт `ROLLBACK` и `release`),
`handlerHelpers.spec.ts` (+1: 504 с кодом и без `errorId`),
`test/publish/requestErrors.spec.ts` (+2: свой текст вместо статуса транспорта;
не считается обрывом по потолку и не освежает список), `mediaStore.spec.ts` (+1:
свой текст, список не обнуляется).

**Проверено вживую** (playground, dev; лимит времени наводился настоящим ожиданием
блокировки — `LOCK TABLE bricks_pages IN ACCESS EXCLUSIVE MODE` в открытой
транзакции, ожидание блокировки входит в бюджет statement):

- чтение списка страниц: **504 ровно на 8,03 с** при дефолтном лимите, в теле
  `data.code = STATEMENT_TIMEOUT`, следующий запрос после отмены — 200 за 17 мс
  (пул жив);
- env-override `NUXT_BRICKS_DATABASE_STATEMENT_TIMEOUT_MS=1500`: и чтение, и
  запись (`PATCH`, то есть транзакционный путь со снапшотом) падают на 1,56 с с
  тем же кодом; после снятия блокировки запись проходит за 24 мс;
- дашборд показывает тост отказа загрузки списка, а удаление страницы под
  блокировкой — новый текст «The request exceeded the server time limit and was
  stopped. Please try again», **диалог подтверждения остаётся открытым**, страница
  остаётся в списке.

**Методическая ошибка проверки, повторившаяся из BM-28:** первый замер тостов
показал «тоста нет» — тост к моменту чтения DOM уже истёк (4 с). Проверять их
надо наблюдателем, поставленным до действия, а не снимком после.

**Ревью, раунд 1:** Codex (`gpt-5.6-sol`, high) 30 июля 2026. Шесть находок, все
приняты; четыре закрыты кодом, две — формулировками.

1. **Строка подключения снимала лимит целиком.** Драйвер накладывает разобранный
   URL поверх объекта конфигурации (`Object.assign({}, config, parse(…))`), а в
   конфигурацию попадают все query-параметры без фильтра, поэтому
   `?statement_timeout=0` не просто перекрывал значение — выключал лимит.
   Проверено замером до правки: запрос не отменяется, `SHOW statement_timeout`
   возвращает 0; `?statement_timeout=300` перекрывает на 300 мс. То есть
   обещание «выключить нельзя» держалось до первой такой строки. Параметр теперь
   вырезается из строки с предупреждением; строка, которую нельзя разобрать как
   URL (форма `host=… port=…`), не правится вслепую, но предупреждение выдаётся.
   **Уточнение к находке:** вектор `options=-c statement_timeout=0` обработки не
   требует — замер показал, что явный startup-параметр драйвера его перебивает.
2. **`true` принимался как лимит в 1 мс.** `Math.floor(Number(true))` = 1 проходил
   валидацию, а Nitro разбирает строку `true` из env в boolean — то есть опечатка
   в переменной окружения останавливала бы работу с БД целиком. Тип проверяется
   до `Number()`; в табличный тест добавлены `true`, объект и массив.
3. **Middleware авторизации подменял статус.** В database-режиме сессия читается
   перед каждым защищённым запросом, а общий `catch` превращал любую ошибку в
   `503 Auth storage is unavailable` — то есть самый вероятный путь отказа
   доходил бы до пользователя чужим статусом без машиночитаемого кода.
4. **`s3-proxy` превращал отказ в generic 500** (`normalizeBricksError` не видит
   `statusCode` у доменной ошибки), хотя поиск медиа по URL идёт в БД до
   обращения к S3.

    Пункты 3 и 4 закрыты одним помощником `rethrowStatementTimeoutError`
    (`handlerHelpers`), а не двумя копиями проверки: правило «доменная ошибка →
    готовая HTTP-ошибка» остаётся в одном месте.

5. **Расчёт «24 с против 30 с» в комментарии был неверен по существу.** Лимит
   ограничивает каждый statement, а один HTTP-запрос выполняет их несколько
   (проверка сессии, `BEGIN`, снапшот, запись, очистка, `COMMIT`), поэтому
   порядок «сервер ответит раньше клиента» лимитом не гарантируется. Комментарий
   и README переписаны: цель лимита — освободить соединение, бюджет всей операции
   живёт на стороне клиента. Само значение 8000 мс Codex признал разумным.
6. **README про пуллер вводил в заблуждение:** PgBouncer неизвестные
   startup-параметры не игнорирует, а отклоняет подключение, поэтому совета
   «задайте лимит на роли» недостаточно — параметр нужно ещё внести в
   `ignore_startup_parameters`. Раздел переписан на два рабочих варианта.

Что Codex проверил и вопросов не нашёл: перевод SQLSTATE в доменную ошибку (в том
числе таймаут на `BEGIN` и `57014` от `ROLLBACK`, не затеняющий исходную причину),
сохранность `isUniqueViolation`, отсутствие превращения 504 в 404 на SSR
published-страниц, намеренный generic 503 у readiness, разведение серверного
отказа с клиентским обрывом в publish/media/restore, размещение типов и слоистость.

**Живая проверка правок раунда 1** (тем же способом — ожидание блокировки):
защищённый запрос при заблокированной `bricks_sessions` — **504 с кодом на 8,05 с**
вместо прежнего 503; `s3-proxy` при заблокированной `bricks_media` — 504 с кодом
на 8,07 с вместо 500; запуск с `NUXT_BRICKS_DATABASE_URL=…?statement_timeout=0` —
лимит остаётся в силе (504 на 8,04 с) и в лог уходит предупреждение об
игнорировании параметра.

**Ревью, раунд 2:** Codex (`gpt-5.6-sol`, high) 30 июля 2026, по итогам правок
раунда 1. Четыре находки, все приняты; две из них показали, что защита строки
подключения из раунда 1 дырявая.

1. **Санитайзер обходился двумя способами, и оба проверены замером.**
   `?statement%5Ftimeout=0` — ранний поиск подстроки не срабатывал, а
   `URLSearchParams` декодирует `%5F` в `_`, и драйвер получал параметр: живьём
   запрос не отменялся, `SHOW statement_timeout` = 0, предупреждения не было
   вовсе. `postgresql://user@/bricks?statement_timeout=0` — `new URL` такую
   строку не разбирает, а драйвер разбирает (у него своя ветка восстановления с
   фиктивным хостом): предупреждение выдавалось, но лимит всё равно снимался.
   **Вывод, а не заплатка:** гонка грамматик неустранима — вычищать параметр из
   строки означает повторять разбор драйвера, включая его особенности. Гарантия
   перенесена туда, где строка уже не участвует: `SET` в сессии сразу после
   подключения (`onConnect`), который `pg-pool` ДОЖИДАЕТСЯ перед выдачей клиента
   (`_promiseTry(hook).then(_afterConnect)`), то есть первый запрос его обогнать
   не может. Значение уходит параметром `set_config`, а не интерполяцией в текст
   `SET`. Строка подключения больше не переписывается вовсе (это заодно снимает
   риск исказить экзотическую форму), а проверка на параметр осталась только ради
   предупреждения и ловит теперь обе формы.
2. **Первый рецепт для PgBouncer в README лимит не применял.**
   `ignore_startup_parameters` означает «принять и проигнорировать», а не
   «передать в PostgreSQL», и формулировка «если настройками пуллера управлять
   нельзя — внести параметр в ignore» противоречила сама себе. Раздел переписан:
   при прямом подключении работает как есть; с PgBouncer нужен
   `ignore_startup_parameters` (иначе подключение отклоняется) ПЛЮС лимит на роли
   или базе, а сессионный `SET` надёжен только в session pooling — в transaction
   pooling он на следующие транзакции не переносится.
3. **Отчёт сохранил уже признанный неверным расчёт** «24 с против 30 с» и
   использовал его как обоснование значения — исправлено выше.
4. **Тесты не закрепляли интеграционные правки раунда 1.** Добавлен
   `test/server/statementTimeoutSurfaces.spec.ts`: оба catch-пути (middleware
   авторизации и media-прокси) на настоящем обработчике — лимит даёт 504 с кодом,
   прочий отказ сохраняет прежние 503 и 500. Тесты строки подключения
   переписаны под новую механику (строка не переписывается; предупреждение ловит
   `%5F`-форму и форму без хоста), в конструкторе пула проверяется `onConnect` и
   его `set_config`.

Что Codex подтвердил отдельно: `PGOPTIONS` и `options=-c statement_timeout=…`
лимит не перекрывают (отдельные runtime-параметры startup-пакета применяются
после command-line options), `PGSTATEMENT_TIMEOUT` драйвер не читает; помощник не
изменил прочие ошибки; `s3-page-thumbnail` со storage-адаптером не работает.

**Мутационная проверка новых тестов** (по одной правке, каждая роняет свой кейс):
снят вызов помощника в `auth.ts` — падает кейс сессии; снят в `s3-proxy` — падает
кейс медиа-прокси; убран `onConnect` — падает кейс сессионного лимита; проверка
строки возвращена к поиску подстроки — падает кейс `%5F`-формы.

**Живая проверка правок раунда 2** (playground, dev): запуск с
`?statement%5Ftimeout=0` в строке подключения — лимит в силе, чтение под
блокировкой отменяется на 8,05 с с 504 и кодом (до правки тот же запуск давал
`SHOW statement_timeout` = 0 и неотменяемый `pg_sleep`).

**Проверки:** `type-check`, `lint:check` (oxlint + stylelint + deps + knip),
`prettier --check`, 788/788 тестов.

**Ревью, раунд 3:** Codex (`gpt-5.6-sol`, high) 30 июля 2026. Все четыре находки
раунда 2 подтверждены закрытыми; новых обходов лимита после успешного хука не
найдено. Три новые находки — все о том, что сам хук стал новой точкой отказа.

1. **Отказ хука проходил мимо обработки транзакционного пути.** `withTransaction`
   брал клиента ДО `try`, а перевод SQLSTATE в доменную ошибку стоит в `catch`
   после `BEGIN`. Отказ хука приходит именно из `connect()`, поэтому обычный
   запрос отдал бы честный 504, а транзакционная ручка — generic 500 (и без
   логирования уровня postgres-клиента). Путь стал достижимым как раз из-за
   правки раунда 2: например, маленькое startup-значение из строки подключения
   отменяет сам `set_config`. Добавлена обёртка `acquireClient` с тем же
   логированием и маппингом, что у `query`.
2. **`connectionTimeoutMillis` до хука не достаёт.** `pg-pool` снимает таймер
   подключения сразу после `client.connect()` и только потом ждёт хук
   (`pg-pool/index.js:266` против `:288`), поэтому зависший `set_config` держал бы
   ожидающего без всякого потолка, а соединение — учтённым в пуле: тот же дефект
   исчерпания пула, ради которого пункт и заводился. Установка обёрнута в
   `withPromiseDeadline` с бюджетом `connectionTimeoutMillis`; отказ хука пул
   обрабатывает сам — уничтожает соединение и освобождает слот.
3. **«Игнорируется» было неточным обещанием.** Значение из строки подключения
   реально доезжает в startup-пакете и действует ДО установки настроенного
   лимита: очень маленькое способно отменить саму установку, синтаксически
   невалидное — сорвать подключение раньше хука. README и текст предупреждения
   переформулированы на «перекрывается после подключения, параметр лучше убрать».

Подтверждено Codex отдельно: лишний round-trip выполняется только для нового
физического соединения (повторная выдача idle-клиента идёт мимо хука), обхода
хука нет ни у `pool.query`, ни у прямого `connect()`; текст про PgBouncer
соответствует официальной документации, включая несовместимость `SET` с
transaction pooling; спек catch-путей действительно проверяет код, а не моки.

**Тесты** (+2, 790 всего): зависшая установка лимита отклоняется по бюджету
соединения (фейковые таймеры), отказ выдачи соединения доходит до транзакции тем
же классом ошибки. Мутации: возврат `clientPool.connect()` вместо `acquireClient`
роняет второй кейс, снятие дедлайна — первый (тест виснет до собственного
таймаута vitest).

**Проверки:** `type-check`, `lint:check`, `prettier --check`, 790/790 тестов.

**Ревью, раунд 4:** Codex (`gpt-5.6-sol`, high) 30 июля 2026. Две находки.

1. **Лимит не работал бы на части разрешённого диапазона драйвера — и молча.**
   Механизм опирается на хук выдачи соединения, а peer-диапазон допускал
   `pg ^8.16.0`. Проверено по реестру: `onConnect` появился в `pg-pool@3.13.0`
   (в 3.10.1–3.12.0 упоминаний нет, реализация в 3.13.0 идентична нынешней —
   промис хука дожидается, при reject соединение уничтожается), а `pg-pool@3.13`
   приходит с `pg@8.20.0`. На `pg@8.16` опция игнорируется без единого сигнала:
   клиент выдаётся сразу, `set_config` не выполняется, и `?statement_timeout=0`
   снова снимает лимит — при том что README обещает обратное. Нижняя граница
   peer-диапазона поднята до `^8.20.0`; чтобы это не откатилось молча, добавлен
   guard `test/module/pgPeerRange.spec.ts` с объяснением, почему граница — часть
   контракта, а не вкусовщина. **Это изменение чужой зависимости** (сужение
   диапазона), сделано осознанно: без него обещание пункта не выполняется.
2. **README сохранял отвергнутое слово.** Абзац начинался с «Точнее
   „игнорируется“», хотя раунд 3 признал формулировку неверной — переписано на
   «Полностью параметр не игнорируется».

Принято как улучшение (не находка): бюджет установки лимита получил собственное
имя `STATEMENT_TIMEOUT_APPLY_TIMEOUT_MS` — величина прежняя, но теперь видно, что
это ВТОРОЙ последовательный потолок и получение пригодного соединения в худшем
случае занимает их сумму.

Что Codex проверил и признал верным: бюджет в две секунды разумен (к моменту хука
соединение уже установлено, медленный старт БД проявляется раньше — на фазе
подключения); обычный `Error` для дедлайна корректнее доменной ошибки лимита
(серверный лимит при этом не срабатывал), а отдельный 503 имело бы смысл вводить
только общим классом недоступности хранилища вместе с исчерпанием пула и сетевыми
отказами — то есть за объёмом пункта; `acquireClient` не изменил прочие отказы,
кроме добавленного логирования; утечки после дедлайна нет — пул уничтожает
соединение, а драйвер рвёт сокет при активном запросе.

**Проверки:** `type-check`, `lint:check`, `prettier --check`, 791/791 тестов.
Мутация guard'а: возврат границы к `^8.16.0` роняет кейс.

---

### BM-30 — BM-33. Тихие отказы билдера доведены до пользователя

**Выполнено 30 июля 2026 года.** Четыре пункта одного класса — хвост BM-28,
заведённый его же ревью. Стратегия согласована с Codex (`gpt-5.6-sol`, high) до
реализации, в расширенном формате «способ починки — радиус — регресс — проверка»;
два решения владельца зафиксированы ниже.

**BM-30. Импорт схемы больше не выдаёт известные картинки за новые.**
`useSchemaImageResolver` глотал отказ `loadItems` и сравнивал URL схемы с пустым
списком. Признака «сравнение не выполнено» было мало: при неизвестном составе
медиатеки `newImages` — это просто все URL схемы, и заголовок «Найдены новые
изображения» с выбором «оставить/заменить заглушкой» остаётся ложным даже с
предупреждающей плашкой (поправка Codex к моему первому варианту, принята
владельцем). Теперь модалка показывается **только после достоверного сравнения**,
а при недоступной медиатеке схема импортируется без изменений и одним тостом
сообщается, что проверка не выполнялась. Тост один: показать следом обычный
«схема импортирована» значило бы стереть предупреждение — toast синглтонный.

Достоверность отслеживает медиа-стор: `hasLoadedItemsSnapshot` поднимается только
принятым ответом `loadItems`. `items.length > 0` для этого не годится — загрузка
файла кладёт его в список локально, до всякого GET'а. Проверка стоит и **после**
`await`: вытесненный latest-wins запрос завершается без ошибки и без применения
ответа, то есть его «успех» означал бы сравнение с прежним списком. Отказ снимок
не отменяет — последний удачный ответ остаётся достоверным. Побочно: схема без
изображений больше не запрашивает медиатеку вовсе.

**BM-31. Недоступное хранилище черновиков видно сразу.** Решение владельца:
проба на входе плюс реакция на отказ записи. Проба (`setItem`/`removeItem` по
служебному ключу) идёт на готовности сессии — запрет данных сайта иначе
обнаружился бы только через окно debounce после первой правки, когда пользователь
уже работает, считая правки защищёнными. Отказ `setBuilderDraft` по ходу работы
ведёт в тот же однократный тост; сам автосейв не выключается — запрет может быть
снят, и следующая попытка пройдёт. Латч — по токену сессии, а не по экземпляру
страницы: переход между страницами билдера страницу не размонтирует (статический
page key), и один флаг предупредил бы только о первой.

Отдельно закрыт край, которого не было в тексте пункта: `getItem` и `removeItem`
стояли вне `try`. При запрещённом хранилище исключение из `getBuilderDraft`
выходило прямо из bootstrap'а сессии — вместо редактора пользователь получал
блокирующий экран отказа, и всё это из-за черновика. Владелец при этом справедливо
заметил, что переполнение квоты (5 МБ) схемой лендинга практически недостижимо:
основной реальный сценарий — именно запрещённое хранилище, и его ловит проба.

**BM-32. Пропущенные брики видны, а не молча исчезают.** `useComponentLibrary`
одинаково гасил два разных случая — промах glob'а (`loader-missing`) и отказ
импорта модуля (`import-failed`) — и просто выбрасывал элемент. Теперь оба
возвращаются наружу списком с причиной, а сайдбар показывает их отдельным блоком:
рядом с блоком отказа ручки, а не вместо него. Ответ с пропусками считается
**успешным** (фиксируется снимком, наполняет кеш модалок, `isComponentLibraryLoadFailed`
не поднимает): ручка ответила и разобрана, а повтор пропуски не вернёт — лоадеров
в готовой сборке не прибавится. Список и пропуски берутся из одного снимка, иначе
на экране оказались бы компоненты одной загрузки и предупреждение от другой. В
dev к `loader-missing` добавляется подсказка про перезапуск сервера; тост при
входе — один, приоритет у отказа ручки (он свежее и чинится повтором).

**BM-33. Операции записи принадлежат своей сессии.** Решение владельца — вариант
владения в сторе плюс запрет второй записи. `isSubmitting` стал getter'ом над
списком id незавершённых операций (`utils/activeWrites.ts`): `beginWrite` отказывает,
если запись уже идёт, `endWrite` снимает **свою** операцию, смена сессии
(`useBuilderSession`, там же где инвалидация токена) вычищает список целиком.
Счётчик id монотонный и при сбросе не обнуляется — повторно выданный id позволил
бы позднему завершению прежней операции снять новую. Заявка на запись стоит **до**
валидации и до подмены формы у Save as Copy: второй вызов иначе переписал бы
сообщения формы первого, а «оригинал» для отката снял бы с уже подменённого
состояния. В `useBuilderPageWrite` добавлен ранний выход — без него отказ guard'а
неотличим от неудачи записи и показывал бы ложный тост поверх идущего сохранения.

Проверка исходного тезиса: две страницы с одним слагом двойной клик не создаст —
`pagename VARCHAR(255) UNIQUE NOT NULL` (`migrations/0001_init.sql`), да и `disabled`
успевает примениться между кликами мыши (Ctrl+S в билдере нет). Ценность guard'а
в другом: он не зависит ни от отрисовки, ни от прямого вызова action'а. Реально
воспроизводима вторая половина дефекта — операция прежней страницы, завершаясь,
снимала индикатор у записи на открытой.

**Побочно.** `publish.ts` перевалил лимит `max-lines` (500): выделены
`utils/activeWrites.ts` (реестр записей) и `utils/pageLibraryWrite.ts` (создание
и дублирование страниц вне сессии редактора), сборка формы редактирования уехала
в `formState.buildEditFormState`. Инлайновый тип резолвера перенесён в
`media/types/`, тип пропущенного брика — в `builder/core/types/`: им пользуются и
`app`, и `shell`, а импорт из composition root'а в shell запрещён слоистостью.

**Живая проверка (playground, dev).** Пропуски воспроизведены подменой манифеста
записями без файлов: блок в сайдбаре виден в обеих темах, dev-подсказка на месте,
блок отказа при этом не показывается. Запрет `localStorage.setItem` даёт тост
сразу при открытии страницы, редактор остаётся рабочим (канвас на месте, экрана
ошибки нет). Импорт схемы при 500 от ручки медиа: модалка не открывается, тост —
ровно один, с текстом о невыполненной проверке. Два вызова «Сохранить» подряд
дают **один** PUT и один success-тост.

**Ревью Codex по факту правки: пять находок, все приняты и закрыты.**

1. **Заявка на запись открывалась до `try`.** `beginWrite()` стоял перед
   валидацией, а `finally` начинался ниже: исключение валидатора оставило бы
   запись активной навсегда — кнопки заблокированы до перезагрузки редактора. И
   это не гипотетический throw: форма приходит в том числе из черновика
   localStorage (`JSON.parse` без проверки типов), а `normalizeFormState`
   заполняет пропуски дефолтами, но типы не приводит — нестроковый `urlPrefix`
   доходит до `.trim()` в валидаторе. Теперь всё после заявки — под общим
   `finally`, у обеих операций.
2. **Резолвер мог открыть модалку прежней страницы.** Между стартом и модалкой
   стоит ожидание списка медиатеки, и в этом окне гасить нечего: `pendingPromise`
   ещё не создан, поэтому сброс поверхностей при смене сессии проходил мимо.
   Ответ, доехавший после перехода, открывал модалку со схемой прежней страницы
   поверх новой. Добавлено поколение резолвинга: `handleCancel` его поднимает,
   продолжение после `await` сверяет. Тем же механизмом закрыт второй край из
   находки — новый импорт до ответа на модалку переписывал `pendingPromise`, и
   промис первого не завершался никогда.
3. **Отказ `removeItem` снова был тихим.** Удаление черновика зовут в трёх
   местах (stale-запись, фиксация сохранённого, отказ от восстановления), и
   молчаливый отказ означал бы, что уже отклонённый черновик снова предложат при
   следующем заходе. `removeBuilderDraft` возвращает исход.
4. **Латч уведомления обходился на уходе со страницы.** Хуки очистки идут в
   порядке регистрации: dispose сессии (инвалидация токена) зарегистрирован
   раньше, чем сброс черновика в persistence, — то есть финальная запись
   захватывала уже новый токен и латч пропускал её как «новую сессию». Тост при
   недоступном хранилище появлялся бы поверх дашборда. Латч вместе с признаком
   «страница ещё на экране» вынесен в `app/utils/draftStorageNotice.ts` — общий
   на всех, кто работает с этим хранилищем (это же закрыло находку 3: сессии
   теперь есть куда сообщать).
5. **`font-size: 1.1rem`** — нарушение шага 0.2rem, заменено на `1rem`.

Каждая находка перепроверена по коду до правки; по первым четырём добавлены
различающие тесты, мутации валят их (валидация вне общего `finally`; снятая
проверка поколения; новый импорт без завершения начатого; уведомление, не
гаснущее на уходе; молчащий `removeBuilderDraft`).

**Второй раунд ревью: четыре находки, все приняты.** Первые три показали, что
починки первого раунда закрыли пункты не до конца.

1. **Исключение подготовки уходило наружу мимо контракта.** Общий `finally`
   владение освобождал, но само исключение по-прежнему летело из
   `publishCurrentPage` наружу — а вызывающий его не ловит (сохранение просто
   `await`-ится), при том что контракт обещает «ID страницы или `null` при
   ошибке». Пользователь вместо сообщения получал необслуженный промис. Теперь
   участок после заявки накрыт общим `try/catch/finally`: исключение подготовки
   становится обычным отказом с сообщением в форме, у копии — ещё и с откатом
   формы. Тесты переписаны с `rejects.toThrow()` на проверку отказа.
2. **Ещё один тихий путь удаления.** Ветка автосейва «черновик совпал с
   сохранённым» игнорировала исход `removeBuilderDraft`. Совпадение временное:
   после следующей правки черновик снова разойдётся с сохранённым и при новом
   заходе предложит восстановление.
3. **Миграция ключа оставалась тихой.** Если запись под новым ключом прошла, а
   удаление старого нет, автосейв дальше пишет по новому ключу и о поломке никто
   не узнаёт — а черновик под прежним слагом позже воскреснет.
   `migrateBuilderDraft` теперь возвращает типизированный исход, отличающий
   отказ хранилища от занятого целевого ключа (второе — обычная ситуация), и
   `useBuilderPagename` сообщает через тот же общий notice.
4. **`as unknown as` в новых тестах** — прямой запрет проекта; повреждённое
   значение формы ставится через `Reflect.set`.

Порядок хуков очистки Codex проверил отдельно и подтвердил: Vue выполняет
`onScopeDispose` в порядке регистрации, production-код и тестовый харнесс
совпадают, ранний `notice.stop()` действительно гасит финальный сброс. В
поколении резолвера и монотонных id записи новых дефектов не нашлось.

**Третий раунд: одна находка и один тестовый пробел, оба приняты.**

1. **Отказ хранилища смешивался с повреждённым черновиком.** Общий `catch`
   миграции накрывал и `JSON.parse`, поэтому нечитаемая запись возвращала
   `storage-unavailable` — и пользователь получал сообщение о запрете
   localStorage, которого не было. Разбор вынесен в свой `try`: переносить
   нечего, но хранилище тут ни при чём.
2. **Проводка исхода миграции не различалась тестами** — снятие вызова notice в
   `useBuilderPagename` не уронило бы ни один кейс. Добавлены два
   интеграционных: отказ переноса при rename сообщается ровно один раз и не
   срывает саму навигацию; занятый целевой ключ — не отказ хранилища.

Остальное третий раунд подтвердил: расширенный `catch` лишнего не глотает,
владение записями и откат формы согласованы, порядок инициализации в composition
root верный.

**Четвёртый раунд: две находки, обе приняты.**

1. **Упавший запрос вытесненного импорта клал свою схему на канвас.** Проверка
   поколения стояла только после успешного `loadItems`, а ветка отказа
   возвращала схему сразу. Сценарий: первый импорт ждёт медиатеку, пользователь
   запускает второй (без изображений) — тот применяется немедленно, — затем
   запрос первого падает, и его схема ложится поверх новой. Токен сессии это не
   отсекает: сессия та же, вытеснение произошло внутри неё. Проверка поколения
   стала общей для обоих исходов запроса.
2. **Повреждённый черновик всё ещё мог сойти за отказ хранилища.** Отдельный
   `try` вокруг `JSON.parse` закрыл только синтаксически неверный JSON: `null`
   разбирается успешно, а присваивание поля ему бросает уже после разбора.
   Добавлена проверка формы разобранного значения.

После этого раунд подтвердил остальное: проводка `renameSession`, владение
записями, порядок инициализации и оба новых интеграционных теста корректны.

**Пятый раунд: находок нет** — правки четвёртого проверены (проверка поколения
накрывает оба исхода запроса и стоит до возврата схемы; не-объекты отсекаются до
внешнего `catch` хранилища), новых краёв не найдено, задача признана закрытой.

**Проверки:** `type-check`, `lint:check` (oxlint + stylelint + deps + knip),
`prettier --check`, 824/824 теста (добавлено 27 в девяти спеках), `dev:build`,
бюджеты бандла (entry 112 KB при 122, published 123 KB при 132). Кейсы про
недоступное хранилище выделены в `test/builder/draftStorageFailure.spec.ts` —
общий спек черновиков перевалил лимит `max-lines`. Мутации прогнаны
по каждому пункту и валят соответствующие кейсы: снятие запрета второй записи;
`endWrite`, чистящий весь список; сброс счётчика id вместе со списком; guard после
подмены формы копии; отсутствие очистки записей при смене сессии; возврат
`catch {}` в резолвере; снимок медиатеки, поднятый вытесненным ответом или
загрузкой файла; отсутствие пробы хранилища; латч по экземпляру вместо токена;
молчащий `setBuilderDraft`; `getItem` вне `try`; пропуски, снова отброшенные молча;
ответ с пропусками, не попадающий в снимок; пропуски из свежего `data` вместо
общего снимка.

### BM-19, BM-11. Метаданные бриков приезжают из манифеста, категория больше не регулярка

**Выполнено 31 июля 2026.**

Метаданные (`category`, `description`, `values`, `slots`) читаются на build-time
разбором исходника brick-файла и уезжают в манифест. Билдер перестал импортировать
brick-модули ради данных: карточки библиотеки, панель свойств, слоты,
inline-редактирование и список forceRender-пропов живут из одного индекса,
собранного из ответа ручки компонентов.

**Разбор — AST, без исполнения модуля** (`src/brick-literals.ts`,
`src/brick-metadata.ts`, типы — `src/types/brick{Literals,Metadata}.d.ts`).
Парсер — `oxc-parser`, заявленный прямой зависимостью: полагаться на его
транзитивное присутствие через Nuxt нельзя (изолированная раскладка pnpm его из
пакета не резолвит), а `typescript` ради полусотни строк разбора весит 23 МБ
против 1.4 МБ. Исполнение модуля отклонено: brick-файл импортирует `.vue`, то
есть потребовало бы Vite-конвейера, которого в prod-сборке нет.

Язык метаданных закрытый: строка, конечное число (в том числе со знаком),
boolean, `null`, шаблон без подстановок, массив и объект без spread, вычисляемых
ключей, методов и геттеров; `__proto__` запрещён на любой глубине. Всё остальное
— ошибка сборки с файлом, позицией и путём до поля (`brick.values.headline.default`).
Это же закрывает второе условие пункта: метаданных, вынесенных в импортируемую
константу, теперь просто не существует, поэтому хеш по содержимому одного файла
к ним больше не слеп. Проверяется верхний уровень целиком (spread мог бы
перекрыть любое из четырёх полей), но значения читаются только у них —
`dataSources` с функциями обязаны проходить и проходят.

`values` стало обязательным полем brick-файла (пустой объект, если свойств нет):
без него запись манифеста молча выглядела бы как исправный брик без свойств.
Слоты нормализуются здесь же, поэтому оба рантайм-нормализатора (`extractBrickSlots`
и `normalizeBrickSlots` внутри `useComponentSlots`) удалены.

**Дубли, снятые заодно.** `selectSelf` и дерево схемы собирали свойства каждый
своим кодом — теперь оба зовут `useComponentEditorMetadata`. `useSidebarBrickDescription`
удалён целиком: описание приезжает вместе с выбором компонента и лежит в сторе,
второй загрузки того же значения панели не нужно. `import-failed` ушёл из причин
пропуска — библиотека модулей не импортирует, падать на импорте нечему, поэтому
`ISkippedBrick` остался без поля `reason`.

**Что нашло ревью Codex и что с этим сделано:**

- `useCanvasItemLoader` читал `values.*.forceRender` из модуля — пропущенный
  потребитель метаданных, переведён на индекс. Заодно снят лишний перерендер:
  появление списка forceRender-пропов само по себе компонент больше не пересоздаёт.
- Библиотека монтировалась под `v-show` при закрытой панели (а закрыта она на
  входе по умолчанию), поэтому карточки грузили все brick-модули с их
  Vue-компонентами и стилями независимо от переезда метаданных. Содержимое
  сайдбара теперь монтируется по факту первого открытия; обратно латч не
  снимается, чтобы закрытие не теряло поиск и прокрутку.
- Ошибка разбора нового brick-файла ушла бы в `build:before` уже перезапущенного
  инстанса и унесла бы dev-сервер. Теперь `add`/`unlink` сначала прогоняют
  пробный скан и только потом зовут рестарт; несостоявшийся рестарт запоминается
  и догоняется первой удачной генерацией, иначе брик остался бы без лоадера до
  ручного перезапуска. Ошибка показывается оверлеем Vite и строкой в терминал.
- Панель свойств, открытая до прихода манифеста, наполняется удачным повтором
  загрузки — через узкое действие стора, которое не открывает свёрнутую панель и
  срабатывает, только если выбран тот же компонент.

**Отката на импорт brick-модуля при отсутствии метаданных нет намеренно:** второй
источник тех же данных расходился бы с первым — ровно то, от чего уходили. Пока
манифест не дошёл, панель свойств, слоты и inline-редактирование пусты, а
библиотека показывает отказ с повтором.

**Хеш так и остался без потребителя, и это решение, а не недоделка.** Обновление
библиотеки в dev по сверке хешей отложено: после первого превью или появления
брика на канвасе `.brick.ts` лежит в графе модулей Vite, и его правка вызывает
перезагрузку страницы независимо от нашего события. Отдельный механизм имеет
смысл только вместе с HMR-границей, то есть после спайка, а не до.

**Второй раунд ревью Codex — шесть находок, все подтверждены по коду и закрыты:**

- **Числа вне JSON-диапазона искажались молча.** `1e999` разбирался в `Infinity`
  и публиковался как `null`, `-0` после round-trip становился обычным нулём.
  Теперь оба отвергаются: тихо подменённое значение по умолчанию хуже отказа
  сборки, потому что его никто не заметит.
- **`__proto__` был запрещён не на любой глубине:** верхний уровень объекта
  `brick` проверку обходил. В объектном литерале это не поле, а установка
  прототипа, поэтому исполненный модуль показывал бы унаследованные `category` и
  `dataSources` там, где разбор видит их отсутствие. Проверка переехала внутрь
  чтения имени ключа — теперь она одна на все уровни, а не копия на каждом.
- **Повторно упавший отложенный рестарт забывался:** признак снимался до
  `callHook('restart')`, и реджект рестарта на событии `change` не возвращал его
  обратно — карта загрузчиков осталась бы старой до ручного перезапуска. Признак
  снимается только после удачного рестарта.
- **Clipboard оставался вторым снимком метаданных:** копия хранила свои
  `properties`/`description`, и вставка выбирала компонент именно с ними. Отсюда
  сценарий: манифест не дошёл → компонент скопирован с пустой панелью → повтор
  загрузки наполнил открытую панель → вставка снова открывает пустую. Снимок
  больше не несёт метаданных, вставка резолвит их тем же общим резолвером.
  Проверено вживую: копирование и вставка идут из store-экшена, то есть вне
  setup-контекста, и `useState` там доступен — ошибок в консоли нет, панель после
  вставки заполнена.
- **`export let brick` принимался:** разбор читает объявление, а переприсваивание
  ниже по файлу меняет то, что увидит рантайм. Теперь требуется `const`.
- **Синтаксическая ошибка сообщалась без позиции** — теперь берётся из первой
  метки ошибки oxc. Позицию конкретного поля слота (`label`/`allowMultiple`)
  оставили внешней, по свойству `slots`: путь в сообщении поле уже называет, а
  протаскивание AST-узлов через нормализацию вернуло бы связь, которую эта
  нормализация как раз и разрывает.

**Третий раунд ревью — механика отложенного рестарта переделана, потому что лечила не то.**

Ревью нашло гонку: обработчики `builder:watch` идут конкурентно, и удачно
завершившийся рестарт снимал признак, выставленный более поздним упавшим событием.
Проверка показала, что дело хуже и одновременно проще: признак жил в замыкании
setup модуля, а рестарт создаёт новый инстанс Nuxt с новым замыканием — то есть
никакое межинстансное состояние там не работает в принципе, и предложенное
поколение рестарта его бы не спасло.

Поэтому убрано и состояние, и пробный скан:

- `add`/`unlink` снова рестартуют безусловно — состав `import.meta.glob`
  пересобирает только рестарт, и откладывать его незачем;
- `build:before` в dev больше не роняет загрузку инстанса на неразобранном
  brick-файле: ошибка уходит в терминал и оверлей, на диске остаётся прежний
  манифест, редактор продолжает работать на нём. В сборке ошибка по-прежнему
  фатальна — прод без манифеста уезжать не должен.

Заодно исчезла вторая находка того же раунда: в published-only режиме (билдер
выключен, published-страницы включены) отложенный рестарт не догонялся никогда,
потому что ветка `change` отсекалась по `!isBuilderEnabled`. Догонять больше
нечего.

Проверено вживую на фикстуре: dev поднимается при уже битом brick-файле (сервер
отвечает, ошибка с позицией в терминале, отдаётся прежний манифест); битое
добавление на живом сервере рестартует инстанс, но не убивает его; починка через
`change` добирает запись в манифест, и добавленный файл отдаётся Vite как модуль —
то есть карта загрузчиков пересобралась.

Остальное из третьего раунда: вставка из клипборда резолвит метаданные до записи в
стор (иначе исключение резолвера оставило бы изменённую схему и историю без
выбранного компонента); ограничение «читается значение литерала в объявлении, а не
результат последующих мутаций объекта» задокументировано в README как осознанная
граница контракта — `const` запрещает переприсваивание binding, но не мутацию.

**Проверки:** `type-check`, `lint:check`, `deps:check`, весь набор Vitest,
`dev:build` и бюджеты бандла — зелёные. Мутации прогнаны: возврат регулярки
вместо разбора перестаёт валить кейс с константой в категории; рекурсивный обход
`dataSources` валит кейс с функциями; снятие обновления выбранного компонента и
снятие реактивности слотов по индексу валят интеграционные кейсы позднего
манифеста.

---

## P2

### BM-07. Логирование промаха: дорогое и неинформативное

**Файл:** `src/runtime/modules/common/composables/useBrickImports.ts` —
`findImportModule`.

**Дорого.** На каждый промах сериализуются все ключи glob'а, при том что
вызывающие логируют тот же промах отдельно. Published-страница с несколькими
устаревшими компонентами выведет всю библиотеку по многу раз — и на SSR,
и на клиенте.

**Неинформативно.** Промах при наличии записи в манифесте — это ровно симптом
рассинхрона glob'а и манифеста, тот самый, с которого начался этот рефакторинг
(`[BricksBuilder] No loader for …`). Починить рассинхрон в рантайме невозможно в
принципе — `import.meta.glob` разворачивается на этапе трансформации, добавить
лоадер в готовую карту нельзя.

**Что изменилось после переезда метаданных (31 июля 2026).** Библиотека
компонентов больше не логирует промах вовсе: она сверяет обе стороны молчаливым
`hasBrickModule` и показывает пропуски блоком в сайдбаре, с подсказкой про
перезапуск dev-сервера. То есть половина пункта — «в билдере писать действие
явно» — закрыта интерфейсом, а не сообщением в консоль. Осталась вторая:
дорогое сообщение в `findImportModule`, которое теперь зовут только настоящие
загрузки (канвас, превью карточки, рендерер).

**Исправление:** логировать запрошенный путь и количество ключей; полный список
— под `import.meta.dev`. Короткое замыкание на `layout*` оставить как есть.

**После BM-12** это больше не страховка от отвалившейся инвалидации (её нет —
состав glob'а пересобирает рестарт), а просто внятная диагностика на случай
ручного рассинхрона, например устаревшего `brickPath` в сохранённой схеме
страницы. Ценность ниже, но правка та же и стоит ноль.

### BM-17. Инлайновые типы композаблов вне домена `common`

**Источник:** ревью Codex (`gpt-5.6-sol`, high) правки BM-08, список
перепроверен грепом. BM-08 закрыл `common/composables/` — там правило №1
локального README требовало этого прямо. В остальных доменах то же правило
(`.claude/rules/naming.md`, раздел «Файлы типов и утилит») нарушалось в десяти
композаблах: тип объявлен в самом файле, а не в `types/` домена. У части файлов
инлайн не только Return-, но и Options-интерфейс, часть объявлений даже не
экспортируется.

**Файлы (осталось восемь).** Два закрыты по ходу BM-28 — правки касались этих же
файлов, и оставлять в них инлайн было нельзя: `usePublishPageVersions.ts` и
`usePublishVersionRestore.ts` (типы переехали в
`builder/publish/types/composables.d.ts`, туда же добавлен тип ожидающего
подтверждения отката).

Остались: `builder/publish/composables/usePublishDetailsUrl.ts:8`, `:14`,
`usePublishPreview.ts:15`,
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
