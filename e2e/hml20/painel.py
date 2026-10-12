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
# 360, 2: os resultados de exame vão num lote só deles — `sozinha`), a Avaliação 1 (hml-20b etapa 2, a decisão da sessão principal sobre o
# TEMPO, ec101ce: a 1ª tela — a casca fria — pede o perfil e a série do principal NUM lote só; antes do ec101ce eram 2, em série)
SECOES = (
    ("anotacoes", "[data-secao-anotacoes]", 1), ("consultas", "[data-secao-consultas]", 1), ("anamnese", "[data-secao-anamnese]", 1),
    ("questionarios", "[data-secao-questionarios]", 1), ("exames", "[data-secao-exames]", 1),
    ("avaliacao-integrada", "[data-secao-avaliacao-integrada]", 2), ("gestacional", "[data-secao-gestacional]", 1),
    ("farmaco-nutrientes", "[data-secao-farmaco]", 1), ("documentos", "[data-secao-documentos]", 1), ("anexos", "[data-secao-anexos]", 1),
)
RESUMO = ("resumo", "", "[data-resumo-aluno]", 3)
AVALIACAO = ("avaliacao", "/avaliacao", '[data-aba-avaliacao="dados"], [data-aba-avaliacao="vazia"]', 1)
# as 2 consultas que a casca fria da Avaliação pede JUNTAS (1 `ler`): o perfil e a série do principal (a parte do Treino espera o perfil e
# vai pela treino-leitura, fora da nutricao)
CONSULTAS_DA_AVALIACAO = frozenset({"aluno_perfil", "aluno_evolucao_painel"})


def avaliacao_num_lote(ler: int, consultas: dict | None) -> bool:
    """A Avaliação (a 1ª tela, a casca fria) no depois: 1 `ler` só, com o perfil e a série juntos."""
    return ler == 1 and CONSULTAS_DA_AVALIACAO <= set(consultas or {})


def telas_da_conta(conta: str) -> list[tuple[str, str, str, int]]:
    """As telas que cada conta abre, NA ORDEM: a Avaliação (a 1ª — a casca e a série sem cache), o Resumo e, a nutri (e a nutri-legado,
    na produção), as 10 seções do Prontuário; a personal, a Avaliação e o Resumo.
    hml-20b etapa 2 (12/10 08:17, a 1ª rodada do antes no staging): a Avaliação passou para ANTES do Resumo. A casca (o Cabecalho com os
    KPIs de peso e gordura), o Resumo e a Avaliação leem a MESMA série (useAvaliacaoDoAluno, staleTime 30 s) e o MESMO perfil
    (usePerfilAluno, 30 s); com o Resumo antes, a Avaliação da personal abria do cache (0 leitura: o [antes] não tinha o que provar e o
    tempo media o cache) e a da nutri, depois das 10 seções, dependia do relógio (passou dos 30 s → recarrega; não passou → cache). Com a
    Avaliação primeiro, ela paga a casca (o perfil, depois a série) nas 2 pontas — igual no antes e no depois — e o Resumo segue com os
    cards dele (as anotações; a série e o perfil já em cache, como na navegação do app)."""
    if conta == PERSONAL:
        return [AVALIACAO, RESUMO]
    return [AVALIACAO, RESUMO] + [(f"prontuario_{s}", f"/prontuario?secao={s}" if s != "anotacoes" else "/prontuario", m, teto) for s, m, teto in SECOES]


# ───────────────────────── a produção (decisão K do contrato da 20b; revisão 🟡1): SÓ LEITURA, a nutri-legado e o aluno de teste DELA ─────
PRODUCAO = B.PROD_CONTA  # nutri-legado: a conta de teste do painel na produção
# as seções que chamam o padroes_garantir ao abrir (hml-19a — GRAVA no 1º acesso): na produção só abrem se os padrões da conta já existem
SECOES_COM_PADRAO = {"prontuario_anamnese": "modelos_anamnese", "prontuario_exames": "exames_catalogo", "prontuario_documentos": "modelos_documento"}
SUFIXO_DE_TESTE = ".teste.claude@physiqnutri.app"  # o e-mail das contas de TESTE (e2e/hml09/_comum.py: eh_email_de_teste)


