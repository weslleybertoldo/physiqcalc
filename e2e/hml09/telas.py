#!/usr/bin/env python3
"""hml-09 (D7) — a conta "sem nada" (sem conta e sem matrícula) chega no "Excluir minha conta".

Antes do D7 o GateSemModulo mandava o /perfil de volta às Boas-vindas, e lá só havia "Sair": quem ainda não tinha nada não
conseguia excluir a conta (nem pelo app nem pela /excluir-conta → /perfil?excluir=1). Agora: Boas-vindas › "Excluir minha conta"
→ Perfil com o Excluir aberto.

Local (vite preview do build, http://localhost:8080 — as funções só aceitam as origens de dev 5173/8080) e staging: entra com uma
descartável da W7 (só tem staging) e força SÓ a resposta da minha_situacao para sem_nada = true (page.route). NADA é excluído: a
folha abre, a conferência (simular) fica pronta e o teste fecha a folha; no fim, o login continua e a sessão do teste sai
(logout scope=local). A exclusão de verdade de uma conta "sem nada" é a prova de produção (prova_prod.py tela).

Uso: python3 e2e/hml09/telas.py --base http://localhost:8080 --prefixo local [--conta excluir2]
     python3 e2e/hml09/telas.py --base https://physiqcalc-staging.vercel.app --prefixo staging
"""
from __future__ import annotations

import argparse
import importlib.util
import sys
from pathlib import Path

sys.dont_write_bytecode = True
_ESPEC = importlib.util.spec_from_file_location("_comum_hml09", Path(__file__).resolve().parent / "_comum.py")
C = importlib.util.module_from_spec(_ESPEC)
sys.modules["_comum_hml09"] = C
_ESPEC.loader.exec_module(C)  # type: ignore[union-attr]

B5 = C.B5
B5.ESTADO["schema"] = "staging"  # local e staging falam com o schema staging
B5.PRINTS = C.PRINTS  # prints/hml09


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--base", required=True)
    ap.add_argument("--prefixo", required=True, choices=("local", "staging"))
    ap.add_argument("--conta", default="excluir2", choices=("excluir1", "excluir2", "excluir3"))
    a = ap.parse_args()
    email = f"{a.conta}.teste.claude@physiqnutri.app"
    if not C.eh_email_de_teste(email):
        raise SystemExit(f"não é conta de teste: {email}")
    B5.CONTAS[a.conta] = (email, B5.senha_de(a.conta))
    o = C.Saida(f"telas_{a.prefixo}", parar=True)
    sess = C.Sessoes()
    login = lambda: C.ler(C.PRINCIPAL_REF, f"select count(*)::int as n from auth.users where lower(email) = {C.txt(email)}")[0]["n"]  # noqa: E731
    o.ok(login() == 1, f"a descartável {a.conta} existe (sem ela, rode e2e/w07/contas.py --so-descartaveis)")
    from playwright.sync_api import sync_playwright  # noqa: PLC0415

    with sync_playwright() as pw:
        nav = pw.chromium.launch(args=["--no-sandbox", "--disable-dev-shm-usage"])
        caso = None
        try:
            caso = B5.Caso(nav, a.base, a.prefixo, "d7", desktop=False)  # 390 px (celular)
            forcados = {"n": 0}

            def sem_nada(route) -> None:
                # a situação chega pela pos-login (1x por login: {situacao: {...}}) ou pela minha_situacao (o objeto direto)
                if route.request.method == "OPTIONS":
                    route.continue_()
                    return
                r = route.fetch()
                try:
                    corpo = r.json()
                except Exception:  # noqa: BLE001
                    route.fulfill(response=r)
                    return
                alvo = corpo.get("situacao") if isinstance(corpo, dict) and isinstance(corpo.get("situacao"), dict) else corpo
                if isinstance(alvo, dict) and "sem_nada" in alvo:
                    alvo["sem_nada"] = True
                    forcados["n"] += 1
                route.fulfill(response=r, json=corpo)

            caso.pg.route("**/rest/v1/rpc/minha_situacao*", sem_nada)
            caso.pg.route("**/functions/v1/pos-login*", sem_nada)
            sessao = caso.entrar(a.conta, "/privacidade")
            sess.guardar("principal", sessao["access_token"], f"{a.conta} (sessão injetada)")
            caso.ir("/")
            caso.fechar_avisos()
            caso.esperar(lambda: caso.caminho().startswith("/boas-vindas") and caso.tem("[data-boas-vindas-excluir]"), 60)
            o.ok(forcados["n"] > 0, f"a minha_situacao respondeu sem_nada (forçado {forcados['n']}×)")
            o.ok(caso.caminho().startswith("/boas-vindas") and caso.tem("[data-boas-vindas-excluir]"),
                 f"sem nada → Boas-vindas com o link 'Excluir minha conta' ({caso.caminho()})")
            caso.pg.locator("[data-boas-vindas-excluir]").first.scroll_into_view_if_needed()  # o link fica no fim da página
            o.linha(f"   print: {caso.print('d7_boas_vindas')}")
            caso.pg.locator("[data-boas-vindas-excluir]").first.click()
            folha = caso.pg.locator("[data-sheet-excluir]")

            def estado_folha() -> str:
                return (folha.first.get_attribute("data-estado-excluir") or "") if folha.count() else ""

            caso.esperar(lambda: caso.tem("[data-aba-perfil]") and estado_folha() not in ("", "conferindo"), 60)
            o.ok(caso.caminho().startswith("/perfil") and caso.tem("[data-aba-perfil]"), f"o link abriu o Perfil ({caso.caminho()})")
            o.ok(estado_folha() == "pronto", f"o Excluir abriu sozinho e a conferência ficou pronta ({estado_folha() or 'sem a folha'})")
            o.linha(f"   print: {caso.print('d7_perfil_excluir')}")
            caso.pg.keyboard.press("Escape")
            o.ok(caso.esperar(lambda: not caso.tem("[data-sheet-excluir]"), 10), "a folha fechou sem confirmar (nada foi excluído)")
            o.linha(f"   print: {caso.print('d7_perfil')}")
        finally:
            if caso is not None:
                try:
                    caso.fim()
                except Exception:  # noqa: BLE001
                    pass
            nav.close()
            sess.fechar(o)
    o.ok(login() == 1, f"o login da {a.conta} continua (só leitura)")
    graves = [t for bom, t in B5.p.itens if not bom]
    o.ok(not graves, f"sem erro de página ({graves[:2]})")
    return o.fim()


if __name__ == "__main__":
    raise SystemExit(main())
