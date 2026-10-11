"""Physiq hml-19d (H-41 · jeito 2, 11/10/2026) — a REDE de cada ação típica do Financeiro (Painel › Financeiro e o Financeiro do aluno), no
navegador (Edge), antes × depois (o rede.py chama: --area financeiro).

Com a personal de TESTE (w5p-personal, dona da conta da w5p-aluna) no Painel › Financeiro e no Financeiro da aluna, cada caso faz a ação de
verdade na tela e a guarda que CONTA (_base.classificar) separa os pedidos da ação: rest de gravação nas 4 tabelas do Financeiro
(rest_financeiro), o PATCH das tags (rest_pacientes), RPC que grava, cada ação da função financeiro — e o tempo da ação (do clique até a
tela mostrar o resultado).
  semente         a conta de teste SEM categoria nem modelo vivo (a 1ª de w5p-nutri · w13-dono · w5p-personal; nenhuma vazia → o caso é
                  pulado: o api.py prova a semente com a volta exata) abre Financeiro › Categorias → as 6 aparecem (o print d_semente)
  movimentacao    Nova movimentação (entrada, a marca na descrição, a aluna no seletor) → Salvar → a linha na lista (o print d_lancamentos)
  recibo          "Emitir recibo" da movimentação → Salvar → a linha mostra RECIBO; Recibos › Ver: o número e o texto (o print d_recibo)
  tags            o Financeiro da aluna: + a tag da rodada → o chip marcado (o print d_aluno: o lançamento, o recibo e a tag de teste)
  excluir_recibo  Recibos › Excluir o recibo de teste → Confirmar → a linha some
  categoria       Categorias › + a categoria da rodada → aparece na lista (o print d_categorias)
  erro            Nova movimentação com a gravação BARRADA no navegador (o depois: a financeiro; o antes: o POST em transacoes) → 1 aviso
                  com a frase fixa, sem toast em laço, 1 tentativa só (o print d_erro)
Depois (o código da hml-19d): 0 rest de gravação nas 4 tabelas e no pacientes, 0 RPC que grava e só a chamada esperada da financeiro (padroes_
garantir · transacao_criar · recibo_emitir · tags_salvar · recibo_excluir · categoria_criar). Antes (o staging com o código antigo do
Financeiro — decisão F): a gravação ia direto (rest ≥ 1) — a linha de base na mesma planilha (medicao/rede_hml19d.tsv). Antes ou depois
vem do CÓDIGO medido: depois = o commit medido tem o src/financeiro/gravar.ts (o local sempre).
Massa: "hml19 e2e <rodada> rede …" na descrição da movimentação (e do recibo, que a herda), no nome da categoria e na tag da aluna; a
semente da conta de teste vazia; só no staging e só das contas de TESTE; sai no fim (as linhas por SQL só das contas de teste; a semente
pelas linhas daquela conta criadas na rodada; as tags voltam) e a conferência é por SQL só leitura (só contagem). O estado da rodada
(agente/rede_financeiro_estado.json) guarda o que o --limpar precisa se a rodada cair.
Produção: este E2E NÃO roda (não há conta de TESTE com o Financeiro de um aluno de teste lá — a prova viva é dele).
Prints: ~/projetos/physiqcalc-scratch/prints/hml19/d/<prefixo>_d_<caso>.png (+ a cópia de 900 px para conferir).
"""
from __future__ import annotations

import re
import subprocess
import time

import _base as B
import api_financeiro as AF
import rede as R

