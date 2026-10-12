"""Physiq hml-20c (H-42 + H-102 · jeito 2, etapa 2, 12/10/2026) — a REDE e as TELAS da Dieta do aluno no Painel, das Dietas, da
Pré-consulta e do Dashboard de saúde no navegador (Edge, painel 1280 × 883): o `rede.py --area dieta` e o `telas.py --area dieta`.

Contas (staging, só de TESTE — dieta.py): a w5p-nutri entra pela lista de alunos (dieta.ENTRADA, fora da área) e abre o Dashboard, a
Dieta ×8 da w5p-aluna (as 7 seções + o "Editar treino e dieta"), as Dietas ×3 e a Pré-consulta ×2; a w5p-personal, o Dashboard (um
navegador por vez; a sessão guardada reaproveitada; no fim, o logout da sessão do TREINO que o painel abriu — decisão 23). A massa: 1 foto
no diário da aluna (pela aluna, a ação da hml-19b) para o Diário e o Dashboard terem miniatura; a Pré-consulta cria a dela PELA TELA.
REDE (rede_hml20c.tsv, antes × depois na mesma planilha): em cada tela a guarda que CONTA (dieta.contar_dieta) separa
  · as leituras DIRETAS da área (as tabelas/RPCs da 20c e da casca da 20b, o "sign" do diario) — depois: 0;
  · as leituras pela função (o `ler`, com as consultas de cada um) — depois: 1 ≤ `ler` ≤ o teto da tela (hipótese da etapa 1);
  · as de FORA da área (o Dashboard: alunos e agenda — H-43; a Pré-consulta: a equipe; a casca: H-43): listadas à parte (hml-20d: o
    financeiro do Dashboard saiu da lista — o rede.py --area financeiro o conta);
  · as gravações ao abrir: 0, fora as que já existem e não são desta W (o padroes_garantir do 1º acesso e o aluno_acesso — H-43);
  e a PRÉ-CONSULTA PELA TELA (decisão D / H-102): criar o formulário de teste, editar, a resposta anônima pelo /f/:slug (a RPC de hoje),
  ligar à aluna, desligar e excluir a resposta, excluir o formulário — depois: cada gravação = 1 POST na nutricao com a ação certa e 0
  POST/PATCH/DELETE direto em formularios_preconsulta/respostas_preconsulta (antes: direto, a referência).
TELAS (telas_hml20c.tsv; prints em prints/hml20/c/<prefixo>_<caso>.png + a cópia de 900 px — CONFERIR cada um: tela certa, sem login nem
"carregando", nomes de teste):
  c_dashboard · c_dieta_<secao> ×7 · c_dieta_editar · c_dietas_<aba> ×3 · c_preconsulta_<aba> ×2 · c_dashboard_personal · c_diario_foto
  (a foto da massa aberta no Diário pela URL do servidor) · c_preconsulta_criado e c_preconsulta_ligada (o fluxo pela tela) · c_dieta_erro
  (o Cálculo energético com a leitura barrada: a nutricao no depois, o REST no antes — o aviso de erro dele)
  e o TEMPO (decisão M): cada tela aberta 3 vezes pela navegação do app (aquecido), a mediana ≤ a do ANTES + 0,3 s (o antes = a rodada do
  staging com o código antigo nesta planilha; sem ela, o da spec). O Dashboard depende das funções do Treino/financeiro (fora da área): ali o
  critério vale para a parte da 20c (o fim do último `ler` — as diretas da área no antes) e o total entra como informação. Pior que antes +
  0,3 s → a linha "TEMPO <tela> <antes> × <depois>" (a decisão é da sessão principal).
PRODUÇÃO (decisão N): só o rede.py, só leitura, com a Guarda — e RECUSA antes de abrir se a nutri-legado não tiver aluno de TESTE (hoje: 0
aluno — a Dieta, as Dietas, a Pré-consulta e o Dashboard de saúde da produção são prova viva do Weslley).
Antes de CADA execução: ~/projetos/physiqcalc-scratch/hml/hml19/ferramentas/pausa.sh "<o que ia rodar>" (e o /health, aqui dentro).
"""
from __future__ import annotations

import json
import re
import subprocess
import time
from collections import Counter
from pathlib import Path
from urllib.parse import urlparse

import _base as B
import dieta as D
import painel as P20B

C = B.C
PRINTS = Path.home() / "projetos" / "physiqcalc-scratch" / "prints" / "hml20" / "c"
PLANILHA_REDE = B.MEDICAO / "rede_hml20c.tsv"
PLANILHA_TELAS = B.MEDICAO / "telas_hml20c.tsv"
CAB_REDE = ["quando", "base", "commit", "fase", "conta", "tela", "diretas", "diretas_detalhe", "ler", "consultas", "fora_da_area", "gravacoes",
            "pedidos", "t_pronto_s", "t_area_s"]
CAB_TELAS = ["quando", "base", "commit", "fase", "conta", "medida", "n", "valores_s", "mediana_s", "referencia_s", "ok"]
FOLGA_S = 0.3
ABERTURAS = 3
# dependem das funções do Treino/financeiro (fora da área): o critério é a parte da 20c — o Dashboard, o "Editar treino e dieta" (decisão
# da sessão principal na etapa 2: o editor do TREINO — o treino-leitura, 2–3,5 s — domina a tela; como o Resumo/Avaliação na 20b) e o
# Planejamento (PADRÃO da sessão principal, 15:1x: a 1ª tela da Dieta paga a casca do aluno, com o treino-leitura e o pagamentos-aluno
# — o total oscila entre rodadas; a parte da 20c medida em +0,10 s)
TELAS_DE_FORA = {"dashboard", "dieta_editar", "dieta_planejamento"}
ACOES_PRECONSULTA = ("preconsulta_formulario_criar", "preconsulta_formulario_editar", "preconsulta_formulario_excluir", "preconsulta_resposta_ligar",
                     "preconsulta_resposta_excluir")
TABELAS_PRECONSULTA = ("formularios_preconsulta", "respostas_preconsulta")
# o c_dieta_erro: a seção Cálculo energético com a leitura dela barrada (o `ler` com calculos_do_aluno no depois; o GET do REST no antes)
ERRO = ("dieta_calculo-energetico", "?secao=calculo-energetico", "calculos_do_aluno", "calculos_energeticos", "[data-secao-calculo-energetico]")
PRINTS_C = ([f"c_{t[0]}" for t in D.telas_da_conta(D.NUTRI)]
            + ["c_dashboard_personal", "c_diario_foto", "c_preconsulta_criado", "c_preconsulta_ligada", "c_dieta_erro"])
