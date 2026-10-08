#!/usr/bin/env python3
"""Physiq W16b — Parte A: REPRODUÇÃO no STAGING da desativação de 01/10/2026 00:10:58 UTC (a matrícula do app de um aluno
ficou ativo = false sem app_encerrada_em, sem desvinculado_em e sem conta_eventos, com 1 item 'pessoa' na fila do
espelho na mesma transação).

O que os logs do API Gateway do principal mostram (Management API › analytics/endpoints/logs, fonte edge_logs):
  00:10:35.090  PATCH /rest/v1/pacientes?id=eq.<paciente do outro login>&select=*  (186 bytes = o formulário "Editar paciente")
  00:10:58.735  PATCH /rest/v1/pacientes?id=eq.<matrícula do app>&select=*  (15 bytes = {"ativo":false} — o "Desativar paciente")
  os 2 com Referer https://nutri.physiqcalc.com.br/, supabase-js 2.116.0, o MESMO JWT (o do master) e a mesma
  sessão; logo depois, o GET da lista de ativos (o recarregar() do site antigo).

Passos (contas de TESTE; nada de pessoa real):
  1. A (w16b-app) entra no app sem profissional → matrícula do app (MA) ativa.
  2. N (nutri.teste.claude, legado_nutri) cria o paciente P no site antigo (POST pacientes, como o criarPaciente) e o acesso dele
     (paciente_criar_acesso → login B = w16b-paciente) — o papel do paciente de OUTRO login que recebeu o e-mail.
  3. N edita P pelo formulário do site antigo (PATCH com os 7 campos do formParaRegistro) com o e-mail de A → 2 pacientes com o
     mesmo e-mail e logins diferentes (o PATCH de 00:10:35). Esperado: MA continua ativa.
     Com a trava da W16b (--com-trava): o PATCH é RECUSADO com paciente_email_repetido e P fica com o e-mail de antes.
  4. B entra e roda o pos-login (staging) → MA continua ativa (o pos-login/aceitar_convites_do_email não liga nem desliga nada pelo
     e-mail do paciente). 5. A entra e roda o pos-login → MA continua ativa.
  6. Um MASTER (o JWT de master na transação, como o PostgREST faz — numa transação DESFEITA) lista os pacientes como o site antigo
     (ativo=eq.true, order=updated_at.desc, limit 20): vê MA e P, de contas diferentes, com o mesmo e-mail; e faz o "Desativar
     paciente" (UPDATE ativo = false em MA) → a pegada é IGUAL à de produção: ativo false, app_encerrada_em/desvinculado_em nulos,
     nenhum conta_eventos, 1 'pessoa' do A na fila com criado_em = updated_at (mesma transação).
Uso: python3 e2e/w16b/causa.py [--com-trava] [--limpar]
"""
from __future__ import annotations
import sys as _sys
_sys.exit("desativado na hml-02 (H-04, 07/10/2026): dava o claim global de master (app_metadata.role) a uma conta de "
          "teste — o Auth é um só para staging e produção. O master de teste agora vale só em staging.profiles.")

import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import _base as B  # noqa: E402

S = "staging"
B.ESTADO["schema"] = S
p = B.p
A, BL, N = "w16b-app", "w16b-paciente", B.NUTRI_LEGADO
NOME_P = "Bruna Paciente W16b da Silva"
SAIDA = B.SCRATCH / "causa"


def q(sql: str) -> list:
    return B.sql_principal(sql)


def limpar() -> dict:
    """Apaga só o que este teste cria no staging: as matrículas do A, o paciente P (e o login B que a nutri criou)."""
    a = B.uid(A)
    out = {}
    if a:
        out["matriculas_A"] = q(f"with d as (delete from {S}.pacientes where user_id = '{a}' returning id) select count(*)::int n from d")[0]["n"]
        q(f"delete from {S}.avisos where destino_user_id = '{a}'")
    out["paciente_P"] = q(f"with d as (delete from {S}.pacientes where nome = $n${NOME_P}$n$ returning id) select count(*)::int n from d")[0]["n"]
    b = B.uid(BL)
    if b:
        assert B.EMAIL[BL].endswith(".teste.claude@physiqnutri.app")
        sp = B.service(B.PRINCIPAL_REF)
        st, r, _ = B.http("DELETE", f"{B.PRINCIPAL_URL}/auth/v1/admin/users/{b}", None, {"apikey": sp, "Authorization": f"Bearer {sp}"})
        out["login_B_apagado"] = st
    return out


