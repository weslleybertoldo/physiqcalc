#!/usr/bin/env python3
"""Physiq W15 — funções do Treino do editor (admin-semana-treinos, admin-get-workout-plan, admin-relatorio), no staging.

Como o Lucas (dono + personal, responsável do Rafael): o get com os campos novos (e os antigos, para o APK ≤ 3.17), a semana
atual ("N de M"), a prescrição por exercício (NF1) e a observação (NF2) gravadas nas colunas que o app lê, a data da troca
(NF7), o legado (aplicar a todos / padrão N) preservando a prescrição, a lista do treino (adicionar, tirar, ordenar) — direto
no treino só do Rafael e como CÓPIA só dele no compartilhado —, Modelos, novo treino e tirar treino, o PDF e o relatório com os
campos novos. Negativos: o Bruno (2º personal, não é o responsável) não vê nem muda; valores inválidos são recusados.

Uso: python3 e2e/w15/api.py [--base http://localhost:8000] (padrão: as funções publicadas, https://api.physiqcalc.com.br)
A massa (e2e/w15/massa.py) volta ao começo no fim.
"""
from __future__ import annotations

import argparse
import subprocess
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import _base as B  # noqa: E402

S = "staging"
B.ESTADO["schema"] = S
p = B.p
BASE = B.API_T


def chamar(conta: str, acao: str, aluno: str, funcao: str = "admin-semana-treinos", **extra) -> tuple[int, dict]:
    return B.funcao_treino(conta, funcao, {"action": acao, "userId": aluno, **extra}, base=BASE)


def grupos_do(aluno: str) -> set[str]:
    return {r["g"] for r in B.sql_treino(f"select grupo_id::text as g from {S}.tb_grupos_treino_perfis where user_id = '{aluno}'")}


