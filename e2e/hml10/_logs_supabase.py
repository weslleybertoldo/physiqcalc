r"""Physiq hml-10 — base comum do aviso.py e do logs.py: os LOGS das funções de borda e a saída ✅/❌.

Logs pela Management API (GET /v1/projects/<ref>/analytics/endpoints/logs — o ClickHouse da Supabase, tabela "logs"): cópia,
virada módulo, do ~/projetos/physiqcalc-scratch/hml/hml06/logs_borda.py e do logs_q.py da hml-06. Só leitura, com o PAT de
~/.pc-pat (o mesmo do e2e/w02/_comum.py). As 2 fontes (chaves conferidas em 08/10/2026):
  function_logs        o que a função escreveu no console: event_message + log_attributes (function_id, level, event_type —
                       "Log" é o console; "Boot" e "Shutdown" são da instância, version, execution_id…)
  function_edge_logs   cada chamada na borda: log_attributes (function_id, request.method, request.pathname,
                       response.status_code, version…)
O endpoint às vezes responde 500 ("Failed to get project's logs") ou "Backend error! Retry your query" — medido em 08/10 no
principal, mais em janela de 24 h: consulta() tenta de novo e janelas() parte a janela em pedaços (6 h), que o chamador soma.
Texto dentro do SQL do ClickHouse: \\ vira \ (então a regex leva \\. para chegar ao RE2 como \.).
"""
from __future__ import annotations

import datetime as dt
import json
import time
import urllib.error
import urllib.parse
import urllib.request
from functools import lru_cache
from pathlib import Path

API = "https://api.supabase.com/v1/projects"
UA = "physiq-hml10/1.0 (e2e)"  # a Management API exige User-Agent
SAIDA = Path.home() / "projetos" / "physiqcalc-scratch" / "hml" / "hml10"


def pat() -> str:
    return (Path.home() / ".pc-pat").read_text(encoding="utf-8").strip()


def agora() -> dt.datetime:
    return dt.datetime.now(dt.timezone.utc)


def iso(t: dt.datetime) -> str:
    return t.astimezone(dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def ler_iso(texto: str) -> dt.datetime:
    """'2026-10-08T13:00:00Z' (ou com +00:00) → datetime em UTC."""
    t = dt.datetime.fromisoformat(texto.strip().replace("Z", "+00:00"))
    return (t if t.tzinfo else t.replace(tzinfo=dt.timezone.utc)).astimezone(dt.timezone.utc)


def janelas(inicio: dt.datetime, fim: dt.datetime, horas: float = 6) -> list[tuple[dt.datetime, dt.datetime]]:
    """A janela [inicio, fim) em pedaços de `horas` (o endpoint falha mais em janela longa)."""
    passo = dt.timedelta(hours=horas)
    saida: list[tuple[dt.datetime, dt.datetime]] = []
    t = inicio
    while t < fim:
        saida.append((t, min(t + passo, fim)))
        t += passo
    return saida


class LogsFora(RuntimeError):
    """O endpoint de logs não respondeu, mesmo depois das tentativas."""


def consulta(ref: str, sql: str, inicio: dt.datetime, fim: dt.datetime, tentativas: int = 4) -> list[dict]:
    """Uma consulta só leitura no endpoint de logs (com nova tentativa). Devolve as linhas do resultado (o que o SQL pediu)."""
    q = urllib.parse.urlencode({"sql": sql, "iso_timestamp_start": iso(inicio), "iso_timestamp_end": iso(fim)})
    req = urllib.request.Request(f"{API}/{ref}/analytics/endpoints/logs?{q}",
                                 headers={"Authorization": f"Bearer {pat()}", "User-Agent": UA})
    ultimo = ""
    for n in range(tentativas):
        if n:
            time.sleep(4 * n)
        try:
            with urllib.request.urlopen(req, timeout=90) as r:
                d = json.load(r)
        except urllib.error.HTTPError as e:
            ultimo = f"HTTP {e.code}"
            continue
        except (urllib.error.URLError, TimeoutError, json.JSONDecodeError) as e:
            ultimo = type(e).__name__
            continue
        if d.get("error"):
            ultimo = str(d["error"])[:160]
            continue
        return d.get("result") or []
    raise LogsFora(f"endpoint de logs ({ref[:6]}…) sem resposta depois de {tentativas} tentativas: {ultimo}")


@lru_cache(maxsize=None)
def funcoes(ref: str) -> dict[str, str]:
    """function_id → slug das funções que existem hoje (a apagada não aparece: fica com o id)."""
    req = urllib.request.Request(f"{API}/{ref}/functions", headers={"Authorization": f"Bearer {pat()}", "User-Agent": UA})
    with urllib.request.urlopen(req, timeout=60) as r:
        return {f["id"]: f["slug"] for f in json.load(r)}


class Saida:
    """✅/❌ (e ⚠️, que só informa) por caso, na tela e numa cópia em ~/projetos/physiqcalc-scratch/hml/hml10/<nome>.txt."""

    def __init__(self, nome: str) -> None:
        self.arquivo = SAIDA / f"{nome}.txt"
        self.linhas: list[str] = []
        self.oks = self.falhas = 0
        self.linha(f"# {nome} · {time.strftime('%Y-%m-%d %H:%M:%S')}")

    def linha(self, texto: str) -> None:
        print(texto, flush=True)
        self.linhas.append(texto)

    def ok(self, cond: object, texto: str) -> bool:
        if cond:
            self.oks += 1
            self.linha("✅ " + texto)
            return True
        self.falhas += 1
        self.linha("❌ " + texto)
        return False

    def atencao(self, texto: str) -> None:
        self.linha("⚠️  " + texto)

    def fim(self) -> int:
        total = self.oks + self.falhas
        self.linha(f"\n{self.oks}/{total} ok" + (" — COM FALHA" if self.falhas else "") + f" · cópia: {self.arquivo}")
        SAIDA.mkdir(parents=True, exist_ok=True)
        self.arquivo.write_text("\n".join(self.linhas) + "\n", encoding="utf-8")
        return 1 if self.falhas else 0
