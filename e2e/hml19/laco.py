#!/usr/bin/env python3
"""Physiq hml-19a (H-81 + o laço de leitura de Questionários e Exames, 11/10/2026) — as seções do Prontuário abertas 30 s cada, no Edge.

Com a nutri de TESTE (w5p-nutri) no Prontuário da w5p-aluna, cada seção é aberta pelo botão do Prontuário (sem recarregar o app) e
fica aberta `--segundos` (30 por padrão). A guarda que CONTA (_base.classificar) mede o que a seção fez nesse tempo:
  · padroes_garantir ≤ 1 (a semente do 1º acesso: 1 chamada por abertura — antes, na Anamnese, 227 POST em ~10 s);
  · GET profiles ≤ 2 (o nome e os dados profissionais — antes, ~21 por segundo em Questionários e Exames);
  · 0 gravação em tabela (POST/PATCH/PUT/DELETE em /rest/v1/…).
Padrão (H-81): a nutricao BARRADA no navegador (route.abort): a semente falha e a tela mostra 1 aviso com "Tentar de novo" (Anamnese:
[data-aviso-modelos]; Exames e Documentos: o aviso de erro com o botão), sem toast em laço; o print <base>_a_anamnese_erro.png.
--normal: a nutricao passa (o uso de verdade): os mesmos limites e os prints <base>_a_exames.png, _a_questionarios.png, _a_documentos.png
(e a cópia de 900 px de cada um, para conferir). Nada grava com a nutricao barrada; no --normal, o garantir só grava se a nutri de teste
não tiver o padrão (a tela faria o mesmo ao abrir).
Seções da hml-19a: anamnese, questionarios, exames, documentos. hml-19b: manipulados, metas, orientacoes (a aba Dieta da aluna, pelo
botão da seção; o aviso de cada uma: [data-erro-formulas], [data-erro-metas], [data-aviso-modelos] com o "Tentar de novo"; o print
prints/hml19/b/<prefixo>_b_semente_erro.png com Metas barrada) e app (a aluna no app › Dieta com a nutricao barrada: "Feito" na refeição
da vez → a marca VOLTA e aparece o texto fixo "Sem conexão. Marque de novo quando a internet voltar."; 1 chamada barrada, 0 RPC direta;
o print b_app_erro). Nas seções da Dieta, a guarda do laço (contrato F, H-90): > 2 GET profiles ou > 1 semente → o navegador fecha NA
HORA e o resto da medida fica de fora (anotar no progresso).
Uso: python3 e2e/hml19/laco.py --base local --canal msedge [--prefixo staging2] [--segundos 30] [--secoes anamnese,…,orientacoes,app] [--normal | --antes | --seco]
  --prefixo  o prefixo dos prints (padrão: a base; o depois no staging: staging2, para não cobrir os staging_* do antes)
  --antes o ANTES no staging (o código antigo): só mede e tira os prints staging_a_* (as seções abertas `--segundos`, 8 por padrão — o
          laço de leitura do código antigo pesa no banco; a Anamnese com os modelos barrados no navegador mostra o erro de antes)
  --seco  sem rede e sem navegador: os seletores existem no código e a contagem acerta pedidos de exemplo
"""
from __future__ import annotations

import argparse
import re
import sys
import time
from pathlib import Path

sys.dont_write_bytecode = True
sys.path.insert(0, str(Path(__file__).resolve().parent))
import _base as B  # noqa: E402
import rede as R  # noqa: E402
import rede_dieta as RD  # noqa: E402

C = B.C
SECOES = ("anamnese", "questionarios", "exames", "documentos", "manipulados", "metas", "orientacoes", "app")
DIETA = ("manipulados", "metas", "orientacoes")  # hml-19b: as seções da aba Dieta (o botão [data-secao-dieta-botao] tem o mesmo id)
RAIZ = {"anamnese": "[data-secao-anamnese]", "questionarios": "[data-secao-questionarios]", "exames": "[data-secao-exames]",
        "documentos": "[data-secao-documentos]", "manipulados": "[data-secao-manipulados]", "metas": "[data-secao-metas]",
        "orientacoes": "[data-secao-orientacoes]"}
