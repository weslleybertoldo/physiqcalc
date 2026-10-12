"""Physiq hml-20d (H-42 · jeito 2, etapa 2, parte 4, 12/10/2026) — as TELAS do Financeiro no navegador (Edge): a REDE (`rede.py --area
financeiro`) e os PRINTS + o TEMPO (`telas.py --area financeiro`).

Contas (staging, só de TESTE — financeiro.py): a w5p-personal (painel, 1280 × 883) entra pela lista de alunos (financeiro.ENTRADA, fora da
área) e abre o Dashboard (a parte do Financeiro), as 6 abas do Financeiro pela navegação do app e o Financeiro da w5p-aluna (Painel › Aluno);
a w5p-aluna (celular, 390 × 844) abre o Início (o gate lê o resumo leve 1,5 s depois) e o Perfil (o chip de Pagamentos, 200 ms depois) — o
resumo guardado no aparelho (physiq_financeiro_resumo) é apagado antes de cada tela do app para a leitura acontecer.
REDE (rede_hml20d.tsv, antes × depois na mesma planilha): em cada tela a guarda que CONTA (financeiro.contar_financeiro) separa
  · as leituras DIRETAS da área (as tabelas e as RPCs da 20d — e, nas telas do painel, as que a 20b/20c já levaram ao servidor) — depois: 0;
  · as leituras pela função (o `ler` da financeiro, com as consultas de cada um) — depois: o mín ≤ `ler` ≤ o máx da tela (hipótese da
    etapa 1: 1 por tela onde a tela lê; 0 ou 1 nas abas que só reaproveitam o cache das comuns ou leem pela pagamentos-aluno);
  · as de FORA da área (H-43: a equipe, o Dashboard, a casca do aluno, o app): listadas à parte;
  · as gravações ao abrir: 0, fora as que já existem e não são desta W (os padroes_garantir do 1º acesso e o aluno_acesso — H-43).
TELAS (decisão M): os prints d_* (prints/hml20/d: <prefixo>_d_<caso>.png + a cópia de 900 px — as 6 abas, o Financeiro da aluna, o
Dashboard da personal, o Perfil › Pagamentos da aluna e o d_financeiro_erro: o Resumo com o `ler` da financeiro barrado no depois e a
leitura direta da área no antes) e o TEMPO: cada tela aberta 3 vezes pela navegação do app (aquecido), a mediana ≤ a do ANTES + 0,3 s (o
antes = a rodada do staging com o código antigo nesta planilha). O Dashboard depende das funções do Treino e da saúde (fora da área): ali o
critério vale para a parte do Financeiro (o fim do último `ler` da financeiro — as diretas da área no antes) e o total entra como
informação. Pior que antes + 0,3 s → a linha "TEMPO <tela> <antes> × <depois>" (a decisão é da sessão principal).
A massa dos prints (só com o caso prints): a mesma do api.py (financeiro.criar_massa — 1 movimentação e 1 recibo da aluna, 1 categoria e 1
modelo, pelas ações da financeiro, só no staging, com a marca) — limpa no fim e conferida por SQL só leitura.
PRODUÇÃO (decisão N): só o rede.py, só leitura, com a Guarda — e RECUSA antes de abrir se a conta de teste da produção não tiver o
Financeiro com as sementes (as categorias e o "Recibo padrão" — sem elas, abrir chamaria o padroes_garantir, que GRAVA), conferido por SQL
só leitura, só contagem; recusou → a tela da produção fica para a prova viva do Weslley (como na 19d). O Financeiro do aluno e o app ficam
de fora na produção (o aluno de teste da conta de teste; o app é o smoke do W7).
Antes de CADA execução: ~/projetos/physiqcalc-scratch/hml/hml19/ferramentas/pausa.sh "<o que ia rodar>" (e o /health, aqui dentro).
"""
from __future__ import annotations

import datetime as dt
import json
import re
import subprocess
import time
from pathlib import Path
from urllib.parse import urlparse

import _base as B
import financeiro as F
import painel as P20B

C = B.C
PRINTS = Path.home() / "projetos" / "physiqcalc-scratch" / "prints" / "hml20" / "d"
PLANILHA_REDE = B.MEDICAO / "rede_hml20d.tsv"
PLANILHA_TELAS = B.MEDICAO / "telas_hml20d.tsv"
CAB_REDE = ["quando", "base", "commit", "fase", "conta", "tela", "diretas", "diretas_detalhe", "ler", "consultas", "fora_da_area", "gravacoes",
            "pedidos", "t_pronto_s", "t_area_s"]
