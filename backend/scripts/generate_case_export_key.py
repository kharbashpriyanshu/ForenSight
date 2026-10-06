"""Print a new base64 Ed25519 key and public fingerprint for case bundle signing."""

import base64
import hashlib

from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey


private_key = Ed25519PrivateKey.generate()
private_bytes = private_key.private_bytes(
    encoding=serialization.Encoding.Raw,
    format=serialization.PrivateFormat.Raw,
    encryption_algorithm=serialization.NoEncryption(),
)
public_bytes = private_key.public_key().public_bytes(
    encoding=serialization.Encoding.Raw,
    format=serialization.PublicFormat.Raw,
)
print("CASE_EXPORT_SIGNING_PRIVATE_KEY=" + base64.b64encode(private_bytes).decode("ascii"))
print("PUBLIC_KEY_FINGERPRINT_SHA256=" + hashlib.sha256(public_bytes).hexdigest())
