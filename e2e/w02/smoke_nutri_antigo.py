#!/usr/bin/env python3
"""Physiq W2 — smoke do SITE ANTIGO do PhysiqNutri (nutri.physiqcalc.com.br / physiqnutri-staging.vercel.app) depois das
mudanças da W2 no banco principal (colunas, políticas e gatilho novos) e das funções republicadas a partir do physiqcalc.
Contexto limpo do Playwright, sessão da conta de teste injetada (nutri.teste.claude@physiqnutri.app, isenta).

  1. as páginas do consultório abrem sem erro (Dashboard, Pacientes, Agenda, Pré-consulta, Respostas, WhatsApp, Favoritos,
     Alimentos, Receitas, Diário, Financeiro, Impressos, Lixeira, Configurações);
  2. funções pelo navegador, na origem do Nutri: whatsapp-conectar (status) e mp-assinar (sincronizar) respondem 200;
  3. paciente de teste criado pela nutri + acesso (paciente_criar_acesso = INSERT direto no Auth com papel 'paciente'):
     o paciente entra em /app/entrar e vê o início e o plano; tudo é apagado no fim;
  4. --pessoa: uma conta NOVA sem papel (pessoa.teste.claude@physiqnutri.app, recriada a cada rodada) NÃO vira
     nutricionista com 14 dias: perfil 'pessoa', teste vencido, e o site antigo mostra a escolha do perfil e depois
     "Assinatura pendente".
Uso: python3 e2e/w02/smoke_nutri_antigo.py --url https://physiqnutri-staging.vercel.app --schema staging --prints <pasta> [--pessoa]
"""
import sys as _sys
_sys.exit("desativado na hml-06 (H-19, 08/10/2026): é de antes da virada W28 — o site antigo do Nutri redireciona para o Physiq "
          "desde 02/10/2026 e a mp-assinar foi desligada (410 migrado; a cobrança da conta é a cobranca-conta).")

import argparse
import json
import secrets
import sys
import time
from pathlib import Path

from playwright.sync_api import sync_playwright

sys.path.insert(0, str(Path(__file__).parent))
from _comum import PRINCIPAL_REF, PRINCIPAL_URL, Placar, anon, http, login_principal, service, sql_principal  # noqa: E402

CHAVE_LS = f"sb-{PRINCIPAL_REF}-auth-token"
PAGINAS = [
    ("/dashboard", "[data-pagina-dashboard]"), ("/pacientes", "[data-pagina-pacientes]"), ("/agenda", "[data-pagina-agenda]"),
    ("/pre-consulta", "[data-pagina-preconsulta]"), ("/respostas-pre-consulta", "[data-pagina-respostas-preconsulta]"),
    ("/whatsapp", "[data-pagina-whatsapp]"), ("/favoritos", "[data-pagina-favoritos]"), ("/alimentos", "[data-pagina-alimentos]"),
    ("/receitas", "[data-pagina-receitas]"), ("/diario", "[data-pagina-diario]"), ("/financeiro", "[data-pagina-financeiro]"),
    ("/impressos", "[data-pagina-impressos]"), ("/lixeira", "[data-pagina-lixeira]"), ("/configuracoes", "[data-pagina-configuracoes]"),
]
p = Placar()


def rest(metodo, caminho, token, schema, corpo=None):
    a = anon(PRINCIPAL_REF)
    cab = {"apikey": a, "Authorization": f"Bearer {token}", "Accept-Profile": schema, "Content-Profile": schema, "Prefer": "return=representation"}
    st, r, _ = http(metodo, f"{PRINCIPAL_URL}{caminho}", corpo, cab)
    return st, r


