"""Read-only, network-restricted inspection of embedded C2PA credentials."""

import json
from pathlib import Path
from typing import Any, Dict

from app.core.config import settings
from app.models.domain import Evidence


def inspect_c2pa(evidence: Evidence) -> Dict[str, Any]:
    try:
        from c2pa import Context, Reader
    except (ImportError, OSError):
        return {
            "credential_status": "SDK_UNAVAILABLE",
            "summary": "C2PA inspection is unavailable because the optional C2PA SDK is not installed.",
            "validation_state": None,
            "validation_results": [],
            "manifest": None,
        }

    root = Path(settings.STORAGE_DIR).resolve()
    path = Path(evidence.stored_path).resolve()
    try:
        path.relative_to(root)
    except ValueError:
        return _error("Evidence path is outside the configured evidence storage directory.")
    if not path.is_file():
        return _error("The preserved evidence file is not available for inspection.")

    try:
        # Uploaded content is untrusted. Do not follow external manifest URLs or
        # make OCSP network requests while processing an evidence file.
        context = Context.from_dict({
            "verify": {"remote_manifest_fetch": False, "ocsp_fetch": False}
        })
        with context:
            reader = Reader(str(path), context=context)
            with reader:
                if not reader.is_embedded():
                    remote_url = reader.get_remote_url()
                    if remote_url:
                        return {
                            "credential_status": "EXTERNAL_MANIFEST_NOT_FETCHED",
                            "summary": "The asset points to an external Content Credential. Remote retrieval is disabled for safe local evidence inspection.",
                            "validation_state": None,
                            "validation_results": [],
                            "manifest": {"external_manifest_reference_present": True},
                        }

                store = json.loads(reader.json())
                active_label = store.get("active_manifest")
                manifests = store.get("manifests") or {}
                active = manifests.get(active_label) if active_label else None
                if not active:
                    return {
                        "credential_status": "PRESENT_VALIDATION_INDETERMINATE",
                        "summary": "A C2PA manifest store was read, but it did not expose an active manifest for summary.",
                        "validation_state": str(reader.get_validation_state()),
                        "validation_results": _json_safe(reader.get_validation_results()),
                        "manifest": {"active_manifest": active_label, "manifest_count": len(manifests)},
                    }

                validation_state = _json_safe(reader.get_validation_state())
                validation_results = _json_safe(reader.get_validation_results())
                validation_text = json.dumps([validation_state, validation_results], default=str).lower()
                if any(term in validation_text for term in ("invalid", "failure", "failed", "untrusted", "mismatch", "expired", "bad signature")):
                    status = "PRESENT_VALIDATION_ISSUES"
                    summary = "A C2PA credential is present and the SDK reported one or more validation issues. Review the detailed validation results."
                elif "valid" in json.dumps(validation_state, default=str).lower():
                    status = "PRESENT_VALIDATION_REPORTED_VALID"
                    summary = "The SDK reports the C2PA credential as valid under its configured trust and verification settings. This does not establish that the image depicts the reported event."
                else:
                    status = "PRESENT_VALIDATION_INDETERMINATE"
                    summary = "A C2PA credential is present, but the SDK did not return a clear valid or invalid result."

                signature = active.get("signature_info") or {}
                manifest_summary = {
                    "active_manifest": active_label,
                    "manifest_count": len(manifests),
                    "claim_generator": active.get("claim_generator"),
                    "title": active.get("title"),
                    "signature_algorithm": signature.get("alg"),
                    "signer_issuer": signature.get("issuer"),
                    "signature_time": signature.get("time"),
                    "assertion_labels": [
                        item.get("label") for item in (active.get("assertions") or [])
                        if isinstance(item, dict) and item.get("label")
                    ],
                    "ingredient_count": len(active.get("ingredients") or []),
                }
                return {
                    "credential_status": status,
                    "summary": summary,
                    "validation_state": validation_state,
                    "validation_results": validation_results,
                    "manifest": manifest_summary,
                    "interpretation_limit": "A credential's absence is not evidence of manipulation. A valid credential authenticates the signed provenance statements and content binding, not the truth of a depicted scene.",
                }
    except Exception as exc:
        message = f"{exc.__class__.__name__}: {exc}".lower()
        if "manifestnotfound" in message or "manifest not found" in message or "no manifest" in message:
            return {
                "credential_status": "ABSENT",
                "summary": "No embedded C2PA Content Credential was found in this file.",
                "validation_state": None,
                "validation_results": [],
                "manifest": None,
                "interpretation_limit": "Credential absence is common and is not evidence of manipulation or inauthenticity.",
            }
        return _error("The C2PA SDK could not inspect this asset. The underlying exception is not exposed.")


def _json_safe(value: Any) -> Any:
    try:
        return json.loads(json.dumps(value, default=str))
    except (TypeError, ValueError):
        return str(value)[:12000]


def _error(summary: str) -> Dict[str, Any]:
    return {
        "credential_status": "INSPECTION_ERROR",
        "summary": summary,
        "validation_state": None,
        "validation_results": [],
        "manifest": None,
    }
