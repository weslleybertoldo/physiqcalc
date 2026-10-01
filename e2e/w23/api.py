#!/usr/bin/env python3
"""Physiq W23 — E2E de API no staging: as ações novas da admin-semana-treinos e as regras de acesso das tabelas dos modelos.

Positivo (Lucas, dono + personal do Rafael): quemRecebe (os alunos DELE que recebem cada modelo); usarTreino leva a prescrição DO
MODELO para quem passa a receber (só onde o aluno não tem a dele); aplicarModelo preenche só o vazio (a prescrição própria do
Rafael — Supino Reto 5 × 6 — fica) e repetir não muda nada; a prescrição do modelo grava nas colunas novas (RLS do dono) e o
limite do banco recusa valor inválido. Negativo: o Bruno (2º personal da conta, não é o professor do Rafael) não aplica nem dá
treino ao Rafael, não vê o Rafael no quemRecebe e não muda o modelo do Lucas (RLS); sem login → 401; modelo que o aluno não
recebe → recusado. No fim a massa volta ao começo.

Uso: python3 e2e/w23/api.py
"""
from __future__ import annotations

import subprocess
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import _base as B  # noqa: E402

S = "staging"
B.ESTADO["schema"] = S
p = B.p


def rest(conta: str, metodo: str, caminho: str, corpo=None, prefer: str = "return=representation") -> tuple[int, object]:
    tok = B.token_treino(conta)
    st, r, _ = B.http(metodo, f"{B.API_T}/rest/v1/{caminho}", corpo, {
        "apikey": B.anon(B.TREINO_REF), "Authorization": f"Bearer {tok}", "Content-Profile": S, "Accept-Profile": S, "Prefer": prefer,
    })
    return st, r


