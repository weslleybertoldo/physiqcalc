#!/usr/bin/env python3
"""Physiq hml-10 (H-24 e H-26; spec §1.1 e §5.3) — os logs das funções dos 2 projetos, SÓ LEITURA e SÓ CONTAGENS.

Por função, na janela (padrão: as últimas 24 h — o plano Free guarda 1 dia):
  linhas do console (function_logs, event_type "Log") · quantas em JSON no formato do _shared/log.ts ({"nivel":…,"funcao":…},
  JSON válido) e a % · quantas com e-mail · com JWT ("eyJ") · com chave (sb_<tipo>_, sbp_, APP_USR-) · com 11+ dígitos ·
  chamadas na borda (function_edge_logs) e quantas 5xx, por status.
As 35 funções publicadas na W (22 do principal + a erro-avisar + 12 do Treino) vêm primeiro e são conferidas (✅/❌):
100% das linhas em JSON e 0 com e-mail, JWT ou chave. 11+ dígitos e 5xx só informam (⚠️): o ref leva o id do Mercado Pago, e
"5xx novo" se compara com a janela de antes (--desde/--fim). As outras funções (as 10 do Treino que ficam etc.) aparecem só
para informação.
A contagem é feita no próprio endpoint de logs (countIf/match do ClickHouse): o conteúdo das linhas nunca chega aqui nem é
impresso. Função que não existe mais aparece com o começo do id.

Uso: python3 e2e/hml10/logs.py [--horas 24] [--desde 2026-10-08T15:00:00Z] [--fim <ISO UTC>] [--pedaco 6]
"""
from __future__ import annotations

import argparse
import datetime as dt
import sys
from collections import defaultdict
from pathlib import Path

sys.dont_write_bytecode = True
AQUI = Path(__file__).resolve().parent
sys.path.insert(0, str(AQUI))
from _logs_supabase import LogsFora, Saida, agora, consulta, funcoes, iso, janelas, ler_iso  # noqa: E402

PRINCIPAL_REF = "hkxvtsbwctxkrqzkkdoz"
TREINO_REF = "uxwpwdbbnlticxgtzcsb"
# as 35 da W (spec §3.1 e §4): 22 do principal publicadas + a erro-avisar nova; 12 do Treino
DA_W = {
    PRINCIPAL_REF: (
        "agenda-avisar", "aluno-enviar", "alunos", "convites", "cobranca-conta", "entrar-senha", "espelho-enviar",
        "espelho-resumo", "excluir-minha-conta", "exportar-meus-dados", "master-contas", "master-financeiro", "master-planos",
        "mp-webhook", "mp-webhook-aluno", "mp-webhook-conta", "pagamentos-aluno", "pos-login", "push-enviar", "vincular-aluno",
        "whatsapp-agente", "whatsapp-conectar", "erro-avisar",
    ),
    TREINO_REF: (
        "trocar-token", "admin-delete-user", "admin-list-users", "mp-webhook", "master-financeiro", "master-planos",
        "master-professores", "professor-convites", "vincular-professor", "mp-payments", "espelho-nucleo", "delete-my-account",
    ),
}
NOME = {PRINCIPAL_REF: "principal", TREINO_REF: "Treino"}
CONTAGENS = ("total", "em_json", "email", "jwt", "chave", "digitos")

# Contagens no endpoint (ClickHouse; no texto do SQL, \\ chega ao RE2 como \). Nenhuma coluna de conteúdo é pedida.
SQL_CONSOLE = r"""SELECT log_attributes['function_id'] AS fid,
  count() AS total,
  countIf(isValidJSON(event_message) AND match(event_message, '^\\s*\\{"nivel":"(info|aviso|erro)","funcao":"')) AS em_json,
  countIf(match(event_message, '[A-Za-z0-9._%+-]+(@|%40)[A-Za-z0-9.-]+\\.[A-Za-z]{2,}')) AS email,
  countIf(position(event_message, 'eyJ') > 0) AS jwt,
  countIf(match(event_message, '(sb_[a-z]+_[A-Za-z0-9]|sbp_[A-Za-z0-9]|APP_USR-)')) AS chave,
  countIf(match(event_message, '[0-9]{11,}')) AS digitos
FROM logs WHERE source = 'function_logs' AND log_attributes['event_type'] = 'Log'
GROUP BY fid"""
SQL_BORDA = r"""SELECT log_attributes['function_id'] AS fid, log_attributes['response.status_code'] AS st, count() AS n
FROM logs WHERE source = 'function_edge_logs'
GROUP BY fid, st"""


def somar(ref: str, sql: str, pedacos: list[tuple[dt.datetime, dt.datetime]], chaves: tuple[str, ...]) -> list[dict]:
    """A mesma consulta em cada pedaço da janela; as linhas que voltam são somadas pelas chaves (os outros campos)."""
    soma: dict[tuple, dict] = {}
    for ini, fim in pedacos:
        for linha in consulta(ref, sql, ini, fim):
            k = tuple(str(linha.get(c) or "") for c in chaves)
            alvo = soma.setdefault(k, {c: v for c, v in zip(chaves, k)})
            for campo, valor in linha.items():
                if campo not in chaves:
                    alvo[campo] = alvo.get(campo, 0) + int(valor or 0)
    return list(soma.values())


_MAPAS: dict[str, dict[str, str]] = {}


def nome_da(ref: str, fid: str) -> str:
    """O slug da função pelo id (lista da Management API, 1 vez por projeto; se ela falhar, ficam os ids)."""
    if ref not in _MAPAS:
        try:
            _MAPAS[ref] = funcoes(ref)
        except Exception as e:  # noqa: BLE001 — sem a lista, a contagem sai pelo id
            print(f"   (lista de funções de {ref[:6]}… indisponível: {type(e).__name__}; ficam os ids)", flush=True)
            _MAPAS[ref] = {}
    return _MAPAS[ref].get(fid) or (f"?{fid[:8]}" if fid else "?(sem id)")


