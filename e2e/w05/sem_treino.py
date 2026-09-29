#!/usr/bin/env python3
"""Physiq W5 — o painel SEM a conexão com o Treino (correção herdada da W4). A troca de token é simulada no navegador
(Playwright intercepta a chamada da trocar-token — nada muda no servidor e o limite de verdade não é tocado):

  limite   a trocar-token responde 429 (limite de 20/h): Configurações abre inteira (Plano, Perfil, Conta, Equipe, Convite,
           Aplicativo); as páginas do Treino mostram "Sem conexão com o Treino" com "Tentar de novo"; nenhuma nova tentativa
           sozinha (nem depois de recarregar a página); tirando a falha, "Tentar de novo" abre a página do Treino
  fora     o Treino fora do ar (503): no máximo 2 tentativas sozinhas, com espera; Configurações segue abrindo
  rede     sem rede até o Treino (a chamada cai): o painel abre e o estado aparece; volta sozinho quando a rede volta
  aluno    aluno com a troca em 429: a aba Treino mostra "Não foi possível abrir seu treino" + "Tentar de novo" (sem loop)

Uso: python3 e2e/w05/sem_treino.py --base http://localhost:5173 --prefixo local [--casos limite,fora,rede,aluno]
"""
from __future__ import annotations

import argparse
import sys
import time
from pathlib import Path

from playwright.sync_api import sync_playwright

sys.path.insert(0, str(Path(__file__).parent))
import _base as B  # noqa: E402

p = B.p
CORS = {"access-control-allow-origin": "*", "access-control-allow-headers": "authorization, x-client-info, apikey, content-type, x-schema",
        "access-control-allow-methods": "POST, OPTIONS", "content-type": "application/json"}
ABAS_PRINCIPAL = ["perfil", "conta", "equipe", "plano", "convite", "aplicativo"]


def interceptar(c: B.Caso, modo: str) -> None:
    """Faz a trocar-token falhar do jeito pedido (só neste contexto do navegador)."""
    def tratar(route) -> None:
        if route.request.method == "OPTIONS":
            route.fulfill(status=200, headers=CORS, body="ok")
            return
        if modo == "limite":
            route.fulfill(status=429, headers=CORS, body='{"error":"rate_limited"}')
        elif modo == "fora":
            route.fulfill(status=503, headers=CORS, body='{"error":"indisponivel"}')
        else:
            route.abort("internetdisconnected")
    c.ctx.route("**/functions/v1/trocar-token", tratar)


# o que prova que a aba abriu (a do Plano é da W4: as marcas dela)
MARCA_ABA = {"plano": "[data-plano-conta], [data-plano-legado], [data-plano-isento]"}


def abas_config_abrem(c: B.Caso, esperado: list[str]) -> None:
    for aba in esperado:
        c.pg.locator(f"[data-aba-config='{aba}']").click()
        marca = MARCA_ABA.get(aba, f"[data-config-aba='{aba}']:not([data-estado-aba='erro'])")
        ok = c.esperar(lambda: c.caminho().startswith(f"/painel/configuracoes/{aba}") and c.tem(marca), 60)
        p.check(ok and not c.tem("[data-sem-treino]") and not c.tem("[data-carregando-tela]"), f"Configurações › {aba} abre sem o Treino")


def caso_limite(nav, a) -> None:
    c = B.Caso(nav, a.base, a.prefixo, "sem-treino-limite")
    interceptar(c, "limite")
    c.entrar("w5-dono", "/painel/configuracoes/plano")
    c.fechar_avisos()
    p.check(c.esperar(lambda: c.tem("[data-plano-conta]"), 90), "com a troca em 429, Configurações › Plano abre (cobrança do principal)")
    p.check(not c.tem("[data-troca-painel]") and not c.tem("[data-carregando-tela]"), "o painel NÃO trava inteiro (sem a tela de erro no lugar de tudo)")
    p.check(c.tem("[data-card-plano]") and c.tem("[data-aba-config='equipe']"), "menu, card do plano e abas das Configurações na tela")
    c.print("sem_treino_plano")
    abas_config_abrem(c, ABAS_PRINCIPAL)
    c.pg.locator("a[href='/painel/alunos']").first.click()
    p.check(c.esperar(lambda: c.tem("[data-sem-treino='limite']"), 60), "página do Treino (Alunos): 'Sem conexão com o Treino'")
    txt = c.pg.locator("[data-sem-treino]").inner_text() if c.tem("[data-sem-treino]") else ""
    p.check("Sem conexão com o Treino" in txt and "Muitas tentativas" in txt, f"texto do estado ({txt[:120]!r})")
    p.check(c.tem("[data-sem-treino-tentar]"), "botão 'Tentar de novo' no estado")
    p.check(c.tem("[data-card-plano]"), "o menu continua (só o conteúdo mostra o estado)")
    c.print("sem_treino_alunos")
    antes = len(c.trocas)
    c.pg.wait_for_timeout(40_000)
    p.check(len(c.trocas) == antes and antes <= 1, f"sem tentativas sozinhas depois do 429 ({antes} chamada(s), {len(c.trocas)} depois de 40 s)")
    # recarregar não martela a troca (a pausa fica guardada no aparelho)
    c.pg.reload(wait_until="domcontentloaded")
    p.check(c.esperar(lambda: c.tem("[data-sem-treino]"), 90), "recarregou: o estado volta sem nova troca")
    c.pg.wait_for_timeout(5_000)
    p.check(len(c.trocas) == antes, f"recarregar não chama a troca de novo ({len(c.trocas)} chamadas no total)")
    # a pessoa tenta de novo com a troca funcionando → a página do Treino abre
    c.ctx.unroute("**/functions/v1/trocar-token")
    B.zerar_limite_troca("w5-dono")
    c.pg.locator("[data-sem-treino-tentar]").click()
    p.check(c.esperar(lambda: c.tem("[data-pagina-alunos]"), 90), "'Tentar de novo' com o Treino de volta → a página de Alunos abre")
    p.check(len(c.trocas) == antes + 1, f"uma troca só por toque ({len(c.trocas) - antes})")
    c.fim()