def matricula_app(a: str) -> dict | None:
    r = q(f"""select p.id::text, p.ativo, p.app_encerrada_em, p.desvinculado_em, p.updated_at, p.config
                from {S}.pacientes p join {S}.contas c on c.id = p.conta_id
               where p.user_id = '{a}' and c.origem = 'app' and p.deleted_at is null order by p.created_at limit 1""")
    return r[0] if r else None


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--com-trava", action="store_true", help="a trava da W16b já está no staging: o passo 3 tem que ser recusado")
    ap.add_argument("--limpar", action="store_true")
    a_ = ap.parse_args()
    print("limpeza:", limpar())
    if a_.limpar:
        return 0
    B.saude_ok("a reprodução (pos-login chama o Treino)")

    # 1. A entra no app sem profissional
    ida = B.B5.garantir_usuario(B.EMAIL[A], B.CONTAS[A][1], B.NOMES[A])
    q(f"update {S}.profiles set nome = $n${B.NOMES[A]}$n$ where id = '{ida}'")
    st, r = B.rpc(A, "entrar_sem_profissional", {"p_objetivo": "ganhar_massa", "p_plano": "app_treino_alimentacao"})
    ma = matricula_app(ida)
    p.check(st == 200 and isinstance(r, dict) and r.get("ok") and ma and ma["ativo"], f"[1] A entrou no app sem profissional: matrícula do app ativa ({r})")

    # 2. N cria P no site antigo + o acesso (login B)
    nid = B.uid(N)
    st, novo = B.rest_como(N, "POST", "pacientes?select=*", {
        "nome": NOME_P, "apelido": None, "nascimento": None, "telefone": None, "cpf": None, "email": B.EMAIL[BL], "genero": None,
        "nutricionista_id": nid})
    pid = novo[0]["id"] if st in (200, 201) and isinstance(novo, list) else None
    p.check(bool(pid), f"[2] a nutri criou o paciente P no site antigo (POST pacientes {st})")
    st, idb = B.rpc(N, "paciente_criar_acesso", {"p_paciente_id": pid, "p_email": B.EMAIL[BL], "p_senha": B.CONTAS[BL][1]})
    pr = q(f"select user_id::text, conta_id::text, (select origem from {S}.contas where id = conta_id) origem from {S}.pacientes where id = '{pid}'")[0]
    p.check(st == 200 and pr["user_id"] == idb and pr["origem"] == "legado_nutri",
            f"[2] o acesso de P = login B (um OUTRO login), na conta legado_nutri da nutri ({st})")

    # 3. N edita P pelo formulário com o e-mail de A (o PATCH de 00:10:35)
    form = {"nome": NOME_P, "apelido": None, "nascimento": None, "telefone": None, "cpf": None, "email": B.EMAIL[A], "genero": None}
    st, r = B.rest_como(N, "PATCH", f"pacientes?id=eq.{pid}&select=*", form)
    email_p = q(f"select email from {S}.pacientes where id = '{pid}'")[0]["email"]
    ma3 = matricula_app(ida)
    if a_.com_trava:
        txt = json.dumps(r, ensure_ascii=False)
        p.check(st >= 400 and B.ERRO_EMAIL in txt and email_p == B.EMAIL[BL],
                f"[3 TRAVA] o site antigo NÃO grava o e-mail de outro aluno: HTTP {st} {B.ERRO_EMAIL} ({txt[:160]}); P manteve o e-mail dele")
    else:
        p.check(st == 200 and email_p == B.EMAIL[A], f"[3] sem trava o site antigo grava o e-mail repetido: 2 pacientes com o mesmo e-mail e logins diferentes (HTTP {st})")
    p.check(bool(ma3 and ma3["ativo"]), "[3] a matrícula do app de A continua ATIVA depois da edição (nenhum gatilho desliga)")

    # 4. B entra e roda o pos-login; 5. A entra e roda o pos-login
    for k, rot in ((BL, "4] B (login do paciente P)"), (A, "5] A (aluno do app)")):
        st, r = B.B5.funcao(B.token(k), "pos-login", {})
        m = matricula_app(ida)
        p.check(st == 200 and isinstance(r, dict) and r.get("ok") and m and m["ativo"] and not m["app_encerrada_em"],
                f"[{rot} entrou: pos-login {st} (convites {r.get('convites') if isinstance(r, dict) else r}) e a matrícula do app de A continua ATIVA")
    pr5 = q(f"select user_id::text from {S}.pacientes where id = '{pid}'")[0]
    p.check(pr5["user_id"] == idb, "[4/5] P continua ligado ao login B (o pos-login não religa paciente pelo e-mail)")

    # 6. o master no site antigo: lista + "Desativar paciente" em MA (transação desfeita)
    ma = matricula_app(ida)
    claims = {"sub": "00000000-0000-4000-8000-00000000a16b", "role": "authenticated", "aud": "authenticated",
              "app_metadata": {"role": "master"}}
    r = B.como_claims(claims, f"""
      r := r || jsonb_build_object('lista', (select jsonb_agg(jsonb_build_object('id', x.id, 'email', x.email, 'conta_origem', x.origem))
               from (select p.id, p.email, c.origem from {S}.pacientes p left join {S}.contas c on c.id = p.conta_id
                      where p.deleted_at is null and p.ativo order by p.updated_at desc limit 20) x));
      update {S}.pacientes set ativo = false where id = '{ma["id"]}';
      perform set_config('role', 'postgres', true);
      r := r || jsonb_build_object(
        'depois', (select jsonb_build_object('ativo', ativo, 'app_encerrada_em', app_encerrada_em, 'desvinculado_em', desvinculado_em,
                                             'conta_excluida', coalesce(config, '{{}}'::jsonb) ? 'conta_excluida_em', 'updated_at', updated_at)
                     from {S}.pacientes where id = '{ma["id"]}'),
        'eventos', (select count(*) from {S}.conta_eventos e where e.em >= now() and e.depois::text like '%{ma["id"]}%'),
        'fila', (select jsonb_agg(jsonb_build_object('tipo', f.tipo, 'criado_em', f.criado_em)) from {S}.espelho_pendencias f
                  where f.criado_em = now() and f.payload ->> 'principal_user_id' = '{ida}'),
        'agora', now());""")
    B.json_arquivo(SAIDA / "passo6_master.json", r)
    ids_lista = [x["id"] for x in (r.get("lista") or [])]
    mesmos = [x for x in (r.get("lista") or []) if x["email"] == B.EMAIL[A]]
    p.check(ma["id"] in ids_lista and (a_.com_trava or pid in ids_lista),
            f"[6] o master vê na lista do site antigo a matrícula do APP (conta de outra origem) {'e o paciente P' if not a_.com_trava else ''}")
    if not a_.com_trava:
        p.check(len(mesmos) == 2 and {x["conta_origem"] for x in mesmos} == {"app", "legado_nutri"},
                f"[6] na lista os 2 aparecem com o MESMO e-mail (app + legado_nutri): {mesmos}")
    d = r.get("depois") or {}
    fila = r.get("fila") or []
    p.check(d.get("ativo") is False and d.get("app_encerrada_em") is None and d.get("desvinculado_em") is None and not d.get("conta_excluida"),
            f"[6] o 'Desativar paciente' do master deixa a MESMA pegada de produção: ativo false, sem app_encerrada_em/desvinculado_em/conta_excluida ({d})")
    p.check(r.get("eventos") == 0, f"[6] nenhum conta_eventos (a escrita direta do site antigo não deixa rastro) ({r.get('eventos')})")
    p.check(len(fila) == 1 and fila[0]["tipo"] == "pessoa" and fila[0]["criado_em"] == d.get("updated_at"),
            f"[6] 1 item 'pessoa' do A na fila do espelho com criado_em = updated_at (a MESMA transação, como o 59 de produção) ({fila})")
    m = matricula_app(ida)
    p.check(bool(m and m["ativo"]), "[6] transação desfeita: a matrícula do app de A segue ativa no staging")
    return p.fim()


if __name__ == "__main__":
    sys.exit(main())