# o código medido é o depois quando o Diário do painel lê pela função (o 2436d0b — o staging do antes — lia direto)
MARCA_DO_DEPOIS = ("src/painel/dietas/diario.ts", 'lerNutricao("diario_pagina"')


def fase_da_dieta(base: str, commit: str) -> str:
    """depois = o commit medido já lê o Diário pela função (a lib da 20c); antes = o código antigo; o commit que não está aqui → ?"""
    if base == "local":
        return "depois"
    arq, marca = MARCA_DO_DEPOIS
    r = subprocess.run(["git", "-C", str(B.REPO), "show", f"{commit}:{arq}"], capture_output=True, text=True, timeout=10)
    if r.returncode != 0:
        return "?"
    return "depois" if marca in r.stdout else "antes"


class FimDaArea:
    """O instante em que cada leitura da ÁREA terminou (o `ler` da nutricao no depois; as diretas da área no antes) — a "parte da 20c" do
    Dashboard (o resto da tela espera as funções do Treino e do financeiro)."""

    def __init__(self, pg) -> None:
        self.fins: list[float] = []
        pg.on("requestfinished", self._fim)
        pg.on("requestfailed", self._fim)

    def zerar(self) -> None:
        self.fins = []

    def _fim(self, req) -> None:
        u = urlparse(req.url)
        if u.hostname != B.API_P_HOST or req.method == "OPTIONS":
            return
        tipo, nome = B.B17.alvo(req.url)
        try:
            corpo = req.post_data or ""
        except Exception:  # noqa: BLE001
            corpo = ""
        p = {"metodo": req.method, "tipo": tipo, "nome": nome, "url": req.url, "corpo": corpo}
        if B.leitura_direta(p, "dieta") or B.leitura_pela_funcao(p) == "fn:nutricao(ler)":
            self.fins.append(time.time())


def anotar_rede(base: str, commit: str, fase: str, conta: str, tela: str, cont: dict, pronta: dict, t_area: float | None) -> None:
    fmt = lambda d: ",".join(f"{k}×{v}" for k, v in sorted(d.items())) or "-"  # noqa: E731
    B.anotar_planilha(PLANILHA_REDE, CAB_REDE, [
        time.strftime("%Y-%m-%d %H:%M"), base, commit, fase, conta, tela, sum(cont["diretas"].values()), fmt(cont["diretas"]),
        cont["funcao"].get("fn:nutricao(ler)", 0), fmt(cont["consultas"]), fmt(cont["fora"]), fmt(cont["gravacoes"]), len(pronta["pedidos"]),
        pronta["t_pronto_s"], t_area,
    ])


def conferir_rede(o, base: str, fase: str, conta: str, tela: str, teto: int, cont: dict, pronta: dict) -> None:
    diretas = sum(cont["diretas"].values())
    ler = cont["funcao"].get("fn:nutricao(ler)", 0)
    rot = f"[{base}] {conta.split('-')[-1]} {tela}"
    o.ok(not cont["gravacoes_novas"], f"{rot}: 0 gravação nova ao abrir ({cont['gravacoes_novas'] or '—'}; as que já existem: {cont['gravacoes_aceitas'] or '—'})")
    if cont["fora"]:
        o.linha(f"   {rot}: fora da área (outra W, lido direto — esperado): {cont['fora']}")
    if fase == "antes":
        o.ok(diretas >= 1, f"[antes] {rot}: a leitura de saúde ia direto do navegador ({cont['diretas']})")
        return
    o.ok(diretas == 0, f"[depois] {rot}: 0 leitura direta da área (as tabelas, as RPCs, o sign do diario) ({cont['diretas'] or '—'})")
    o.ok(1 <= ler <= teto, f"[depois] {rot}: {ler} `ler` (1 a {teto}; consultas {cont['consultas'] or '—'}) — t_pronto {pronta['t_pronto_s']} s")


