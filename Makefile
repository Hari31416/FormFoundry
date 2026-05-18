SHELL := /bin/zsh

# Load environment variables from .env file if it exists
ifneq (,$(wildcard .env))
    include .env
    export
endif

BACKEND_DIR := backend
FRONTEND_DIR := frontend
RUN_DIR := .run
BACKEND_PID := $(RUN_DIR)/backend.pid
FRONTEND_PID := $(RUN_DIR)/frontend.pid
BACKEND_LOG := $(RUN_DIR)/backend.log
FRONTEND_LOG := $(RUN_DIR)/frontend.log

.PHONY: install-uv install-pnpm up down nuke backend-setup backend-start backend-stop logs-backend frontend-setup frontend-start frontend-stop frontend-preview logs-frontend setup start stop restart logs ps health down-all up-all nuke-all backend-migrate docs-serve docs-build

install-uv:
	@command -v uv >/dev/null 2>&1 || (echo "uv is required. Install it first." && exit 1)

install-pnpm:
	@command -v pnpm >/dev/null 2>&1 || (echo "pnpm is required. Install it first." && exit 1)

up:
	@docker compose up -d postgres redis minio

down:
	@docker compose down

nuke:
	@docker compose down -v

backend-setup: install-uv
	@cd $(BACKEND_DIR) && uv sync

backend-migrate:
	@cd $(BACKEND_DIR) && uv run alembic upgrade head

backend-start:
	@mkdir -p $(RUN_DIR)
	@if [ -f $(BACKEND_PID) ] && kill -0 $$(cat $(BACKEND_PID)) 2>/dev/null; then echo "Backend already running"; exit 0; fi
	@cd $(BACKEND_DIR) && nohup uv run uvicorn app.main:app --host $${BACKEND_HOST:-0.0.0.0} --port $${BACKEND_PORT:-8000} > ../$(BACKEND_LOG) 2>&1 & echo $$! > ../$(BACKEND_PID)

backend-stop:
	@if [ -f $(BACKEND_PID) ] && kill -0 $$(cat $(BACKEND_PID)) 2>/dev/null; then kill $$(cat $(BACKEND_PID)) && rm -f $(BACKEND_PID); else echo "Backend not running"; fi

logs-backend:
	@tail -n 100 -f $(BACKEND_LOG)

frontend-setup: install-pnpm
	@cd $(FRONTEND_DIR) && pnpm install

frontend-start:
	@mkdir -p $(RUN_DIR)
	@if [ -f $(FRONTEND_PID) ] && kill -0 $$(cat $(FRONTEND_PID)) 2>/dev/null; then echo "Frontend already running"; exit 0; fi
	@cd $(FRONTEND_DIR) && nohup pnpm dev --host 0.0.0.0 --port $${FRONTEND_PORT:-5173} > ../$(FRONTEND_LOG) 2>&1 & echo $$! > ../$(FRONTEND_PID)

frontend-stop:
	@if [ -f $(FRONTEND_PID) ] && kill -0 $$(cat $(FRONTEND_PID)) 2>/dev/null; then kill $$(cat $(FRONTEND_PID)) && rm -f $(FRONTEND_PID); else echo "Frontend not running"; fi

frontend-preview:
	@cd $(FRONTEND_DIR) && pnpm preview --host 0.0.0.0 --port $${FRONTEND_PORT:-4173}

logs-frontend:
	@tail -n 100 -f $(FRONTEND_LOG)

setup: backend-setup frontend-setup

start: up backend-start frontend-start

stop: backend-stop frontend-stop down

restart: stop start

logs:
	@echo "Backend log: $(BACKEND_LOG)"
	@echo "Frontend log: $(FRONTEND_LOG)"

ps:
	@docker compose ps
	@printf "\nBackend PID: "; test -f $(BACKEND_PID) && cat $(BACKEND_PID) || echo "not running"
	@printf "Frontend PID: "; test -f $(FRONTEND_PID) && cat $(FRONTEND_PID) || echo "not running"

health:
	@curl -fsS http://localhost:$${BACKEND_PORT:-8000}/api/v1/health || exit 1

up-all: setup start

down-all: stop

nuke-all: backend-stop frontend-stop nuke

docs-serve:
	@uv run mkdocs serve

docs-build:
	@uv run mkdocs build
