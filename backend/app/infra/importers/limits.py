from io import BytesIO
from zipfile import BadZipFile, ZipFile

from app.core.errors import FileTooLargeError, UnsupportedFileTypeError

GUEST_FILE_BYTES = 5 * 1024 * 1024
MAX_UNPACKED_BYTES = 25 * 1024 * 1024


def check_guest_file(content: bytes) -> None:
    if len(content) > GUEST_FILE_BYTES:
        raise FileTooLargeError("В демо можно загрузить файл до 5 МБ")
    if not content.startswith(b"PK"):
        return
    try:
        with ZipFile(BytesIO(content)) as archive:
            entries = archive.infolist()
            if len(entries) > 1000 or sum(entry.file_size for entry in entries) > MAX_UNPACKED_BYTES:
                raise FileTooLargeError("Excel после распаковки превышает лимит демо 25 МБ")
    except BadZipFile as exc:
        raise UnsupportedFileTypeError("Повреждённый файл Excel") from exc
