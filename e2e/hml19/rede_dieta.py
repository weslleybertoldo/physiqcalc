"""Physiq hml-19b (H-41 · jeito 2, 11/10/2026) — a REDE de cada ação típica da Dieta, das Dietas e do app do aluno, no navegador (Edge),
antes × depois (o rede.py chama: --area dieta).

Com a nutri de TESTE (w5p-nutri) na Dieta da w5p-aluna e nas Dietas, e com a aluna (w5p-aluna) no app, cada caso faz a ação de verdade
na tela e a guarda que CONTA (_base.classificar) separa os pedidos da ação: rest de gravação nas 19 tabelas da Dieta (rest_dieta), rest
no Prontuário e nas outras, RPC que grava (as 3 que o app chamava direto contam), cada ação da função nutricao, Storage — e o tempo da
ação (do clique de salvar até a tela mostrar o resultado).
  prescricao  Plano › Nova prescrição (o título com a marca) → Salvar (o plano abre no editor com as 6 refeições)
  item        no plano novo: Café da manhã › busca da TACO → "Arroz, integral, cozido" → 100 g → Salvar (o item aparece)
  duplicar    a lista de planos › Duplicar o plano novo (a cópia abre no editor) — o print b_editor
  receita     Dietas › Receitas › Nova receita (1 ingrediente da TACO) → Salvar (a receita aparece) — o print b_receita
  alimento    Dietas › Alimentos › Novo alimento → Salvar (aparece em "Meus alimentos") — o print b_alimento
  app_marcar  a aluna no app › Dieta: "Feito" na refeição da vez (a cópia de teste vira o plano ★ do app antes) → ✓ — o print
              b_app_marcar; depois desmarca (fora da medida)
Depois (o código da hml-19b): 0 rest de gravação nas tabelas da Dieta, 0 RPC que grava, 0 Storage fora do link assinado e só a ação
esperada da nutricao (plano_criar · item_criar · plano_duplicar · receita_salvar · alimento_salvar · aluno_marcar_refeicao). Antes (o
staging com o código antigo da Dieta, 5aaafc3 ≡ main): a gravação ia direto (rest_dieta ou rpc_grava ≥ 1) — a linha de base na mesma
planilha (medicao/rede_hml19b.tsv). Antes ou depois vem do CÓDIGO medido: depois = o planos.ts do commit medido chama o plano_criar
da nutricao (o local sempre).
Guarda do laço (H-90, contrato F): ao abrir cada tela, > 2 GET profiles ou > 1 semente (POST em modelos_*) → o navegador fecha NA HORA
e o caso para (anotar no progresso).
Massa: "hml19 e2e <rodada> rede …" (o título do plano e da cópia, o nome da receita e do alimento) só no staging e só da nutri de
TESTE; sai no fim por SQL (o plano leva refeições, itens e as marcações do app em cascata; a receita, os ingredientes; o alimento,
as medidas) e a conferência é por SQL só leitura (só contagem). O --limpar tira o que uma rodada que caiu deixou (pela marca).
Prints: ~/projetos/physiqcalc-scratch/prints/hml19/b/<prefixo>_b_<caso>.png (+ a cópia de 900 px para conferir).
"""
from __future__ import annotations

import subprocess
import time
from collections import Counter

import _base as B
import rede as R

