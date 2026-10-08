#!/usr/bin/env python3
"""Physiq hml-10 (H-26, D4 e D6; spec §5.2 e §5.3) — sondas da função erro-avisar do banco principal
(POST https://hkxvtsbwctxkrqzkkdoz.supabase.co/functions/v1/erro-avisar; a lógica é o atenderPedido de
supabase-principal/functions/_shared/erro-avisar-regras.ts).

Casos (--so, separados por vírgula; sem --so, todos os que o schema permite):
  options   OPTIONS → 200 com o CORS de sempre (Allow-Origin = a Origin do ambiente, POST, content-type/apikey/x-schema, Vary)
  origem    Origin estranha → 403 origem_recusada; sem Origin e sem segredo → 403 origem_recusada
  grande    corpo de 3 KB (Origin boa) → 413 corpo_grande
  valido    [staging] o que o app manda (Origin do staging, x-schema staging) → 204 + log aviso_enviado com o message_id; o MESMO
            de novo → 204 + log segurado (a trava: 1 igual a cada 10 min)
            [public] SÓ com --p6 (P6: 1 aviso de teste em produção; sem o "de novo")
  segredo   servidor com o segredo errado (sem Origin e com a Origin boa) → 403 segredo_invalido (não usa o segredo certo)
  treino    [staging] servidor com o segredo certo: o POST igual ao do supabase/functions/_shared/avisar-erro.ts (o caminho do
            Treino) → 204 + log aviso_enviado
  excecao   {"teste":"excecao"}: [staging] segredo + x-schema staging → 500 erro_interno + log excecao (ação teste_hml10) + o aviso
            do catch; segredo + x-schema public → 403 so_staging; pelo navegador (sem segredo) → 403 so_staging
Em public só rodam os casos que não mandam aviso (+ o valido com --p6).

A prova de que a mensagem saiu são SÓ os logs da função (endpoint de logs da Management API, _logs_supabase.py): aviso_enviado
(com o message_id do Telegram), segurado ou telegram_recusou, achados pela assinatura — o 🔑 do aviso, calculado aqui do mesmo
jeito do _shared/erros.ts. NUNCA getUpdates nem chamada nenhuma à API do Telegram (roubaria as mensagens da ponte).
Segredo: ESPELHO_SEGREDO lido SÓ do ambiente (nunca de arquivo; nunca gravado nem impresso). No cofre B Code Segredos: o item
"Physiq — ESPELHO_SEGREDO (troca de token e espelho entre os 2 bancos)". Sem ele, os casos que o usam saem ❌ e o resto roda.
Cada execução põe uma marca nova (letras) na mensagem: a assinatura é nova e a trava de 10 min não segura o 1º envio. O
excecao tem a mensagem fixa do servidor: repetido em menos de 10 min, o aviso sai "segurado" (vale: o caminho do catch chegou
ao aviso).

Uso: python3 e2e/hml10/aviso.py --schema staging|public [--so options,origem,grande,valido,segredo,treino,excecao] [--p6]
                                [--espera 150] [--sem-logs]
"""
from __future__ import annotations

import argparse
import datetime as dt
import json
import os
import re
import secrets
import sys
import time
from pathlib import Path

sys.dont_write_bytecode = True
AQUI = Path(__file__).resolve().parent
REPO = AQUI.parents[1]  # a worktree onde este arquivo está
sys.path.insert(0, str(AQUI.parent / "w02"))
sys.path.insert(0, str(AQUI))
from _comum import PRINCIPAL_REF, PRINCIPAL_URL, http  # noqa: E402  (e2e/w02/_comum.py)
from _logs_supabase import LogsFora, Saida, agora, consulta  # noqa: E402

