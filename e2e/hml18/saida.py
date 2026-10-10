#!/usr/bin/env python3
"""Physiq hml-18a (H-40, D — 10/10/2026) — E2E da SAÍDA ANIMADA no celular, com o Edge (is_mobile + has_touch, 390 × 844).

Em cada peça: abre → o nó com data-state="open" → fecha (Esc, ou o Cancelar quando é a confirmação do app) → o nó continua no DOM
com data-state="closed" e só sai depois: ≥ 150 ms (folhas ≥ 190 ms), com animationName ≠ none e a duração ≥ 0,15 s — e o MESMO com o
"reduzir movimento" do sistema (reducedMotion 'reduce', o estado do PC do Weslley: nada pode zerar). Nos painéis que o pai fechava
desmontando (os 6 da spec), o texto durante a saída é o mesmo de aberto (o painel não sai vazio — risco 5, useUltimoValor).

  personal (painel, 390)  Sino · Busca (com um termo: ele continua na saída) · "Mais" da barra · Trocar de conta (dentro do "Mais"; a
                          conta de teste tem 1 conta só: uma 2ª entra SÓ na resposta da minha_situacao que o navegador recebe — o menu
                          só abre e fecha, nada escolhe) · menu do aluno · ConfirmarAcao (menu do aluno › Desativar/Bloquear, fechado
                          sem confirmar) · menu do perfil do aluno · 3 folhas: Novo aluno, Novo exercício (Biblioteca), Convidar
                          profissional · Equipe › Papéis · 1 Dialog (Financeiro › Nova movimentação) · 1 AlertDialog (editor › tirar
                          exercício, a confirmação do app, Cancelar) · menu do usuário (só existe no computador: a 1280 px)
  master (só local/staging) a Janela do treino pronto (Novo treino) e a folha da senha do aluno (Alunos) — 2 dos 6 que somem com o pai
Nada grava: o personal com a Guarda da hml-17 (o navegador aborta toda escrita — o sino marca os avisos como lidos ao abrir) e as
escritas contadas; o master sem a Guarda (as funções dele leem por POST), só contadas — e nenhuma pode sair.
Prints (§5): prints/hml18/<base>_d_sino_saindo_390.png e _d_busca_saindo_390.png (aos 100 ms do fechar) e _d_folha_saindo_390.png
(a folha "Novo aluno" aos 120 ms) — a animação de saída congelada nesse ponto (Web Animations: pause + currentTime), o print, e solta.
Bases: --base local (o vite preview do build de STAGING em http://localhost:8080) · staging · prod (SÓ LEITURA: a Guarda; as contas
de teste de lá; sem o master).
Saída: hml/hml18/agente/saida_<base>[_<papéis>].txt; o placar vai para o e2e-rodadas.tsv (Placar.fim()).
Uso: python3 e2e/hml18/saida.py --base local --canal msedge [--contas personal,master] [--casos sino,busca,…]
"""
from __future__ import annotations

import argparse
import json
import re
import sys
import uuid
from pathlib import Path

sys.dont_write_bytecode = True
sys.path.insert(0, str(Path(__file__).resolve().parent))
import _base as B  # noqa: E402

MODOS = (("no-preference", "normal"), ("reduce", "reduzir"))
CASOS_PERSONAL = ("sino", "busca", "mais", "conta", "menu_aluno", "confirmar_acao", "menu_perfil", "folha_novo_aluno", "folha_exercicio",
                  "folha_convidar", "papeis", "dialog", "alertdialog", "usuario")
CASOS_MASTER = ("master_janela", "master_senha")
CONTA_DE_MENTIRA = "HML18 · outra conta (só no navegador)"

