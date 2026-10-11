"""Physiq hml-19c (H-41 · jeito 2, 11/10/2026) — a REDE de cada ação típica da Avaliação (Perfil do aluno › Avaliação), no navegador (Edge),
antes × depois (o rede.py chama: --area avaliacao).

Com a personal de TESTE (a foto mensal, no Treino) e a nutri de TESTE (w5p-nutri: antropometria e foto de evolução, no principal na
w5p-aluna), cada caso faz a ação de verdade na tela e a guarda que CONTA (_base.classificar) separa os pedidos
da ação: rest de gravação nas tabelas da Avaliação (rest_avaliacao: antropometrias e fotos_evolucao no principal, physiq_registros_fotos
no Treino), RPC que grava (a aluno_avisar_avaliacao do código antigo conta), cada ação da nutricao e da admin-avaliacoes, Storage (o PUT
no link assinado à parte) — e o tempo da ação (do arquivo escolhido / do salvar até a tela mostrar o resultado).
  foto_mensal          personal › Fotos › mês 2000-01 (o SENTINELA, decisão H) › "Subir" na Frente (JPEG sintético) → a foto aparece no
                       mês (o botão vira "Trocar") — o print c_foto_mensal
  foto_mensal_excluir  personal › Fotos › a foto de 2000-01 › Excluir → Confirmar (a sessão do mês some)
  antropometria        nutri › Nova antropometria (peso + a marca na observação) → Salvar (aparece no Histórico; o aviso "avaliação
                       nova" vai junto) — o print c_antropometria
  foto_evolucao        nutri › Fotos › "Nova foto de evolução" (JPEG sintético, a marca na observação) → Enviar (aparece na lista) — o
                       print c_foto_evolucao
  foto_erro            personal › Fotos › "Subir" com a gravação BARRADA no navegador (o depois: as foto_* da admin-avaliacoes; o antes:
                       o upload direto no bucket) → 1 aviso com a frase fixa, sem toast em laço — o print c_foto_erro
Depois (o código da hml-19c): 0 rest de gravação nas tabelas da Avaliação, 0 RPC que grava, 0 Storage fora do link assinado e só as
chamadas esperadas (foto_preparar + o PUT + foto_salvar · foto_excluir · antropometria_criar + avaliacao_avisar · foto_evolucao_preparar
+ o PUT + foto_evolucao_registrar). Antes (o staging com o código antigo da Avaliação — decisão F): a gravação ia direto (rest_avaliacao,
storage_grava ou rpc_grava ≥ 1) — a linha de base na mesma planilha (medicao/rede_hml19c.tsv). Antes ou depois vem do CÓDIGO medido:
depois = o avaliacaoApi.ts do commit medido chama a foto_preparar (o local sempre).
Massa: o mês sentinela 2000-01 do aluno de teste (Treino) e "hml19 e2e <rodada> rede …" na observação da antropometria e da foto de
evolução (principal), só no staging e só das contas de TESTE; sai no fim (os arquivos pelo Storage como o dono da pasta; as linhas por
SQL só das contas de teste; os avisos "avaliação nova" da rodada) e a conferência é por SQL só leitura (só contagem: 0 linha / 0 arquivo).
Produção: este E2E NÃO roda (não há aluno de TESTE com Avaliação na produção — a prova viva é dele).
Prints: ~/projetos/physiqcalc-scratch/prints/hml19/c/<prefixo>_c_<caso>.png (+ a cópia de 900 px para conferir).
Etapa 2 (11/10): a foto mensal pela TELA precisa de um aluno que abra no painel com os 2 vínculos (a matrícula no principal e o usuário do
Treino com a personal como professora) — a w5p-aluna não tem usuário do Treino e o aluno de teste da w5p-personal só existe no Treino.
Os casos da foto mensal usam a massa da W10 (as contas de TESTE do w17/avaliacao_telas): w7-personal (dono + personal) e o Diego
(w10-aluno); a antropometria e a foto de evolução seguem com a w5p-nutri na w5p-aluna.
"""
from __future__ import annotations

import subprocess
import time

import _base as B
import rede as R

