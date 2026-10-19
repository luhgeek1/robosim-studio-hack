from ipaddress import ip_address

from fastapi import Request

from app.core.config import Settings


def client_ip(request: Request, settings: Settings) -> str:
    """Only an explicitly configured, overwritten proxy header may identify the original client."""
    if settings.client_ip_header:
        value = request.headers.get(settings.client_ip_header, "")
        try:
            return str(ip_address(value))
        except ValueError:
            pass
    return request.client.host if request.client else "unknown"
