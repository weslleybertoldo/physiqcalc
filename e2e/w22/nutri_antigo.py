#!/usr/bin/env python3
"""Physiq W22 — o WhatsApp do SITE ANTIGO do PhysiqNutri (/whatsapp) lado a lado com o Painel › Mensagens do Physiq, com a MESMA nutri de
teste (nutri.teste.claude, legado_nutri): a mesma instância (status), o mesmo número, a mesma config das automáticas (interruptor geral,
momentos ligados, horário e o texto da véspera) e o mesmo histórico (o site antigo mostra as 10 últimas automáticas — sem o teste).
Só LÊ: nada é clicado que grave (o texto é aberto e fechado sem salvar). No staging a massa (e2e/w22/massa.py) põe 3 mensagens e a config.
Uso: python3 e2e/w22/nutri_antigo.py --url https://physiqnutri-staging.vercel.app --base http://localhost:5173 --schema staging --prefixo local
     (produção: --url https://nutri.physiqcalc.com.br --base https://physiqcalc.com.br --schema public --prefixo prod)
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

sys.dont_write_bytecode = True
sys.path.insert(0, str(Path(__file__).parent))
import _base as B  # noqa: E402

from playwright.sync_api import sync_playwright  # noqa: E402

p, q = B.p, B.q
CHAVE_LS_NUTRI = f"sb-{B.PRINCIPAL_REF}-auth-token"


def esperar(pg, cond_js: str, timeout: float = 60) -> bool:
    try:
        pg.wait_for_function(cond_js, timeout=timeout * 1000)
        return True
    except Exception:  # noqa: BLE001
        return False


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--url", required=True, help="o site antigo do Nutri")
    ap.add_argument("--base", required=True, help="o Physiq")
    ap.add_argument("--schema", required=True, choices=["public", "staging"])
    ap.add_argument("--prefixo", required=True)
    a = ap.parse_args()
    S = a.schema
    B.ESTADO["schema"] = S
    antigo, physiq = a.url.rstrip("/"), a.base.rstrip("/")
    B.saude_ok("nutri antigo W22")
    B.garantir_seguro(["nutri-legado"])
    erros: list[str] = []
    sess = B.sessao("nutri-legado")
    with sync_playwright() as pw:
        nav = pw.chromium.launch(args=["--no-sandbox"])
        # 1. o site antigo
        ctx = nav.new_context(viewport={"width": 1280, "height": 883}, device_scale_factor=2, locale="pt-BR", timezone_id="America/Sao_Paulo")
        pa = ctx.new_page()
        pa.on("pageerror", lambda e: erros.append(f"antigo: {str(e)[:160]}"))
        pa.goto(f"{antigo}/entrar/nutricionista", wait_until="domcontentloaded")
        pa.evaluate("([k, v]) => localStorage.setItem(k, v)", [CHAVE_LS_NUTRI, json.dumps(sess)])
        pa.goto(f"{antigo}/whatsapp", wait_until="domcontentloaded")
        ok = esperar(pa, "() => { const e = document.querySelector('[data-pagina-whatsapp]'); return e && e.getAttribute('data-whatsapp-carregando') === '0'; }", 90)
        p.check(ok, "1. o site antigo abre o /whatsapp da nutri")
        pa.wait_for_timeout(2500)  # o histórico é acessório: chega depois
        velho = pa.evaluate("""() => ({
            conexao: document.querySelector('[data-pagina-whatsapp]')?.getAttribute('data-whatsapp-conexao'),
            numero: document.querySelector('[data-numero-whatsapp]')?.getAttribute('data-numero-whatsapp') || '',
            geral: !!document.querySelector('[data-toggle-geral]')?.checked,
            momentos: [...document.querySelectorAll('[data-toggle-disparo]')].filter(i => i.checked).map(i => i.getAttribute('data-toggle-disparo')).sort(),
            horario: document.querySelector('[data-select-horario]')?.value,
            historico: [...document.querySelectorAll('[data-historico-item]')].map(li => (li.getAttribute('data-historico-item') + ':' + (li.querySelector('[data-status-msg]')?.getAttribute('data-status-msg') || ''))).sort(),
        })""")
        pa.locator('[data-btn-texto="lembrete_vespera"]').click()
        pa.wait_for_timeout(500)
        velho["vespera"] = pa.locator('[data-textarea="lembrete_vespera"]').input_value().strip()
        pa.screenshot(path=str(B.PRINTS / f"{a.prefixo}_nutri_antigo_whatsapp.png"))
        ctx.close()
        # 2. o Physiq, a mesma nutri
        c = B.B5.Caso(nav, physiq, a.prefixo, "antigo-physiq", desktop=True)
        c.entrar("nutri-legado", "/painel/mensagens")
        c.fechar_avisos()
        ok = c.esperar(lambda: c.tem("[data-pagina-mensagens]") and c.pg.locator("[data-card-conexao]").get_attribute("data-whatsapp-carregando") == "0"
                       and c.tem("[data-card-disparos]:not([data-estado])") and c.pg.locator("[data-card-historico]").get_attribute("data-atualizando") == "0", 90)
        p.check(ok, "2. o Physiq abre o Painel › Mensagens da mesma nutri")
        c.pg.wait_for_timeout(1500)
        novo = c.pg.evaluate("""() => ({
            conexao: document.querySelector('[data-card-conexao]')?.getAttribute('data-whatsapp-conexao'),
            numero: document.querySelector('[data-numero-whatsapp]')?.getAttribute('data-numero-whatsapp') || '',
            geral: document.querySelector('[data-toggle-geral]')?.getAttribute('aria-checked') === 'true',
            momentos: [...document.querySelectorAll('[data-toggle-disparo]')].filter(b => b.getAttribute('aria-checked') === 'true').map(b => b.getAttribute('data-toggle-disparo')).sort(),
            horario: document.querySelector('[data-select-horario]')?.value,
            historico: [...document.querySelectorAll('[data-mensagem]')].filter(li => li.getAttribute('data-mensagem-tipo') !== 'teste')
              .map(li => (li.getAttribute('data-mensagem-tipo') + ':' + li.getAttribute('data-mensagem-status'))).sort().slice(0, 10),
        })""")
        c.pg.locator('[data-btn-texto="lembrete_vespera"]').click()
        c.esperar(lambda: c.tem('[data-textarea="lembrete_vespera"]'), 10)
        novo["vespera"] = c.pg.locator('[data-textarea="lembrete_vespera"]').input_value().strip()
        c.pg.keyboard.press("Escape")
        c.pg.wait_for_timeout(500)
        c.print("nutri_antigo_physiq_mensagens")
        c.fim()
        nav.close()
    for k, rot in (("conexao", "a mesma instância (status)"), ("numero", "o mesmo número"), ("geral", "o mesmo interruptor geral"),
                   ("momentos", "os mesmos momentos ligados"), ("horario", "o mesmo horário"), ("vespera", "o mesmo texto da véspera"),
                   ("historico", "o mesmo histórico (sem o teste)")):
        p.check(velho.get(k) == novo.get(k), f"3. {rot}: antigo {velho.get(k)!r} = Physiq {novo.get(k)!r}")
    p.check(not erros, f"sem erro de página no site antigo ({erros[:3]})")
    return p.fim()


if __name__ == "__main__":
    sys.exit(main())
