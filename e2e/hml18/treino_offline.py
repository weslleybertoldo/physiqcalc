#!/usr/bin/env python3
"""Physiq hml-18b (H-54, F2 — decisão 13 da spec) — E2E do TREINO OFFLINE com o PowerSync fora da entrada, com o Edge (celular, 390).

O build de staging não tem PowerSync (src/lib/powersync/instancia.ts): a prova real é um build LOCAL com a configuração de PRODUÇÃO
(dist-prod, servido no :8080) — `--base localprod` — com a conta de TESTE da aluna de produção e a Guarda (SÓ LEITURA):
  1. a aluna abre /treino online (a sessão entra antes do 1º documento): a entrada NÃO traz o PowerSync, o pedaço dele chega por
     import() no app do aluno e o banco local sincroniza (o "Baixando o seu treino…" some);
  2. a pré-carga das abas termina (no aparelho o service worker guarda os pedaços; aqui ele fica bloqueado para a Guarda ver tudo);
  3. a página fica OFFLINE (context.set_offline) e ela navega pelo app pela barra de abas, SEM recarregar;
  4. de volta ao Treino: o treino do dia continua na tela (o mesmo título, os mesmos grupos e o mesmo número de exercícios) e o aviso
     "Sem internet · o treino fica salvo no aparelho" aparece;
  5. nenhuma escrita sai: a Guarda conta 0 tentativas (POST/PATCH/PUT/DELETE em tabela, RPC que grava, função que grava, Storage).
Teto do contrato: 4 logins da aluna de produção (registro em hml/hml18/agente/prod_aluna_logins_18b.txt). Logout local no fim.
Saída: hml/hml18/agente/treino_offline_<base>.txt. Sem dado pessoal: só contagem, ms, KB e "igual/diferente" (o título vira um resumo).
Uso: python3 e2e/hml18/treino_offline.py --base localprod --canal msedge
"""
from __future__ import annotations

import argparse
import hashlib
import re
import sys
import time
from pathlib import Path

sys.dont_write_bytecode = True
sys.path.insert(0, str(Path(__file__).resolve().parent))
import _base as B  # noqa: E402

REG = B.SAIDA / "prod_aluna_logins_18b.txt"
MAX_LOGINS = 4
JS_BUFFER_GRANDE = "try { performance.setResourceTimingBufferSize(20000); } catch (e) {}"

# o que está na tela do Treino, sem texto: o título (resumido), os grupos dos slots (resumidos), quantos exercícios e o aviso de sync
JS_TREINO = r"""() => {
  const vis = (e) => e && e.getClientRects().length;
  const aba = document.querySelector('[data-aba-treino]');
  const h1 = [...document.querySelectorAll('[data-aba-conteudo] h1')].find(vis);
  const slots = [...document.querySelectorAll('[data-slot]')].filter(vis);
  const ex = [...document.querySelectorAll('[data-lista-exercicios] > *')].filter(vis);
  const s = document.querySelector('[data-sync]');
  return { aba: aba ? aba.getAttribute('data-aba-treino') : null, titulo: h1 ? h1.textContent.trim() : '',
    grupos: slots.map((x) => x.getAttribute('data-slot-grupo') || '').join('|'), nSlots: slots.length, nEx: ex.length,
    sync: s ? s.getAttribute('data-sync') : null, online: navigator.onLine };
}"""
# os pedaços do banco local que a página baixou (o PowerSync, o worker e o wasm) — e se a ENTRADA (index.html) os traz
JS_SYNC = r"""() => performance.getEntriesByType('resource').map((r) => r.name.split('/').pop().split('?')[0])
  .filter((n) => /^(powersync|WASQLiteDB|SharedSync|wa-sqlite|IDBBatchAtomicVFS)/.test(n))"""


def nome_do_pedaco(arquivo: str) -> str:
    return re.sub(r"-[A-Za-z0-9_-]{8}\.(m?js|wasm)$", "", arquivo)


def resumo(texto: str) -> str:
    """Um resumo curto (não reversível) para comparar o antes e o depois sem imprimir o texto."""
    return hashlib.sha256(texto.encode()).hexdigest()[:8] if texto else "—"


def contar_login() -> None:
    n = len(REG.read_text(encoding="utf-8").splitlines()) if REG.exists() else 0
    if n >= MAX_LOGINS:
        raise SystemExit(f"aluna de produção: os {MAX_LOGINS} logins do contrato já foram usados ({REG})")
    REG.parent.mkdir(parents=True, exist_ok=True)
    with REG.open("a", encoding="utf-8") as f:
        f.write(f"login {n + 1}/{MAX_LOGINS} {time.strftime('%Y-%m-%d %H:%M:%S')} (treino_offline.py)\n")