CAB_TELAS = ["quando", "base", "commit", "fase", "conta", "medida", "n", "valores_s", "mediana_s", "referencia_s", "ok"]
FOLGA_S = 0.3
ABERTURAS = 3
# o Dashboard depende das funções do Treino e da saúde (fora da área): o critério é a parte do Financeiro
TELAS_DE_FORA = {"dashboard_personal"}
# o código medido é o depois quando o Financeiro lê pela função (o ed0d72e — o staging do antes — lia direto)
MARCA_DO_DEPOIS = ("src/painel/financeiro/dados.ts", 'lerFinanceiro("fin_')
# as gravações que a Guarda da produção pode barrar ao abrir (as que já existem e não são desta W)
BARRADAS_ACEITAS = {"fn:financeiro(padroes_garantir)", "rpc:aluno_acesso"}


def fase_do_financeiro(base: str, commit: str) -> str:
    """depois = o commit medido já lê o Financeiro pela função (a lib da 20d); antes = o código antigo; o commit que não está aqui → ?"""
    if base == "local":
        return "depois"
    arq, marca = MARCA_DO_DEPOIS
    r = subprocess.run(["git", "-C", str(B.REPO), "show", f"{commit}:{arq}"], capture_output=True, text=True, timeout=10)
    if r.returncode != 0:
        return "?"
    return "depois" if marca in r.stdout else "antes"


def _pedido(req) -> dict:
    tipo, nome = B.B17.alvo(req.url)
    try:
        corpo = req.post_data or ""
    except Exception:  # noqa: BLE001
        corpo = ""
    return {"metodo": req.method, "tipo": tipo, "nome": nome, "url": req.url, "corpo": corpo}


class FimDaArea:
    """O instante em que cada leitura da ÁREA terminou (o `ler` da financeiro no depois; as diretas da área no antes) — a "parte do
    Financeiro" do Dashboard (o resto da tela espera as funções do Treino e da saúde)."""

    def __init__(self, pg, area: str = "financeiro") -> None:
        self.fins: list[float] = []
        self.area = area
        pg.on("requestfinished", self._fim)
        pg.on("requestfailed", self._fim)

    def zerar(self) -> None:
        self.fins = []

    def _fim(self, req) -> None:
        u = urlparse(req.url)
        if u.hostname != B.API_P_HOST or req.method == "OPTIONS":
            return
        p = _pedido(req)
        if B.leitura_direta(p, self.area) or B.leitura_pela_funcao(p) == "fn:financeiro(ler)":
            self.fins.append(time.time())


def ler_fin(cont: dict) -> int:
    return cont["funcao"].get("fn:financeiro(ler)", 0)


def anotar_rede(base: str, commit: str, fase: str, conta: str, tela: str, cont: dict, pronta: dict, t_area: float | None) -> None:
    fmt = lambda d: ",".join(f"{k}×{v}" for k, v in sorted(d.items())) or "-"  # noqa: E731
    B.anotar_planilha(PLANILHA_REDE, CAB_REDE, [
        time.strftime("%Y-%m-%d %H:%M"), base, commit, fase, conta, tela, sum(cont["diretas"].values()), fmt(cont["diretas"]), ler_fin(cont),
        fmt(cont["consultas"]), fmt(cont["fora"]), fmt(cont["gravacoes"]), len(pronta["pedidos"]), pronta["t_pronto_s"], t_area,
    ])


