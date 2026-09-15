# DOZO monorepo — root task runner.
#
# The three artifacts have independent toolchains (Gradle, npm/node). This is a
# loose monorepo: each project keeps its own build config; this file only shells
# out to the right one.

APP_DIR       := DOZO-App
SERVER_DIR    := DOZO-Server
DASHBOARD_DIR := DOZO-Dashboard

.PHONY: help test app app-test server server-dev dashboard dashboard-dev dashboard-test verify

help:
	@echo "Targets:"
	@echo "  make test           run all three projects' test suites"
	@echo "  make app            build the Android debug APK"
	@echo "  make app-test       run Android unit tests"
	@echo "  make server         run server tests"
	@echo "  make server-dev     start the server (SEED_DEMO=true)"
	@echo "  make dashboard      build the dashboard"
	@echo "  make dashboard-dev  start the dashboard dev server"
	@echo "  make dashboard-test run dashboard tests"
	@echo "  make verify         build + test all three projects"

app:
	cd $(APP_DIR) && ./gradlew :app:assembleDebug --console=plain

app-test:
	cd $(APP_DIR) && ./gradlew :app:testDebugUnitTest --console=plain

server:
	cd $(SERVER_DIR) && npm test

server-dev:
	cd $(SERVER_DIR) && SEED_DEMO=true npm start

dashboard:
	cd $(DASHBOARD_DIR) && npm run build

dashboard-dev:
	cd $(DASHBOARD_DIR) && npm run dev

dashboard-test:
	cd $(DASHBOARD_DIR) && npm test

test: app-test server dashboard-test

verify: app app-test server dashboard dashboard-test
	@echo "verify: OK"