# ───────────────────────── o --seco (sem rede e sem navegador) ─────────────────────────
def seco(o, qual: str) -> None:  # noqa: PLR0915
    faltam = [f"{arq}: {sel}" for arq, sels in D.SELETORES.items() for sel in sels if sel not in (B.REPO / arq).read_text(encoding="utf-8")]
    o.ok(not faltam, f"os {sum(len(v) for v in D.SELETORES.values())} seletores das telas e do fluxo da Pré-consulta existem no código"
         + (f" — faltam: {faltam}" if faltam else ""))
    nutri, personal = D.telas_da_conta(D.NUTRI), D.telas_da_conta(D.PERSONAL)
    nomes = [t[0] for t in nutri]
    o.ok(len(nutri) == 14 and nomes[0] == "dashboard" and [t[0] for t in personal] == ["dashboard"]
         and nomes[1:9] == [f"dieta_{s}" for s, _x, _m, _t in D.SECOES_DIETA] + ["dieta_editar"] and nomes[9:] == ["dietas_alimentos", "dietas_receitas", "dietas_diario",
                                                                                                                  "preconsulta_formularios", "preconsulta_respostas"]
         and D.ENTRADA == "/painel/alunos" and nutri[1][1] == "/painel/alunos/{pac}/dieta" and nutri[2][1] == "/painel/alunos/{pac}/dieta?secao=acompanhamento",
         "as telas, na ordem (depois da entrada pela lista de alunos, fora da área): o Dashboard (sem cache), a Dieta ×8 (a 1ª é a padrão: o "
         "Planejamento), as Dietas ×3 e a Pré-consulta ×2; a personal — o Dashboard")
    spec = {r for (_c, r) in D.antes_da_spec_dieta()}
    o.ok({"/painel", "/painel/pre-consulta", "/painel/pre-consulta?aba=respostas", "/painel/dietas", "/painel/dietas?aba=receitas", "/painel/dietas?aba=diario",
          "/painel/alunos/:id/dieta", "/painel/alunos/:id/dieta?secao=acompanhamento"} <= spec
         and D.rota_da_spec("/painel/alunos/{pac}/dieta?secao=metas") == "/painel/alunos/:id/dieta?secao=metas",
         f"o antes da spec (rede_por_tela.tsv) tem as telas da 20c que ela mediu ({len(spec)} rotas da nutri/personal; Manipulados, Orientações e o "
         "Editar: o antes vem da rodada do staging da etapa 2)")
    Pp, Tt = B.API_P, B.API_T
    pac = "11111111-1111-4111-8111-111111111111"
    antes = [
        {"metodo": "POST", "tipo": "rpc", "nome": "planos_do_aluno", "url": f"{Pp}/rest/v1/rpc/planos_do_aluno", "corpo": "{}"},
        {"metodo": "GET", "tipo": "tab", "nome": "calculos_energeticos", "url": f"{Pp}/rest/v1/calculos_energeticos?select=*&paciente_id=eq.{pac}", "corpo": ""},
        {"metodo": "HEAD", "tipo": "tab", "nome": "respostas_preconsulta", "url": f"{Pp}/rest/v1/respostas_preconsulta?select=id", "corpo": ""},
        {"metodo": "POST", "tipo": "storage", "nome": "sign", "url": f"{Pp}/storage/v1/object/sign/diario-staging", "corpo": "{}"},
        {"metodo": "POST", "tipo": "rpc", "nome": "painel_resumo", "url": f"{Pp}/rest/v1/rpc/painel_resumo", "corpo": "{}"},
        {"metodo": "POST", "tipo": "rpc", "nome": "aluno_perfil", "url": f"{Pp}/rest/v1/rpc/aluno_perfil", "corpo": "{}"},
        # fora da área (H-43): listadas à parte (hml-20d: o financeiro do Dashboard saiu da lista — é da guarda da 20d, rede --area financeiro)
        {"metodo": "POST", "tipo": "rpc", "nome": "alunos_da_conta", "url": f"{Pp}/rest/v1/rpc/alunos_da_conta", "corpo": "{}"},
        {"metodo": "GET", "tipo": "tab", "nome": "agendamentos", "url": f"{Pp}/rest/v1/agendamentos?select=*", "corpo": ""},
        {"metodo": "GET", "tipo": "tab", "nome": "pacientes", "url": f"{Pp}/rest/v1/pacientes?select=id", "corpo": ""},
        {"metodo": "POST", "tipo": "rpc", "nome": "financeiro_resumo_periodo", "url": f"{Pp}/rest/v1/rpc/financeiro_resumo_periodo", "corpo": "{}"},
        {"metodo": "POST", "tipo": "rpc", "nome": "aluno_acesso", "url": f"{Pp}/rest/v1/rpc/aluno_acesso", "corpo": "{}"},
        # o Treino (já pelo servidor) não é da área
        {"metodo": "POST", "tipo": "fn", "nome": "treino-leitura", "acao": "avaliacoes", "url": f"{Tt}/functions/v1/treino-leitura",
         "corpo": json.dumps({"action": "avaliacoes"})},
    ]
    c = D.contar_dieta(antes)
    o.ok(sum(c["diretas"].values()) == 6 and c["fora"] == {"rpc:alunos_da_conta": 1, "tab:agendamentos": 1, "tab:pacientes": 1, "rpc:aluno_acesso": 1}
         and c["gravacoes_aceitas"] == {"rpc:aluno_acesso": 1} and not c["gravacoes_novas"],
         f"a guarda do ANTES: 6 leituras diretas da área (as da 20c e a casca da 20b — o aluno_perfil); as de fora da área à parte: {c['diretas']}")
    corpo_ler = json.dumps({"acao": "ler", "itens": [{"aluno": pac, "q": "calculos_do_aluno"}, {"aluno": pac, "q": "antropometrias_do_aluno"}]})
    depois = [
        {"metodo": "POST", "tipo": "fn", "nome": "nutricao", "acao": "ler", "url": f"{Pp}/functions/v1/nutricao", "corpo": corpo_ler},
        {"metodo": "POST", "tipo": "fn", "nome": "nutricao", "acao": "padroes_garantir", "url": f"{Pp}/functions/v1/nutricao",
         "corpo": json.dumps({"acao": "padroes_garantir", "secao": "formula"})},
        {"metodo": "GET", "tipo": "storage", "nome": "sign", "url": f"{Pp}/storage/v1/object/sign/diario-staging/a/b.png?token=t", "corpo": ""},
        {"metodo": "POST", "tipo": "rpc", "nome": "alunos_da_conta", "url": f"{Pp}/rest/v1/rpc/alunos_da_conta", "corpo": "{}"},
    ]
    c = D.contar_dieta(depois)
    o.ok(c["diretas"] == {} and c["funcao"] == {"fn:nutricao(ler)": 1} and c["consultas"] == {"calculos_do_aluno": 1, "antropometrias_do_aluno": 1}
         and c["gravacoes_aceitas"] == {"fn:nutricao(padroes_garantir)": 1} and not c["gravacoes_novas"] and c["fora"] == {"rpc:alunos_da_conta": 1},
         f"a guarda do DEPOIS: 0 direta da área, 1 `ler` (as 2 do Cálculo energético num lote), o garantir à parte, o GET da imagem não conta: {c}")
    grava = [{"metodo": "POST", "tipo": "fn", "nome": "nutricao", "acao": "preconsulta_formulario_criar", "url": f"{Pp}/functions/v1/nutricao",
              "corpo": json.dumps({"acao": "preconsulta_formulario_criar"})},
             {"metodo": "PATCH", "tipo": "tab", "nome": "formularios_preconsulta", "url": f"{Pp}/rest/v1/formularios_preconsulta?id=eq.{pac}", "corpo": "{}"},
             {"metodo": "POST", "tipo": "fn", "nome": "nutricao", "acao": "ler", "url": f"{Pp}/functions/v1/nutricao",
              "corpo": json.dumps({"action": "ler", "acao": "preconsulta_resposta_excluir"})}]
    c = D.contar_dieta(grava)
    o.ok(sum(c["gravacoes_novas"].values()) == 3 and not c["funcao"], f"a guarda acha a gravação nova ao abrir (o `ler` disfarçado também): {c['gravacoes_novas']}")
    g = gravacoes_da_preconsulta(grava)
    o.ok(g == ({"preconsulta_formulario_criar": 1, "preconsulta_resposta_excluir": 1}, {"PATCH tab:formularios_preconsulta": 1}),
         f"o fluxo da Pré-consulta: a gravação pela função (a ação do CORPO — o `ler` disfarçado conta como a gravação que ele é) e a DIRETA nas 2 "
         f"tabelas (o antes) contadas à parte: {g}")
    o.ok(miniatura_pedida([{"tipo": "fn", "nome": "nutricao", "corpo": json.dumps({"acao": "ler", "itens": [{"q": "diario_urls", "ids": [pac]}]})}])
         and miniatura_pedida([{"tipo": "storage", "nome": "sign", "url": f"{Pp}/storage/v1/object/sign/diario-staging"}])
         and miniatura_pedida([{"tipo": "fn", "nome": "nutricao", "corpo": json.dumps({"acao": "ler", "itens": [{"q": "diario_hoje", "com_urls": True}]})}])
         and not miniatura_pedida([{"tipo": "fn", "nome": "nutricao", "corpo": json.dumps({"acao": "ler", "itens": [{"q": "diario_hoje"}]})}])
         and not miniatura_pedida([{"tipo": "storage", "nome": "sign", "url": f"{Pp}/storage/v1/object/sign/anexos-staging"}]),
         "o Dashboard com a foto da massa espera a miniatura pedida (o diario_urls no depois; o sign do diario no antes) antes de seguir")
    o.ok(fase_da_dieta("local", "x") == "depois" and fase_da_dieta("staging", "2436d0b") == "antes" and fase_da_dieta("staging", "0000000") == "?",
         "antes × depois vem do CÓDIGO medido: o 2436d0b (o staging do antes) lê o Diário direto → antes")
    # a produção (decisão N): a nutri-legado e o aluno de teste DELA; sem ele, RECUSA antes de abrir
    recusou = ""
    try:
        escolher_aluno([])
    except SystemExit as e:
        recusou = str(e)
    o.ok("não tem aluno de TESTE" in recusou and "não abre nada" in recusou and "prova viva" in recusou,
         "a produção sem aluno de teste da nutri-legado: o rede.py --base prod RECUSA com a mensagem clara (antes de abrir o navegador)")
    tudo, nada = plano_da_producao({"modelos_formula": 1, "modelos_meta": 2, "modelos_orientacao": 3}), plano_da_producao({})
    o.ok(len(tudo[0]) == 14 and not tudo[1] and len(nada[0]) == 11 and [t for t, _m in nada[1]] == ["dieta_manipulados", "dieta_orientacoes", "dieta_metas"]
         and all("padroes_garantir" in m for _t, m in nada[1]),
         "a produção: Manipulados, Orientações e Metas só abrem com os padrões da conta (sem eles: pulam, com o motivo — abrir gravaria o garantir)")
    o.ok(BARRADAS_ACEITAS == {"POST fn:nutricao", "POST rpc:aluno_acesso"}, "a produção: a Guarda só pode barrar o garantir do 1º acesso e o aluno_acesso (H-43)")
    if qual == "telas":
        o.ok(len(PRINTS_C) == 19 and len(set(PRINTS_C)) == 19 and "c_dieta_erro" in PRINTS_C and "c_diario_foto" in PRINTS_C and PRINTS == B.PRINTS.parent / "c"
             and sum(1 for x in PRINTS_C if x.startswith("c_dieta_") and x != "c_dieta_erro") == 8,
             f"os {len(PRINTS_C)} prints c_* da spec §5 (a Dieta ×8, as Dietas ×3, a Pré-consulta ×2, o Dashboard da nutri e da personal, a foto do "
             f"diário, o fluxo da Pré-consulta e o erro) em {PRINTS}")
        o.ok((FOLGA_S, ABERTURAS) == (0.3, 3) and TELAS_DE_FORA == {"dashboard", "dieta_editar", "dieta_planejamento"},
             "os números do contrato (decisão M): ≤ antes + 0,3 s, 3 aberturas; o Dashboard, o Editar (o editor do Treino junto) e o Planejamento "
             "(a casca do aluno com o Treino) pela parte da 20c")
        o.ok(ERRO[2] in D.CONSULTAS_20C and ERRO[3] in D.TABELAS_DA_AREA and ERRO[0] in nomes,
             "o c_dieta_erro barra a leitura da seção Cálculo energético nos 2 caminhos (o `ler` com calculos_do_aluno e o REST da tabela)")