C = B.C
CASOS = ("prescricao", "item", "duplicar", "receita", "alimento", "app_marcar")
PLANILHA = B.MEDICAO / "rede_hml19b.tsv"
TACO_BUSCA, TACO_NOME = "arroz, integral", "Arroz, integral, cozido"
ESPERADO_DEPOIS = {
    "prescricao": {"fn:nutricao(plano_criar)": 1},
    "item": {"fn:nutricao(item_criar)": 1},
    "duplicar": {"fn:nutricao(plano_duplicar)": 1},
    "receita": {"fn:nutricao(receita_salvar)": 1},
    "alimento": {"fn:nutricao(alimento_salvar)": 1},
    "app_marcar": {"fn:nutricao(aluno_marcar_refeicao)": 1},
}
PRINT_DO_CASO = {"duplicar": "b_editor", "receita": "b_receita", "alimento": "b_alimento", "app_marcar": "b_app_marcar"}
# os seletores que este E2E usa (o --seco confere que cada um existe no código das telas)
SELETORES = {
    "src/painel/aluno/abas/Dieta.tsx": ["data-aba-dieta-aluno", "data-secao-dieta-botao", "data-acesso-dieta"],
    "src/nutricao/editor/secoes/Planejamento.tsx": ["data-secao-planejamento", "data-btn-novo-plano", "data-btn-primeiro-plano", "data-lista-planos",
                                                    "data-plano=", "data-plano-titulo", "data-btn-duplicar-plano"],
    "src/nutricao/editor/ui/PlanoDialog.tsx": ["data-modal-plano", "data-campo-titulo-plano", "data-btn-salvar-plano"],
    "src/nutricao/editor/ui/EditorDieta.tsx": ["data-editor-dieta", "data-refeicao-nome", "data-refeicao-abrir", "data-aberta", "data-refeicao-busca",
                                               "data-item="],
    "src/nutricao/editor/ui/BuscaAlimento.tsx": ["data-busca-alimento", "data-resultado-alimento", "data-resultado-nome"],
    "src/nutricao/editor/ui/ItemDialog.tsx": ["data-modal-item", "data-campo-quantidade-g", "data-btn-salvar-item"],
    "src/painel/paginas/Dietas.tsx": ["data-pagina-dietas", "data-aba-dietas", "data-btn-novo-alimento", "data-btn-nova-receita"],
    "src/painel/dietas/Alimentos.tsx": ["data-pagina-alimentos", "data-filtro-fonte", "data-lista-alimentos"],
    "src/painel/dietas/AlimentoDialog.tsx": ["data-modal-alimento", "data-campo-nome-alimento", "data-campo-porcao", "data-campo-kcal", "data-campo-proteina",
                                             "data-campo-carboidrato", "data-campo-lipidio", "data-btn-salvar-alimento"],
    "src/painel/dietas/ReceitaDialog.tsx": ["data-modal-receita", "data-campo-nome-receita", "data-campo-porcoes", "data-btn-salvar-receita"],
    "src/painel/dietas/IngredientesEditor.tsx": ["data-ingrediente=", "data-campo-gramas-ingrediente"],
    "src/painel/dietas/Receitas.tsx": ["data-receita=", "data-receita-nome"],
    "src/app-aluno/abas/Dieta.tsx": ["data-aba-dieta=", "data-refeicoes"],
    "src/nutricao/app/ui/LinhaRefeicao.tsx": ["data-refeicao={id}", "data-refeicao-estado", 'data-refeicao-marcar="feito"', 'data-refeicao-marcar="desmarcar"'],
}
SEMENTES = {"modelos_formula", "modelos_meta", "modelos_orientacao", "modelos_anamnese", "modelos_documento", "exames_catalogo"}


class LacoNaTela(Exception):
    """A tela entrou em laço (H-90): o navegador fecha na hora e o caso para."""


class Cronometro:
    """A duração de cada pedido à API durante o caso (requestfinished: timing.responseEnd do Chromium), para separar o tempo da
    função do tempo da tela — o resumo vai à saída: a soma por alvo e os 4 mais lentos (início relativo ao zerar, em ms)."""

    def __init__(self, pg) -> None:
        self.t0 = time.time()
        self.itens: list[tuple[int, str, int]] = []
        pg.on("requestfinished", self._fim)

    def zerar(self) -> None:
        self.t0, self.itens = time.time(), []

    def _fim(self, req) -> None:
        try:
            if req.method == "OPTIONS" or "physiqcalc.com.br" not in req.url:
                return
            tipo, nome = B.B17.alvo(req.url)
            acao = B.B17.acao_do_corpo(req) if tipo == "fn" else None
            dur = round(float(req.timing.get("responseEnd") or 0))
            inicio = round((float(req.timing.get("startTime") or 0) / 1000 - self.t0) * 1000) if req.timing.get("startTime") else -1
            self.itens.append((inicio, f"{req.method} {tipo}:{nome}" + (f"({acao})" if acao else ""), dur))
        except Exception:  # noqa: BLE001 — a página fechou no meio
            pass

    def resumo(self) -> str:
        lentos = sorted(self.itens, key=lambda x: -x[2])[:4]
        return " · ".join(f"{alvo} {dur} ms (+{ini} ms)" for ini, alvo, dur in lentos)


