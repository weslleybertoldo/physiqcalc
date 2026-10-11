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
Seções da hml-19a: anamnese, questionarios, exames, documentos (Manipulados, Metas e Orientações entram na hml-19b).
Uso: python3 e2e/hml19/laco.py --base local --canal msedge [--prefixo staging2] [--segundos 30] [--secoes anamnese,questionarios,exames,documentos] [--normal | --antes | --seco]
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

C = B.C
SECOES = ("anamnese", "questionarios", "exames", "documentos")
RAIZ = {"anamnese": "[data-secao-anamnese]", "questionarios": "[data-secao-questionarios]", "exames": "[data-secao-exames]",
        "documentos": "[data-secao-documentos]"}
# o aviso com "Tentar de novo" de cada seção que semeia (com a nutricao barrada)
AVISO = {"anamnese": "[data-aviso-modelos] [data-btn-tentar-modelos]", "exames": "[data-erro-exames] [data-btn-tentar-exames]",
         "documentos": "[data-erro-documentos] [data-btn-tentar-documentos]"}
SEMEIA = {"anamnese", "exames", "documentos"}
SELETORES = {
    "src/nutricao/prontuario/secoes/Anamnese.tsx": ["data-secao-anamnese", "data-aviso-modelos", "data-btn-tentar-modelos"],
    "src/nutricao/prontuario/secoes/Questionarios.tsx": ["data-secao-questionarios"],
    "src/nutricao/prontuario/secoes/Exames.tsx": ["data-secao-exames", "data-erro-exames", "data-btn-tentar-exames"],
    "src/nutricao/prontuario/secoes/Documentos.tsx": ["data-secao-documentos", "data-erro-documentos", "data-btn-tentar-documentos"],
    "src/painel/aluno/abas/Prontuario.tsx": ["data-secao-prontuario-botao"],
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
        "rest_gravacao": cont.get("rest_prontuario", 0) + cont.get("rest_outras", 0),
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
            for s in secoes:
                t = B.B17.Tela(nav, B.BASES["staging"], "hml19_staging", f"antes_{s}")
                B.LegalDesligado().instalar(t.ctx)
                barrar = BarrarModelosAntigos() if s == "anamnese" else None
                if barrar:
                    barrar.instalar(t.ctx)
                try:
                    t.entrar(L, B.P_CONTA, R.rota(pac, s))
                    aberta = t.esperar(lambda: t.tem(RAIZ[s]), 60)
                    t.zerar_pedidos()
                    t.pg.wait_for_timeout(int(segundos * 1000))
                    m = medir(B.contar(t.pedidos), barrar.barradas if barrar else 0, s)
                    o.ok(aberta, f"[antes] {s} abriu no staging ({R.commit_medido('staging')}): {segundos:.0f} s → {m}")
                    R.print_reduzido(t, "staging", "a_anamnese_erro" if s == "anamnese" else f"a_{s}", o)
                finally:
                    L.do_navegador(B.P_CONTA, t.pg)
                    t.fim()
            nav.close()
    finally:
        L.fechar(o)


def rodar(o, base: str, secoes: list[str], segundos: float, normal: bool, canal: str | None, prefixo: str | None = None) -> None:
    from playwright.sync_api import sync_playwright  # noqa: PLC0415

    B.usar_base(base)
    L = B.Sessoes(f"laco {base}" + (" --normal" if normal else ""))
    try:
        B.exigir_saude(o, "o laco.py")
        pac = B.B17.matricula_da_aluna()
        barrar = None if normal else B.BarrarNutricao()
        guarda = B.B17.Guarda() if base == "prod" else None
        with sync_playwright() as pw:
            nav = pw.chromium.launch(channel=canal, args=["--no-sandbox"]) if canal else pw.chromium.launch(args=["--no-sandbox"])
            t = B.B17.Tela(nav, B.BASES[base], f"hml19_{base}", "laco", guarda=guarda)
            B.LegalDesligado().instalar(t.ctx)
            try:
                if barrar:
                    barrar.instalar(t.ctx)
                t.entrar(L, B.P_CONTA, R.rota(pac))
                o.ok(t.esperar(lambda: t.tem("[data-aba-prontuario-aluno]"), 60) and t.n('[data-prontuario-editar="1"]') == 1,
                     f"[{base}] o Prontuário da aluna abre e a nutri de teste muda o clínico ({R.commit_medido(base)})", parar=True)
                for s in secoes:
                    antes = sum(barrar.barradas.values()) if barrar else 0
                    t.zerar_pedidos()
                    t.pg.locator(f'[data-secao-prontuario-botao="{s}"]').first.click()
                    t.esperar(lambda: t.tem(RAIZ[s]), 45)
                    t0 = time.time()
                    while time.time() - t0 < segundos:
                        t.pg.wait_for_timeout(500)
                    aviso = t.tem(AVISO[s]) if s in AVISO else None
                    barradas = (sum(barrar.barradas.values()) - antes) if barrar else 0
                    m = medir(B.contar(t.pedidos), barradas, s)
                    o.linha(f"   {s}: {m}")
                    conferir(o, base, m, normal, aviso)
                    if normal and s in ("exames", "questionarios", "documentos"):
                        R.print_reduzido(t, prefixo or base, f"a_{s}", o)
                    if not normal and s == "anamnese":
                        R.print_reduzido(t, prefixo or base, "a_anamnese_erro", o)
            finally:
                L.do_navegador(B.P_CONTA, t.pg)
                t.fim()
                nav.close()
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