C = B.C
CASOS = ("foto_mensal", "foto_mensal_excluir", "antropometria", "foto_evolucao", "foto_erro")
# a personal e o aluno da TELA da foto mensal (a massa da W10, as contas de TESTE do w17): o Diego tem a matrícula e o usuário do Treino
PERSONAL_TELA = "w7-personal"
EMAIL_ALUNO_TELA = "w10.aluno.teste.claude@physiqnutri.app"
try:
    B.B5.CONTAS.setdefault(PERSONAL_TELA, ("w7.personal.teste.claude@physiqnutri.app", B.B5.senha_de(PERSONAL_TELA)))
except Exception:  # noqa: BLE001 — sem a senha guardada nesta máquina, os casos da foto mensal param no login (o --seco segue)
    pass
PLANILHA = B.MEDICAO / "rede_hml19c.tsv"
SESSAO_SENTINELA = f"treino:{B.MES_SENTINELA}-01"
ESPERADO_DEPOIS = {
    "foto_mensal": {"fn:admin-avaliacoes(foto_preparar)": 1, "storage_link_assinado": 1, "fn:admin-avaliacoes(foto_salvar)": 1},
    "foto_mensal_excluir": {"fn:admin-avaliacoes(foto_excluir)": 1},
    "antropometria": {"fn:nutricao(antropometria_criar)": 1, "fn:nutricao(avaliacao_avisar)": 1},
    "foto_evolucao": {"fn:nutricao(foto_evolucao_preparar)": 1, "storage_link_assinado": 1, "fn:nutricao(foto_evolucao_registrar)": 1},
    "foto_erro": {},
}
PRINT_DO_CASO = {"foto_mensal": "c_foto_mensal", "antropometria": "c_antropometria", "foto_evolucao": "c_foto_evolucao", "foto_erro": "c_foto_erro"}
TEXTO_ERRO = "Não deu certo agora. Tente de novo."  # a frase da tela para a função/Storage que não responde (mensagens.ts)
# os seletores que este E2E usa (o --seco confere que cada um existe no código das telas)
SELETORES = {
    "src/painel/aluno/abas/Avaliacao.tsx": ["data-aba-avaliacao", "data-avaliacao-permissoes", "data-avaliacao-nova", "data-avaliacao-nova-antropometria"],
    "src/painel/aluno/avaliacao/Fotos.tsx": ["data-avaliacao-fotos-gerenciar", "data-sheet-fotos", "data-fotos-mes", "data-foto-mensal-input",
                                             "data-foto-mensal-subir", "data-fotos-sessao", "data-foto-item", "data-foto-excluir", "data-fotos-nova-nutri"],
    "src/painel/aluno/avaliacao/Historico.tsx": ["data-avaliacao-lista", "data-avaliacao-item", "data-avaliacao-origem"],
    "src/nutricao/avaliacao/AntropometriaDialog.tsx": ["data-modal-antropometria", "data-campo-protocolo", "data-campo-peso", "data-campo-observacao",
                                                       "data-btn-salvar-antropometria"],
    "src/nutricao/avaliacao/FotoDialog.tsx": ["data-modal-foto", "data-input-foto", "data-campo-observacao-foto", "data-btn-salvar-foto"],
    "src/ui/premium/Confirmar.tsx": ["data-confirmar-ok"],
}


def fase_do_codigo(base: str, commit: str) -> str:
    """antes = o código antigo da Avaliação (a gravação direta); depois = o jeito 2 (o avaliacaoApi.ts do commit medido chama a
    foto_preparar). Commit desconhecido aqui → antes (as conferências do antes acusam se não for)."""
    if base == "local":
        return "depois"
    r = subprocess.run(["git", "-C", str(B.REPO), "show", f"{commit}:src/painel/aluno/avaliacao/avaliacaoApi.ts"], capture_output=True, text=True, timeout=10)
    return "depois" if r.returncode == 0 and '"foto_preparar"' in r.stdout else "antes"


def so_gravacoes(cont) -> dict:
    """Do que a guarda contou, só o que GRAVA: rest, RPC que grava, Storage (o link assinado à parte), a nutricao e a admin-avaliacoes
    fora da "list" (decisão K). As leituras (treino-leitura, a list, os GET) não entram."""
    return {k: v for k, v in cont.items() if k in R.GRAVACOES or k == "storage_link_assinado" or k.startswith("fn:nutricao")
            or (k.startswith("fn:admin-avaliacoes") and not k.startswith("fn:admin-avaliacoes(list"))}