def fase_do_codigo(base: str, commit: str) -> str:
    """antes = o código antigo da Dieta (a gravação direta); depois = o jeito 2 da Dieta (o planos.ts do commit medido chama o
    plano_criar da nutricao). Commit desconhecido aqui → antes (as conferências do antes acusam se não for)."""
    if base == "local":
        return "depois"
    r = subprocess.run(["git", "-C", str(B.REPO), "show", f"{commit}:src/nutricao/editor/lib/planos.ts"], capture_output=True, text=True, timeout=10)
    return "depois" if r.returncode == 0 and '"plano_criar"' in r.stdout else "antes"


def vigiar(t, o, rotulo: str) -> None:
    """A guarda do laço ao abrir uma tela (contrato F / H-90): > 2 GET profiles ou > 1 semente → LacoNaTela."""
    cont = B.contar(t.pedidos)
    sementes = sum(1 for p in t.pedidos if p.get("tipo") == "tab" and p.get("metodo") == "POST" and p.get("nome") in SEMENTES)
    if cont.get("get_profiles", 0) > 2 or sementes > 1:
        o.ok(False, f"{rotulo}: LAÇO ao abrir (GET profiles {cont.get('get_profiles', 0)}, sementes {sementes}) — o navegador fecha agora; anotar no progresso")
        raise LacoNaTela(rotulo)


def esperar_vigiando(t, o, rotulo: str, cond, timeout: float) -> bool:
    t0 = time.time()
    while time.time() - t0 < timeout:
        vigiar(t, o, rotulo)
        try:
            if cond():
                return True
        except Exception:  # noqa: BLE001 — a tela no meio da troca
            pass
        t.pg.wait_for_timeout(250)
    vigiar(t, o, rotulo)
    return False


def rota_dieta(pac: str) -> str:
    return f"/painel/alunos/{pac}/dieta"


def plano_da_lista(t, titulo: str) -> str | None:
    ids = t.pg.evaluate("""(t) => [...document.querySelectorAll('[data-lista-planos] [data-plano]')]
        .filter((li) => (li.querySelector('[data-plano-titulo]')?.textContent || '').trim() === t).map((li) => li.getAttribute('data-plano'))""", titulo)
    return ids[0] if ids else None


def editor_pronto(t, plano: str | None = None) -> bool:
    attr = t.attr("[data-editor-dieta]", "data-editor-dieta")
    return bool(attr) and attr[0] != "carregando" and (plano is None or attr[0] == plano) and t.n("[data-editor-dieta] [data-refeicao]") > 0


# ───────────────────────── as ações (cada uma devolve ok e o ms do salvar até a tela mostrar) ─────────────────────────
def acao_prescricao(t, titulo: str) -> tuple[bool, int, str | None]:
    t.clicar("[data-btn-novo-plano], [data-btn-primeiro-plano]")
    if not t.esperar(lambda: t.tem('[data-modal-plano="novo"]'), 15):
        return False, 0, None
    t.pg.locator("[data-campo-titulo-plano]").first.fill(titulo)
    t0 = time.time()
    t.clicar("[data-btn-salvar-plano]")
    ok = t.esperar(lambda: t.n("[data-modal-plano]") == 0 and plano_da_lista(t, titulo) is not None and editor_pronto(t, plano_da_lista(t, titulo)), 40)
    ms = round((time.time() - t0) * 1000)
    plano = plano_da_lista(t, titulo)
    return ok and t.n("[data-editor-dieta] [data-refeicao]") == 6, ms, plano


def acao_item(t, refeicao: str = "Café da manhã") -> tuple[bool, int]:
    alvo = t.pg.locator(f'[data-editor-dieta] [data-refeicao-nome="{refeicao}"]').first
    if alvo.get_attribute("data-aberta") is None:
        alvo.locator("[data-refeicao-abrir]").first.click()
    if not t.esperar(lambda: alvo.locator("[data-refeicao-busca] [data-busca-alimento]").count() > 0, 15):
        return False, 0
    caixa = alvo.locator("[data-refeicao-busca] [data-busca-alimento]").first
    caixa.click()
    caixa.fill(TACO_BUSCA)
    res = alvo.locator(f'[data-resultado-alimento]:has([data-resultado-nome]:text-is("{TACO_NOME}"))').first
    if not t.esperar(lambda: res.count() > 0 and res.is_visible(), 30):
        return False, 0
    res.click()
    if not t.esperar(lambda: t.tem('[data-modal-item="novo"]'), 15):
        return False, 0
    t.pg.locator("[data-campo-quantidade-g]").first.fill("100")
    antes = alvo.locator("[data-item]").count()
    t0 = time.time()
    t.clicar("[data-btn-salvar-item]")
    ok = t.esperar(lambda: t.n('[data-modal-item="novo"]') == 0 and alvo.locator("[data-item]").count() == antes + 1, 30)
    return ok, round((time.time() - t0) * 1000)


