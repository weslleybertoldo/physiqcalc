#!/usr/bin/env python3
"""Physiq W13 — massa de TESTE no staging (idempotente; SÓ *.teste.claude@physiqnutri.app — P26).

  (sem opção)  a "Consultoria Ferreira W13" (conta nova em teste — até 10 alunos): Lucas (dono + personal), Camila (nutricionista),
               Bruno (2º personal); os alunos da tela 6/7 com as fotos das telas aprovadas (Rafael Moura com login, Treino +
               Nutrição; Marina Alves, João Pedro, Beatriz Lima, Carlos Souza — do Bruno —, Diego Souza sem responsável), tags e
               mensalidades (pago / pendente); e a "Conta Limite W13" (f10) da Paula com 10 alunos ativos
  --limpar     apaga a massa da W13 no staging (matrículas, convites, cadastros pendentes, contas e logins w13.*)

Uso: python3 e2e/w13/massa.py [--limpar]
"""
from __future__ import annotations

import argparse
import sys
import urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import _base as B  # noqa: E402

S = "staging"
B.ESTADO["schema"] = S
FOTO_DE = {"Rafael Moura": "av1.jpg", "Marina Alves": "av2.jpg", "João Pedro": "av3.jpg", "Beatriz Lima": "av4.jpg",
           "Carlos Souza": "av5.jpg", "Diego Souza": "av6.jpg", "Lucas Ferreira": "pro.jpg", "Camila Rocha": "av4.jpg"}


def q(sql: str) -> list:
    return B.sql_principal(sql)


def subir_foto(nome: str) -> str | None:
    arq = FOTO_DE.get(nome)
    if not arq or not (B.FOTOS / arq).exists():
        return None
    caminho = f"w13/{arq}"
    sp = B.service(B.PRINCIPAL_REF)
    req = urllib.request.Request(f"{B.PRINCIPAL_URL}/storage/v1/object/fotos-perfil-staging/{caminho}", data=(B.FOTOS / arq).read_bytes(),
                                 method="POST", headers={"Authorization": f"Bearer {sp}", "apikey": sp, "Content-Type": "image/jpeg",
                                                         "x-upsert": "true", "User-Agent": "physiq-e2e-w13"})
    with urllib.request.urlopen(req, timeout=60) as r:
        assert r.status in (200, 201), r.status
    return f"{B.API_P}/storage/v1/object/public/fotos-perfil-staging/{caminho}"


def garantir_conta(dono: str, nome: str, tipo: str, registro: str) -> str:
    c = B.conta_de(dono, nome)
    if not c:
        st, r = B.rpc(dono, "criar_minha_conta", {"p_nome": nome, "p_tipo": tipo, "p_registro": registro})
        assert st == 200 and isinstance(r, dict) and r.get("ok"), (st, r)
        c = B.conta_de(dono, nome)
    assert c, "conta não nasceu"
    return c


def membro(conta: str, quem: str, papeis: list[str]) -> None:
    u = B.uid(quem)
    arr = "array[" + ",".join(f"'{x}'" for x in papeis) + "]::text[]"
    if not q(f"select 1 from {S}.conta_membros where conta_id = '{conta}' and user_id = '{u}'"):
        q(f"""insert into {S}.conta_membros (conta_id, user_id, papeis, status, codigo_convite)
              values ('{conta}', '{u}', {arr}, 'ativo', {S}.gerar_codigo_membro($n${B.NOMES[quem]}$n$))""")
    q(f"update {S}.conta_membros set status = 'ativo', removido_em = null, papeis = {arr} where conta_id = '{conta}' and user_id = '{u}'")


def aluno_sem_login(conta: str, nome: str, email: str | None, personal: str | None, nutri: str | None, tags: list[str],
                    mensalidade: tuple[float, str | None] | None = None) -> str:
    foto = subir_foto(nome)
    lit = lambda v: "null" if v is None else f"$v${v}$v$"  # noqa: E731
    pers = f"'{B.uid(personal)}'" if personal else "null"
    nut = f"'{B.uid(nutri)}'" if nutri else "null"
    tg = "array[" + ",".join(f"$t${t}$t$" for t in tags) + "]::text[]" if tags else "'{}'::text[]"
    r = q(f"select id::text from {S}.pacientes where conta_id = '{conta}' and nome = {lit(nome)} and deleted_at is null")
    if r:
        pid = r[0]["id"]
        q(f"""update {S}.pacientes set personal_id = {pers}, nutricionista_id = {nut}, tags = {tg}, foto_url = {lit(foto)}, ativo = true,
                 acesso_bloqueado_em = null, acesso_bloqueado_msg = null, email = {lit(email)} where id = '{pid}'""")
    else:
        pid = q(f"""insert into {S}.pacientes (nutricionista_id, personal_id, conta_id, nome, email, tags, foto_url, origem, ativo)
                    values ({nut}, {pers}, '{conta}', {lit(nome)}, {lit(email)}, {tg}, {lit(foto)}, 'novo', true) returning id::text""")[0]["id"]
    if mensalidade:
        valor, ate = mensalidade
        q(f"""update {S}.pacientes set mensalidade_valor = {valor}, cobranca_pausada = false,
                 mensalidade_desde = now() - interval '40 days', mensalidade_pago_ate = {lit(ate)} where id = '{pid}'""")
    return pid


