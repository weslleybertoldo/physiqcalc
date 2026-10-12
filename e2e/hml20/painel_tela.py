"""Physiq hml-20b (H-42 · jeito 2, etapa 2, 12/10/2026) — a REDE e as TELAS do Painel › Aluno no navegador (Edge, painel 1280 × 883):
o `rede.py --area painel-aluno` e o `telas.py --area painel-aluno`.

Contas (staging, só de TESTE): a w5p-nutri abre a Avaliação (a 1ª: a casca e a série sem cache — painel.telas_da_conta), o Resumo e o
Prontuário ×10 da w5p-aluna; a w5p-personal, a Avaliação e o Resumo (um navegador por vez; a sessão guardada reaproveitada; no fim, o
logout da sessão do TREINO que o painel abriu — decisão 23).
REDE (rede_hml20b.tsv, antes × depois na mesma planilha): em cada tela a guarda que CONTA (painel.contar_painel) separa
  · as leituras DIRETAS da área (GET das 20 tabelas, POST das 4 RPCs, o "sign" de anexos/evolucao) — depois: 0;
  · as leituras pela função (o `ler`, com as consultas de cada um) — depois: no máximo o teto da tela (a seção do Prontuário, 1);
  · as de FORA da área (o Resumo: planos_do_aluno/plano_alimentar/refeicoes_concluidas — 20c —; aluno_compromissos, aluno_responsavel,
    aluno_acesso, paciente_dado_livre — H-43): listadas à parte, NÃO são falha;
  · as gravações ao abrir: 0, fora as que já existem e não são desta W (o padroes_garantir do 1º acesso — hml-19a — e o aluno_acesso do
    Resumo, que garante o acesso — H-43), listadas à parte.
TELAS (telas_hml20b.tsv; prints em prints/hml20/b/<prefixo>_<caso>.png + a cópia de 900 px — CONFERIR cada um: tela certa, sem login nem
"carregando", nomes de teste):
  b_resumo_nutri · b_avaliacao_nutri · b_prontuario_<secao> ×10 · b_anexo_ver (o anexo de imagem da massa, aberto no "Ver" pela URL do
  servidor) · b_prontuario_erro (a seção Consultas com a leitura barrada: a nutricao no depois, o REST no antes — o estado de erro; só o
  texto muda) · b_resumo_personal · b_avaliacao_personal
  e o TEMPO (decisão J): cada tela aberta 3 vezes pela navegação do app (aquecido), a mediana ≤ a do ANTES + 0,3 s (o antes = a rodada do
  staging com o código antigo nesta planilha; sem ela, o da spec, rede_por_tela.tsv). O Resumo e a Avaliação dependem das funções do
  Treino (2,3–3,4 s, variam muito): ali o critério vale para a parte do PRINCIPAL (o fim da última leitura do principal da área — o `ler`
  depois, as diretas antes) e o total entra como informação. Pior que antes + 0,3 s → a linha "TEMPO <tela> <antes> × <depois>" (a
  decisão é da sessão principal).
Antes de CADA execução: ~/projetos/physiqcalc-scratch/hml/hml19/ferramentas/pausa.sh "<o que ia rodar>" (e o /health, aqui dentro).
"""
from __future__ import annotations

import json
import re
import subprocess
import time
from pathlib import Path
from urllib.parse import urlparse

import _base as B
import painel as P

C = B.C
PRINTS = Path.home() / "projetos" / "physiqcalc-scratch" / "prints" / "hml20" / "b"
PLANILHA_REDE = B.MEDICAO / "rede_hml20b.tsv"
PLANILHA_TELAS = B.MEDICAO / "telas_hml20b.tsv"
CAB_REDE = ["quando", "base", "commit", "fase", "conta", "tela", "diretas", "diretas_detalhe", "ler", "consultas", "fora_da_area", "gravacoes",
            "pedidos", "t_pronto_s", "t_principal_s"]
CAB_TELAS = ["quando", "base", "commit", "fase", "conta", "medida", "n", "valores_s", "mediana_s", "referencia_s", "ok"]
FOLGA_S = 0.3
ABERTURAS = 3
TELAS_DO_TREINO = {"resumo", "avaliacao"}  # dependem das funções do Treino: o critério é a parte do principal
SECAO_DO_ERRO = "consultas"
PRINTS_B = (
    ["b_resumo_nutri", "b_avaliacao_nutri"] + [f"b_prontuario_{s}" for s, _m, _t in P.SECOES] + ["b_anexo_ver", "b_prontuario_erro", "b_resumo_personal",
                                                                                                  "b_avaliacao_personal"]
)
# o código medido é o depois quando a casca do painel lê pela função (o 6fd3194 — o staging do antes — já tem o leitura.ts da 20a)
MARCA_DO_DEPOIS = ("src/painel/aluno/dados/api.ts", 'lerNutricao("aluno_perfil"')


