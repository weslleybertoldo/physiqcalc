#!/usr/bin/env python3
"""Physiq hml-24 (H-127) — a CORRIDA da prescrição no STAGING: N gravações da MESMA linha nova ao mesmo tempo pela função
admin-semana-treinos (a ação setPrescricao, como o editor do Treino manda), contas de TESTE (a massa da W15: o w13-dono grava a
prescrição do w13-aluno no treino A; o molde é o e2e/w15/_base.py).

Cada rodada: apaga por SQL a linha de 1 exercício do treino A (SÓ a linha do w13-aluno, SÓ no staging) → N pedidos com corpos
DIFERENTES soltos juntos (barreira de threads; 1 troca de token do w13-dono na rodada toda) → confere os status, 1 linha só e a
linha = um dos corpos inteiro (nunca mistura). No fim, pelo log da Management API (só leitura): os 23505 do índice
tb_series_padrao_staging_alvo_uidx e os 500 da função na borda desde o começo da corrida (contagens). A linha do exercício volta ao
que era antes da corrida (guardada no começo; o --limpar refaz se a corrida for cortada).

  (padrão)   o VERDE (a função com a RPC prescricao_salvar): todo pedido 200, 1 linha por rodada, 0 23505 e 0 500 no log
  --antes    o VERMELHO (a função de antes, "lê e depois insere"): espera ≥ 1 resposta 500 e ≥ 1 23505 no índice
  --n N      pedidos juntos por rodada (padrão 3; teto 5 — o banco do Treino é frágil, H-80)
  --rodadas K  rodadas (padrão 3; teto 10)
  --seco     sem rede (o socket fica bloqueado): as conferências puras (os corpos, a mistura, os status, o SQL só do aluno de teste no
             staging, a barreira) — nada vai ao banco nem à função
  --limpar   só devolve a linha do exercício ao que era antes da corrida (o estado guardado) e sai

Precisa: a massa da W15 no staging (python3 e2e/w15/massa.py), ~/.pc-pat, ~/.pgpass e as senhas das contas de teste. Nunca imprime
id, e-mail, nome ou token. Uso (F5, 1 por vez, com o saude.py antes):
  python3 e2e/hml24/corrida.py --antes --n 3 --rodadas 3      (com a v50 publicada: o vermelho)
  python3 e2e/hml24/corrida.py --n 3 --rodadas 5              (depois da v51: o verde)
  python3 e2e/hml24/corrida.py --seco
"""
from __future__ import annotations

import argparse
import datetime as dt
import importlib.util
import json
import re
import socket
import sys
import threading
import time
from pathlib import Path

sys.dont_write_bytecode = True
AQUI = Path(__file__).resolve().parent
sys.path.insert(0, str(AQUI.parent / "w15"))
import _base as B  # noqa: E402

_ESPEC = importlib.util.spec_from_file_location("_logs_supabase_hml10", AQUI.parent / "hml10" / "_logs_supabase.py")
LOGS = importlib.util.module_from_spec(_ESPEC)
_ESPEC.loader.exec_module(LOGS)  # type: ignore[union-attr]

S = "staging"
B.ESTADO["schema"] = S
p = B.p
INDICE = f"tb_series_padrao_{S}_alvo_uidx"
FUNCAO = "admin-semana-treinos"
EXERCICIO = "Crucifixo com Halteres"  # 1 dos 5 do treino A da tela 8 (e2e/w15/_base.py TREINO_A)
ESTADO = Path.home() / "projetos" / "physiqcalc-scratch" / "hml24" / "corrida_staging.json"
CHAVES_RESPOSTA = {"grupo_id", "grupo_usuario_id", "exercicio_id", "exercicio_usuario_id", "num_series", "reps_alvo", "descanso_segundos",
                   "carga_sugerida_kg", "updated_at"}
TETO_N, TETO_RODADAS = 5, 10


# ───────────────────────── peças puras (o --seco confere) ─────────────────────────
def corpos(n: int) -> list[dict]:
    """N prescrições DIFERENTES em todos os 4 campos (uma linha misturada não bate com nenhuma), todas válidas para a função:
    séries 1–10, repetições "a-b" com b > a, descanso 5–900 s, carga 0,25–999,75 kg com até 2 casas."""
    return [{"num_series": 2 + i, "reps_alvo": f"{6 + i}-{12 + i}", "descanso_segundos": 40 + 10 * i, "carga_sugerida_kg": 10 + 2.5 * i}
            for i in range(n)]