def escolher_dia_com_treino(cel: B.Celular, dia: str | None = None) -> str | None:
    """Toca, na faixa da semana, um dia COM treino (o `dia` pedido, ou o 1º "treino"/"feito" desta semana ou da anterior). Só estado
    da tela: escolher o dia não grava nada. Devolve a chave do dia (AAAA-MM-DD) ou None."""
    for _ in range(3):
        if dia:
            alvo = cel.pg.locator(f'[data-dia="{dia}"]')
        else:
            alvo = cel.pg.locator('[data-dia][data-dia-estado="treino"], [data-dia][data-dia-estado="feito"]')
        if alvo.count():
            chave = alvo.first.get_attribute("data-dia")
            alvo.first.click(timeout=8000)
            cel.esperar(lambda: cel.tem("[data-slot]"), 8)
            cel.pg.wait_for_timeout(800)
            return chave
        ant = cel.pg.locator("[data-semana-anterior]")
        if not ant.count():
            return None
        ant.first.click(timeout=8000)
        cel.pg.wait_for_timeout(900)
    return None


def tocar_aba(cel: B.Celular, rota: str) -> bool:
    link = cel.pg.locator(f'[data-tabbar] a[href="{rota}"]').first
    if not link.count():
        return False
    link.click(timeout=8000)
    return cel.esperar(lambda: cel.caminho() == rota, 10)


