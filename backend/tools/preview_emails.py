"""Render local previews without sending mail: .venv/bin/python -m tools.preview_emails.

Open dist/email-preview/invitation.html from the repository root. The same folder
contains verification/password-reset samples and local copies of both images.
"""

from pathlib import Path
from shutil import copyfile

from app.service.mail.templates import EmailMessage, render_email

ROOT = Path(__file__).resolve().parents[2]
OUTPUT = ROOT / "dist" / "email-preview"
WEB_URL = "https://prooood.ru"
EXPIRY = "28.10.2026, 12:00 UTC"


def samples() -> dict[str, EmailMessage]:
    return {
        "invitation": EmailMessage(
            preview="Анна приглашает вас в команду «Логистика и роботизация» в РобоМере.",
            title="Вас приглашают в команду",
            paragraphs=(
                "Анна приглашает вас в «Логистика и роботизация» в РобоМере.",
                "Работайте с объектами и сценариями вместе: от исходных данных до расчёта и отчёта.",
                "Войдите или создайте аккаунт с почтой alex@company.example, затем подтвердите вступление.",
            ),
            action_label="Открыть приглашение",
            action_url=f"{WEB_URL}/invitations/preview#token=preview-only",
            facts=(
                ("Команда", "Логистика и роботизация"),
                ("Для кого", "alex@company.example"),
                ("Действует до", EXPIRY),
            ),
            footnote=(
                "Вступление подтверждается на сайте. Если вы не ждали приглашение, проигнорируйте письмо."
            ),
        ),
        "verify-email": EmailMessage(
            preview="Подтвердите почту в РобоМере",
            title="Подтвердите почту в РобоМере",
            paragraphs=(
                "Подтвердите адрес, чтобы создавать команды, приглашать коллег и подключать сервисы входа.",
            ),
            action_label="Подтвердить почту",
            action_url=f"{WEB_URL}/verify-email#token=preview-only",
            facts=(("Аккаунт", "alex@company.example"), ("Действует до", EXPIRY)),
            footnote=(
                "Если вы не запрашивали это действие, проигнорируйте письмо. Никому не пересылайте ссылку."
            ),
        ),
        "reset-password": EmailMessage(
            preview="Смена пароля РобоМеры",
            title="Смена пароля РобоМеры",
            paragraphs=(
                "Вы запросили восстановление доступа. Задайте новый пароль на сайте; "
                "прежние сессии завершатся.",
            ),
            action_label="Задать новый пароль",
            action_url=f"{WEB_URL}/reset-password#token=preview-only",
            facts=(("Аккаунт", "alex@company.example"), ("Действует до", EXPIRY)),
            footnote=(
                "Если вы не запрашивали это действие, проигнорируйте письмо. Никому не пересылайте ссылку."
            ),
        ),
    }


def main() -> None:
    (OUTPUT / "email").mkdir(parents=True, exist_ok=True)
    for name in ("robot-delivery.gif", "robot-delivery.png"):
        copyfile(ROOT / "frontend" / "public" / "email" / name, OUTPUT / "email" / name)
    for name, message in samples().items():
        html = render_email(message, WEB_URL).replace(f'src="{WEB_URL}/email/', 'src="email/')
        path = OUTPUT / f"{name}.html"
        path.write_text(html, encoding="utf-8")
        print(path)


if __name__ == "__main__":
    main()