def da_linha(linha: dict) -> tuple:
    return (linha.get("num_series"), linha.get("reps_alvo"), linha.get("descanso_segundos"),
            None if linha.get("carga") is None else float(linha["carga"]))


def bate(linhas: list[dict], enviados: list[dict]) -> bool:
    """1 linha só e ela = um dos corpos INTEIRO (os 4 campos do mesmo pedido)."""
    alvo = {(c["num_series"], c["reps_alvo"], c["descanso_segundos"], float(c["carga_sugerida_kg"])) for c in enviados}
    return len(linhas) == 1 and da_linha(linhas[0]) in alvo


def avaliar(statuses: list[int], antes: bool) -> tuple[bool, str]:
    """O verde: todo pedido 200. O vermelho (--antes): ≥ 1 resposta 500 (a chave duplicada) e nenhum outro erro."""
    contagem = {s: statuses.count(s) for s in sorted(set(statuses))}
    if antes:
        return (statuses.count(500) >= 1 and all(s in (200, 500) for s in statuses), f"status {contagem}")
    return (bool(statuses) and all(s == 200 for s in statuses), f"status {contagem}")


def sql_apagar(aluno: str, grupo: str, exercicio: str, schema: str = S) -> str:
    """A linha do exercício do treino A do aluno de TESTE — só ela, só no staging (a corrida nunca apaga outra coisa)."""
    assert schema == "staging", "a corrida só mexe no staging"
    for v in (aluno, grupo, exercicio):
        assert re.fullmatch(r"[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}", v or ""), "id fora do formato"
    return (f"delete from staging.tb_series_padrao_usuario where user_id = '{aluno}' and grupo_id = '{grupo}' "
            f"and grupo_usuario_id is null and exercicio_id = '{exercicio}' and exercicio_usuario_id is null")


def soltar_juntos(n: int, chamar) -> tuple[list, float]:
    """N threads esperando numa barreira e soltas juntas; devolve os resultados (na ordem) e o espalhamento da saída, em ms."""
    barreira = threading.Barrier(n)
    saidas: list = [None] * n
    largadas: list[float] = [0.0] * n

    def trab(i: int) -> None:
        barreira.wait(30)
        largadas[i] = time.perf_counter()
        try:
            saidas[i] = chamar(i)
        except Exception as e:  # noqa: BLE001 — a rede do teste: vira um status 0
            saidas[i] = (0, {"erro": type(e).__name__})

    ths = [threading.Thread(target=trab, args=(i,)) for i in range(n)]
    for t in ths:
        t.start()
    for t in ths:
        t.join(120)
    return saidas, (max(largadas) - min(largadas)) * 1000


def sql_log_23505(indice: str = INDICE) -> str:
    return ("SELECT count() AS n FROM logs WHERE source = 'postgres_logs' AND log_attributes['parsed.sql_state_code'] = '23505' "
            f"AND extract(event_message, 'constraint \"([A-Za-z0-9_]+)\"') = '{indice}'")


def sql_log_500(funcao: str = FUNCAO) -> str:
    return ("SELECT count() AS n FROM logs WHERE source = 'function_edge_logs' "
            f"AND extract(event_message, 'functions/v1/([a-z0-9-]+)') = '{funcao}' AND log_attributes['response.status_code'] = '500'")


# ───────────────────────── o staging ─────────────────────────
def ids() -> dict:
    m = B.ler_json(B.SCRATCH / "massa_staging.json")
    assert m.get("A") and m.get("rafael"), "rode antes o e2e/w15/massa.py (a massa da W15 no staging)"
    aluno = B.treino_id("w13-aluno")
    assert aluno == m["rafael"], "o aluno da massa não é o w13-aluno"
    return {"aluno": aluno, "A": m["A"], "ex": B.exercicio_id(EXERCICIO)}


def linhas(i: dict) -> list[dict]:
    return [x for x in B.linhas_prescricao(i["aluno"]) if x["grupo_id"] == i["A"] and x["exercicio_id"] == i["ex"] and not x["exercicio_usuario_id"]]


def guardar(i: dict) -> None:
    """A linha do exercício antes da corrida (para voltar no fim) — só se ainda não há um estado guardado (corrida cortada)."""
    if ESTADO.exists():
        return
    ls = linhas(i)
    B.json_arquivo(ESTADO, {"ids": i, "linha": ls[0] if ls else None})