def fase_do_painel(base: str, commit: str) -> str:
    """depois = o commit medido já lê a casca pela função (a lib da 20b); antes = o código antigo; o commit que não está aqui → ?"""
    if base == "local":
        return "depois"
    arq, marca = MARCA_DO_DEPOIS
    r = subprocess.run(["git", "-C", str(B.REPO), "show", f"{commit}:{arq}"], capture_output=True, text=True, timeout=10)
    if r.returncode != 0:
        return "?"
    return "depois" if marca in r.stdout else "antes"


class FimDoPrincipal:
    """O instante em que cada leitura do PRINCIPAL da área terminou (o `ler` da nutricao no depois; as diretas da área no antes) — a
    "parte do principal" do Resumo e da Avaliação (o resto da tela espera as funções do Treino)."""

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
        if B.leitura_direta(p, "painel-aluno") or B.leitura_pela_funcao(p) == "fn:nutricao(ler)":
            self.fins.append(time.time())


def anotar_rede(base: str, commit: str, fase: str, conta: str, tela: str, cont: dict, pronta: dict, t_principal: float | None) -> None:
    fmt = lambda d: ",".join(f"{k}×{v}" for k, v in sorted(d.items())) or "-"  # noqa: E731
    B.anotar_planilha(PLANILHA_REDE, CAB_REDE, [
        time.strftime("%Y-%m-%d %H:%M"), base, commit, fase, conta, tela, sum(cont["diretas"].values()), fmt(cont["diretas"]),
        cont["funcao"].get("fn:nutricao(ler)", 0), fmt(cont["consultas"]), fmt(cont["fora"]), fmt(cont["gravacoes"]), len(pronta["pedidos"]),
        pronta["t_pronto_s"], t_principal,
    ])


def conferir_rede(o, base: str, fase: str, conta: str, tela: str, teto: int, cont: dict, pronta: dict) -> None:
    diretas = sum(cont["diretas"].values())
    ler = cont["funcao"].get("fn:nutricao(ler)", 0)
    rot = f"[{base}] {conta.split('-')[-1]} {tela}"
    o.ok(not cont["gravacoes_novas"], f"{rot}: 0 gravação nova ao abrir ({cont['gravacoes_novas'] or '—'}; as que já existem: {cont['gravacoes_aceitas'] or '—'})")
    if cont["fora"]:
        o.linha(f"   {rot}: fora da área (outra W, lido direto — esperado): {cont['fora']}")
    if fase == "antes":
        if tela.startswith("prontuario_") or tela == "avaliacao":
            o.ok(diretas >= 1, f"[antes] {rot}: a leitura de saúde ia direto do navegador ({cont['diretas']})")
        return
    o.ok(diretas == 0, f"[depois] {rot}: 0 leitura direta da área (as tabelas, as 4 RPCs, o sign de anexos/evolucao) ({cont['diretas'] or '—'})")
    if tela == "avaliacao":  # hml-20b etapa 2 (ec101ce): a casca fria num lote só — o perfil e a série juntos
        o.ok(P.avaliacao_num_lote(ler, cont["consultas"]),
             f"[depois] {rot}: 1 `ler` com o perfil e a série juntos ({ler} `ler`; consultas {cont['consultas'] or '—'}) — t_pronto {pronta['t_pronto_s']} s")
        return
    o.ok(1 <= ler <= teto if tela.startswith("prontuario_") else ler <= teto,
         f"[depois] {rot}: {ler} `ler` (≤ {teto}; consultas {cont['consultas'] or '—'}) — t_pronto {pronta['t_pronto_s']} s")


def rota_do_aluno(pac: str, sufixo: str) -> str:
    return f"/painel/alunos/{pac}{sufixo}"


