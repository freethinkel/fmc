# Деплой статики на VPS: каталог www/ в клоне fmc_pocketbase,
# его раздаёт Caddy (см. docker-compose.yml бэкенда).
# Хост нужно задать: make deploy DEPLOY_HOST=root@1.2.3.4
DEPLOY_HOST ?= CHANGE_ME
DEPLOY_PATH ?= /root/fmc_pocketbase/www

# build — phony, иначе make принимает каталог build/ за готовую цель
# и деплоит старую сборку без пересборки
.PHONY: build deploy

build:
	pnpm run build

deploy: build
	rsync -az --delete build/ $(DEPLOY_HOST):$(DEPLOY_PATH)/