URL = f"{PRINCIPAL_URL}/functions/v1/erro-avisar"
ORIGEM = {"staging": "https://physiqcalc-staging.vercel.app", "public": "https://physiqcalc.com.br"}
ORIGEM_ESTRANHA = "https://site-estranho.example"
CASOS = ("options", "origem", "grande", "valido", "segredo", "treino", "excecao")
ITEM_DO_COFRE = "Physiq — ESPELHO_SEGREDO (troca de token e espelho entre os 2 bancos)"
ROTA, LUGAR = "/erro-teste", "sonda do aviso"
# o que o servidor manda ao aviso no {"teste":"excecao"} (log.excecao: "<name> · <msg>", erro-avisar-regras.ts)
MSG_EXCECAO = "Error · teste_hml10: erro de propósito na erro-avisar (prova do catch → aviso)"
# os desfechos do caminho do aviso que não são sucesso (logs do avisar-erro): a espera para neles
FALHAS = {"telegram_recusou", "aviso_desligado", "aviso_sem_configuracao", "aviso_falhou"}
TEXTO_LIMPO = re.compile(r"^[a-z][a-z ]{0,119}$")  # o que a limpeza do servidor devolve igual: letras minúsculas e espaço
_UM_MINUTO = dt.timedelta(minutes=1)


# ───────────────────────── a assinatura (o 🔑 do aviso) ─────────────────────────


def _fnv1a(texto: str) -> str:
    """FNV-1a de 32 bits sobre os bytes UTF-8 — o mesmo do _shared/erros.ts."""
    h = 0x811C9DC5
    for b in texto.encode("utf-8"):
        h = ((h ^ b) * 0x01000193) & 0xFFFFFFFF
    return f"{h:08x}"


def assinatura(origem: str, *, banco: str = "principal", funcao: str = "", codigo: str = "", acao: str = "",
               status: int | None = None, rota: str = "", lugar: str = "", mensagem: str = "") -> str:
    """O assinatura() do _shared/erros.ts para os textos desta sonda (que a limpeza do servidor não muda)."""
    de_funcao = origem in ("funcao", "servidor")
    partes = [
        origem,
        ("treino" if banco == "treino" else "principal") if de_funcao else "",
        funcao if de_funcao else "",
        codigo if de_funcao else "",
        acao if de_funcao else "",
        (str(status) if status is not None else "") if de_funcao else "",
        "" if de_funcao else rota,
        lugar,
        re.sub(r"\d+", "#", mensagem),
    ]
    return _fnv1a("|".join(partes))


# ───────────────────────── pedidos ─────────────────────────


def cab(h: dict, nome: str) -> str:
    for k, v in (h or {}).items():
        if k.lower() == nome.lower():
            return str(v)
    return ""


def erro_de(r: object) -> str:
    return str(r.get("erro")) if isinstance(r, dict) else str(r)[:40]


def post(corpo: object, *, schema: str | None, origem: str | None = None, segredo: str | None = None) -> tuple[int, object]:
    h: dict[str, str] = {}
    if schema:
        h["x-schema"] = schema
    if origem:
        h["Origin"] = origem
    if segredo is not None:
        h["x-espelho-segredo"] = segredo
    st, r, _ = http("POST", URL, corpo, h, timeout=30)
    return st, r


def versao_do_app() -> str:
    try:
        return str(json.loads((REPO / "package.json").read_text(encoding="utf-8")).get("version") or "")
    except (OSError, ValueError):
        return ""


# ───────────────────────── logs (a prova de que o aviso saiu) ─────────────────────────


def _campos(m: str) -> dict:
    """Da linha de log (JSON do _shared/log.ts), só os campos de código; o resto não sai daqui."""
    try:
        d = json.loads(m)
    except (TypeError, ValueError):
        return {"codigo": "?(linha fora do JSON)"}
    if not isinstance(d, dict):
        return {"codigo": "?"}
    saida = {k: d[k] for k in ("funcao", "codigo", "schema", "resultado", "n", "status") if k in d}
    externo = d.get("externo")
    if isinstance(externo, dict) and "telegram_id" in externo:
        saida["message_id"] = externo["telegram_id"]
    if d.get("codigo") in ("telegram_recusou", "aviso_falhou") and isinstance(d.get("msg"), str):
        saida["msg"] = d["msg"][:100]
    return saida


