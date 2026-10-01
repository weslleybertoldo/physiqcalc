#!/usr/bin/env python3
"""Physiq W19 — item 2 (herdado da W16b): "cancelarAssinaturasDoAppEncerrado cancela demais".

A regra: só a matrícula do app ENCERRADA PELO VÍNCULO com um profissional (P7 — app_encerrada_em preenchido pelo
matricular_na_conta / script 06) tem a assinatura do app cancelada; a DESATIVADA À MÃO (inativa sem o marcador) não.

Prova com a conta de TESTE "pessoa" (pessoa.teste.claude@physiqnutri.app — sem matrícula nenhuma), 2 matrículas DESCARTÁVEIS
na conta do app ("W19 App Vínculo", encerrada pelo vínculo; "W19 App Manual", desativada à mão) e 2 assinaturas "só no banco"
(mp_preapproval_id sim-w19-…, payload.simulada — assinaturaSoNoBanco: NENHUMA chamada ao Mercado Pago):
  1) pagamentos-aluno › aluno_status (a rede de segurança do Pagamentos) com o token da pessoa;
  2) pos-login (chamada em todo login do app) com o token da pessoa.
  --esperar novo   (depois do deploy) só a do vínculo vira cancelled; a manual segue authorized.
  --esperar antigo (antes do deploy) reproduz o defeito: as DUAS viram cancelled.
No fim apaga as linhas descartáveis e confere as contagens (pacientes da conta do app e aluno_assinaturas) antes = depois.

Uso: python3 e2e/w19/app_encerrado.py --schema staging|public --esperar novo|antigo
"""
from __future__ import annotations

import argparse
import importlib.util
import json
import secrets
import sys
import time
from pathlib import Path

sys.dont_write_bytecode = True
_ESPEC = importlib.util.spec_from_file_location("_base_w05", Path(__file__).parent.parent / "w05" / "_base.py")
B5 = importlib.util.module_from_spec(_ESPEC)
sys.modules["_base_w05"] = B5
_ESPEC.loader.exec_module(B5)  # type: ignore[union-attr]
p = B5.p
sql = B5.sql_principal
MARCA = "W19 App"


def contagens(S: str, app: str) -> dict:
    r = sql(f"""select (select count(*) from {S}.pacientes where conta_id = '{app}') as pacientes_app,
                       (select count(*) from {S}.aluno_assinaturas) as assinaturas,
                       (select count(*) from {S}.aluno_assinaturas where status = 'cancelled') as assinaturas_canceladas""")
    return {k: int(v) for k, v in r[0].items()}


def limpar(S: str, u: str) -> None:
    sql(f"""delete from {S}.aluno_assinaturas where paciente_id in (select id from {S}.pacientes where user_id = '{u}' and nome like '{MARCA}%');
            delete from {S}.pacientes where user_id = '{u}' and nome like '{MARCA}%';""")


def status_das(S: str, ids: dict) -> dict:
    r = sql(f"select paciente_id::text, status, payload ->> 'motivo_cancelamento' as motivo from {S}.aluno_assinaturas "
            f"where paciente_id in ('{ids['vinculo']}', '{ids['manual']}')")
    por = {x["paciente_id"]: x for x in r}
    return {k: (por.get(v) or {}).get("status") for k, v in ids.items()} | {"motivo_vinculo": (por.get(ids["vinculo"]) or {}).get("motivo")}