def rota_avaliacao(pac: str) -> str:
    return f"/painel/alunos/{pac}/avaliacao"


def matricula_do_aluno_da_tela(s: str) -> str:
    """A matrícula do aluno da tela da foto mensal (o Diego, w10-aluno), por SQL só leitura: 1 viva."""
    r = B.B17.ler(f"select p.id::text as id from {s}.pacientes p join auth.users u on u.id = p.user_id "
                  f"where lower(u.email) = {C.txt(EMAIL_ALUNO_TELA)} and p.deleted_at is null order by p.created_at limit 2")
    if len(r) != 1:
        raise SystemExit(f"o aluno da tela da foto mensal tem de ter 1 matrícula viva no {s} (achei {len(r)})")
    return C.uuid_ok(r[0]["id"])


def aluno_treino_da_tela(s: str) -> str:
    """O usuário do Treino do aluno da tela (a 1ª pasta do caminho da foto mensal)."""
    r = B.B17.ler(f"select treino_user_id::text as t from {s}.pacientes where id = {C.txt(matricula_do_aluno_da_tela(s))}")
    return (r[0]["t"] if r else "") or ""


def aba_pronta(t) -> bool:
    return t.tem("[data-aba-avaliacao]") and t.n('[data-avaliacao-estado="carregando"]') == 0


def abrir_fotos(t) -> bool:
    if not t.tem("[data-sheet-fotos]"):
        t.clicar("[data-avaliacao-fotos-gerenciar]")
    return t.esperar(lambda: t.tem("[data-sheet-fotos]"), 20)


def arquivo_jpeg(nome: str, tom: int = 128) -> dict:
    return {"name": nome, "mimeType": "image/jpeg", "buffer": B.jpeg_sintetico(64, tom)}


# ───────────────────────── as ações (cada uma devolve ok e o ms até a tela mostrar o resultado) ─────────────────────────
def acao_foto_mensal(t) -> tuple[bool, int]:
    if not abrir_fotos(t):
        return False, 0
    t.pg.locator("[data-fotos-mes]").first.fill(B.MES_SENTINELA)
    if not t.esperar(lambda: t.tem(f'[data-fotos-mensais="{B.MES_SENTINELA}"]'), 10):
        return False, 0
    t0 = time.time()
    t.pg.set_input_files('[data-foto-mensal-input="frente"]', files=[arquivo_jpeg("foto-teste.jpg")])
    ok = t.esperar(lambda: t.tem(f'[data-sheet-fotos] [data-fotos-sessao="{SESSAO_SENTINELA}"]')
                   and "Trocar" in t.texto('[data-foto-mensal-subir="frente"]'), B.TEMPO_TREINO_S + 30)
    return ok, round((time.time() - t0) * 1000)


def acao_foto_mensal_excluir(t) -> tuple[bool, int]:
    if not abrir_fotos(t):
        return False, 0
    sel = f'[data-fotos-sessao="{SESSAO_SENTINELA}"] [data-foto-excluir]'
    if not t.esperar(lambda: t.tem(sel), 20):
        return False, 0
    t.pg.locator(sel).first.click()
    if not t.esperar(lambda: t.tem("[data-confirmar-ok]"), 10):
        return False, 0
    t0 = time.time()
    t.clicar("[data-confirmar-ok]")
    ok = t.esperar(lambda: not t.tem(f'[data-fotos-sessao="{SESSAO_SENTINELA}"]'), B.TEMPO_TREINO_S + 30)
    return ok, round((time.time() - t0) * 1000)


def acao_antropometria(t, marca: str, achar_id) -> tuple[bool, int]:
    if t.tem('[data-avaliacao-nova="escolher"]'):
        t.clicar('[data-avaliacao-nova="escolher"]')
        if not t.esperar(lambda: t.tem("[data-avaliacao-nova-antropometria]"), 10):
            return False, 0
        t.clicar("[data-avaliacao-nova-antropometria]")
    else:
        t.clicar('[data-avaliacao-nova="antropometria"]')
    if not t.esperar(lambda: t.tem('[data-modal-antropometria="nova"]'), 15):
        return False, 0
    # o modal abre com o protocolo da última antropometria do aluno (as dobras dele ficam obrigatórias): "nenhum" = só as medidas
    t.pg.locator("[data-campo-protocolo]").first.select_option("nenhum")
    t.pg.locator("[data-campo-peso]").first.fill("70,4")
    t.pg.locator("[data-campo-observacao]").first.fill(marca)
    t0 = time.time()
    t.clicar("[data-btn-salvar-antropometria]")
    ok = t.esperar(lambda: t.n("[data-modal-antropometria]") == 0 and bool(achar_id())
                   and t.tem(f'[data-avaliacao-item$="{achar_id()}"]'), 60)
    return ok, round((time.time() - t0) * 1000)