# fecha a peça aberta (Esc no foco — o mesmo do teclado/“voltar” do Android — ou o clique num botão) e observa, quadro a quadro, até o
# nó sair: quanto tempo levou, se passou por data-state=closed, a animação e a duração vistas fechado e o texto durante a saída
JS_FECHAR_E_MEDIR = r"""([sel, como]) => new Promise((ok) => {
  const d = [...document.querySelectorAll(sel)].find((e) => e.getAttribute('data-state') === 'open' && e.getClientRects().length);
  const texto = (e) => (e.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 90);
  const valor = (e) => { const c = e.querySelector('input, textarea'); return c ? c.value : null; };
  if (!d) return ok({ ms: -1, fechado: false, fechadoPor: 0, anima: '-', dur: 0, texto0: '', textoSaida: '', valor0: null, valorSaida: null });
  const r = { ms: -1, fechado: false, fechadoPor: 0, anima: '-', dur: 0, texto0: texto(d), textoSaida: '', valor0: valor(d), valorSaida: null };
  let viu = -1;
  const t0 = performance.now();
  const olhar = () => {
    const agora = performance.now() - t0;
    const vis = d.isConnected && getComputedStyle(d).display !== 'none' && getComputedStyle(d).visibility !== 'hidden';
    if (d.isConnected && d.getAttribute('data-state') === 'closed' && viu < 0) {
      viu = agora; r.fechado = true;
      const cs = getComputedStyle(d);
      r.anima = cs.animationName;
      r.dur = Math.max(...cs.animationDuration.split(',').map((x) => parseFloat(x) || 0));
      r.textoSaida = texto(d);
      r.valorSaida = valor(d);
    }
    if (!vis) { r.ms = Math.round(agora); r.fechadoPor = viu < 0 ? 0 : Math.round(agora - viu); return ok(r); }
    if (agora > 4000) { r.ms = 9999; return ok(r); }
    requestAnimationFrame(olhar);
  };
  if (como === 'esc') {
    (document.activeElement || document.body).dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true, cancelable: true }));
  } else {
    const b = d.querySelector(como) || document.querySelector(como);
    if (b) b.click();
  }
  requestAnimationFrame(olhar);
})"""

# o print "saindo": fecha e, no 1º quadro com data-state=closed, congela as animações de saída em `aos` ms (pause + currentTime) e
# devolve o estilo do nó nesse ponto (opacidade/transform — ainda visível, a caminho de sumir); JS_SOLTAR deixa terminar
JS_FECHAR_E_CONGELAR = r"""([sel, como, aos]) => new Promise((ok) => {
  const d = [...document.querySelectorAll(sel)].find((e) => e.getAttribute('data-state') === 'open' && e.getClientRects().length);
  if (!d) return ok(null);
  const t0 = performance.now();
  const olhar = () => {
    if (d.isConnected && d.getAttribute('data-state') === 'closed') {
      let n = 0;
      for (const a of document.getAnimations()) {
        const alvo = a.effect && a.effect.target;
        if (alvo && alvo.getAttribute && alvo.getAttribute('data-state') === 'closed') { a.pause(); a.currentTime = aos; n++; }
      }
      const cs = getComputedStyle(d);
      const c = d.querySelector('input, textarea');
      return ok({ congeladas: n, opacidade: cs.opacity, transform: cs.transform, conectado: d.isConnected, valor: c ? c.value : null });
    }
    if (performance.now() - t0 > 2000) return ok({ congeladas: 0, opacidade: '-', transform: '-', conectado: d.isConnected, valor: null });
    requestAnimationFrame(olhar);
  };
  if (como === 'esc') {
    (document.activeElement || document.body).dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true, cancelable: true }));
  } else {
    const b = d.querySelector(como) || document.querySelector(como);
    if (b) b.click();
  }
  requestAnimationFrame(olhar);
})"""
JS_SOLTAR = "() => { for (const a of document.getAnimations()) if (a.playState === 'paused') a.play(); }"