def acao_duplicar(t, plano: str, titulo: str) -> tuple[bool, int, str | None]:
    t0 = time.time()
    t.clicar(f'[data-lista-planos] [data-plano="{plano}"] [data-btn-duplicar-plano]')
    copia_titulo = f"{titulo} (cópia)"
    ok = t.esperar(lambda: plano_da_lista(t, copia_titulo) is not None and editor_pronto(t, plano_da_lista(t, copia_titulo)), 40)
    ms = round((time.time() - t0) * 1000)
    copia = plano_da_lista(t, copia_titulo)
    return ok and t.n("[data-editor-dieta] [data-refeicao]") == 6, ms, copia


def itens_no_editor(t) -> int:
    """Os itens do plano aberto no editor (a contagem de cada refeição, aberta ou não)."""
    return sum(int(x or 0) for x in t.attr("[data-editor-dieta] [data-refeicao]", "data-refeicao-itens"))


def acao_receita(t, nome: str) -> tuple[bool, int]:
    t.clicar("[data-btn-nova-receita]")
    if not t.esperar(lambda: t.tem('[data-modal-receita="nova"]'), 15):
        return False, 0
    t.pg.locator("[data-campo-nome-receita]").first.fill(nome)
    t.pg.locator("[data-campo-porcoes]").first.fill("2")
    li = t.pg.locator('[data-ingrediente="0"]').first
    caixa = li.locator("[data-busca-alimento]").first
    caixa.click()
    caixa.fill(TACO_BUSCA)
    res = li.locator(f'[data-resultado-alimento]:has([data-resultado-nome]:text-is("{TACO_NOME}"))').first
    if not t.esperar(lambda: res.count() > 0 and res.is_visible(), 30):
        return False, 0
    res.click()
    if not t.esperar(lambda: li.locator("[data-campo-gramas-ingrediente]").count() > 0, 10):
        return False, 0
    li.locator("[data-campo-gramas-ingrediente]").first.fill("150")
    t0 = time.time()
    t.clicar("[data-btn-salvar-receita]")
    sel = f'[data-receita]:has([data-receita-nome]:text-is("{nome}"))'
    ok = t.esperar(lambda: t.n("[data-modal-receita]") == 0 and t.n(sel) == 1, 30)
    return ok, round((time.time() - t0) * 1000)


def acao_alimento(t, nome: str) -> tuple[bool, int]:
    t.clicar("[data-btn-novo-alimento]")
    if not t.esperar(lambda: t.tem('[data-modal-alimento="novo"]'), 15):
        return False, 0
    t.pg.locator("[data-campo-nome-alimento]").first.fill(nome)
    t.pg.locator("[data-campo-porcao]").first.fill("100")
    for sel, v in (("kcal", "120"), ("proteina", "3"), ("carboidrato", "20"), ("lipidio", "2")):
        t.pg.locator(f"[data-campo-{sel}]").first.fill(v)
    t0 = time.time()
    t.clicar("[data-btn-salvar-alimento]")
    ok = t.esperar(lambda: t.n("[data-modal-alimento]") == 0, 30)
    ms = round((time.time() - t0) * 1000)
    # "Meus alimentos": o novo aparece na lista (fora da medida)
    t.pg.locator("[data-filtro-fonte]").first.select_option("proprio")
    ok = ok and t.esperar(lambda: nome in t.texto("[data-lista-alimentos]"), 30)
    return ok, ms


def refeicao_da_vez(t) -> str | None:
    ids = t.attr('[data-refeicoes] [data-refeicao][data-refeicao-estado="agora"]', "data-refeicao")
    return ids[0] if ids else None