def main() -> int:
    global BASE
    ap = argparse.ArgumentParser()
    ap.add_argument("--base", default=B.API_T)
    ap.add_argument("--so-semana", action="store_true", help="só a admin-semana-treinos (Deno local na porta 8000)")
    args = ap.parse_args()
    BASE = args.base
    B.saude_ok("a API da W15")
    m = B.ler_json(B.SCRATCH / "massa_staging.json")
    assert m, "rode antes: python3 e2e/w15/massa.py"
    rafael, lucas, A, Bg, C = m["rafael"], m["lucas"], m["A"], m["B"], m["C"]
    sup, inc = B.exercicio_id("Supino Reto com Barra"), B.exercicio_id("Supino Inclinado com Barra")

    # ── get: campos novos + os antigos (APK ≤ 3.17) ──
    st, r = chamar("w13-dono", "get", rafael)
    p.check(st == 200, f"get 200 ({st} {str(r)[:120]})")
    p.check(all(k in r for k in ("semana", "gruposDisponiveis", "diasConfig", "seriesPadrao", "exerciciosPorTreino", "config")),
            "get mantém as chaves de antes (semana, gruposDisponiveis, diasConfig, seriesPadrao, exerciciosPorTreino, config)")
    gs = {g["id"]: g for g in r.get("gruposDisponiveis", [])}
    p.check(set(gs) == {A, Bg, C}, f"os 3 treinos do Rafael ({len(gs)})")
    p.check(gs.get(A, {}).get("lista_direta") is True and gs[A].get("alunos") == 1, "A (do Lucas, só do Rafael): muda a lista direto")
    p.check(gs.get(Bg, {}).get("lista_direta") is False and gs[Bg].get("alunos") == 2, "B (compartilhado com 2): vira cópia")
    p.check(gs.get(C, {}).get("lista_direta") is False and gs[C].get("professor_id") is None, "C (global): vira cópia")
    exa = r.get("exerciciosPorTreino", {}).get(f"catalogo:{A}", [])
    p.check(len(exa) == 5 and all(e.get("imagem_url") and e.get("grupo_muscular") for e in exa), "exercícios do A com GIF e grupo (5)")
    p.check(r.get("config", {}).get("tempo_descanso_segundos") == 60 and "proxima_troca_treino" in r.get("config", {}), "config com descanso e troca (NF7)")
    p.check(r.get("podeEditar") is True, "o Lucas pode editar")

    # ── semana atual ("N de M") ──
    hoje = B.B5.hoje()
    import datetime as dt
    seg = hoje - dt.timedelta(days=hoje.weekday())
    st, r = chamar("w13-dono", "semanaAtual", rafael, inicio=str(seg), fim=str(seg + dt.timedelta(days=6)))
    p.check(st == 200 and len(r.get("concluidos", [])) == len(m["feitos"]), f"semanaAtual: {len(m['feitos'])} treinos feitos ({st} {r})")
    st, r = chamar("w13-dono", "semanaAtual", rafael, inicio=str(seg), fim=str(seg + dt.timedelta(days=30)))
    p.check(st == 400, "semanaAtual recusa período de mais de 2 semanas")

    # ── prescrição (NF1) nas colunas que o app lê ──
    st, r = chamar("w13-dono", "setPrescricao", rafael, grupo_id=A, exercicio_id=sup, num_series=4, reps_alvo="10", descanso_segundos=60, carga_sugerida_kg=60)
    p.check(st == 200 and r.get("ok"), f"setPrescricao supino 4 × 10 · 60 s · 60 kg ({st} {str(r)[:100]})")
    linha = [x for x in B.linhas_prescricao(rafael) if x["grupo_id"] == A and x["exercicio_id"] == sup]
    p.check(len(linha) == 1 and linha[0]["num_series"] == 4 and linha[0]["reps_alvo"] == "10" and linha[0]["descanso_segundos"] == 60
            and linha[0]["carga"] == 60.0, f"linha do supino no banco ({linha})")
    st, r = chamar("w13-dono", "setPrescricao", rafael, grupo_id=A, exercicio_id=inc, num_series=4, reps_alvo="8 - 12", descanso_segundos=None, carga_sugerida_kg="22,5")
    linha = [x for x in B.linhas_prescricao(rafael) if x["grupo_id"] == A and x["exercicio_id"] == inc]
    p.check(st == 200 and linha and linha[0]["reps_alvo"] == "8-12" and linha[0]["carga"] == 22.5 and linha[0]["descanso_segundos"] is None,
            f"faixa '8 - 12' vira '8-12', carga '22,5' vira 22.5, descanso vazio = o padrão ({linha})")
    for campo, valor, erro in (("reps_alvo", "abc", "reps_invalidas"), ("reps_alvo", "12-8", "reps_invalidas"), ("num_series", 11, "num_series_invalido"),
                               ("descanso_segundos", 1000, "descanso_invalido"), ("carga_sugerida_kg", -1, "carga_invalida")):
        corpo = {"grupo_id": A, "exercicio_id": sup, "num_series": 4, "reps_alvo": "10", "descanso_segundos": 60, "carga_sugerida_kg": 60, campo: valor}
        st, r = chamar("w13-dono", "setPrescricao", rafael, **corpo)
        p.check(st == 400 and r.get("error") == erro, f"recusa {campo}={valor!r} ({st} {r.get('error')})")
    st, r = chamar("w13-dono", "setPrescricao", rafael, grupo_id=A, exercicio_id=B.exercicio_id("Leg Press 45°"), num_series=3)
    p.check(st == 400 and r.get("error") == "exercicio_fora_do_treino", "recusa exercício que não está no treino")

    # ── observação (NF2) na linha geral ──
    st, r = chamar("w13-dono", "setObservacao", rafael, grupo_id=A, observacao=B.OBSERVACAO)
    geral = [x for x in B.linhas_prescricao(rafael) if x["grupo_id"] == A and not x["exercicio_id"]]
    p.check(st == 200 and len(geral) == 1 and geral[0]["observacao"] == B.OBSERVACAO and geral[0]["num_series"] == 3,
            f"observação na linha geral, com o nº padrão do aluno (3) ({geral})")

    # ── config: troca do treino (NF7), descanso, cadeado ──
    st, r = chamar("w13-dono", "setConfig", rafael, proxima_troca_treino="2026-10-19")
    p.check(st == 200 and r.get("config", {}).get("proxima_troca_treino") == "2026-10-19", f"setConfig troca do treino ({st} {r})")
    st, r = chamar("w13-dono", "setConfig", rafael, proxima_troca_treino="2026-02-30")
    p.check(st == 400, "recusa data impossível")
    st, r = chamar("w13-dono", "setConfig", rafael, tempo_descanso_segundos=5)
    p.check(st == 400, "recusa descanso padrão de 5 s")

    # ── legado: "aplicar a todos" e "padrão N" preservam a prescrição ──
    st, r = chamar("w13-dono", "aplicarSeriesTreino", rafael, grupo_id=A, num_series=5)
    ls = [x for x in B.linhas_prescricao(rafael) if x["grupo_id"] == A]
    sup_l = [x for x in ls if x["exercicio_id"] == sup]
    p.check(st == 200 and sup_l and sup_l[0]["num_series"] == 5 and sup_l[0]["carga"] == 60.0 and any(x["observacao"] for x in ls),
            f"aplicarSeriesTreino (APK antigo): prescrição e observação ficam, com 5 séries ({ls})")
    st, r = chamar("w13-dono", "limparSeriesAluno", rafael)
    ls = B.linhas_prescricao(rafael)
    p.check(st == 200 and ls and all(x["num_series"] == 3 for x in ls) and any(x["reps_alvo"] == "10" for x in ls),
            f"limparSeriesAluno (Padrão N): a prescrição fica, com o nº do aluno ({ls})")
    chamar("w13-dono", "setPrescricao", rafael, grupo_id=A, exercicio_id=sup, num_series=4, reps_alvo="10", descanso_segundos=60, carga_sugerida_kg=60)

    # ── a lista do treino: direto no A (só do Rafael) ──
    antes_a = [x["exercicio_id"] for x in B.sql_treino(f"select exercicio_id::text from {S}.tb_grupos_exercicios where grupo_id = '{A}' order by ordem")]
    rosca = B.exercicio_id("Rosca Direta com Barra")
    st, r = chamar("w13-dono", "adicionarExercicio", rafael, grupo_id=A, exercicio_id=rosca)
    p.check(st == 200 and r.get("grupo_id") == A and r.get("personalizado") is False, f"adicionar no A: direto ({st} {r})")
    st, r = chamar("w13-dono", "adicionarExercicio", rafael, grupo_id=A, exercicio_id=rosca)
    p.check(st == 400 and r.get("error") == "ja_no_treino", "recusa exercício repetido")
    nova = [rosca] + antes_a
    st, r = chamar("w13-dono", "ordenarExercicios", rafael, grupo_id=A, ordem=nova)
    depois = [x["exercicio_id"] for x in B.sql_treino(f"select exercicio_id::text from {S}.tb_grupos_exercicios where grupo_id = '{A}' order by ordem")]
    p.check(st == 200 and depois == nova, "ordenar no A: a ordem nova vale")
    st, r = chamar("w13-dono", "ordenarExercicios", rafael, grupo_id=A, ordem=antes_a)
    p.check(st == 400 and r.get("error") == "ordem_invalida", "recusa ordem sem todos os exercícios")
    st, r = chamar("w13-dono", "removerExercicio", rafael, grupo_id=A, exercicio_id=rosca)
    p.check(st == 200 and r.get("personalizado") is False, "tirar do A: direto")
    chamar("w13-dono", "ordenarExercicios", rafael, grupo_id=A, ordem=antes_a)

    # ── a lista do treino compartilhado (B): vira CÓPIA só do Rafael ──
    antes_b = [x["exercicio_id"] for x in B.sql_treino(f"select exercicio_id::text from {S}.tb_grupos_exercicios where grupo_id = '{Bg}' order by ordem")]
    chamar("w13-dono", "setPrescricao", rafael, grupo_id=Bg, exercicio_id=antes_b[0], num_series=4, reps_alvo="12", descanso_segundos=90, carga_sugerida_kg=50)
    face = B.exercicio_id("Crucifixo Invertido com Halteres")
    st, r = chamar("w13-dono", "adicionarExercicio", rafael, grupo_id=Bg, exercicio_id=face)
    novo = r.get("grupo_id")
    p.check(st == 200 and r.get("personalizado") is True and novo and novo != Bg, f"adicionar no B compartilhado: cópia só do Rafael ({st} {r})")
    depois_b = [x["exercicio_id"] for x in B.sql_treino(f"select exercicio_id::text from {S}.tb_grupos_exercicios where grupo_id = '{Bg}' order by ordem")]
    p.check(depois_b == antes_b, "o B original (do Lucas também) não mudou")
    p.check(Bg in grupos_do(lucas) and Bg not in grupos_do(rafael) and novo in grupos_do(rafael), "o Rafael recebe a cópia; o Lucas segue com o original")
    sem = B.sql_treino(f"select dia_semana, grupo_id::text from {S}.tb_semana_treinos where user_id = '{rafael}' and dia_semana in ('TER','SEX')")
    p.check(all(x["grupo_id"] == novo for x in sem) and len(sem) == 2, f"a semana (Ter e Sex) aponta para a cópia ({sem})")
    pres = [x for x in B.linhas_prescricao(rafael) if x["exercicio_id"] == antes_b[0]]
    p.check(pres and pres[0]["grupo_id"] == novo and pres[0]["carga"] == 50.0, "a prescrição do B foi junto para a cópia")
    lista_nova = [x["exercicio_id"] for x in B.sql_treino(f"select exercicio_id::text from {S}.tb_grupos_exercicios where grupo_id = '{novo}' order by ordem")]
    p.check(lista_nova == antes_b + [face], "a cópia tem os exercícios do B + o novo")
    nome_novo = B.sql_treino(f"select nome, professor_id::text from {S}.tb_grupos_treino where id = '{novo}'")[0]
    p.check(nome_novo["nome"] == "Costas" and nome_novo["professor_id"] == lucas, f"a cópia tem o mesmo nome e é do professor do aluno ({nome_novo})")

    # ── Modelos, novo treino e tirar treino ──
    st, r = chamar("w13-dono", "modelos", rafael)
    mods = {x["id"]: x for x in r.get("modelos", [])}
    p.check(st == 200 and C in mods and mods[C]["ja_tem"] is True and mods[C]["global"] is True, f"modelos: os globais e os do Lucas ({len(mods)})")
    st, r = chamar("w13-dono", "novoTreino", rafael, nome="Treino D W15")
    gd = r.get("grupo_id")
    p.check(st == 200 and gd in grupos_do(rafael), f"novo treino (vazio, só do Rafael) ({st} {r})")
    st, r = chamar("w13-dono", "tirarTreino", rafael, grupo_id=gd)
    p.check(st == 200 and gd not in grupos_do(rafael), "tirar o treino do aluno")
    st, r = chamar("w13-dono", "usarTreino", rafael, grupo_id=gd)
    p.check(st == 200 and gd in grupos_do(rafael), "usar um modelo (volta a receber)")
    chamar("w13-dono", "tirarTreino", rafael, grupo_id=gd)
    st, r = chamar("w13-dono", "novoTreino", rafael, nome="   ")
    p.check(st == 400, "recusa treino sem nome")

    # ── PDF do treino e relatório: campos novos ──
    if args.so_semana:
        subprocess.run([sys.executable, str(Path(__file__).parent / "massa.py")], check=False, capture_output=True)
        return p.fim()
    st, r = chamar("w13-dono", "x", rafael, funcao="admin-get-workout-plan")
    dias = r.get("dias", [])
    seg_a = next((d for d in dias if d.get("grupo_id") == A), None)
    ex_sup = next((e for e in (seg_a or {}).get("exercicios", []) if "Supino Reto" in e["nome"]), None)
    p.check(st == 200 and ex_sup and ex_sup.get("num_series") == 4 and ex_sup.get("reps_alvo") == "10" and ex_sup.get("carga_sugerida_kg") == 60
            and seg_a.get("observacao") == B.OBSERVACAO and r.get("profile", {}).get("proxima_troca_treino") == "2026-10-19",
            f"admin-get-workout-plan: 4 × 10 · 60 kg, observação e troca ({st} {str(ex_sup)[:120]})")
    st, r = chamar("w13-dono", "relatorio", rafael, funcao="admin-relatorio", ano=hoje.year, mes=hoje.month)
    p.check(st == 200 and isinstance(r.get("prescricao"), list) and len(r["prescricao"]) >= 3 and r.get("config", {}).get("tempo_descanso_segundos") == 60,
            f"admin-relatorio: prescrição e config ({st} {len(r.get('prescricao') or [])})")
    st, r = chamar("w13-dono", "historicoMes", rafael, funcao="admin-relatorio", ano=hoje.year, mes=hoje.month)
    itens = r.get("itens", [])
    p.check(st == 200 and itens and all(i.get("userId") == rafael for i in itens), f"historicoMes com userId: só o Rafael ({len(itens)})")

    # ── negativos: o Bruno (2º personal, não é o responsável do Rafael) ──
    for acao, extra in (("get", {}), ("setPrescricao", {"grupo_id": A, "exercicio_id": sup, "num_series": 2})):
        st, r = chamar("w13-personal2", acao, rafael, **extra)
        p.check(st == 403, f"Bruno {acao} no Rafael → 403 ({st})")
    st, r = chamar("w13-personal2", "relatorio", rafael, funcao="admin-relatorio", ano=hoje.year, mes=hoje.month)
    p.check(st == 403, f"Bruno relatório do Rafael → 403 ({st})")
    st, r = B.funcao_treino("w13-dono", "admin-semana-treinos", {"action": "resolverAluno", "principalUserId": B.uid("w13-aluno")}, base=BASE)
    p.check(st == 200 and r.get("treino_user_id") == rafael, f"resolverAluno (matrícula sem treino_user_id) → o Treino do Rafael ({st} {r})")
    st, r = B.funcao_treino("w13-personal2", "admin-semana-treinos", {"action": "resolverAluno", "principalUserId": B.uid("w13-aluno")}, base=BASE)
    p.check(st == 403, f"resolverAluno pelo Bruno → 403 ({st})")
    st, r, _ = B.http("POST", f"{BASE}/functions/v1/admin-semana-treinos", {"action": "get", "userId": rafael},
                      {"apikey": B.anon(B.TREINO_REF), "x-schema": S, "Origin": "https://physiqcalc-staging.vercel.app"})
    p.check(st == 401, f"sem login → 401 ({st})")

    subprocess.run([sys.executable, str(Path(__file__).parent / "massa.py")], check=False, capture_output=True)
    return p.fim()


if __name__ == "__main__":
    raise SystemExit(main())