def conferir_rede(o, base: str, fase: str, conta: str, tela: str, faixa: tuple[int, int], cont: dict, pronta: dict) -> None:
    diretas = sum(cont["diretas"].values())
    ler = ler_fin(cont)
    rot = f"[{base}] {conta.split('-')[-1]} {tela}"
    o.ok(not cont["gravacoes_novas"], f"{rot}: 0 gravação nova ao abrir ({cont['gravacoes_novas'] or '—'}; as que já existem: {cont['gravacoes_aceitas'] or '—'})")
    if cont["fora"]:
        o.linha(f"   {rot}: fora da área (outra W, lido direto — esperado): {cont['fora']}")
    if fase == "antes":
        o.ok(diretas >= faixa[0], f"[antes] {rot}: a leitura do Financeiro ia direto do navegador ({cont['diretas'] or '—'})")
        return
    o.ok(diretas == 0, f"[depois] {rot}: 0 leitura direta da área (as tabelas e as RPCs do Financeiro — e as da 20b/20c) ({cont['diretas'] or '—'})")
    o.ok(faixa[0] <= ler <= faixa[1], f"[depois] {rot}: {ler} `ler` da financeiro ({faixa[0]} a {faixa[1]}; consultas {cont['consultas'] or '—'}) — "
         f"t_pronto {pronta['t_pronto_s']} s")


