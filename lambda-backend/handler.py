"""
Lambda handler - wraps Flask WSGI app for API Gateway v2 (HTTP API).
"""
import os
import sys
import io
import base64

os.environ.setdefault("IS_LAMBDA", "true")

from server import app


def handler(event, context):
    # Build WSGI environ from API Gateway v2 event
    http_ctx = event.get("requestContext", {}).get("http", {})
    method = http_ctx.get("method", "GET")
    path = event.get("rawPath", "/")
    query_string = event.get("rawQueryString", "")
    headers = event.get("headers", {})
    body = event.get("body", "") or ""
    is_base64 = event.get("isBase64Encoded", False)

    # Strip stage prefix from path (e.g., /prod/api/health → /api/health)
    stage = event.get("requestContext", {}).get("stage", "")
    if stage and stage != "$default" and path.startswith(f"/{stage}"):
        path = path[len(f"/{stage}"):] or "/"

    if is_base64 and body:
        body_bytes = base64.b64decode(body)
    else:
        body_bytes = body.encode("utf-8") if isinstance(body, str) else body

    environ = {
        "REQUEST_METHOD": method,
        "SCRIPT_NAME": "",
        "PATH_INFO": path,
        "QUERY_STRING": query_string,
        "SERVER_NAME": headers.get("host", "lambda"),
        "SERVER_PORT": "443",
        "SERVER_PROTOCOL": "HTTP/1.1",
        "wsgi.version": (1, 0),
        "wsgi.url_scheme": "https",
        "wsgi.input": io.BytesIO(body_bytes),
        "wsgi.errors": sys.stderr,
        "wsgi.multithread": False,
        "wsgi.multiprocess": False,
        "wsgi.run_once": False,
        "CONTENT_LENGTH": str(len(body_bytes)),
        "CONTENT_TYPE": headers.get("content-type", ""),
    }

    # Map HTTP headers to WSGI format
    for key, value in headers.items():
        wsgi_key = "HTTP_" + key.upper().replace("-", "_")
        if wsgi_key not in ("HTTP_CONTENT_TYPE", "HTTP_CONTENT_LENGTH"):
            environ[wsgi_key] = value

    # Call Flask WSGI app
    response_started = []
    response_body = []

    def start_response(status, response_headers, exc_info=None):
        response_started.append((status, response_headers))

    result = app(environ, start_response)
    for data in result:
        response_body.append(data)
    if hasattr(result, "close"):
        result.close()

    status_code = int(response_started[0][0].split(" ")[0])
    resp_headers = {k: v for k, v in response_started[0][1]}
    body_out = b"".join(response_body)

    content_type = resp_headers.get("Content-Type", "")
    is_binary = not content_type.startswith(("text/", "application/json"))

    return {
        "statusCode": status_code,
        "headers": resp_headers,
        "body": base64.b64encode(body_out).decode() if is_binary else body_out.decode("utf-8", errors="replace"),
        "isBase64Encoded": is_binary,
    }