# o aviso com "Tentar de novo" de cada seção que semeia (com a nutricao barrada)
AVISO = {"anamnese": "[data-aviso-modelos] [data-btn-tentar-modelos]", "exames": "[data-erro-exames] [data-btn-tentar-exames]",
         "documentos": "[data-erro-documentos] [data-btn-tentar-documentos]", "manipulados": "[data-erro-formulas] [data-btn-tentar-formulas]",
         "metas": "[data-erro-metas] [data-btn-tentar-metas]", "orientacoes": "[data-aviso-modelos] [data-btn-tentar-modelos]"}
SEMEIA = {"anamnese", "exames", "documentos", "manipulados", "metas", "orientacoes"}
TEXTO_APP_SEM_REDE = "Sem conexão. Marque de novo quando a internet voltar."
SELETORES = {
    "src/nutricao/prontuario/secoes/Anamnese.tsx": ["data-secao-anamnese", "data-aviso-modelos", "data-btn-tentar-modelos"],
    "src/nutricao/prontuario/secoes/Questionarios.tsx": ["data-secao-questionarios"],
    "src/nutricao/prontuario/secoes/Exames.tsx": ["data-secao-exames", "data-erro-exames", "data-btn-tentar-exames"],
    "src/nutricao/prontuario/secoes/Documentos.tsx": ["data-secao-documentos", "data-erro-documentos", "data-btn-tentar-documentos"],
    "src/painel/aluno/abas/Prontuario.tsx": ["data-secao-prontuario-botao"],
    "src/painel/aluno/abas/Dieta.tsx": ["data-aba-dieta-aluno", "data-acesso-dieta", "data-secao-dieta-botao"],
    "src/nutricao/editor/secoes/Manipulados.tsx": ["data-secao-manipulados", "data-erro-formulas", "data-btn-tentar-formulas"],
    "src/nutricao/editor/secoes/Metas.tsx": ["data-secao-metas", "data-erro-metas", "data-btn-tentar-metas"],
    "src/nutricao/editor/secoes/Orientacoes.tsx": ["data-secao-orientacoes", "data-aviso-modelos", "data-btn-tentar-modelos"],
    "src/nutricao/editor/lib/acesso.ts": ['id: "manipulados"', 'id: "metas"', 'id: "orientacoes"'],
    "src/nutricao/app/refeicaoConcluidaUtil.ts": [TEXTO_APP_SEM_REDE],
    "src/nutricao/app/useDieta.ts": ["retry: 0"],
}


def _funcao(chave: str) -> tuple[str, str | None]:
    """'fn:nome(acao)' → (nome, acao)."""
    m = re.fullmatch(r"fn:([^()]+)(?:\((.*)\))?", chave)
    return (m.group(1), m.group(2)) if m else (chave[3:], None)


def medir(cont, barradas: int, secao: str) -> dict:
    """As outras funções: as que GRAVAM (a regra da Guarda: a nutricao sempre, as de antes pela ação) não podem aparecer; as de
    leitura (ex.: a treino-leitura das avaliações) contam à parte — ≤ 2 na seção aberta, senão é laço."""
    outras = {k: v for k, v in cont.items() if k.startswith("fn:") and k != "fn:nutricao(padroes_garantir)"}
    return {
        "padroes_garantir": cont.get("fn:nutricao(padroes_garantir)", 0),
        "barradas": barradas,
        "get_profiles": cont.get("get_profiles", 0),
        "rest_gravacao": cont.get("rest_prontuario", 0) + cont.get("rest_dieta", 0) + cont.get("rest_outras", 0),
        "outras_funcoes": {k: v for k, v in outras.items() if B.B17.funcao_grava(*_funcao(k))},
        "funcoes_leitura": {k: v for k, v in outras.items() if not B.B17.funcao_grava(*_funcao(k))},
        "secao": secao,
    }