def com_outra_conta(cel: B.Celular) -> None:
    """A 2ª conta SÓ na resposta da minha_situacao/pos-login que o navegador recebe (o mesmo jeito do `legal` desligado do _base.py):
    o card da conta vira o menu "Trocar de conta". O teste só abre e fecha o menu — a conta de mentira nunca é escolhida."""
    def rota(route, req) -> None:
        tipo, nome = B.B17.alvo(req.url)
        if req.method != "OPTIONS" and ((tipo == "fn" and nome == "pos-login") or (tipo == "rpc" and nome == "minha_situacao")):
            try:
                r = route.fetch()
                try:
                    obj = B._tirar_legal(r.json())
                except Exception:  # noqa: BLE001
                    route.fulfill(response=r)
                    return
                sit = obj.get("situacao") if isinstance(obj, dict) and isinstance(obj.get("situacao"), dict) else obj
                contas = sit.get("contas") if isinstance(sit, dict) else None
                if isinstance(contas, list) and len(contas) == 1 and isinstance(contas[0], dict):
                    contas.append({**contas[0], "id": str(uuid.uuid4()), "nome": CONTA_DE_MENTIRA})
                route.fulfill(response=r, body=json.dumps(obj), headers={**r.headers, "content-type": "application/json"})
            except Exception:  # noqa: BLE001 — a página fechou no meio
                pass
            return
        route.fallback()
    cel.ctx.route(re.compile(r"https://api(-principal)?\.physiqcalc\.com\.br/"), rota)


def tam(valor: str | None) -> str:
    """O campo sem o valor (pode ser uma senha gerada na folha): só o tamanho."""
    return "—" if valor is None else f"{len(valor)} car."


def anotar_escritas(cel: B.Celular, ctx: dict) -> None:
    def ver(req) -> None:
        if ctx["classificar"].escrita(req):
            tipo, nome = B.B17.alvo(req.url)
            ctx["escritas"].append(f"{req.method} {tipo}:{nome}")
    cel.pg.on("request", ver)


def clicar(cel: B.Celular, seletor: str, espera: float = 20) -> bool:
    """Toca no 1º visível do seletor (espera ele aparecer)."""
    loc = cel.pg.locator(seletor)
    if not cel.esperar(lambda: any(loc.nth(i).is_visible() for i in range(min(loc.count(), 6))), espera):
        return False
    for i in range(min(loc.count(), 6)):
        if loc.nth(i).is_visible():
            loc.nth(i).click(timeout=8000)
            return True
    return False


def aberto(cel: B.Celular, sel: str, espera: float = 12) -> bool:
    return cel.esperar(lambda: cel.pg.evaluate(
        "(s) => [...document.querySelectorAll(s)].some((e) => e.getAttribute('data-state') === 'open' && e.getClientRects().length)", sel), espera)