# ───────────────────────── o --seco (sem rede e sem navegador) ─────────────────────────
def seco(o, qual: str) -> None:
    faltam = [f"{arq}: {sel}" for arq, sels in P.SELETORES.items() for sel in sels if sel not in (B.REPO / arq).read_text(encoding="utf-8")]
    o.ok(not faltam, f"os {sum(len(v) for v in P.SELETORES.values())} seletores das telas do painel existem no código" + (f" — faltam: {faltam}" if faltam else ""))
    nutri = P.telas_da_conta(P.NUTRI)
    personal = P.telas_da_conta(P.PERSONAL)
    o.ok(len(nutri) == 12 and [t[0] for t in personal] == ["avaliacao", "resumo"] and [t[0] for t in nutri[:2]] == ["avaliacao", "resumo"]
         and nutri[2] == ("prontuario_anotacoes", "/prontuario", "[data-secao-anotacoes]", 1) and nutri[3][1] == "/prontuario?secao=consultas",
         "as telas, na ordem: a Avaliação (a 1ª: a casca e a série sem cache), o Resumo e — a nutri — as 10 seções do Prontuário (a 1ª é a "
         "padrão: /prontuario); a personal — a Avaliação e o Resumo")
    secoes = [s for s, _m, _t in P.SECOES]
    rotas_da_spec = {r for (_c, r) in P.antes_da_spec_painel()}
    o.ok(all(P.rota_da_spec(f"/prontuario?secao={s}") in rotas_da_spec for s in secoes if s != "anotacoes") and P.rota_da_spec("/prontuario") in rotas_da_spec
         and P.rota_da_spec("") in rotas_da_spec and P.rota_da_spec("/avaliacao") in rotas_da_spec,
         f"o antes da spec (rede_por_tela.tsv) tem cada tela do painel ({len(rotas_da_spec)} rotas da nutri/personal)")
    Pp, Tt = B.API_P, B.API_T
    pac = "11111111-1111-4111-8111-111111111111"
    antes = [
        {"metodo": "POST", "tipo": "rpc", "nome": "aluno_perfil", "url": f"{Pp}/rest/v1/rpc/aluno_perfil", "corpo": "{}"},
        {"metodo": "POST", "tipo": "rpc", "nome": "aluno_evolucao", "url": f"{Pp}/rest/v1/rpc/aluno_evolucao", "corpo": "{}"},
        {"metodo": "POST", "tipo": "storage", "nome": "sign", "url": f"{Pp}/storage/v1/object/sign/evolucao-staging", "corpo": "{}"},
        {"metodo": "GET", "tipo": "tab", "nome": "consultas", "url": f"{Pp}/rest/v1/consultas?select=*&paciente_id=eq.{pac}", "corpo": ""},
        {"metodo": "GET", "tipo": "tab", "nome": "profiles", "url": f"{Pp}/rest/v1/profiles?select=nome", "corpo": ""},
        {"metodo": "POST", "tipo": "storage", "nome": "sign", "url": f"{Pp}/storage/v1/object/sign/anexos-staging/a/b.png", "corpo": "{}"},
        # fora da área (20c e H-43): listadas à parte
        {"metodo": "POST", "tipo": "rpc", "nome": "planos_do_aluno", "url": f"{Pp}/rest/v1/rpc/planos_do_aluno", "corpo": "{}"},
        {"metodo": "GET", "tipo": "tab", "nome": "refeicoes_concluidas", "url": f"{Pp}/rest/v1/refeicoes_concluidas?select=*", "corpo": ""},
        {"metodo": "POST", "tipo": "rpc", "nome": "aluno_compromissos", "url": f"{Pp}/rest/v1/rpc/aluno_compromissos", "corpo": "{}"},
        {"metodo": "POST", "tipo": "rpc", "nome": "aluno_acesso", "url": f"{Pp}/rest/v1/rpc/aluno_acesso", "corpo": "{}"},
        # o Treino (já pelo servidor: a treino-leitura) não é da área
        {"metodo": "POST", "tipo": "fn", "nome": "treino-leitura", "acao": "avaliacoes", "url": f"{Tt}/functions/v1/treino-leitura",
         "corpo": json.dumps({"action": "avaliacoes"})},
    ]
    c = P.contar_painel(antes)
    o.ok(sum(c["diretas"].values()) == 6 and c["fora"] == {"rpc:planos_do_aluno": 1, "tab:refeicoes_concluidas": 1, "rpc:aluno_compromissos": 1, "rpc:aluno_acesso": 1}
         and c["gravacoes_aceitas"] == {"rpc:aluno_acesso": 1} and not c["gravacoes_novas"],
         f"a guarda do ANTES: 6 leituras diretas da área; as de fora da área à parte; o aluno_acesso (garante — H-43) nas gravações que já existem: {c['diretas']}")
    corpo_ler = json.dumps({"acao": "ler", "itens": [{"aluno": pac, "q": "aluno_perfil"}, {"q": "profissional"}]})
    depois = [
        {"metodo": "POST", "tipo": "fn", "nome": "nutricao", "acao": "ler", "url": f"{Pp}/functions/v1/nutricao", "corpo": corpo_ler},
        {"metodo": "POST", "tipo": "fn", "nome": "nutricao", "acao": "padroes_garantir", "url": f"{Pp}/functions/v1/nutricao",
         "corpo": json.dumps({"acao": "padroes_garantir", "secao": "anamnese"})},
        {"metodo": "GET", "tipo": "storage", "nome": "sign", "url": f"{Pp}/storage/v1/object/sign/anexos-staging/a/b.png?token=t", "corpo": ""},
        {"metodo": "POST", "tipo": "rpc", "nome": "planos_do_aluno", "url": f"{Pp}/rest/v1/rpc/planos_do_aluno", "corpo": "{}"},
    ]
    c = P.contar_painel(depois)
    o.ok(c["diretas"] == {} and c["funcao"] == {"fn:nutricao(ler)": 1} and c["consultas"] == {"aluno_perfil": 1, "profissional": 1}
         and c["gravacoes_aceitas"] == {"fn:nutricao(padroes_garantir)": 1} and not c["gravacoes_novas"] and c["fora"] == {"rpc:planos_do_aluno": 1},
         f"a guarda do DEPOIS: 0 direta da área, 1 `ler` (as consultas), o garantir do 1º acesso à parte, o GET da imagem não conta: {c}")
    juntas = {"aluno_perfil": 1, "aluno_evolucao_painel": 1}
    o.ok(P.avaliacao_num_lote(1, juntas) and not P.avaliacao_num_lote(2, juntas) and not P.avaliacao_num_lote(1, {"aluno_perfil": 1})
         and not P.avaliacao_num_lote(0, {}) and P.AVALIACAO[3] == 1,
         "a Avaliação no depois (a 1ª tela, a casca fria): 1 `ler` com o perfil e a série juntos — 2 voltas em série (o antes do ec101ce) "
         "ou a série fora do lote = falha")
    grava = [{"metodo": "POST", "tipo": "fn", "nome": "nutricao", "acao": "consulta_criar", "url": f"{Pp}/functions/v1/nutricao",
              "corpo": json.dumps({"acao": "consulta_criar"})},
             {"metodo": "POST", "tipo": "fn", "nome": "nutricao", "acao": "ler", "url": f"{Pp}/functions/v1/nutricao",
              "corpo": json.dumps({"action": "ler", "acao": "anexo_excluir"})}]
    c = P.contar_painel(grava)
    o.ok(sum(c["gravacoes_novas"].values()) == 2 and not c["funcao"], f"a guarda acha a gravação nova ao abrir (o `ler` disfarçado também): {c['gravacoes_novas']}")
    o.ok(fase_do_painel("local", "x") == "depois" and fase_do_painel("staging", "6fd3194") == "antes" and fase_do_painel("staging", "0000000") == "?",
         "antes × depois vem do CÓDIGO medido: o 6fd3194 (o staging do antes, que já tem o leitura.ts da 20a) lê a casca direto → antes")
    # a produção (decisão K; revisão 🟡1): a nutri-legado e o aluno de teste DELA, os padrões por SQL só leitura, a recusa sem aluno
    uid = "33333333-3333-4333-8333-333333333333"
    sqls = [P.sql_uid_da_conta("Nutri.Teste.Claude@physiqnutri.app"), P.sql_aluno_de_teste("public", uid), P.sql_padroes("public", uid)]
    escrita = re.compile(r"(?i)\b(insert|update|delete|truncate|alter|drop|create|grant|revoke|copy|merge|call)\b")
    o.ok(P.PRODUCAO == B.PROD_CONTA == "nutri-legado" and not any(escrita.search(re.sub(r"'[^']*'", "''", x)) for x in sqls)
         and sqls[0].startswith("select u.id::text as id from auth.users") and sqls[1].startswith("select p.id::text as id from public.pacientes")
         and "%.teste.claude@physiqnutri.app" in sqls[1] and "not like '%revisao%'" in sqls[1] and "p.deleted_at is null" in sqls[1]
         and sqls[2].count("count(*)") == 3 and "public.modelos_anamnese" in sqls[2] and "public.exames_catalogo" in sqls[2] and "public.modelos_documento" in sqls[2],
         "a produção: a nutri-legado; o aluno de TESTE dela e os padrões por SQL SÓ LEITURA (só o id e as contagens voltam; o e-mail de teste, sem as revisao.*)")
    tudo, nada = P.plano_da_producao({"modelos_anamnese": 1, "exames_catalogo": 12, "modelos_documento": 3}), P.plano_da_producao({})
    o.ok(len(tudo[0]) == 12 and not tudo[1] and len(nada[0]) == 9 and [t for t, _m in nada[1]] == ["prontuario_anamnese", "prontuario_exames", "prontuario_documentos"]
         and all("padroes_garantir" in m for _t, m in nada[1]) and "prontuario_consultas" in [t[0] for t in nada[0]],
         "a produção: Anamnese, Exames e Documentos só abrem com os padrões da conta (sem eles: pulam, com o motivo); o resto abre só leitura")
    recusou = ""
    try:
        P.escolher_aluno_de_producao([])
    except SystemExit as e:
        recusou = str(e)
    o.ok("não tem aluno de TESTE" in recusou and "não abre nada" in recusou and P.escolher_aluno_de_producao([{"id": uid}]) == uid,
         "a produção sem aluno de teste da nutri-legado: o --base prod RECUSA com a mensagem clara (antes de abrir o navegador)")
    o.ok(BARRADAS_ACEITAS == {"POST fn:nutricao", "POST rpc:aluno_acesso"}, "a produção: a Guarda só pode barrar o garantir do 1º acesso e o aluno_acesso (H-43)")
    if qual == "telas":
        o.ok(len(PRINTS_B) == 16 and "b_anexo_ver" in PRINTS_B and "b_prontuario_erro" in PRINTS_B and PRINTS == B.PRINTS.parent / "b",
             f"os {len(PRINTS_B)} prints b_* da spec §5 (Resumo e Avaliação da nutri e da personal, as 10 seções, o Ver do anexo, o erro) em {PRINTS}")
        o.ok((FOLGA_S, ABERTURAS) == (0.3, 3) and TELAS_DO_TREINO == {"resumo", "avaliacao"},
             "os números do contrato (decisão J): ≤ antes + 0,3 s, 3 aberturas; o Resumo e a Avaliação pela parte do principal")
        o.ok(bool(re.search(r"https://api-principal\.physiqcalc\.com\.br/rest/v1/consultas", f"{B.API_P}/rest/v1/consultas?select=*"))
             and B.API_P.startswith("https://api-principal.physiqcalc.com.br"),
             "o b_prontuario_erro barra a leitura da seção nos 2 caminhos (o `ler` da nutricao e o REST da tabela)")