# ───────────────────────── a produção (decisão N): SÓ LEITURA, a nutri-legado e o aluno de teste DELA ─────────────────────────
SECOES_COM_PADRAO = D.SECOES_COM_PADRAO
# as gravações que a Guarda pode barrar na produção ao abrir (não são desta W: o garantir do 1º acesso e o acesso do aluno, H-43)
BARRADAS_ACEITAS = {"POST fn:nutricao", "POST rpc:aluno_acesso"}


def escolher_aluno(linhas: list[dict]) -> str:
    ids = [x.get("id") for x in linhas if C.eh_uuid(x.get("id"))]
    if not ids:
        raise SystemExit("produção: a nutri-legado não tem aluno de TESTE na produção (nenhuma matrícula viva dela com e-mail de teste) — o --base prod "
                         "não abre nada; a Dieta, as Dietas, a Pré-consulta e o Dashboard de saúde da produção ficam para a prova viva do Weslley")
    return ids[0]


def sql_padroes(s: str, uid: str) -> str:
    """Só leitura, só contagem: os modelos PRÓPRIOS vivos da conta (os padrões do 1º acesso da Dieta: fórmula, meta, orientação)."""
    u = C.txt(C.uuid_ok(uid))
    return "select " + ", ".join(f"(select count(*) from {s}.{t} where nutricionista_id = {u} and deleted_at is null)::int as {t}"
                                 for t in SECOES_COM_PADRAO.values())


def plano_da_producao(padroes: dict[str, int]) -> tuple[list[tuple[str, str, str, int]], list[tuple[str, str]]]:
    abrir, pulos = [], []
    for t in D.telas_da_conta(P20B.PRODUCAO):
        tabela = SECOES_COM_PADRAO.get(t[0])
        if tabela and int(padroes.get(tabela) or 0) <= 0:
            pulos.append((t[0], f"a nutri-legado não tem os padrões ({tabela}) na produção — abrir gravaria o padroes_garantir (prova viva do Weslley)"))
        else:
            abrir.append(t)
    return abrir, pulos


def plano_da_base(o, base: str) -> tuple[str, list[tuple[str, list]]]:
    """O aluno e as contas/telas da rodada: no local/staging, a w5p-aluna com a nutri (tudo) e a personal (o Dashboard); na PRODUÇÃO, SÓ a
    nutri-legado e o aluno de teste DELA (SQL só leitura: só ids/contagem) — sem aluno de teste, RECUSA antes de abrir qualquer coisa."""
    if base != "prod":
        return B.B17.matricula_da_aluna(), [(D.NUTRI, D.telas_da_conta(D.NUTRI)), (D.PERSONAL, D.telas_da_conta(D.PERSONAL))]
    email = B.B5.CONTAS[P20B.PRODUCAO][0]
    uid = [x.get("id") for x in B.ler_principal(P20B.sql_uid_da_conta(email)) if C.eh_uuid(x.get("id"))]
    if not uid:
        raise SystemExit("produção: a conta de teste nutri-legado não existe no Auth — o --base prod não abre nada")
    pac = escolher_aluno(B.ler_principal(P20B.sql_aluno_de_teste("public", uid[0])))
    telas, pulos = plano_da_producao((B.ler_principal(sql_padroes("public", uid[0])) or [{}])[0])
    for tela, motivo in pulos:
        o.linha(f"[prod] {tela}: PULADA — {motivo}")
    return pac, [(P20B.PRODUCAO, telas)]


