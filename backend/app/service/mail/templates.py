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
        '<p style="margin:0 0 16px;font-size:16px;line-height:1.7;color:#565650;'
        f'text-align:center;word-break:break-word">{escape(text)}</p>'
        for text in message.paragraphs
    )
    facts = "".join(
        '<tr><td width="32%" style="padding:14px 18px;font-size:12px;line-height:1.6;'
        f'color:#73736b;text-align:left;vertical-align:top;{_fact_border(index)}">'
        f'{escape(label)}</td><td style="padding:14px 18px;font-size:13px;line-height:1.5;'
        f'color:#242824;text-align:right;word-break:break-word;{_fact_border(index)}">{escape(value)}</td></tr>'
        for index, (label, value) in enumerate(message.facts)
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


def _fact_border(index: int) -> str:
    return "border-top:1px solid #e8e6df" if index else ""