def conferir(o, base: str, m: dict, normal: bool, aviso: bool | None) -> None:
    s = m["secao"]
    limite_garantir = 1 if s in SEMEIA else 0
    o.ok(m["padroes_garantir"] <= limite_garantir, f"[{base}] {s}: padroes_garantir {m['padroes_garantir']} (≤ {limite_garantir})")
    o.ok(m["get_profiles"] <= 2, f"[{base}] {s}: GET profiles {m['get_profiles']} (≤ 2 — antes ~21/s em Questionários e Exames)")
    o.ok(m["rest_gravacao"] == 0, f"[{base}] {s}: 0 gravação em tabela ({m['rest_gravacao']})")
    o.ok(not m["outras_funcoes"] and sum(m["funcoes_leitura"].values()) <= 2,
         f"[{base}] {s}: nenhuma outra função que grava ({m['outras_funcoes']}) e as de leitura sem laço (≤ 2: {m['funcoes_leitura']})")
    if not normal and s in SEMEIA:
        o.ok(m["barradas"] == 1 and aviso, f"[{base}] {s}: a semente barrada 1 vez e o aviso com \"Tentar de novo\" na tela ({m['barradas']}, {aviso})")


def seco(o) -> None:
    faltam = [f"{arq}: {sel}" for arq, sels in SELETORES.items() for sel in sels if sel not in (B.REPO / arq).read_text(encoding="utf-8")]
    o.ok(not faltam, f"os {sum(len(v) for v in SELETORES.values())} seletores existem no código das telas" + (f" — faltam: {faltam}" if faltam else ""))
    laco_antigo = [{"metodo": "GET", "tipo": "tab", "nome": "profiles", "url": f"{B.API_P}/rest/v1/profiles"}] * 976
    m = medir(B.contar(laco_antigo), 0, "questionarios")
    o.ok(m["get_profiles"] == 976 and m["rest_gravacao"] == 0, "a contagem pega o laço de leitura de antes (976 GET profiles em 45,9 s, spec §1.6)")
    garantir_antigo = [{"metodo": "POST", "tipo": "tab", "nome": "modelos_anamnese", "url": f"{B.API_P}/rest/v1/modelos_anamnese"}] * 227
    m = medir(B.contar(garantir_antigo), 0, "anamnese")
    o.ok(m["rest_gravacao"] == 227, "a contagem pega o H-81 de antes (227 POST modelos_anamnese em ~10 s, hml-18)")
    novo = [{"metodo": "POST", "tipo": "fn", "nome": "nutricao", "acao": "padroes_garantir", "url": f"{B.API_P}/functions/v1/nutricao"},
            {"metodo": "GET", "tipo": "tab", "nome": "profiles", "url": f"{B.API_P}/rest/v1/profiles"}]
    m = medir(B.contar(novo), 1, "anamnese")
    o.ok(m["padroes_garantir"] == 1 and m["get_profiles"] == 1 and m["rest_gravacao"] == 0, "a contagem do depois: 1 garantir, 1 GET profiles, 0 gravação")
    # hml-19b: a semente antiga de Manipulados (POST direto) conta como gravação; a seção da Dieta usa o mesmo aviso/raiz da lista
    semente_antiga = [{"metodo": "POST", "tipo": "tab", "nome": "modelos_formula", "url": f"{B.API_P}/rest/v1/modelos_formula"}] * 3
    m = medir(B.contar(semente_antiga), 0, "manipulados")
    o.ok(m["rest_gravacao"] == 3, "a contagem pega a semente antiga de Manipulados (POST direto em modelos_formula = rest_dieta)")
    o.ok(set(DIETA) <= SEMEIA and all(s in AVISO and s in RAIZ for s in DIETA), "Manipulados, Metas e Orientações: raiz, aviso e semente decididos")
    app = [{"metodo": "POST", "tipo": "rpc", "nome": "paciente_marcar_refeicao", "url": f"{B.API_P}/rest/v1/rpc/paciente_marcar_refeicao"}]
    o.ok(B.contar(app).get("rpc_grava") == 1, "o app de antes (a RPC direta paciente_marcar_refeicao) conta como RPC que grava")
    # hml-20a (revisão): o BarrarNutricao deixa a LEITURA passar (a Dieta do app lê pela nutricao: barrada, nem abriria) e barra só o que grava;
    # com leitura=True (explícito), barra a leitura também
    import json  # noqa: PLC0415
    url = f"{B.API_P}/functions/v1/nutricao"
    ler = json.dumps({"acao": "ler", "itens": [{"dia": "2026-10-11", "q": "aluno_dieta"}]})
    marcar = json.dumps({"acao": "aluno_marcar_refeicao", "refeicao_id": "x"})
    disfarcado = json.dumps({"action": "ler", "acao": "aluno_marcar_refeicao"})
    b, todas = B.BarrarNutricao(), B.BarrarNutricao(leitura=True)
    o.ok(not b.barra("POST", url, ler) and b.barra("POST", url, marcar) and b.barra("POST", url, disfarcado) and b.barra("POST", url, None)
         and not b.barra("OPTIONS", url, marcar) and not b.barra("POST", f"{B.API_P}/functions/v1/financeiro", marcar)
         and todas.barra("POST", url, ler) and todas.barra("POST", url, marcar),
         "hml-20a: o BarrarNutricao barra só o que grava (o `ler` passa; o disfarçado e o sem corpo são barrados); leitura=True barra o `ler` também")