# ───────────────────────── a rodada no navegador ─────────────────────────
def _abrir_conta(pw, canal, base: str, conta: str, guarda=None):
    nav = pw.chromium.launch(channel=canal, args=["--no-sandbox"]) if canal else pw.chromium.launch(args=["--no-sandbox"])
    t = B.Tela(nav, B.BASES[base], f"hml20c_{base}", conta, desktop=True, guarda=guarda)
    B.LegalDesligado().instalar(t.ctx)
    return nav, t


def _fechar_conta(o, base: str, conta: str, L, nav, t) -> None:
    B.sair_do_treino(o, t.pg, f"[{base}] {conta}")
    L.do_navegador(conta, t.pg)
    t.fim()
    nav.close()


def _t_area(fim: FimDaArea, inicio: float) -> float | None:
    return round(max(fim.fins) - inicio, 2) if fim.fins else None


def _itens(corpo: object) -> list[dict]:
    try:
        b = json.loads(corpo or "")
    except Exception:  # noqa: BLE001
        return []
    return [i for i in (b.get("itens") or []) if isinstance(i, dict)] if isinstance(b, dict) else []


def miniatura_pedida(pedidos: list[dict]) -> bool:
    """A miniatura do diário foi pedida na janela? (no depois: a lista com o com_urls — as URLs na mesma ida, 89f2a35 — ou o diario_urls;
    no antes: o sign do diario)"""
    for p in pedidos:
        for i in _itens(p.get("corpo")) if p.get("tipo") == "fn" else []:
            if i.get("q") == "diario_urls" or (i.get("q") in ("diario_hoje", "diario_pagina") and i.get("com_urls") is True):
                return True
        if p.get("tipo") == "storage" and p.get("nome") == "sign" and "/object/sign/diario" in str(p.get("url", "")):
            return True
    return False


def percorrer(o, t, pend, fim: FimDaArea, L, base: str, conta: str, pac: str, ao_abrir, telas: list | None = None, com_foto: bool = False) -> None:
    """Entra pela lista de alunos (fora da área) e abre cada tela da conta pela navegação do app; ao_abrir(tela, rota, marca, teto, pronta, t_area).
    com_foto (a massa pôs 1 foto no diário de hoje): o Dashboard só está pronto com a miniatura PEDIDA (a série lista → assinar) — etapa 2,
    14:09: com o Dashboard lento (as funções do Treino/financeiro, fora da área), o diario_urls dele caiu na janela da tela seguinte e foi
    contado no Planejamento; agora a janela do Dashboard espera a miniatura (até 20 s) e fica quieta antes de seguir."""
    t.entrar(L, conta, D.ENTRADA)
    o.ok(t.esperar(lambda: t.n("[data-casca]") > 0, 60), f"[{base}] {conta}: o painel abriu (a casca)", parar=True)
    B.esperar_pronto(t, pend, max_s=40)
    for tela, rota, marca, teto in (telas if telas is not None else D.telas_da_conta(conta)):
        fim.zerar()
        inicio = time.time()
        B.navegar(t, D.rota(rota, pac))
        pronta = B.esperar_pronto(t, pend, marca=marca)
        if com_foto and tela == "dashboard" and conta != D.PERSONAL and not miniatura_pedida(t.pedidos):
            pediu = t.esperar(lambda: miniatura_pedida(t.pedidos), 20)
            B.esperar_pronto(t, pend, min_s=0.5, quieto_s=1.5)
            pronta = {**pronta, "pedidos": list(t.pedidos)}
            o.linha(f"   [{base}] {conta.split('-')[-1]} dashboard: a miniatura do diário {'chegou depois da tela pronta' if pediu else 'NÃO foi pedida em 20 s'}"
                    f" (a janela esperou: {len(t.pedidos)} pedidos)")
        o.ok(t.n(marca) > 0, f"[{base}] {conta.split('-')[-1]} {tela}: a tela abriu ({marca}; marca em {pronta['t_marca_s']} s)", parar=False)
        ao_abrir(tela, rota, marca, teto, pronta, _t_area(fim, inicio))


def acao_do_corpo(p: dict) -> str:
    """A ação que o SERVIDOR atende (o `acao` do corpo — o moduloDoPedido; o `action` disfarçado não conta)."""
    try:
        b = json.loads(p.get("corpo") or "{}")
    except Exception:  # noqa: BLE001
        return "?"
    return str(b.get("acao")) if isinstance(b, dict) else "?"


def gravacoes_da_preconsulta(pedidos: list[dict]) -> tuple[dict, dict]:
    """As gravações da Pré-consulta numa janela: pela função (a ação do corpo de cada POST na nutricao que grava) e as DIRETAS nas 2 tabelas
    (POST/PATCH/DELETE)."""
    fn = Counter(acao_do_corpo(p) for p in pedidos if p.get("tipo") == "fn" and p.get("nome") == "nutricao" and p.get("metodo") == "POST"
                 and B.B17.funcao_grava("nutricao", p.get("acao"), p.get("corpo")))
    diretas = Counter(f"{p.get('metodo')} {p.get('tipo')}:{p.get('nome')}" for p in pedidos
                      if p.get("tipo") == "tab" and p.get("nome") in TABELAS_PRECONSULTA and p.get("metodo") in ("POST", "PATCH", "DELETE"))
    return dict(fn), dict(diretas)


def massa_do_diario(o, L, estado, pac: str, rodada: str) -> dict | None:
    """A foto da massa no diário da aluna (a ação da hml-19b, pela aluna): o Diário e o Dashboard com miniatura."""
    return D.criar_foto_do_diario(o, estado, L.token(D.ALUNA), pac, rodada)