C = B.C
CASOS = ("semente", "movimentacao", "recibo", "tags", "excluir_recibo", "categoria", "erro")
PLANILHA = B.MEDICAO / "rede_hml19d.tsv"
ESTADO_REDE = B.SCRATCH / "agente" / "rede_financeiro_estado.json"
ESPERADO_DEPOIS = {
    "semente": {"fn:financeiro(padroes_garantir)": 1},
    "movimentacao": {"fn:financeiro(transacao_criar)": 1},
    "recibo": {"fn:financeiro(recibo_emitir)": 1},
    "tags": {"fn:financeiro(tags_salvar)": 1},
    "excluir_recibo": {"fn:financeiro(recibo_excluir)": 1},
    "categoria": {"fn:financeiro(categoria_criar)": 1},
    "erro": {},
}
PRINT_DO_CASO = {"semente": "d_semente", "movimentacao": "d_lancamentos", "recibo": "d_recibo", "tags": "d_aluno", "categoria": "d_categorias", "erro": "d_erro"}
TEXTO_ERRO = "Não foi possível falar com o servidor agora. Tente de novo."  # a frase fixa do código "rede" (src/financeiro/gravar.ts)
# os seletores que este E2E usa (o --seco confere que cada um existe no código das telas)
SELETORES = {
    "src/painel/paginas/Financeiro.tsx": ["data-pagina-financeiro-painel", "data-aba-financeiro", "data-nova-movimentacao"],
    "src/painel/financeiro/Lancamentos.tsx": ["data-transacao", "data-transacao-descricao", "data-btn-emitir-recibo", "data-badge-recibo",
                                              "data-aba-financeiro-conteudo"],
    "src/painel/financeiro/MovimentacaoDialog.tsx": ["data-modal-movimentacao", "data-tipo-btn", "data-campo-descricao", "data-campo-valor", "data-campo-metodo",
                                                     "data-btn-salvar-movimentacao", "data-erro-movimentacao"],
    "src/painel/alunos/SeletorDeAluno.tsx": ["data-seletor-aluno", "data-seletor-aluno-busca", "data-opcao-aluno"],
    "src/painel/financeiro/ReciboDialog.tsx": ["data-modal-recibo", "data-campo-modelo-recibo", "data-btn-salvar-recibo"],
    "src/painel/financeiro/Recibos.tsx": ["data-recibo-id", "data-btn-excluir-recibo", "data-btn-confirmar-excluir-recibo", "data-btn-ver-recibo", "data-texto-recibo",
                                          "data-modal-ver-recibo"],
    "src/painel/financeiro/Categorias.tsx": ["data-campo-nova-categoria", "data-btn-add-categoria", "data-categoria-nome", "data-categorias-total"],
    "src/financeiro/ui/TagsDoAluno.tsx": ["data-tags-aluno", "data-tag", "data-tag-ativa", "data-tag-nova"],
    "src/financeiro/ui/FinanceiroDoAluno.tsx": ["data-financeiro-aluno", "data-cartao-lancamentos", "data-cartao-recibos", "data-lancamento", "data-recibo"],
}


def fase_do_codigo(base: str, commit: str) -> str:
    """antes = o código antigo do Financeiro (a gravação direta); depois = o jeito 2 (o commit medido tem o src/financeiro/gravar.ts).
    Commit desconhecido aqui → antes (as conferências do antes acusam se não for)."""
    if base == "local":
        return "depois"
    r = subprocess.run(["git", "-C", str(B.REPO), "cat-file", "-e", f"{commit}:src/financeiro/gravar.ts"], capture_output=True, timeout=10)
    return "depois" if r.returncode == 0 else "antes"


def so_gravacoes(cont) -> dict:
    """Do que a guarda contou, só o que GRAVA: rest (as 4 tabelas, as tags, as outras), RPC que grava, Storage e a financeiro (toda ação dela
    grava). As leituras (os GET, as RPCs de leitura, as outras funções de leitura) não entram."""
    return {k: v for k, v in cont.items() if k in R.GRAVACOES or k == "storage_link_assinado" or k.startswith("fn:financeiro")}


def rota_financeiro(aba: str) -> str:
    return f"/painel/financeiro?aba={aba}"


def rota_aluno(pac: str) -> str:
    return f"/painel/alunos/{pac}/financeiro"


def aba_pronta(t, aba: str) -> bool:
    return t.tem(f'[data-aba-financeiro-conteudo="{aba}"]') and t.n(f'[data-aba-financeiro-conteudo="{aba}"][data-atualizando="1"]') == 0


def abrir_aba(t, aba: str, timeout: float = 60) -> bool:
    t.ir(rota_financeiro(aba))
    return t.esperar(lambda: aba_pronta(t, aba), timeout)