class BarrarModelosAntigos:
    """O ANTES (código antigo): a Anamnese lia e semeava os modelos direto em /rest/v1/modelos_anamnese — barrado aqui (route.abort),
    para o print do erro de antes (o toast) ficar ao lado do aviso novo."""

    def __init__(self) -> None:
        self.barradas = 0

    def instalar(self, ctx) -> None:
        def rota(route, req) -> None:
            self.barradas += 1
            route.abort()
        ctx.route(re.compile(r"https://api-principal\.physiqcalc\.com\.br/rest/v1/modelos_anamnese"), rota)


def rodar_antes(o, secoes: list[str], segundos: float, canal: str | None) -> None:
    """O ANTES no staging (o código antigo): só mede e tira os prints staging_a_* — nada é afirmado do comportamento antigo."""
    from playwright.sync_api import sync_playwright  # noqa: PLC0415

    B.usar_base("staging")
    L = B.Sessoes("laco --antes")
    try:
        B.exigir_saude(o, "o laco.py --antes")
        pac = B.B17.matricula_da_aluna()
        with sync_playwright() as pw:
            nav = pw.chromium.launch(channel=canal, args=["--no-sandbox"]) if canal else pw.chromium.launch(args=["--no-sandbox"])
            try:
                for s in [x for x in secoes if x != "app"]:  # o app de antes chama a RPC direto: não há o que barrar na nutricao
                    t = B.B17.Tela(nav, B.BASES["staging"], "hml19_staging", f"antes_{s}")
                    B.LegalDesligado().instalar(t.ctx)
                    barrar = BarrarModelosAntigos() if s == "anamnese" else None
                    if barrar:
                        barrar.instalar(t.ctx)
                    try:
                        t.entrar(L, B.P_CONTA, f"{RD.rota_dieta(pac)}?secao={s}" if s in DIETA else R.rota(pac, s))
                        aberta = t.esperar(lambda: t.tem(RAIZ[s]), 60)
                        t.zerar_pedidos()
                        esperar_secao(t, o, "antes", s, segundos)
                        m = medir(B.contar(t.pedidos), barrar.barradas if barrar else 0, s)
                        o.ok(aberta, f"[antes] {s} abriu no staging ({R.commit_medido('staging')}): {segundos:.0f} s → {m}")
                        if s in DIETA:
                            RD.print_b(t, "staging", f"b_{s}", o)
                        else:
                            R.print_reduzido(t, "staging", "a_anamnese_erro" if s == "anamnese" else f"a_{s}", o)
                    finally:
                        L.do_navegador(B.P_CONTA, t.pg)
                        t.fim()
            finally:
                nav.close()
    except RD.LacoNaTela as e:
        o.linha(f"   [antes] o navegador fechou por laço em {e} (anotar no progresso; a medida desta seção fica de fora)")
    finally:
        L.fechar(o)


def abrir_aba(t, o, base: str, pac: str, aba: str, navegar: bool = True) -> None:
    """Prontuário ou Dieta da aluna (navegar = o app recarrega na rota da aba); a nutri de teste tem de poder mudar (senão a semente
    nem roda)."""
    if navegar:
        t.ir(RD.rota_dieta(pac) if aba == "dieta" else R.rota(pac))
    if aba == "dieta":
        ok = t.esperar(lambda: t.tem("[data-aba-dieta-aluno]") and t.attr("[data-aba-dieta-aluno]", "data-acesso-dieta") == ["editar"], 60)
        o.ok(ok, f"[{base}] a Dieta da aluna abre e a nutri de teste edita ({R.commit_medido(base)})", parar=True)
        # a seção que abre com a aba (o Plano) lê o nome da nutri uns segundos depois: espera a rede acalmar, senão essa leitura cai na
        # conta da 1ª seção medida (11/10 08:28: Manipulados com 3 GET profiles = 2 dela + 1 do Plano; diagnóstico: só 2 dela em 35 s)
        R.esperar_quieto(t, 2, 15)
    else:
        o.ok(t.esperar(lambda: t.tem("[data-aba-prontuario-aluno]"), 60) and t.n('[data-prontuario-editar="1"]') == 1,
             f"[{base}] o Prontuário da aluna abre e a nutri de teste muda o clínico ({R.commit_medido(base)})", parar=True)


