#!/usr/bin/env python3
"""Physiq mp-cartao — a leitura da PROVA VIVA do cartão na produção (contrato hml/mpc/CONTRATO_MPC.md §4 F6 e §7.9; o molde do
e2e/w07b/prova_real.py, só o `conferir`): depois que O WESLLEY (ou o aluno dele) paga com cartão no MP do personal, este script LÊ — sem a
API do Mercado Pago e sem login — a linha da cobrança e o log novo da pagamentos-aluno. O estorno é pelo app (Financeiro › Estornar).

  conferir [--desde "AAAA-MM-DD HH:MM"] [--schema public|staging]
           SQL SÓ LEITURA (a Management API com read_only, o molde do hml/sqlro.py): as cobranças de CARTÃO do MP desde a hora (forma mp,
           metodo cartao) por conta que recebe no MP — status, mp_status e se tem o pagamento e o collector (contagens; nenhum id, nome ou
           e-mail); as automáticas criadas desde a hora (status); e o LOG das funções (o endpoint de logs da Management API, só leitura): as
           linhas mp_cartao_recusado, mp_cartao_falhou, mp_assinatura_falhou e mp_cartao_modo_errado da pagamentos-aluno com o resultado
           (com/sem device) e o mp_status_detail (mpc-b: + a mp_cartao_recusado do mp-webhook-aluno — a recusa que chega pelo aviso do
           MP); e (a revisão mpc 🟡3) a excecao, o mp_indisponivel, o mp_conta_indisponivel e o
           mp_tokens_chave_ausente das ações do cartão (aluno_mp_cartao e aluno_mp_assinar: o 500, o 502 e o 409 que o cartão pode dar logo
           depois de publicar) + a contagem de TODA linha de erro da pagamentos-aluno desde a hora, por código — a prova se lê sem a API do MP
  --seco   sem rede: as conferências puras (a leitura das linhas do log e o resumo)
Precisa: ~/.pc-pat. Nunca imprime id, e-mail, nome, CPF ou token.
Uso: python3 e2e/mpc/prova_real.py conferir --desde "2026-10-15 18:00"
     python3 e2e/mpc/prova_real.py --seco
"""
from __future__ import annotations

import argparse
import datetime as dt
import json
import re
import sys
import urllib.parse
import urllib.request
from pathlib import Path

sys.dont_write_bytecode = True
REF = "hkxvtsbwctxkrqzkkdoz"            # o banco principal (public e staging)
UA = "physiq-mpc/1.0 (prova_real)"
CODIGOS = ("mp_cartao_recusado", "mp_cartao_falhou", "mp_assinatura_falhou", "mp_cartao_modo_errado")
# revisão mpc 🟡3: o que o cartão pode dar logo depois de publicar sem cair nos 4 de cima — só nas ações do cartão
CODIGOS_DA_ACAO = ("excecao", "mp_indisponivel", "mp_conta_indisponivel", "mp_tokens_chave_ausente")
ACOES_DO_CARTAO = ("aluno_mp_cartao", "aluno_mp_assinar")
BRT = dt.timezone(dt.timedelta(hours=-3))


def pat() -> str:
    return Path.home().joinpath(".pc-pat").read_text(encoding="utf-8").strip()


def api(metodo: str, caminho: str, corpo: dict | None = None) -> object:
    req = urllib.request.Request(f"https://api.supabase.com{caminho}", data=None if corpo is None else json.dumps(corpo).encode(), method=metodo,
                                 headers={"Authorization": f"Bearer {pat()}", "Content-Type": "application/json", "User-Agent": UA})
    with urllib.request.urlopen(req, timeout=120) as r:
        return json.loads(r.read() or b"null")


def ler(sql: str) -> list[dict]:
    """SQL SÓ LEITURA (read_only da Management API)."""
    r = api("POST", f"/v1/projects/{REF}/database/query", {"query": sql, "read_only": True})
    return r if isinstance(r, list) else []


def quando(t: object) -> str:
    """O timestamp do log (microssegundos ou ISO em UTC, conforme o endpoint) → dd/mm HH:MM:SS de Brasília."""
    try:
        d = dt.datetime.fromtimestamp(int(t) / 1e6, dt.timezone.utc) if str(t).isdigit() else dt.datetime.fromisoformat(str(t)).replace(tzinfo=dt.timezone.utc)
        return d.astimezone(BRT).strftime("%d/%m %H:%M:%S")
    except (TypeError, ValueError):
        return "?"