def acao_foto_evolucao(t, marca: str, nome_arquivo: str, achar_id) -> tuple[bool, int]:
    if not abrir_fotos(t):
        return False, 0
    t.clicar("[data-fotos-nova-nutri]")
    if not t.esperar(lambda: t.tem('[data-modal-foto="novo"]'), 15):
        return False, 0
    t.pg.set_input_files("[data-input-foto]", files=[arquivo_jpeg(nome_arquivo, 110)])
    t.pg.locator("[data-campo-observacao-foto]").first.fill(marca)
    t0 = time.time()
    t.clicar("[data-btn-salvar-foto]")
    ok = t.esperar(lambda: t.n("[data-modal-foto]") == 0 and bool(achar_id()) and t.tem(f'[data-foto-item$="{achar_id()}"]'), 60)
    return ok, round((time.time() - t0) * 1000)


class BarrarGravacaoDaFoto:
    """A rota que BARRA a gravação da foto mensal no navegador (o caso foto_erro): as foto_* da admin-avaliacoes (o depois) e o upload
    direto no bucket registros (o antes) — route.abort; o resto passa. Conta o que barrou."""

    def __init__(self) -> None:
        self.barradas: list[str] = []

    def instalar(self, ctx) -> None:
        import re  # noqa: PLC0415

        def rota(route, req) -> None:
            u = req.url
            foto_fn = "/functions/v1/admin-avaliacoes" in u and req.method == "POST" and str(B.B17.acao_do_corpo(req) or "").startswith("foto_")
            upload = "/storage/v1/object/registros" in u and req.method in ("POST", "PUT")
            if foto_fn or upload:
                self.barradas.append("fn" if foto_fn else "storage")
                route.abort()
                return
            route.fallback()
        ctx.route(re.compile(r"https://api\.physiqcalc\.com\.br/(functions/v1/admin-avaliacoes|storage/v1/object/registros)"), rota)


def acao_foto_erro(t) -> tuple[bool, int, int]:
    """Sobe com a gravação barrada: 1 aviso (toast) com a frase fixa e nenhum toast em laço por 4 s. Devolve (ok, ms, nº de toasts)."""
    if not abrir_fotos(t):
        return False, 0, 0
    t.pg.locator("[data-fotos-mes]").first.fill(B.MES_SENTINELA)
    t0 = time.time()
    t.pg.set_input_files('[data-foto-mensal-input="frente"]', files=[arquivo_jpeg("foto-erro.jpg")])
    viu = t.esperar(lambda: TEXTO_ERRO in t.texto("[data-sonner-toaster]"), 60)
    ms = round((time.time() - t0) * 1000)
    t.pg.wait_for_timeout(4000)
    n = t.pg.locator("[data-sonner-toast]").filter(has_text=TEXTO_ERRO).count()
    return viu and n == 1 and not t.tem(f'[data-sheet-fotos] [data-fotos-sessao="{SESSAO_SENTINELA}"]'), ms, n


