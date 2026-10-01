#!/usr/bin/env python3
"""Physiq W20c — os segredos do push no banco principal, sem passar pela tela nem pelo repositório:
  · ~/.physiq-push-segredo  (cria 1 vez, 600): o PUSH_SEGREDO que o gatilho manda no cabeçalho para a push-enviar;
  · Vault 'physiq_push_segredo' = o mesmo valor (o gatilho {schema}.avisos_push lê dali — igual ao espelho da W4);
  · segredos das funções: PUSH_SEGREDO e FCM_SERVICE_ACCOUNT (= ~/.physiq-firebase/fcm-envio.json, a chave da conta
    fcm-envio@physiq-br — também no cofre B Code, projeto PhysiqCalc), pela Management API.
Nenhum valor é impresso (só nomes, tamanhos e "confere").

Uso: python3 e2e/w20c/segredos_push.py [--conferir]
"""
import json
import secrets
import sys
import urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent / "w02"))
from _comum import PRINCIPAL_REF, UA, pat, sql_principal  # noqa: E402

ARQ_SEGREDO = Path.home() / ".physiq-push-segredo"
ARQ_CONTA = Path.home() / ".physiq-firebase" / "fcm-envio.json"
NOME_VAULT = "physiq_push_segredo"


def segredo() -> str:
    if not ARQ_SEGREDO.exists():
        ARQ_SEGREDO.touch(mode=0o600)
        ARQ_SEGREDO.write_text(secrets.token_urlsafe(48), encoding="utf-8")
    ARQ_SEGREDO.chmod(0o600)
    s = ARQ_SEGREDO.read_text(encoding="utf-8").strip()
    if len(s) < 32:
        raise SystemExit("segredo curto demais")
    return s


def api(metodo: str, caminho: str, corpo=None):
    req = urllib.request.Request(f"https://api.supabase.com/v1/projects/{PRINCIPAL_REF}{caminho}", method=metodo,
                                 data=None if corpo is None else json.dumps(corpo).encode(),
                                 headers={"Authorization": f"Bearer {pat()}", "Content-Type": "application/json", "User-Agent": UA})
    with urllib.request.urlopen(req, timeout=60) as r:
        t = r.read().decode()
        return r.status, (json.loads(t) if t.strip() else None)


def main() -> int:
    s = segredo()
    esc = s.replace("'", "''")
    conta = json.loads(ARQ_CONTA.read_text(encoding="utf-8"))
    assert conta.get("project_id") == "physiq-br" and conta.get("client_email", "").startswith("fcm-envio@"), "conta de serviço inesperada"
    if "--conferir" not in sys.argv:
        existe = sql_principal(f"select id::text from vault.secrets where name = '{NOME_VAULT}'")
        if existe:
            sql_principal(f"select vault.update_secret('{existe[0]['id']}', '{esc}')")
            print("vault: atualizado")
        else:
            sql_principal(f"select vault.create_secret('{esc}', '{NOME_VAULT}', 'Physiq W20c: PUSH_SEGREDO para o pg_net chamar a push-enviar')")
            print("vault: criado")
        # um por vez (os 2 juntos deram HTTP 500 na Management API em 01/10) e a chave em JSON compacto
        for nome, valor in (("PUSH_SEGREDO", s), ("FCM_SERVICE_ACCOUNT", json.dumps(conta, separators=(",", ":")))):
            st, _ = api("POST", "/secrets", [{"name": nome, "value": valor}])
            print(f"segredo {nome}: HTTP {st}")
    ok = sql_principal(f"select (decrypted_secret = '{esc}') as igual, length(decrypted_secret) as tam from vault.decrypted_secrets where name = '{NOME_VAULT}'")
    print("vault confere:", ok[0]["igual"] if ok else None, "tamanho:", ok[0]["tam"] if ok else None)
    st, lista = api("GET", "/secrets")
    nomes = sorted(x["name"] for x in (lista or []))
    print("segredos das funções (nomes):", ", ".join(n for n in nomes if n in ("PUSH_SEGREDO", "FCM_SERVICE_ACCOUNT")), f"(de {len(nomes)})")
    return 0 if ok and ok[0]["igual"] and {"PUSH_SEGREDO", "FCM_SERVICE_ACCOUNT"} <= set(nomes) else 1


if __name__ == "__main__":
    sys.exit(main())