def main() -> int:
    ap = argparse.ArgumentParser(description="Contagens dos logs das funções (hml-10). Detalhes no topo do arquivo.")
    ap.add_argument("--horas", type=float, default=24, help="tamanho da janela, até agora (ou até --fim); padrão 24")
    ap.add_argument("--desde", help="começo da janela em ISO UTC (ex.: a hora da publicação); vale no lugar de --horas")
    ap.add_argument("--fim", help="fim da janela em ISO UTC (padrão: agora)")
    ap.add_argument("--pedaco", type=float, default=6, help="horas por consulta (o endpoint falha mais em janela longa); padrão 6")
    a = ap.parse_args()
    fim = ler_iso(a.fim) if a.fim else agora()
    inicio = ler_iso(a.desde) if a.desde else fim - dt.timedelta(hours=a.horas)
    if inicio >= fim:
        ap.error("a janela está vazia (--desde depois do --fim)")
    pedacos = janelas(inicio, fim, a.pedaco)
    o = Saida(f"logs_{fim.strftime('%Y%m%d_%H%M')}")
    o.linha(f"janela {iso(inicio)} → {iso(fim)} ({(fim - inicio).total_seconds() / 3600:.1f} h, {len(pedacos)} consulta(s) por fonte)"
            " · só contagens")

    for ref in (PRINCIPAL_REF, TREINO_REF):
        try:
            console = somar(ref, SQL_CONSOLE, pedacos, ("fid",))
            borda = somar(ref, SQL_BORDA, pedacos, ("fid", "st"))
        except LogsFora as e:
            o.ok(False, f"{NOME[ref]}: {e}")
            continue
        por_fn: dict[str, dict] = defaultdict(lambda: {c: 0 for c in CONTAGENS} | {"chamadas": 0, "5xx": {}})
        for l in console:
            alvo = por_fn[nome_da(ref, l["fid"])]
            for c in CONTAGENS:
                alvo[c] += int(l.get(c) or 0)
        for l in borda:
            alvo = por_fn[nome_da(ref, l["fid"])]
            n = int(l.get("n") or 0)
            alvo["chamadas"] += n
            st = str(l.get("st") or "")
            if st.isdigit() and int(st) >= 500:
                alvo["5xx"][st] = alvo["5xx"].get(st, 0) + n

        da_w = DA_W[ref]
        o.linha(f"\n== {NOME[ref]} ({ref[:6]}…): {len(da_w)} da W + {len([f for f in por_fn if f not in da_w])} outra(s) com linha ou chamada")
        o.linha(f"   {'função':<24} {'linhas':>6} {'JSON':>9} {'e-mail':>6} {'JWT':>4} {'chave':>5} {'11+díg':>6} {'chamadas':>8}  5xx")
        for fn in list(da_w) + sorted(f for f in por_fn if f not in da_w):
            x = por_fn.get(fn) or {c: 0 for c in CONTAGENS} | {"chamadas": 0, "5xx": {}}
            pct = f"{100 * x['em_json'] / x['total']:.0f}%" if x["total"] else "-"
            cinco = ", ".join(f"{s}×{n}" for s, n in sorted(x["5xx"].items())) or "0"
            marca = "" if fn in da_w else "  (fora da W)"
            o.linha(f"   {fn:<24} {x['total']:>6} {x['em_json']:>4} {pct:>4} {x['email']:>6} {x['jwt']:>4} {x['chave']:>5} "
                    f"{x['digitos']:>6} {x['chamadas']:>8}  {cinco}{marca}")

        # as conferências da spec §5.3, só nas da W
        linhas = sum(por_fn[f]["total"] for f in da_w if f in por_fn)
        fora_json = [f"{f} ({por_fn[f]['total'] - por_fn[f]['em_json']})" for f in da_w if f in por_fn and por_fn[f]["em_json"] < por_fn[f]["total"]]
        if linhas:
            o.ok(not fora_json, f"{NOME[ref]}: das {linhas} linhas das funções da W, todas em JSON"
                 + (f" — fora do JSON: {', '.join(fora_json)}" if fora_json else ""))
        else:
            o.atencao(f"{NOME[ref]}: nenhuma linha de console das funções da W na janela (nada a conferir no formato)")
        for campo, rotulo in (("email", "e-mail"), ("jwt", "JWT (eyJ)"), ("chave", "chave (sb_, sbp_, APP_USR-)")):
            com = [f"{f} ({por_fn[f][campo]})" for f in da_w if f in por_fn and por_fn[f][campo]]
            o.ok(not com, f"{NOME[ref]}: 0 linha com {rotulo} nas funções da W" + (f" — com: {', '.join(com)}" if com else ""))
        digitos = [f"{f} ({por_fn[f]['digitos']})" for f in da_w if f in por_fn and por_fn[f]["digitos"]]
        if digitos:
            o.atencao(f"{NOME[ref]}: linhas com 11+ dígitos (o ref pode ser id do Mercado Pago — conferir se é só isso): {', '.join(digitos)}")
        com_5xx = [f"{f} ({sum(por_fn[f]['5xx'].values())})" for f in da_w if f in por_fn and por_fn[f]["5xx"]]
        if com_5xx:
            o.atencao(f"{NOME[ref]}: 5xx na borda nas funções da W (comparar com a janela de antes): {', '.join(com_5xx)}")
        else:
            o.linha(f"   {NOME[ref]}: 0 5xx na borda nas funções da W")
    return o.fim()


if __name__ == "__main__":
    sys.exit(main())
