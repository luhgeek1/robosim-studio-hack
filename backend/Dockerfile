FROM python:3.13-slim
COPY --from=ghcr.io/astral-sh/uv:0.11.8 /uv /uvx /bin/

ENV UV_COMPILE_BYTECODE=1 UV_LINK_MODE=copy UV_PROJECT_ENVIRONMENT=/opt/venv PYTHONUNBUFFERED=1
WORKDIR /srv/backend

COPY backend/pyproject.toml backend/uv.lock ./
RUN --mount=type=cache,target=/root/.cache/uv uv sync --frozen --no-dev --no-install-project

COPY backend/ ./
# Organizer datasets and research specs are read by seeds at runtime (read-only).
COPY case/dataset /srv/case/dataset
COPY research /srv/research

ENV PATH="/opt/venv/bin:$PATH"
RUN useradd --system --uid 10001 app
USER app

EXPOSE 8000
CMD ["uvicorn", "app.main:create_app", "--factory", "--host", "0.0.0.0", "--port", "8000", "--workers", "2", "--proxy-headers"]
