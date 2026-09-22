.PHONY: infra up down lint fmt typecheck test check migrate migration contract-lint contract-bundle

BACKEND = cd backend &&

infra:            ## Postgres + Redis for local runs and tests
	docker compose up -d db redis

up:               ## Full stack: db, redis, migrations, API (:8000), worker
	docker compose up --build

down:
	docker compose down

lint:
	$(BACKEND) uv run ruff check . && uv run ruff format --check .

fmt:
	$(BACKEND) uv run ruff check --fix . && uv run ruff format .

typecheck:
	$(BACKEND) uv run mypy app

test: infra       ## Unit + integration + contract tests (real Postgres/Redis)
	$(BACKEND) uv run pytest -q

check: lint typecheck test contract-lint   ## What CI runs; must be green before a commit

migrate:
	$(BACKEND) uv run alembic upgrade head

migration:        ## make migration m="add catalog"
	$(BACKEND) uv run alembic revision --autogenerate -m "$(m)"

contract-lint:
	npx -y @redocly/cli@latest lint docs/api/openapi.yaml

contract-bundle:
	npx -y @redocly/cli@latest bundle docs/api/openapi.yaml -o docs/api/openapi.bundled.yaml