def nome_da_aluna(s: str, pac: str) -> str:
    """O nome da aluna de TESTE (para a busca do seletor; nunca vai à saída)."""
    r = B.B17.ler(f"select nome from {s}.pacientes where id = {C.txt(C.uuid_ok(pac))}")
    return (r[0]["nome"] if r else "") or ""


# ───────────────────────── as ações (cada uma devolve ok e o ms até a tela mostrar o resultado) ─────────────────────────
def acao_movimentacao(t, marca: str, pac: str, nome_aluna: str) -> tuple[bool, int]:
    t.clicar("[data-nova-movimentacao]")
    if not t.esperar(lambda: t.tem('[data-modal-movimentacao="novo"]'), 15):
        return False, 0
    t.pg.locator('[data-tipo-btn="entrada"]').first.click()
    t.pg.fill("[data-campo-descricao]", marca)
    t.pg.fill("[data-campo-valor]", "123,45")
    t.pg.locator("[data-campo-metodo]").first.select_option("pix")
    t.pg.locator('[data-seletor-aluno="movimentacao"] [data-seletor-aluno-busca]').fill(nome_aluna[:6])
    if not t.esperar(lambda: t.tem(f'[data-seletor-aluno="movimentacao"] [data-opcao-aluno="{pac}"]'), 20):
        return False, 0
    t.pg.locator(f'[data-seletor-aluno="movimentacao"] [data-opcao-aluno="{pac}"]').first.click()
    linha = t.pg.locator("[data-transacao]", has_text=marca)
    t0 = time.time()
    t.clicar("[data-btn-salvar-movimentacao]")
    ok = t.esperar(lambda: t.n("[data-modal-movimentacao]") == 0 and linha.count() == 1, 40)
    return ok, round((time.time() - t0) * 1000)


def acao_recibo(t, marca: str) -> tuple[bool, int]:
    linha = t.pg.locator("[data-transacao]", has_text=marca)
    if not t.esperar(lambda: linha.count() == 1 and linha.first.locator("[data-btn-emitir-recibo]").count() == 1, 20):
        return False, 0
    linha.first.locator("[data-btn-emitir-recibo]").click()
    if not t.esperar(lambda: t.tem('[data-modal-recibo="movimentacao"]') and t.pg.locator("[data-campo-modelo-recibo] option").count() > 0, 30):
        return False, 0
    t0 = time.time()
    t.clicar("[data-btn-salvar-recibo]")
    ok = t.esperar(lambda: t.n("[data-modal-recibo]") == 0 and linha.first.locator("[data-badge-recibo]").count() == 1, 60)
    return ok, round((time.time() - t0) * 1000)


def acao_tags(t, tag: str) -> tuple[bool, int]:
    if not t.esperar(lambda: t.tem("[data-tags-aluno] [data-tag-nova]"), 60):
        return False, 0
    t.pg.fill("[data-tags-aluno] [data-tag-nova]", tag)
    t0 = time.time()
    t.pg.locator("[data-tags-aluno] [data-tag-nova]").press("Enter")
    ok = t.esperar(lambda: t.tem(f'[data-tags-aluno] [data-tag="{tag}"][data-tag-ativa]'), 30)
    return ok, round((time.time() - t0) * 1000)


def acao_excluir_recibo(t, recibo_id: str) -> tuple[bool, int]:
    sel = f'[data-recibo-id="{recibo_id}"]'
    if not t.esperar(lambda: t.tem(sel), 30):
        return False, 0
    t.pg.locator(f"{sel} [data-btn-excluir-recibo]").first.click()
    if not t.esperar(lambda: t.tem("[data-btn-confirmar-excluir-recibo]"), 10):
        return False, 0
    t0 = time.time()
    t.clicar("[data-btn-confirmar-excluir-recibo]")
    ok = t.esperar(lambda: not t.tem(sel), 40)
    return ok, round((time.time() - t0) * 1000)


def acao_categoria(t, nome: str) -> tuple[bool, int]:
    if not t.esperar(lambda: t.tem("[data-campo-nova-categoria]"), 30):
        return False, 0
    t.pg.fill("[data-campo-nova-categoria]", nome)
    t0 = time.time()
    t.clicar("[data-btn-add-categoria]")
    ok = t.esperar(lambda: t.tem(f'[data-categoria-nome="{nome}"]'), 30)
    return ok, round((time.time() - t0) * 1000)


