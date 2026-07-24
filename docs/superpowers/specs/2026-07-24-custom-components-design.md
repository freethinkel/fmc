# Свои компоненты вместо shadcn-svelte + Tailwind

Дата: 2026-07-24. Ветка: `rewrite-components`.

## Цель

Полностью убрать shadcn-svelte, bits-ui и Tailwind. Заменить их на собственные
компоненты и систему стилей по образцу проекта friendzone
(`~/Developer/dev/appstore/friendzone/friendzone/packages/friendzone`):
scoped CSS, минимальный набор токенов, oklch-производные оттенки, spring-анимации.
Заодно — редизайн под визуальный язык friendzone и новый layout без sidebar.

## Решения (зафиксированы с пользователем)

- **Визуал**: стиль friendzone — палитра из 4 токенов, скругления, spring-easing.
  Бренд-оранжевый `#ff5c00` остаётся как `--color-accent`.
- **bits-ui**: выпиливается полностью. Поведение — на нативных платформенных
  примитивах (`<dialog>`, `<select>`, absolute-позиционирование для меню).
- **Layout**: вместо sidebar — топ-бар (лого + Market / My / Editor + avatar-меню)
  на десктопе, нижний таб-бар на мобиле. Редактор почти полноэкранный.
- **CSS tooling**: Lightning CSS через встроенную поддержку Vite
  (`css.transformer: 'lightningcss'` + targets, минификация им же).
  Без PostCSS-конфига.

## 1. Стилевой фундамент

- `src/lib/styles/tokens.css` — заменяет `src/theme.css` и `src/app.css`:
  - `--color-accent: #ff5c00`, `--color-text`, `--color-background`,
    `--color-error`, `--border-radius: 12px`, `--font-family`,
    `--spring-transition` (linear()-кривая, копируется из friendzone
    `src/lib/styles/common.css`).
  - Тёмная тема: `prefers-color-scheme` + `color-scheme: light dark`.
    Без `.dark`-класса (как и сейчас — правило из CLAUDE.md сохраняется).
- Оттенки не заводятся отдельными токенами — выводятся:
  `oklch(from var(--color) l c h / 12%)` и т.п.
- Компоненты: `<style>` (scoped), нативный CSS-nesting; вариант компонента
  задаёт локальную `--color`, остальное — производные.
- Шрифты: системный rounded-стек для UI, Unbounded — только display/лого.
- Runtime-темы friendzone (селектор тем) — не переносим (YAGNI); архитектура
  токенов позволяет добавить позже.
- Vite: включить `css: { transformer: 'lightningcss', lightningcss: { targets } }`
  и `build: { cssMinify: 'lightningcss' }`, дев-зависимость `lightningcss`.

## 2. Компоненты

Место: `src/lib/shared/components/<name>/<name>.svelte` + `index.ts` барели.
Контракт авторинга (как во friendzone): Svelte 5 runes, типизированный
`interface Props`, `Snippet` children через `{@render}`, callback-пропсы
(`onClick`, `onChange`), без event dispatcher'ов.

Пишем:

| Компонент | База |
|---|---|
| button | `<button>`, варианты через `--color` |
| input, textarea | нативные, токен-стили |
| field | label + input + error для форм |
| badge, card, skeleton | простая разметка + CSS |
| avatar | `<img>` + фолбэк-инициалы |
| switch, checkbox | скрытый нативный `<input>` + стилизованная обёртка (паттерн friendzone switch) |
| select | стилизованный нативный `<select>` |
| tabs | кнопки + state, без ARIA-машинерии |
| dialog | нативный `<dialog>` (top-layer, focus trap, Esc бесплатно); drawer-вариант закрывает бывший sheet |
| menu | дропдаун: `position:absolute` в relative-родителе, закрытие по клику снаружи; без порталов и floating-ui |

Не пишем: tooltip (нужен был только sidebar'у), separator/breadcrumb (обычный
CSS/разметка на месте использования), sheet (закрывается dialog/drawer),
calendar/collapsible/scroll-area/table/toggle/toggle-group (уже мертвы).

Иконки: остаётся `@lucide/svelte` (per-icon импорты, нужно ~7 штук).

## 3. Layout

- Новый `app-header` (топ-бар) + переписанный `bottom-nav` (мобила).
- Удаляются: `ui/sidebar/*`, `site-header.svelte`, `nav-user.svelte`
  (его функции — в avatar-меню топ-бара), `app-sidebar.svelte`.
- `(app)/+layout.svelte` переводится на новый каркас.

## 4. Порядок миграции

Tailwind и новый CSS сосуществуют — мигрируем постранично, приложение
собирается после каждой фазы:

1. Токены + Lightning CSS + базовые компоненты.
2. Новый layout, выпил sidebar-семейства.
3. Страницы: auth → market/my → landing → watch → editor (последним —
   PropsPanel, SimPanel, TreePanel самые тяжёлые по Tailwind).
4. Зачистка: удалить `src/lib/shared/components/ui/`, `cn()`, `WithElementRef`
   и типы-хелперы shadcn; deps: `bits-ui`, `tailwindcss`, `@tailwindcss/vite`
   (и плагин из vite-конфига), `tailwind-merge`, `tailwind-variants`, `clsx`,
   `tw-animate-css`, `@internationalized/date`; `@custom-variant`-мостики
   для bits-ui из app.css уходят вместе с ним.

## 5. Риски и потолки

- Нативный `<select>` не стилизует выпадающий список — для enum-выборов
  PropsPanel достаточно. Потолок: кастомный look опций → точечный апгрейд
  до `menu`.
- Анимация закрытия `<dialog>`: `@starting-style` +
  `transition-behavior: allow-discrete` (нативно во всех вечнозелёных).
- Lightning CSS обрабатывает стили Svelte-компонентов через CSS-пайплайн Vite;
  синтаксис должен парситься самим Svelte (нативный nesting — ок).