class FluxoPreconsulta:
    """A Pré-consulta PELA TELA (a nutri): criar → editar → a resposta anônima → ligar → desligar → excluir a resposta → excluir o formulário.
    Cada passo conta as gravações da janela (pela função × direto) e anota os ids no Estado (o --limpar desfaz o que sobrar)."""

    def __init__(self, o, t, pend, base: str, fase: str, estado, rodada: str, pac: str, pr=None) -> None:
        self.o, self.t, self.pend, self.base, self.fase, self.e, self.rodada, self.pac, self.pr = o, t, pend, base, fase, estado, rodada, pac, pr
        self.passos: list[tuple[str, dict, dict]] = []

    def _janela(self, acao: str, fazer, esperar, timeout: float = 40) -> bool:
        self.t.zerar_pedidos()
        fazer()
        ok = self.t.esperar(esperar, timeout)
        self.t.pg.wait_for_timeout(600)
        fn, diretas = gravacoes_da_preconsulta(self.t.pedidos)
        self.passos.append((acao, fn, diretas))
        if self.fase == "depois":
            self.o.ok(ok and fn == {acao: 1} and not diretas,
                      f"[{self.base}] Pré-consulta pela tela — {acao}: 1 POST na nutricao com a ação, 0 gravação direta ({fn or '—'}; diretas {diretas or '—'})")
        else:
            self.o.ok(ok, f"[{self.base}] [{self.fase}] Pré-consulta pela tela — {acao}: feito (a referência: pela função {fn or '—'}; direto {diretas or '—'})")
        return ok

    def rodar(self) -> None:  # noqa: PLR0915
        t, s = self.t, B.schema()
        titulo = f"{B.MARCA} {self.rodada} formulário tela"
        B.navegar(t, "/painel/pre-consulta", primeira=True)
        B.esperar_pronto(t, self.pend, marca="[data-aba-formularios]")

        def criar() -> None:
            t.pg.locator("[data-btn-novo-formulario]").first.click()
            t.esperar(lambda: t.n('[data-modal-formulario="novo"]') > 0, 15)
            if t.n('[data-origem="personalizado"]'):
                t.pg.locator('[data-origem="personalizado"]').click()
            t.esperar(lambda: t.n('[data-modal-formulario="novo"][data-etapa-formulario="dados"]') > 0, 15)
            t.pg.locator("[data-campo-titulo-formulario]").fill(titulo)
            if not t.n('[data-campo-pergunta-texto="0"]'):
                t.pg.locator("[data-btn-adicionar-pergunta]").click()
            t.pg.locator('[data-campo-pergunta-texto="0"]').fill("Como você dorme?")
            t.pg.locator('[data-campo-pergunta-tipo="0"]').select_option("texto")
            t.pg.locator("[data-btn-salvar-formulario]").click()

        if not self._janela("preconsulta_formulario_criar", criar, lambda: t.n(f'[data-formulario-titulo="{titulo}"]') > 0 and t.n("[data-modal-formulario]") == 0):
            return
        item = t.pg.locator(f'[data-formulario-titulo="{titulo}"]').first
        fid, slug = item.get_attribute("data-formulario"), item.get_attribute("data-formulario-slug")
        if C.eh_uuid(fid):
            D.anotar(self.e, "formularios_preconsulta", fid)
        banco = B.ler_principal(f"select nutricionista_id::text as dono, slug from {s}.formularios_preconsulta where id = {C.txt(C.uuid_ok(fid))}") if C.eh_uuid(fid) else []
        self.o.ok(bool(banco) and banco[0]["slug"] == slug and bool(re.match(r"^[abcdefghijkmnpqrstuvwxyz23456789]{8}$", str(slug))),
                  f"[{self.base}] o formulário criado pela tela está no banco com o slug que a lista mostra (no alfabeto da tela)")
        if self.pr:
            self.pr("c_preconsulta_criado")
        novo = f"{titulo} editado"

        def editar() -> None:
            t.pg.locator(f'[data-formulario="{fid}"] [data-btn-editar-formulario]').click()
            t.esperar(lambda: t.n('[data-modal-formulario="editar"]') > 0, 15)
            t.pg.locator("[data-campo-titulo-formulario]").fill(novo)
            t.pg.locator("[data-btn-salvar-formulario]").click()

        self._janela("preconsulta_formulario_editar", editar, lambda: t.n(f'[data-formulario-titulo="{novo}"]') > 0 and t.n("[data-modal-formulario]") == 0)
        # a resposta anônima pelo /f/:slug (a RPC de hoje, como a página pública)
        st, rid = D.responder_como_anonimo(str(slug), self.rodada, "tela")
        if C.eh_uuid(rid):
            D.anotar(self.e, "respostas_preconsulta", rid)
        if not self.o.ok(st == 200 and C.eh_uuid(rid), f"[{self.base}] a resposta anônima ao formulário criado pela tela ({st})"):
            return
        B.navegar(t, "/painel/pre-consulta?aba=respostas", primeira=True)
        B.esperar_pronto(t, self.pend, marca=f'[data-resposta="{rid}"]')
        nome = str((B.ler_principal(f"select nome from {s}.pacientes where id = {C.txt(C.uuid_ok(self.pac))}") or [{}])[0].get("nome") or "")

        def ligar() -> None:
            t.pg.locator(f'[data-resposta="{rid}"] [data-btn-ligar-resposta]').click()
            t.esperar(lambda: t.n(f'[data-modal-ligar="{rid}"]') > 0, 15)
            lista = '[data-seletor-aluno="ligar"]'
            t.pg.locator(f"{lista} [data-seletor-aluno-busca]").fill(nome[:40])
            t.esperar(lambda: t.n(f'{lista} [data-opcao-aluno="{self.pac}"]') > 0, 20)
            t.pg.locator(f'{lista} [data-opcao-aluno="{self.pac}"]').click()
            t.pg.locator("[data-btn-salvar-ligar]").click()

        self._janela("preconsulta_resposta_ligar", ligar, lambda: t.attr(f'[data-resposta="{rid}"]', "data-resposta-aluno") == [self.pac])
        if self.pr:
            self.pr("c_preconsulta_ligada")
        self._janela("preconsulta_resposta_ligar", lambda: t.pg.locator(f'[data-resposta="{rid}"] [data-btn-desligar-resposta]').click(),
                     lambda: t.attr(f'[data-resposta="{rid}"]', "data-resposta-aluno") == [""])

        def excluir_resposta() -> None:
            t.pg.locator(f'[data-resposta="{rid}"] [data-btn-excluir-resposta]').click()
            t.pg.locator("[data-btn-confirmar-excluir-resposta]").click()

        self._janela("preconsulta_resposta_excluir", excluir_resposta, lambda: t.n(f'[data-resposta="{rid}"]') == 0)
        B.navegar(t, "/painel/pre-consulta", primeira=True)
        B.esperar_pronto(t, self.pend, marca=f'[data-formulario="{fid}"]')

        def excluir_formulario() -> None:
            t.pg.locator(f'[data-formulario="{fid}"] [data-btn-excluir-formulario]').click()
            t.pg.locator("[data-btn-confirmar-excluir-formulario]").click()

        self._janela("preconsulta_formulario_excluir", excluir_formulario, lambda: t.n(f'[data-formulario="{fid}"]') == 0)
        vivos = B.ler_principal(f"select (select count(*) from {s}.formularios_preconsulta where id = {C.txt(fid)} and deleted_at is null)::int as f, "
                                f"(select count(*) from {s}.respostas_preconsulta where id = {C.txt(rid)} and deleted_at is null)::int as r")[0]
        self.o.ok(vivos == {"f": 0, "r": 0}, f"[{self.base}] o formulário e a resposta da tela foram à Lixeira (conferido no banco: {vivos})")


