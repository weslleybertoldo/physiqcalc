#!/usr/bin/env python3
"""Physiq W28 — prova do redirecionamento do site antigo do Nutri (passo 8 / item 3 do brief), DEPOIS de o domínio
nutri.physiqcalc.com.br passar para o projeto physiqcalc da Vercel (vercel.json: 308 → https://physiqcalc.com.br/<caminho>?origem=nutri).

  1. HTTP (sem seguir): 308 + Location certo para a raiz, /d/, /f/, /c/, /p/, uma rota do consultório, a de Configurações›Assinatura,
     uma rota inexistente e uma com query (a query de origem vai junto, e o origem=nutri entra);
  2. navegador (celular, contexto limpo): cada uma termina na tela certa do Physiq (nunca "Página não encontrada") e com
     "O PhysiqNutri agora é o Physiq" (ou a faixa leve nas páginas públicas);
  3. o # da recuperação de senha sobrevive ao 308 (o navegador mantém o fragmento);
  4. link de e-mail antigo com redirect_to no nutri. (gerado pela API admin para uma conta de TESTE — nenhum e-mail sai) ainda
     abre: o Auth aceita o redirect_to e o 308 leva ao Physiq com o token no #.
Códigos públicos FICTÍCIOS (teste-w28): nada de dado de cliente. A raiz deslogada vai para /entrar (rota do app) e o cliente
PKCE não lê token do # — por isso o passo 3 confere a URL que CHEGA ao Physiq (framenavigated), não a final.
Uso: python3 e2e/w28/massa.py (cria a conta de teste do passo 4) && python3 e2e/w28/redirecionamento.py [--prints];
no fim, python3 e2e/w28/massa.py --limpar.
"""
from __future__ import annotations

import sys
import urllib.parse
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "w02"))
from _comum import PRINCIPAL_REF, PRINCIPAL_URL, Placar, http, service  # noqa: E402

p = Placar()
NUTRI = "https://nutri.physiqcalc.com.br"
PHYSIQ = "https://physiqcalc.com.br"
PRINTS = Path.home() / "projetos" / "physiqcalc-scratch" / "prints" / "w28"
CONTA_TESTE = "w28.nutri.teste.teste.claude@physiqnutri.app"

# (caminho antigo + query, caminho esperado no Physiq depois do 308, o que a tela final tem que ser)
CASOS = [
    ("/", "/", "inicio"),
    ("/d/teste-w28", "/d/teste-w28", "publica"),
    ("/f/teste-w28", "/f/teste-w28", "publica"),
    ("/c/teste-w28", "/c/teste-w28", "publica"),
    ("/p/teste-w28", "/p/teste-w28", "publica"),
    ("/pacientes", "/pacientes", "painel"),
    ("/dashboard/agenda-antiga", "/dashboard/agenda-antiga", "painel"),
    ("/configuracoes?aba=assinatura", "/configuracoes", "painel"),
    ("/app/plano", "/app/plano", "app"),
    ("/uma-rota-que-o-nutri-nao-tinha", "/uma-rota-que-o-nutri-nao-tinha", "inicio"),
    ("/f/teste-w28?ref=whatsapp&x=1", "/f/teste-w28", "publica"),
]


def caso_http() -> None:
    print("\n== 1. HTTP (sem seguir o redirecionamento)")
    for antigo, novo, _ in CASOS:
        st, _, cab = http("GET", f"{NUTRI}{antigo}", None, {}, seguir=False)
        loc = cab.get("Location") or cab.get("location") or ""
        u = urllib.parse.urlsplit(loc)
        q = urllib.parse.parse_qs(u.query)
        q_antiga = urllib.parse.parse_qs(urllib.parse.urlsplit(antigo).query)
        ok = (st == 308 and f"{u.scheme}://{u.netloc}" == PHYSIQ and u.path == novo and q.get("origem") == ["nutri"]
              and all(q.get(k) == v for k, v in q_antiga.items()))
        p.check(ok, f"{antigo:42s} → {st} {loc}")


