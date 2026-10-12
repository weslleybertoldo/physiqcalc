#!/usr/bin/env python3
"""Physiq hml-20a (H-42 · jeito 2, etapa 2, 11/10/2026) — as TELAS do app do aluno (Edge, celular 390 × 844): os prints da spec §5 e o
tempo de cada tela antes × depois, com a aluna de TESTE (w5p-aluna). Só local e staging (a produção é o F8 da sessão principal:
w07/smoke_prod.py telas + rede.py --base prod).
Prints (prints/hml20/a/<base>_<caso>.png + a cópia de 900 px para conferir — tela certa, sem login nem "carregando"):
  a_inicio            o Início (o card do peso com o dado)
  a_evolucao          a Evolução (as avaliações; a aluna de teste não tem foto)
  a_dieta             a Dieta
  a_evolucao_cache    a Evolução reaberta: o Cache Storage mostra a última abertura na hora (antes de a rede responder)
  a_evolucao_offline  a Evolução sem rede: o que foi aberto + o aviso "Sem conexão · mostrando o que foi aberto…"
  a_evolucao_erro     a Evolução com a parte do Treino barrada (o REST do Treino — antes e depois: a parte do Treino segue no navegador,
                      o desvio do gate J): o aviso da parte do Treino (o texto fixo) por cima do que foi aberto
Tempo (spec §4 e contrato K/J), pela regra do medir_leituras20.py da spec (pronto = sem esqueleto/"carregando" e sem pedido pendente,
quieto 3 s): cada tela aberta 3 vezes pela navegação do app (aquecido), a mediana ≤ a do ANTES + 0,3 s (o antes = a rodada do staging com
o código antigo nesta mesma planilha; sem ela, o da spec, hml20/medicao/rede_por_tela.tsv); o Início pelo instante em que o card do peso
mostra o dado. GATE J (só no depois): a Evolução com o Cache Storage VAZIO, 5 aberturas: mediana ≤ 1,3 s; e o card do peso do Início com
o cache vazio (3 aberturas) sem piora visível (≤ o antes + 0,3 s). Reprovou → a linha "GATE REPROVADO …" (a decisão é da sessão principal).
Depois do gate reprovado (12/10/2026, decisão da sessão principal: a parte do TREINO segue no navegador — o desvio do docs/desvios.md),
o gate mede a 1ª abertura de verdade: a função ociosa (ESPERA_GATE_S, ~30 s, antes de CADA abertura com o cache vazio) e, além do teto
de 1,3 s, a Evolução também ≤ o antes + 0,3 s (o antes medido pela MESMA regra: as medidas *_ociosa).
Planilha: hml20/medicao/telas_hml20a.tsv (antes × depois). No fim, o logout da sessão do TREINO que a troca do app abriu (decisão 23).
Antes de CADA execução: ~/projetos/physiqcalc-scratch/hml/hml19/ferramentas/pausa.sh "telas.py …" (e o /health, aqui dentro).
Uso: python3 e2e/hml20/telas.py --area aluno --base local|staging --canal msedge [--casos prints,tempo,gate] [--prefixo staging2] [--seco]
hml-20b: --area painel-aluno = as telas do Painel › Aluno: os prints b_* (prints/hml20/b) e o tempo antes × depois (decisão J; o Resumo e a
Avaliação pela parte do principal) — em painel_tela.py (o docstring de lá); os casos: prints,tempo; o antes com --prefixo antes_staging.
hml-20c: --area dieta = as telas da Dieta ×8, das Dietas ×3, da Pré-consulta ×2 e do Dashboard: os prints c_* (prints/hml20/c), a foto do
diário, o fluxo da Pré-consulta pela tela, o c_dieta_erro e o tempo antes × depois (decisão M; o Dashboard pela parte da 20c) — em
dieta_tela.py; os casos: prints,tempo; o antes com --prefixo antes_staging.
hml-20d: --area financeiro = as 6 abas do Financeiro, o Financeiro do aluno, o Dashboard da personal (a parte do Financeiro) e o Início/Perfil
da aluna: os prints d_* (prints/hml20/d) e o tempo antes × depois (decisão M) — em financeiro_tela.py; os casos: prints,tempo; o antes com
--prefixo antes_staging.
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

C = B.C
PLANILHA = B.MEDICAO / "telas_hml20a.tsv"
CABECALHO = ["quando", "base", "commit", "fase", "medida", "n", "valores_s", "mediana_s", "referencia_s", "ok"]
PRINTS = ("a_inicio", "a_evolucao", "a_dieta", "a_evolucao_cache", "a_evolucao_offline", "a_evolucao_erro")
CASOS = ("prints", "tempo", "gate")
FOLGA_S = 0.3        # contrato K: cada tela ≤ antes + 0,3 s
GATE_EVOLUCAO_S = 1.3  # contrato J: a Evolução com o Cache Storage vazio, p50 ≤ 1,3 s
ABERTURAS_TEMPO = 3
ABERTURAS_GATE = 5
NOME_CACHE_EVOLUCAO = "supabase-api-cache-evolucao"
DADOS_EVOLUCAO = '[data-aba-evolucao="dados"], [data-aba-evolucao="vazia"]'
DADOS_PESO = '[data-card-peso="dados"], [data-card-peso="vazio"]'
TELAS_TEMPO = (("inicio", "/", DADOS_PESO), ("evolucao", "/evolucao", DADOS_EVOLUCAO), ("dieta", "/dieta", "[data-aba-dieta]"))
SELETORES = {
    "src/app-aluno/abas/Evolucao.tsx": ["data-aba-evolucao", "data-evolucao-aviso"],
    "src/app-aluno/inicio/CardPeso.tsx": ['data-card-peso="dados"', 'data-card-peso="vazio"'],
    "src/app-aluno/abas/Dieta.tsx": ["data-aba-dieta"],
    "src/app-aluno/abas/Inicio.tsx": ["data-aba-inicio", "data-inicio-nome"],
    "src/evolucao/cache.ts": [NOME_CACHE_EVOLUCAO],
}
# a parte do Treino da Evolução, barrada no navegador (o a_evolucao_erro): o REST do Treino (antes e depois — o desvio do gate J)
BARRA_TREINO = re.compile(r"https://api\.physiqcalc\.com\.br/rest/v1/physiq_(profiles|avaliacoes|registros_fotos)")
# o gate depois do gate reprovado: a função ociosa antes de cada abertura (a 1ª abertura de verdade); as medidas com o sufixo _ociosa
ESPERA_GATE_S = 30.0
MEDIDA_GATE_EVOLUCAO = "gate:evolucao_cache_vazio_ociosa"
MEDIDA_GATE_PESO = "gate:peso_cache_vazio_ociosa"


def referencia(medida: str) -> float | None:
    """O ANTES desta medida: a última rodada do staging com o código antigo nesta planilha; sem ela, o número da spec."""
    if PLANILHA.exists():
        linhas = PLANILHA.read_text(encoding="utf-8").splitlines()
        cab = linhas[0].split("\t") if linhas else []
        antes = [dict(zip(cab, l.split("\t"))) for l in linhas[1:]]
        antes = [x for x in antes if x.get("fase") == "antes" and x.get("medida") == medida and x.get("mediana_s") not in ("", "None")]
        if antes:
            return float(antes[-1]["mediana_s"])
    spec = B.antes_da_spec()
    return {"tempo:evolucao": spec.get("/evolucao"), "tempo:dieta": spec.get("/dieta")}.get(medida)


def anotar(base: str, commit: str, fase: str, medida: str, valores: list[float | None], mediana: float | None, ref: float | None, ok: object) -> None:
    B.anotar_planilha(PLANILHA, CABECALHO, [time.strftime("%Y-%m-%d %H:%M"), base, commit, fase, medida, len(valores),
                                            ",".join(str(v) for v in valores), mediana, ref, ok])


def limpar_cache_evolucao(t) -> bool:
    try:
        return bool(t.pg.evaluate(f"async () => caches.delete({NOME_CACHE_EVOLUCAO!r})"))
    except Exception:  # noqa: BLE001
        return False


def abrir(t, pend, rota: str, marca: str, desvio: str = "/perfil", max_s: float = B.MAX_S) -> dict:
    """Sai para outra aba e volta (a navegação do app: a tela monta de novo) e espera ficar pronta."""
    B.navegar(t, desvio)
    t.pg.wait_for_timeout(600)
    B.navegar(t, rota)
    return B.esperar_pronto(t, pend, marca=marca, max_s=max_s)


def caso_prints(o, t, pend, base: str, fase: str, prefixo: str | None = None) -> None:
    pr = lambda caso: B.print_reduzido(t.pg, prefixo or base, caso, o)  # noqa: E731
    ok = t.esperar(lambda: t.n(DADOS_PESO) > 0, 60)
    o.ok(ok, f"[{base}] a_inicio: o Início com o card do peso ({(t.attr('[data-card-peso]', 'data-card-peso') or ['?'])[0]})")
    pr("a_inicio")
    r = abrir(t, pend, "/evolucao", DADOS_EVOLUCAO)
    o.ok(t.n(DADOS_EVOLUCAO) > 0 and not t.n("[data-evolucao-aviso]"), f"[{base}] a_evolucao: a Evolução com o dado, sem aviso (pronta em {r['t_pronto_s']} s)")
    pr("a_evolucao")
    r = abrir(t, pend, "/dieta", "[data-aba-dieta]")
    o.ok(t.n("[data-aba-dieta]") > 0 and not t.n("[data-dieta-erro]"), f"[{base}] a_dieta: a Dieta (pronta em {r['t_pronto_s']} s)")
    pr("a_dieta")
    # a_evolucao_cache: a reabertura mostra a última abertura NA HORA (o Cache Storage), antes de a rede responder
    B.navegar(t, "/perfil")
    t.pg.wait_for_timeout(600)
    B.navegar(t, "/evolucao")
    t0 = time.time()
    na_hora = t.esperar(lambda: t.n(DADOS_EVOLUCAO) > 0, 5, passo=0.05)
    em_voo = pend.n
    ms = round((time.time() - t0) * 1000)
    o.ok(na_hora, f"[{base}] a_evolucao_cache: reaberta, o dado em {ms} ms (com {em_voo} pedido(s) ainda em voo: o que foi aberto, do aparelho)")
    pr("a_evolucao_cache")
    B.esperar_pronto(t, pend, marca=DADOS_EVOLUCAO)
    # a_evolucao_offline: sem rede, o que foi aberto + o aviso
    B.navegar(t, "/perfil")
    t.pg.wait_for_timeout(600)
    t.ctx.set_offline(True)
    try:
        B.navegar(t, "/evolucao")
        ok = t.esperar(lambda: t.n('[data-evolucao-aviso="sem-conexao"]') > 0 and t.n(DADOS_EVOLUCAO) > 0, 20)
        o.ok(ok, f"[{base}] a_evolucao_offline: sem rede, o que foi aberto + \"{t.texto('[data-evolucao-aviso]')[:60]}\"")
        pr("a_evolucao_offline")
    finally:
        t.ctx.set_offline(False)
    # a_evolucao_erro: a parte do Treino barrada (o aviso dela, o texto fixo, por cima do que foi aberto)
    B.navegar(t, "/perfil")
    t.pg.wait_for_timeout(1500)
    barra = BARRA_TREINO
    t.ctx.route(barra, lambda r: r.abort())
    try:
        B.navegar(t, "/evolucao")
        ok = t.esperar(lambda: t.n('[data-evolucao-aviso="erro"]') > 0, 40)
        o.ok(ok, f"[{base}] a_evolucao_erro: a parte do Treino barrada → \"{t.texto('[data-evolucao-aviso]')[:70]}\"")
        pr("a_evolucao_erro")
    finally:
        t.ctx.unroute(barra)


def caso_tempo(o, t, pend, base: str, commit: str, fase: str) -> None:
    for tela, rota, marca in TELAS_TEMPO:
        valores: list[float | None] = []
        for _ in range(ABERTURAS_TEMPO):
            r = abrir(t, pend, rota, marca)
            valores.append(r["t_marca_s"] if tela == "inicio" else r["t_pronto_s"])
        med = B.mediana(valores)
        medida = f"tempo:{tela}"
        ref = referencia(medida)
        ok = None if fase == "antes" or ref is None or med is None else med <= ref + FOLGA_S
        anotar(base, commit, fase, medida, valores, med, ref, ok)
        if fase == "antes":
            o.linha(f"   [antes] {tela}: {valores} → mediana {med} s (a referência do depois)")
            continue
        o.ok(ok is not False, f"[depois] {tela}: mediana {med} s ≤ antes {ref} + {FOLGA_S} s ({valores})" + (" — sem o antes medido" if ref is None else ""))


def caso_gate(o, t, pend, base: str, commit: str, fase: str) -> None:
    """GATE J: a Evolução com o Cache Storage vazio (5 aberturas) e o card do peso do Início com o cache vazio (3 aberturas) — cada
    abertura depois de ESPERA_GATE_S parado no Perfil (a função ociosa: a 1ª abertura de verdade)."""
    espera_ms = int(ESPERA_GATE_S * 1000)
    ev: list[float | None] = []
    for _ in range(ABERTURAS_GATE):
        B.navegar(t, "/perfil")
        t.pg.wait_for_timeout(espera_ms)
        limpar_cache_evolucao(t)
        B.navegar(t, "/evolucao")
        r = B.esperar_pronto(t, pend, marca=DADOS_EVOLUCAO)
        ev.append(r["t_pronto_s"])
    med = B.mediana(ev)
    ref_ev = referencia(MEDIDA_GATE_EVOLUCAO)
    ok_ev = med is not None and med <= GATE_EVOLUCAO_S and (ref_ev is None or med <= ref_ev + FOLGA_S)
    anotar(base, commit, fase, MEDIDA_GATE_EVOLUCAO, ev, med, ref_ev, ok_ev if fase == "depois" else None)
    peso: list[float | None] = []
    for _ in range(ABERTURAS_TEMPO):
        B.navegar(t, "/perfil")
        t.pg.wait_for_timeout(espera_ms)
        limpar_cache_evolucao(t)
        B.navegar(t, "/")
        r = B.esperar_pronto(t, pend, marca=DADOS_PESO)
        peso.append(r["t_marca_s"])
    med_p = B.mediana(peso)
    ref_p = referencia(MEDIDA_GATE_PESO)
    ok_p = None if fase == "antes" or ref_p is None or med_p is None else med_p <= ref_p + FOLGA_S
    anotar(base, commit, fase, MEDIDA_GATE_PESO, peso, med_p, ref_p, ok_p)
    if fase == "antes":
        o.linha(f"   [antes] gate (a função ociosa {ESPERA_GATE_S:.0f} s): Evolução cache vazio {ev} → mediana {med} s; card do peso {peso} → "
                f"mediana {med_p} s (a referência)")
        return
    if not o.ok(ok_ev, f"[depois] GATE J: a Evolução com o Cache Storage vazio, 5 aberturas (a função ociosa {ESPERA_GATE_S:.0f} s) → mediana "
                       f"{med} s ≤ {GATE_EVOLUCAO_S} s e ≤ antes {ref_ev} + {FOLGA_S} s ({ev})"):
        o.linha(f"GATE REPROVADO evolucao_cache_vazio_ociosa mediana={med}s valores={ev} (≤ {GATE_EVOLUCAO_S} s; antes {ref_ev}) — a decisão é da sessão principal")
    if not o.ok(ok_p is not False, f"[depois] GATE J: o card do peso do Início com o cache vazio (a função ociosa) → mediana {med_p} s (antes {ref_p}; "
                                   f"≤ antes + {FOLGA_S} s) ({peso})"):
        o.linha(f"GATE REPROVADO peso_cache_vazio_ociosa mediana={med_p}s valores={peso} (antes {ref_p} + {FOLGA_S} s) — a decisão é da sessão principal")


def seco(o) -> None:
    faltam = [f"{arq}: {sel}" for arq, sels in SELETORES.items() for sel in sels if sel not in (B.REPO / arq).read_text(encoding="utf-8")]
    o.ok(not faltam, f"os {sum(len(v) for v in SELETORES.values())} seletores existem no código" + (f" — faltam: {faltam}" if faltam else ""))
    o.ok(set(PRINTS) == {"a_inicio", "a_evolucao", "a_dieta", "a_evolucao_cache", "a_evolucao_offline", "a_evolucao_erro"},
         "os 6 prints a_* da spec §5")
    o.ok(B.PRINTS == Path.home() / "projetos" / "physiqcalc-scratch" / "prints" / "hml20" / "a", f"a pasta dos prints: {B.PRINTS}")
    spec = B.antes_da_spec()
    o.ok(spec.get("/evolucao") == 0.66 and spec.get("/dieta") == 0.22, f"o antes da spec (rede_por_tela.tsv): Evolução {spec.get('/evolucao')} s, Dieta {spec.get('/dieta')} s")
    o.ok((FOLGA_S, GATE_EVOLUCAO_S, ABERTURAS_TEMPO, ABERTURAS_GATE) == (0.3, 1.3, 3, 5), "os números do contrato: ≤ antes + 0,3 s (3 aberturas); gate ≤ 1,3 s (5 aberturas)")
    o.ok(B.mediana([1.0, None, 3.0, 2.0]) == 2.0 and B.mediana([1.0, 2.0]) == 1.5 and B.mediana([None]) is None, "a mediana ignora a abertura que não ficou pronta")
    o.ok(BARRA_TREINO.match("https://api.physiqcalc.com.br/rest/v1/physiq_avaliacoes?select=*") and BARRA_TREINO.match("https://api.physiqcalc.com.br/rest/v1/physiq_profiles?id=eq.x")
         and not BARRA_TREINO.match("https://api-principal.physiqcalc.com.br/functions/v1/nutricao") and not BARRA_TREINO.match("https://api.physiqcalc.com.br/functions/v1/admin-avaliacoes"),
         "o a_evolucao_erro barra SÓ a parte do Treino (o REST do Treino, antes e depois — o desvio do gate J)")
    o.ok(ESPERA_GATE_S == 30.0 and MEDIDA_GATE_EVOLUCAO.endswith("_ociosa") and MEDIDA_GATE_PESO.endswith("_ociosa"),
         "o gate mede a 1ª abertura de verdade: a função ociosa 30 s antes de cada abertura; o antes pela MESMA regra (as medidas _ociosa)")
    o.ok(B.MAX_S == 30.0 and B.QUIETO_S == 3.0 and B.MIN_S == 5.0, "a regra do pronto é a da spec (medir_leituras20.py: quieto 3 s, mínimo 5 s, máximo 30 s)")


def rodar(o, base: str, canal: str | None, casos: list[str], prefixo: str | None = None) -> None:
    from playwright.sync_api import sync_playwright  # noqa: PLC0415

    if base == "prod":
        raise SystemExit("telas.py é local e staging (a produção é o F8 da sessão principal: w07/smoke_prod.py telas + rede.py --base prod)")
    B.usar_base(base)
    L = B.Sessoes(f"telas20 {base}")
    commit = B.commit_medido(base)
    fase = B.fase_do_codigo(base, commit)
    try:
        B.exigir_saude(o, "o telas.py da hml-20")
        with sync_playwright() as pw:
            nav = pw.chromium.launch(channel=canal, args=["--no-sandbox"]) if canal else pw.chromium.launch(args=["--no-sandbox"])
            t = B.Tela(nav, B.BASES[base], f"hml20_{base}", "telas", desktop=False)
            B.LegalDesligado().instalar(t.ctx)
            pend = B.Pendentes(t.pg)
            try:
                o.linha(f"[{base}] {commit}: o {fase}")
                t.entrar(L, B.A_CONTA, "/")
                o.ok(t.esperar(lambda: t.n("[data-aba-inicio]") > 0, 60), f"[{base}] o app da aluna de teste abriu no Início", parar=True)
                if "prints" in casos:
                    caso_prints(o, t, pend, base, fase, prefixo)
                if "tempo" in casos:
                    caso_tempo(o, t, pend, base, commit, fase)
                if "gate" in casos:
                    caso_gate(o, t, pend, base, commit, fase)
            finally:
                B.sair_do_treino(o, t.pg, f"[{base}] telas")
                L.do_navegador(B.A_CONTA, t.pg)
                t.fim()
                nav.close()
    finally:
        L.fechar(o)


def main() -> int:
    ap = argparse.ArgumentParser(description="hml-20 — as telas: o app do aluno (20a: prints a_*, tempo, gate J), o Painel › Aluno (20b: prints b_*, tempo), a Dieta/Dietas/Pré-consulta/Dashboard (20c: prints c_*, tempo) e o Financeiro (20d: prints d_*, tempo)")
    ap.add_argument("--area", default="aluno", choices=("aluno", "painel-aluno", "dieta", "financeiro"))
    ap.add_argument("--base", default="local", choices=("local", "staging"))
    ap.add_argument("--canal", default=None, help="msedge (o Edge — sempre nos E2E de tela)")
    ap.add_argument("--casos", default=None, help="aluno: prints,tempo,gate · painel-aluno e dieta: prints,tempo")
    # o nome dos prints (<prefixo>_a_*.png; padrão = a base): o F7 no staging usa staging2 e não grava por cima dos staging_a_* do antes
    ap.add_argument("--prefixo", default=None)
    ap.add_argument("--seco", action="store_true")
    a = ap.parse_args()
    B.corte_vira_saida()
    painel = None
    validos = CASOS
    if a.area == "painel-aluno":  # hml-20b: o Painel › Aluno (painel_tela.py)
        import painel_tela as painel  # noqa: PLC0415
        validos = ("prints", "tempo")
    if a.area == "dieta":  # hml-20c: a Dieta, as Dietas, a Pré-consulta e o Dashboard (dieta_tela.py)
        import dieta_tela as painel  # noqa: PLC0415
        validos = ("prints", "tempo")
    if a.area == "financeiro":  # hml-20d: as 6 abas, o Financeiro do aluno, o Dashboard e o gate do app (financeiro_tela.py)
        import financeiro_tela as painel  # noqa: PLC0415
        validos = ("prints", "tempo")
    casos = [c.strip() for c in (a.casos or ",".join(validos)).split(",") if c.strip()]
    if any(c not in validos for c in casos):
        raise SystemExit(f"caso desconhecido (os casos: {', '.join(validos)})")
    if a.seco:
        o = C.Saida(f"telas20_{a.area}_seco")
        painel.seco(o, "telas") if painel else seco(o)
        return o.fim()
    o = C.Saida(f"telas20_{a.area}_{a.base}")
    try:
        painel.rodar_telas(o, a.base, a.canal, casos, a.prefixo) if painel else rodar(o, a.base, a.canal, casos, a.prefixo)
    except (Exception, SystemExit) as e:  # noqa: BLE001
        o.ok(False, f"parou no meio: {type(e).__name__}: {str(e)[:300]}")
    C.C2.registrar_rodada(o.oks, o.oks + o.falhas)
    return o.fim()


if __name__ == "__main__":
    raise SystemExit(main())