class BarrarGravacaoFinanceiro:
    """A rota que BARRA a gravação no navegador (o caso erro): o POST na financeiro (o depois) e o POST em transacoes (o antes) —
    route.abort; o resto passa. Conta o que barrou."""

    def __init__(self) -> None:
        self.barradas: list[str] = []

    def instalar(self, ctx) -> None:
        def rota(route, req) -> None:
            u = req.url
            fn = "/functions/v1/financeiro" in u and req.method == "POST"
            tab = "/rest/v1/transacoes" in u and req.method in ("POST", "PATCH")
            if fn or tab:
                self.barradas.append("fn" if fn else "rest")
                route.abort()
                return
            route.fallback()
        ctx.route(re.compile(r"https://api-principal\.physiqcalc\.com\.br/(functions/v1/financeiro|rest/v1/transacoes)"), rota)


def acao_erro(t, marca: str, fase: str, fotografar=None) -> tuple[bool, int, int]:
    """Salva uma movimentação com a gravação barrada: 1 aviso (toast) com a frase fixa (o depois) e nenhum toast em laço — o MAIOR número de
    toasts iguais ao mesmo tempo, olhado a cada 200 ms por 5 s depois do 1º, tem de ser 1. Devolve (ok, ms até o aviso, o maior nº)."""
    t.clicar("[data-nova-movimentacao]")
    if not t.esperar(lambda: t.tem('[data-modal-movimentacao="novo"]'), 15):
        return False, 0, 0
    t.pg.fill("[data-campo-descricao]", marca)
    t.pg.fill("[data-campo-valor]", "9,99")
    toasts = t.pg.locator("[data-sonner-toast]").filter(has_text=TEXTO_ERRO) if fase == "depois" else t.pg.locator("[data-sonner-toast]")
    t0 = time.time()
    t.clicar("[data-btn-salvar-movimentacao]")
    viu = t.esperar(lambda: toasts.count() >= 1, 40)
    ms = round((time.time() - t0) * 1000)
    if viu and fotografar:
        fotografar()
    maximo, fim = toasts.count(), time.time() + 5
    while time.time() < fim:
        maximo = max(maximo, toasts.count())
        t.pg.wait_for_timeout(200)
    erro_no_dialogo = TEXTO_ERRO in t.texto("[data-erro-movimentacao]") if fase == "depois" and t.tem("[data-erro-movimentacao]") else fase == "antes"
    return viu and maximo == 1 and erro_no_dialogo, ms, maximo


# ───────────────────────── a conferência, a planilha, os prints ─────────────────────────
def conferir(o, base: str, caso: str, cont, ok_tela: bool, ms: int, fase: str) -> None:
    o.ok(ok_tela, f"[{base}] {caso}: a ação terminou na tela ({ms} ms)")
    gravacoes = so_gravacoes(cont)
    if fase == "antes":
        if caso != "erro":
            o.ok(cont.get("rest_financeiro", 0) + cont.get("rest_pacientes", 0) >= 1, f"[antes] {caso}: a gravação ia direto do navegador ({gravacoes})")
        return
    fn = {k: v for k, v in gravacoes.items() if k.startswith("fn:")}
    o.ok(cont.get("rest_financeiro", 0) == 0 and cont.get("rest_pacientes", 0) == 0 and cont.get("rpc_grava", 0) == 0,
         f"[depois] {caso}: 0 rest de gravação nas 4 tabelas e no pacientes, 0 RPC que grava ({gravacoes})")
    if caso != "erro":  # no erro, a chamada barrada não chega a ser anotada como feita
        o.ok(fn == ESPERADO_DEPOIS[caso], f"[depois] {caso}: só a chamada esperada da financeiro ({fn} × {ESPERADO_DEPOIS[caso]})")


