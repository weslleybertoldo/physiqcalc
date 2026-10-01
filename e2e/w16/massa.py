#!/usr/bin/env python3
"""Physiq W16 — massa de TESTE no staging do banco principal (idempotente; só a "Consultoria Ferreira W13" das contas w13.*).

  (sem opção)  o plano alimentar da tela 8 do Rafael Moura, feito pela Camila (nutricionista responsável): 5 refeições
               (07:00 café · 10:00 lanche · 13:00 almoço · 16:00 lanche · 19:00 jantar, ~2.450 kcal), alimentos da TACO e 2 trocas
               por alimento do almoço; os ✓ das refeições dos últimos 7 dias — os de ontem e de hoje marcados PELO ALUNO (a
               função paciente_marcar_refeicao do app), os de antes direto no banco — para o card Dieta (adesão) e o acompanhamento
  --limpar     apaga o que a W16 criou no staging (o plano, refeições, itens, ✓ e os avisos "plano atualizado" do Rafael)

Uso: python3 e2e/w16/massa.py [--limpar]
"""
from __future__ import annotations

import argparse
import datetime as dt
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import _base as B  # noqa: E402

S = "staging"
B.ESTADO["schema"] = S
# ✓ por dia (dos 5) nos 5 dias antes de ontem — ontem e hoje são marcados pelo aluno no app
MARCAS_ANTES = [5, 4, 4, 5, 4]
MARCA_ONTEM, MARCA_HOJE = 3, 2


def q(sql: str) -> list:
    return B.sql_principal(sql)


def hoje() -> dt.date:
    return B.B5.hoje()


def plano_existente(pid: str) -> str | None:
    r = q(f"select id::text from {S}.planos_alimentares where paciente_id = '{pid}' and titulo = $t${B.TITULO_PLANO}$t$ order by created_at limit 1")
    return r[0]["id"] if r else None


def montar() -> dict:
    conta = B.conta_w13()
    raf = B.rafael(conta)
    camila = B.uid("w13-nutri")
    assert camila and raf["nutricionista_id"] == camila, ("a Camila tem que ser a nutricionista responsável do Rafael", raf)
    pid = raf["id"]
    plano = plano_existente(pid)
    if plano:
        q(f"update {S}.planos_alimentares set deleted_at = null, nutricionista_id = '{camila}', kcal_alvo = 2450, favorito = false, "
          f"observacao = $o$Beber 2,5 L de água por dia. Pode trocar os alimentos pelos substitutos de cada um.$o$ where id = '{plano}'")
        q(f"delete from {S}.refeicoes where plano_id = '{plano}'")
    else:
        plano = q(f"""insert into {S}.planos_alimentares (nutricionista_id, paciente_id, titulo, metodo, kcal_alvo, observacao)
                      values ('{camila}', '{pid}', $t${B.TITULO_PLANO}$t$, 'alimentos', 2450,
                              $o$Beber 2,5 L de água por dia. Pode trocar os alimentos pelos substitutos de cada um.$o$) returning id::text""")[0]["id"]
    refeicoes: list[dict] = []
    total = 0.0
    for ordem, (hora, nome, itens) in enumerate(B.REFEICOES):
        rid = q(f"insert into {S}.refeicoes (plano_id, nome, horario, ordem, dias_semana) values ('{plano}', $n${nome}$n$, '{hora}', {ordem}, '{{}}') returning id::text")[0]["id"]
        kcal = 0.0
        for i, (alim, g) in enumerate(itens):
            a = B.alimento(alim)
            subs = []
            for s in B.SUBSTITUTOS.get(alim, []):
                b = B.alimento(s)
                eq = round((a["kcal"] * g / 100) / b["kcal"] * 100, 2) if b["kcal"] else 100
                subs.append({"alimento_id": b["id"], "nome": b["nome"], "quantidade_g": eq})
            q(f"""insert into {S}.itens_refeicao (refeicao_id, alimento_id, quantidade_g, ordem, substitutos)
                  values ('{rid}', '{a['id']}', {g}, {i}, $j${json.dumps(subs, ensure_ascii=False)}$j$::jsonb)""")
            kcal += a["kcal"] * g / 100
        refeicoes.append({"id": rid, "nome": nome, "kcal": round(kcal)})
        total += kcal
    # ✓: os 5 dias antes de ontem direto no banco; ontem e hoje pelo aluno (a mesma função do app)
    d0 = hoje()
    q(f"delete from {S}.refeicoes_concluidas where paciente_id = '{pid}' and data >= '{d0 - dt.timedelta(days=7)}'")
    for k, n in enumerate(MARCAS_ANTES):
        dia = d0 - dt.timedelta(days=6 - k)
        for r in refeicoes[:n]:
            q(f"insert into {S}.refeicoes_concluidas (nutricionista_id, paciente_id, refeicao_id, data) values ('{camila}', '{pid}', '{r['id']}', '{dia}') on conflict do nothing")
    tok = B.token("w13-aluno")
    for dia, n in ((d0 - dt.timedelta(days=1), MARCA_ONTEM), (d0, MARCA_HOJE)):
        for r in refeicoes[:n]:
            st, res = B.rpc(tok, "paciente_marcar_refeicao", {"p_refeicao_id": r["id"], "p_data": str(dia), "p_concluida": True})
            assert st == 200 and res is True, ("o aluno não marcou", dia, r["nome"], st, res)
    feitas = sum(MARCAS_ANTES) + MARCA_ONTEM + MARCA_HOJE
    estado = {"conta": conta, "paciente": pid, "rota": pid, "plano": plano, "refeicoes": refeicoes, "kcal_dia": round(total),
              "adesao": {"feitas": feitas, "total": 7 * len(refeicoes), "pct": round(feitas / (7 * len(refeicoes)) * 100)},
              "hoje": str(d0), "ontem": str(d0 - dt.timedelta(days=1))}
    B.json_arquivo(B.SCRATCH / "massa_staging.json", estado)
    print(json.dumps(estado, ensure_ascii=False, indent=1))
    return estado


def limpar() -> None:
    conta = B.conta_w13()
    raf = B.rafael(conta)
    pid = raf["id"]
    q(f"delete from {S}.refeicoes_concluidas where paciente_id = '{pid}'")
    for r in q(f"select id::text from {S}.planos_alimentares where paciente_id = '{pid}'"):
        q(f"delete from {S}.planos_alimentares where id = '{r['id']}'")
    if raf["user_id"]:
        q(f"delete from {S}.avisos where destino_user_id = '{raf['user_id']}' and tipo = 'plano_atualizado'")
    print("massa da W16 apagada do staging (planos, refeições, itens, ✓ e avisos do Rafael)")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--limpar", action="store_true")
    a = ap.parse_args()
    limpar() if a.limpar else montar()