def esperar_log(sig: str, desde: dt.datetime, procura: set[str], espera: int) -> list[dict]:
    """As linhas do log do principal com esta assinatura no ref, até aparecer uma com o código em `procura` (ou `espera` s)."""
    if not re.fullmatch(r"[0-9a-f]{8}", sig):
        raise ValueError("assinatura fora do formato")
    sql = ("SELECT event_message AS m FROM logs WHERE source = 'function_logs' AND log_attributes['event_type'] = 'Log' "
           f"AND position(event_message, '\"ref\":\"{sig}\"') > 0 ORDER BY timestamp")
    limite = time.time() + espera
    linhas: list[dict] = []
    while True:
        try:
            linhas = [_campos(x.get("m")) for x in consulta(PRINCIPAL_REF, sql, desde, agora() + _UM_MINUTO)]
        except LogsFora as e:
            print(f"   (logs: {e})", flush=True)
        if any(l.get("codigo") in procura for l in linhas) or time.time() >= limite:
            return linhas
        time.sleep(10)


def esperar_excecao(desde: dt.datetime, espera: int) -> int:
    """Quantas linhas "excecao · teste_hml10" a erro-avisar escreveu no staging desde `desde` (o log.excecao do catch final)."""
    marca = '"funcao":"erro-avisar","codigo":"excecao","schema":"staging","acao":"teste_hml10"'
    sql = ("SELECT count() AS n FROM logs WHERE source = 'function_logs' AND log_attributes['event_type'] = 'Log' "
           f"AND position(event_message, '{marca}') > 0")
    limite = time.time() + espera
    n = 0
    while True:
        try:
            r = consulta(PRINCIPAL_REF, sql, desde, agora() + _UM_MINUTO)
            n = int(r[0]["n"]) if r else 0
        except (LogsFora, KeyError, ValueError) as e:
            print(f"   (logs: {e})", flush=True)
        if n or time.time() >= limite:
            return n
        time.sleep(10)


def resumo_log(linhas: list[dict]) -> str:
    return " · ".join(json.dumps(l, ensure_ascii=False, separators=(",", ":")) for l in linhas) or "nenhuma linha ainda"


# ───────────────────────── os casos ─────────────────────────


