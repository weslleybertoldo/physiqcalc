#!/usr/bin/env python3
"""Physiq W22 — prova de PRODUÇÃO do Painel › Mensagens, SÓ LEITURA, com a nutri de teste (nutri.teste.claude@physiqnutri.app — conta
de teste que JÁ tem a linha de instância "desconectado" em produção: a visita não cria nada). Nenhuma conta do Weslley, nenhum aluno real,
nada conectado, nada na fila:

  1. as instâncias por status (só contagens) e a da nutri de teste NÃO está conectada;
  2. a página abre já logada, inteira (números, conexão desconectada, as 6 automáticas + o aviso do plano, o histórico), sem a faixa
     "fora do ar" (o celular de envio está batendo) e com o item "Mensagens" no menu;
  3. whatsapp_resumo e whatsapp_fila respondem pela sessão dela (a regra do banco);
  4. /whatsapp (a rota do Nutri) cai no Painel › Mensagens;
  5. contagens da fila e das instâncias iguais antes/depois.
(A prova da FILA em produção é o e2e/w22/fila.py --schema public — transação desfeita.)
Uso: python3 e2e/w22/prod.py --base https://physiqcalc.com.br
"""
from __future__ import annotations

import argparse
import json
import sys
import time
from pathlib import Path

sys.dont_write_bytecode = True
sys.path.insert(0, str(Path(__file__).parent))
import _base as B  # noqa: E402

from playwright.sync_api import sync_playwright  # noqa: E402

S = "public"
B.ESTADO["schema"] = S
p, q = B.p, B.q
CONTA = "nutri-legado"


def contagens() -> dict:
    return B.sql_principal(f"select (select count(*) from {S}.mensagens_whatsapp)::int fila, (select count(*) from {S}.whatsapp_instancias)::int inst, "
                           f"(select count(*) from {S}.mensagens_whatsapp where status in ('pendente','enviando'))::int pendentes")[0]


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--base", default="https://physiqcalc.com.br")
    a = ap.parse_args()
    base = a.base.rstrip("/")
    B.saude_ok("prod W22")
    st = B.instancias_por_status(S)
    print("instâncias por status (public):", json.dumps(st, ensure_ascii=False))
    u = B.uid(CONTA)
    tem = B.sql_principal(f"select status from {S}.whatsapp_instancias where nutricionista_id = {q(u)}")
    p.check(bool(tem) and tem[0]["status"] == "desconectado", f"1. a nutri de teste já tem a instância em produção e ela está desconectada ({tem})")
    B.garantir_seguro([CONTA])
    antes = contagens()
    with sync_playwright() as pw:
        nav = pw.chromium.launch(args=["--no-sandbox"])
        c = B.B5.Caso(nav, base, "prod", "prod-nutri", desktop=True)
        c.entrar(CONTA, "/painel/mensagens", zerar=False)
        c.fechar_avisos()
        ok = c.esperar(lambda: c.tem("[data-pagina-mensagens]") and c.pg.locator("[data-card-conexao]").get_attribute("data-whatsapp-carregando") == "0"
                       and c.tem("[data-card-disparos]:not([data-estado])") and c.pg.locator("[data-card-historico]").get_attribute("data-atualizando") == "0", 120)
        p.check(ok, "2. o Painel › Mensagens abre já logado e inteiro em produção")
        situ = c.pg.locator("[data-card-conexao]").get_attribute("data-whatsapp-situacao")
        p.check(situ in ("sem_numero", "desconectado"), f"2. conexão desconectada ({situ})")
        p.check(c.pg.locator("[data-disparo]").count() == 7 and c.tem("[data-kpis-mensagens]"), "2. os números, as 6 automáticas e o aviso do plano")
        p.check(not c.tem("[data-aviso-agente]"), "2. sem a faixa 'fora do ar' (o celular de envio está batendo)")
        p.check(c.tem('[data-nav="/painel/mensagens"]'), "2. o item Mensagens no menu")
        c.pg.wait_for_timeout(800)
        c.print("tela6_mensagens")
        c.ir("/whatsapp")
        p.check(c.esperar(lambda: c.caminho().startswith("/painel/mensagens"), 40), f"4. /whatsapp → {c.caminho()}")
        c.fim()
        nav.close()
    st_r, r = B.rpc(CONTA, "whatsapp_resumo", {"p_conta": None})
    p.check(st_r == 200 and isinstance(r, dict) and r.get("ok") is True, f"3. whatsapp_resumo pela sessão dela → {st_r}")
    if isinstance(r, dict) and r.get("agente_ping"):
        idade = time.time() - __import__("datetime").datetime.fromisoformat(r["agente_ping"].replace("Z", "+00:00")).timestamp()
        p.check(idade < 180, f"3. a última batida do celular de envio é recente ({idade:.0f} s)")
    st_f, f = B.rpc(CONTA, "whatsapp_fila", {"p_conta": None, "p_escopo": "meus", "p_filtro": "todas", "p_limite": 5})
    p.check(st_f == 200 and isinstance(f, dict) and f.get("ok") is True, f"3. whatsapp_fila pela sessão dela → {st_f} ({len((f or {}).get('itens') or [])} itens)")
    depois = contagens()
    p.check(antes["fila"] == depois["fila"] and antes["inst"] == depois["inst"], f"5. nada mudou: fila e instâncias iguais ({antes} × {depois})")
    return p.fim()


if __name__ == "__main__":
    sys.exit(main())