def caso_navegador(prints: bool) -> None:
    from playwright.sync_api import sync_playwright
    print("\n== 2. navegador (celular, contexto limpo, sem login)")
    with sync_playwright() as pw:
        nav = pw.chromium.launch(args=["--no-sandbox"])
        for antigo, novo, tipo in CASOS:
            ctx = nav.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=3.4, is_mobile=True, has_touch=True,
                                  locale="pt-BR", timezone_id="America/Sao_Paulo", service_workers="block")
            pg = ctx.new_page()
            try:
                pg.goto(f"{NUTRI}{antigo}", wait_until="domcontentloaded", timeout=60000)
                tela = "[data-faixa-nutri]" if tipo == "publica" else "[data-boas-vindas-nutri]"
                try:
                    pg.wait_for_selector(tela, timeout=25000)
                    viu = True
                except Exception:  # noqa: BLE001
                    viu = False
                u = urllib.parse.urlsplit(pg.url)
                nao_encontrada = pg.locator("[data-nao-encontrada]").count() > 0
                p.check(u.netloc == "physiqcalc.com.br" and viu and not nao_encontrada and "origem=nutri" not in pg.url,
                        f"{antigo:42s} → {u.path}{('?' + u.query) if u.query else ''} ({tipo}{'' if viu else ', SEM a tela do Nutri'}{', NÃO ENCONTRADA' if nao_encontrada else ''})")
                if prints and antigo in ("/", "/d/teste-w28", "/uma-rota-que-o-nutri-nao-tinha"):
                    PRINTS.mkdir(parents=True, exist_ok=True)
                    nome = {"/": "raiz", "/d/teste-w28": "diario", "/uma-rota-que-o-nutri-nao-tinha": "inexistente"}[antigo]
                    pg.wait_for_timeout(800)
                    pg.screenshot(path=str(PRINTS / f"prod_app_redirecionamento_{nome}.png"))
            finally:
                ctx.close()

        print("\n== 3. o # da recuperação de senha sobrevive ao 308 (o navegador mantém o fragmento)")
        for caminho in ("/", "/d/teste-w28"):
            ctx = nav.new_context(viewport={"width": 390, "height": 844}, service_workers="block")
            pg = ctx.new_page()
            vistas: list[str] = []
            pg.on("framenavigated", lambda f: vistas.append(f.url) if f == pg.main_frame else None)
            pg.goto(f"{NUTRI}{caminho}#access_token=w28teste&refresh_token=x&type=recovery", wait_until="domcontentloaded", timeout=60000)
            pg.wait_for_timeout(1500)
            chegou = next((u for u in vistas if u.startswith(PHYSIQ)), "")
            p.check("#access_token=w28teste" in chegou, f"{caminho} → o Physiq recebe a URL com o # ({chegou[:80]})")
            if caminho != "/":
                p.check("#access_token=w28teste" in pg.url, f"{caminho}: a página pública fica com o # ({pg.url[:70]})")
            else:
                # deslogado, o Physiq manda "/" para "/entrar" (rota própria do app) e o cliente PKCE não usa token no # (de propósito)
                print(f"   (raiz: o app leva quem está deslogado para {pg.url.split('#')[0][len(PHYSIQ):] or '/'}; o login segue pela tela de entrar)")
            ctx.close()

        print("\n== 4. link de e-mail antigo (redirect_to no nutri.) ainda abre")
        sk = service(PRINCIPAL_REF)
        st, r, _ = http("POST", f"{PRINCIPAL_URL}/auth/v1/admin/generate_link",
                        {"type": "recovery", "email": CONTA_TESTE, "redirect_to": f"{NUTRI}/"}, {"apikey": sk, "Authorization": f"Bearer {sk}"})
        link = (r or {}).get("action_link") if isinstance(r, dict) else None
        p.check(st == 200 and bool(link), f"link de recuperação gerado para a conta de TESTE (sem e-mail) ({st})")
        if link:
            ctx = nav.new_context(viewport={"width": 390, "height": 844}, service_workers="block")
            pg = ctx.new_page()
            vistas2: list[str] = []
            pg.on("framenavigated", lambda f: vistas2.append(f.url) if f == pg.main_frame else None)
            pg.goto(link, wait_until="domcontentloaded", timeout=60000)
            pg.wait_for_timeout(2500)
            chegou = next((u for u in vistas2 if u.startswith(PHYSIQ)), "")
            p.check(bool(chegou) and "access_token=" in chegou, f"o Auth aceita o redirect_to do nutri. e o 308 leva ao Physiq com o token no # ({chegou[:50]}…)")
            try:
                pg.wait_for_selector("[data-boas-vindas-nutri]", timeout=20000)
                p.check(True, "com 'O PhysiqNutri agora é o Physiq' (entrar com o mesmo e-mail e senha)")
            except Exception:  # noqa: BLE001
                p.check(False, "com 'O PhysiqNutri agora é o Physiq'")
            ctx.close()
        nav.close()


if __name__ == "__main__":
    caso_http()
    caso_navegador("--prints" in sys.argv)
    sys.exit(p.fim())