def caso_fora(nav, a) -> None:
    c = B.Caso(nav, a.base, a.prefixo, "sem-treino-fora")
    interceptar(c, "fora")
    c.entrar("w5-dono", "/painel/alunos")
    c.fechar_avisos()
    p.check(c.esperar(lambda: c.tem("[data-sem-treino]"), 90), "Treino fora do ar (503): 'Sem conexão com o Treino' na página do Treino")
    p.check(c.tem("[data-card-plano]") and not c.tem("[data-carregando-tela]"), "o painel segue com o menu (não trava inteiro)")
    c.pg.wait_for_timeout(75_000)
    p.check(len(c.trocas) <= 3, f"no máximo 2 tentativas sozinhas com o servidor falhando ({len(c.trocas)} chamadas em ~75 s)")
    c.print("sem_treino_fora")
    c.pg.locator("a[href='/painel/configuracoes']").first.click()
    p.check(c.esperar(lambda: c.tem("[data-configuracoes]") and not c.tem("[data-sem-treino]"), 60), "Configurações abre com o Treino fora do ar")
    c.fim()


def caso_rede(nav, a) -> None:
    c = B.Caso(nav, a.base, a.prefixo, "sem-treino-rede")
    interceptar(c, "rede")
    c.entrar("w5-dono", "/painel/alunos")
    c.fechar_avisos()
    p.check(c.esperar(lambda: c.tem("[data-sem-treino]"), 90), "sem rede até o Treino: o estado aparece e o painel segue")
    c.ctx.unroute("**/functions/v1/trocar-token")
    B.zerar_limite_troca("w5-dono")
    p.check(c.esperar(lambda: c.tem("[data-pagina-alunos]"), 120), "a rede voltou: a espera crescente (2 s → 30 s) reconecta sozinha")
    c.fim()


def caso_aluno(nav, a) -> None:
    c = B.Caso(nav, a.base, a.prefixo, "sem-treino-aluno", desktop=False)
    interceptar(c, "limite")
    c.entrar("aluno-calc", "/treino")  # aluno do Calc (teste@teste.com): tem treino, precisa da troca
    c.fechar_avisos()
    p.check(c.esperar(lambda: c.tem("[data-trava-app='troca-limite']"), 90), "aluno: a aba Treino mostra 'Muitas tentativas' no lugar do treino")
    p.check("Tentar de novo" in c.texto(), "aluno: 'Tentar de novo'")
    p.check(len(c.trocas) == 1, f"aluno: uma troca só ({len(c.trocas)})")
    antes = len(c.trocas)
    c.pg.wait_for_timeout(30_000)
    p.check(len(c.trocas) == antes, f"aluno: sem loop de trocas ({antes} → {len(c.trocas)})")
    c.print("sem_treino_aluno_app")
    c.fim()


CASOS = {"limite": caso_limite, "fora": caso_fora, "rede": caso_rede, "aluno": caso_aluno}


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--base", required=True)
    ap.add_argument("--prefixo", required=True)
    ap.add_argument("--casos", default=",".join(CASOS))
    ap.add_argument("--schema", default="staging")
    a = ap.parse_args()
    B.ESTADO["schema"] = a.schema
    with sync_playwright() as pw:
        nav = pw.chromium.launch(args=["--no-sandbox"])
        for nome in [x.strip() for x in a.casos.split(",") if x.strip()]:
            print(f"\n── {nome}", flush=True)
            t0 = time.time()
            try:
                CASOS[nome](nav, a)
            except Exception as e:  # noqa: BLE001
                p.check(False, f"[{nome}] quebrou: {type(e).__name__}: {str(e)[:300]}")
                caso = B.ESTADO.get("caso")
                if caso is not None:
                    caso.diagnostico()
                    try:
                        caso.ctx.close()
                    except Exception:  # noqa: BLE001
                        pass
            print(f"   ({time.time() - t0:.0f} s)", flush=True)
        nav.close()
    return p.fim()


if __name__ == "__main__":
    sys.exit(main())