def devolver() -> bool:
    """A linha do exercício volta ao que era antes da corrida (ou some, se não existia)."""
    e = B.ler_json(ESTADO)
    if not e:
        return False
    i, l = e["ids"], e["linha"]
    B.exec_treino(sql_apagar(i["aluno"], i["A"], i["ex"]))
    if l:
        lit = lambda v: "null" if v is None else (f"$t${v}$t$" if isinstance(v, str) else str(v))  # noqa: E731
        B.exec_treino(f"""insert into staging.tb_series_padrao_usuario (user_id, grupo_id, exercicio_id, num_series, reps_alvo, descanso_segundos,
                            carga_sugerida_kg, observacao) values ('{i['aluno']}', '{i['A']}', '{i['ex']}', {lit(l['num_series'])}, {lit(l['reps_alvo'])},
                            {lit(l['descanso_segundos'])}, {lit(l['carga'])}, {lit(l['observacao'])})""")
    ESTADO.unlink()
    return True


def contar_no_log(sql: str, ini: dt.datetime) -> int | None:
    try:
        r = LOGS.consulta(B.TREINO_REF, sql, ini, dt.datetime.now(dt.timezone.utc) + dt.timedelta(minutes=1))
        return int((r[0].get("n") if r else 0) or 0)
    except LOGS.LogsFora:
        return None


def correr(n: int, rodadas: int, antes: bool) -> int:
    B.saude_ok("a corrida (hml-24)")
    i = ids()
    guardar(i)
    ini = dt.datetime.now(dt.timezone.utc) - dt.timedelta(seconds=5)
    tok = B.token_treino("w13-dono")  # a 1 troca de token da corrida (40 min de cache)
    todos: list[int] = []
    linhas_ok = 0
    respostas_ok = True
    try:
        for k in range(rodadas):
            B.saude_ok(f"a rodada {k + 1}")
            B.exec_treino(sql_apagar(i["aluno"], i["A"], i["ex"]))
            enviados = corpos(n)

            def chamar(j: int):
                return B.funcao_treino(tok, FUNCAO, {"action": "setPrescricao", "userId": i["aluno"], "grupo_id": i["A"], "exercicio_id": i["ex"],
                                                     "exercicio_usuario_id": None, **enviados[j]})

            saidas, espalhamento = soltar_juntos(n, chamar)
            statuses = [s for s, _ in saidas]
            todos += statuses
            ok200 = [enviados[j] for j, (s, _) in enumerate(saidas) if s == 200]
            ls = linhas(i)
            certo = bate(ls, ok200 or enviados)
            linhas_ok += int(certo)
            if not antes:
                respostas_ok = respostas_ok and all(set((r or {}).get("prescricao") or {}) == CHAVES_RESPOSTA for s, r in saidas if s == 200)
            print(f"   rodada {k + 1}: {dict((x, statuses.count(x)) for x in sorted(set(statuses)))} · {len(ls)} linha(s) · bate={certo} · "
                  f"saída das threads em {espalhamento:.0f} ms", flush=True)
            time.sleep(2)
    finally:
        voltou = devolver()
        print(f"   a linha do exercício voltou ao que era antes da corrida: {voltou}", flush=True)
    ok_st, det = avaliar(todos, antes)
    p.check(ok_st, f"{'VERMELHO (a função de antes)' if antes else 'VERDE'}: {n} juntos × {rodadas} rodadas — {det}")
    p.check(linhas_ok == rodadas, f"1 linha por rodada e ela = um dos corpos inteiro (nunca mistura): {linhas_ok}/{rodadas}")
    if not antes:
        p.check(respostas_ok, "as respostas 200 trazem o 'prescricao' com as mesmas 9 chaves de antes")
    # o log demora a chegar ao endpoint: espera e lê de novo até a contagem parar de subir
    n23, n500 = None, None
    for _ in range(6):
        time.sleep(15)
        a, b = contar_no_log(sql_log_23505(), ini), contar_no_log(sql_log_500(), ini)
        if a == n23 and b == n500 and a is not None:
            break
        n23, n500 = a, b
    if antes:
        p.check(bool(n23) and bool(n500), f"o log (desde o começo da corrida): 23505 no {INDICE} = {n23} (≥ 1) · 500 da {FUNCAO} na borda = {n500} (≥ 1)")
    else:
        p.check(n23 == 0 and n500 == 0, f"o log (desde o começo da corrida): 23505 no {INDICE} = {n23} (0) · 500 da {FUNCAO} na borda = {n500} (0)")
    return p.fim()