def main() -> int:
    ap = argparse.ArgumentParser(description="hml-18b — E2E do treino offline (F2, decisão 13)")
    ap.add_argument("--base", default="localprod", help="localprod (o build local com a configuração de produção, :8080)")
    ap.add_argument("--canal", default="msedge", choices=("msedge", "chromium", "chrome"))
    a = ap.parse_args()
    base, prefixo, producao = B.resolver_base(a.base)
    if not producao:
        raise SystemExit("o treino offline só tem prova no build com PowerSync: --base localprod (o build de staging não sincroniza)")
    R = B.Rodada(f"treino_offline_{prefixo}")
    R.linha(f"base {base} · build com a configuração de PRODUÇÃO, SÓ LEITURA (a Guarda) · canal {a.canal}")
    conta = B.CONTAS_DA_BASE["prod"]["aluna"]
    L = B.Logins(f"treino_offline.py {prefixo}")
    guarda = B.B17.Guarda()
    from playwright.sync_api import sync_playwright  # noqa: PLC0415

    with sync_playwright() as pw:
        nav = pw.chromium.launch(channel=a.canal, args=["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu"])
        try:
            if not B.conferir_build(R, nav, base, producao):
                return R.fim()
            # a entrada (index.html): o <script> e os modulepreload SEM o powersync
            import urllib.request  # noqa: PLC0415

            req = urllib.request.Request(base + "/entrar", headers={"User-Agent": "physiq-unificado/1.0 (e2e-hml18b)"})
            with urllib.request.urlopen(req, timeout=30) as r:
                html = r.read().decode("utf-8", "replace")
            pre = re.findall(r'<link[^>]+rel="modulepreload"[^>]+href="/assets/([^"]+)"', html)
            R.ok(pre and not any(x.startswith("powersync") for x in pre),
                 f"a entrada não traz o PowerSync (modulepreload: {', '.join(nome_do_pedaco(x) for x in pre)})")
            cel = B.Celular(nav, base, 390, guarda=guarda)
            cel.ctx.add_init_script(JS_BUFFER_GRANDE)
            try:
                contar_login()
                t0 = time.time()
                cel.entrar(L, conta, "/treino")
                # 1. online: o Treino abre, o pedaço do PowerSync chega e o banco local sincroniza
                ok_aba = cel.esperar(lambda: cel.tem("[data-aba-treino]"), 60)
                sincronizou = cel.esperar(lambda: cel.tem("[data-aba-treino]") and not cel.tem('[data-sync="primeira"]'), 90, passo=0.5)
                ms_sync = round((time.time() - t0) * 1000)
                cel.esperar_quieto(minimo=3, maximo=30, quieto=2)
                sync = cel.pg.evaluate(JS_SYNC)
                R.ok(ok_aba and cel.caminho() == "/treino", f"a aba Treino abriu online ({cel.caminho()})")
                pedacos_sync = sorted({nome_do_pedaco(n) for n in sync})
                R.ok(any(n.startswith("powersync") for n in sync), f"o pedaço do PowerSync chegou por import() no app do aluno ({', '.join(pedacos_sync)})")
                R.ok(sincronizou, f"o banco local sincronizou (sem o \"Baixando o seu treino…\") em {ms_sync} ms desde a entrada")
                antes = cel.pg.evaluate(JS_TREINO)
                R.linha(f"   online: aba {antes['aba']} · título {resumo(antes['titulo'])} ({len(antes['titulo'])} caracteres) · {antes['nSlots']} slot(s) · "
                        f"{antes['nEx']} exercício(s) · aviso de sync {antes['sync'] or 'nenhum'}")
                R.ok(bool(antes["titulo"]) or antes["nSlots"] > 0, "o treino do dia está na tela online (título ou slots)")
                # um dia COM treino (hoje pode não ter): a prova é o treino vindo do banco local, não a tela vazia
                dia = escolher_dia_com_treino(cel) if antes["nSlots"] == 0 else None
                if dia:
                    antes = cel.pg.evaluate(JS_TREINO)
                    R.linha(f"   online, num dia com treino ({dia}): {antes['nSlots']} slot(s) · grupos {resumo(antes['grupos'])} · {antes['nEx']} exercício(s)")
                R.ok(antes["nSlots"] > 0 and antes["nEx"] > 0, f"online: um dia com treino na tela, vindo do banco local ({antes['nSlots']} slot(s), "
                                                               f"{antes['nEx']} exercício(s){'; o de hoje' if not dia else '; dia ' + dia})")
                # 2. a pré-carga das abas (as que a barra desta conta mostra)
                abas = cel.pg.evaluate("() => [...document.querySelectorAll('[data-tabbar] a[href]')].map((a) => a.getAttribute('href'))")
                nomes = {"/": "Inicio", "/treino": "Treino", "/dieta": "Dieta", "/evolucao": "Evolucao", "/perfil": "Perfil"}
                pedacos = [nomes[x] for x in abas if x in nomes]
                ok_pre = cel.esperar(lambda: all(cel.pg.evaluate(
                    r"""(n) => performance.getEntriesByType('resource').some((r) => new RegExp('/assets/' + n + '-[A-Za-z0-9_-]{8}\\.js').test(r.name))""", p)
                    for p in pedacos), 45, passo=0.5)
                R.ok(ok_pre, f"a pré-carga baixou as abas da barra ({', '.join(pedacos)}) antes de ficar sem rede")
                # 3. sem rede: navega pela barra, sem recarregar
                cel.ctx.set_offline(True)
                cel.pg.wait_for_timeout(800)
                outras = [x for x in abas if x != "/treino"]
                trocas = []
                for rota in outras[:3]:
                    trocas.append(f"{rota} {'ok' if tocar_aba(cel, rota) else 'NÃO'}")
                    cel.pg.wait_for_timeout(900)
                volta = tocar_aba(cel, "/treino")
                cel.esperar(lambda: cel.tem("[data-aba-treino]"), 10)
                cel.pg.wait_for_timeout(1500)
                if dia:
                    escolher_dia_com_treino(cel, dia)  # a aba voltou no dia de hoje: o mesmo dia, de novo, SEM rede
                depois = cel.pg.evaluate(JS_TREINO)
                R.ok(volta and trocas and all(x.endswith("ok") for x in trocas),
                     f"sem rede, navegou pela barra sem recarregar ({' · '.join(trocas) or 'nenhuma outra aba'} · de volta ao Treino {'ok' if volta else 'NÃO'})")
                R.linha(f"   offline: aba {depois['aba']} · título {resumo(depois['titulo'])} ({len(depois['titulo'])} caracteres) · {depois['nSlots']} slot(s) · "
                        f"{depois['nEx']} exercício(s) · aviso de sync {depois['sync'] or 'nenhum'} · navigator.onLine {depois['online']}")
                R.ok(depois["titulo"] == antes["titulo"] and depois["grupos"] == antes["grupos"] and depois["nEx"] == antes["nEx"],
                     f"o treino do dia CONTINUA na tela sem rede (título {'igual' if depois['titulo'] == antes['titulo'] else 'DIFERENTE'}, grupos "
                     f"{'iguais' if depois['grupos'] == antes['grupos'] else 'DIFERENTES'}, exercícios {antes['nEx']} → {depois['nEx']})")
                R.ok(depois["sync"] == "offline", f"o aviso \"Sem internet · o treino fica salvo no aparelho\" aparece ({depois['sync'] or 'nenhum aviso'})")
                R.ok(not cel.tem("[data-carregando-tela]") and not cel.tem("[data-banco-local=carregando]"),
                     "sem tela de carregando nem esqueleto do banco local depois de voltar (o provedor ficou montado)")
                erros_sync = [e for e in cel.erros if re.search(r"powersync|sqlite|indexeddb", e, re.I)]
                R.ok(not erros_sync, f"nenhum erro do banco local na página ({len(erros_sync)})")
                cel.ctx.set_offline(False)
                cel.pg.wait_for_timeout(1500)
            finally:
                try:
                    cel.ctx.set_offline(False)
                except Exception:  # noqa: BLE001
                    pass
                cel.fim()
            R.ok(not guarda.bloqueadas, f"nenhuma escrita saiu: a Guarda contou {len(guarda.bloqueadas)} tentativa(s)"
                                         + (f" ({'; '.join(sorted(set(guarda.bloqueadas))[:5])})" if guarda.bloqueadas else ""))
            R.ok(not cel.dialogos, f"nenhum diálogo nativo do navegador ({cel.dialogos})")
        finally:
            L.fechar(R)
            nav.close()
    return R.fim()


if __name__ == "__main__":
    raise SystemExit(main())