def linha_planilha(base: str, caso: str, cont, ms: int, commit: str) -> None:
    B.MEDICAO.mkdir(parents=True, exist_ok=True)
    novo = not PLANILHA.exists()
    with PLANILHA.open("a", encoding="utf-8") as f:
        if novo:
            f.write("quando\tbase\tcommit\tcaso\trest_financeiro\trest_pacientes\trest_outras\trpc_grava\tfuncoes\tms\n")
        funcoes = ",".join(f"{k}×{v}" for k, v in sorted(cont.items()) if k.startswith("fn:financeiro"))
        f.write("\t".join(str(x) for x in (time.strftime("%Y-%m-%d %H:%M"), base, commit, caso, cont.get("rest_financeiro", 0), cont.get("rest_pacientes", 0),
                                          cont.get("rest_outras", 0), cont.get("rpc_grava", 0), funcoes, ms)) + "\n")


def print_d(t, prefixo: str, nome: str, o) -> None:
    """O print <prefixo>_<nome>.png em prints/hml19/d (+ a cópia de 900 px para conferir)."""
    B.PRINTS_D.mkdir(parents=True, exist_ok=True)
    caminho = B.PRINTS_D / f"{prefixo}_{nome}.png"
    t.pg.wait_for_timeout(700)
    t.pg.screenshot(path=str(caminho))
    try:
        from PIL import Image  # noqa: PLC0415
        im = Image.open(caminho)
        im.thumbnail((900, 900))
        im.save(caminho.with_name(f"{caminho.stem}_900.png"))
    except Exception as e:  # noqa: BLE001
        o.linha(f"   (cópia de 900 px não saiu: {type(e).__name__})")
    o.linha(f"   print: {caminho}")


# ───────────────────────── o estado da rodada e a limpeza (staging, só contas de teste) ─────────────────────────
def ler_estado() -> dict:
    d = C.ler_json(ESTADO_REDE)
    return d if isinstance(d, dict) else {}


def salvar_estado(d: dict) -> None:
    C.json_arquivo(ESTADO_REDE, d)


def limpar_massa(o, s: str, L, rodada: str | None = None) -> None:
    """As tags da aluna voltam (as do estado), as linhas da marca da rodada da personal (o recibo antes da movimentação) e a semente da
    conta vazia (as linhas dela criadas desde o início da rodada); depois, a conferência (só contagem)."""
    if s != "staging":
        return
    est = ler_estado()
    rodada = rodada or est.get("rodada")
    pac = B.B17.matricula_da_aluna()
    if est.get("tags_originais") is not None:
        originais = list(est["tags_originais"])
        st, _r, _h, _ms = B.funcao_fin(L.token(AF.T_CONTA), "tags_salvar", {"paciente_id": pac, "tags": originais})
        if st != 200:
            lista = ", ".join(C.txt(x) for x in originais)
            C.C2.sql_principal(f"update {s}.pacientes set tags = " + (f"array[{lista}]::text[]" if originais else "'{}'::text[]") + f" where id = {C.txt(pac)}")
        o.ok(AF.lista_pg(B.B17.ler(B.sql_foto_cobranca(s, pac))[0]["tags"]) == originais, f"limpeza: as tags da aluna voltaram às de antes ({st})")
    dono = L.uid(AF.T_CONTA)
    marca = f"%{B.MARCA}%{rodada}%rede%" if rodada else f"%{B.MARCA}%rede%"
    for tabela, col in (("recibos", "descricao"), ("transacoes", "descricao"), ("categorias_financeiras", "nome")):
        C.C2.sql_principal(f"delete from {s}.{tabela} where nutricionista_id = {C.txt(C.uuid_ok(dono))} and {col} like {C.txt(marca)}")
    sem = est.get("semente") or {}
    if C.eh_uuid(sem.get("uid")) and est.get("desde"):
        u, desde = C.txt(C.uuid_ok(sem["uid"])), C.txt(est["desde"])
        for tabela in ("categorias_financeiras", "modelos_recibo"):
            C.C2.sql_principal(f"delete from {s}.{tabela} where nutricionista_id = {u} and created_at >= {desde}::timestamptz")
        vivos = B.B17.ler(B.sql_vivos_fin(s, sem["uid"]))[0]
        o.ok(vivos == {"categorias": 0, "modelos": 0}, f"limpeza conferida: a conta da semente vazia de novo ({vivos})")
    sobra = B.B17.ler(f"select (select count(*) from {s}.recibos where descricao like {C.txt(marca)})::int + "
                      f"(select count(*) from {s}.transacoes where descricao like {C.txt(marca)})::int + "
                      f"(select count(*) from {s}.categorias_financeiras where nome like {C.txt(marca)})::int as n")[0]["n"]
    o.ok(sobra == 0, f"limpeza conferida (SQL só leitura): 0 linha da marca da rodada nas tabelas do Financeiro ({sobra})")
    if ESTADO_REDE.exists():
        ESTADO_REDE.unlink()


