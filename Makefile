# DOZO monorepo — root task runner.
#
# App, Server, and Dashboard have independent toolchains (Gradle, npm/node). Website is
# scaffolded separately; its toolchain will be selected by an approved implementation task.
# This file shells out to established projects and validates root delivery tooling.

APP_DIR       := DOZO-App
SERVER_DIR    := DOZO-Server
DASHBOARD_DIR := DOZO-Dashboard

.PHONY: help test app app-test server server-dev dashboard dashboard-dev dashboard-test verify verify-coordination

help:
	@echo "Targets:"
	@echo "  make test           run all three projects' test suites"
	@echo "  make app            build the Android debug APK"
	@echo "  make app-test       run Android unit tests"
	@echo "  make server         run server tests"
	@echo "  make server-dev     start connector :3001 + dashboard :3000 (SEED_DEMO=true)"
	@echo "  make dashboard      build the dashboard"
	@echo "  make dashboard-dev  start the dashboard dev server"
	@echo "  make dashboard-test run dashboard tests"
	@echo "  make verify-coordination validate OpenCode routing and task worktree tooling"
	@echo "  make verify         build + test projects and validate delivery tooling"

app:
	cd $(APP_DIR) && ./gradlew :app:assembleDebug --console=plain

app-test:
	cd $(APP_DIR) && ./gradlew :app:testDebugUnitTest --console=plain

server:
	cd $(SERVER_DIR) && npm test

server-dev:
	cd $(SERVER_DIR) && SEED_DEMO=true npm run start:all

dashboard:
	cd $(DASHBOARD_DIR) && npm run build

dashboard-dev:
	cd $(DASHBOARD_DIR) && npm run dev

dashboard-test:
	cd $(DASHBOARD_DIR) && npm test

verify-coordination:
	node scripts/verify-delivery-config.mjs
	bash -n scripts/new-task-worktree.sh
	bash -n scripts/publish-task-branch.sh

test: app-test server dashboard-test

verify: app app-test server dashboard dashboard-test verify-coordination
	@echo "verify: OK"
