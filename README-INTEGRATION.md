# Что это и как поставить

Первый шаг: новый дизайн (светлая/тёмная тема, боковое меню с вкладками) +
переход на правильную модель данных под реальные Excel-планы закупок
(вместо старых абстрактных "кодов бюджета").

## 1. Обновить базу данных

Зайди в консоль контейнера `myapp_postgres` → `psql -U appuser -d appdb` и
вставляй блоки из `MIGRATION.sql` по одному (как раньше), либо разом файлом,
если получится закинуть файл в контейнер.

⚠️ Это удалит старые пустые таблицы `annual_plans`, `quarterly_plans`,
`budget_codes`, `plan_transfers`, `plan_cancellations`, `unplanned_items` —
в них всё равно не было данных, только структура. Пользователь `admin` и
таблицы `branches`, `users`, `documents`, `audit_log` не трогаются.

После миграции добавь хотя бы один филиал вручную (или уже через интерфейс,
раздел "Филиалы"), иначе закупки создавать будет некуда:

```sql
INSERT INTO branches (name, code) VALUES ('Центр', 'center');
```

## 2. Backend — заменить/добавить файлы

- `backend/src/server.js` — **заменить** (добавлена регистрация новых роутов)
- `backend/src/routes/branches.js` — **новый файл**
- `backend/src/routes/purchases.js` — **новый файл**

Ничего устанавливать дополнительно не нужно — используются те же зависимости,
что уже есть (`pg`, `express`, `jsonwebtoken`).

## 3. Frontend — заменить/добавить файлы

Заменить:
- `frontend/src/App.jsx`
- `frontend/src/main.jsx`
- `frontend/src/context/AuthContext.jsx` (заодно исправлен баг: было
  `process.env.REACT_APP_API_URL`, а в Vite так переменные не читаются —
  теперь `import.meta.env.VITE_API_URL`)
- `frontend/src/pages/HomePage.jsx`
- `frontend/src/pages/LoginPage.jsx`

Добавить новые:
- `frontend/src/api.js`
- `frontend/src/theme/theme.css`
- `frontend/src/theme/ThemeContext.jsx`
- `frontend/src/components/Layout.jsx`
- `frontend/src/components/PurchasesTable.jsx`
- `frontend/src/pages/BranchesPage.jsx`
- `frontend/src/pages/QuarterPage.jsx`
- `frontend/src/pages/AnnualPlanPage.jsx`
- `frontend/src/pages/SearchPage.jsx`

Можно удалить (больше не используется, дизайн заменён):
- `frontend/src/styles/ledger.css`

`ProtectedRoute.jsx` и `frontend/index.html`, `vite.config.js`, `nginx.conf`
не трогаем — они не менялись.

## 4. Пересборка

```
git add .
git commit -m "Дизайн: тёмная/светлая тема, вкладки, план закупок вместо кодов бюджета"
git push
```

В Portainer — Pull and redeploy для `backend` и `frontend`.

## 5. Что уже работает

- Вход, светлая/тёмная тема (переключатель вверху)
- Главная — дашборд: суммы по кварталам, по филиалам, счётчик "ждут проверки"
- Филиалы — список, добавление, редактирование
- Годовой план / Кв. 1–4 — таблица закупок с фильтром, добавлением,
  редактированием, переносом между кварталами, отменой
- Поиск (шапка) — ищет по названию закупки, ОКПД2, названию филиала
- Подсветка: закупка, которую правил филиал и центр ещё не открывал — жёлтая
  рамка; внеплановая — красная; отменённая — серая, зачёркнута

## 6. Что ещё не сделано (следующие шаги)

- Загрузка файлов (служебки, приказы) к закупке — таблица `documents` в базе
  уже есть, но роута загрузки файлов и кнопки на фронте пока нет. Для этого
  нужно решить, где физически хранить файлы (нужен volume в docker-compose,
  сейчас его нет), и добавить `multer` в backend.
- Импорт Excel от филиалов одной кнопкой (сейчас позиции заводятся вручную
  через форму — можно и нужно сделать парсер xlsx, структура файлов от
  филиалов уже понятна по присланным примерам).
- Роли `viewer` / детальные права по филиалам (сейчас `branch_editor` может
  редактировать любую закупку любого филиала — нужно ограничить своим
  `branch_id`, если это важно).