# ───────────────────────── a rodada no navegador ─────────────────────────
# Cada RODADA é um contexto novo do navegador com a sessão guardada (nenhum login novo): o painel abre no /painel (a carga fria) e cada tela
# da conta é aberta pela navegação do app, na ordem — a 1ª visita da sessão a cada tela (o React Query sem cache daquela tela, como a
# medição da spec; a seção Consultas lê a cada montagem). O tempo = 3 rodadas (a mediana); os prints, na 1ª.
def _abrir_conta(pw, canal, base: str, conta: str, guarda=None):
    nav = pw.chromium.launch(channel=canal, args=["--no-sandbox"]) if canal else pw.chromium.launch(args=["--no-sandbox"])
    t = B.Tela(nav, B.BASES[base], f"hml20b_{base}", conta, desktop=True, guarda=guarda)
    B.LegalDesligado().instalar(t.ctx)
    return nav, t


def _fechar_conta(o, base: str, conta: str, L, nav, t) -> None:
    B.sair_do_treino(o, t.pg, f"[{base}] {conta}")
    L.do_navegador(conta, t.pg)
    t.fim()
    nav.close()


def _t_principal(fim: FimDoPrincipal, inicio: float) -> float | None:
    return round(max(fim.fins) - inicio, 2) if fim.fins else None


