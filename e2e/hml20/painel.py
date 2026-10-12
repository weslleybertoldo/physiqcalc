"""Physiq hml-20b (H-42 · jeito 2, etapa 2, 12/10/2026) — o que os E2E da hml-20 sabem do PAINEL › ALUNO (`--area painel-aluno` do api.py,
do rede.py e do telas.py): as contas, as telas (a casca, o Resumo, o Prontuário ×10, a Avaliação e o PDF), a área que a guarda CONTA (as
tabelas, as RPCs e os buckets que saíram do navegador), o que fica "fora da área" (de OUTRA W — lido direto, listado à parte, não é falha),
o SQL só leitura "como a pessoa" do P de cada consulta (montado a partir do catálogo do SERVIDOR, lido do TS) e a massa da rodada.

A massa (decisão G do contrato da 20b): a aluna de teste não tem anexo nem foto de evolução — para provar a assinatura (o P e o N8 do
anexo_url e do aluno_evolucao_painel) e o print b_anexo_ver, a rodada cria pelos caminhos que JÁ existem (as ações da hml-19a/19c na
nutricao, como a nutri de TESTE): 1 anexo de imagem (anexo_preparar → PUT no link assinado → anexo_registrar; a descrição e o nome com a
marca "hml20 e2e <rodada>") e 1 foto de evolução (foto_evolucao_preparar → PUT → foto_evolucao_registrar), SÓ no schema staging e nos
buckets *-staging. Os ids vão ao Estado (hml19/agente/e2e_estado.json) e saem no fim (ou no --limpar): pela própria função (anexo_excluir e
foto_evolucao_excluir — a linha e o arquivo), o DELETE das linhas da rodada (só staging, só os ids) e a conferência por SQL só leitura, só
contagem (0 linha com a marca, 0 objeto da rodada nos 2 buckets).
Sem segredo nem dado pessoal na saída: só status, códigos, contagens, tempos e o prazo das URLs (o exp − iat do token, sem o token).
"""
from __future__ import annotations

import base64
import json
import re
from urllib.parse import parse_qs, unquote, urlparse

import _base as B

C = B.C

# ───────────────────────── as contas (staging, só de TESTE) ─────────────────────────
NUTRI = B.P_CONTA            # w5p-nutri: a nutricionista responsável pela aluna (P: a casca, o Resumo, o Prontuário ×10, a Avaliação, o PDF)
PERSONAL = B.PERSONAL_CONTA  # w5p-personal: a personal da aluna (o Resumo e a Avaliação do lado do personal; as anotações da equipe)
OUTRA = B.N1_CONTA           # w13-dono: o profissional de OUTRA conta (N1)
AREA_ESTADO = "painel20b"    # a área no Estado (o --limpar desta W só desfaz a rodada dela)
ARQUIVO_MARCA = "hml20-e2e-painel"

# ───────────────────────── as consultas da 20b (o conjunto do contrato) ─────────────────────────
CONSULTAS_20B = (
    "aluno_perfil", "aluno_evolucao_painel", "profissional", "anotacoes", "anotacoes_todas", "consultas_do_aluno", "anamneses_do_aluno",
    "modelos_anamnese", "questionarios", "respostas_questionario_do_aluno", "pedidos_exame_do_aluno", "exames_do_aluno", "exames_catalogo",
    "resultados_exame_do_aluno", "avaliacoes_integradas_do_aluno", "gestacoes_do_aluno", "registros_gestacionais", "interacoes_farmaco",
    "medicamentos_do_aluno", "analises_farmaco_do_aluno", "documentos_do_aluno", "modelos_documento", "anexos_do_aluno", "anexo_url",
    "antropometrias_do_aluno", "antropometria", "antropometrias_pdf",
)
# as listas do aluno (tabela, paciente_id = o aluno da matrícula) e as da conta (o RLS decide: os do sistema + os próprios)
LISTAS_DO_ALUNO = (
    "consultas_do_aluno", "anamneses_do_aluno", "respostas_questionario_do_aluno", "avaliacoes_integradas_do_aluno", "gestacoes_do_aluno",
    "registros_gestacionais", "medicamentos_do_aluno", "analises_farmaco_do_aluno", "documentos_do_aluno", "anexos_do_aluno", "antropometrias_do_aluno",
)
LISTAS_DA_CONTA = ("modelos_anamnese", "questionarios", "exames_catalogo", "interacoes_farmaco", "modelos_documento")
# as que levam um param obrigatório: no --so-leitura, sem ele → dados_invalidos (prova que a consulta está no ar, sem ir ao banco)
COM_PARAM_OBRIGATORIO = tuple(q for q in CONSULTAS_20B if q not in LISTAS_DA_CONTA and q != "profissional")

