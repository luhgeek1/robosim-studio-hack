from pathlib import Path

from pydantic_settings import BaseSettings

BASE_DIR = Path(__file__).resolve().parent.parent
REPO_DIR = BASE_DIR.parent


class Settings(BaseSettings):
    app_name: str = "RoboScope API"
    database_url: str = f"sqlite:///{BASE_DIR / 'roboscope.db'}"
    catalog_csv: Path = REPO_DIR / "catalog_export_v4.csv"
    dataset_xlsx: Path = REPO_DIR / "Датасеты_хакатон.xlsx"
    sample_dir: Path = BASE_DIR / "sample_data"
    cors_origins: list[str] = ["http://localhost:5173", "http://127.0.0.1:5173", "http://localhost:4173"]
    simulation_seed: int = 42
    # ML providers: "rules" (deterministic, default) or "llm" (see app/ml/README.md)
    import_provider: str = "rules"
    explanation_provider: str = "rules"

    model_config = {"env_prefix": "ROBOSCOPE_", "env_file": str(BASE_DIR / ".env"), "extra": "ignore"}


settings = Settings()