def percorrer(o, t, pend, fim: FimDoPrincipal, L, base: str, conta: str, pac: str, ao_abrir, telas: list | None = None) -> None:
    """Entra no /painel e abre cada tela da conta pela navegação do app; ao_abrir(tela, sufixo, marca, teto, pronta, t_principal)."""
    t.entrar(L, conta, "/painel")
    o.ok(t.esperar(lambda: t.n("[data-casca]") > 0, 60), f"[{base}] {conta}: o painel abriu (a casca)", parar=True)
    B.esperar_pronto(t, pend, max_s=40)
    for tela, sufixo, marca, teto in (telas if telas is not None else P.telas_da_conta(conta)):
        fim.zerar()
        inicio = time.time()
        B.navegar(t, rota_do_aluno(pac, sufixo))
        pronta = B.esperar_pronto(t, pend, marca=marca)
        o.ok(t.n(marca) > 0, f"[{base}] {conta.split('-')[-1]} {tela}: a tela abriu ({marca}; marca em {pronta['t_marca_s']} s)", parar=False)
        ao_abrir(tela, sufixo, marca, teto, pronta, _t_principal(fim, inicio))


def plano_da_base(o, base: str) -> tuple[str, list[tuple[str, list]]]:
    """O aluno e as contas/telas da rodada: no local/staging, a w5p-aluna com a nutri (tudo) e a personal (Resumo e Avaliação); na
    PRODUÇÃO (decisão K), SÓ a nutri-legado e o aluno de teste DELA (SQL só leitura: só ids/contagem, nada impresso) — sem aluno de teste,
    recusa antes de abrir qualquer coisa; Anamnese, Exames e Documentos só se os padrões da conta já existem (senão pulam, com o motivo)."""
    if base != "prod":
        return B.B17.matricula_da_aluna(), [(P.NUTRI, P.telas_da_conta(P.NUTRI)), (P.PERSONAL, P.telas_da_conta(P.PERSONAL))]
    email = B.B5.CONTAS[P.PRODUCAO][0]
    uid = [x.get("id") for x in B.ler_principal(P.sql_uid_da_conta(email)) if C.eh_uuid(x.get("id"))]
    if not uid:
        raise SystemExit("produção: a conta de teste nutri-legado não existe no Auth — o --base prod não abre nada")
    pac = P.escolher_aluno_de_producao(B.ler_principal(P.sql_aluno_de_teste("public", uid[0])))
    padroes = (B.ler_principal(P.sql_padroes("public", uid[0])) or [{}])[0]
    telas, pulos = P.plano_da_producao(padroes)
    for tela, motivo in pulos:
        o.linha(f"[prod] {tela}: PULADA — {motivo}")
    o.linha(f"[prod] a nutri-legado e o aluno de teste dela (achado por SQL só leitura): {len(telas)} tela(s) só leitura com a Guarda, {len(pulos)} pulada(s)")
    return pac, [(P.PRODUCAO, telas)]