# ───────────────────────── a área que a guarda CONTA (o que saiu do navegador) ─────────────────────────
TABELAS_DA_AREA = {
    "consultas", "anamneses", "modelos_anamnese", "questionarios", "respostas_questionario", "pedidos_exame", "exames_catalogo", "resultados_exame",
    "avaliacoes_integradas", "gestacoes", "registros_gestacionais", "interacoes_farmaco_nutriente", "medicamentos_paciente", "analises_farmaco",
    "documentos", "modelos_documento", "anexos", "antropometrias", "fotos_evolucao", "profiles",
}
RPCS_DA_AREA = {"aluno_perfil", "aluno_evolucao", "aluno_anotacoes", "exames_do_aluno"}
BUCKETS_DA_AREA = {"anexos", "anexos-staging", "evolucao", "evolucao-staging"}
# FORA DA ÁREA (de outra W, lido direto, listado à parte — não é falha): o Resumo lê o plano e os ✓ (20c), os compromissos, o responsável
# e o acesso (H-43; o aluno_acesso também GARANTE: está em RPC_QUE_GRAVAM) e o "Editar dados" o paciente_dado_livre (H-43)
FORA_RPCS = {"planos_do_aluno", "plano_alimentar", "aluno_compromissos", "aluno_responsavel", "aluno_acesso", "paciente_dado_livre", "mensagens_desligadas"}
FORA_TABELAS = {"refeicoes_concluidas"}
# as gravações que já existem ao abrir (não são desta W): o padrão do 1º acesso (hml-19a, padroes_garantir) e o aluno_acesso (H-43)
GRAVACOES_ACEITAS = {"fn:nutricao(padroes_garantir)", "rpc:aluno_acesso"}

B.AREAS["painel-aluno"] = {"tabelas": TABELAS_DA_AREA, "rpcs": RPCS_DA_AREA, "buckets": BUCKETS_DA_AREA, "desvio": set()}


def fora_da_area(p: dict) -> str | None:
    """A leitura direta de OUTRA W (o Resumo: 20c e H-43) — listada à parte."""
    metodo, tipo, nome = p.get("metodo"), p.get("tipo"), p.get("nome")
    if tipo == "rpc" and metodo == "POST" and nome in FORA_RPCS:
        return f"rpc:{nome}"
    if tipo == "tab" and metodo in ("GET", "HEAD") and nome in FORA_TABELAS:
        return f"tab:{nome}"
    return None


def gravacao_nomeada(p: dict) -> str | None:
    """A gravação do pedido (a regra da Guarda dos E2E — o _base.gravacao) com o NOME do alvo (a hml-19 só diz "rpc_grava" na RPC)."""
    g = B.gravacao(p)
    if not g:
        return None
    if p.get("tipo") == "rpc":
        return f"rpc:{p.get('nome')}"
    return g


def contar_painel(pedidos: list[dict]) -> dict:
    """A guarda da área do painel (o contar_tela da 20a) + as de fora da área e as gravações que já existem (o garantir e o aluno_acesso)
    separadas das novas (que têm de ser 0 ao abrir)."""
    c = B.contar_tela(pedidos, "painel-aluno")
    fora: dict[str, int] = {}
    aceitas: dict[str, int] = {}
    novas: dict[str, int] = {}
    for p in pedidos:
        f = fora_da_area(p)
        if f:
            fora[f] = fora.get(f, 0) + 1
        g = gravacao_nomeada(p)
        if g:
            alvo = aceitas if g in GRAVACOES_ACEITAS else novas
            alvo[g] = alvo.get(g, 0) + 1
    c["fora"] = fora
    c["gravacoes_aceitas"] = aceitas
    c["gravacoes_novas"] = novas
    return c