def acao_app_marcar(t) -> tuple[bool, int, str | None]:
    rid = refeicao_da_vez(t)
    if not rid:
        return False, 0, None
    t0 = time.time()
    t.clicar(f'[data-refeicao="{rid}"] [data-refeicao-marcar="feito"]')
    ok = t.esperar(lambda: t.attr(f'[data-refeicao="{rid}"]', "data-refeicao-estado") == ["feita"], 20)
    return ok, round((time.time() - t0) * 1000), rid


# ───────────────────────── a conferência e a planilha ─────────────────────────
def conferir(o, base: str, caso: str, cont: Counter, ok_tela: bool, ms: int, fase: str) -> None:
    o.ok(ok_tela, f"[{base}] {caso}: a ação terminou na tela ({ms} ms)")
    gravacoes = R.so_gravacoes(cont)
    if fase == "antes":
        o.ok(cont.get("rest_dieta", 0) + cont.get("rpc_grava", 0) + cont.get("storage_grava", 0) >= 1,
             f"[antes] {caso}: a gravação ia direto do navegador ({gravacoes})")
        return
    fn = {k: v for k, v in gravacoes.items() if k.startswith("fn:nutricao") or k == "storage_link_assinado"}
    o.ok(cont.get("rest_dieta", 0) + cont.get("rest_prontuario", 0) == 0 and cont.get("storage_grava", 0) == 0 and cont.get("rpc_grava", 0) == 0,
         f"[depois] {caso}: 0 rest de gravação nas tabelas da Dieta (e do Prontuário), 0 Storage fora do link assinado, 0 RPC que grava ({gravacoes})")
    o.ok(fn == ESPERADO_DEPOIS[caso], f"[depois] {caso}: só a chamada esperada da nutricao ({fn} × {ESPERADO_DEPOIS[caso]})")


def linha_planilha(base: str, caso: str, cont: Counter, ms: int, commit: str) -> None:
    B.MEDICAO.mkdir(parents=True, exist_ok=True)
    novo = not PLANILHA.exists()
    with PLANILHA.open("a", encoding="utf-8") as f:
        if novo:
            f.write("quando\tbase\tcommit\tcaso\trest_dieta\trest_prontuario\trest_outras\trpc_grava\tstorage_grava\tstorage_link_assinado\tfuncoes\tms\n")
        funcoes = ",".join(f"{k}×{v}" for k, v in sorted(cont.items()) if k.startswith("fn:"))
        f.write("\t".join(str(x) for x in (time.strftime("%Y-%m-%d %H:%M"), base, commit, caso, cont.get("rest_dieta", 0), cont.get("rest_prontuario", 0),
                                          cont.get("rest_outras", 0), cont.get("rpc_grava", 0), cont.get("storage_grava", 0),
                                          cont.get("storage_link_assinado", 0), funcoes, ms)) + "\n")


def print_b(t, prefixo: str, caso: str, o) -> None:
    """O print <prefixo>_<caso>.png em prints/hml19/b (+ a cópia de 900 px, para conferir: tela certa, sem login nem "carregando")."""
    B.PRINTS_B.mkdir(parents=True, exist_ok=True)
    caminho = B.PRINTS_B / f"{prefixo}_{caso}.png"
    t.pg.mouse.move(5, 5)
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


# ───────────────────────── a massa ─────────────────────────
def limpar_massa(o, s: str, dono: str, rodada: str | None = None) -> None:
    """As linhas da marca da rede (staging, dono de teste): os planos (refeições, itens e as marcações do app em cascata), as receitas
    (ingredientes) e os alimentos (medidas) — nessa ordem (o item e o ingrediente apontam para o alimento sem cascata)."""
    if s != "staging":
        return
    C.uuid_ok(dono)
    marca = f"%{B.MARCA}%{rodada}%rede%" if rodada else f"%{B.MARCA}%rede%"
    for tabela, col in (("planos_alimentares", "titulo"), ("receitas", "nome"), ("alimentos", "nome")):
        C.C2.sql_principal(f"delete from {s}.{tabela} where nutricionista_id = {C.txt(dono)} and {col} like {C.txt(marca)}")
    sobra = B.B17.ler(f"select (select count(*) from {s}.planos_alimentares where titulo like {C.txt(marca)})::int + "
                      f"(select count(*) from {s}.receitas where nome like {C.txt(marca)})::int + "
                      f"(select count(*) from {s}.alimentos where nome like {C.txt(marca)})::int as n")[0]["n"]
    o.ok(sobra == 0, f"limpeza conferida (SQL só leitura): 0 plano, receita ou alimento com a marca da rede ({sobra})")