def injetar(pg, url, sessao):
    pg.goto(f"{url}/entrar/nutricionista", wait_until="domcontentloaded")
    pg.evaluate("([k, v]) => localStorage.setItem(k, v)", [CHAVE_LS, json.dumps(sessao)])


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--url", required=True)
    ap.add_argument("--schema", required=True, choices=["public", "staging"])
    ap.add_argument("--prints", required=True)
    ap.add_argument("--pessoa", action="store_true")
    a = ap.parse_args()
    url = a.url.rstrip("/")
    prints = Path(a.prints).expanduser()
    prints.mkdir(parents=True, exist_ok=True)
    rot = f"{a.schema}"

    sessao = login_principal("nutri", "nutri.teste.claude@physiqnutri.app")
    tn, nutri_id = sessao["access_token"], sessao["user"]["id"]
    erros: list[str] = []
    pid = None
    try:
        with sync_playwright() as pw:
            b = pw.chromium.launch(args=["--no-sandbox"])
            ctx = b.new_context(viewport={"width": 1280, "height": 860}, locale="pt-BR", timezone_id="America/Sao_Paulo")
            pg = ctx.new_page()
            pg.on("pageerror", lambda e: erros.append(f"pageerror: {str(e)[:160]}"))
            pg.on("console", lambda m: erros.append(f"console: {m.text[:160]}") if m.type == "error" and ("CORS" in m.text or "Failed to fetch" in m.text) else None)
            injetar(pg, url, sessao)

            # ---------- 1. páginas do consultório ----------
            for caminho, seletor in PAGINAS:
                pg.goto(f"{url}{caminho}", wait_until="domcontentloaded")
                try:
                    pg.wait_for_selector(seletor, timeout=45000)
                    ok = True
                except Exception:  # noqa: BLE001
                    ok = False
                p.check(ok, f"1. {caminho} abre ({seletor})")
                if caminho in ("/dashboard", "/pacientes", "/whatsapp", "/configuracoes"):
                    pg.wait_for_timeout(1200)
                    pg.screenshot(path=str(prints / f"{rot}_nutri{caminho.replace('/', '_')}.png"))

            # ---------- 2. funções pela origem do Nutri ----------
            r_wa = pg.evaluate("""async ([u, t, s]) => { const r = await fetch(u + '/functions/v1/whatsapp-conectar', {method: 'POST',
                headers: {'Authorization': 'Bearer ' + t, 'Content-Type': 'application/json', 'x-schema': s}, body: JSON.stringify({acao: 'status'})});
                return [r.status, await r.text()]; }""", [PRINCIPAL_URL, tn, a.schema])
            p.check(r_wa[0] == 200 and '"instancia"' in r_wa[1], f"2. whatsapp-conectar (status) pelo navegador → {r_wa[0]}")
            r_mp = pg.evaluate("""async ([u, t, s]) => { const r = await fetch(u + '/functions/v1/mp-assinar', {method: 'POST',
                headers: {'Authorization': 'Bearer ' + t, 'Content-Type': 'application/json', 'x-schema': s}, body: JSON.stringify({acao: 'sincronizar'})});
                return [r.status, await r.text()]; }""", [PRINCIPAL_URL, tn, a.schema])
            p.check(r_mp[0] == 200 and '"assinatura"' in r_mp[1], f"2. mp-assinar (sincronizar) pelo navegador → {r_mp[0]} {r_mp[1][:60]}")

            # ---------- 3. paciente de teste + acesso + área do paciente ----------
            email_p = f"smoke-w02-{int(time.time())}.teste.claude@physiqnutri.app"
            senha_p = secrets.token_urlsafe(14)
            st, pac = rest("POST", "/rest/v1/pacientes", tn, a.schema, {"nome": "Smoke W2 Paciente", "nutricionista_id": nutri_id, "email": email_p})
            p.check(st == 201, f"3. nutri cria paciente pelo REST ({a.schema}) → {st}")
            if st == 201:
                pid = pac[0]["id"]
                st, _ = rest("POST", "/rest/v1/rpc/paciente_criar_acesso", tn, a.schema, {"p_paciente_id": pid, "p_email": email_p, "p_senha": senha_p})
                p.check(st == 200, f"3. paciente_criar_acesso → {st}")
                papel = sql_principal(f"select p.role as pub, s.role as stg from public.profiles p join staging.profiles s on s.id = p.id "
                                      f"join auth.users u on u.id = p.id where u.email = '{email_p}'")
                p.check(papel == [{"pub": "paciente", "stg": "paciente"}], f"3. o gatilho deu papel 'paciente' nos 2 schemas: {papel}")
                pg.goto(f"{url}/pacientes/{pid}/perfil", wait_until="domcontentloaded")
                try:
                    pg.wait_for_selector(f"[data-pagina-paciente='{pid}']", timeout=45000)
                    ok = True
                except Exception:  # noqa: BLE001
                    ok = False
                p.check(ok, "3. prontuário do paciente abre")
                pg.screenshot(path=str(prints / f"{rot}_nutri_paciente.png"))
                ctx2 = b.new_context(viewport={"width": 390, "height": 844}, locale="pt-BR", timezone_id="America/Sao_Paulo")
                pp = ctx2.new_page()
                pp.on("pageerror", lambda e: erros.append(f"pageerror(paciente): {str(e)[:160]}"))
                pp.goto(f"{url}/app/entrar", wait_until="domcontentloaded")
                pp.wait_for_selector("[data-pagina-entrar-paciente]", timeout=45000)
                pp.fill("[data-campo-entrar-email]", email_p)
                pp.fill("[data-campo-entrar-senha]", senha_p)
                pp.click("[data-btn-entrar-paciente]")
                try:
                    pp.wait_for_selector("[data-app-inicio]", timeout=45000)
                    ok = True
                except Exception:  # noqa: BLE001
                    ok = False
                p.check(ok, "3. o paciente entra com e-mail e senha e vê o início (/app)")
                pp.screenshot(path=str(prints / f"{rot}_paciente_inicio.png"))
                pp.goto(f"{url}/app/plano", wait_until="domcontentloaded")
                try:
                    pp.wait_for_selector("[data-app-plano]", timeout=45000)
                    ok = True
                except Exception:  # noqa: BLE001
                    ok = False
                p.check(ok, "3. o paciente abre o plano (/app/plano)")
                ctx2.close()

            # ---------- 4. conta nova sem papel não vira nutricionista ----------
            if a.pessoa:
                email_x = "pessoa.teste.claude@physiqnutri.app"
                sp = service(PRINCIPAL_REF)
                cab = {"apikey": sp, "Authorization": f"Bearer {sp}"}
                antigo = sql_principal(f"select id from auth.users where email = '{email_x}'")
                if antigo:
                    http("DELETE", f"{PRINCIPAL_URL}/auth/v1/admin/users/{antigo[0]['id']}", None, cab)
                senha_x = secrets.token_urlsafe(18)
                arq = Path.home() / ".physiq-teste-pessoa"
                arq.write_text(senha_x, encoding="utf-8")
                arq.chmod(0o600)
                st, u, _ = http("POST", f"{PRINCIPAL_URL}/auth/v1/admin/users",
                                {"email": email_x, "password": senha_x, "email_confirm": True, "user_metadata": {"full_name": "Pessoa Teste Claude"}}, cab)
                p.check(st == 200, f"4. conta nova sem papel criada no Auth do principal → {st}")
                perf = sql_principal(f"select p.role as pub, s.role as stg, (p.teste_ate <= now() + interval '1 minute') as sem_teste_pub, "
                                     f"(s.teste_ate <= now() + interval '1 minute') as sem_teste_stg from public.profiles p "
                                     f"join staging.profiles s on s.id = p.id where p.id = '{u['id']}'")
                p.check(perf == [{"pub": "pessoa", "stg": "pessoa", "sem_teste_pub": True, "sem_teste_stg": True}],
                        f"4. perfil 'pessoa' e SEM teste de 14 dias nos 2 schemas: {perf}")
                sx = http("POST", f"{PRINCIPAL_URL}/auth/v1/token?grant_type=password", {"email": email_x, "password": senha_x}, {"apikey": anon(PRINCIPAL_REF)})[1]
                ctx3 = b.new_context(viewport={"width": 1280, "height": 860}, locale="pt-BR", timezone_id="America/Sao_Paulo")
                px = ctx3.new_page()
                injetar(px, url, sx)
                px.goto(f"{url}/dashboard", wait_until="domcontentloaded")
                px.wait_for_selector("[data-pagina-escolha-tipo], [data-consultorio-bloqueado], [data-pagina-dashboard]", timeout=45000)
                viu_dashboard_direto = px.locator("[data-pagina-dashboard]").count() > 0 and px.locator("[data-consultorio-bloqueado]").count() == 0
                p.check(not viu_dashboard_direto, "4. a conta nova não cai no Dashboard do consultório")
                if px.locator("[data-pagina-escolha-tipo]").count():
                    px.screenshot(path=str(prints / f"{rot}_pessoa_escolha.png"))
                    px.click("[data-opcao-tipo='nutricionista']")
                    px.click("[data-btn-continuar]")
                try:
                    px.wait_for_selector("[data-consultorio-bloqueado]", timeout=45000)
                    ok = True
                except Exception:  # noqa: BLE001
                    ok = False
                sit = px.get_attribute("[data-consultorio-bloqueado]", "data-assinatura-situacao") if ok else None
                p.check(ok, f"4. o site antigo mostra 'Assinatura pendente' (situação {sit}) — sem acesso a nada")
                px.screenshot(path=str(prints / f"{rot}_pessoa_assinatura_pendente.png"))
                ctx3.close()
            b.close()
    finally:
        if pid:
            rest("POST", "/rest/v1/rpc/paciente_remover_acesso", tn, a.schema, {"p_paciente_id": pid})
            st, _ = rest("DELETE", f"/rest/v1/pacientes?id=eq.{pid}", tn, a.schema)
            p.check(st in (200, 204), f"limpeza: paciente de teste apagado → {st}")
        # a linha do WhatsApp que o 'status' cria na 1ª visita é da conta de teste; fica (é o que o site faz ao abrir a aba)
    p.check(not erros, f"sem erro de página nem de CORS no navegador ({erros[:3]})")
    return p.fim()


if __name__ == "__main__":
    sys.exit(main())