def rodar_rede(o, base: str, canal: str | None) -> None:
    from playwright.sync_api import sync_playwright  # noqa: PLC0415

    s = B.usar_base(base)
    L = B.Sessoes(f"rede20 dieta {base}")
    commit = B.commit_medido(base)
    fase = fase_da_dieta(base, commit)
    estado = None
    try:
        B.exigir_saude(o, "o rede.py da hml-20 (dieta)")
        pac, contas = plano_da_base(o, base)
        guarda = B.Guarda() if base == "prod" else None
        com_foto = False
        if base != "prod":
            pendente = B.Estado.ler()
            if not pendente.vazio():
                o.ok(False, f"há uma rodada que caiu no meio (área {pendente.d.get('area')}): rode o --limpar antes", parar=True)
            rodada = B.nova_rodada()
            estado = B.Estado({"rodada": rodada, "schema": s, "area": D.AREA_ESTADO, "linhas": [], "storage": [], "n8": None, "pac": pac})
            estado.salvar()
            com_foto = bool(massa_do_diario(o, L, estado, pac, rodada))
        with sync_playwright() as pw:
            o.linha(f"[{base}] {commit}: o {fase}")
            for conta, telas in contas:
                nav, t = _abrir_conta(pw, canal, base, conta, guarda)
                pend = B.Pendentes(t.pg)
                fim = FimDaArea(t.pg)

                def ao_abrir(tela, _rota, _marca, teto, pronta, t_area, conta=conta):
                    cont = D.contar_dieta(pronta["pedidos"])
                    conferir_rede(o, base, fase, conta, tela, teto, cont, pronta)
                    anotar_rede(base, commit, fase, conta, tela, cont, pronta, t_area)

                try:
                    percorrer(o, t, pend, fim, L, base, conta, pac, ao_abrir, telas, com_foto=com_foto)
                    if estado is not None and conta == D.NUTRI:
                        f = FluxoPreconsulta(o, t, pend, base, fase, estado, estado.d["rodada"], pac)
                        f.rodar()
                        for acao, fn, diretas in f.passos:
                            anotar_rede(base, commit, fase, conta, f"preconsulta_tela:{acao}", {"diretas": {}, "funcao": {}, "consultas": {},
                                                                                                "fora": {}, "gravacoes": {**fn, **diretas}},
                                        {"pedidos": [], "t_pronto_s": None}, None)
                    if guarda:
                        fora = [b for b in guarda.bloqueadas if b not in BARRADAS_ACEITAS]
                        o.ok(not fora, f"[prod] a Guarda só barrou as gravações que já existem e não são desta W (o garantir do 1º acesso e o "
                                       f"aluno_acesso — H-43): {sorted(set(guarda.bloqueadas)) or '—'}" + (f" · outras: {fora}" if fora else ""))
                finally:
                    _fechar_conta(o, base, conta, L, nav, t)
    finally:
        if estado is not None:
            D.limpar_massa(o, estado, L, s)
        L.fechar(o)


def referencia(conta: str, medida: str, rota_spec: str) -> float | None:
    """O ANTES desta medida: a última rodada do staging com o código antigo nesta planilha; sem ela, o número da spec (o t_pronto)."""
    if PLANILHA_TELAS.exists():
        linhas = PLANILHA_TELAS.read_text(encoding="utf-8").splitlines()
        cab = linhas[0].split("\t") if linhas else []
        antes = [dict(zip(cab, l.split("\t"))) for l in linhas[1:]]
        antes = [x for x in antes if x.get("fase") == "antes" and x.get("conta") == conta and x.get("medida") == medida and x.get("mediana_s") not in ("", "None")]
        if antes:
            return float(antes[-1]["mediana_s"])
    if medida.startswith("tempo:"):
        return D.antes_da_spec_dieta().get((conta, rota_spec))
    return None


def anotar_telas(base: str, commit: str, fase: str, conta: str, medida: str, valores: list, mediana: float | None, ref: float | None, ok: object) -> None:
    B.anotar_planilha(PLANILHA_TELAS, CAB_TELAS, [time.strftime("%Y-%m-%d %H:%M"), base, commit, fase, conta, medida, len(valores),
                                                  ",".join(str(v) for v in valores), mediana, ref, ok])


def conferir_tempo(o, base: str, commit: str, fase: str, conta: str, medidas: dict[str, dict[str, list]]) -> None:
    """A mediana das 3 rodadas de cada tela ≤ o antes + 0,3 s (o Dashboard: a parte da 20c; o total = informação)."""
    for tela, rota, _marca, _teto in D.telas_da_conta(conta):
        totais = medidas.get(tela, {}).get("total", [])
        area = medidas.get(tela, {}).get("area", [])
        de_fora = tela in TELAS_DE_FORA
        med_total = B.mediana(totais)
        ref_total = referencia(conta, f"tempo:{tela}", D.rota_da_spec(rota))
        if de_fora:
            med, ref = B.mediana(area), referencia(conta, f"area:{tela}", D.rota_da_spec(rota))
            ok = None if fase != "depois" or ref is None or med is None else med <= ref + FOLGA_S
            anotar_telas(base, commit, fase, conta, f"area:{tela}", area, med, ref, ok)
            anotar_telas(base, commit, fase, conta, f"tempo:{tela}", totais, med_total, ref_total, None)  # o total: informação
        else:
            med, ref = med_total, ref_total
            ok = None if fase != "depois" or ref is None or med is None else med <= ref + FOLGA_S
            anotar_telas(base, commit, fase, conta, f"tempo:{tela}", totais, med_total, ref_total, ok)
        rot = f"{conta.split('-')[-1]} {tela}"
        if fase != "depois":
            o.linha(f"   [{fase}] {rot}: total {totais} → {med_total} s" + (f"; a parte da 20c {area} → {med} s" if de_fora else "") + " (a referência)")
            continue
        quem = "a parte da 20c" if de_fora else "a tela"
        if not o.ok(ok is not False, f"[depois] {rot}: {quem} mediana {med} s ≤ antes {ref} + {FOLGA_S} s ({area if de_fora else totais})"
                    + (f" · o total (informação): {med_total} s × antes {ref_total}" if de_fora else "") + (" — sem o antes medido" if ref is None else "")):
            o.linha(f"TEMPO {rot} {ref} × {med} (≤ antes + {FOLGA_S} s) — a decisão é da sessão principal")