def sql_uid_da_conta(email: str) -> str:
    """Só leitura: o id (auth) da conta de teste da produção — só o id volta (nada impresso)."""
    return f"select u.id::text as id from auth.users u where lower(u.email) = {C.txt(email.strip().lower())}"


def sql_aluno_de_teste(s: str, uid: str) -> str:
    """Só leitura: as matrículas VIVAS de que a conta é a nutri (ou a personal) e cujo e-mail (o do login, senão o da ficha) é de TESTE —
    só os ids voltam (nada impresso), a mais antiga primeiro."""
    email = "lower(coalesce(u.email, p.email, ''))"
    return (f"select p.id::text as id from {s}.pacientes p left join auth.users u on u.id = p.user_id where p.deleted_at is null "
            f"and (p.nutricionista_id = {C.txt(C.uuid_ok(uid))} or p.personal_id = {C.txt(C.uuid_ok(uid))}) "
            f"and {email} like {C.txt('%' + SUFIXO_DE_TESTE)} and {email} not like '%revisao%' order by p.created_at limit 5")


def sql_padroes(s: str, uid: str) -> str:
    """Só leitura, só contagem: os modelos/catálogos PRÓPRIOS vivos da conta (os padrões do 1º acesso: anamnese, exames, documentos)."""
    u = C.txt(C.uuid_ok(uid))
    return "select " + ", ".join(f"(select count(*) from {s}.{t} where nutricionista_id = {u} and deleted_at is null)::int as {t}"
                                 for t in SECOES_COM_PADRAO.values())


def plano_da_producao(padroes: dict[str, int]) -> tuple[list[tuple[str, str, str, int]], list[tuple[str, str]]]:
    """As telas da nutri-legado na produção: todas as da nutri, menos as seções com padrão cujos padrões a conta AINDA não tem (abrir
    gravaria o padroes_garantir — a Guarda barraria e a tela mostraria o erro): essas pulam, com o motivo."""
    abrir, pulos = [], []
    for t in telas_da_conta(PRODUCAO):
        tabela = SECOES_COM_PADRAO.get(t[0])
        if tabela and int(padroes.get(tabela) or 0) <= 0:
            pulos.append((t[0], f"a nutri-legado não tem os padrões ({tabela}) na produção — abrir gravaria o padroes_garantir (prova viva do Weslley)"))
        else:
            abrir.append(t)
    return abrir, pulos


def escolher_aluno_de_producao(linhas: list[dict]) -> str:
    """O aluno de teste da nutri-legado na produção (o 1º); nenhum → recusa (o --base prod não abre nada)."""
    ids = [x.get("id") for x in linhas if C.eh_uuid(x.get("id"))]
    if not ids:
        raise SystemExit("produção: a nutri-legado não tem aluno de TESTE na produção (nenhuma matrícula viva dela com e-mail de teste) — "
                         "o --base prod não abre nada; a prova do painel na produção fica para a prova viva do Weslley")
    return ids[0]


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


