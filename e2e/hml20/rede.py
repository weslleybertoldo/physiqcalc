#!/usr/bin/env python3
"""Physiq hml-20a (H-42 · jeito 2, etapa 2, 11/10/2026) — a REDE de cada tela do app do aluno, no navegador (Edge, celular 390 × 844),
antes × depois, na MESMA planilha (hml20/medicao/rede_hml20a.tsv).

Com a aluna de TESTE (w5p-aluna), a rodada abre o Início (goto: a carga fria), a Evolução, a Dieta e o Diário (pela navegação do app) e a
guarda que CONTA (_base.contar_tela) separa, em cada tela:
  · as leituras DIRETAS da área (GET physiq_profiles/physiq_avaliacoes/physiq_registros_fotos/diario_alimentar/fotos_evolucao/
    antropometrias, POST rpc/minha_dieta e rpc/minha_evolucao, POST storage/v1/object/sign/<diario|evolucao|registros>(-staging));
  · as leituras PELA FUNÇÃO (a `ler` da nutricao, com as consultas de cada uma, e a minha_evolucao da admin-avaliacoes);
  · as gravações ao abrir (a regra da Guarda dos E2E, com o corpo) — têm de ser 0.
Depois da hml-20a (--base local, e o staging depois do push): 0 leitura direta do PRINCIPAL da área em todas as telas; no máximo 1 `ler`
por tela (2 quando há série: o Início com a dieta e a evolução em voltas diferentes; as URLs do diário depois da dieta); 0 gravação ao
abrir. DESVIO do gate J (decisão da sessão principal, 12/10/2026; docs/desvios.md): a parte do TREINO da Evolução/Início segue no
navegador, igual ao código antigo — as 3 GET physiq_* (e o sign do registros, com foto) são aceitas SÓ no Início e na Evolução, contadas à
parte; a minha_evolucao da admin-avaliacoes não é chamada pela tela (0). Antes (--base staging com o código antigo): as leituras iam
direto (a linha de base da mesma planilha).
Produção (--base prod): SÓ abre as telas com a Guarda (nada grava; o `ler` e a minha_evolucao passam: são leitura) — 0 gravação tentada.
No fim, o logout (scope=local) da sessão do TREINO que a troca do app abriu neste navegador (decisão 23).
Antes de CADA execução: ~/projetos/physiqcalc-scratch/hml/hml19/ferramentas/pausa.sh "rede.py …" (e o /health, aqui dentro).
Uso: python3 e2e/hml20/rede.py --area aluno --base local|staging|prod --canal msedge [--seco]
  --seco  sem rede e sem navegador: os seletores existem no código das telas e a guarda acerta pedidos de exemplo (antes e depois)
hml-20b: --area painel-aluno = a rede do Painel › Aluno (a nutri: a casca/Resumo, o Prontuário ×10 e a Avaliação; a personal: o Resumo e
a Avaliação) — 0 leitura direta da área, o `ler` por tela, as de fora da área (20c e H-43) à parte, 0 gravação nova; em painel_tela.py
(o docstring de lá), planilha hml20/medicao/rede_hml20b.tsv.
"""
from __future__ import annotations

import argparse
import json
import sys
import time
from pathlib import Path

sys.dont_write_bytecode = True
sys.path.insert(0, str(Path(__file__).resolve().parent))
import _base as B  # noqa: E402

C = B.C
PLANILHA = B.MEDICAO / "rede_hml20a.tsv"
CABECALHO = ["quando", "base", "commit", "fase", "tela", "diretas", "diretas_detalhe", "ler", "consultas", "minha_evolucao", "gravacoes", "pedidos", "t_pronto_s"]
# a tela, a rota e o que diz que o dado chegou (o --seco confere cada seletor no código)
TELAS = (
    ("inicio", "/", "[data-aba-inicio]"),
    ("evolucao", "/evolucao", '[data-aba-evolucao="dados"], [data-aba-evolucao="vazia"]'),
    ("dieta", "/dieta", "[data-aba-dieta]"),
    ("diario", "/dieta?ver=diario", "[data-aba-dieta]"),
)
SELETORES = {
    "src/app-aluno/abas/Inicio.tsx": ["data-aba-inicio"],
    "src/app-aluno/abas/Evolucao.tsx": ["data-aba-evolucao"],
    "src/app-aluno/abas/Dieta.tsx": ["data-aba-dieta", "data-abrir-diario"],
    "src/app-aluno/inicio/CardPeso.tsx": ["data-card-peso"],
}
# depois: o teto de chamadas de leitura por tela (o Início pode ter a dieta e a evolução em 2 voltas; o diário, as URLs depois da dieta)
TETO_LER = {"inicio": 2, "evolucao": 1, "dieta": 2, "diario": 2}
# desvio do gate J: a tela não chama a minha_evolucao (a parte do Treino segue no navegador); as telas que leem o Treino direto
TETO_MINHA_EVOLUCAO = {"inicio": 0, "evolucao": 0, "dieta": 0, "diario": 0}
TELAS_DO_DESVIO = {"inicio", "evolucao"}
GET_DO_DESVIO = {"tab:physiq_profiles", "tab:physiq_avaliacoes", "tab:physiq_registros_fotos"}


