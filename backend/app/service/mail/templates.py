from dataclasses import dataclass
from html import escape
from pathlib import Path
from string import Template

_SHELL = Template(Path(__file__).with_name("transactional.html").read_text(encoding="utf-8"))


@dataclass(frozen=True, slots=True)
class EmailMessage:
    preview: str
    title: str
    paragraphs: tuple[str, ...]
    action_label: str
    action_url: str
    facts: tuple[tuple[str, str], ...]
    footnote: str


def render_email(message: EmailMessage, web_url: str) -> str:
    paragraphs = "".join(
        f'<p style="margin:0 0 16px;font-size:16px;line-height:1.6;color:#3d3d3a">{escape(text)}</p>'
        for text in message.paragraphs
    )
    facts = "".join(
        '<tr><td style="padding:8px 16px;font-size:13px;line-height:1.5;color:#66625c;vertical-align:top">'
        f'{escape(label)}</td><td style="padding:8px 16px;font-size:13px;line-height:1.5;'
        f'color:#242c2b;word-break:break-word">{escape(value)}</td></tr>'
        for label, value in message.facts
    )
    return _SHELL.substitute(
        preview=escape(message.preview),
        title=escape(message.title),
        paragraphs=paragraphs,
        action_label=escape(message.action_label),
        action_url=escape(message.action_url, quote=True),
        facts=facts,
        footnote=escape(message.footnote),
        web_url=escape(web_url.rstrip("/"), quote=True),
    )