def main() -> int:
    B.saude_ok("a massa")
    r = subprocess.run([sys.executable, str(Path(__file__).parent / "massa.py")], capture_output=True, text=True)
    print(r.stdout[-300:], r.stderr[-300:])
    m = B.ler_json(B.SCRATCH / "massa_staging.json")
    rafael, A, Bg, C = m["rafael"], m["A"], m["B"], m["C"]
    sup, rosca = B.exercicio_id("Supino Reto com Barra"), B.exercicio_id("Rosca Martelo com Halteres")

    B.saude_ok("quemRecebe")
    st, r = B.semana("w13-dono", "quemRecebe", grupos=[A, Bg, C])
    perfis = {(x["grupo_id"], x["user_id"]) for x in (r.get("perfis") or [])}
    p.check(st == 200 and perfis == {(A, rafael)}, f"A1 quemRecebe (Lucas): só o Rafael no A → {st} {perfis}")
    st, r = B.semana("w13-dono", "quemRecebe", grupos=[])
    p.check(st == 200 and r.get("perfis") == [], f"A2 quemRecebe sem modelos → vazio ({st})")

    B.saude_ok("prescrição do modelo")
    # a prescrição do modelo grava nas colunas novas (RLS: o dono do modelo)
    st, r = rest("w13-dono", "PATCH", f"tb_grupos_exercicios?grupo_id=eq.{Bg}&exercicio_id=eq.{rosca}",
                 {"num_series": 3, "reps_alvo": "8-12", "descanso_segundos": 90, "carga_sugerida_kg": 12})
    p.check(st == 200 and isinstance(r, list) and len(r) == 1, f"A3 Lucas grava a prescrição do modelo B (RLS do dono) → {st}")
    st, r = rest("w13-dono", "PATCH", f"tb_grupos_exercicios?grupo_id=eq.{Bg}&exercicio_id=eq.{rosca}", {"reps_alvo": "dez"})
    p.check(st == 400 and "prescricao_ck" in str(r), f"A4 limite do banco: repetição 'dez' recusada → {st}")
    st, r = rest("w13-dono", "PATCH", f"tb_grupos_exercicios?grupo_id=eq.{Bg}&exercicio_id=eq.{rosca}", {"num_series": 11})
    p.check(st == 400, f"A5 limite do banco: 11 séries recusadas → {st}")

    # usarTreino: quem passa a receber leva a prescrição do modelo
    st, r = B.semana("w13-dono", "usarTreino", rafael, grupo_id=Bg)
    p.check(st == 200 and r.get("prescricao_do_modelo") == 1 and B.recebe(Bg, rafael), f"A6 usarTreino B → Rafael recebe e leva 1 prescrição do modelo → {st} {r}")
    pr = B.prescricao_aluno(rafael, Bg).get("Rosca Martelo com Halteres") or {}
    p.check((pr.get("num_series"), pr.get("reps_alvo"), pr.get("descanso_segundos"), pr.get("carga")) == (3, "8-12", 90, 12.0),
            f"A7 a prescrição do Rafael no B = a do modelo (3 × 8-12 · 90 s · 12 kg) → {pr}")
    st, r = B.semana("w13-dono", "usarTreino", rafael, grupo_id=Bg)
    p.check(st == 200 and r.get("prescricao_do_modelo") == 0, f"A8 usarTreino de novo (já recebe) não mexe → {r.get('prescricao_do_modelo')}")
    st, r = B.semana("w13-dono", "quemRecebe", grupos=[A, Bg, C])
    perfis = {(x["grupo_id"], x["user_id"]) for x in (r.get("perfis") or [])}
    p.check(perfis == {(A, rafael), (Bg, rafael)}, f"A9 quemRecebe agora mostra o Rafael no A e no B → {perfis}")
    st, r = B.semana("w13-dono", "tirarTreino", rafael, grupo_id=Bg)
    p.check(st == 200 and not B.recebe(Bg, rafael), f"A10 tirarTreino B → Rafael não recebe mais ({st})")

    B.saude_ok("aplicarModelo")
    antes = B.prescricao_aluno(rafael, A)
    p.check(set(antes) == {"Supino Reto com Barra"} and antes["Supino Reto com Barra"]["reps_alvo"] == "6", f"A11 antes: o Rafael só tem a dele no Supino Reto (5 × 6) → {antes}")
    st, r = B.semana("w13-dono", "aplicarModelo", rafael, grupo_id=A)
    p.check(st == 200 and r.get("preenchidos") == 5, f"A12 aplicarModelo A → 5 exercícios preenchidos (4 novos + o vazio do Supino) → {st} {r}")
    depois = B.prescricao_aluno(rafael, A)
    s = depois.get("Supino Reto com Barra") or {}
    p.check((s.get("num_series"), s.get("reps_alvo"), s.get("descanso_segundos"), s.get("carga")) == (5, "6", 60, 60.0),
            f"A13 o que era do Rafael FICA (5 × 6) e só o vazio entra (60 s · 60 kg) → {s}")
    tri = depois.get("Tríceps Pulley") or {}
    p.check((tri.get("num_series"), tri.get("reps_alvo"), tri.get("descanso_segundos"), tri.get("carga")) == (4, "12", 60, 25.0),
            f"A14 o exercício sem prescrição do Rafael ganha a do modelo (4 × 12 · 60 s · 25 kg) → {tri}")
    st, r = B.semana("w13-dono", "aplicarModelo", rafael, grupo_id=A)
    p.check(st == 200 and r.get("preenchidos") == 0, f"A15 aplicar de novo não muda nada (idempotente) → {r}")
    st, r = B.semana("w13-dono", "aplicarModelo", rafael, grupo_id=C)
    p.check(st == 400 and r.get("error") == "grupo_nao_disponivel", f"A16 modelo que o aluno não recebe → recusado ({st} {r.get('error')})")

    B.saude_ok("negativos")
    B.pausa(2)
    st, r = B.semana("w13-personal2", "aplicarModelo", rafael, grupo_id=A)
    p.check(st == 403, f"N1 Bruno (2º personal, não é o professor do Rafael) não aplica no Rafael → {st} {r.get('error')}")
    st, r = B.semana("w13-personal2", "usarTreino", rafael, grupo_id=Bg)
    p.check(st == 403 and not B.recebe(Bg, rafael), f"N2 Bruno não dá treino ao Rafael → {st}")
    st, r = B.semana("w13-personal2", "quemRecebe", grupos=[A])
    p.check(st == 200 and not any(x["user_id"] == rafael for x in (r.get("perfis") or [])), f"N3 quemRecebe do Bruno não mostra o Rafael → {r}")
    st, r = rest("w13-personal2", "PATCH", f"tb_grupos_exercicios?grupo_id=eq.{A}&exercicio_id=eq.{sup}", {"reps_alvo": "1"})
    linha = [x for x in B.linhas_modelo(A) if x["nome"] == "Supino Reto com Barra"][0]
    p.check(st in (200, 204) and (r == [] or r is None) and linha["reps_alvo"] == "10", f"N4 Bruno não muda o modelo do Lucas (RLS: 0 linhas) → {st} {r} · reps no banco {linha['reps_alvo']}")
    st, r = rest("w13-personal2", "POST", "tb_grupos_exercicios", {"grupo_id": A, "exercicio_id": rosca, "ordem": 9})
    p.check(st in (401, 403) or (st >= 400), f"N5 Bruno não põe exercício no modelo do Lucas (RLS) → {st}")
    st, r, _ = B.http("POST", f"{B.API_T}/functions/v1/admin-semana-treinos", {"action": "quemRecebe", "grupos": [A]}, {"x-schema": S})
    p.check(st == 401, f"N6 sem login → 401 ({st})")

    # a massa volta ao começo
    subprocess.run([sys.executable, str(Path(__file__).parent / "massa.py")], capture_output=True)
    return p.fim()


if __name__ == "__main__":
    raise SystemExit(main())
