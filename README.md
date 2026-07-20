# FMC Watchfaces Frontend

Редактор циферблатов + маркетплейс для CMF Watch Pro 2. SvelteKit (Svelte 5) SPA,
статическая сборка (`@sveltejs/adapter-static`). Бэкенд — [`fmc_pocketbase`](../fmc_pocketbase)
(PocketBase), должен быть запущен для работы auth/маркетплейса.

Страницы: лендинг (`/`), маркетплейс (`/market`, `/my`), редактор (`/editor`, с прошивкой
циферблата на часы по Web Bluetooth), вход/регистрация (`/login`, `/register`).

## Разработка

```sh
npm install
npm run dev
```

Открыть `http://localhost:5173`. Нужен запущенный `fmc_pocketbase` (`./pocketbase serve`,
см. его `README.md`) — в dev `/api` проксируется на `http://127.0.0.1:8090` (`vite.config.js`),
никакой отдельной настройки не требуется.

Адрес бэкенда можно переопределить переменной `VITE_PB_URL`; без неё — same-origin
(`location.origin`), что и используется на проде за Caddy.

### Настройка OAuth (один раз, опционально)

Email-вход и регистрация работают из коробки. Для OAuth (Google/GitHub):

1. `cd ../fmc_pocketbase && ./pocketbase superuser upsert you@example.com <пароль>`
2. Открыть `http://127.0.0.1:8090/_/` → Collections → users → Options → OAuth2.
3. Включить нужного провайдера, вписать client id/secret (redirect URL показывает сама админка).

## Сборка и деплой

```sh
npm run build      # статика в build/
make deploy DEPLOY_HOST=root@1.2.3.4   # соберёт и зальёт rsync'ом на VPS
```

`make deploy` заливает `build/` в `www/` внутри клона `fmc_pocketbase` на сервере — его
раздаёт Caddy. Подробности прод-инфры — в [`fmc_pocketbase/README.md`](../fmc_pocketbase/README.md).

## Проверка типов и тесты

```sh
npm run check   # svelte-check
npm test        # round-trip тест парсера/компилятора .bin на стоковых файлах watchfaces/files/
```
