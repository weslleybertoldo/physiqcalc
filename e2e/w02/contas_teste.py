#!/usr/bin/env python3
"""Physiq W2 — garante as contas de TESTE usadas nos E2E da W2 (idempotente: cria ou redefine a senha).

Banco principal (Auth compartilhado por public e staging):
  nutri.teste.claude@physiqnutri.app     nutricionista do site antigo do Nutri (isenta da assinatura) — smoke do Nutri
  personal.teste.claude@physiqnutri.app  personal/dono da conta de teste da W2 (sem papel no JWT → o gatilho decide)
  aluno.teste.claude@physiqnutri.app     aluno da conta de teste (login por e-mail e senha)
  conflito.teste.claude@physiqnutri.app  e-mail que TAMBÉM existe no Banco do Treino, sem vínculo → conta_em_conflito
  limite.teste.claude@physiqnutri.app    só pro teste do limite de tentativas (queima 20 trocas/h)
Banco do Treino: conflito.teste.claude@physiqnutri.app (ambiente=staging) — pra provocar o conflito.

Senhas: ~/.physiq-teste-<nome> (600), geradas aqui. Uso: python3 e2e/w02/contas_teste.py
"""
import secrets
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from _comum import PRINCIPAL_REF, PRINCIPAL_URL, TREINO_REF, TREINO_URL, http, service, sql_principal, sql_treino  # noqa: E402

PRINCIPAL = {
    "nutri": ("nutri.teste.claude@physiqnutri.app", {"role": "nutricionista"}, "Nutri Teste Claude"),
    "personal": ("personal.teste.claude@physiqnutri.app", {}, "Personal Teste Claude"),
    "aluno": ("aluno.teste.claude@physiqnutri.app", {"role": "paciente"}, "Aluno Teste Claude"),
    "conflito": ("conflito.teste.claude@physiqnutri.app", {"role": "paciente"}, "Conflito Teste Claude"),
    "limite": ("limite.teste.claude@physiqnutri.app", {"role": "paciente"}, "Limite Teste Claude"),
}


def senha_do_arquivo(nome: str) -> str:
    arq = Path.home() / f".physiq-teste-{nome}"
    if not arq.exists():
        arq.write_text(secrets.token_urlsafe(18), encoding="utf-8")
    arq.chmod(0o600)
    return arq.read_text(encoding="utf-8").strip()


def garantir(url: str, chave_service: str, email: str, senha: str, app_meta: dict, user_meta: dict, id_existente: str | None) -> str:
    cab = {"apikey": chave_service, "Authorization": f"Bearer {chave_service}"}
    if id_existente:
        st, r, _ = http("PUT", f"{url}/auth/v1/admin/users/{id_existente}", {"password": senha, "email_confirm": True}, cab)
        assert st == 200, (email, st, r)
        return id_existente
    st, r, _ = http("POST", f"{url}/auth/v1/admin/users",
                    {"email": email, "password": senha, "email_confirm": True, "app_metadata": app_meta, "user_metadata": user_meta}, cab)
    assert st == 200, (email, st, r)
    return r["id"]


def main() -> int:
    sp = service(PRINCIPAL_REF)
    for nome, (email, app_meta, nome_completo) in PRINCIPAL.items():
        s = senha_do_arquivo(nome)
        achado = sql_principal(f"select id from auth.users where lower(email) = '{email}'")
        uid = garantir(PRINCIPAL_URL, sp, email, s, app_meta, {"full_name": nome_completo}, achado[0]["id"] if achado else None)
        print(f"principal  {nome:9s} {email:40s} {uid}")
    # a nutricionista de teste fica isenta da assinatura do site antigo (smoke sem depender do teste de 14 dias)
    sql_principal("update public.profiles set isento_assinatura = true, tipo_perfil = coalesce(tipo_perfil, 'nutricionista') "
                  "where email = 'nutri.teste.claude@physiqnutri.app'; "
                  "update staging.profiles set isento_assinatura = true, tipo_perfil = coalesce(tipo_perfil, 'nutricionista') "
                  "where email = 'nutri.teste.claude@physiqnutri.app'")

    st_ = service(TREINO_REF)
    email_c = PRINCIPAL["conflito"][0]
    achado = sql_treino(f"select id from auth.users where lower(email) = '{email_c}'")
    uid = garantir(TREINO_URL, st_, email_c, secrets.token_urlsafe(24), {}, {"full_name": "Conflito Teste Claude", "ambiente": "staging"},
                   achado[0]["id"] if achado else None)
    print(f"treino     conflito  {email_c:40s} {uid}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