# as gravações que a Guarda pode barrar na produção ao abrir (não são desta W: o garantir do 1º acesso e o acesso do aluno, H-43)
BARRADAS_ACEITAS = {"POST fn:nutricao", "POST rpc:aluno_acesso"}


def rodar_rede(o, base: str, canal: str | None) -> None:
    from playwright.sync_api import sync_playwright  # noqa: PLC0415

    B.usar_base(base)
    L = B.Sessoes(f"rede20 painel-aluno {base}")
    commit = B.commit_medido(base)
    fase = fase_do_painel(base, commit)
    try:
        B.exigir_saude(o, "o rede.py da hml-20 (painel-aluno)")
        pac, contas = plano_da_base(o, base)
        guarda = B.Guarda() if base == "prod" else None
        with sync_playwright() as pw:
            o.linha(f"[{base}] {commit}: o {fase}")
            for conta, telas in contas:
                nav, t = _abrir_conta(pw, canal, base, conta, guarda)
                pend = B.Pendentes(t.pg)
                fim = FimDoPrincipal(t.pg)

                def ao_abrir(tela, _sufixo, _marca, teto, pronta, t_principal, conta=conta):
                    cont = P.contar_painel(pronta["pedidos"])
                    conferir_rede(o, base, fase, conta, tela, teto, cont, pronta)
                    anotar_rede(base, commit, fase, conta, tela, cont, pronta, t_principal)

                try:
                    percorrer(o, t, pend, fim, L, base, conta, pac, ao_abrir, telas)
                    if guarda:
                        fora = [b for b in guarda.bloqueadas if b not in BARRADAS_ACEITAS]
                        o.ok(not fora, f"[prod] a Guarda só barrou as gravações que já existem e não são desta W (o garantir do 1º acesso e o "
                                       f"aluno_acesso — H-43; a contagem por tela acima prova que eram essas): {sorted(set(guarda.bloqueadas)) or '—'}"
                                       + (f" · outras: {fora}" if fora else ""))
                finally:
                    _fechar_conta(o, base, conta, L, nav, t)
    finally:
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
        return P.antes_da_spec_painel().get((conta, rota_spec))
    return None