def montar() -> None:
    for k in ("w13-dono", "w13-nutri", "w13-personal2", "w13-aluno", "w13-limite"):
        email, s = B.CONTAS[k]
        print(f"principal  {email:46s} {B.B5.garantir_usuario(email, s, B.NOMES[k])}")
    c = garantir_conta("w13-dono", B.NOME_CONTA, "personal", "CREF 001313-G/PE")
    for k, tipo in (("w13-dono", "personal"), ("w13-nutri", "nutricionista"), ("w13-personal2", "personal"), ("w13-limite", "personal"),
                    ("w13-aluno", None)):
        u = B.uid(k)
        foto = subir_foto(B.NOMES[k]) if k in ("w13-dono", "w13-nutri") else None
        extra = f", dados_profissionais = coalesce(dados_profissionais, '{{}}'::jsonb) || jsonb_build_object('foto_url', '{foto}')" if foto else ""
        q(f"update {S}.profiles set nome = $n${B.NOMES[k]}$n${', tipo_perfil = ' + repr(tipo) if tipo else ''}{extra} where id = '{u}'")
    membro(c, "w13-nutri", ["nutricionista"])
    membro(c, "w13-personal2", ["personal"])
    # Rafael Moura: aluno COM login (Treino + Nutrição) — o bloqueio de verdade (F5)
    ua = B.uid("w13-aluno")
    r = q(f"select {S}.matricular_na_conta('{ua}', '{c}', '{B.uid('w13-dono')}', '{B.uid('w13-nutri')}', 'novo', true) as r")[0]["r"]
    assert r.get("ok"), r
    foto = subir_foto("Rafael Moura")
    q(f"""update {S}.pacientes set nome = 'Rafael Moura', email = '{B.EMAIL['w13-aluno']}', ativo = true, tags = array['VIP']::text[],
             acesso_bloqueado_em = null, acesso_bloqueado_msg = null, foto_url = '{foto}', objetivo = 'definição',
             mensalidade_valor = 249, cobranca_pausada = false, mensalidade_desde = now() - interval '70 days',
             mensalidade_pago_ate = now() + interval '19 days'
           where user_id = '{ua}' and conta_id = '{c}' and deleted_at is null""")
    aluno_sem_login(c, "Marina Alves", "w13.marina.teste.claude@physiqnutri.app", None, "w13-nutri", ["Manhã"])
    aluno_sem_login(c, "João Pedro", "w13.joao.teste.claude@physiqnutri.app", "w13-dono", None, ["Hipertrofia"], (199.0, None))
    aluno_sem_login(c, "Beatriz Lima", "w13.beatriz.teste.claude@physiqnutri.app", "w13-dono", "w13-nutri", [])
    aluno_sem_login(c, "Carlos Souza", "w13.carlos.teste.claude@physiqnutri.app", "w13-personal2", None, ["Noite"])
    aluno_sem_login(c, "Diego Souza", "w13.diego.teste.claude@physiqnutri.app", None, None, [])
    # Conta Limite W13 (f10): 10 alunos ativos → o 11º é recusado (critério de pronto)
    cl = garantir_conta("w13-limite", B.NOME_CONTA_LIMITE, "personal", "CREF 001314-G/PE")
    q(f"update {S}.contas set faixa = 'f10' where id = '{cl}'")
    for i in range(1, 11):
        aluno_sem_login(cl, f"Aluno Limite {i:02d}", f"w13.limite{i:02d}.teste.claude@physiqnutri.app", "w13-limite", None, [])
    ativos = q(f"select {S}.conta_alunos_ativos('{cl}') as n, {S}.conta_limite_alunos('{cl}') as lim")[0]
    print("conta W13:", c, "· conta limite:", cl, ativos)
    print("alunos W13:", [(x["nome"], x["user_id"] is not None) for x in q(f"select nome, user_id from {S}.pacientes where conta_id = '{c}' and deleted_at is null order by nome")])


def limpar() -> None:
    emails = [e for k, e in B.EMAIL.items()]
    lista = ",".join(f"'{e}'" for e in emails)
    ids = [r["id"] for r in q(f"select id::text from auth.users where lower(email) in ({lista})")]
    contas = [r["id"] for r in q(f"select id::text from {S}.contas where nome in ($a${B.NOME_CONTA}$a$, $b${B.NOME_CONTA_LIMITE}$b$)")]
    if contas:
        cs = ",".join(f"'{c}'" for c in contas)
        print("apagando matrículas/convites/pendentes/eventos das contas W13:", q(f"""with a as (delete from {S}.pacientes where conta_id in ({cs}) returning 1),
              b as (delete from {S}.convites where conta_id in ({cs}) returning 1),
              d as (delete from {S}.cadastros_pendentes where conta_id in ({cs}) returning 1)
              select (select count(*) from a) pacientes, (select count(*) from b) convites, (select count(*) from d) pendentes"""))
        q(f"delete from {S}.conta_eventos where conta_id in ({cs})")
        q(f"delete from {S}.conta_membros where conta_id in ({cs})")
        q(f"delete from {S}.contas where id in ({cs})")
    if ids:
        us = ",".join(f"'{u}'" for u in ids)
        q(f"delete from {S}.pacientes where user_id in ({us})")
        q(f"delete from {S}.cadastros_pendentes where nutricionista_id in ({us})")
    sp = B.service(B.PRINCIPAL_REF)
    for u in ids:
        st, _, _ = B.http("DELETE", f"{B.PRINCIPAL_URL}/auth/v1/admin/users/{u}", None, {"apikey": sp, "Authorization": f"Bearer {sp}"})
        print("login apagado:", u, st)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--limpar", action="store_true")
    a = ap.parse_args()
    if a.limpar:
        limpar()
    else:
        montar()
    return 0


if __name__ == "__main__":
    sys.exit(main())