# ───────────────────────── o --seco (sem rede e sem navegador) ─────────────────────────
def seco(o, qual: str) -> None:  # noqa: PLR0915
    faltam = [f"{arq}: {sel}" for arq, sels in F.SELETORES.items() for sel in sels if sel not in (B.REPO / arq).read_text(encoding="utf-8")]
    o.ok(not faltam, f"os {sum(len(v) for v in F.SELETORES.values())} seletores das telas existem no código" + (f" — faltam: {faltam}" if faltam else ""))
    telas = F.telas_da_personal()
    o.ok([t[0] for t in telas] == ["dashboard_personal", "financeiro_resumo", "financeiro_mensalidades", "financeiro_planos", "financeiro_lancamentos",
                                   "financeiro_recibos", "financeiro_categorias", "financeiro_aluno"]
         and [t[0] for t in F.APP] == ["aluno_inicio", "aluno_pagamentos"]
         and all(0 <= t[3][0] <= t[3][1] <= 2 for t in [*telas, *F.APP]),
         "as telas, na ordem (depois da entrada pela lista de alunos): o Dashboard (sem cache), as 6 abas, o Financeiro da aluna; o app: o Início e o "
         "Perfil — cada uma com a faixa de `ler` da etapa 1 (hipótese)")
    o.ok(F.PRINTS_D == ["d_financeiro_resumo", "d_financeiro_mensalidades", "d_financeiro_planos", "d_financeiro_lancamentos", "d_financeiro_recibos",
                        "d_financeiro_categorias", "d_financeiro_aluno", "d_dashboard_personal", "d_aluno_pagamentos", "d_financeiro_erro"],
         f"os prints da §5 da 20d ({len(F.PRINTS_D)}): as 6 abas, o Financeiro do aluno, o Dashboard, o Perfil › Pagamentos e o erro")
    Pp = B.API_P
    conta, pac = "22222222-2222-4222-8222-222222222222", "11111111-1111-4111-8111-111111111111"
    antes = [
        {"metodo": "GET", "tipo": "tab", "nome": "categorias_financeiras", "url": f"{Pp}/rest/v1/categorias_financeiras?select=id,nome", "corpo": ""},
        {"metodo": "GET", "tipo": "tab", "nome": "profiles", "url": f"{Pp}/rest/v1/profiles?select=nome", "corpo": ""},
        {"metodo": "POST", "tipo": "rpc", "nome": "financeiro_resumo_periodo", "url": f"{Pp}/rest/v1/rpc/financeiro_resumo_periodo", "corpo": "{}"},
        {"metodo": "GET", "tipo": "tab", "nome": "cobrancas", "url": f"{Pp}/rest/v1/cobrancas?select=id", "corpo": ""},
        # fora da área (H-43): listada à parte
        {"metodo": "POST", "tipo": "rpc", "nome": "equipe_da_conta", "url": f"{Pp}/rest/v1/rpc/equipe_da_conta", "corpo": "{}"},
        # a mensalidade (já pela pagamentos-aluno) não é da área
        {"metodo": "POST", "tipo": "fn", "nome": "pagamentos-aluno", "acao": "prof_resumo", "url": f"{Pp}/functions/v1/pagamentos-aluno",
         "corpo": json.dumps({"acao": "prof_resumo", "conta_id": conta})},
    ]
    c = F.contar_financeiro(antes)
    o.ok(sum(c["diretas"].values()) == 4 and c["fora"] == {"rpc:equipe_da_conta": 1} and not c["gravacoes_novas"] and ler_fin(c) == 0,
         f"a guarda do ANTES: 4 leituras diretas da área; a equipe (H-43) à parte; a pagamentos-aluno não conta: {c['diretas']}")
    corpo = json.dumps({"acao": "ler", "itens": [{"q": "fin_categorias"}, {"conta": conta, "de": "2026-10-01", "ate": "2026-10-31", "q": "fin_cobrancas_resumo"}]})
    depois = [
        {"metodo": "POST", "tipo": "fn", "nome": "financeiro", "acao": "ler", "url": f"{Pp}/functions/v1/financeiro", "corpo": corpo},
        {"metodo": "POST", "tipo": "fn", "nome": "financeiro", "acao": "padroes_garantir", "url": f"{Pp}/functions/v1/financeiro",
         "corpo": json.dumps({"acao": "padroes_garantir", "conta_id": conta})},
        {"metodo": "POST", "tipo": "fn", "nome": "nutricao", "acao": "ler", "url": f"{Pp}/functions/v1/nutricao",
         "corpo": json.dumps({"acao": "ler", "itens": [{"aluno": pac, "q": "aluno_perfil"}]})},
        {"metodo": "POST", "tipo": "rpc", "nome": "equipe_da_conta", "url": f"{Pp}/rest/v1/rpc/equipe_da_conta", "corpo": "{}"},
    ]
    c = F.contar_financeiro(depois)
    o.ok(c["diretas"] == {} and ler_fin(c) == 1 and c["consultas"] == {"fin_categorias": 1, "fin_cobrancas_resumo": 1}
         and c["consultas_nutricao"] == {"aluno_perfil": 1} and c["gravacoes_aceitas"] == {"fn:financeiro(padroes_garantir)": 1} and not c["gravacoes_novas"]
         and c["fora"] == {"rpc:equipe_da_conta": 1},
         f"a guarda do DEPOIS: 0 direta, 1 `ler` da financeiro (as consultas dele), o da nutricao (a casca) à parte, o garantir aceito: {c}")
    grava = [{"metodo": "POST", "tipo": "fn", "nome": "financeiro", "acao": "transacao_criar", "url": f"{Pp}/functions/v1/financeiro",
              "corpo": json.dumps({"acao": "transacao_criar"})},
             {"metodo": "POST", "tipo": "fn", "nome": "financeiro", "acao": "ler", "url": f"{Pp}/functions/v1/financeiro",
              "corpo": json.dumps({"action": "ler", "acao": "categoria_excluir"})}]
    c = F.contar_financeiro(grava)
    o.ok(sum(c["gravacoes_novas"].values()) == 2 and ler_fin(c) == 0, f"a guarda acha a gravação nova ao abrir (o `ler` disfarçado também): {c['gravacoes_novas']}")
    app = [{"metodo": "POST", "tipo": "rpc", "nome": "financeiro_do_aluno", "url": f"{Pp}/rest/v1/rpc/financeiro_do_aluno", "corpo": "{}"},
           {"metodo": "GET", "tipo": "tab", "nome": "profiles", "url": f"{Pp}/rest/v1/profiles?select=id", "corpo": ""}]
    c = F.contar_financeiro(app, "financeiro-app")
    o.ok(c["diretas"] == {"rpc:financeiro_do_aluno": 1}, f"a guarda do app conta o gate (a RPC do resumo leve) e não o resto do app (20a): {c['diretas']}")
    o.ok(fase_do_financeiro("local", "x") == "depois" and fase_do_financeiro("staging", "ed0d72e") == "antes" and fase_do_financeiro("staging", "0000000") == "?",
         "antes × depois vem do CÓDIGO medido (o ed0d72e lê o Financeiro direto: antes; o local: depois)")
    o.ok(len(B.AREAS["financeiro"]["tabelas"]) > len(F.TABELAS_DA_AREA) and F.TABELAS_DA_AREA <= B.AREAS["financeiro"]["tabelas"]
         and B.AREAS["financeiro-app"]["rpcs"] == F.RPCS_DA_AREA and "profiles" not in B.AREAS["financeiro-app"]["tabelas"],
         "a guarda do painel soma a da 20b/20c (o que já saiu não volta); a do app, só a área da 20d (sem o profiles)")
    if qual == "rede":
        o.ok(PLANILHA_REDE.name == "rede_hml20d.tsv", f"a planilha da rede: {PLANILHA_REDE}")
    else:
        o.ok(PLANILHA_TELAS.name == "telas_hml20d.tsv" and PRINTS.name == "d", f"a planilha das telas e a pasta dos prints: {PLANILHA_TELAS.name}, {PRINTS}")