# ───────────────────────── o P: o SQL FIXO do que a tela lia no 6fd3194 (a lib de antes), nunca montado do catálogo ─────────────────────────
# revisão da 20b (🟡3): o P compara a função com o que a LIB DE ANTES lia (git show 6fd3194:<lib>) — a tabela/RPC, o filtro, a ordem e o
# limite/página dela, com `select *` (o que o PostgREST devolvia; o teto de 1000 era o max_rows) —, escrito aqui à mão, uma linha por
# consulta. Assim, um erro no catálogo do servidor (uma coluna a menos, outra ordem, outro filtro) não se esconde num SQL montado dele.
# {s} = o schema; {aluno} = a matrícula (pacientes.id) ou o id da rota; {id} = o id da linha; {uid} = quem está logado (os 2 já citados).
SQL_DA_LIB: dict[str, tuple[str, str]] = {
    # casca/Resumo e Avaliação (painel/aluno/dados/api.ts:31 · avaliacao/fontes.ts:84) e o card/aba/PDF das anotações (anotacoes.ts:77-78)
    "aluno_perfil": ("painel/aluno/dados/api.ts:31", "select to_jsonb({s}.aluno_perfil(p_aluno => {aluno})) as v"),
    "aluno_evolucao_painel": ("painel/aluno/avaliacao/fontes.ts:84", "select to_jsonb({s}.aluno_evolucao(p_aluno => {aluno})) as v"),
    "anotacoes:card": ("prontuario/lib/anotacoes.ts:77-78", "select to_jsonb({s}.aluno_anotacoes(p_aluno => {aluno}, p_limite => 3)) as v"),
    "anotacoes:pagina": ("prontuario/lib/anotacoes.ts:77-78", "select to_jsonb({s}.aluno_anotacoes(p_aluno => {aluno}, p_limite => 20, p_offset => 0)) as v"),
    "anotacoes_todas": ("prontuario/lib/anotacoes.ts:77-78", "select to_jsonb({s}.aluno_anotacoes(p_aluno => {aluno}, p_limite => null)) as v"),
    "exames_do_aluno": ("prontuario/lib/exames.ts:163-165", "select to_jsonb({s}.exames_do_aluno(p_aluno => {aluno}, p_exame => null, p_offset => 0, p_limite => 20)) as v"),
    # o profissional (editor/lib/profissional.ts:8 e :27 — nome e dados_profissionais do profiles de quem está logado)
    "profissional": ("editor/lib/profissional.ts:8,27", "select * from {s}.profiles where id = {uid}"),
    # o Prontuário
    "consultas_do_aluno": ("prontuario/lib/consultas.ts:21-27", "select * from {s}.consultas where paciente_id = {aluno} and deleted_at is null order by data desc, created_at desc limit 1000"),
    "anamneses_do_aluno": ("prontuario/lib/anamneses.ts:72-78", "select * from {s}.anamneses where paciente_id = {aluno} and deleted_at is null order by data desc, created_at desc limit 1000"),
    "modelos_anamnese": ("prontuario/lib/anamneses.ts:25-30", "select * from {s}.modelos_anamnese where deleted_at is null order by favorito desc, titulo asc limit 1000"),
    "questionarios": ("prontuario/lib/questionarios.ts:28", "select * from {s}.questionarios where deleted_at is null order by titulo asc limit 1000"),
    "respostas_questionario_do_aluno": ("prontuario/lib/questionarios.ts:63-69", "select * from {s}.respostas_questionario where paciente_id = {aluno} and deleted_at is null order by data desc, created_at desc limit 1000"),
    "pedidos_exame_do_aluno": ("prontuario/lib/exames.ts:80-88", "select * from {s}.pedidos_exame where paciente_id = {aluno} and deleted_at is null order by data desc, created_at desc, id desc offset 0 limit 20"),
    "pedidos_exame_do_aluno:total": ("prontuario/lib/exames.ts:82 (count exact)", "select count(*)::int as v from {s}.pedidos_exame where paciente_id = {aluno} and deleted_at is null"),
    "exames_catalogo": ("prontuario/lib/exames.ts:29-34", "select * from {s}.exames_catalogo where deleted_at is null order by favorito desc, nome asc limit 1000"),
    "resultados_exame_do_aluno": ("prontuario/lib/exames.ts:123-141", "select * from {s}.resultados_exame where paciente_id = {aluno} and deleted_at is null order by data desc, exame asc, id asc limit 50000"),
    "avaliacoes_integradas_do_aluno": ("prontuario/lib/avaliacaoIntegrada.ts:33-39", "select * from {s}.avaliacoes_integradas where paciente_id = {aluno} and deleted_at is null order by data desc, created_at desc limit 1000"),
    "gestacoes_do_aluno": ("prontuario/lib/gestacional.ts:34-39", "select * from {s}.gestacoes where paciente_id = {aluno} and deleted_at is null order by created_at desc limit 1000"),
    "registros_gestacionais": ("prontuario/lib/gestacional.ts:75-81", "select * from {s}.registros_gestacionais where paciente_id = {aluno} and deleted_at is null order by data desc, created_at desc limit 1000"),
    "interacoes_farmaco": ("prontuario/lib/farmaco.ts:38", "select * from {s}.interacoes_farmaco_nutriente where deleted_at is null order by medicamento asc, nutriente asc limit 1000"),
    "medicamentos_do_aluno": ("prontuario/lib/farmaco.ts:79-85", "select * from {s}.medicamentos_paciente where paciente_id = {aluno} and deleted_at is null order by ativo desc, created_at asc limit 1000"),
    "analises_farmaco_do_aluno": ("prontuario/lib/farmaco.ts:115-121", "select * from {s}.analises_farmaco where paciente_id = {aluno} and deleted_at is null order by data desc, created_at desc limit 1000"),
    "documentos_do_aluno": ("prontuario/lib/documentos.ts:70-75", "select * from {s}.documentos where paciente_id = {aluno} and deleted_at is null order by created_at desc limit 1000"),
    "modelos_documento": ("prontuario/lib/documentos.ts:24-29", "select * from {s}.modelos_documento where deleted_at is null order by favorito desc, titulo asc limit 1000"),
    "anexos_do_aluno": ("prontuario/lib/anexos.ts:26-31", "select * from {s}.anexos where paciente_id = {aluno} and deleted_at is null order by created_at desc limit 1000"),
    # o Ver/Baixar: a lib de antes assinava o anexo da LISTA (o anexo vivo pelo id) — a mesma linha
    "anexo_url": ("prontuario/lib/anexos.ts:26-31,55-56", "select * from {s}.anexos where id = {id} and deleted_at is null"),
    # a Avaliação e a Dieta (editor/lib/antropometrias.ts:32-38), o Editar (abas/Avaliacao.tsx:165: pelo id, SEM o filtro da Lixeira) e o PDF
    "antropometrias_do_aluno": ("editor/lib/antropometrias.ts:32-38", "select * from {s}.antropometrias where paciente_id = {aluno} and deleted_at is null order by data desc, created_at desc limit 1000"),
    "antropometria": ("painel/aluno/abas/Avaliacao.tsx:165", "select * from {s}.antropometrias where id = {id}"),
    "antropometrias_pdf": ("painel/aluno/dados/pdf.ts:44-50", "select * from {s}.antropometrias where paciente_id = {aluno} and deleted_at is null order by data asc limit 1000"),
}
# as colunas que a TELA usa (o tipo do front) quando não é o Row inteiro da tabela: o Pick do anexo, as 12 do PDF, o nome/dados do profissional
COLUNAS_DA_TELA_FIXAS: dict[str, list[str]] = {
    "anexo_url": ["id", "path", "nome"],  # urlAssinada(anexo: Pick<Anexo, "id" | "path" | "nome">)
    "antropometrias_pdf": ["id", "data", "peso", "altura", "sexo", "idade", "circunferencias", "dobras", "protocolo", "resultados", "nutricionista_id", "created_at"],
    "profissional": ["nome", "dados_profissionais"],
}


