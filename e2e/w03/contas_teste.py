#!/usr/bin/env python3
"""Physiq W3 — contas de teste do login único (idempotente; SÓ contas de teste — P26). Rode depois do script 01 no schema.

Banco principal (o Auth é compartilhado por public e staging) — senha para entrar por e-mail e senha no Physiq:
  teste@teste.com                        aluno do Calc (professor: admin.teste.claude) — senha = a do Treino
                                         (~/.physiqcalc-teste-aluno-teste); treino antigo em public (o PowerSync lê public)
  admin.teste.claude@physiqcalc.app      master de teste do Calc (Treino: admin) — senha = ~/.physiqcalc-teste-admin
  prof1.teste.claude@physiqcalc.app      professor do Calc no staging (alunos aluno1 e aluno3) — mesma senha do admin
  aluno2.teste.claude@physiqcalc.app     aluno do prof2 no staging (caso "bloqueado pelo master") — mesma senha do admin
  paciente.teste.claude@physiqnutri.app  paciente do Nutri da nutri.teste.claude (staging) — ~/.physiq-teste-paciente
As senhas de teste nunca vão para o repositório (arquivos 600 em ~).  Uso: python3 e2e/w03/contas_teste.py
"""
import secrets
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent / "w02"))
from _comum import PRINCIPAL_REF, PRINCIPAL_URL, http, service, sql_principal  # noqa: E402


def arquivo_kv(nome: str) -> dict:
    return dict(l.strip().split("=", 1) for l in Path.home().joinpath(nome).read_text().splitlines() if "=" in l)


def senha_arquivo(nome: str) -> str:
    arq = Path.home() / f".physiq-teste-{nome}"
    if not arq.exists():
        arq.write_text(secrets.token_urlsafe(18), encoding="utf-8")
    arq.chmod(0o600)
    return arq.read_text(encoding="utf-8").strip()


def garantir(email: str, senha: str, app_meta: dict | None = None, nome: str | None = None) -> str:
    sp = service(PRINCIPAL_REF)
    cab = {"apikey": sp, "Authorization": f"Bearer {sp}"}
    achado = sql_principal(f"select id::text as id from auth.users where lower(email) = '{email}'")
    if achado:
        uid = achado[0]["id"]
        st, r, _ = http("PUT", f"{PRINCIPAL_URL}/auth/v1/admin/users/{uid}", {"password": senha, "email_confirm": True}, cab)
        assert st == 200, (email, st, r)
        return uid
    corpo = {"email": email, "password": senha, "email_confirm": True, "app_metadata": app_meta or {}, "user_metadata": {"full_name": nome or email}}
    st, r, _ = http("POST", f"{PRINCIPAL_URL}/auth/v1/admin/users", corpo, cab)
    assert st == 200, (email, st, r)
    return r["id"]


def main() -> int:
    admin = arquivo_kv(".physiqcalc-teste-admin")
    aluno = arquivo_kv(".physiqcalc-teste-aluno-teste")
    for email, senha in [
        ("teste@teste.com", aluno["SENHA"]),
        ("admin.teste.claude@physiqcalc.app", admin["SENHA"]),
        ("prof1.teste.claude@physiqcalc.app", admin["SENHA"]),
        ("aluno2.teste.claude@physiqcalc.app", admin["SENHA"]),
    ]:
        print(f"principal  {email:40s} {garantir(email, senha, {'origem': 'calc', 'calc': True})}")

    # paciente do Nutri (staging): aluno só de Nutrição, da nutri de teste (a conta legado_nutri dela vem do gatilho)
    email_p = "paciente.teste.claude@physiqnutri.app"
    uid = garantir(email_p, senha_arquivo("paciente"), {"role": "paciente"}, "Paciente Teste Claude")
    sql_principal(f"""
      insert into staging.pacientes (nutricionista_id, nome, email, user_id, genero, ativo)
      select (select id from auth.users where email = 'nutri.teste.claude@physiqnutri.app'), 'Paciente Teste Claude', '{email_p}',
             '{uid}'::uuid, 'feminino', true
      where not exists (select 1 from staging.pacientes where user_id = '{uid}'::uuid and deleted_at is null);
      update staging.pacientes p set conta_id = c.id, origem = coalesce(p.origem, 'nutri')
        from staging.contas c join staging.conta_membros m on m.conta_id = c.id
       where p.user_id = '{uid}'::uuid and p.conta_id is null and c.origem = 'legado_nutri'
         and m.user_id = p.nutricionista_id and m.status = 'ativo';""")
    print(f"principal  {email_p:40s} {uid}")
    print(sql_principal(f"select p.nome, p.conta_id is not null as com_conta, c.origem from staging.pacientes p left join staging.contas c on c.id = p.conta_id where p.user_id = '{uid}'"))
    return 0


if __name__ == "__main__":
    sys.exit(main())
