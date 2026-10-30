"""Physiq restaurar-login (30/10/2026) — o AUTENTICADOR VIRTUAL do E2E: o "Android" de mentira da chave de volta, a mesma receita do
src/test/autenticadorVirtual.ts (o do Vitest). Um par ES256 de verdade (cryptography, P-256), atestação "none", origem
android:apk-key-hash:… — devolve o RegistrationResponseJSON e o AuthenticationResponseJSON no formato do WebAuthn (o que o Credential
Manager devolve em CreateRestoreCredentialResponse.responseJson e RestoreCredential.authenticationResponseJson; o formato exato do Android
sai da fase 0). A assinatura do cryptography já sai em DER (o formato do WebAuthn).
"""
from __future__ import annotations

import base64
import hashlib
import json
import os
import struct

from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.asymmetric import ec

RP_ID = "physiqcalc.com.br"
# as origens do app (base64url do SHA-256 do certificado que assina o app instalado): a assinatura da Play e a chave de upload (só staging)
ORIGEM_PLAY = "android:apk-key-hash:neGb1EVsM6ZD2RD0DZkTbTRsnpKVn_OabkwH9QTZLHY"
ORIGEM_UPLOAD = "android:apk-key-hash:VK67sCdxC-oBwEdTRtsXjGZPcxFB3YyUuohP0jilJk0"
ORIGEM_DEBUG_STAGING = "android:apk-key-hash:05haVpcS9Tr4n5ZkaJwGYowtzEhHIQzQyLWHvcYYnKg"  # a de debug do notebook (fase0.md M5)


def b64u(b: bytes) -> str:
    return base64.urlsafe_b64encode(b).decode().rstrip("=")


def de_b64u(s: str) -> bytes:
    return base64.urlsafe_b64decode(s + "=" * (-len(s) % 4))


ORIGEM_FALSA = "android:apk-key-hash:" + b64u(bytes([7]) * 32)


def cbor(v: object) -> bytes:
    """CBOR mínimo (o que a atestação e a chave COSE usam): inteiro, bytes, texto, lista e mapa (na ordem de inserção)."""
    def cab(maior: int, n: int) -> bytes:
        if n < 24:
            return bytes([maior << 5 | n])
        if n < 0x100:
            return bytes([maior << 5 | 24, n])
        if n < 0x10000:
            return bytes([maior << 5 | 25]) + n.to_bytes(2, "big")
        return bytes([maior << 5 | 26]) + n.to_bytes(4, "big")
    if isinstance(v, bool):
        raise TypeError("bool fora do CBOR mínimo")
    if isinstance(v, int):
        return cab(0, v) if v >= 0 else cab(1, -1 - v)
    if isinstance(v, bytes):
        return cab(2, len(v)) + v
    if isinstance(v, str):
        b = v.encode("utf-8")
        return cab(3, len(b)) + b
    if isinstance(v, list):
        return cab(4, len(v)) + b"".join(cbor(x) for x in v)
    if isinstance(v, dict):
        return cab(5, len(v)) + b"".join(cbor(k) + cbor(x) for k, x in v.items())
    raise TypeError(f"tipo fora do CBOR mínimo: {type(v)}")


class Autenticador:
    """Um "aparelho" com uma chave de volta (par ES256 novo)."""

    def __init__(self, origem: str = ORIGEM_PLAY) -> None:
        self.origem = origem
        self.chave = ec.generate_private_key(ec.SECP256R1())
        self.cred = os.urandom(32)
        self.id = b64u(self.cred)
        self.user_handle: str | None = None
        n = self.chave.public_key().public_numbers()
        self.cose = cbor({1: 2, 3: -7, -1: 1, -2: n.x.to_bytes(32, "big"), -3: n.y.to_bytes(32, "big")})

    @staticmethod
    def _client_data(tipo: str, desafio: str, origem: str, pacote: str | None = None) -> bytes:
        cd = {"type": tipo, "challenge": desafio, "origin": origem, "crossOrigin": False}
        if pacote:
            cd["androidPackageName"] = pacote
        return json.dumps(cd, separators=(",", ":")).encode()

    def registrar(self, opcoes: dict, origem: str | None = None, rp_id: str = RP_ID, up: bool = True, be: bool = True, bs: bool = True,
                  aaguid: bytes = bytes(16), pacote: str | None = None) -> dict:
        """A resposta do CreateRestoreCredentialRequest para as opções que a chave-restauracao deu."""
        self.user_handle = opcoes["user"]["id"]
        cd = self._client_data("webauthn.create", opcoes["challenge"], origem or self.origem, pacote)
        flags = (0x01 if up else 0) | (0x08 if be else 0) | (0x10 if bs else 0) | 0x40
        auth = (hashlib.sha256(rp_id.encode()).digest() + bytes([flags]) + struct.pack(">I", 0) + aaguid
                + struct.pack(">H", len(self.cred)) + self.cred + self.cose)
        atestacao = cbor({"fmt": "none", "attStmt": {}, "authData": auth})
        return {"id": self.id, "rawId": self.id, "type": "public-key", "authenticatorAttachment": "platform",
                "response": {"clientDataJSON": b64u(cd), "attestationObject": b64u(atestacao), "transports": ["internal"]},
                "clientExtensionResults": {}}

    def entrar(self, desafio: str, origem: str | None = None, rp_id: str = RP_ID, contador: int = 0, up: bool = True,
               user_handle: str | None | bool = True, assinar_com: "Autenticador | None" = None, pacote: str | None = None) -> dict:
        """A resposta do GetRestoreCredentialOption (a assinatura sobre authenticatorData || SHA-256(clientDataJSON)).
        user_handle=True manda o do registro; None não manda; texto manda esse. assinar_com = assina com a chave de OUTRO aparelho."""
        cd = self._client_data("webauthn.get", desafio, origem or self.origem, pacote)
        auth = hashlib.sha256(rp_id.encode()).digest() + bytes([0x01 if up else 0x00]) + struct.pack(">I", contador)
        quem = assinar_com.chave if assinar_com else self.chave
        assinatura = quem.sign(auth + hashlib.sha256(cd).digest(), ec.ECDSA(hashes.SHA256()))
        handle = self.user_handle if user_handle is True else user_handle
        resposta = {"clientDataJSON": b64u(cd), "authenticatorData": b64u(auth), "signature": b64u(assinatura)}
        if handle:
            resposta["userHandle"] = handle
        return {"id": self.id, "rawId": self.id, "type": "public-key", "authenticatorAttachment": "platform", "response": resposta,
                "clientExtensionResults": {}}


def user_handle_de(uuid: str) -> str:
    return b64u(bytes.fromhex(uuid.replace("-", "")))