def conferir(o, base: str, fase: str, tela: str, cont: dict, pronta: dict) -> None:
    diretas = sum(cont["diretas"].values())
    ler = cont["funcao"].get("fn:nutricao(ler)", 0)
    me = cont["funcao"].get("fn:admin-avaliacoes(minha_evolucao)", 0)
    o.ok(not cont["gravacoes"], f"[{base}] {tela}: 0 gravação ao abrir ({cont['gravacoes'] or '—'})")
    if fase == "antes":
        if tela in ("inicio", "evolucao"):
            o.ok(diretas >= 1, f"[antes] {tela}: a leitura de saúde ia direto do navegador ({cont['diretas']})")
        return
    principal = sum(cont["diretas_principal"].values())
    desvio = cont["desvio"]
    o.ok(principal == 0, f"[depois] {tela}: 0 leitura direta do PRINCIPAL da área (as RPCs, as tabelas e os buckets diario/evolucao) "
         f"({cont['diretas_principal'] or '—'}; total direto {diretas})")
    if tela in TELAS_DO_DESVIO:
        o.ok(set(desvio) >= GET_DO_DESVIO and all(v == 1 for k, v in desvio.items() if k in GET_DO_DESVIO),
             f"[depois] {tela}: o desvio do gate J — a parte do Treino direto do navegador, igual ao antes (as 3 GET physiq_*, 1 vez cada; "
             f"o sign do registros só com foto): {desvio or '—'}")
    else:
        o.ok(not desvio, f"[depois] {tela}: 0 leitura direta do Treino ({desvio or '—'})")
    o.ok(ler <= TETO_LER[tela] and me <= TETO_MINHA_EVOLUCAO[tela],
         f"[depois] {tela}: {ler} `ler` (≤ {TETO_LER[tela]}; consultas {cont['consultas'] or '—'}) e {me} minha_evolucao (≤ {TETO_MINHA_EVOLUCAO[tela]}) "
         f"— t_pronto {pronta['t_pronto_s']} s")


def anotar(base: str, commit: str, fase: str, tela: str, cont: dict, pronta: dict) -> None:
    B.anotar_planilha(PLANILHA, CABECALHO, [
        time.strftime("%Y-%m-%d %H:%M"), base, commit, fase, tela, sum(cont["diretas"].values()),
        ",".join(f"{k}×{v}" for k, v in sorted(cont["diretas"].items())) or "-", cont["funcao"].get("fn:nutricao(ler)", 0),
        ",".join(f"{k}×{v}" for k, v in sorted(cont["consultas"].items())) or "-", cont["funcao"].get("fn:admin-avaliacoes(minha_evolucao)", 0),
        ",".join(f"{k}×{v}" for k, v in sorted(cont["gravacoes"].items())) or "-", len(pronta["pedidos"]), pronta["t_pronto_s"],
    ])