# ───────────────────────── a produção (decisão N): recusa sem as sementes ─────────────────────────
def sementes_da_producao(o) -> tuple[str, dict]:
    """A conta de teste da produção e as sementes do Financeiro dela (SQL só leitura, só contagem) — sem elas, RECUSA antes de abrir."""
    email = B.B5.CONTAS[B.PROD_CONTA][0]
    uid = [x.get("id") for x in B.ler_principal(P20B.sql_uid_da_conta(email)) if C.eh_uuid(x.get("id"))]
    if not uid:
        raise SystemExit(f"produção: a conta de teste {B.PROD_CONTA} não existe no Auth — o --base prod não abre nada")
    vivos = (B.ler_principal(B.B19.sql_vivos_fin("public", uid[0])) or [{}])[0]
    if not (int(vivos.get("categorias") or 0) > 0 and int(vivos.get("modelos") or 0) > 0):
        raise SystemExit(f"produção: a {B.PROD_CONTA} não tem o Financeiro com as sementes no public (SQL só leitura: {vivos}) — abrir chamaria o "
                         "padroes_garantir, que GRAVA; o Financeiro da produção fica para a prova viva do Weslley (como na 19d)")
    o.linha(f"[prod] a {B.PROD_CONTA} tem as sementes do Financeiro (SQL só leitura: {vivos}) — abre só as telas do painel, com a Guarda")
    return uid[0], vivos


# ───────────────────────── a rodada no navegador ─────────────────────────
def _abrir(pw, canal, base: str, conta: str, desktop: bool, guarda=None):
    nav = pw.chromium.launch(channel=canal, args=["--no-sandbox"]) if canal else pw.chromium.launch(args=["--no-sandbox"])
    t = B.Tela(nav, B.BASES[base], f"hml20d_{base}", conta, desktop=desktop, guarda=guarda)
    B.LegalDesligado().instalar(t.ctx)
    return nav, t


def _fechar(o, base: str, conta: str, L, nav, t) -> None:
    B.sair_do_treino(o, t.pg, f"[{base}] {conta}")
    L.do_navegador(conta, t.pg)
    t.fim()
    nav.close()


def _t_area(fim: FimDaArea, inicio: float) -> float | None:
    return round(max(fim.fins) - inicio, 2) if fim.fins else None


def gate_pedido(pedidos: list[dict]) -> bool:
    """O resumo leve do app foi pedido na janela? (o `ler` com a fin_do_aluno no depois; a RPC financeiro_do_aluno direta no antes)"""
    for p in pedidos:
        if B.leitura_pela_funcao(p) == "fn:financeiro(ler)" and "fin_do_aluno" in B.consultas_do_corpo(p.get("corpo")):
            return True
        if p.get("tipo") == "rpc" and p.get("nome") == "financeiro_do_aluno":
            return True
    return False


def percorrer_painel(o, t, pend, fim: FimDaArea, L, base: str, conta: str, pac: str, ao_abrir, telas: list) -> None:
    """Entra pela lista de alunos (fora da área) e abre cada tela pela navegação do app; ao_abrir(tela, rota, marca, faixa, pronta, t_area)."""
    t.entrar(L, conta, F.ENTRADA)
    o.ok(t.esperar(lambda: t.n("[data-casca]") > 0, 60), f"[{base}] {conta}: o painel abriu (a casca)", parar=True)
    B.esperar_pronto(t, pend, max_s=40)
    for tela, rota, marca, faixa in telas:
        fim.zerar()
        inicio = time.time()
        B.navegar(t, F.rota(rota, pac))
        pronta = B.esperar_pronto(t, pend, marca=marca)
        o.ok(t.n(marca) > 0, f"[{base}] {conta.split('-')[-1]} {tela}: a tela abriu ({marca}; marca em {pronta['t_marca_s']} s)", parar=False)
        ao_abrir(tela, rota, marca, faixa, pronta, _t_area(fim, inicio))