# ───────────────────────── o --seco ─────────────────────────
def seco(o) -> None:
    faltam = [f"{arq}: {sel}" for arq, sels in SELETORES.items() for sel in sels if sel not in (B.REPO / arq).read_text(encoding="utf-8")]
    o.ok(not faltam, f"os {sum(len(v) for v in SELETORES.values())} seletores do Financeiro existem no código das telas" + (f" — faltam: {faltam}" if faltam else ""))
    P = B.API_P
    antes = [
        {"metodo": "POST", "tipo": "tab", "nome": "transacoes", "url": f"{P}/rest/v1/transacoes?select=id"},
        {"metodo": "POST", "tipo": "tab", "nome": "recibos", "url": f"{P}/rest/v1/recibos?select=id"},
        {"metodo": "PATCH", "tipo": "tab", "nome": "transacoes", "url": f"{P}/rest/v1/transacoes?id=eq.x"},
        {"metodo": "POST", "tipo": "tab", "nome": "categorias_financeiras", "url": f"{P}/rest/v1/categorias_financeiras"},
        {"metodo": "PATCH", "tipo": "tab", "nome": "pacientes", "url": f"{P}/rest/v1/pacientes?id=eq.x"},
        {"metodo": "POST", "tipo": "rpc", "nome": "financeiro_lancamentos", "url": f"{P}/rest/v1/rpc/financeiro_lancamentos"},
        {"metodo": "GET", "tipo": "tab", "nome": "categorias_financeiras", "url": f"{P}/rest/v1/categorias_financeiras?select=id"},
    ]
    c = B.contar(antes)
    o.ok(c == {"rest_financeiro": 4, "rest_pacientes": 1}, f"a classificação do ANTES (a gravação direto nas 4 tabelas e o PATCH das tags; as leituras fora): {dict(c)}")
    depois = [{"metodo": "POST", "tipo": "fn", "nome": "financeiro", "acao": a, "url": f"{P}/functions/v1/financeiro"} for a in ("transacao_criar", "recibo_emitir")]
    depois += [{"metodo": "OPTIONS", "tipo": "fn", "nome": "financeiro", "acao": None, "url": f"{P}/functions/v1/financeiro"},
               {"metodo": "POST", "tipo": "fn", "nome": "pagamentos-aluno", "acao": "prof_resumo", "url": f"{P}/functions/v1/pagamentos-aluno"}]
    c = B.contar(depois)
    o.ok(so_gravacoes(c) == {"fn:financeiro(transacao_criar)": 1, "fn:financeiro(recibo_emitir)": 1},
         f"a classificação do DEPOIS (as ações da financeiro; o OPTIONS e a leitura da pagamentos-aluno fora): {so_gravacoes(c)}")
    o.ok(set(ESPERADO_DEPOIS) == set(CASOS) and set(PRINT_DO_CASO) <= set(CASOS), "cada caso tem o esperado do depois; os prints d_* são de casos da lista")
    o.ok({"rest_financeiro", "rest_pacientes"} <= set(R.GRAVACOES), "o rede.py conta o rest_financeiro e o rest_pacientes entre as gravações")
    o.ok(fase_do_codigo("staging", "87205e1") == "antes" and fase_do_codigo("local", "x") == "depois",
         "antes × depois pelo código medido: o 87205e1 (a main de antes) é o antes; o local é o depois")
    texto_tela = (B.REPO / "src" / "financeiro" / "gravar.ts").read_text(encoding="utf-8")
    o.ok(f'rede: "{TEXTO_ERRO}"' in texto_tela, "a frase que o caso erro espera é a da tela (o código rede do gravar.ts)")
    o.ok(len(f"{B.MARCA} 10111234-abcd rede") <= 40, "a tag da rodada cabe no limite da tela (40)")