def esperar_secao(t, o, base: str, s: str, segundos: float) -> None:
    """A seção fica aberta `segundos`; nas da Dieta, com a guarda do laço (RD.vigiar: > 2 GET profiles ou > 1 semente → LacoNaTela)."""
    t0 = time.time()
    while time.time() - t0 < segundos:
        if s in DIETA:
            RD.vigiar(t, o, f"[{base}] {s}")
        t.pg.wait_for_timeout(500)


def caso_app_erro(o, nav, L, base: str, prefixo: str | None) -> None:
    """O app com a nutricao barrada: "Feito" na refeição da vez → a marca VOLTA, o texto fixo aparece; 1 chamada barrada, 0 RPC direta."""
    barrar = B.BarrarNutricao()
    t = B.B17.Tela(nav, B.BASES[base], f"hml19b_{base}", "laco_app", desktop=False)
    B.LegalDesligado().instalar(t.ctx)
    barrar.instalar(t.ctx)
    try:
        t.entrar(L, B.A_CONTA, "/dieta")
        ok = t.esperar(lambda: t.tem('[data-aba-dieta="plano"]') and RD.refeicao_da_vez(t) is not None, 60)
        if not o.ok(ok, f"[{base}] app: a Dieta da aluna abre com a refeição da vez (o botão Feito)"):
            return
        rid = RD.refeicao_da_vez(t)
        t.zerar_pedidos()
        t.clicar(f'[data-refeicao="{rid}"] [data-refeicao-marcar="feito"]')
        ok = t.esperar(lambda: TEXTO_APP_SEM_REDE in t.texto("body") and t.attr(f'[data-refeicao="{rid}"]', "data-refeicao-estado") == ["agora"], 20)
        RD.print_b(t, prefixo or base, "b_app_erro", o)
        cont = B.contar(t.pedidos)
        o.ok(ok, f"[{base}] app: com a nutricao falhando, a marca VOLTA e aparece \"{TEXTO_APP_SEM_REDE}\"")
        o.ok(dict(barrar.barradas) == {"aluno_marcar_refeicao": 1} and cont.get("rpc_grava", 0) == 0 and cont.get("rest_dieta", 0) == 0,
             f"[{base}] app: 1 chamada (aluno_marcar_refeicao, barrada), 0 RPC direta, 0 rest ({dict(barrar.barradas)}, {R.so_gravacoes(cont)})")
    finally:
        L.do_navegador(B.A_CONTA, t.pg)
        t.fim()