def percorrer_app(o, t, pend, fim: FimDaArea, L, base: str, ao_abrir) -> None:
    """A aluna (celular): o Início e o Perfil; o resumo guardado no aparelho apagado antes de cada tela; a tela pronta ESPERA o gate (1,5 s no
    Início, 200 ms no Perfil — a leitura que a tela faz depois)."""
    for i, (tela, rota, marca, faixa) in enumerate(F.APP):
        fim.zerar()
        if i == 0:
            t.entrar(L, F.ALUNA, rota)  # a sessão antes do 1º documento; o aceite e o "mudou" saem pelo LegalDesligado
        else:
            t.pg.evaluate("(k) => { try { localStorage.removeItem(k); } catch (e) {} }", F.CHAVE_RESUMO_APP)
            B.navegar(t, rota)
        inicio = time.time()
        pronta = B.esperar_pronto(t, pend, marca=marca, max_s=40 if i == 0 else B.MAX_S)
        if not gate_pedido(t.pedidos):
            pediu = t.esperar(lambda: gate_pedido(t.pedidos), 6)
            B.esperar_pronto(t, pend, min_s=0.5, quieto_s=1.5)
            pronta = {**pronta, "pedidos": list(t.pedidos)}
            o.linha(f"   [{base}] aluna {tela}: o gate {'chegou depois da tela pronta' if pediu else 'NÃO foi pedido em 6 s'}")
        o.ok(t.n(marca) > 0, f"[{base}] aluna {tela}: a tela abriu ({marca}; marca em {pronta['t_marca_s']} s)", parar=False)
        ao_abrir(tela, rota, marca, faixa, pronta, _t_area(fim, inicio))


def rodar_rede(o, base: str, canal: str | None) -> None:
    from playwright.sync_api import sync_playwright  # noqa: PLC0415

    B.usar_base(base)
    L = B.Sessoes(f"rede20 financeiro {base}")
    commit = B.commit_medido(base)
    fase = fase_do_financeiro(base, commit)
    try:
        B.exigir_saude(o, "o rede.py da hml-20 (financeiro)")
        guarda = B.Guarda() if base == "prod" else None
        if base == "prod":
            sementes_da_producao(o)
            contas = [(B.PROD_CONTA, True, [F.DASHBOARD, *F.ABAS])]
            pac = ""
            o.linha("[prod] o Financeiro do aluno e o app ficam de fora (o aluno de teste da conta de teste; o app é o smoke do W7)")
        else:
            pac = B.B17.matricula_da_aluna()
            contas = [(F.PERSONAL, True, F.telas_da_personal()), (F.ALUNA, False, list(F.APP))]
        with sync_playwright() as pw:
            o.linha(f"[{base}] {commit}: o {fase}")
            for conta, desktop, telas in contas:
                nav, t = _abrir(pw, canal, base, conta, desktop, guarda)
                pend = B.Pendentes(t.pg)
                area = "financeiro" if desktop else "financeiro-app"
                fim = FimDaArea(t.pg, area)

                def ao_abrir(tela, _rota, _marca, faixa, pronta, t_area, conta=conta, area=area):
                    cont = F.contar_financeiro(pronta["pedidos"], area)
                    conferir_rede(o, base, fase, conta, tela, faixa, cont, pronta)
                    anotar_rede(base, commit, fase, conta, tela, cont, pronta, t_area)

                try:
                    if desktop:
                        percorrer_painel(o, t, pend, fim, L, base, conta, pac, ao_abrir, telas)
                    else:
                        percorrer_app(o, t, pend, fim, L, base, ao_abrir)
                    if guarda:
                        fora = [b for b in guarda.bloqueadas if b not in BARRADAS_ACEITAS]
                        o.ok(not fora, f"[prod] a Guarda só barrou as gravações que já existem e não são desta W: {sorted(set(guarda.bloqueadas)) or '—'}"
                                       + (f" · outras: {fora}" if fora else ""))
                finally:
                    _fechar(o, base, conta, L, nav, t)
    finally:
        L.fechar(o)