# ───────────────────────── a conferência, a planilha, os prints ─────────────────────────
def conferir(o, base: str, caso: str, cont, ok_tela: bool, ms: int, fase: str) -> None:
    o.ok(ok_tela, f"[{base}] {caso}: a ação terminou na tela ({ms} ms)")
    gravacoes = so_gravacoes(cont)
    if fase == "antes":
        if caso != "foto_erro":
            o.ok(cont.get("rest_avaliacao", 0) + cont.get("storage_grava", 0) + cont.get("rpc_grava", 0) >= 1,
                 f"[antes] {caso}: a gravação ia direto do navegador ({gravacoes})")
        return
    fn = {k: v for k, v in gravacoes.items() if k.startswith("fn:") or k == "storage_link_assinado"}
    o.ok(cont.get("rest_avaliacao", 0) == 0 and cont.get("storage_grava", 0) == 0 and cont.get("rpc_grava", 0) == 0,
         f"[depois] {caso}: 0 rest de gravação na Avaliação, 0 Storage fora do link assinado, 0 RPC que grava ({gravacoes})")
    if caso != "foto_erro":  # no erro, a chamada barrada não chega a ser anotada como feita
        o.ok(fn == ESPERADO_DEPOIS[caso], f"[depois] {caso}: só as chamadas esperadas ({fn} × {ESPERADO_DEPOIS[caso]})")


def linha_planilha(base: str, caso: str, cont, ms: int, commit: str) -> None:
    B.MEDICAO.mkdir(parents=True, exist_ok=True)
    novo = not PLANILHA.exists()
    with PLANILHA.open("a", encoding="utf-8") as f:
        if novo:
            f.write("quando\tbase\tcommit\tcaso\trest_avaliacao\trest_outras\trpc_grava\tstorage_grava\tstorage_link_assinado\tfuncoes\tms\n")
        funcoes = ",".join(f"{k}×{v}" for k, v in sorted(cont.items()) if k.startswith("fn:") and not k.startswith("fn:treino-leitura"))
        f.write("\t".join(str(x) for x in (time.strftime("%Y-%m-%d %H:%M"), base, commit, caso, cont.get("rest_avaliacao", 0), cont.get("rest_outras", 0),
                                          cont.get("rpc_grava", 0), cont.get("storage_grava", 0), cont.get("storage_link_assinado", 0), funcoes, ms)) + "\n")


def print_c(t, prefixo: str, nome: str, o) -> None:
    """O print <prefixo>_<nome>.png em prints/hml19/c (+ a cópia de 900 px para conferir)."""
    B.PRINTS_C.mkdir(parents=True, exist_ok=True)
    caminho = B.PRINTS_C / f"{prefixo}_{nome}.png"
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