def anotar_telas(base: str, commit: str, fase: str, conta: str, medida: str, valores: list, mediana: float | None, ref: float | None, ok: object) -> None:
    B.anotar_planilha(PLANILHA_TELAS, CAB_TELAS, [time.strftime("%Y-%m-%d %H:%M"), base, commit, fase, conta, medida, len(valores),
                                                  ",".join(str(v) for v in valores), mediana, ref, ok])


def conferir_tempo(o, base: str, commit: str, fase: str, conta: str, medidas: dict[str, dict[str, list]]) -> None:
    """A mediana das 3 rodadas de cada tela ≤ o antes + 0,3 s (o Resumo e a Avaliação: a parte do principal; o total = informação)."""
    for tela, sufixo, _marca, _teto in P.telas_da_conta(conta):
        totais = medidas.get(tela, {}).get("total", [])
        principal = medidas.get(tela, {}).get("principal", [])
        do_treino = tela in TELAS_DO_TREINO
        med_total = B.mediana(totais)
        ref_total = referencia(conta, f"tempo:{tela}", P.rota_da_spec(sufixo))
        if do_treino:
            med, ref = B.mediana(principal), referencia(conta, f"principal:{tela}", P.rota_da_spec(sufixo))
            ok = None if fase != "depois" or ref is None or med is None else med <= ref + FOLGA_S
            anotar_telas(base, commit, fase, conta, f"principal:{tela}", principal, med, ref, ok)
            anotar_telas(base, commit, fase, conta, f"tempo:{tela}", totais, med_total, ref_total, None)  # o total: informação
        else:
            med, ref = med_total, ref_total
            ok = None if fase != "depois" or ref is None or med is None else med <= ref + FOLGA_S
            anotar_telas(base, commit, fase, conta, f"tempo:{tela}", totais, med_total, ref_total, ok)
        rot = f"{conta.split('-')[-1]} {tela}"
        if fase != "depois":
            o.linha(f"   [{fase}] {rot}: total {totais} → {med_total} s" + (f"; a parte do principal {principal} → {med} s" if do_treino else "") + " (a referência)")
            continue
        quem = "a parte do principal" if do_treino else "a tela"
        if not o.ok(ok is not False, f"[depois] {rot}: {quem} mediana {med} s ≤ antes {ref} + {FOLGA_S} s ({principal if do_treino else totais})"
                    + (f" · o total (informação): {med_total} s × antes {ref_total}" if do_treino else "") + (" — sem o antes medido" if ref is None else "")):
            o.linha(f"TEMPO {rot} {ref} × {med} (≤ antes + {FOLGA_S} s) — a decisão é da sessão principal")


def caso_anexo_ver(o, t, pend, base: str, pr, pac: str, anexo: dict) -> None:
    """b_anexo_ver: o anexo de imagem da massa, no "Ver" (a URL do servidor no depois; a do navegador no antes)."""
    B.navegar(t, rota_do_aluno(pac, "/prontuario?secao=anexos"))
    B.esperar_pronto(t, pend, marca="[data-secao-anexos]")
    botao = f'[data-lista-anexos] li:has-text("{anexo["nome"]}") [data-btn-ver-anexo]'
    if not t.n(botao):
        botao = "[data-btn-ver-anexo]"
    try:
        t.pg.locator(botao).first.click()
        carregou = t.esperar(lambda: t.attr("[data-modal-visualizar-anexo]", "data-carregou") == ["1"] and t.n("[data-img-anexo]") > 0, 30)
    except Exception as e:  # noqa: BLE001
        carregou = False
        o.linha(f"   (b_anexo_ver: {type(e).__name__})")
    o.ok(carregou, f"[{base}] b_anexo_ver: o Ver abre a imagem do anexo da massa (data-carregou=1)")
    pr("b_anexo_ver")
    t.pg.keyboard.press("Escape")
    t.pg.wait_for_timeout(400)