def referencia(conta: str, medida: str) -> float | None:
    """O ANTES desta medida: a última rodada do staging com o código antigo nesta planilha (sem ela, nenhuma — a spec não mediu o tempo das
    abas aquecidas pela navegação do app com a mesma regra)."""
    if PLANILHA_TELAS.exists():
        linhas = PLANILHA_TELAS.read_text(encoding="utf-8").splitlines()
        cab = linhas[0].split("\t") if linhas else []
        antes = [dict(zip(cab, l.split("\t"))) for l in linhas[1:]]
        antes = [x for x in antes if x.get("fase") == "antes" and x.get("conta") == conta and x.get("medida") == medida and x.get("mediana_s") not in ("", "None")]
        if antes:
            return float(antes[-1]["mediana_s"])
    return None


def anotar_telas(base: str, commit: str, fase: str, conta: str, medida: str, valores: list, mediana: float | None, ref: float | None, ok: object) -> None:
    B.anotar_planilha(PLANILHA_TELAS, CAB_TELAS, [time.strftime("%Y-%m-%d %H:%M"), base, commit, fase, conta, medida, len(valores),
                                                  ",".join(str(v) for v in valores), mediana, ref, ok])


def conferir_tempo(o, base: str, commit: str, fase: str, conta: str, telas: list, medidas: dict[str, dict[str, list]]) -> None:
    """A mediana das 3 rodadas de cada tela ≤ o antes + 0,3 s (o Dashboard: a parte do Financeiro; o total = informação)."""
    for tela, _rota, _marca, _faixa in telas:
        totais = medidas.get(tela, {}).get("total", [])
        area = medidas.get(tela, {}).get("area", [])
        de_fora = tela in TELAS_DE_FORA
        med_total = B.mediana(totais)
        ref_total = referencia(conta, f"tempo:{tela}")
        if de_fora:
            med, ref = B.mediana([x for x in area if x is not None]), referencia(conta, f"area:{tela}")
            ok = None if fase != "depois" or ref is None or med is None else med <= ref + FOLGA_S
            anotar_telas(base, commit, fase, conta, f"area:{tela}", area, med, ref, ok)
            anotar_telas(base, commit, fase, conta, f"tempo:{tela}", totais, med_total, ref_total, None)  # o total: informação
        else:
            med, ref = med_total, ref_total
            ok = None if fase != "depois" or ref is None or med is None else med <= ref + FOLGA_S
            anotar_telas(base, commit, fase, conta, f"tempo:{tela}", totais, med_total, ref_total, ok)
        rot = f"{conta.split('-')[-1]} {tela}"
        if fase != "depois":
            o.linha(f"   [{fase}] {rot}: total {totais} → {med_total} s" + (f"; a parte do Financeiro {area} → {med} s" if de_fora else "") + " (a referência)")
            continue
        quem = "a parte do Financeiro" if de_fora else "a tela"
        if not o.ok(ok is not False, f"[depois] {rot}: {quem} mediana {med} s ≤ antes {ref} + {FOLGA_S} s ({area if de_fora else totais})"
                    + (f" · o total (informação): {med_total} s × antes {ref_total}" if de_fora else "") + (" — sem o antes medido" if ref is None else "")):
            o.linha(f"TEMPO {rot} {ref} × {med} (≤ antes + {FOLGA_S} s) — a decisão é da sessão principal")


def caso_erro(o, t, pend, base: str, pr) -> None:
    """d_financeiro_erro: o Resumo com a leitura da área barrada (o `ler` da financeiro no depois; as leituras diretas da área no antes),
    aberto do zero (o cache de 15 s do Resumo não esconde o erro) → o aviso de erro da aba (o texto dela; só o print do erro pode mudar)."""
    padrao = re.compile(r"https://api-principal\.physiqcalc\.com\.br/(functions/v1/financeiro|rest/v1/)")

    def barrar(route, req) -> None:
        corpo = B.B17.corpo_do_pedido(req) or ""
        eh_ler = req.method == "POST" and "/functions/v1/financeiro" in req.url and B.B17.corpo_de_leitura("financeiro", corpo)
        p = {"metodo": req.method, "tipo": B.B17.alvo(req.url)[0], "nome": B.B17.alvo(req.url)[1], "url": req.url, "corpo": corpo}
        if eh_ler or B.leitura_direta(p, "financeiro"):
            route.abort()
            return
        route.fallback()

    t.ctx.route(padrao, barrar)
    try:
        t.ir("/painel/financeiro?aba=resumo")
        alerta = '[data-estado="erro"], [role="alert"]'
        ok = t.esperar(lambda: t.n(alerta) > 0, 40)
        o.ok(ok, f"[{base}] d_financeiro_erro: o Resumo com a leitura barrada → o aviso de erro da aba (\"{t.texto(alerta)[:70]}\")")
        pr("d_financeiro_erro")
    finally:
        t.ctx.unroute(padrao, barrar)