# ───────────────────────── a limpeza (staging, só contas de teste) ─────────────────────────
def limpar_massa(o, s: str, L, rodada: str | None = None, desde: str | None = None) -> None:
    """A foto mensal do mês sentinela (o arquivo como a personal; a linha por SQL só do aluno de teste), as linhas da marca da rodada no
    principal (o arquivo da evolução como a nutri dona da pasta) e os avisos "avaliação nova" da rodada; depois, a conferência (só contagem)."""
    if s != "staging":
        return
    pac = B.B17.matricula_da_aluna()
    mat = B.B17.ler(f"select user_id::text as u from {s}.pacientes where id = {C.txt(pac)}")
    aluna_user = (mat[0]["u"] if mat else "") or ""
    aluno = aluno_treino_da_tela(s)  # a foto mensal da tela é a do Diego (a massa da W10)
    if C.eh_uuid(aluno):
        fotos = B.ler_treino(f"select id::text as id, storage_path as p from {s}.physiq_registros_fotos where user_id = {C.txt(aluno)} "
                             f"and mes_ref = {C.txt(B.MES_SENTINELA + '-01')}::date")
        objetos = [x["name"] for x in B.ler_treino(f"select name from storage.objects where bucket_id = {C.txt(B.bucket_dos_registros(s))} "
                                                     f"and name like {C.txt(aluno + '/' + B.MES_SENTINELA + '/%')}")]
        if objetos:
            st, n = B.remover_do_storage_treino(B.bucket_dos_registros(s), objetos, L.token_treino(PERSONAL_TELA))
            o.ok(st == 200, f"limpeza: {len(objetos)} arquivo(s) do mês sentinela tirados do bucket do Treino como a personal ({st}, {n})")
        if fotos:
            C.C2.sql_mgmt(B.TREINO_REF, B.sql_apagar_fotos_treino(s, aluno, [x["id"] for x in fotos]))
    dono = L.uid(B.P_CONTA)
    marca = f"%{B.MARCA}%{rodada}%" if rodada else f"%{B.MARCA}%rede%"
    caminhos = [x["path"] for x in B.B17.ler(f"select path from {s}.fotos_evolucao where nutricionista_id = {C.txt(dono)} and observacao like {C.txt(marca)}")]
    if caminhos:
        st, n = B.remover_do_storage(B.bucket_da_evolucao(s), caminhos, L.token(B.P_CONTA))
        o.ok(st == 200, f"limpeza: {len(caminhos)} arquivo(s) da evolução tirados do bucket como a nutri ({st}, {n})")
    for tabela in ("antropometrias", "fotos_evolucao"):
        C.C2.sql_principal(f"delete from {s}.{tabela} where nutricionista_id = {C.txt(C.uuid_ok(dono))} and observacao like {C.txt(marca)}")
    if desde and C.eh_uuid(aluna_user):
        avisos = [x["id"] for x in B.B17.ler(f"select id::text as id from {s}.avisos where destino_user_id = {C.txt(aluna_user)} "
                                             f"and tipo = 'avaliacao_nova' and criado_em >= {C.txt(desde)}::timestamptz")]
        if avisos:
            C.C2.sql_principal(B.sql_apagar_avisos(s, aluna_user, avisos))
    sobra = B.B17.ler(f"select (select count(*) from {s}.antropometrias where observacao like {C.txt(marca)})::int + "
                      f"(select count(*) from {s}.fotos_evolucao where observacao like {C.txt(marca)})::int as n")[0]["n"]
    sent = {x: int(B.ler_treino(B.sql_contar_sentinela(x, aluno))[0]["n"]) for x in ("public", "staging")} if C.eh_uuid(aluno) else {}
    objs_t = B.ler_treino(f"select count(*)::int as n from storage.objects where bucket_id = {C.txt(B.bucket_dos_registros(s))} "
                          f"and name like {C.txt(aluno + '/' + B.MES_SENTINELA + '/%')}")[0]["n"] if C.eh_uuid(aluno) else 0
    objs_p = B.B17.ler(f"select count(*)::int as n from storage.objects where bucket_id = {C.txt(B.bucket_da_evolucao(s))} "
                       f"and name = any(array[{', '.join(C.txt(c) for c in caminhos) or 'null'}]::text[])")[0]["n"]
    o.ok(sobra == 0 and not any(sent.values()) and objs_t == 0 and objs_p == 0,
         f"limpeza conferida (SQL só leitura): 0 linha da marca, 0 foto no mês sentinela (2 schemas) e 0 arquivo ({sobra}, {sent}, {objs_t}, {objs_p})")


