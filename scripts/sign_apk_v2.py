#!/usr/bin/env python3
"""Re-sign an APK with APK Signature Scheme v2 (RSA PKCS#1 v1.5 + SHA-256), replacing any existing signing block.
Usage: apksign_v2.py <in.apk> <out.apk> <keystore.p12> <password> [alias]
Only for APKs without v1 (JAR) signature files and minSdk >= 24 (v2 is enough there)."""
import hashlib, struct, sys
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import padding
from cryptography.hazmat.primitives.serialization import pkcs12

APK_SIG_BLOCK_MAGIC = b'APK Sig Block 42'
V2_ID = 0x7109871a
RSA_PKCS1_SHA256 = 0x0103
CHUNK = 1 << 20

def u32(n): return struct.pack('<I', n)
def u64(n): return struct.pack('<Q', n)
def lp(b): return u32(len(b)) + b                      # uint32 length-prefixed
def seq(items): return lp(b''.join(lp(i) for i in items))

def split(apk: bytes):
    eocd = apk.rfind(b'PK\x05\x06')
    assert eocd >= 0, 'no end of central directory'
    cd_off = struct.unpack('<I', apk[eocd + 16:eocd + 20])[0]
    start = cd_off
    if apk[cd_off - 16:cd_off] == APK_SIG_BLOCK_MAGIC:   # drop the old signing block
        size = struct.unpack('<Q', apk[cd_off - 24:cd_off - 16])[0]
        start = cd_off - size - 8
        assert struct.unpack('<Q', apk[start:start + 8])[0] == size, 'bad signing block'
    return apk[:start], apk[cd_off:eocd], apk[eocd:]

def digest(sections):
    chunks = []
    for s in sections:
        for i in range(0, len(s), CHUNK):
            c = s[i:i + CHUNK]
            chunks.append(hashlib.sha256(b'\xa5' + u32(len(c)) + c).digest())
    return hashlib.sha256(b'\x5a' + u32(len(chunks)) + b''.join(chunks)).digest()

def main(inp, out, ks, pw, alias=None):
    apk = open(inp, 'rb').read()
    entries, cd, eocd = split(apk)
    key, cert, _ = pkcs12.load_key_and_certificates(open(ks, 'rb').read(), pw.encode())
    cert_der = cert.public_bytes(serialization.Encoding.DER)
    pub_der = key.public_key().public_bytes(serialization.Encoding.DER, serialization.PublicFormat.SubjectPublicKeyInfo)
    # the digest is computed with the EOCD pointing at where the signing block will start
    eocd_for_digest = eocd[:16] + u32(len(entries)) + eocd[20:]
    dig = digest([entries, cd, eocd_for_digest])
    signed_data = seq([u32(RSA_PKCS1_SHA256) + lp(dig)]) + seq([cert_der]) + seq([])
    sig = key.sign(signed_data, padding.PKCS1v15(), hashes.SHA256())
    signer = lp(signed_data) + seq([u32(RSA_PKCS1_SHA256) + lp(sig)]) + lp(pub_der)
    v2 = seq([signer])                                   # signers: sequence of length-prefixed signer
    pair = u64(4 + len(v2)) + u32(V2_ID) + v2
    size = len(pair) + 8 + 16                            # pairs + trailing size + magic
    block = u64(size) + pair + u64(size) + APK_SIG_BLOCK_MAGIC
    new_cd_off = len(entries) + len(block)
    new_eocd = eocd[:16] + u32(new_cd_off) + eocd[20:]
    open(out, 'wb').write(entries + block + cd + new_eocd)
    print('signed', out, 'cert SHA1', ':'.join('%02X' % b for b in hashlib.sha1(cert_der).digest()))

if __name__ == '__main__':
    main(*sys.argv[1:])