def caso_erro(o, t, pend, base: str, pr, pac: str) -> None:
    """b_prontuario_erro: a leitura da seção Consultas barrada (o `ler` que leva a consultas_do_aluno no depois; o GET do REST no antes)
    — a casca já carregada (o perfil fica de fora da barreira) → a seção mostra o erro dela (só o texto muda)."""
    padrao = re.compile(rf"https://api-principal\.physiqcalc\.com\.br/(functions/v1/nutricao|rest/v1/{SECAO_DO_ERRO})")

    def barrar(route, req) -> None:
        corpo = B.B17.corpo_do_pedido(req) or ""
        eh_ler = req.method == "POST" and "/functions/v1/nutricao" in req.url and B.B17.corpo_de_leitura("nutricao", corpo) \
            and "consultas_do_aluno" in B.consultas_do_corpo(corpo)
        eh_rest = req.method == "GET" and f"/rest/v1/{SECAO_DO_ERRO}" in req.url
        if eh_ler or eh_rest:
            route.abort()
            return
        route.fallback()

    B.navegar(t, rota_do_aluno(pac, ""))
    B.esperar_pronto(t, pend, marca="[data-resumo-aluno]")
    t.ctx.route(padrao, barrar)
    try:
        B.navegar(t, rota_do_aluno(pac, f"/prontuario?secao={SECAO_DO_ERRO}"))
        alerta = '[data-secao-consultas] [role="alert"], [data-secao-consultas] [data-estado="erro"]'
        ok = t.esperar(lambda: t.n(alerta) > 0, 40)
        o.ok(ok, f"[{base}] b_prontuario_erro: a seção Consultas com a leitura barrada → o erro dela (\"{t.texto(alerta)[:70]}\")")
        pr("b_prontuario_erro")
    finally:
        t.ctx.unroute(padrao, barrar)


def rodar_telas(o, base: str, canal: str | None, casos: list[str], prefixo: str | None) -> None:
    from playwright.sync_api import sync_playwright  # noqa: PLC0415

    if base == "prod":
        raise SystemExit("telas.py é local e staging (a produção é o F7 da sessão principal, só leitura)")
    s = B.usar_base(base)
    L = B.Sessoes(f"telas20 painel-aluno {base}")
    commit = B.commit_medido(base)
    fase = fase_do_painel(base, commit)
    estado = None
    try:
        B.exigir_saude(o, "o telas.py da hml-20 (painel-aluno)")
        pac = B.B17.matricula_da_aluna()
        anexo = None
        if "prints" in casos:
            pendente = B.Estado.ler()
            if not pendente.vazio():
                o.ok(False, f"há uma rodada que caiu no meio (área {pendente.d.get('area')}): rode o --limpar antes", parar=True)
            rodada = B.nova_rodada()
            estado = B.Estado({"rodada": rodada, "schema": s, "area": P.AREA_ESTADO, "linhas": [], "storage": [], "n8": None})
            estado.salvar()
            anexo = P.criar_anexo(o, estado, L.token(P.NUTRI), pac, rodada, L.uid(P.NUTRI))
        rodadas = ABERTURAS if "tempo" in casos else 1
        with sync_playwright() as pw:
            o.linha(f"[{base}] {commit}: o {fase} · {rodadas} rodada(s)")
            for conta in (P.NUTRI, P.PERSONAL):
                quem = "nutri" if conta == P.NUTRI else "personal"
                medidas: dict[str, dict[str, list]] = {}
                for n in range(rodadas):
                    nav, t = _abrir_conta(pw, canal, base, conta)
                    pend = B.Pendentes(t.pg)
                    fim = FimDoPrincipal(t.pg)
                    pr = lambda caso, t=t: B.print_reduzido(t.pg, prefixo or base, caso, o, pasta=PRINTS)  # noqa: E731

                    def ao_abrir(tela, _sufixo, marca, _teto, pronta, t_principal, n=n, t=t, pr=pr):
                        medidas.setdefault(tela, {"total": [], "principal": []})
                        medidas[tela]["total"].append(pronta["t_pronto_s"])
                        medidas[tela]["principal"].append(t_principal)
                        if n == 0 and "prints" in casos:
                            sem_erro = t.n(marca) > 0 and not t.n('[data-estado="erro"]')
                            caso = f"b_{tela}_{quem}" if tela in ("resumo", "avaliacao") else f"b_{tela}"
                            o.ok(sem_erro, f"[{base}] {caso}: a tela com o dado, sem erro (pronta em {pronta['t_pronto_s']} s)")
                            pr(caso)

                    try:
                        percorrer(o, t, pend, fim, L, base, conta, pac, ao_abrir)
                        if n == 0 and "prints" in casos and conta == P.NUTRI:
                            if anexo:
                                caso_anexo_ver(o, t, pend, base, pr, pac, anexo)
                            caso_erro(o, t, pend, base, pr, pac)
                    finally:
                        _fechar_conta(o, base, conta, L, nav, t)
                if "tempo" in casos:
                    conferir_tempo(o, base, commit, fase, conta, medidas)
    finally:
        if estado is not None:
            P.limpar_massa(o, estado, L, s)
        L.fechar(o)
