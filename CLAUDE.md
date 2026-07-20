# fmc_frontend — правила проекта

SvelteKit (Svelte 5 runes) + Tailwind 4 + shadcn-svelte, статическая SPA-сборка
(`@sveltejs/adapter-static`, `fallback: 'index.html'`). Бэкенд — соседний репозиторий
`fmc_pocketbase` (PocketBase); адрес берётся из `VITE_PB_URL`, а без неё — same-origin
(`location.origin`): в dev это работает через прокси `/api` → PocketBase в `vite.config.js`,
на проде — через Caddy на одном домене с бэкендом (см. `fmc_pocketbase/README.md`).

Приложение: лендинг (`/`), маркетплейс (`/market`, `/my`), редактор циферблатов (`/editor`,
с BLE-подключением к CMF Watch Pro 2) и авторизация (`/login`, `/register`).

## Архитектура

Модульная структура как в gymmate — весь код на TypeScript:

```
src/lib/
  shared/
    api/          # PocketBase-клиент (pb, fileUrl, downloadUrl)
    helpers/      # cn() + типы-хелперы shadcn (WithElementRef и т.п.)
    components/   # app-sidebar, nav-user, site-header + ui/ (shadcn)
  modules/<feature>/   # auth, market, editor, device
    model/        # <feature>.model.ts + index.ts (export * as fooModel)
    lib/          # доменные библиотеки модуля (editor: wf, render, facer; device: ble)
    components/   # компоненты модуля
    pages/        # страницы + index.ts (export { default as FooPage })
src/routes/       # тонкие: импортируют страницу из модуля и рендерят
```

- **Вся логика — в effector-моделях** (`modules/*/model/*.model.ts`). Компоненты — только
  view: `import { editorModel } from '../model'`, деструктуризация сторов/событий сверху,
  подписки `$store`. Бизнес-логику и загрузку данных в компонентах не писать.
- Типы домена: `Face`, `FaceNode`, `Resource` — в `modules/editor/lib/wf.ts`;
  `Sim`, `Hit` — в `modules/editor/lib/render.ts`.
- `checkJs` выключен: строгий TS для `.ts`, `<script>` в svelte-компонентах — обычный JS.
- Кросс-модульные импорты — через барели: `$lib/modules/auth/model`, `$lib/modules/device/model`.

## Конвенции effector

- Busy-флаги — из `someFx.pending`, ручные `$state`-флаги не заводить.
- Ошибки эффектов — через `fail`/`failData` в стор ошибок (`errored` в editor, `marketErr` в market).
- Fire-and-forget вызовы эффектов в компонентах — с `.catch(() => {})`, ошибка уже обработана в модели.
- Модель редактора: дерево `face` мутабельное, но каждое изменение идёт через событие
  (`patched`, `treeChanged`), которое возвращает новый корень стора — так обновляется UI.
  Канвас рисуется через rAF и читает `editor.getState()`, не подписку.
  Undo/redo-стеки живут вне стора, в сторе только счётчики `undoN`/`redoN`.

## UI

- shadcn-svelte: компоненты в `lib/shared/components/ui`, семантические токены
  (`bg-background`, `text-muted-foreground`), без ручных `dark:`-оверрайдов цветов.
- Тема автоматическая: `dark:` работает через `prefers-color-scheme` (дефолт Tailwind 4),
  тёмные токены в `@media (prefers-color-scheme: dark)` в `app.css`. Класс `.dark` на
  `<html>` не вешать, `@custom-variant dark` не возвращать.
- Catalog-диалог в редакторе удалён намеренно — не восстанавливать. Каталожные циферблаты
  видны в общем маркетплейсе.
- bits-ui выставляет атрибут `data-state="checked|unchecked|active|..."`, а не
  `data-checked`/`data-active` — мэппинг сделан кастомными Tailwind-вариантами в `app.css`
  (`@custom-variant data-checked (&[data-state="checked"])` и т.п.). Если добавляешь новый
  shadcn-компонент с `data-active:`/`data-checked:` в классах — он не будет работать, пока
  вариант не заведён так же.

## Bluetooth (device/lib/ble.ts)

- Паринг с часами полностью в браузере — `SERVICES` в `ble.ts` должен перечислять **все**
  GATT-сервисы, которые нужны рантайму: Web Bluetooth отдаёт через `getPrimaryServices()`
  только то, что явно объявлено в `optionalServices` при `requestDevice()`, даже если
  фактически на устройстве сервисов больше (проверяется через `chrome://bluetooth-internals`,
  где видно всё в обход этого ограничения).
- shell/pairing-сервис живёт под UUID `77d4e67c-...` на проверенном экземпляре часов, а не
  `77d4ff00-...`, как предполагала старая документация протокола — его дочерние характеристики
  (`77d4ff01`/`77d4ff02`) при этом не поменялись. Не проверено на других физических часах:
  если паринг перестанет находить shell-сервис — искать актуальный UUID тем же способом
  (`chrome://bluetooth-internals`) и добавлять в `SERVICES`.
- Никакого дев-бриджа/внешнего процесса не требуется — паринг (`AT GETSECRET` →
  `authPairReq`/`authPairRep` → сессионный ключ) идёт целиком через Web Bluetooth.

## Стиль

- Ponytail: минимальные решения, stdlib/платформа прежде зависимостей, короткие диффы.
  Осознанные упрощения помечать комментом `ponytail:` с указанием потолка и пути апгрейда.
- Комментарии в коде — на русском или английском, как в окружающем файле.