# ───────────────────────── as telas (a rota do painel é a da matrícula: /painel/alunos/<pacientes.id>) ─────────────────────────
# (nome, rota relativa ao /painel/alunos/<id>, a marca de que a tela abriu, o teto de chamadas `ler` ao abrir — HIPÓTESE do etapa 1: a
# casca/Resumo em até 3 voltas (o perfil, depois a série do principal, que espera o perfil; os cards), a seção do Prontuário 1 (a Avaliação
# 360, 2: os resultados de exame vão num lote só deles — `sozinha`), a Avaliação 2 (a série + o perfil em cache)
SECOES = (
    ("anotacoes", "[data-secao-anotacoes]", 1), ("consultas", "[data-secao-consultas]", 1), ("anamnese", "[data-secao-anamnese]", 1),
    ("questionarios", "[data-secao-questionarios]", 1), ("exames", "[data-secao-exames]", 1),
    ("avaliacao-integrada", "[data-secao-avaliacao-integrada]", 2), ("gestacional", "[data-secao-gestacional]", 1),
    ("farmaco-nutrientes", "[data-secao-farmaco]", 1), ("documentos", "[data-secao-documentos]", 1), ("anexos", "[data-secao-anexos]", 1),
)
RESUMO = ("resumo", "", "[data-resumo-aluno]", 3)
AVALIACAO = ("avaliacao", "/avaliacao", '[data-aba-avaliacao="dados"], [data-aba-avaliacao="vazia"]', 2)


def telas_da_conta(conta: str) -> list[tuple[str, str, str, int]]:
    """As telas que cada conta abre: a nutri, a casca/Resumo, as 10 seções e a Avaliação; a personal, o Resumo e a Avaliação."""
    if conta == PERSONAL:
        return [RESUMO, AVALIACAO]
    return [RESUMO] + [(f"prontuario_{s}", f"/prontuario?secao={s}" if s != "anotacoes" else "/prontuario", m, teto) for s, m, teto in SECOES] + [AVALIACAO]


# os seletores que o --seco confere no código (a tela que abriu e os do b_anexo_ver/b_prontuario_erro)
SELETORES = {
    "src/painel/aluno/AlunoLayout.tsx": ["data-resumo-aluno", "data-perfil-aluno"],
    "src/painel/aluno/Cabecalho.tsx": ["data-cabecalho-w14"],
    "src/painel/aluno/abas/Prontuario.tsx": ["data-aba-prontuario-aluno", "data-secao-prontuario"],
    "src/painel/aluno/abas/Avaliacao.tsx": ["data-aba-avaliacao"],
    "src/nutricao/prontuario/secoes/Anotacoes.tsx": ["data-secao-anotacoes"],
    "src/nutricao/prontuario/secoes/Consultas.tsx": ["data-secao-consultas", 'role="alert"'],
    "src/nutricao/prontuario/secoes/Anamnese.tsx": ["data-secao-anamnese"],
    "src/nutricao/prontuario/secoes/Questionarios.tsx": ["data-secao-questionarios"],
    "src/nutricao/prontuario/secoes/Exames.tsx": ["data-secao-exames"],
    "src/nutricao/prontuario/secoes/AvaliacaoIntegrada.tsx": ["data-secao-avaliacao-integrada"],
    "src/nutricao/prontuario/secoes/Gestacional.tsx": ["data-secao-gestacional"],
    "src/nutricao/prontuario/secoes/FarmacoNutrientes.tsx": ["data-secao-farmaco"],
    "src/nutricao/prontuario/secoes/Documentos.tsx": ["data-secao-documentos"],
    "src/nutricao/prontuario/secoes/Anexos.tsx": ["data-secao-anexos", "data-btn-ver-anexo", "data-lista-anexos"],
    "src/nutricao/prontuario/ui/VisualizarAnexoDialog.tsx": ["data-modal-visualizar-anexo", "data-img-anexo", 'data-carregou={carregou ? "1" : "0"}'],
    "src/ui/premium/Estados.tsx": ["data-estado={estado}", 'estado="erro"'],
    "src/ui/casca/CascaWeb.tsx": ["data-casca={area}"],
}


