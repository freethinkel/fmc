# Deploy the static build to the home server (kuzyo): /srv/pets is shared into the
# `pets` incus container, where fmc-caddy serves www/ behind the Cloudflare tunnel.
# kuzyo is an ssh alias (root@192.168.1.243, LAN only; tailnet: 100.72.74.39).
DEPLOY_HOST ?= kuzyo
DEPLOY_PATH ?= /srv/pets/fmc/www

# build is phony, otherwise make treats the build/ directory as an up-to-date target
# and deploys the old build without rebuilding
.PHONY: build deploy

build:
	pnpm run build

# Prod build env: same-origin PocketBase (overrides a dev VITE_PB_URL in .env) and the
# Aptabase key, which is public and ends up in the bundle anyway.
deploy: export VITE_PB_URL =
deploy: export VITE_APTABASE_KEY = A-EU-4670014985
deploy: build
	rsync -az --delete build/ $(DEPLOY_HOST):$(DEPLOY_PATH)/