def rodar_telas(o, base: str, canal: str | None, casos: list[str], prefixo: str | None) -> None:  # noqa: PLR0915
    from playwright.sync_api import sync_playwright  # noqa: PLC0415

    if base == "prod":
        raise SystemExit("telas.py é local e staging (a produção é o F7 da sessão principal, só leitura)")
    s = B.usar_base(base)
    L = B.Sessoes(f"telas20 financeiro {base}")
    commit = B.commit_medido(base)
    fase = fase_do_financeiro(base, commit)
    estado = None
    try:
        B.exigir_saude(o, "o telas.py da hml-20 (financeiro)")
        pac = B.B17.matricula_da_aluna()
        if "prints" in casos:
            pendente = B.Estado.ler()
            if not pendente.vazio():
                o.ok(False, f"há uma rodada que caiu no meio (área {pendente.d.get('area')}): rode o --limpar antes", parar=True)
            rodada = B.nova_rodada()
            estado = B.Estado({"rodada": rodada, "schema": s, "area": F.AREA_ESTADO, "linhas": [], "storage": [], "n8": None, "fin": [], "pac": pac})
            estado.salvar()
            conta = str((B.ler_principal(f"select coalesce(conta_id::text, '') as v from {s}.pacientes where id = {C.txt(C.uuid_ok(pac))}") or [{}])[0].get("v") or "")
            if C.eh_uuid(conta):
                hoje = (dt.datetime.now(dt.timezone.utc) - dt.timedelta(hours=3)).date().isoformat()
                F.criar_massa(o, estado, L.token(F.PERSONAL), L.uid(F.PERSONAL), pac, conta, rodada, hoje)
            else:
                o.linha("   (a matrícula da aluna de teste sem conta: os prints sem a massa)")
        rodadas = ABERTURAS if "tempo" in casos else 1
        with sync_playwright() as pw:
            o.linha(f"[{base}] {commit}: o {fase} · {rodadas} rodada(s)")
            for conta, desktop in ((F.PERSONAL, True), (F.ALUNA, False)):
                telas = F.telas_da_personal() if desktop else list(F.APP)
                medidas: dict[str, dict[str, list]] = {}
                for n in range(rodadas):
                    nav, t = _abrir(pw, canal, base, conta, desktop)
                    pend = B.Pendentes(t.pg)
                    fim = FimDaArea(t.pg, "financeiro" if desktop else "financeiro-app")
                    pr = lambda caso, t=t: B.print_reduzido(t.pg, prefixo or base, caso, o, pasta=PRINTS)  # noqa: E731

                    def ao_abrir(tela, _rota, marca, _faixa, pronta, t_area, n=n, t=t, pr=pr):
                        medidas.setdefault(tela, {"total": [], "area": []})
                        medidas[tela]["total"].append(pronta["t_pronto_s"])
                        medidas[tela]["area"].append(t_area)
                        if n == 0 and "prints" in casos:
                            sem_erro = t.n(marca) > 0 and not t.n('[data-estado="erro"]')
                            caso = "d_aluno_pagamentos" if tela == "aluno_pagamentos" else (f"d_{tela}" if tela != "aluno_inicio" else None)
                            if caso:
                                o.ok(sem_erro, f"[{base}] {caso}: a tela com o dado, sem erro (pronta em {pronta['t_pronto_s']} s)")
                                pr(caso)

                    try:
                        if desktop:
                            percorrer_painel(o, t, pend, fim, L, base, conta, pac, ao_abrir, telas)
                            if n == 0 and "prints" in casos:
                                caso_erro(o, t, pend, base, pr)
                        else:
                            percorrer_app(o, t, pend, fim, L, base, ao_abrir)
                    finally:
                        _fechar(o, base, conta, L, nav, t)
                if "tempo" in casos:
                    conferir_tempo(o, base, commit, fase, conta, telas, medidas)
    finally:
        if estado is not None:
            F.limpar_massa(o, estado, s)
        L.fechar(o)


ARQUIVO = Path(__file__).name
