"""
210-Invoice Closer Agent
Finalizes draft invoices in Priority (טיוטא → סופית).
Lambda mode: invokes Node.js Lambda via boto3.
Local mode: calls close-invoice.js via subprocess.
"""

import sys
import os
import io
import json
import subprocess
from pathlib import Path
from datetime import datetime

# Fix Windows console encoding for Hebrew (only when running directly)
if __name__ == "__main__":
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")

if os.environ.get("IS_LAMBDA") != "true":
    from dotenv import load_dotenv
    env_path = Path(__file__).resolve().parent.parent.parent.parent.parent / ".env"
    load_dotenv(env_path)

IS_LAMBDA = os.environ.get("IS_LAMBDA") == "true"

# Path to the Node.js close-invoice script (local dev only)
SCRIPT_DIR = Path(__file__).resolve().parent
CLOSE_INVOICE_JS = SCRIPT_DIR / "close-invoice.js"


def finalize_invoice(ivnum):
    """Finalize a draft invoice in Priority (טיוטא → סופית).

    Args:
        ivnum: Invoice number (e.g. 'T99')

    Returns:
        dict with result data (e.g. {"ok": True, "ivnum": "T99"})

    Raises:
        RuntimeError on failure
    """
    if IS_LAMBDA:
        return _finalize_via_lambda(ivnum)
    return _finalize_via_subprocess(ivnum)


def _finalize_via_lambda(ivnum):
    """Invoke the Node.js Lambda to close the invoice."""
    import boto3

    client = boto3.client("lambda")
    function_name = os.environ["INVOICE_CLOSER_FUNCTION"]

    response = client.invoke(
        FunctionName=function_name,
        InvocationType="RequestResponse",
        Payload=json.dumps({"ivnum": ivnum}),
    )

    data = json.loads(response["Payload"].read())

    if response.get("FunctionError"):
        raise RuntimeError(
            f"Invoice closer Lambda error: {data.get('errorMessage', 'Unknown error')}"
        )

    if not data.get("ok"):
        raise RuntimeError(data.get("error", "Unknown error from invoice closer"))

    return data


def _finalize_via_subprocess(ivnum):
    """Call close-invoice.js via subprocess (local dev)."""
    if not CLOSE_INVOICE_JS.exists():
        raise RuntimeError(f"close-invoice.js not found at {CLOSE_INVOICE_JS}")

    result = subprocess.run(
        ["node", str(CLOSE_INVOICE_JS), ivnum],
        capture_output=True,
        encoding="utf-8",
        errors="replace",
        timeout=60,
        cwd=str(SCRIPT_DIR),
    )

    stdout_lines = [ln for ln in result.stdout.strip().splitlines() if ln.strip()]
    if not stdout_lines:
        raise RuntimeError(
            f"close-invoice.js returned no output. "
            f"Exit code: {result.returncode}. Stderr: {result.stderr[:500]}"
        )

    try:
        data = json.loads(stdout_lines[-1])
    except json.JSONDecodeError:
        raise RuntimeError(
            f"close-invoice.js returned invalid JSON: {stdout_lines[-1][:200]}. "
            f"Stderr: {result.stderr[:500]}"
        )

    if not data.get("ok"):
        raise RuntimeError(data.get("error", "Unknown error from close-invoice.js"))

    return data


def main():
    print("=" * 60)
    print("  210-Invoice Closer - Priority Cloud")
    print("=" * 60)
    print()

    print(f"Script: {CLOSE_INVOICE_JS}")
    print()

    if len(sys.argv) < 2:
        print("Usage: python 210-invoice_closer.py <IVNUM> [IVNUM2] [IVNUM3] ...")
        print("Example: python 210-invoice_closer.py T100 T101 T102")
        sys.exit(1)

    invoice_numbers = sys.argv[1:]
    results = []

    for ivnum in invoice_numbers:
        try:
            result = finalize_invoice(ivnum)
            results.append({"ivnum": ivnum, "status": "OK"})
            print(f"  {ivnum}: OK")
        except Exception as e:
            error_msg = str(e)
            results.append({"ivnum": ivnum, "status": "FAILED", "error": error_msg})
            print(f"  {ivnum}: FAILED - {error_msg}")

    # Summary
    print()
    print("=" * 40)
    ok = sum(1 for r in results if r["status"] == "OK")
    failed = sum(1 for r in results if r["status"] == "FAILED")
    print(f"Results: {ok} finalized, {failed} failed out of {len(results)}")

    # Save to output file
    output_dir = Path(__file__).resolve().parent.parent.parent.parent.parent / "output"
    output_dir.mkdir(exist_ok=True)

    output_file = output_dir / "210-invoice_closer.txt"

    with open(output_file, "w", encoding="utf-8") as f:
        f.write("210-Invoice Closer - Priority Cloud\n")
        f.write(f"Date: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n\n")
        for r in results:
            f.write(f"Invoice {r['ivnum']}: {r['status']}")
            if r.get("error"):
                f.write(f" - {r['error']}")
            f.write("\n")

    print(f"Saved to: {output_file}")


if __name__ == "__main__":
    main()