def rodar(o, base: str, secoes: list[str], segundos: float, normal: bool, canal: str | None, prefixo: str | None = None) -> None:
    from playwright.sync_api import sync_playwright  # noqa: PLC0415

    B.usar_base(base)
    L = B.Sessoes(f"laco {base}" + (" --normal" if normal else ""))
    try:
        B.exigir_saude(o, "o laco.py")
        pac = B.B17.matricula_da_aluna()
        barrar = None if normal else B.BarrarNutricao()
        guarda = B.B17.Guarda() if base == "prod" else None
        painel = [s for s in secoes if s != "app"]
        with sync_playwright() as pw:
            nav = pw.chromium.launch(channel=canal, args=["--no-sandbox"]) if canal else pw.chromium.launch(args=["--no-sandbox"])
            try:
                if painel:
                    t = B.B17.Tela(nav, B.BASES[base], f"hml19_{base}", "laco", guarda=guarda)
                    B.LegalDesligado().instalar(t.ctx)
                    try:
                        if barrar:
                            barrar.instalar(t.ctx)
                        aba = "dieta" if painel[0] in DIETA else "prontuario"
                        t.entrar(L, B.P_CONTA, RD.rota_dieta(pac) if aba == "dieta" else R.rota(pac))
                        abrir_aba(t, o, base, pac, aba, navegar=False)
                        for s in painel:
                            precisa = "dieta" if s in DIETA else "prontuario"
                            if precisa != aba:
                                abrir_aba(t, o, base, pac, precisa)
                                aba = precisa
                            antes = sum(barrar.barradas.values()) if barrar else 0
                            t.zerar_pedidos()
                            botao = f'[data-secao-dieta-botao="{s}"]' if s in DIETA else f'[data-secao-prontuario-botao="{s}"]'
                            t.pg.locator(botao).first.click()
                            t.esperar(lambda: t.tem(RAIZ[s]), 45)
                            esperar_secao(t, o, base, s, segundos)
                            aviso = t.tem(AVISO[s]) if s in AVISO else None
                            barradas = (sum(barrar.barradas.values()) - antes) if barrar else 0
                            m = medir(B.contar(t.pedidos), barradas, s)
                            o.linha(f"   {s}: {m}")
                            conferir(o, base, m, normal, aviso)
                            if normal and s in ("exames", "questionarios", "documentos"):
                                R.print_reduzido(t, prefixo or base, f"a_{s}", o)
                            if not normal and s == "anamnese":
                                R.print_reduzido(t, prefixo or base, "a_anamnese_erro", o)
                            if not normal and s == "metas":
                                RD.print_b(t, prefixo or base, "b_semente_erro", o)
                    finally:
                        L.do_navegador(B.P_CONTA, t.pg)
                        t.fim()
                if "app" in secoes:
                    if normal or base == "prod":
                        o.linha("   app: só com a nutricao barrada e fora da produção (pulado)")
                    else:
                        caso_app_erro(o, nav, L, base, prefixo)
            finally:
                nav.close()
    except RD.LacoNaTela as e:
        o.linha(f"   o navegador fechou por laço em {e} (anotar no progresso; o resto da medida fica de fora)")
    finally:
        L.fechar(o)


def main() -> int:
    ap = argparse.ArgumentParser(description="hml-19a — H-81 e o laço de leitura: as seções abertas 30 s")
    ap.add_argument("--base", default="local", choices=tuple(B.BASES))
    ap.add_argument("--canal", default=None, help="msedge (o Edge — sempre nos E2E de tela)")
    ap.add_argument("--segundos", type=float, default=None, help="30 (8 no --antes)")
    ap.add_argument("--secoes", default=",".join(SECOES))
    ap.add_argument("--prefixo", default=None, help="o prefixo dos prints (padrão: a base; o depois no staging: staging2)")
    modo = ap.add_mutually_exclusive_group()
    modo.add_argument("--normal", action="store_true")
    modo.add_argument("--antes", action="store_true")
    modo.add_argument("--seco", action="store_true")
    a = ap.parse_args()
    B.corte_vira_saida()  # o SIGTERM/SIGINT vira SystemExit: o navegador fecha pelo finally mesmo com o processo cortado
    secoes = [s.strip() for s in a.secoes.split(",") if s.strip()]
    if any(s not in SECOES for s in secoes):
        raise SystemExit(f"seção desconhecida (as seções: {', '.join(SECOES)})")
    if a.seco:
        o = C.Saida("laco_seco")
        seco(o)
        return o.fim()
    if a.antes and a.base != "staging":
        raise SystemExit("--antes é o staging com o código antigo (--base staging)")
    segundos = a.segundos if a.segundos is not None else (8 if a.antes else 30)
    o = C.Saida(f"laco_{a.base}" + ("_normal" if a.normal else "_antes" if a.antes else ""))
    try:
        if a.antes:
            rodar_antes(o, secoes, segundos, a.canal)
        else:
            rodar(o, a.base, secoes, segundos, a.normal, a.canal, a.prefixo)
    except (Exception, SystemExit) as e:  # noqa: BLE001
        o.ok(False, f"parou no meio: {type(e).__name__}: {str(e)[:300]}")
    C.C2.registrar_rodada(o.oks, o.oks + o.falhas)
    return o.fim()


if __name__ == "__main__":
    raise SystemExit(main())