def seco(o) -> None:
    faltam = [f"{arq}: {sel}" for arq, sels in SELETORES.items() for sel in sels if sel not in (B.REPO / arq).read_text(encoding="utf-8")]
    o.ok(not faltam, f"os {sum(len(v) for v in SELETORES.values())} seletores existem no código das telas" + (f" — faltam: {faltam}" if faltam else ""))
    rotas = (B.REPO / "src" / "app-aluno" / "catalogoAbas.ts").read_text(encoding="utf-8") if (B.REPO / "src" / "app-aluno" / "catalogoAbas.ts").exists() else ""
    o.ok(all(r in rotas for r in ('"/evolucao"', '"/dieta"')) or not rotas, "as rotas das abas (Evolução, Dieta) estão no catálogo de abas do app")
    P, T = B.API_P, B.API_T
    antes = [
        {"metodo": "GET", "tipo": "tab", "nome": "physiq_profiles", "url": f"{T}/rest/v1/physiq_profiles?select=id", "corpo": ""},
        {"metodo": "GET", "tipo": "tab", "nome": "physiq_avaliacoes", "url": f"{T}/rest/v1/physiq_avaliacoes?select=*", "corpo": ""},
        {"metodo": "POST", "tipo": "rpc", "nome": "minha_evolucao", "url": f"{P}/rest/v1/rpc/minha_evolucao", "corpo": "{}"},
        {"metodo": "POST", "tipo": "rpc", "nome": "minha_dieta", "url": f"{P}/rest/v1/rpc/minha_dieta", "corpo": "{}"},
        {"metodo": "POST", "tipo": "storage", "nome": "sign", "url": f"{P}/storage/v1/object/sign/evolucao-staging", "corpo": "{}"},
        {"metodo": "POST", "tipo": "storage", "nome": "sign", "url": f"{T}/storage/v1/object/sign/registros-staging", "corpo": "{}"},
        {"metodo": "POST", "tipo": "rpc", "nome": "minha_agenda", "url": f"{P}/rest/v1/rpc/minha_agenda", "corpo": "{}"},  # fora da área
        {"metodo": "GET", "tipo": "tab", "nome": "avisos", "url": f"{P}/rest/v1/avisos?select=*", "corpo": ""},  # fora da área (H-43)
    ]
    c = B.contar_tela(antes)
    o.ok(sum(c["diretas"].values()) == 6 and not c["funcao"] and not c["gravacoes"],
         f"a guarda do ANTES: 6 leituras diretas da área (e as de fora da área não contam): {c['diretas']}")
    corpo_ler = json.dumps({"acao": "ler", "itens": [{"dia": "2026-10-11", "q": "aluno_dieta"}, {"q": "aluno_evolucao"}]})
    depois = [
        {"metodo": "POST", "tipo": "fn", "nome": "nutricao", "acao": "ler", "url": f"{P}/functions/v1/nutricao", "corpo": corpo_ler},
        # o desvio do gate J: a parte do Treino direto (as 3 GET; o sign do registros com foto)
        {"metodo": "GET", "tipo": "tab", "nome": "physiq_profiles", "url": f"{T}/rest/v1/physiq_profiles?select=id", "corpo": ""},
        {"metodo": "GET", "tipo": "tab", "nome": "physiq_avaliacoes", "url": f"{T}/rest/v1/physiq_avaliacoes?select=*", "corpo": ""},
        {"metodo": "GET", "tipo": "tab", "nome": "physiq_registros_fotos", "url": f"{T}/rest/v1/physiq_registros_fotos?select=id", "corpo": ""},
        {"metodo": "POST", "tipo": "storage", "nome": "sign", "url": f"{T}/storage/v1/object/sign/registros-staging", "corpo": "{}"},
        {"metodo": "OPTIONS", "tipo": "fn", "nome": "nutricao", "acao": None, "url": f"{P}/functions/v1/nutricao", "corpo": ""},
        {"metodo": "POST", "tipo": "fn", "nome": "pos-login", "acao": None, "url": f"{P}/functions/v1/pos-login", "corpo": "{}"},
        {"metodo": "POST", "tipo": "fn", "nome": "trocar-token", "acao": None, "url": f"{T}/functions/v1/trocar-token", "corpo": "{}"},
        {"metodo": "GET", "tipo": "storage", "nome": "sign", "url": f"{P}/storage/v1/object/sign/evolucao-staging/a/b.jpg?token=t", "corpo": ""},
    ]
    c = B.contar_tela(depois)
    o.ok(c["diretas_principal"] == {} and c["desvio"] == {"tab:physiq_profiles": 1, "tab:physiq_avaliacoes": 1, "tab:physiq_registros_fotos": 1,
                                                           "sign:registros-staging": 1}
         and c["funcao"] == {"fn:nutricao(ler)": 1} and c["consultas"] == {"aluno_dieta": 1, "aluno_evolucao": 1} and not c["gravacoes"],
         f"a guarda do DEPOIS: 0 direta do principal, o desvio do Treino à parte, 1 `ler` (as 2 consultas), 0 gravação (o GET da imagem não conta): {c}")
    principal_direto = B.contar_tela([{"metodo": "POST", "tipo": "rpc", "nome": "minha_evolucao", "url": f"{P}/rest/v1/rpc/minha_evolucao", "corpo": "{}"},
                                      {"metodo": "POST", "tipo": "storage", "nome": "sign", "url": f"{P}/storage/v1/object/sign/diario-staging", "corpo": "{}"}])
    o.ok(principal_direto["diretas_principal"] == {"rpc:minha_evolucao": 1, "sign:diario-staging": 1} and not principal_direto["desvio"],
         "o desvio é SÓ o Treino: a RPC e o sign do principal seguem contando como leitura direta (têm de ser 0)")
    grava = [
        {"metodo": "POST", "tipo": "fn", "nome": "nutricao", "acao": "aluno_marcar_refeicao", "url": f"{P}/functions/v1/nutricao",
         "corpo": json.dumps({"acao": "aluno_marcar_refeicao"})},
        {"metodo": "POST", "tipo": "fn", "nome": "nutricao", "acao": "ler", "url": f"{P}/functions/v1/nutricao",
         "corpo": json.dumps({"action": "ler", "acao": "anotacao_criar"})},
        {"metodo": "POST", "tipo": "tab", "nome": "diario_alimentar", "url": f"{P}/rest/v1/diario_alimentar", "corpo": "{}"},
    ]
    c = B.contar_tela(grava)
    o.ok(sum(c["gravacoes"].values()) == 3 and not c["funcao"], f"a guarda acha as gravações ao abrir (o `ler` disfarçado também): {c['gravacoes']}")
    o.ok(set(TETO_LER) == {t for t, _r, _m in TELAS} == set(TETO_MINHA_EVOLUCAO) and not any(TETO_MINHA_EVOLUCAO.values())
         and TELAS_DO_DESVIO < set(TETO_LER) and GET_DO_DESVIO < B.AREAS["aluno"]["desvio"],
         "cada tela tem o teto de chamadas de leitura do depois; a minha_evolucao = 0 (o desvio); o desvio aceito só no Início e na Evolução")
    o.ok(B.fase_do_codigo("local", "x") == "depois" and B.fase_do_codigo("staging", "637363f") == "antes",
         "antes × depois vem do CÓDIGO medido (o 637363f não tem src/nutricao/leitura.ts: antes)")