# ───────────────────────── o P: o SQL só leitura do que a tela lê hoje, montado do catálogo do servidor ─────────────────────────
def _txt(v: object) -> str:
    return C.txt(str(v))


def sql_da_tabela(s: str, consulta: dict, params: dict, user_id: str) -> str:
    """O select que o servidor monta para a consulta (as colunas, os filtros, o dono, as vivas, a ordem, a página/teto), com o rank da
    ordem de cada linha (dense_rank: as linhas empatadas na ordem têm o mesmo rank — o P confere a ordem sem depender do desempate)."""
    cols = ", ".join(consulta["colunas"])
    onde: list[str] = []
    for f in consulta.get("filtros") or []:
        v = params.get(f["param"])
        if v is None:
            continue
        if f["op"] == "in":
            onde.append(f"{f['coluna']} = any(array[{', '.join(_txt(x) for x in v)}]::uuid[])")
        else:
            onde.append(f"{f['coluna']} = {_txt(v)}")
    if consulta.get("dono"):
        onde.append(f"{consulta['dono']} = {_txt(C.uuid_ok(user_id))}")
    if consulta.get("vivas"):
        onde.append("deleted_at is null")
    ordem = ", ".join(f"{o['coluna']} {'asc' if o['asc'] else 'desc'}" for o in consulta.get("ordem") or []) or "1"
    pagina = consulta.get("pagina")
    if pagina:
        n = int(pagina["tamanho"])
        p = max(1, int(params.get(pagina["param"]) or 1))
        corte = f"offset {(p - 1) * n} limit {n}"
    elif consulta.get("laco"):
        corte = f"limit {int(consulta['laco']['tamanho']) * int(consulta['laco']['leituras'])}"
    else:
        corte = f"limit {int(consulta['teto'])}"
    where = (" where " + " and ".join(onde)) if onde else ""
    return (f"select coalesce(jsonb_agg(jsonb_build_object('r', x.r, 'linha', to_jsonb(x) - 'r') order by x.r), '[]'::jsonb) as v from ("
            f"select {cols}, dense_rank() over (order by {ordem}) as r from {s}.{consulta['tabela']}{where} order by {ordem} {corte}) x")


def sql_do_total(s: str, consulta: dict, params: dict) -> str:
    """O count exato da lista (os mesmos filtros, sem a página) — o `total` da consulta com página."""
    onde = [f"{f['coluna']} = {_txt(params[f['param']])}" for f in consulta.get("filtros") or [] if params.get(f["param"]) is not None]
    if consulta.get("vivas"):
        onde.append("deleted_at is null")
    return f"select count(*)::int as v from {s}.{consulta['tabela']}" + ((" where " + " and ".join(onde)) if onde else "")


def sql_da_rpc(s: str, consulta: dict, params: dict) -> str:
    """A RPC de hoje com os args que o servidor monta (os nomeados; o que não veio fica no padrão da RPC)."""
    args = []
    for arg, param in (consulta.get("args") or {}).items():
        if params.get(param) is None:
            continue
        v = params[param]
        args.append(f"{arg} => {v if isinstance(v, int) and not isinstance(v, bool) else _txt(v)}")
    return f"select to_jsonb({s}.{consulta['rpc']}({', '.join(args)})) as v"


