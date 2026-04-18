# Deploy — reviews.questlegends.ru

Пошаговая инструкция первичного деплоя и последующих обновлений.

---

## 0. Что нужно перед стартом

- Ubuntu 22.04+ сервер с публичным IP
- DNS `A`-запись: `reviews.questlegends.ru` → IP сервера (подождите пока пропагейтится)
- Порт 3010 свободен (иначе правьте `PORT` в `.env` и `ecosystem.config.js` + `nginx.conf.example`)
- Установлены: `node>=20`, `npm`, `git`, `postgresql-14+`, `nginx`, `certbot`, `pm2`

Если чего-то нет:

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs postgresql nginx certbot python3-certbot-nginx
sudo npm install -g pm2
```

---

## 1. Клонирование и сборка

```bash
sudo mkdir -p /var/www
sudo chown -R $USER:$USER /var/www
cd /var/www
git clone https://github.com/volgintb-arch/reviews-widget.git
cd reviews-widget

# Backend + workspaces (admin подтянется автоматически)
npm ci

# Сборка
npm run build                       # backend → dist/
npm --workspace admin run build     # admin → admin/dist/
npm run widget:build                # widget → widget/dist/
```

---

## 2. База данных

```bash
# Сгенерировать длинный пароль для БД заранее, например:
#   openssl rand -hex 24
DB_PASS=$(openssl rand -hex 24)

sudo -u postgres psql <<SQL
CREATE USER reviews_user WITH PASSWORD '$DB_PASS';
CREATE DATABASE reviews_widget OWNER reviews_user;
GRANT ALL PRIVILEGES ON DATABASE reviews_widget TO reviews_user;
SQL

echo "DB password: $DB_PASS"  # сохраните — понадобится в .env
```

---

## 3. .env

```bash
cp .env.example .env
nano .env
```

Заполните:

| Переменная | Что ставить |
|---|---|
| `DATABASE_URL` | `postgresql://reviews_user:<DB_PASS>@localhost:5432/reviews_widget` |
| `JWT_SECRET` | `openssl rand -hex 32` (64 hex-символа) |
| `ADMIN_LOGIN` | `admin` (или что угодно) |
| `ADMIN_PASSWORD` | `openssl rand -base64 24` — **сохраните, это единственный пароль админки** |
| `ALLOWED_ORIGINS` | `https://brn.questlegends.ru,https://omsk.questlegends.ru` |
| `PUBLIC_API_BASE` | `https://reviews.questlegends.ru` |
| `TWOGIS_PUBLIC_KEY` | `6e7e1929-4ea9-4a5d-8c05-d601860389bd` (уже в `.env.example`) |

Остальные значения — по умолчанию.

---

## 4. Миграции и сид

```bash
npx prisma migrate deploy
npx prisma generate
npx prisma db seed        # создаёт Барнаул + дефолтные настройки виджета
```

Проверка:

```bash
sudo -u postgres psql reviews_widget -c "SELECT slug, name FROM cities;"
```

Должен показать `brn | Барнаул`.

---

## 5. PM2

```bash
sudo mkdir -p /var/log/pm2
sudo chown -R $USER:$USER /var/log/pm2

pm2 start deploy/ecosystem.config.cjs
pm2 save
pm2 startup                # выполните команду, которую PM2 распечатает
```

Проверка:

```bash
pm2 status
curl http://127.0.0.1:3010/health
```

Ожидаемо: `"status":"ok"` и cron начнёт первую выгрузку через несколько секунд (см. `pm2 logs reviews-widget`).

---

## 6. nginx + SSL

```bash
sudo cp deploy/nginx.conf.example /etc/nginx/sites-available/reviews-widget
sudo ln -sf /etc/nginx/sites-available/reviews-widget /etc/nginx/sites-enabled/reviews-widget

# Удалите дефолтный хост если он мешает
sudo rm -f /etc/nginx/sites-enabled/default

sudo nginx -t && sudo systemctl reload nginx

# SSL (Let's Encrypt)
sudo certbot --nginx -d reviews.questlegends.ru --agree-tos -m admin@questlegends.ru --redirect
```

Certbot сам перепишет nginx-конфиг, подставив пути сертификатов.

---

## 7. Smoke-тест

```bash
curl https://reviews.questlegends.ru/health
curl "https://reviews.questlegends.ru/api/reviews?city=brn" | head -c 500
curl -I https://reviews.questlegends.ru/widget/widget.js
```

Первый запрос `/api/reviews` может быть пустым — cron запустится сразу при старте сервера, в течение минуты отзывы появятся. Проверить прогресс: `pm2 logs reviews-widget`.

Откройте админку: https://reviews.questlegends.ru/admin/ → войдите с `ADMIN_LOGIN` / `ADMIN_PASSWORD` из `.env`.

---

## 8. Установка виджета на Tilda

1. Админка → Settings → настроили цвета / заголовок → Сохранить.
2. На странице Tilda добавьте блок **T123 (HTML)** там, где должны быть отзывы.
3. Скопируйте содержимое [`widget/src/widget.html`](../widget/src/widget.html) в блок.
4. Опубликуйте страницу.
5. Удалите старый блок smartwidgets.

Проверьте в DevTools: нет 4xx/5xx, в сеть улетает запрос на `reviews.questlegends.ru/api/reviews?city=brn`.

---

## 9. Обновления

```bash
cd /var/www/reviews-widget
git pull

npm ci
npm run build
npm --workspace admin run build
npm run widget:build

npx prisma migrate deploy
pm2 reload reviews-widget
```

`pm2 reload` делает zero-downtime перезапуск.

Виджет обновится на Tilda автоматически — браузеры подхватят свежий `widget.js` после истечения nginx-кэша (1 час) или `Ctrl+F5`.

---

## 10. Диагностика

| Симптом | Проверить |
|---|---|
| `/health` отдаёт 502 | `pm2 status`, `pm2 logs reviews-widget --lines 50` |
| 2ГИС не парсится | `pm2 logs`, искать `TWOGIS` — возможно `TWOGIS_PUBLIC_KEY` протух. Открыть `2gis.ru` в браузере, взять новый ключ из сетевых запросов, обновить `.env`, `pm2 restart reviews-widget` |
| Яндекс отдаёт 0 отзывов | Яндекс сменил HTML-структуру. Правим `SELECTORS` в `src/sources/yandex.ts`, `npm run build`, `pm2 reload` |
| Админка 401 при логине | Проверить что `ADMIN_LOGIN`/`ADMIN_PASSWORD` в `.env` совпадают с тем что вводите, `pm2 restart` после правки |
| Виджет на Tilda не грузится | DevTools → Network. Если CORS-ошибка → добавить домен Tilda в `ALLOWED_ORIGINS` и `pm2 restart` |
| nginx 504 | `proxy_read_timeout` в `nginx.conf` — первая выгрузка при холодной БД может идти до 60с |

Полный лог: `pm2 logs reviews-widget --lines 200`.

Рестарт cron вручную через админку: Dashboard → кнопка «Обновить сейчас» у каждого города.