# ───────────────────────── o --seco ─────────────────────────
def seco() -> int:
    def sem_rede(*_a, **_k):
        raise RuntimeError("--seco não usa a rede")

    socket.socket.connect = sem_rede  # type: ignore[method-assign]
    cs = corpos(TETO_N)
    campos = [{(c[k]) for c in cs} for k in ("num_series", "reps_alvo", "descanso_segundos", "carga_sugerida_kg")]
    validos = all(1 <= c["num_series"] <= 10 and 5 <= c["descanso_segundos"] <= 900 and 0.25 <= c["carga_sugerida_kg"] <= 999.75
                  and int(c["reps_alvo"].split("-")[1]) > int(c["reps_alvo"].split("-")[0]) for c in cs)
    p.check(all(len(x) == TETO_N for x in campos) and validos, f"seco: {TETO_N} corpos diferentes nos 4 campos e válidos para a função")
    linha = lambda c: {"num_series": c["num_series"], "reps_alvo": c["reps_alvo"], "descanso_segundos": c["descanso_segundos"], "carga": c["carga_sugerida_kg"]}  # noqa: E731
    mistura = {**linha(cs[0]), "reps_alvo": cs[1]["reps_alvo"]}
    p.check(bate([linha(cs[2])], cs) and not bate([mistura], cs) and not bate([linha(cs[0]), linha(cs[1])], cs) and not bate([], cs),
            "seco: a linha = um dos corpos inteiro; a mistura de 2 pedidos, 2 linhas e nenhuma linha são acusadas")
    p.check(avaliar([200, 200, 200], False)[0] and not avaliar([200, 500, 200], False)[0] and not avaliar([], False)[0]
            and avaliar([200, 500, 500], True)[0] and not avaliar([200, 200], True)[0] and not avaliar([200, 403, 500], True)[0],
            "seco: o verde quer todo 200; o vermelho quer ≥ 1 500 e nenhum outro erro")
    uid = "00000000-0000-4000-8000-0000000000aa"
    sql = sql_apagar(uid, uid, uid)
    try:
        sql_apagar(uid, uid, uid, "public")
        recusou = False
    except AssertionError:
        recusou = True
    p.check(sql.startswith("delete from staging.tb_series_padrao_usuario where user_id = ") and "exercicio_usuario_id is null" in sql and recusou,
            "seco: o SQL da corrida só apaga a linha do aluno de teste no staging (o public é recusado)")
    saidas, esp = soltar_juntos(TETO_N, lambda j: (200, {"j": j}))
    p.check([s[1]["j"] for s in saidas] == list(range(TETO_N)) and esp < 500, f"seco: a barreira solta as {TETO_N} threads juntas ({esp:.1f} ms)")
    p.check(INDICE in sql_log_23505() and "'500'" in sql_log_500() and FUNCAO in sql_log_500(), "seco: as consultas do log contam o índice da chave e o 500 da função")
    try:
        socket.create_connection(("127.0.0.1", 9), timeout=1)
        bloqueado = False
    except RuntimeError:
        bloqueado = True
    except OSError:
        bloqueado = False
    p.check(bloqueado, "seco: a rede fica bloqueada (nada foi ao banco nem à função)")
    print(json.dumps({"n_max": TETO_N, "rodadas_max": TETO_RODADAS, "exercicio": "treino A, 3º exercício"}, ensure_ascii=False))
    return p.fim()


def main() -> int:
    ap = argparse.ArgumentParser(description="Physiq hml-24 — a corrida da prescrição no staging (o H-127)")
    ap.add_argument("--antes", action="store_true", help="o vermelho: a função de antes (espera 500 e 23505)")
    ap.add_argument("--n", type=int, default=3)
    ap.add_argument("--rodadas", type=int, default=3)
    ap.add_argument("--seco", action="store_true")
    ap.add_argument("--limpar", action="store_true")
    a = ap.parse_args()
    if a.seco:
        return seco()
    if a.limpar:
        print("a linha voltou ao que era antes da corrida" if devolver() else "nada a limpar (sem estado guardado)")
        return 0
    if not (2 <= a.n <= TETO_N) or not (1 <= a.rodadas <= TETO_RODADAS):
        ap.error(f"--n de 2 a {TETO_N} e --rodadas de 1 a {TETO_RODADAS} (o banco do Treino é frágil, H-80)")
    return correr(a.n, a.rodadas, a.antes)


if __name__ == "__main__":
    sys.exit(main())