def medir(R: B.Rodada, cel: B.Celular, nome: str, abrir, sel: str, *, como: str = "esc", limite: int = 150, texto: str | None = None,
          mesmo: bool = False, print_caso: tuple[str, int] | None = None, ctx: dict | None = None, abrir_print=None) -> dict | None:
    """A peça nos 2 modos (normal e reduzir): abre, espera a entrada, fecha medindo. texto = o que tem que estar no painel durante a
    saída; mesmo = o texto (e o campo) da saída iguais aos de aberto (o painel não sai vazio nem muda); abrir_print = outro jeito de
    abrir só para o print (ex.: a busca sem termo). Devolve a última medida."""
    ultima = None
    for midia, rotulo in MODOS:
        rot = f"[{nome} · {rotulo}]"
        cel.pg.emulate_media(reduced_motion=midia)
        try:
            com_print = bool(print_caso) and midia == "no-preference" and ctx is not None
            if not (abrir_print if com_print and abrir_print else abrir)() or not aberto(cel, sel):
                R.ok(False, f"{rot} abriu (data-state=open em {sel})")
                continue
            cel.pg.wait_for_timeout(500)  # a entrada termina (folha: 300 ms)
            if com_print:
                caso, aos = print_caso
                if ctx["producao"]:
                    cel.pg.add_style_tag(content=f"{B.BORRAR_LISTAS} {{ filter: blur(7px) !important; }}")
                info = cel.pg.evaluate(JS_FECHAR_E_CONGELAR, [sel, como, aos])
                # o print NA HORA (sem a espera do cel.print): a animação fica congelada, mas os relógios da página seguem — ex.: o termo da
                # busca é limpo 200 ms depois do fechar (de verdade)
                B.PRINTS.mkdir(parents=True, exist_ok=True)
                caminho = str(B.PRINTS / f"{ctx['prefixo']}_{caso}_{cel.largura}.png")
                cel.pg.screenshot(path=caminho)
                depois = cel.pg.evaluate("(s) => { const d = document.querySelector(s); const c = d && d.querySelector('input, textarea'); return c ? c.value : null; }", sel)
                cel.pg.evaluate(JS_SOLTAR)
                cel.pg.wait_for_timeout(700)
                R.linha(f"   print: {caminho}")
                ok = bool(info) and info["conectado"] and info["congeladas"] > 0 and (info["opacidade"] not in ("0", "1") or info["transform"] not in ("none", ""))
                R.ok(ok, f"{rot} print aos {aos} ms do fechar: ainda na tela, saindo (opacidade {info and info['opacidade']} · transform "
                         f"{(info and info['transform'] or '-')[:40]} · {info and info['congeladas']} animações congeladas"
                         + (f" · campo {tam(info['valor'])} → {tam(depois)} no print" if info and info.get("valor") is not None else "") + ")")
                if not abrir() or not aberto(cel, sel):
                    R.ok(False, f"{rot} abriu de novo depois do print")
                    continue
                cel.pg.wait_for_timeout(500)
            r = cel.pg.evaluate(JS_FECHAR_E_MEDIR, [sel, como])
            ultima = r
            cel.pg.wait_for_timeout(250)
            ok = r["fechado"] and limite <= r["ms"] < 9999 and r["anima"] not in ("none", "", "-") and r["dur"] >= 0.15
            R.ok(ok, f"{rot} fecha passando por data-state=closed e sai em {r['ms']} ms (≥ {limite}; fechado por {r['fechadoPor']} ms) · "
                     f"animação {r['anima']} {r['dur']}s")
            if texto is not None or mesmo:
                tem = texto is None or texto in r["textoSaida"]
                igual = r["textoSaida"] == r["texto0"] and r["valorSaida"] == r["valor0"]
                R.ok(r["fechado"] and tem and (igual or not mesmo),
                     f"{rot} saindo, o painel continua com o conteúdo"
                     + (f" (\"{texto}\" {'presente' if tem else 'AUSENTE'})" if texto else "")
                     + (f" — o mesmo de aberto ({'igual' if igual else 'MUDOU'}; campo {tam(r['valor0'])} → {tam(r['valorSaida'])})" if mesmo else "")
                     + " — não sai vazio")
            if cel.pg.evaluate("(s) => [...document.querySelectorAll(s)].some((e) => e.getAttribute('data-state') === 'open')", sel):
                cel.pg.keyboard.press("Escape")
                cel.pg.wait_for_timeout(400)
        except Exception as e:  # noqa: BLE001
            if any(x in str(e) for x in ("Target crashed", "has been closed")):
                raise
            R.ok(False, f"{rot} erro: {type(e).__name__}: {str(e)[:200]}")
    cel.pg.emulate_media(reduced_motion="no-preference")
    return ultima