def plano_do_app(s: str, dono: str, copia: str) -> None:
    """A cópia de teste vira o plano ★ do app (o app mostra o ★ mais recente; sem ★, o mais recente) — só a massa da rodada."""
    if s != "staging":
        return
    C.C2.sql_principal(f"update {s}.planos_alimentares set favorito = true where id = {C.txt(C.uuid_ok(copia))} and nutricionista_id = {C.txt(C.uuid_ok(dono))} "
                       f"and titulo like {C.txt('%' + B.MARCA + '%rede%')}")


# ───────────────────────── o --seco ─────────────────────────
def seco(o) -> None:
    faltam = [f"{arq}: {sel}" for arq, sels in SELETORES.items() for sel in sels if sel not in (B.REPO / arq).read_text(encoding="utf-8")]
    o.ok(not faltam, f"os {sum(len(v) for v in SELETORES.values())} seletores da Dieta existem no código das telas" + (f" — faltam: {faltam}" if faltam else ""))
    P = B.API_P
    antes = [
        {"metodo": "POST", "tipo": "tab", "nome": "planos_alimentares", "url": f"{P}/rest/v1/planos_alimentares"},
        {"metodo": "POST", "tipo": "tab", "nome": "refeicoes", "url": f"{P}/rest/v1/refeicoes"},
        {"metodo": "POST", "tipo": "rpc", "nome": "paciente_marcar_refeicao", "url": f"{P}/rest/v1/rpc/paciente_marcar_refeicao"},
        {"metodo": "PATCH", "tipo": "tab", "nome": "pacientes", "url": f"{P}/rest/v1/pacientes?id=eq.x"},
        {"metodo": "GET", "tipo": "tab", "nome": "planos_alimentares", "url": f"{P}/rest/v1/planos_alimentares?select=*"},
    ]
    c = B.contar(antes)
    # hml-19d: o PATCH em pacientes passou a contar à parte (rest_pacientes — as tags do aluno, do Financeiro); segue sendo gravação de fora da Dieta
    o.ok(c == {"rest_dieta": 2, "rpc_grava": 1, "rest_pacientes": 1}, f"a classificação do ANTES (rest na Dieta, a RPC do app): {dict(c)}")
    depois = [
        {"metodo": "POST", "tipo": "fn", "nome": "nutricao", "acao": "plano_criar", "url": f"{P}/functions/v1/nutricao"},
        {"metodo": "POST", "tipo": "rpc", "nome": "plano_alimentar", "url": f"{P}/rest/v1/rpc/plano_alimentar"},
        {"metodo": "OPTIONS", "tipo": "fn", "nome": "nutricao", "acao": None, "url": f"{P}/functions/v1/nutricao"},
    ]
    c = B.contar(depois)
    o.ok(dict(c) == ESPERADO_DEPOIS["prescricao"], f"a classificação do DEPOIS (a nutricao; a RPC de leitura não conta): {dict(c)}")
    app = [{"metodo": "POST", "tipo": "fn", "nome": "nutricao", "acao": "aluno_marcar_refeicao", "url": f"{P}/functions/v1/nutricao"}]
    o.ok(dict(B.contar(app)) == ESPERADO_DEPOIS["app_marcar"], "a classificação do app depois: só a aluno_marcar_refeicao da nutricao")
    # hml-20a (revisão): depois de marcar, a Dieta relê pela nutricao (o `ler` da aluno_dieta) — leitura, fora da conta do caso app_marcar
    import json  # noqa: PLC0415
    reler = {"metodo": "POST", "tipo": "fn", "nome": "nutricao", "acao": "ler", "url": f"{P}/functions/v1/nutricao",
             "corpo": json.dumps({"acao": "ler", "itens": [{"dia": "2026-10-11", "q": "aluno_dieta"}]})}
    o.ok(R.so_gravacoes(B.contar(app + [reler])) == ESPERADO_DEPOIS["app_marcar"],
         "hml-20a: o recarregamento da Dieta pelo `ler` não entra na conta do app_marcar (só a aluno_marcar_refeicao)")
    o.ok(set(ESPERADO_DEPOIS) == set(CASOS) and set(PRINT_DO_CASO) <= set(CASOS), "cada caso tem o esperado do depois; os prints b_* são de casos da lista")
    o.ok({"rest_dieta"} <= set(R.GRAVACOES), "o rede.py conta o rest_dieta entre as gravações")
    class _Pedidos:
        def __init__(self, pedidos: list[dict]) -> None:
            self.pedidos = pedidos

    class _Mudo:
        def ok(self, cond: object, _texto: str, parar: bool | None = None) -> bool:
            return bool(cond)

    def pega(pedidos: list[dict]) -> bool:
        try:
            vigiar(_Pedidos(pedidos), _Mudo(), "teste")
            return False
        except LacoNaTela:
            return True
    perfis = {"metodo": "GET", "tipo": "tab", "nome": "profiles", "url": f"{P}/rest/v1/profiles"}
    semente = {"metodo": "POST", "tipo": "tab", "nome": "modelos_formula", "url": f"{P}/rest/v1/modelos_formula"}
    o.ok(pega([perfis] * 3) and pega([semente] * 2) and not pega([perfis] * 2 + [semente]),
         "a guarda do laço: 3 GET profiles ou 2 sementes ao abrir → fecha na hora; 2 profiles e 1 semente passam")


