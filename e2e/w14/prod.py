#!/usr/bin/env python3
"""Physiq W14 — smoke de PRODUÇÃO (https://physiqcalc.com.br, schema public), SÓ LEITURA.

  painel   a conta de teste do Calc (admin.teste.claude, dona da "Admin Teste") abre o aluno dela: cabeçalho da tela 7
           (Mensagem, Nova avaliação, ⋯, linha e chips) e os cards novos do Resumo — nada é clicado que grave
  app      o aluno de teste do Calc (teste@teste.com) abre o app normalmente: a P15 não fechou o acesso de quem tem login
  p        /p/abc abre o /d/ do site antigo (a página do diário) — F1
  versao   o site mostra a versão esperada (--versao, ex. 3.17)
Uso: python3 e2e/w14/prod.py [--versao 3.17]
"""
from __future__ import annotations

import argparse
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import _base as B  # noqa: E402
from playwright.sync_api import sync_playwright  # noqa: E402

S = "public"
B.ESTADO["schema"] = S
p = B.p
BASE = "https://physiqcalc.com.br"


def texto(c, sel: str) -> str:
    try:
        loc = c.pg.locator(sel).first
        return loc.inner_text(timeout=3000).strip() if loc.count() else ""
    except Exception:  # noqa: BLE001
        return ""


def foto(c, nome: str) -> str:
    try:
        c.pg.mouse.move(5, 5)
    except Exception:  # noqa: BLE001
        pass
    return c.print(nome)


def painel(nav) -> None:
    aluno = B.sql_principal("""select coalesce(p.treino_user_id, p.id)::text as rota, p.id::text as id from public.pacientes p
                                 join public.contas c on c.id = p.conta_id
                                where c.dono_id = (select id from auth.users where email = 'admin.teste.claude@physiqcalc.app')
                                  and p.deleted_at is null order by p.created_at limit 1""")
    if not p.check(bool(aluno), "[painel] a conta de teste tem 1 aluno para abrir"):
        return
    rota = aluno[0]["rota"]
    c = B.Caso(nav, BASE, "prod", "painel")
    try:
        c.entrar("master", f"/painel/alunos/{rota}", zerar=False)
        c.fechar_avisos()
        ok = c.esperar(lambda: c.tem("[data-cabecalho-w14] [data-cabecalho-nome]") and c.tem("[data-card-dados-aluno]"), 90)
        p.check(ok, "[painel] o perfil do aluno abre com o cabeçalho novo e o card Dados do aluno")
        p.check(c.tem("[data-acao-mensagem]") and c.tem("[data-menu-perfil]"), "[painel] Mensagem e ⋯ no topo (tela 7)")
        p.check(all(c.tem(s) for s in ("[data-card-acesso-aluno]", "[data-card-ajustes-aluno]", "[data-card-resumo-privado]")),
                "[painel] cards Acesso, Ajustes e Resumo privado")
        p.check(not c.tem("[data-fallback-aluno]"), "[painel] o \"Dados\" antigo saiu do Resumo")
        ligado = c.pg.locator('[data-ajuste="acesso_app"]').get_attribute("data-ajuste-ligado") if c.tem('[data-ajuste="acesso_app"]') else None
        p.check(ligado == "1", f"[painel] P15: o aluno com login está com o \"Acesso ao app\" LIGADO ({ligado})")
        c.pg.wait_for_timeout(1500)
        foto(c, "resumo_topo")
        c.pg.locator("[data-card-ajustes-aluno]").scroll_into_view_if_needed()
        c.pg.wait_for_timeout(700)
        foto(c, "resumo_cards")
    finally:
        c.fim()


def app(nav) -> None:
    B.saude_ok("app de produção")
    a = B.Caso(nav, BASE, "prod", "app", desktop=False)
    try:
        a.entrar("aluno-calc", "/", zerar=False)
        a.fechar_avisos()
        ok = a.esperar(lambda: a.tem("[data-aba-inicio]") or a.tem("[data-trava-app]"), 90)
        trava = a.pg.locator("[data-trava-app]").first.get_attribute("data-trava-app") if a.tem("[data-trava-app]") else None
        p.check(ok and trava != "acesso-app-desligado", f"[app] teste@teste.com abre o app (sem a trava do acesso ao app — P15) ({trava or 'Início'})")
        foto(a, "app_inicio")
    finally:
        a.fim()


def link_antigo(nav) -> None:
    d = B.Caso(nav, BASE, "prod", "p_abc")
    try:
        d.ir("/p/abc")
        ok = d.esperar(lambda: d.pg.url.rstrip("/").endswith("nutri.physiqcalc.com.br/d/abc"), 60)
        p.check(ok, f"[/p/] /p/abc abre o diário do site antigo ({d.pg.url})")
        p.check(d.esperar(lambda: "LINK NÃO ENCONTRADO" in d.texto().upper(), 30), "[/p/] é a página do diário (código que não existe)")
        foto(d, "p_abc")
    finally:
        d.ctx.close()


def versao(esperada: str | None) -> None:
    import re
    import urllib.request
    html = urllib.request.urlopen(urllib.request.Request(BASE + "/", headers={"User-Agent": "physiq-e2e-w14"}), timeout=30).read().decode()
    js = re.findall(r"assets/index-[A-Za-z0-9_-]+\.js", html)
    corpo = urllib.request.urlopen(urllib.request.Request(f"{BASE}/{js[0]}", headers={"User-Agent": "physiq-e2e-w14"}), timeout=60).read().decode() if js else ""
    tem_w14 = "Cabecalho-" in corpo and "LinkAntigo-" in corpo
    p.check(tem_w14, f"[site] o bundle de produção tem os chunks da W14 ({js[:1]})")
    if esperada:
        # a versão aparece nas telas que a mostram (Aplicativo, aviso de atualização, Entrar, Perfil) — chunks sob demanda
        achou: set[str] = set()
        for chunk in sorted(set(re.findall(r"(?:Aplicativo|AvisoAtualizacao|Entrar|Perfil)-[A-Za-z0-9_-]+\.js", corpo))):
            txt = urllib.request.urlopen(urllib.request.Request(f"{BASE}/assets/{chunk}", headers={"User-Agent": "physiq-e2e-w14"}), timeout=60).read().decode()
            achou |= set(re.findall(r'"(3\.\d+)"', txt))
        maior, menor = esperada.split(".")
        seguinte = f"{maior}.{int(menor) + 1}"
        p.check(esperada in achou and seguinte not in achou, f"[site] versão {esperada} nas telas e nenhuma {seguinte} ({sorted(achou)})")


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--versao")
    ap.add_argument("--casos", default="versao,painel,app,p")
    a = ap.parse_args()
    casos = [x.strip() for x in a.casos.split(",") if x.strip()]
    if "versao" in casos:
        versao(a.versao)
    with sync_playwright() as pw:
        nav = pw.chromium.launch(args=["--no-sandbox", "--disable-dev-shm-usage"])
        for nome, f in (("painel", painel), ("app", app), ("p", link_antigo)):
            if nome not in casos:
                continue
            print(f"\n── {nome} ──", flush=True)
            if not B.saude_treino():
                p.check(False, f"{nome}: Banco do Treino lento/instável — parei (nada de restart)")
                break
            try:
                f(nav)
            except SystemExit:
                raise
            except Exception as e:  # noqa: BLE001
                p.check(False, f"{nome}: exceção {type(e).__name__}: {str(e)[:300]}")
            time.sleep(8)
        nav.close()
    return p.fim()


if __name__ == "__main__":
    sys.exit(main())