def main() -> int:
    ap = argparse.ArgumentParser(description="Sondas da erro-avisar (hml-10). Detalhes no topo do arquivo.")
    ap.add_argument("--schema", required=True, choices=["staging", "public"])
    ap.add_argument("--so", default=",".join(CASOS), help=f"casos separados por vírgula ({', '.join(CASOS)})")
    ap.add_argument("--p6", action="store_true", help="public: roda o caso valido (P6: 1 aviso de teste em produção)")
    ap.add_argument("--espera", type=int, default=150, help="segundos esperando a linha do aviso no log (padrão 150)")
    ap.add_argument("--sem-logs", action="store_true", help="não confere os logs (só as respostas HTTP)")
    a = ap.parse_args()
    S = a.schema
    so = [c.strip() for c in a.so.split(",") if c.strip()]
    desconhecidos = [c for c in so if c not in CASOS]
    if desconhecidos:
        ap.error(f"caso desconhecido: {', '.join(desconhecidos)} (os casos: {', '.join(CASOS)})")
    segredo = os.environ.get("ESPELHO_SEGREDO", "").strip()
    errado = secrets.token_hex(32)  # um segredo errado do mesmo tamanho, feito na hora (nunca um literal)
    while errado == segredo:
        errado = secrets.token_hex(32)
    marca = "".join(secrets.choice("ghjkmnpqrstuvwxyz") for _ in range(8))  # sem a-f: a limpeza não vê hex nem número
    o = Saida(f"aviso_{S}")
    o.linha(f"schema={S} · {URL.split('//')[1].split('.')[0][:6]}…/functions/v1/erro-avisar · casos: {','.join(so)} · marca {marca}"
            + (" · com --p6" if a.p6 else ""))

    def falta_segredo(caso: str) -> bool:
        if len(segredo) >= 32:
            return False
        o.ok(False, f"{caso}: falta ESPELHO_SEGREDO no ambiente (cofre: \"{ITEM_DO_COFRE}\") — caso não rodou")
        return True

    def confere_aviso(rotulo: str, sig: str, desde: dt.datetime, esperado: set[str], texto: str) -> None:
        """Sucesso = uma linha com o código em `esperado` (aviso_enviado só vale com o message_id); uma falha do caminho para a espera."""
        if a.sem_logs:
            o.atencao(f"{rotulo}: log não conferido (--sem-logs) · 🔑 {sig}")
            return
        linhas = esperar_log(sig, desde, esperado | FALHAS, a.espera)
        enviado = [l for l in linhas if l.get("codigo") == "aviso_enviado" and isinstance(l.get("message_id"), int)]
        if "aviso_enviado" in esperado and enviado:
            o.ok(True, f"{rotulo}: log aviso_enviado com message_id {enviado[-1]['message_id']} · 🔑 {sig}")
            return
        bons = [l for l in linhas if l.get("codigo") in esperado - {"aviso_enviado"}]
        o.ok(bool(bons), f"{rotulo}: log {texto} · 🔑 {sig} → {resumo_log(linhas)}")

    # ── options ──
    if "options" in so:
        st, r, h = http("OPTIONS", URL, None, {"Origin": ORIGEM[S], "Access-Control-Request-Method": "POST",
                                               "Access-Control-Request-Headers": "content-type,apikey,x-schema"}, timeout=30)
        cabecalhos = cab(h, "access-control-allow-headers").lower()
        o.ok(st == 200 and cab(h, "access-control-allow-origin") == ORIGEM[S]
             and "POST" in cab(h, "access-control-allow-methods")
             and all(x in cabecalhos for x in ("content-type", "apikey", "x-schema"))
             and "origin" in cab(h, "vary").lower(),
             f"options: OPTIONS → {st}; Allow-Origin {cab(h, 'access-control-allow-origin') or '-'}; "
             f"Methods {cab(h, 'access-control-allow-methods') or '-'}; Headers {cabecalhos or '-'}; Vary {cab(h, 'vary') or '-'}")

    valido = {"origem": "tela", "mensagem": f"teste do aviso pelo navegador marca {marca}", "rota": ROTA, "lugar": LUGAR,
              "versao": versao_do_app(), "plataforma": "site"}

    # ── origem ──
    if "origem" in so:
        st, r = post(valido, schema=S, origem=ORIGEM_ESTRANHA)
        o.ok(st == 403 and erro_de(r) == "origem_recusada", f"origem: Origin estranha → {st} {erro_de(r)}")
        st, r = post(valido, schema=S)
        o.ok(st == 403 and erro_de(r) == "origem_recusada", f"origem: sem Origin e sem segredo → {st} {erro_de(r)}")

    # ── grande ──
    if "grande" in so:
        corpo = {"origem": "tela", "mensagem": "x" * 3000, "rota": ROTA}
        tamanho = len(json.dumps(corpo).encode("utf-8"))
        st, r = post(corpo, schema=S, origem=ORIGEM[S])
        o.ok(st == 413 and erro_de(r) == "corpo_grande", f"grande: corpo de {tamanho} bytes → {st} {erro_de(r)}")

    # ── valido ──
    if "valido" in so:
        if S == "public" and not a.p6:
            o.atencao("valido: em public só com --p6 (P6: 1 aviso de teste em produção) — não rodou")
        else:
            if S == "public":
                valido["mensagem"] = f"teste do aviso em producao marca {marca}"
            assert TEXTO_LIMPO.match(valido["mensagem"]) and TEXTO_LIMPO.match(LUGAR), "a mensagem da sonda tem de sair igual da limpeza"
            sig = assinatura("tela", rota=ROTA, lugar=LUGAR, mensagem=valido["mensagem"])
            rotulo = "valido (P6)" if S == "public" else "valido"
            desde = agora() - _UM_MINUTO
            st, r = post(valido, schema=S, origem=ORIGEM[S])
            o.ok(st == 204, f"{rotulo}: o que o app manda (Origin {ORIGEM[S]}, x-schema {S}) → {st}")
            if st == 204:
                confere_aviso(rotulo, sig, desde, {"aviso_enviado"}, "aviso_enviado com o message_id")
            if S == "staging":
                if a.sem_logs:
                    time.sleep(5)  # o 1º aviso registra na trava antes do 2º chegar
                st, r = post(valido, schema=S, origem=ORIGEM[S])
                o.ok(st == 204, f"valido de novo (o mesmo corpo): aceito → {st}")
                if st == 204:
                    confere_aviso("valido de novo", sig, desde, {"segurado"}, "segurado (trava: 1 igual a cada 10 min)")

    # ── segredo errado ──
    if "segredo" in so:
        st, r = post({"origem": "servidor", "funcao": "hml10-sonda", "codigo": "teste_hml10"}, schema=S, segredo=errado)
        o.ok(st == 403 and erro_de(r) == "segredo_invalido", f"segredo: servidor com o segredo errado → {st} {erro_de(r)}")
        st, r = post(valido, schema=S, origem=ORIGEM[S], segredo=errado)
        o.ok(st == 403 and erro_de(r) == "segredo_invalido", f"segredo: segredo errado mesmo com a Origin boa → {st} {erro_de(r)}")

    # ── treino (o caminho do _shared/avisar-erro.ts do Treino) ──
    if "treino" in so:
        if S != "staging":
            o.atencao("treino: só no staging (o aviso iria para o tópico como produção) — não rodou")
        elif not falta_segredo("treino"):
            corpo = {"origem": "servidor", "funcao": "hml10-sonda", "codigo": "teste_hml10", "acao": "caminho_treino",
                     "mensagem": f"teste do caminho do treino marca {marca}"}
            assert TEXTO_LIMPO.match(corpo["mensagem"]), "a mensagem da sonda tem de sair igual da limpeza"
            sig = assinatura("servidor", banco="treino", funcao=corpo["funcao"], codigo=corpo["codigo"], acao=corpo["acao"],
                             mensagem=corpo["mensagem"])
            desde = agora() - _UM_MINUTO
            # os mesmos cabeçalhos do Treino: Content-Type (o http põe), x-espelho-segredo e x-schema; sem Origin e sem apikey
            st, r = post(corpo, schema=S, segredo=segredo)
            o.ok(st == 204, f"treino: servidor com o segredo certo (o POST do avisar-erro.ts do Treino) → {st}")
            if st == 204:
                confere_aviso("treino", sig, desde, {"aviso_enviado"}, "aviso_enviado com o message_id (\"função hml10-sonda (Treino)\")")

    # ── excecao (a prova do D6: o catch final → log.excecao → aviso) ──
    if "excecao" in so:
        st, r = post({"teste": "excecao"}, schema=S, origem=ORIGEM[S])
        o.ok(st == 403 and erro_de(r) == "so_staging", f"excecao: pelo navegador (sem segredo) → {st} {erro_de(r)}")
        if not falta_segredo("excecao"):
            st, r = post({"teste": "excecao"}, schema="public", segredo=segredo)
            o.ok(st == 403 and erro_de(r) == "so_staging", f"excecao: segredo + x-schema public → {st} {erro_de(r)}")
            if S == "staging":
                sig = assinatura("servidor", funcao="erro-avisar", codigo="excecao", acao="teste_hml10", mensagem=MSG_EXCECAO)
                desde = agora() - _UM_MINUTO
                st, r = post({"teste": "excecao"}, schema="staging", segredo=segredo)
                o.ok(st == 500 and erro_de(r) == "erro_interno", f"excecao: segredo + x-schema staging → {st} {erro_de(r)}")
                if st == 500 and not a.sem_logs:
                    n = esperar_excecao(desde, a.espera)
                    o.ok(n >= 1, f"excecao: log da erro-avisar 'excecao · ação teste_hml10' (o catch final chamou log.excecao) × {n}")
                    confere_aviso("excecao", sig, desde, {"aviso_enviado", "segurado"},
                                  "aviso_enviado (ou segurado, se rodou há menos de 10 min)")
    return o.fim()


if __name__ == "__main__":
    sys.exit(main())
