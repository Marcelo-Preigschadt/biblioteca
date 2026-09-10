import base64
import hashlib
import json
import os
import sys
from pathlib import Path

from cryptography.hazmat.primitives.ciphers.aead import AESGCM


source = Path(sys.argv[1])
destination = Path(sys.argv[2])
service_key = os.environ["SUPABASE_SERVICE_ROLE_KEY"].encode("utf-8")
document = json.loads(source.read_text(encoding="utf-8"))
key = hashlib.sha256(b"biblioteca-backup-v1:" + service_key).digest()
plaintext = AESGCM(key).decrypt(
    base64.b64decode(document["iv"]),
    base64.b64decode(document["ciphertext"]),
    None,
)
destination.write_bytes(plaintext)