# ───────────────────────── o --seco ─────────────────────────
def seco(o) -> None:
    faltam = [f"{arq}: {sel}" for arq, sels in SELETORES.items() for sel in sels if sel not in (B.REPO / arq).read_text(encoding="utf-8")]
    o.ok(not faltam, f"os {sum(len(v) for v in SELETORES.values())} seletores da Avaliação existem no código das telas" + (f" — faltam: {faltam}" if faltam else ""))
    P, T = B.API_P, B.API_T
    antes = [
        {"metodo": "POST", "tipo": "storage", "nome": "objeto", "url": f"{T}/storage/v1/object/registros-staging/a/2000-01/frente.jpg"},
        {"metodo": "POST", "tipo": "tab", "nome": "physiq_registros_fotos", "url": f"{T}/rest/v1/physiq_registros_fotos?on_conflict=user_id,mes_ref,tipo"},
        {"metodo": "POST", "tipo": "tab", "nome": "antropometrias", "url": f"{P}/rest/v1/antropometrias"},
        {"metodo": "POST", "tipo": "rpc", "nome": "aluno_avisar_avaliacao", "url": f"{P}/rest/v1/rpc/aluno_avisar_avaliacao"},
        {"metodo": "DELETE", "tipo": "storage", "nome": "objeto", "url": f"{P}/storage/v1/object/evolucao-staging"},
        {"metodo": "POST", "tipo": "fn", "nome": "treino-leitura", "acao": "avaliacoes", "url": f"{T}/functions/v1/treino-leitura"},
    ]
    c = B.contar(antes)
    o.ok(c == {"storage_grava": 2, "rest_avaliacao": 2, "rpc_grava": 1, "fn:treino-leitura(avaliacoes)": 1},
         f"a classificação do ANTES (o Storage e a tabela direto, a RPC do aviso): {dict(c)}")
    o.ok(so_gravacoes(c) == {"storage_grava": 2, "rest_avaliacao": 2, "rpc_grava": 1}, "a leitura (treino-leitura) não conta como gravação")
    depois = [
        {"metodo": "POST", "tipo": "fn", "nome": "admin-avaliacoes", "acao": "foto_preparar", "url": f"{T}/functions/v1/admin-avaliacoes"},
        {"metodo": "PUT", "tipo": "storage", "nome": "objeto", "url": f"{T}/storage/v1/object/upload/sign/registros-staging/a/2000-01/frente.jpg?token=t"},
        {"metodo": "POST", "tipo": "fn", "nome": "admin-avaliacoes", "acao": "foto_salvar", "url": f"{T}/functions/v1/admin-avaliacoes"},
        {"metodo": "POST", "tipo": "fn", "nome": "admin-avaliacoes", "acao": "list", "url": f"{T}/functions/v1/admin-avaliacoes"},
        {"metodo": "OPTIONS", "tipo": "fn", "nome": "admin-avaliacoes", "acao": None, "url": f"{T}/functions/v1/admin-avaliacoes"},
    ]
    c = B.contar(depois)
    o.ok({k: v for k, v in so_gravacoes(c).items()} == ESPERADO_DEPOIS["foto_mensal"],
         f"a classificação do DEPOIS (as foto_* e o PUT no link assinado; a list é leitura): {so_gravacoes(c)}")
    nut = [{"metodo": "POST", "tipo": "fn", "nome": "nutricao", "acao": a, "url": f"{P}/functions/v1/nutricao"} for a in ("antropometria_criar", "avaliacao_avisar")]
    o.ok(so_gravacoes(B.contar(nut)) == ESPERADO_DEPOIS["antropometria"], "a classificação da antropometria depois: o criar e o aviso pela nutricao")
    o.ok(set(ESPERADO_DEPOIS) == set(CASOS) and set(PRINT_DO_CASO) <= set(CASOS), "cada caso tem o esperado do depois; os prints c_* são de casos da lista")
    o.ok({"rest_avaliacao"} <= set(R.GRAVACOES), "o rede.py conta o rest_avaliacao entre as gravações")
    o.ok(fase_do_codigo("staging", "bcc1fcd") == "antes" and fase_do_codigo("local", "x") == "depois",
         "antes × depois pelo código medido: o bcc1fcd (a main de antes) é o antes; o local é o depois")
    texto_tela = (B.REPO / "src" / "painel" / "aluno" / "avaliacao" / "mensagens.ts").read_text(encoding="utf-8")
    o.ok(TEXTO_ERRO in texto_tela, "a frase que o foto_erro espera é a da tela (mensagens.ts)")
    jpg = B.jpeg_sintetico(64)
    o.ok(jpg[:3] == b"\xff\xd8\xff" and len(jpg) < 3000, f"a imagem das telas é sintética e pequena (JPEG 64 × 64, {len(jpg)} bytes)")