# ───────────────────────── os casos ─────────────────────────
def casos_personal(R: B.Rodada, nav, ctx: dict, casos: set[str]) -> None:
    cel = B.Celular(nav, ctx["base"], 390, guarda=ctx["guarda_personal"])
    if "conta" in casos:
        com_outra_conta(cel)
    anotar_escritas(cel, ctx)
    aluna = ctx["aluna"]
    try:
        cel.entrar(ctx["logins"], ctx["contas"]["personal"], "/painel")
        cel.esperar_quieto()
        if "sino" in casos:
            medir(R, cel, "Sino", lambda: clicar(cel, "[data-sino]"), "[data-sino-lista]", print_caso=("d_sino_saindo", 100), ctx=ctx)
        if "busca" in casos:
            def abrir_busca() -> bool:
                if not clicar(cel, 'button[aria-label="Buscar"]'):
                    return False
                if not aberto(cel, "[data-paleta-busca]"):
                    return False
                cel.pg.locator("[data-paleta-busca] input").first.fill("al")
                cel.esperar_quieto(minimo=1.2, maximo=12, quieto=1.0)  # as fontes buscam (alunos, treinos): o resultado assenta antes de fechar
                return True
            # o print abre sem termo: a foto leva mais que os 200 ms do relógio da página e o termo (de verdade) já teria sido limpo — a prova
            # do termo durante a saída é a medida (sem congelar) e o Vitest (src/painel/busca/busca.test.tsx)
            medir(R, cel, "Busca", abrir_busca, "[data-paleta-busca]", mesmo=True, print_caso=("d_busca_saindo", 100), ctx=ctx,
                  abrir_print=lambda: clicar(cel, 'button[aria-label="Buscar"]'))
            # abrir de novo depois de sair: começa limpa (o termo some só depois da saída e não fica para a próxima)
            cel.pg.wait_for_timeout(400)
            abriu = clicar(cel, 'button[aria-label="Buscar"]') and aberto(cel, "[data-paleta-busca]")
            valor = cel.pg.evaluate("() => (document.querySelector('[data-paleta-busca] input') || {}).value ?? '-'") if abriu else "-"
            R.ok(abriu and valor == "", f"[Busca] abrir de novo: abre limpa (campo \"{valor}\")")
            cel.pg.keyboard.press("Escape")
            cel.pg.wait_for_timeout(500)
        if "mais" in casos:
            medir(R, cel, "Mais da barra", lambda: clicar(cel, '[data-tabbar] [data-aba="mais"]'), '[data-painel="baixo"]', limite=190)
        if "conta" in casos:
            def abrir_conta() -> bool:
                if not aberto(cel, '[data-painel="baixo"]', 0.5):
                    if not clicar(cel, '[data-tabbar] [data-aba="mais"]') or not aberto(cel, '[data-painel="baixo"]'):
                        return False
                    cel.pg.wait_for_timeout(450)
                return clicar(cel, '[data-painel] button[data-card-conta][aria-label="Trocar de conta"]', 10)
            tem = abrir_conta()
            R.ok(tem, f"[Trocar de conta] o card da conta vira o menu (2 contas: a de teste + \"{CONTA_DE_MENTIRA}\")")
            if tem:
                cel.pg.keyboard.press("Escape")
                cel.pg.wait_for_timeout(400)
                medir(R, cel, "Trocar de conta", abrir_conta, "[role=menu]")
            for _ in range(2):
                if aberto(cel, '[data-painel="baixo"]', 0.3):
                    cel.pg.keyboard.press("Escape")
                    cel.pg.wait_for_timeout(450)
        if casos & {"menu_aluno", "confirmar_acao", "folha_novo_aluno"}:
            cel.ir("/painel/alunos")
            cel.esperar_quieto()
            if "menu_aluno" in casos:
                medir(R, cel, "menu do aluno", lambda: clicar(cel, "[data-menu-aluno]"), "[data-menu-aluno-aberto]")
            if "confirmar_acao" in casos:
                escolhido = {"marca": ""}

                def abrir_confirmar() -> bool:
                    if not clicar(cel, "[data-menu-aluno]") or not aberto(cel, "[data-menu-aluno-aberto]"):
                        return False
                    for marca in ("desativar", "bloquear", "remover"):
                        item = cel.pg.locator(f'[data-menu-aluno-aberto] [data-acao-aluno="{marca}"]')
                        if item.count():
                            escolhido["marca"] = marca
                            item.first.click()
                            return True
                    cel.pg.keyboard.press("Escape")
                    return False
                medir(R, cel, "ConfirmarAcao", abrir_confirmar, "[data-painel]:has([data-confirmar-acao])", limite=190, mesmo=True)
                R.linha(f"   (a ação de teste: {escolhido['marca'] or 'nenhuma'} — só aberta e fechada, sem confirmar)")
            if "folha_novo_aluno" in casos:
                medir(R, cel, "folha Novo aluno", lambda: clicar(cel, "[data-novo-aluno-abrir]"), "[data-painel]:has([data-novo-aluno])", limite=190,
                      print_caso=("d_folha_saindo", 120), ctx=ctx)
        if "menu_perfil" in casos:
            cel.ir(f"/painel/alunos/{aluna}")
            cel.esperar_quieto()
            medir(R, cel, "menu do perfil do aluno", lambda: clicar(cel, "[data-menu-perfil]"), "[data-menu-perfil-aberto]")
        if "folha_exercicio" in casos:
            cel.ir("/painel/treinos?aba=biblioteca")
            cel.esperar_quieto()
            minha = cel.pg.get_by_role("radio", name=re.compile(r"^Minha"))
            if minha.count():
                minha.first.click()
                cel.pg.wait_for_timeout(800)
            medir(R, cel, "folha Novo exercício", lambda: clicar(cel, "[data-btn-criar-exercicio]"), '[data-painel]:has([data-folha-exercicio="novo"])',
                  limite=190)
        if casos & {"folha_convidar", "papeis"}:
            cel.ir("/painel/configuracoes/equipe")
            cel.esperar_quieto()
            if "folha_convidar" in casos:
                medir(R, cel, "folha Convidar profissional", lambda: clicar(cel, "[data-equipe-convidar], [data-equipe-convidar-link]"),
                      "[data-painel]:has([data-form-convidar])", limite=190)
            if "papeis" in casos:
                medir(R, cel, "Equipe › Papéis", lambda: clicar(cel, "[data-membro-papeis]"), "[data-painel]:has([data-form-papeis])", limite=190,
                      texto="Papéis de", mesmo=True)
        if "dialog" in casos:
            cel.ir("/painel/financeiro")
            cel.esperar_quieto()
            medir(R, cel, "Dialog Nova movimentação", lambda: clicar(cel, "[data-nova-movimentacao]"), '[role=dialog][data-slot="dialog-content"]')
        if "alertdialog" in casos:
            cel.ir(f"/painel/alunos/{aluna}/editar")
            cel.esperar(lambda: cel.tem("[data-exercicio-remover]"), 30)
            medir(R, cel, "AlertDialog (confirmação do app) › Cancelar", lambda: clicar(cel, "[data-exercicio-remover]"), "[role=alertdialog]",
                  como="[data-confirmar-cancelar]", texto="Tirar", mesmo=True)
        if "usuario" in casos:
            cel.pg.set_viewport_size({"width": 1280, "height": 800})
            cel.ir("/painel")
            cel.esperar_quieto()
            medir(R, cel, "menu do usuário (computador, 1280)", lambda: clicar(cel, "[data-menu-usuario-botao]"), "[role=menu]")
            cel.pg.set_viewport_size({"width": 390, "height": 844})
        R.ok(not cel.dialogos, f"[personal] nenhum diálogo nativo do navegador ({cel.dialogos})")
    finally:
        cel.fim(ctx["logins"])