def mesmas_linhas(fn_linhas: list, sql: list) -> tuple[bool, str]:
    """As linhas da função = as do SQL (o mesmo conjunto, canônico) e na ORDEM do catálogo (o rank não desce)."""
    can = lambda x: json.dumps(x, sort_keys=True, ensure_ascii=False, separators=(",", ":"))  # noqa: E731
    esperado = sorted(can(x["linha"]) for x in sql)
    obtido = sorted(can(x) for x in fn_linhas)
    if esperado != obtido:
        return False, f"conjunto diferente ({len(obtido)} × {len(esperado)})"
    rank = {}
    for x in sql:
        rank.setdefault(can(x["linha"]), x["r"])
    ranks = [rank[can(x)] for x in fn_linhas]
    if any(b < a for a, b in zip(ranks, ranks[1:])):
        return False, "fora da ordem do catálogo"
    return True, f"{len(obtido)} linha(s)"


# ───────────────────────── a URL assinada: o prazo e o caminho (do token, sem imprimir o token) ─────────────────────────
def claims_da_url(url: str | None) -> dict:
    """O payload do token da URL assinada (o JWT do Storage: url = <bucket>/<caminho>, iat, exp) — para conferir o prazo e o caminho."""
    if not url:
        return {}
    tok = (parse_qs(urlparse(url).query).get("token") or [""])[0]
    partes = tok.split(".")
    if len(partes) != 3:
        return {}
    try:
        meio = partes[1] + "=" * (-len(partes[1]) % 4)
        return json.loads(base64.urlsafe_b64decode(meio.encode()))
    except Exception:  # noqa: BLE001
        return {}


def prazo_da_url(url: str | None) -> int | None:
    c = claims_da_url(url)
    return int(c["exp"]) - int(c["iat"]) if isinstance(c.get("exp"), int) and isinstance(c.get("iat"), int) else None


def download_da_url(url: str | None) -> str | None:
    """O nome do "baixar" (o ?download= da URL), decodificado; sem ele, None (abre no navegador)."""
    if not url:
        return None
    v = parse_qs(urlparse(url).query, keep_blank_values=True).get("download")
    return unquote(v[0]) if v else None


def caminho_da_url(url: str | None) -> str | None:
    """O <bucket>/<caminho> que o token da URL assina (a claim url)."""
    c = claims_da_url(url)
    return str(c["url"]) if isinstance(c.get("url"), str) else None


# ───────────────────────── a massa e a limpeza (só staging; só contagem na conferência) ─────────────────────────
def pedido_de_anexo(rodada: str, pac: str, tamanho: int) -> dict:
    return {"paciente_id": pac, "nome": f"{ARQUIVO_MARCA}-{rodada}.png", "tipo": "image/png", "tamanho": tamanho}


def criar_anexo(o, estado, token: str, pac: str, rodada: str, uid_dono: str) -> dict | None:
    """1 anexo de imagem da aluna pela nutri (os caminhos da hml-19a): o link assinado do servidor → o PUT → o registro com a marca."""
    s = B.schema()
    png = B.png_sintetico(12)
    pedido = pedido_de_anexo(rodada, pac, len(png))
    st, link, _h, _ms = B.B19.funcao(token, "anexo_preparar", pedido)
    caminho = str(link.get("caminho") or "")
    if not o.ok(st == 200 and link.get("bucket") == B.B19.bucket_dos_anexos(s) and caminho.startswith(f"{uid_dono}/{pac}/") and link.get("token"),
                f"massa: o link do anexo da aluna (a nutri; o caminho na pasta dela) ({st} {link.get('erro')})"):
        return None
    estado.objeto(link["bucket"], caminho)
    st_put = B.B19.subir_no_link(link["bucket"], caminho, link["token"], png, "image/png", token)
    st, r, _h, _ms = B.B19.funcao(token, "anexo_registrar", {**pedido, "caminho": caminho, "descricao": f"{B.MARCA} {rodada}"})
    linha = r.get("linha") or {}
    if C.eh_uuid(linha.get("id")):
        estado.linha("anexos", linha["id"])
    if not o.ok(st_put in (200, 201) and st == 200 and C.eh_uuid(linha.get("id")), f"massa: 1 anexo de imagem da aluna (o PUT {st_put}; o registro {st} {r.get('erro')})"):
        return None
    return {"id": linha["id"], "path": caminho, "nome": pedido["nome"], "bytes": len(png), "bucket": link["bucket"]}


