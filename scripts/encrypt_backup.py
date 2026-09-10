import base64
import hashlib
import os
import sys
from pathlib import Path

from cryptography.hazmat.primitives.ciphers.aead import AESGCM


source = Path(sys.argv[1])
destination = Path(sys.argv[2])
password = os.environ["BACKUP_ENCRYPTION_KEY"].encode("utf-8")
salt = os.urandom(16)
nonce = os.urandom(12)
key = hashlib.scrypt(password, salt=salt, n=2**14, r=8, p=1, dklen=32)
ciphertext = AESGCM(key).encrypt(nonce, source.read_bytes(), None)
destination.write_bytes(b"BIBLIOTECA-AES256-GCM\n" + base64.b64encode(salt + nonce + ciphertext))
