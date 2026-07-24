# Deploy the static build to the VPS: the www/ directory in the fmc_pocketbase clone,
# served by Caddy (see the backend's docker-compose.yml).
# Host must be set: make deploy DEPLOY_HOST=root@1.2.3.4
DEPLOY_HOST ?= CHANGE_ME
DEPLOY_PATH ?= /root/fmc_pocketbase/www

# build is phony, otherwise make treats the build/ directory as an up-to-date target
# and deploys the old build without rebuilding
.PHONY: build deploy

build:
	pnpm run build

deploy: build
	rsync -az --delete build/ $(DEPLOY_HOST):$(DEPLOY_PATH)/