# ───────────────────────── a rodada ─────────────────────────
def rodar(o, base: str, casos: list[str], canal: str | None, prefixo: str | None = None) -> None:
    from playwright.sync_api import sync_playwright  # noqa: PLC0415

    if base == "prod":
        o.ok(False, "rede --area financeiro NÃO roda na produção (não há conta de TESTE com o Financeiro de um aluno de teste lá — a prova viva é dele)")
        return
    s = B.usar_base(base)
    L = B.Sessoes(f"rede financeiro {base}")
    rodada = B.nova_rodada()
    commit = R.commit_medido(base)
    fase = fase_do_codigo(base, commit)
    rotulo = prefixo or base
    try:
        B.exigir_saude(o, "o rede.py --area financeiro")
        pendente = ler_estado()
        if pendente:
            o.ok(False, "há uma rodada do rede --area financeiro que caiu no meio: rode --limpar antes", parar=True)
        pac = B.B17.matricula_da_aluna()
        mat = B.B17.ler(f"select conta_id::text as c from {s}.pacientes where id = {C.txt(pac)}")
        conta = (mat[0]["c"] if mat else "") or ""
        desde = B.B17.ler("select now()::text as t")[0]["t"]
        foto = B.B17.ler(B.sql_foto_cobranca(s, pac))[0]
        est = {"rodada": rodada, "desde": desde, "semente": None, "tags_originais": AF.lista_pg(foto["tags"]) if "tags" in casos else None}
        salvar_estado(est)
        nome_aluna = nome_da_aluna(s, pac)
        marca = f"{B.MARCA} {rodada} rede"
        with sync_playwright() as pw:
            nav = pw.chromium.launch(channel=canal, args=["--no-sandbox"]) if canal else pw.chromium.launch(args=["--no-sandbox"])
            try:
                # a semente: a conta de teste SEM categoria nem modelo vivo (sem marcar nada como excluído aqui: o api.py prova a volta)
                if "semente" in casos:
                    vazia = None
                    for nome in AF.CANDIDATAS_SEMENTE:
                        uid = AF.uid_da_conta_de_teste(s, nome)
                        if not C.eh_uuid(uid):
                            continue
                        membro = B.B17.ler(f"select conta_id::text as c from {s}.conta_membros where user_id = {C.txt(uid)} and status = 'ativo' order by criado_em limit 1")
                        if membro and B.B17.ler(B.sql_vivos_fin(s, uid))[0] == {"categorias": 0, "modelos": 0}:
                            vazia = {"nome": nome, "uid": uid, "conta": membro[0]["c"]}
                            break
                    if not vazia:
                        o.linha("   semente: nenhuma conta de teste vazia (com conta) — o caso fica de fora aqui; o api.py --area financeiro prova a semente")
                    else:
                        est["semente"] = {"nome": vazia["nome"], "uid": vazia["uid"]}
                        salvar_estado(est)
                        t = B.B17.Tela(nav, B.BASES[base], f"hml19d_{base}", "rede_financeiro_semente")
                        B.LegalDesligado().instalar(t.ctx)
                        try:
                            t0 = time.time()
                            t.entrar(L, vazia["nome"], rota_financeiro("categorias"), conta_ativa=vazia["conta"])
                            ok = t.esperar(lambda: aba_pronta(t, "categorias") and (t.attr("[data-categorias-total]", "data-categorias-total") or ["0"])[0] == "6", 90)
                            ms = round((time.time() - t0) * 1000)
                            R.esperar_quieto(t, teto=15)
                            cont = B.contar(t.pedidos)
                            conferir(o, base, "semente", cont, ok, ms, fase)
                            linha_planilha(base, "semente", cont, ms, commit)
                            print_d(t, rotulo, PRINT_DO_CASO["semente"], o)
                        finally:
                            L.do_navegador(vazia["nome"], t.pg)
                            t.fim()
                # a personal: o Painel › Financeiro e o Financeiro da aluna
                pessoais = [c for c in CASOS if c != "semente" and c in casos]
                if pessoais:
                    t = B.B17.Tela(nav, B.BASES[base], f"hml19d_{base}", "rede_financeiro_personal")
                    B.LegalDesligado().instalar(t.ctx)
                    barrar = BarrarGravacaoFinanceiro() if "erro" in casos else None
                    try:
                        t.entrar(L, AF.T_CONTA, rota_financeiro("lancamentos"), conta_ativa=conta)
                        ok = t.esperar(lambda: aba_pronta(t, "lancamentos"), 90)
                        abrir = {k: v for k, v in so_gravacoes(B.contar(t.pedidos)).items()}
                        o.ok(ok and not abrir, f"[{base}] o Financeiro abre para a personal de teste sem gravar nada ({commit}: o {fase}; {abrir})", parar=True)
                        recibo_id = ""
                        for caso in pessoais:
                            if caso == "erro":
                                continue
                            if caso in ("movimentacao", "recibo") and not aba_pronta(t, "lancamentos"):
                                abrir_aba(t, "lancamentos")
                            elif caso == "excluir_recibo" or (caso == "categoria"):
                                abrir_aba(t, "recibos" if caso == "excluir_recibo" else "categorias")
                            elif caso == "tags":
                                t.ir(rota_aluno(pac))
                                t.esperar(lambda: t.tem(f'[data-financeiro-aluno="{pac}"]'), 90)
                                R.esperar_quieto(t, teto=10)
                            t.zerar_pedidos()
                            if caso == "movimentacao":
                                ok_tela, ms = acao_movimentacao(t, f"{marca} movimentação", pac, nome_aluna)
                            elif caso == "recibo":
                                ok_tela, ms = acao_recibo(t, f"{marca} movimentação")
                            elif caso == "tags":
                                ok_tela, ms = acao_tags(t, marca)
                            elif caso == "excluir_recibo":
                                r = B.B17.ler(f"select id::text as id from {s}.recibos where nutricionista_id = {C.txt(L.uid(AF.T_CONTA))} "
                                              f"and descricao like {C.txt('%' + marca + '%')} and deleted_at is null limit 1")
                                recibo_id = r[0]["id"] if r else ""
                                ok_tela, ms = acao_excluir_recibo(t, recibo_id) if recibo_id else (False, 0)
                            else:
                                ok_tela, ms = acao_categoria(t, f"{marca} cat")
                            R.esperar_quieto(t, teto=15)
                            cont = B.contar(t.pedidos)
                            conferir(o, base, caso, cont, ok_tela, ms, fase)
                            linha_planilha(base, caso, cont, ms, commit)
                            if caso == "recibo":
                                # o print do recibo: Recibos › Ver o de teste (o número e o texto)
                                abrir_aba(t, "recibos")
                                ver = t.pg.locator("[data-recibo-id]", has_text=marca)
                                if t.esperar(lambda: ver.count() >= 1, 30):
                                    ver.first.locator("[data-btn-ver-recibo]").click()
                                    t.esperar(lambda: t.tem("[data-texto-recibo]"), 15)
                                print_d(t, rotulo, PRINT_DO_CASO["recibo"], o)
                                t.pg.keyboard.press("Escape")
                            elif caso in PRINT_DO_CASO:
                                print_d(t, rotulo, PRINT_DO_CASO[caso], o)
                        if barrar:
                            abrir_aba(t, "lancamentos")
                            barrar.instalar(t.ctx)
                            t.zerar_pedidos()
                            ok_tela, ms, n = acao_erro(t, f"{marca} erro", fase, lambda: print_d(t, rotulo, PRINT_DO_CASO["erro"], o))
                            cont = B.contar(t.pedidos)
                            o.ok(ok_tela and len(barrar.barradas) == 1,
                                 f"[{base}] erro: 1 aviso{' com a frase fixa' if fase == 'depois' else ''}, sem toast em laço e 1 tentativa só (no máx. {n} toast; barrou {barrar.barradas})")
                            conferir(o, base, "erro", cont, ok_tela, ms, fase)
                    finally:
                        L.do_navegador(AF.T_CONTA, t.pg)
                        t.fim()
            finally:
                nav.close()
    finally:
        if s == "staging":
            limpar_massa(o, s, L, rodada)
        L.fechar(o)