def criar_foto_evolucao(o, estado, token: str, pac: str, rodada: str, dia: str) -> dict | None:
    """1 foto de evolução da aluna pela nutri (os caminhos da hml-19c), com a observação com a marca."""
    s = B.schema()
    jpg = B.jpeg_sintetico()
    pedido = {"paciente_id": pac, "nome": f"{ARQUIVO_MARCA}-{rodada}.jpg", "tipo": "image/jpeg", "tamanho": len(jpg)}
    st, link, _h, _ms = B.B19.funcao(token, "foto_evolucao_preparar", pedido)
    caminho = str(link.get("caminho") or "")
    if not o.ok(st == 200 and link.get("bucket") == B.bucket_da_evolucao(s) and caminho and link.get("token"),
                f"massa: o link da foto de evolução (a nutri) ({st} {link.get('erro')})"):
        return None
    estado.objeto(link["bucket"], caminho)
    st_put = B.B19.subir_no_link(link["bucket"], caminho, link["token"], jpg, "image/jpeg", token)
    st, r, _h, _ms = B.B19.funcao(token, "foto_evolucao_registrar", {**pedido, "caminho": caminho, "posicao": "frente", "data": dia,
                                                                      "observacao": f"{B.MARCA} {rodada} foto"})
    linha = r.get("linha") or {}
    if C.eh_uuid(linha.get("id")):
        estado.linha("fotos_evolucao", linha["id"])
    if not o.ok(st_put in (200, 201) and st == 200 and C.eh_uuid(linha.get("id")), f"massa: 1 foto de evolução da aluna (o PUT {st_put}; o registro {st} {r.get('erro')})"):
        return None
    return {"id": linha["id"], "path": caminho, "bytes": len(jpg), "bucket": link["bucket"]}


def sql_contar_marca(s: str, rodada: str | None = None) -> str:
    """Só contagem (SQL só leitura): as linhas com a marca da rodada nos anexos (a descrição) e nas fotos de evolução (a observação)."""
    marca = f"%{B.MARCA}%{rodada}%" if rodada else f"%{B.MARCA}%"
    return (f"select (select count(*) from {s}.anexos where descricao like {C.txt(marca)})::int as anexos, "
            f"(select count(*) from {s}.fotos_evolucao where observacao like {C.txt(marca)})::int as fotos_evolucao")


def sql_contar_objetos(s: str, rodada: str | None, caminhos: list[str]) -> str:
    """Só contagem: os arquivos da rodada nos buckets dos anexos e da evolução (o nome com a marca, ou os caminhos anotados no Estado)."""
    marca = f"%{ARQUIVO_MARCA}-{rodada}%" if rodada else f"%{ARQUIVO_MARCA}-%"
    nomes = ", ".join(C.txt(c) for c in caminhos) or "''"
    return (f"select count(*)::int as n from storage.objects where bucket_id in ({C.txt(B.B19.bucket_dos_anexos(s))}, {C.txt(B.bucket_da_evolucao(s))}) "
            f"and (name like {C.txt(marca)} or name = any(array[{nomes}]::text[]))")


def sql_apagar(s: str, tabela: str, dono: str, ids: list[str]) -> str:
    """O DELETE das linhas da rodada (só no staging, só as da nutri de TESTE, só os ids anotados) — anexos e fotos_evolucao."""
    if s != "staging":
        raise SystemExit("a massa só existe no staging — nada a apagar em outro schema")
    if tabela not in ("anexos", "fotos_evolucao"):
        raise SystemExit(f"a massa da 20b não tem a tabela {tabela}")
    validos = [i for i in ids if C.eh_uuid(i)]
    if not validos:
        raise SystemExit("nenhum id da rodada para apagar")
    return (f"delete from {s}.{tabela} where nutricionista_id = {C.txt(C.uuid_ok(dono))} "
            f"and id = any(array[{', '.join(C.txt(i) for i in validos)}]::uuid[])")