def rodar(o, base: str, canal: str | None) -> None:
    from playwright.sync_api import sync_playwright  # noqa: PLC0415

    B.usar_base(base)
    L = B.Sessoes(f"rede20 {base}")
    commit = B.commit_medido(base)
    fase = B.fase_do_codigo(base, commit)
    try:
        B.exigir_saude(o, "o rede.py da hml-20")
        guarda = B.Guarda() if base == "prod" else None
        with sync_playwright() as pw:
            nav = pw.chromium.launch(channel=canal, args=["--no-sandbox"]) if canal else pw.chromium.launch(args=["--no-sandbox"])
            t = B.Tela(nav, B.BASES[base], f"hml20_{base}", "rede", desktop=False, guarda=guarda)
            B.LegalDesligado().instalar(t.ctx)
            pend = B.Pendentes(t.pg)
            try:
                o.linha(f"[{base}] {commit}: o {fase}")
                for i, (tela, rota, marca) in enumerate(TELAS):
                    if i == 0:
                        t.entrar(L, B.A_CONTA, rota)  # a sessão antes do 1º documento; o aceite e o "mudou" saem pelo LegalDesligado
                    else:
                        B.navegar(t, rota)
                    pronta = B.esperar_pronto(t, pend, marca=marca, max_s=40 if i == 0 else B.MAX_S)
                    o.ok(t.n(marca) > 0, f"[{base}] {tela}: a tela abriu ({marca}; marca em {pronta['t_marca_s']} s)")
                    cont = B.contar_tela(pronta["pedidos"])
                    conferir(o, base, fase, tela, cont, pronta)
                    anotar(base, commit, fase, tela, cont, pronta)
                if guarda:
                    o.ok(not guarda.bloqueadas, f"[prod] a Guarda não barrou nada (as telas só leram; o `ler` e a minha_evolucao passam): {guarda.bloqueadas or '—'}")
            finally:
                B.sair_do_treino(o, t.pg, f"[{base}] rede")
                L.do_navegador(B.A_CONTA, t.pg)
                t.fim()
                nav.close()
    finally:
        L.fechar(o)


def main() -> int:
    ap = argparse.ArgumentParser(description="hml-20 — a rede das telas (antes × depois): o app do aluno (20a) e o Painel › Aluno (20b)")
    ap.add_argument("--area", default="aluno", choices=("aluno", "painel-aluno"))
    ap.add_argument("--base", default="local", choices=tuple(B.BASES))
    ap.add_argument("--canal", default=None, help="msedge (o Edge — sempre nos E2E de tela)")
    ap.add_argument("--seco", action="store_true")
    a = ap.parse_args()
    B.corte_vira_saida()
    painel = None
    if a.area == "painel-aluno":  # hml-20b: o Painel › Aluno (painel_tela.py)
        import painel_tela as painel  # noqa: PLC0415
    if a.seco:
        o = C.Saida(f"rede20_{a.area}_seco")
        painel.seco(o, "rede") if painel else seco(o)
        return o.fim()
    o = C.Saida(f"rede20_{a.area}_{a.base}")
    try:
        painel.rodar_rede(o, a.base, a.canal) if painel else rodar(o, a.base, a.canal)
    except (Exception, SystemExit) as e:  # noqa: BLE001
        o.ok(False, f"parou no meio: {type(e).__name__}: {str(e)[:300]}")
    C.C2.registrar_rodada(o.oks, o.oks + o.falhas)
    return o.fim()


if __name__ == "__main__":
    raise SystemExit(main())
