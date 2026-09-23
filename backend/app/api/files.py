from urllib.parse import quote

ASCII_FALLBACK = "download"


def content_disposition(filename: str, *, inline: bool = False) -> str:
    """RFC 6266 / 5987: an ASCII fallback plus the UTF-8 name, so Russian file names survive the header."""
    ascii_name = filename.encode("ascii", "ignore").decode().strip() or ASCII_FALLBACK
    ascii_name = ascii_name.replace('"', "")
    disposition = "inline" if inline else "attachment"
    return f"{disposition}; filename=\"{ascii_name}\"; filename*=UTF-8''{quote(filename)}"