# ───────────────────────── a rodada ─────────────────────────
def rodar(o, base: str, casos: list[str], canal: str | None, prefixo: str | None = None) -> None:
    from playwright.sync_api import sync_playwright  # noqa: PLC0415

    s = B.usar_base(base)
    L = B.Sessoes(f"rede dieta {base}")
    rodada = B.nova_rodada()
    commit = R.commit_medido(base)
    fase = fase_do_codigo(base, commit)
    rotulo = prefixo or base
    if base == "prod":  # produção: só abre as telas (nada grava)
        casos = []
    dono = ""
    try:
        B.exigir_saude(o, "o rede.py --area dieta")
        pac = B.B17.matricula_da_aluna()
        dono = L.uid(B.P_CONTA)
        guarda = B.B17.Guarda() if base == "prod" else None
        titulo = f"{B.MARCA} {rodada} rede plano"
        ids: dict[str, str | None] = {}
        with sync_playwright() as pw:
            nav = pw.chromium.launch(channel=canal, args=["--no-sandbox"]) if canal else pw.chromium.launch(args=["--no-sandbox"])
            try:
                t = B.B17.Tela(nav, B.BASES[base], f"hml19b_{base}", "rede_dieta", guarda=guarda)
                B.LegalDesligado().instalar(t.ctx)
                crono = Cronometro(t.pg)
                try:
                    t.entrar(L, B.P_CONTA, rota_dieta(pac))
                    ok = esperar_vigiando(t, o, f"[{base}] Dieta da aluna", lambda: t.tem("[data-secao-planejamento]") and t.attr("[data-aba-dieta-aluno]", "data-acesso-dieta") == ["editar"], 60)
                    o.ok(ok, f"[{base}] a Dieta da aluna abre no Plano e a nutri de teste edita ({commit}: o {fase})", parar=True)
                    abrir = R.so_gravacoes(B.contar(t.pedidos))
                    o.ok(not abrir, f"[{base}] Dieta › Plano abre: 0 gravação ao abrir ({abrir})")
                    for caso in [c for c in casos if c in ("prescricao", "item", "duplicar")]:
                        t.zerar_pedidos()
                        crono.zerar()
                        if caso == "prescricao":
                            ok_tela, ms, ids["plano"] = acao_prescricao(t, titulo)
                        elif caso == "item":
                            if not ids.get("plano"):
                                o.ok(False, "[item] precisa do plano da prescrição (rode com prescricao)")
                                continue
                            ok_tela, ms = acao_item(t)
                        else:
                            if not ids.get("plano"):
                                o.ok(False, "[duplicar] precisa do plano da prescrição (rode com prescricao)")
                                continue
                            ok_tela, ms, ids["copia"] = acao_duplicar(t, ids["plano"], titulo)
                            if "item" in casos:
                                o.ok(itens_no_editor(t) == 1, f"[{base}] duplicar: a cópia aberta no editor tem o item do plano ({itens_no_editor(t)})")
                        R.esperar_quieto(t, teto=4 if fase == "antes" else 15)
                        cont = B.contar(t.pedidos)
                        conferir(o, base, caso, cont, ok_tela, ms, fase)
                        linha_planilha(base, caso, cont, ms, commit)
                        o.linha(f"   {caso}: os pedidos mais lentos — {crono.resumo()}")
                        if caso in PRINT_DO_CASO:
                            print_b(t, rotulo, PRINT_DO_CASO[caso], o)
                    for caso, aba in (("receita", "receitas"), ("alimento", "alimentos")):
                        if caso not in casos and base != "prod":
                            continue
                        t.ir(f"/painel/dietas?aba={aba}")
                        ok = esperar_vigiando(t, o, f"[{base}] Dietas › {aba}", lambda: t.tem(f'[data-pagina-dietas][data-aba-dietas="{aba}"]')
                                              and t.n('[data-carregando="1"]') == 0, 60)
                        abrir = R.so_gravacoes(B.contar(t.pedidos))
                        o.ok(ok and not abrir, f"[{base}] Dietas › {aba} abre: 0 gravação ao abrir ({abrir})")
                        if base == "prod":
                            continue
                        t.zerar_pedidos()
                        crono.zerar()
                        nome = f"{B.MARCA} {rodada} rede {caso}"
                        ok_tela, ms = acao_receita(t, nome) if caso == "receita" else acao_alimento(t, nome)
                        R.esperar_quieto(t, teto=4 if fase == "antes" else 15)
                        cont = B.contar(t.pedidos)
                        conferir(o, base, caso, cont, ok_tela, ms, fase)
                        linha_planilha(base, caso, cont, ms, commit)
                        o.linha(f"   {caso}: os pedidos mais lentos — {crono.resumo()}")
                        print_b(t, rotulo, PRINT_DO_CASO[caso], o)
                    if guarda:
                        o.ok(not guarda.bloqueadas, f"[prod] a Guarda não barrou nada ao abrir as telas da Dieta ({guarda.bloqueadas})")
                finally:
                    L.do_navegador(B.P_CONTA, t.pg)
                    t.fim()
                if "app_marcar" in casos:
                    caso_app(o, nav, L, base, s, dono, ids.get("copia"), commit, fase, rotulo)
            finally:
                nav.close()
    except LacoNaTela as e:
        o.linha(f"   o navegador fechou por laço em {e} (anotar no progresso; a medida desta tela fica de fora)")
    finally:
        if s == "staging" and dono:
            limpar_massa(o, s, dono, rodada)
        L.fechar(o)