def casos_master(R: B.Rodada, nav, ctx: dict, casos: set[str]) -> None:
    cel = B.Celular(nav, ctx["base"], 390)
    anotar_escritas(cel, ctx)
    try:
        primeira = "/master/app-do-aluno?aba=treinos" if "master_janela" in casos else "/master/alunos"
        cel.entrar(ctx["logins"], ctx["contas"]["master"], primeira)
        cel.esperar_quieto()
        if "master_janela" in casos:
            medir(R, cel, "master · Janela Novo treino pronto", lambda: clicar(cel, "[data-novo-treino-pronto]", 30), "[data-janela-treino-pronto]",
                  texto="Novo treino pronto", mesmo=True)
        if "master_senha" in casos:
            cel.ir("/master/alunos")
            cel.esperar_quieto()
            medir(R, cel, "master · folha Senha nova do aluno", lambda: clicar(cel, "[data-senha-nova]", 30), "[data-painel]", limite=190,
                  mesmo=True)
        R.ok(not cel.dialogos, f"[master] nenhum diálogo nativo do navegador ({cel.dialogos})")
    finally:
        cel.fim(ctx["logins"])


def main() -> int:
    ap = argparse.ArgumentParser(description="hml-18a — E2E da saída animada (D), normal e com reduzir movimento")
    ap.add_argument("--base", required=True, help="local (http://localhost:8080) | staging | prod (SÓ LEITURA) | <url>")
    ap.add_argument("--canal", default="msedge", choices=("msedge", "chromium", "chrome"))
    ap.add_argument("--contas", default="personal,master", help="personal, master")
    ap.add_argument("--casos", default=None, help=f"padrão: todos ({','.join(CASOS_PERSONAL + CASOS_MASTER)})")
    a = ap.parse_args()
    base, prefixo, producao = B.resolver_base(a.base)
    papeis = [p.strip() for p in a.contas.split(",") if p.strip()]
    if set(papeis) - {"personal", "master"}:
        raise SystemExit("contas: personal, master")
    if producao and "master" in papeis:
        papeis.remove("master")
    casos = {c.strip() for c in (a.casos or ",".join(CASOS_PERSONAL + CASOS_MASTER)).split(",") if c.strip()}
    if casos - set(CASOS_PERSONAL + CASOS_MASTER):
        raise SystemExit(f"casos: {', '.join(CASOS_PERSONAL + CASOS_MASTER)}")
    nome = f"saida_{prefixo}" + ("" if set(papeis) == {"personal", "master"} else "_" + "_".join(papeis))
    R = B.Rodada(nome)
    R.linha(f"base {base} · {'PRODUÇÃO, só leitura (a Guarda)' if producao else 'schema staging'} · canal {a.canal} · papéis {', '.join(papeis)} · "
            f"casos {len(casos)} · cada um normal e com reduzir movimento")
    contas = B.CONTAS_DA_BASE["prod" if producao else "staging"]
    L = B.Logins(f"saida.py {prefixo}")
    ctx = {"base": base, "prefixo": prefixo, "producao": producao, "contas": contas, "logins": L, "escritas": [],
           "guarda_personal": B.B17.Guarda(), "classificar": B.B17.Guarda(), "aluna": ""}
    from playwright.sync_api import sync_playwright  # noqa: PLC0415

    with sync_playwright() as pw:
        try:
            nav = pw.chromium.launch(channel=a.canal, args=["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu"])
            try:
                ok_build = B.conferir_build(R, nav, base, producao)
            finally:
                nav.close()
            if ok_build:
                ctx["aluna"] = B.matricula(contas["aluna"])
                for papel, fn, meus in (("personal", casos_personal, set(CASOS_PERSONAL)), ("master", casos_master, set(CASOS_MASTER))):
                    if papel not in papeis or not casos & meus:
                        continue
                    nav = pw.chromium.launch(channel=a.canal, args=["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu"])
                    try:
                        marca, marca_b = len(ctx["escritas"]), len(ctx["guarda_personal"].bloqueadas)
                        fn(R, nav, ctx, casos & meus)
                        novas = ctx["escritas"][marca:]
                        abortadas = ctx["guarda_personal"].bloqueadas[marca_b:] if papel == "personal" else []
                        R.ok(len(novas) == len(abortadas), f"[{papel}] nada gravou: {len(novas)} tentativas de escrita, {len(abortadas)} abortadas pela "
                             f"Guarda no navegador" + (f" {novas[:4]}" if novas else ""))
                    except Exception as e:  # noqa: BLE001
                        R.ok(False, f"[{papel}] {type(e).__name__}: {str(e)[:240]}")
                    finally:
                        nav.close()
        finally:
            L.fechar(R)
    R.linha(f"   escritas abortadas pela Guarda (personal): {len(ctx['guarda_personal'].bloqueadas)} {ctx['guarda_personal'].bloqueadas[:4]}")
    return R.fim()


if __name__ == "__main__":
    raise SystemExit(main())