def _txt(v: object) -> str:
    return C.txt(str(v))


def sql_da_lib(chave: str, s: str, aluno: str | None = None, id_: str | None = None, uid: str | None = None) -> str:
    """O SQL fixo da lib de antes, com os valores (só uuid; citados)."""
    _origem, modelo = SQL_DA_LIB[chave]
    return modelo.format(s=s, aluno=_txt(C.uuid_ok(aluno)) if aluno else "null", id=_txt(C.uuid_ok(id_)) if id_ else "null",
                         uid=_txt(C.uuid_ok(uid)) if uid else "null")


def ordem_do_sql(sql: str) -> str | None:
    """A ordem (o `order by …`) do SQL fixo — para o rank dos empates (a ordem entre linhas iguais na ordem da lib é livre)."""
    m = re.search(r"\border by (.+?)(?: offset \d+)?(?: limit \d+)?$", sql)
    return m.group(1) if m else None


def sql_com_ordem(sql: str) -> str:
    """O SQL fixo de uma lista com o nº da linha (_n) e o rank da ordem da lib (_r: os empatados têm o mesmo), num jsonb só."""
    ordem = ordem_do_sql(sql) or "1"
    return (f"select coalesce(jsonb_agg(jsonb_build_object('n', x._n, 'r', x._r, 'linha', to_jsonb(x) - '_n' - '_r') order by x._n), '[]'::jsonb) as v from ("
            f"select t.*, row_number() over (order by {ordem}) as _n, dense_rank() over (order by {ordem}) as _r from ({sql}) t) x")