def limpar_massa(o, estado, L, s: str) -> None:
    """Desfaz a massa da rodada e confere por SQL só leitura (só contagem): pela função (anexo_excluir e foto_evolucao_excluir, como a
    nutri dona — a linha à Lixeira e o arquivo fora), o DELETE das linhas da rodada (staging, só os ids) e o que sobrar no Storage."""
    if estado.vazio():
        o.ok(True, "limpeza: nada pendente no estado")
        estado.apagar()
        return
    if (estado.d.get("area") or "") != AREA_ESTADO:
        o.ok(False, f"a rodada pendente é de outra área ({estado.d.get('area')}): rode o --limpar dela", parar=True)
    tp = L.token(NUTRI)
    por: dict[str, list[str]] = {}
    for tabela, id_ in estado.d["linhas"]:
        por.setdefault(tabela, []).append(id_)
    for id_ in por.get("anexos", []):
        B.B19.funcao(tp, "anexo_excluir", {"id": id_})
    for id_ in por.get("fotos_evolucao", []):
        B.B19.funcao(tp, "foto_evolucao_excluir", {"id": id_})
    for bucket in sorted({b for b, _c in estado.d["storage"]}):
        caminhos = [c for b, c in estado.d["storage"] if b == bucket]
        st, n = B.B19.remover_do_storage(bucket, caminhos, tp)
        o.ok(st == 200, f"limpeza: {len(caminhos)} arquivo(s) do {bucket} como a nutri dona da pasta ({st}, {n})")
    estado.d["storage_rodada"] = estado.d["storage"]
    estado.d["storage"] = []
    estado.salvar()
    dono = L.uid(NUTRI)
    for tabela in ("anexos", "fotos_evolucao"):
        if por.get(tabela):
            C.C2.sql_principal(sql_apagar(s, tabela, dono, por[tabela]))
    rodada = estado.d.get("rodada")
    sobra = B.ler_principal(sql_contar_marca(s, rodada))[0] if rodada else {}
    o.ok(bool(rodada) and not any(sobra.values()), f"limpeza conferida (SQL só leitura): 0 linha com a marca da rodada nos anexos e nas fotos de evolução ({sobra})")
    todos = [c for _b, c in estado.d.get("storage_rodada") or []]
    objs = B.ler_principal(sql_contar_objetos(s, rodada, todos))[0]["n"]
    o.ok(objs == 0, f"limpeza conferida: 0 arquivo da rodada nos buckets dos anexos e da evolução ({objs})")
    estado.apagar()


# ───────────────────────── o "antes" da spec (rede_por_tela.tsv) para as telas do painel ─────────────────────────
def antes_da_spec_painel() -> dict[tuple[str, str], float | None]:
    """O t_pronto medido pela spec (aquecido, pela navegação do app) por (conta, rota) — a rota com :id no lugar da matrícula."""
    arq = B.MEDICAO / "rede_por_tela.tsv"
    saida: dict[tuple[str, str], float | None] = {}
    if not arq.exists():
        return saida
    linhas = arq.read_text(encoding="utf-8").splitlines()
    cab = linhas[0].split("\t") if linhas else []
    for l in linhas[1:]:
        if l.startswith("#"):
            continue
        c = dict(zip(cab, l.split("\t")))
        if c.get("conta") in (NUTRI, PERSONAL) and str(c.get("rota", "")).startswith("/painel/alunos/:id"):
            try:
                saida[(c["conta"], c["rota"])] = float(c.get("t_pronto_s", ""))
            except ValueError:
                saida[(c["conta"], c["rota"])] = None
    return saida


def rota_da_spec(rota_tela: str) -> str:
    """A rota da tela no formato da planilha da spec (/painel/alunos/:id…)."""
    return "/painel/alunos/:id" + rota_tela


def jwt_falso(claims: dict) -> str:
    """Um token de mentira com as claims dadas (só para o --seco conferir a leitura do prazo e do caminho; nunca vai a lugar nenhum)."""
    cod = lambda d: base64.urlsafe_b64encode(json.dumps(d).encode()).decode().rstrip("=")  # noqa: E731
    return f"{cod({'alg': 'HS256', 'typ': 'JWT'})}.{cod(claims)}.assinatura"


RE_SECAO = re.compile(r"secao=([a-z-]+)")