def reabrir(S: str, ids: dict) -> None:
    sql(f"update {S}.aluno_assinaturas set status = 'authorized', payload = jsonb_build_object('simulada', true, 'w19', true) "
        f"where paciente_id in ('{ids['vinculo']}', '{ids['manual']}')")


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--schema", choices=["staging", "public"], default="staging")
    ap.add_argument("--esperar", choices=["novo", "antigo"], default="novo")
    a = ap.parse_args()
    S = a.schema
    B5.ESTADO["schema"] = S
    u = B5.uid("pessoa")
    assert u, "conta de teste pessoa não existe"
    assert B5.CONTAS["pessoa"][0].endswith(".teste.claude@physiqnutri.app")
    outras = sql(f"select count(*) as n from {S}.pacientes where user_id = '{u}' and nome not like '{MARCA}%' and deleted_at is null")
    assert int(outras[0]["n"]) == 0, "a pessoa de teste tem matrícula própria: não mexo"
    app = sql(f"select id::text from {S}.contas where origem = 'app' order by criado_em limit 1")[0]["id"]
    limpar(S, u)
    antes = contagens(S, app)
    print(f"[{S}] conta do app {app[:8]}… · antes: {antes}", flush=True)
    sufixo = secrets.token_hex(4)
    try:
        ids = {}
        for chave, nome, marcado in (("vinculo", f"{MARCA} Vínculo", True), ("manual", f"{MARCA} Manual", False)):
            r = sql(f"""insert into {S}.pacientes (conta_id, user_id, nome, ativo, app_encerrada_em, app_encerrada_motivo)
                        values ('{app}', '{u}', '{nome}', false, {"now()" if marcado else "null"}, {"'vinculou_profissional'" if marcado else "null"})
                        returning id::text""")
            ids[chave] = r[0]["id"]
            sql(f"""insert into {S}.aluno_assinaturas (paciente_id, conta_id, mp_preapproval_id, status, valor, payload)
                    values ('{ids[chave]}', '{app}', 'sim-w19-{chave}-{sufixo}', 'authorized', 29.90, jsonb_build_object('simulada', true, 'w19', true))""")
        mat = sql(f"select nome, ativo, app_encerrada_em is not null as marcador from {S}.pacientes where id in ('{ids['vinculo']}', '{ids['manual']}') order by nome")
        p.check([(m["nome"], m["ativo"], m["marcador"]) for m in mat] == [(f"{MARCA} Manual", False, False), (f"{MARCA} Vínculo", False, True)],
                f"[{S}] massa: 'Vínculo' inativa com app_encerrada_em · 'Manual' inativa sem o marcador")
        esperado = {"vinculo": "cancelled", "manual": "authorized" if a.esperar == "novo" else "cancelled"}
        for rotulo, chamar in (
            ("pagamentos-aluno › aluno_status", lambda tok: B5.funcao(tok, "pagamentos-aluno", {"acao": "aluno_status"})),
            ("pos-login", lambda tok: B5.funcao(tok, "pos-login", {})),
        ):
            reabrir(S, ids)
            tok = B5.sessao("pessoa")["access_token"]
            st, r = chamar(tok)
            p.check(st == 200, f"[{S}] {rotulo} respondeu 200 ({st} {str(r)[:160] if st != 200 else ''})")
            time.sleep(1)
            agora = status_das(S, ids)
            p.check(agora["vinculo"] == esperado["vinculo"] and agora["manual"] == esperado["manual"],
                    f"[{S}] {rotulo}: encerrada pelo vínculo → {agora['vinculo']} · desativada à mão → {agora['manual']} "
                    f"(esperado {esperado['vinculo']} · {esperado['manual']})")
            if agora["vinculo"] == "cancelled":
                p.check(agora["motivo_vinculo"] == "vinculou_profissional", f"[{S}] {rotulo}: o motivo gravado é vinculou_profissional ({agora['motivo_vinculo']})")
    finally:
        limpar(S, u)
        depois = contagens(S, app)
        print(f"[{S}] depois da limpeza: {depois}", flush=True)
        p.check(depois == antes, f"[{S}] contagens antes = depois (pacientes da conta do app, assinaturas, canceladas): {antes} → {depois}")
    resumo = {"schema": S, "esperar": a.esperar, "antes": antes, "depois": depois, "itens": [(ok, t) for ok, t in p.itens]}
    destino = Path.home() / "projetos" / "physiqcalc-scratch" / "w19" / f"app_encerrado_{S}_{a.esperar}.json"
    destino.write_text(json.dumps(resumo, ensure_ascii=False, indent=1), encoding="utf-8")
    return p.fim()


if __name__ == "__main__":
    sys.exit(main())