def colunas_do_tipo(tabela: str) -> list[str]:
    """As colunas do Row da tabela no tipo gerado do front (src/integrations/principal/types.ts) — o que a tela recebia do `select *`."""
    tipos = (B.REPO / "src" / "integrations" / "principal" / "types.ts").read_text(encoding="utf-8")
    m = re.search(r"\n      " + re.escape(tabela) + r": \{\n        Row: \{\n(.*?)\n        \}", tipos, re.S)
    if not m:
        raise SystemExit(f"tabela {tabela} fora do tipo gerado do front")
    return re.findall(r"^ {10}([a-z_0-9]+)\??: ", m.group(1), re.M)


def colunas_da_tela(q: str, tabela: str | None) -> list[str]:
    """As colunas que a tela usa na consulta: o Pick/recorte (anexo, PDF, profissional) ou o Row inteiro da tabela (as listas)."""
    if q in COLUNAS_DA_TELA_FIXAS:
        return COLUNAS_DA_TELA_FIXAS[q]
    if not tabela:
        raise SystemExit(f"{q}: sem tabela")
    return colunas_do_tipo(tabela)


def comparar_com_a_lib(fn_linhas: list, sql: list, chave_id: str | None = "id") -> tuple[bool, str]:
    """As linhas da função × as do SQL fixo da lib: os mesmos ids, na MESMA ordem (os empatados na ordem da lib em qualquer ordem) e,
    coluna a coluna, os valores das colunas que a função devolve (a `url` da assinatura fica de fora)."""
    can = lambda x: json.dumps(x, sort_keys=True, ensure_ascii=False, separators=(",", ":"))  # noqa: E731
    lib = [x["linha"] for x in sql] if sql and isinstance(sql[0], dict) and "linha" in sql[0] else list(sql)
    ranks = [x.get("r", 0) for x in sql] if sql and isinstance(sql[0], dict) and "linha" in sql[0] else [0] * len(lib)
    if len(fn_linhas) != len(lib):
        return False, f"{len(fn_linhas)} linha(s) × {len(lib)} na lib"
    if chave_id is None:  # sem id (o profissional): por posição
        pares = list(zip(fn_linhas, lib))
    else:
        por_id = {x.get(chave_id): (x, r) for x, r in zip(lib, ranks)}
        if sorted(map(str, por_id)) != sorted(str(x.get(chave_id)) for x in fn_linhas) or len(por_id) != len(lib):
            return False, "ids diferentes dos da lib"
        r_fn = [por_id[x.get(chave_id)][1] for x in fn_linhas]
        if any(b < a for a, b in zip(r_fn, r_fn[1:])):
            return False, "fora da ordem da lib"
        pares = [(x, por_id[x.get(chave_id)][0]) for x in fn_linhas]
    for fn, li in pares:
        for col, v in fn.items():
            if col == "url":
                continue
            if col not in li:
                return False, f"a coluna {col} não existe na tabela"
            if can(v) != can(li[col]):
                return False, f"a coluna {col} difere da lib"
    return True, f"{len(fn_linhas)} linha(s), mesmos ids e ordem, {len(fn_linhas[0]) if fn_linhas else 0} coluna(s) iguais"


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