def linhas_do_log(eventos: list[dict], todas: bool = False) -> list[dict]:
    """As mensagens do log das funções → as linhas JSON do _shared/log.ts da pagamentos-aluno com os códigos da W e os das ações do cartão
    (só os campos do formato). todas=True: toda linha da pagamentos-aluno (a contagem dos erros)."""
    saida = []
    for e in eventos:
        msg = str(e.get("event_message") or "")
        i = msg.find("{")
        if i < 0:
            continue
        try:
            d = json.loads(msg[i:])
        except ValueError:
            continue
        if not isinstance(d, dict):
            continue
        # mpc-b: a recusa que chega pelo AVISO do MP (o POST ficou "em análise" e o MP recusou depois) sai no log do mp-webhook-aluno
        do_aviso = d.get("funcao") == "mp-webhook-aluno" and d.get("codigo") == "mp_cartao_recusado"
        if do_aviso:
            if not todas:
                saida.append({"quando": e.get("quando"), "funcao": "mp-webhook-aluno",
                              **{k: d.get(k) for k in ("nivel", "codigo", "schema", "acao", "status", "resultado", "externo")}})
            continue
        if d.get("funcao") != "pagamentos-aluno":
            continue
        if todas or d.get("codigo") in CODIGOS or (d.get("codigo") in CODIGOS_DA_ACAO and d.get("acao") in ACOES_DO_CARTAO):
            saida.append({"quando": e.get("quando"), **{k: d.get(k) for k in ("nivel", "codigo", "schema", "acao", "status", "resultado", "externo")}})
    return saida


def erros_por_codigo(linhas: list[dict]) -> dict[str, int]:
    """Toda linha nivel "erro" da pagamentos-aluno, contada por código (a 1ª leitura depois de publicar: nenhum erro novo do cartão)."""
    contagem: dict[str, int] = {}
    for x in linhas:
        if x.get("nivel") == "erro":
            chave = f"{x.get('codigo')}/{x.get('acao') or '-'}"
            contagem[chave] = contagem.get(chave, 0) + 1
    return contagem


def conferir(a) -> int:
    s = a.schema
    desde = a.desde or (dt.datetime.now(BRT) - dt.timedelta(hours=6)).strftime("%Y-%m-%d %H:%M")
    if not re.fullmatch(r"\d{4}-\d{2}-\d{2} \d{2}:\d{2}", desde):
        raise SystemExit("--desde no formato AAAA-MM-DD HH:MM (hora de Brasília)")
    t0 = f"{desde}:00-03"
    print(f"── conferir ({s}, desde {desde} BRT) — só leitura, sem a API do Mercado Pago")
    cob = ler(f"""select k.recebimento_modo as modo, c.status, c.mp_status, (c.mp_payment_id is not null) as tem_pagamento,
                         (c.mp_collector_id is not null) as tem_collector, count(*)::int as n
                    from {s}.cobrancas c join {s}.contas k on k.id = c.conta_id
                   where c.forma = 'mp' and c.metodo = 'cartao' and c.created_at >= '{t0}'::timestamptz
                   group by 1, 2, 3, 4, 5 order by 1, 2""")
    print("   cobranças de cartão do MP:", cob or "nenhuma")
    aut = ler(f"""select k.recebimento_modo as modo, a.status, count(*)::int as n from {s}.aluno_assinaturas a join {s}.contas k on k.id = a.conta_id
                   where a.criado_em >= '{t0}'::timestamptz group by 1, 2 order by 1, 2""")
    print("   automáticas criadas:", aut or "nenhuma")
    ini = dt.datetime.strptime(desde, "%Y-%m-%d %H:%M").replace(tzinfo=BRT).astimezone(dt.timezone.utc)
    fim = dt.datetime.now(dt.timezone.utc)
    # o molde do ~/projetos/physiqcalc-scratch/w2/fim/logs_cartao.py (14/10, o mesmo endpoint e a mesma tabela)
    sql = ("SELECT timestamp AS t, event_message FROM logs WHERE source = 'function_logs' AND "
           "(positionCaseInsensitive(event_message, '\"funcao\":\"pagamentos-aluno\"') > 0 OR "
           "positionCaseInsensitive(event_message, '\"funcao\":\"mp-webhook-aluno\"') > 0) AND (positionCaseInsensitive(event_message, '\"nivel\":\"erro\"') > 0 OR "
           + " OR ".join(f"positionCaseInsensitive(event_message, '{c}') > 0" for c in CODIGOS + CODIGOS_DA_ACAO) + ") ORDER BY t DESC LIMIT 500")
    q = urllib.parse.urlencode({"sql": sql, "iso_timestamp_start": ini.strftime("%Y-%m-%dT%H:%M:%SZ"), "iso_timestamp_end": fim.strftime("%Y-%m-%dT%H:%M:%SZ")})
    r = api("GET", f"/v1/projects/{REF}/analytics/endpoints/logs?{q}")
    eventos = [{"quando": quando(x.get("t")), "event_message": x.get("event_message")}
               for x in ((r or {}).get("result") or [])] if isinstance(r, dict) else []
    linhas = [x for x in linhas_do_log(eventos) if x.get("schema") == s]
    print(f"   log da pagamentos-aluno e do aviso do MP ({len(linhas)} linha(s) dos códigos da W e das ações do cartão):")
    for x in linhas:
        print("     ", json.dumps(x, ensure_ascii=False))
    erros = erros_por_codigo([x for x in linhas_do_log(eventos, todas=True) if x.get("schema") == s])
    print(f"   TODA linha de erro da pagamentos-aluno desde a hora ({sum(erros.values())}): {erros or 'nenhuma'}"
          + (" (o teto de 500 linhas da consulta: pode haver mais)" if len(eventos) >= 500 else ""))
    return 0