# ───────────────────────── a rodada ─────────────────────────
def rodar(o, base: str, casos: list[str], canal: str | None, prefixo: str | None = None) -> None:
    from playwright.sync_api import sync_playwright  # noqa: PLC0415

    if base == "prod":
        o.ok(False, "rede --area avaliacao NÃO roda na produção (não há aluno de TESTE com Avaliação lá — a prova viva é dele)")
        return
    s = B.usar_base(base)
    L = B.Sessoes(f"rede avaliacao {base}")
    rodada = B.nova_rodada()
    commit = R.commit_medido(base)
    fase = fase_do_codigo(base, commit)
    rotulo = prefixo or base
    desde = None
    try:
        B.exigir_saude(o, "o rede.py --area avaliacao")
        pac = B.B17.matricula_da_aluna()
        pac_tela = matricula_do_aluno_da_tela(s)
        desde = B.B17.ler("select now()::text as t")[0]["t"]
        dono = L.uid(B.P_CONTA)
        limpar_massa(o, s, L, None, None)  # o mês sentinela começa vazio (uma rodada anterior que caiu não atrapalha)
        with sync_playwright() as pw:
            nav = pw.chromium.launch(channel=canal, args=["--no-sandbox"]) if canal else pw.chromium.launch(args=["--no-sandbox"])
            try:
                # a personal: a foto mensal (o Treino)
                if {"foto_mensal", "foto_mensal_excluir", "foto_erro"} & set(casos):
                    t = B.B17.Tela(nav, B.BASES[base], f"hml19c_{base}", "rede_avaliacao_personal")
                    B.LegalDesligado().instalar(t.ctx)
                    barrar = BarrarGravacaoDaFoto() if "foto_erro" in casos else None
                    try:
                        t.entrar(L, PERSONAL_TELA, rota_avaliacao(pac_tela))
                        ok = t.esperar(lambda: aba_pronta(t) and "fisica" in (t.attr("[data-aba-avaliacao]", "data-avaliacao-permissoes") or [""])[0], 90)
                        o.ok(ok, f"[{base}] a Avaliação da aluna abre para a personal de teste com a avaliação física ({commit}: o {fase})", parar=True)
                        for caso in [c for c in ("foto_mensal", "foto_mensal_excluir") if c in casos]:
                            t.zerar_pedidos()
                            ok_tela, ms = acao_foto_mensal(t) if caso == "foto_mensal" else acao_foto_mensal_excluir(t)
                            R.esperar_quieto(t, teto=15)
                            cont = B.contar(t.pedidos)
                            conferir(o, base, caso, cont, ok_tela, ms, fase)
                            linha_planilha(base, caso, cont, ms, commit)
                            if caso in PRINT_DO_CASO:
                                print_c(t, rotulo, PRINT_DO_CASO[caso], o)
                        if barrar:
                            barrar.instalar(t.ctx)
                            t.zerar_pedidos()
                            ok_tela, ms, n = acao_foto_erro(t)
                            cont = B.contar(t.pedidos)
                            o.ok(ok_tela and barrar.barradas, f"[{base}] foto_erro: 1 aviso com a frase fixa, sem toast em laço ({n} toast; barrou {barrar.barradas})")
                            conferir(o, base, "foto_erro", cont, ok_tela, ms, fase)
                            print_c(t, rotulo, PRINT_DO_CASO["foto_erro"], o)
                    finally:
                        L.do_navegador(PERSONAL_TELA, t.pg)
                        t.fim()
                # a nutri: a antropometria e a foto de evolução (o principal)
                if {"antropometria", "foto_evolucao"} & set(casos):
                    t = B.B17.Tela(nav, B.BASES[base], f"hml19c_{base}", "rede_avaliacao_nutri")
                    B.LegalDesligado().instalar(t.ctx)
                    try:
                        t.entrar(L, B.P_CONTA, rota_avaliacao(pac))
                        ok = t.esperar(lambda: aba_pronta(t) and "antropometria" in (t.attr("[data-aba-avaliacao]", "data-avaliacao-permissoes") or [""])[0], 90)
                        o.ok(ok, f"[{base}] a Avaliação da aluna abre para a nutri de teste com a antropometria ({commit}: o {fase})", parar=True)
                        for caso in [c for c in ("antropometria", "foto_evolucao") if c in casos]:
                            marca = f"{B.MARCA} {rodada} rede {caso}"
                            tabela = "antropometrias" if caso == "antropometria" else "fotos_evolucao"

                            def achar_id(tabela: str = tabela, marca: str = marca) -> str:
                                r = B.B17.ler(f"select id::text as id from {s}.{tabela} where nutricionista_id = {C.txt(dono)} and observacao = {C.txt(marca)} limit 1")
                                return r[0]["id"] if r else ""
                            t.zerar_pedidos()
                            if caso == "antropometria":
                                ok_tela, ms = acao_antropometria(t, marca, achar_id)
                            else:
                                ok_tela, ms = acao_foto_evolucao(t, marca, f"hml19-e2e-{rodada}.jpg", achar_id)
                            R.esperar_quieto(t, teto=15)
                            cont = B.contar(t.pedidos)
                            conferir(o, base, caso, cont, ok_tela, ms, fase)
                            linha_planilha(base, caso, cont, ms, commit)
                            print_c(t, rotulo, PRINT_DO_CASO[caso], o)
                    finally:
                        L.do_navegador(B.P_CONTA, t.pg)
                        t.fim()
            finally:
                nav.close()
    finally:
        if s == "staging":
            limpar_massa(o, s, L, rodada, desde)
        L.fechar(o)