def caso_app(o, nav, L, base: str, s: str, dono: str, copia: str | None, commit: str, fase: str, rotulo: str) -> None:
    """A aluna marca a refeição da vez no app (a cópia de teste é o plano ★ do app, se a rodada a criou); depois desmarca (fora da medida)."""
    if copia:
        plano_do_app(s, dono, copia)
    t = B.B17.Tela(nav, B.BASES[base], f"hml19b_{base}", "rede_app", desktop=False)
    B.LegalDesligado().instalar(t.ctx)
    try:
        t.entrar(L, B.A_CONTA, "/dieta")
        ok = esperar_vigiando(t, o, f"[{base}] app › Dieta", lambda: t.tem('[data-aba-dieta="plano"]') and refeicao_da_vez(t) is not None, 60)
        if not o.ok(ok, f"[{base}] o app da aluna abre a Dieta com a refeição da vez (o botão Feito)"):
            return
        t.zerar_pedidos()
        ok_tela, ms, rid = acao_app_marcar(t)
        R.esperar_quieto(t, teto=4 if fase == "antes" else 10)
        cont = B.contar(t.pedidos)
        conferir(o, base, "app_marcar", cont, ok_tela, ms, fase)
        linha_planilha(base, "app_marcar", cont, ms, commit)
        print_b(t, rotulo, PRINT_DO_CASO["app_marcar"], o)
        if rid and ok_tela:
            t.clicar(f'[data-refeicao="{rid}"] [data-refeicao-marcar="desmarcar"]')
            o.ok(t.esperar(lambda: t.attr(f'[data-refeicao="{rid}"]', "data-refeicao-estado") == ["agora"], 20),
                 f"[{base}] app: desmarcar volta a refeição para a vez (fora da medida)")
    finally:
        L.do_navegador(B.A_CONTA, t.pg)
        t.fim()