def seco() -> int:
    ev = [{"quando": "15/10 18:00:01", "event_message": json.dumps({"nivel": "aviso", "funcao": "pagamentos-aluno", "codigo": "mp_cartao_recusado",
                                                                      "schema": "public", "acao": "aluno_mp_cartao", "ref": "123", "resultado": "com_device",
                                                                      "externo": {"mp_status_detail": "cc_rejected_high_risk"}})},
          {"quando": "x", "event_message": "texto solto"},
          {"quando": "y", "event_message": json.dumps({"funcao": "outra", "codigo": "mp_cartao_recusado"})},
          {"quando": "w1", "event_message": json.dumps({"nivel": "aviso", "funcao": "mp-webhook-aluno", "codigo": "mp_cartao_recusado", "schema": "public",
                                                        "acao": "aviso_mp_conta", "ref": "123", "externo": {"mp_status_detail": "cc_rejected_high_risk"}})},
          {"quando": "w2", "event_message": json.dumps({"nivel": "info", "funcao": "mp-webhook-aluno", "codigo": "aviso_mp_conta", "schema": "public",
                                                        "acao": "payment", "resultado": "cobranca_cancelada"})},
          {"quando": "w3", "event_message": json.dumps({"nivel": "erro", "funcao": "mp-webhook-aluno", "codigo": "excecao", "schema": "public",
                                                        "acao": "aluno_mp_cartao"})}]
    ev += [{"quando": "z1", "event_message": json.dumps({"nivel": "erro", "funcao": "pagamentos-aluno", "codigo": "excecao", "schema": "public",
                                                        "acao": "aluno_mp_cartao", "msg": "x"})},
           {"quando": "z2", "event_message": json.dumps({"nivel": "erro", "funcao": "pagamentos-aluno", "codigo": "excecao", "schema": "public",
                                                        "acao": "aluno_status"})},
           {"quando": "z3", "event_message": json.dumps({"nivel": "aviso", "funcao": "pagamentos-aluno", "codigo": "mp_conta_indisponivel",
                                                        "schema": "public", "acao": "aluno_mp_assinar", "resultado": "acesso_recusado"})},
           {"quando": "z4", "event_message": json.dumps({"nivel": "erro", "funcao": "pagamentos-aluno", "codigo": "mp_indisponivel", "schema": "public",
                                                        "acao": "aluno_mp_cartao", "status": 599})}]
    lido = linhas_do_log(ev)
    ok = ([x["codigo"] for x in lido] == ["mp_cartao_recusado", "mp_cartao_recusado", "excecao", "mp_conta_indisponivel", "mp_indisponivel"]
          and lido[0]["resultado"] == "com_device" and lido[0]["externo"] == {"mp_status_detail": "cc_rejected_high_risk"} and "ref" not in lido[0]
          and "funcao" not in lido[0] and lido[1]["funcao"] == "mp-webhook-aluno" and lido[1]["acao"] == "aviso_mp_conta"
          and lido[1]["externo"] == {"mp_status_detail": "cc_rejected_high_risk"} and "ref" not in lido[1] and "msg" not in lido[2])
    print(("✅ " if ok else "❌ ") + "seco: o log lido só com as linhas da pagamentos-aluno: os 4 códigos da W + a excecao/mp_indisponivel/"
          "mp_conta_indisponivel SÓ das ações do cartão (a excecao do aluno_status fica fora) e os campos do formato (sem o ref nem a msg); "
          "do aviso do MP SÓ a mp_cartao_recusado (mpc-b), marcada com a funcao")
    erros = erros_por_codigo(linhas_do_log(ev, todas=True))
    ok2 = erros == {"excecao/aluno_mp_cartao": 1, "excecao/aluno_status": 1, "mp_indisponivel/aluno_mp_cartao": 1}
    print(("✅ " if ok2 else "❌ ") + f"seco: a contagem de TODA linha de erro da pagamentos-aluno por código, sem o aviso do MP ({erros})")
    return 0 if ok and ok2 else 1


def main() -> int:
    ap = argparse.ArgumentParser(description="Physiq mp-cartao — a leitura da prova viva do cartão (só leitura)")
    ap.add_argument("comando", nargs="?", choices=("conferir",))
    ap.add_argument("--desde", default=None)
    ap.add_argument("--schema", default="public", choices=("public", "staging"))
    ap.add_argument("--seco", action="store_true")
    a = ap.parse_args()
    if a.seco:
        return seco()
    if a.comando == "conferir":
        return conferir(a)
    ap.error("conferir ou --seco")
    return 2


if __name__ == "__main__":
    sys.exit(main())