def caso_diario_foto(o, t, pend, base: str, pr, diario: dict) -> None:
    """c_diario_foto: a foto da massa, aberta no Diário (a miniatura e a foto grande pela URL do servidor no depois; a do navegador no antes)."""
    B.navegar(t, "/painel/dietas?aba=diario")
    B.esperar_pronto(t, pend, marca=f'[data-registro="{diario["id"]}"]')
    cartao = f'[data-registro="{diario["id"]}"]'
    mini = t.esperar(lambda: t.n(f"{cartao} [data-foto]") > 0, 30)
    try:
        t.pg.locator(f"{cartao} [data-btn-ver-foto]").first.click()
        carregou = t.esperar(lambda: t.attr(f'[data-modal-ver-foto-diario="{diario["id"]}"]', "data-carregou") == ["1"] and t.n("[data-foto-grande]") > 0, 30)
    except Exception as e:  # noqa: BLE001
        carregou = False
        o.linha(f"   (c_diario_foto: {type(e).__name__})")
    o.ok(mini and carregou, f"[{base}] c_diario_foto: a miniatura e a foto grande da massa abrem no Diário (data-carregou=1)")
    pr("c_diario_foto")
    t.pg.keyboard.press("Escape")
    t.pg.wait_for_timeout(400)


def caso_erro(o, t, pend, base: str, pr, pac: str) -> None:
    """c_dieta_erro: a leitura da seção Cálculo energético barrada (o `ler` com calculos_do_aluno no depois; o GET do REST no antes) — a
    casca já carregada (o Planejamento antes, fora da barreira) → a seção mostra o aviso de erro dela."""
    tela, sufixo, consulta, tabela, marca = ERRO
    padrao = re.compile(rf"https://api-principal\.physiqcalc\.com\.br/(functions/v1/nutricao|rest/v1/{tabela})")

    def barrar(route, req) -> None:
        corpo = B.B17.corpo_do_pedido(req) or ""
        eh_ler = req.method == "POST" and "/functions/v1/nutricao" in req.url and B.B17.corpo_de_leitura("nutricao", corpo) \
            and consulta in B.consultas_do_corpo(corpo)
        eh_rest = req.method == "GET" and f"/rest/v1/{tabela}" in req.url
        if eh_ler or eh_rest:
            route.abort()
            return
        route.fallback()

    B.navegar(t, D.rota("/painel/alunos/{pac}/dieta", pac))
    B.esperar_pronto(t, pend, marca="[data-secao-planejamento]")
    t.ctx.route(padrao, barrar)
    try:
        B.navegar(t, D.rota(f"/painel/alunos/{{pac}}/dieta{sufixo}", pac))
        alerta = f'{marca} [role="alert"], {marca} [data-estado="erro"]'
        ok = t.esperar(lambda: t.n(alerta) > 0, 40)
        o.ok(ok, f"[{base}] c_dieta_erro: a seção {tela} com a leitura barrada → o aviso de erro dela (\"{t.texto(alerta)[:70]}\")")
        pr("c_dieta_erro")
    finally:
        t.ctx.unroute(padrao, barrar)


def rodar_telas(o, base: str, canal: str | None, casos: list[str], prefixo: str | None) -> None:  # noqa: PLR0915
    from playwright.sync_api import sync_playwright  # noqa: PLC0415

    if base == "prod":
        raise SystemExit("telas.py é local e staging (a produção é o F7 da sessão principal, só leitura)")
    s = B.usar_base(base)
    L = B.Sessoes(f"telas20 dieta {base}")
    commit = B.commit_medido(base)
    fase = fase_da_dieta(base, commit)
    estado = None
    try:
        B.exigir_saude(o, "o telas.py da hml-20 (dieta)")
        pac = B.B17.matricula_da_aluna()
        diario = None
        if "prints" in casos:
            pendente = B.Estado.ler()
            if not pendente.vazio():
                o.ok(False, f"há uma rodada que caiu no meio (área {pendente.d.get('area')}): rode o --limpar antes", parar=True)
            rodada = B.nova_rodada()
            estado = B.Estado({"rodada": rodada, "schema": s, "area": D.AREA_ESTADO, "linhas": [], "storage": [], "n8": None, "pac": pac})
            estado.salvar()
            diario = massa_do_diario(o, L, estado, pac, rodada)
        rodadas = ABERTURAS if "tempo" in casos else 1
        with sync_playwright() as pw:
            o.linha(f"[{base}] {commit}: o {fase} · {rodadas} rodada(s)")
            for conta in (D.NUTRI, D.PERSONAL):
                quem = "nutri" if conta == D.NUTRI else "personal"
                medidas: dict[str, dict[str, list]] = {}
                for n in range(rodadas):
                    nav, t = _abrir_conta(pw, canal, base, conta)
                    pend = B.Pendentes(t.pg)
                    fim = FimDaArea(t.pg)
                    pr = lambda caso, t=t: B.print_reduzido(t.pg, prefixo or base, caso, o, pasta=PRINTS)  # noqa: E731

                    def ao_abrir(tela, _rota, marca, _teto, pronta, t_area, n=n, t=t, pr=pr):
                        medidas.setdefault(tela, {"total": [], "area": []})
                        medidas[tela]["total"].append(pronta["t_pronto_s"])
                        medidas[tela]["area"].append(t_area)
                        if n == 0 and "prints" in casos:
                            sem_erro = t.n(marca) > 0 and not t.n('[data-estado="erro"]')
                            caso = f"c_{tela}_personal" if conta == D.PERSONAL else f"c_{tela}"
                            o.ok(sem_erro, f"[{base}] {caso}: a tela com o dado, sem erro (pronta em {pronta['t_pronto_s']} s)")
                            pr(caso)

                    try:
                        percorrer(o, t, pend, fim, L, base, conta, pac, ao_abrir, com_foto=bool(diario))
                        if n == 0 and "prints" in casos and conta == D.NUTRI:
                            if diario:
                                caso_diario_foto(o, t, pend, base, pr, diario)
                            caso_erro(o, t, pend, base, pr, pac)
                            FluxoPreconsulta(o, t, pend, base, fase, estado, estado.d["rodada"], pac, pr).rodar()
                    finally:
                        _fechar_conta(o, base, conta, L, nav, t)
                if "tempo" in casos:
                    conferir_tempo(o, base, commit, fase, conta, medidas)
    finally:
        if estado is not None:
            D.limpar_massa(o, estado, L, s)
        L.fechar(o)


ARQUIVO = Path(__file__).name
