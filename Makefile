GRAFANA_API_KEY?=
SIGN_ARGS?=
VERSION?=dev

all: build

build: check-env
	@docker build -t kentik-grafana-plugin:dev .
	@docker run -ti --rm -e GRAFANA_API_KEY="$(GRAFANA_API_KEY)" -e VERSION="$(VERSION)" -e SIGN_ARGS="$(SIGN_ARGS)" -v $(shell pwd):/app -w /app kentik-grafana-plugin:dev make plugin

plugin: check-env
	@npm install
	@yarn build
	@npx @grafana/toolkit plugin:sign --signatureType=commercial $(SIGN_ARGS)
	@rm -rf kentik-connect-app
	@mv dist kentik-connect-app
	@zip -r kentik-connect-app-$(VERSION).zip kentik-connect-app
	@rm -rf kentik-connect-app

check-env:
ifndef GRAFANA_API_KEY
	$(error GRAFANA_API_KEY is undefined)
endif

.PHONY: check-env build plugin
