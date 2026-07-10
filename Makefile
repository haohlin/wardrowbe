SHELL := /bin/bash

BACKEND_DIR := backend
FRONTEND_DIR := frontend
PYTHON := ./.venv/bin/python
TEST_DATABASE_URL ?= postgresql+asyncpg://wardrobe:wardrobe@localhost:5432/wardrobe_test

.PHONY: check backend-test frontend-test frontend-build frontend-lint preview-guard verify-preview

check: backend-test frontend-test frontend-build frontend-lint preview-guard
	@echo "All Wardrowbe local checks passed, including the live preview/Tailscale guard."

backend-test:
	cd $(BACKEND_DIR) && TEST_DATABASE_URL='$(TEST_DATABASE_URL)' PATH="$$PWD/../.venv/bin:$$PATH" ../$(PYTHON) -m pytest -q

frontend-test:
	cd $(FRONTEND_DIR) && npm test -- --run

frontend-build:
	cd $(FRONTEND_DIR) && npm run build

frontend-lint:
	cd $(FRONTEND_DIR) && npm run lint

preview-guard verify-preview:
	$(PYTHON) scripts/verify_wardrowbe_preview.py
