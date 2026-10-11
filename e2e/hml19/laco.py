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
Uso: python3 e2e/hml19/laco.py --base local --canal msedge [--segundos 30] [--secoes anamnese,questionarios,exames,documentos] [--normal | --seco]
  --seco  sem rede e sem navegador: os seletores existem no código e a contagem acerta pedidos de exemplo
"""
from __future__ import annotations

import argparse
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


def medir(cont, barradas: int, secao: str) -> dict:
    return {
        "padroes_garantir": cont.get("fn:nutricao(padroes_garantir)", 0),
        "barradas": barradas,
        "get_profiles": cont.get("get_profiles", 0),
        "rest_gravacao": cont.get("rest_prontuario", 0) + cont.get("rest_outras", 0),
        "outras_funcoes": {k: v for k, v in cont.items() if k.startswith("fn:") and k != "fn:nutricao(padroes_garantir)"},
        "secao": secao,
    }


def conferir(o, base: str, m: dict, normal: bool, aviso: bool | None) -> None:
    s = m["secao"]
    limite_garantir = 1 if s in SEMEIA else 0
    o.ok(m["padroes_garantir"] <= limite_garantir, f"[{base}] {s}: padroes_garantir {m['padroes_garantir']} (≤ {limite_garantir})")
    o.ok(m["get_profiles"] <= 2, f"[{base}] {s}: GET profiles {m['get_profiles']} (≤ 2 — antes ~21/s em Questionários e Exames)")
    o.ok(m["rest_gravacao"] == 0, f"[{base}] {s}: 0 gravação em tabela ({m['rest_gravacao']})")
    o.ok(not m["outras_funcoes"], f"[{base}] {s}: nenhuma outra ação de função ({m['outras_funcoes']})")
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


def rodar(o, base: str, secoes: list[str], segundos: float, normal: bool, canal: str | None) -> None:
    from playwright.sync_api import sync_playwright  # noqa: PLC0415

    B.usar_base(base)
    L = B.B17.Logins()
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
                        R.print_reduzido(t, base, f"a_{s}", o)
                    if not normal and s == "anamnese":
                        R.print_reduzido(t, base, "a_anamnese_erro", o)
            finally:
                t.fim()
                nav.close()
    finally:
        L.fechar(o)


def main() -> int:
    ap = argparse.ArgumentParser(description="hml-19a — H-81 e o laço de leitura: as seções abertas 30 s")
    ap.add_argument("--base", default="local", choices=tuple(B.BASES))
    ap.add_argument("--canal", default=None, help="msedge (o Edge — sempre nos E2E de tela)")
    ap.add_argument("--segundos", type=float, default=30)
    ap.add_argument("--secoes", default=",".join(SECOES))
    modo = ap.add_mutually_exclusive_group()
    modo.add_argument("--normal", action="store_true")
    modo.add_argument("--seco", action="store_true")
    a = ap.parse_args()
    secoes = [s.strip() for s in a.secoes.split(",") if s.strip()]
    if any(s not in SECOES for s in secoes):
        raise SystemExit(f"seção desconhecida (as seções: {', '.join(SECOES)})")
    if a.seco:
        o = C.Saida("laco_seco")
        seco(o)
        return o.fim()
    o = C.Saida(f"laco_{a.base}" + ("_normal" if a.normal else ""))
    try:
        rodar(o, a.base, secoes, a.segundos, a.normal, a.canal)
    except (Exception, SystemExit) as e:  # noqa: BLE001
        o.ok(False, f"parou no meio: {type(e).__name__}: {str(e)[:300]}")
    C.C2.registrar_rodada(o.oks, o.oks + o.falhas)
    return o.fim()


if __name__ == "__main__":
    raise SystemExit(main())
