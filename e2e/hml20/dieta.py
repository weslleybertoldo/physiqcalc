"""Physiq hml-20c (H-42 · jeito 2, etapa 2, 12/10/2026) — o que os E2E da hml-20 sabem da DIETA do aluno no Painel, das DIETAS, da
PRÉ-CONSULTA e do DASHBOARD de saúde (`--area dieta` do api.py, do rede.py e do telas.py): as contas, as telas, a área que a guarda CONTA
(as tabelas, as RPCs e o bucket que saíram do navegador), o que fica "fora da área" (de OUTRA W — lido direto, listado à parte, não é falha),
o SQL só leitura "como a pessoa" do P de cada consulta (o SQL FIXO do que a lib do 2436d0b lia, com a origem arquivo:linha — nunca montado do
catálogo do servidor: a lição 🟡3 da revisão da 20b) e a massa da rodada.

A massa (decisão J do contrato da 20c): a massa de teste não tem foto no diário nem formulário/resposta de Pré-consulta — a rodada cria pelos
caminhos que JÁ existem: 1 foto no diário da aluna (a aluna, pela ação da hml-19b na nutricao: aluno_diario_preparar → PUT → aluno_diario_enviar;
o comentário com a marca), 1 formulário de Pré-consulta da nutri (pelas ações NOVAS da 20c: preconsulta_formulario_criar/_editar; o título com
a marca) e 1 resposta dele (pelo formulário público /f/:slug, como ANÔNIMO — a RPC preconsulta_responder de hoje; o nome com a marca), SÓ no
schema staging e no bucket diario-staging, SÓ nas contas de teste. Os ids vão ao Estado (hml19/agente/e2e_estado.json) e saem no fim (ou no
--limpar): pela própria função (diario_excluir; preconsulta_resposta_excluir e _formulario_excluir — a Lixeira), o DELETE das linhas da rodada
(staging, só os ids) e a conferência por SQL só leitura, só contagem (0 linha com a marca no diário e na Pré-consulta; 0 objeto da rodada).
Sem segredo nem dado pessoal na saída: só status, códigos, contagens, tempos e o prazo das URLs (o exp − iat do token, sem o token).
"""
from __future__ import annotations

import json
import re
from pathlib import Path

import _base as B
import painel as P20B  # o comparador, a URL assinada (prazo/caminho do token) e a produção da 20b — reaproveitados

C = B.C

# ───────────────────────── as contas (staging, só de TESTE) ─────────────────────────
NUTRI = B.P_CONTA            # w5p-nutri: a nutricionista da aluna (P: a Dieta ×8, as Dietas ×3, a Pré-consulta ×2, o Dashboard; o formulário de teste)
ALUNA = B.A_CONTA            # w5p-aluna: a aluna (só a massa: a foto do diário, pelo app)
PERSONAL = B.PERSONAL_CONTA  # w5p-personal: o Dashboard dele também lê a 20c (painel_resumo, preconsulta_novas, respostas_recentes — o useDashboard)
OUTRA = B.N1_CONTA           # w13-dono: o profissional de OUTRA conta (N1)
AREA_ESTADO = "dieta20c"     # a área no Estado (o --limpar desta W só desfaz a rodada dela)
ARQUIVO_MARCA = "hml20-e2e-dieta"

# ───────────────────────── as consultas da 20c (o conjunto do contrato; os nomes que o código pediu: progresso_20c) ─────────────────────────
CONSULTAS_20C = (
    "planos_do_aluno", "plano_alimentar", "planos_favoritos", "calculos_do_aluno", "registros_diarios", "registros_do_dia", "refeicoes_concluidas",
    "metas_concluidas", "metas_do_aluno", "modelos_meta", "modelos_orientacao", "modelos_formula", "orientacoes_do_aluno", "formulas_do_aluno", "produtos",
    "indicacoes_do_aluno", "alimentos_busca", "grupos_alimentos", "receitas_pagina", "receitas_todas", "receita_nome", "grupos_receita", "diario_pagina",
    "diario_contagem", "diario_alunos", "diario_hoje", "diario_urls", "diario_foto_url", "formularios_preconsulta", "preconsulta_numeros",
    "respostas_da_conta", "preconsulta_novas", "painel_resumo", "respostas_recentes",
)
# as listas do aluno (tabela, paciente_id = o aluno do corpo, as vivas) e as do período (+ de/ate)
LISTAS_DO_ALUNO = ("calculos_do_aluno", "metas_do_aluno", "orientacoes_do_aluno", "formulas_do_aluno", "indicacoes_do_aluno")
LISTAS_DO_PERIODO = ("registros_diarios", "refeicoes_concluidas", "metas_concluidas")
# os modelos e o catálogo (o RLS decide: a lib não filtrava por dono) — sem param nenhum
LISTAS_DA_CONTA = ("modelos_meta", "modelos_orientacao", "modelos_formula", "produtos", "receitas_todas")
# as que precisam da conta ativa (o recorte da conta — o .or() de hoje, montado no servidor)
DA_CONTA_ATIVA = ("diario_pagina", "diario_contagem", "diario_alunos", "diario_hoje", "formularios_preconsulta", "preconsulta_numeros", "respostas_da_conta",
                  "preconsulta_novas", "painel_resumo", "respostas_recentes")
# sem param obrigatório (o --so-leitura não as chama: sem param, elas vão ao banco)
SEM_PARAM_OBRIGATORIO = ("planos_favoritos", "modelos_meta", "modelos_orientacao", "modelos_formula", "produtos", "grupos_alimentos", "receitas_todas",
                         "grupos_receita")
COM_PARAM_OBRIGATORIO = tuple(q for q in CONSULTAS_20C if q not in SEM_PARAM_OBRIGATORIO)

# ───────────────────────── a área que a guarda CONTA (o que saiu do navegador) ─────────────────────────
TABELAS_DA_AREA = {
    "calculos_energeticos", "registros_diarios", "refeicoes_concluidas", "metas", "metas_concluidas", "modelos_meta", "modelos_orientacao", "modelos_formula",
    "orientacoes", "formulas_manipuladas", "produtos", "indicacoes_produto", "alimentos", "medidas_caseiras", "receitas", "ingredientes_receita",
    "grupos_receita", "diario_alimentar", "formularios_preconsulta", "respostas_preconsulta", "planos_alimentares", "refeicoes", "itens_refeicao", "profiles",
}
RPCS_DA_AREA = {"planos_do_aluno", "plano_alimentar", "planos_favoritos", "grupos_alimentos", "receitas_da_nutricionista", "preconsulta_numeros",
                "respostas_da_conta", "painel_resumo"}
BUCKETS_DA_AREA = {"diario", "diario-staging"}
# as telas da Dieta passam pela casca do aluno (a 20b): o que ela levou ao servidor também NÃO pode voltar a ser lido direto aqui
TABELAS_DA_GUARDA = TABELAS_DA_AREA | P20B.TABELAS_DA_AREA
RPCS_DA_GUARDA = RPCS_DA_AREA | P20B.RPCS_DA_AREA
BUCKETS_DA_GUARDA = BUCKETS_DA_AREA | P20B.BUCKETS_DA_AREA
# FORA DA ÁREA (de outra W, lido direto, listado à parte — não é falha): o Dashboard lê os alunos (alunos_da_conta, alunos_novos_por_mes,
# pacientes — H-43), a agenda (agendamentos, agenda_tags — H-43) e o financeiro (financeiro_resumo_periodo, cobrancas, financeiro_recibos — 20d);
# a Pré-consulta, a equipe (equipe_da_conta — H-43); a casca do aluno, o que a 20b deixou de outra W (o acesso, os compromissos, o responsável)
FORA_RPCS = {"alunos_da_conta", "alunos_novos_por_mes", "financeiro_resumo_periodo", "financeiro_recibos", "financeiro_lancamentos", "equipe_da_conta",
             "aluno_compromissos", "aluno_responsavel", "aluno_acesso", "paciente_dado_livre", "mensagens_desligadas"}
FORA_TABELAS = {"pacientes", "agendamentos", "agenda_tags", "cobrancas", "transacoes", "recibos", "categorias_financeiras"}
# as gravações que já existem ao abrir (não são desta W): o padrão do 1º acesso (hml-19a/19b, padroes_garantir: Manipulados, Metas e
# Orientações — e o Prontuário) e o aluno_acesso da casca (H-43)
GRAVACOES_ACEITAS = {"fn:nutricao(padroes_garantir)", "rpc:aluno_acesso"}

B.AREAS["dieta"] = {"tabelas": TABELAS_DA_GUARDA, "rpcs": RPCS_DA_GUARDA, "buckets": BUCKETS_DA_GUARDA, "desvio": set()}


def fora_da_area(p: dict) -> str | None:
    """A leitura direta de OUTRA W (o Dashboard: H-43 e 20d; a Pré-consulta: a equipe; a casca: H-43) — listada à parte."""
    metodo, tipo, nome = p.get("metodo"), p.get("tipo"), p.get("nome")
    if tipo == "rpc" and metodo == "POST" and nome in FORA_RPCS:
        return f"rpc:{nome}"
    if tipo == "tab" and metodo in ("GET", "HEAD") and nome in FORA_TABELAS:
        return f"tab:{nome}"
    return None


def contar_dieta(pedidos: list[dict]) -> dict:
    """A guarda da área (o contar_tela da 20a, com as tabelas/RPCs/buckets da 20c e da casca da 20b) + as de fora da área e as gravações que
    já existem (o garantir e o aluno_acesso) separadas das novas (que têm de ser 0 ao abrir)."""
    c = B.contar_tela(pedidos, "dieta")
    fora: dict[str, int] = {}
    aceitas: dict[str, int] = {}
    novas: dict[str, int] = {}
    for p in pedidos:
        f = fora_da_area(p)
        if f:
            fora[f] = fora.get(f, 0) + 1
        g = P20B.gravacao_nomeada(p)
        if g:
            alvo = aceitas if g in GRAVACOES_ACEITAS else novas
            alvo[g] = alvo.get(g, 0) + 1
    c["fora"] = fora
    c["gravacoes_aceitas"] = aceitas
    c["gravacoes_novas"] = novas
    return c


# ───────────────────────── as telas ─────────────────────────
# (nome, rota (com {pac} = a matrícula), a marca de que a tela abriu, o teto de chamadas `ler` ao abrir — HIPÓTESE da etapa 1, a etapa 2
# mede e ajusta com o porquê): o Dashboard (o resumo, as respostas, o diário de hoje e o contador num lote; as miniaturas depois — a série
# listar → assinar) — teto 3; a Dieta ×8 (as 7 seções + o "Editar treino e dieta", o editor do plano em página própria); a 1ª tela da Dieta
# paga a casca do aluno (o perfil e a série: 1 lote desde o ec101ce) — teto 2; as Dietas ×3 (o Diário: a página e, depois, as miniaturas —
# teto 2); a Pré-consulta ×2. O contador do menu (preconsulta_novas, a casca) pode cair num `ler` a mais em qualquer tela quando vence.
# A ENTRADA é a lista de alunos (/painel/alunos — H-43, fora da área): o Dashboard é a 1ª tela medida, sem cache (pela navegação do app).
ENTRADA = "/painel/alunos"
SECOES_DIETA = (
    ("planejamento", "", "[data-secao-planejamento]", 2), ("acompanhamento", "?secao=acompanhamento", "[data-secao-acompanhamento]", 1),
    ("calculo-energetico", "?secao=calculo-energetico", "[data-secao-calculo-energetico]", 1), ("suplementos", "?secao=suplementos", "[data-secao-suplementos]", 1),
    ("manipulados", "?secao=manipulados", "[data-secao-manipulados]", 1), ("orientacoes", "?secao=orientacoes", "[data-secao-orientacoes]", 1),
    ("metas", "?secao=metas", "[data-secao-metas]", 1),
)
EDITAR = ("dieta_editar", "/painel/alunos/{pac}/editar", "[data-editores]", 2)
DIETAS = (
    ("dietas_alimentos", "/painel/dietas", "[data-pagina-alimentos]", 2), ("dietas_receitas", "/painel/dietas?aba=receitas", "[data-pagina-receitas]", 2),
    ("dietas_diario", "/painel/dietas?aba=diario", "[data-pagina-diario]", 2),
)
PRECONSULTA = (
    ("preconsulta_formularios", "/painel/pre-consulta", "[data-aba-formularios]", 1),
    ("preconsulta_respostas", "/painel/pre-consulta?aba=respostas", "[data-aba-respostas]", 1),
)
DASHBOARD = ("dashboard", "/painel", "[data-pagina-dashboard][data-modulos]", 3)


def telas_da_conta(conta: str) -> list[tuple[str, str, str, int]]:
    """As telas que cada conta abre, NA ORDEM (depois da ENTRADA): a nutri (e a nutri-legado, na produção) — o Dashboard, a Dieta ×8 da
    aluna, as Dietas ×3 e a Pré-consulta ×2; a personal — só o Dashboard (as outras telas da área são da nutricionista)."""
    if conta == PERSONAL:
        return [DASHBOARD]
    dieta = [(f"dieta_{s}", f"/painel/alunos/{{pac}}/dieta{suf}", m, teto) for s, suf, m, teto in SECOES_DIETA]
    return [DASHBOARD] + dieta + [EDITAR] + list(DIETAS) + list(PRECONSULTA)


def rota(tela_rota: str, pac: str) -> str:
    return tela_rota.replace("{pac}", pac)


# as seções que chamam o padroes_garantir ao abrir (hml-19b — GRAVA no 1º acesso): na produção só abrem se os padrões da conta já existem
SECOES_COM_PADRAO = {"dieta_manipulados": "modelos_formula", "dieta_metas": "modelos_meta", "dieta_orientacoes": "modelos_orientacao"}

# os seletores que o --seco confere no código (a tela que abriu, o erro e a foto grande)
SELETORES = {
    "src/painel/aluno/abas/Dieta.tsx": ["data-aba-dieta-aluno", "data-secao-dieta"],
    "src/nutricao/editor/secoes/Planejamento.tsx": ["data-secao-planejamento"],
    "src/nutricao/editor/secoes/Acompanhamento.tsx": ["data-secao-acompanhamento"],
    "src/nutricao/editor/secoes/CalculoEnergetico.tsx": ["data-secao-calculo-energetico", 'role="alert"'],
    "src/nutricao/editor/secoes/Suplementos.tsx": ["data-secao-suplementos"],
    "src/nutricao/editor/secoes/Manipulados.tsx": ["data-secao-manipulados"],
    "src/nutricao/editor/secoes/Orientacoes.tsx": ["data-secao-orientacoes"],
    "src/nutricao/editor/secoes/Metas.tsx": ["data-secao-metas"],
    "src/nutricao/editor/ui/EditorDieta.tsx": ["data-editor-dieta"],
    "src/painel/aluno/Editores.tsx": ["data-editores"],
    "src/painel/paginas/Dietas.tsx": ["data-pagina-dietas", "data-aba-dietas-botao"],
    "src/painel/dietas/Alimentos.tsx": ["data-pagina-alimentos"],
    "src/painel/dietas/Receitas.tsx": ["data-pagina-receitas"],
    "src/painel/dietas/Diario.tsx": ["data-pagina-diario", "data-registro={r.id}", "data-btn-ver-foto", "data-foto />"],
    "src/painel/dietas/VerFotoDiarioDialog.tsx": ["data-erro-ver-foto", "data-abrindo-foto", "data-modal-ver-foto-diario=", 'data-carregou={carregou ? "1" : "0"}',
                                                  "data-foto-grande"],
    "src/painel/paginas/PreConsulta.tsx": ["data-pagina-preconsulta-painel", "data-btn-novo-formulario>"],
    "src/painel/preconsulta/FormularioDialog.tsx": ["data-origem={o.valor}", "data-etapa-formulario={etapa}", "data-campo-titulo-formulario", "data-btn-salvar-formulario"],
    "src/nutricao/prontuario/ui/PerguntasEditor.tsx": ["data-campo-pergunta-texto={i}", "data-campo-pergunta-tipo={i}"],
    "src/painel/preconsulta/Formularios.tsx": ["data-aba-formularios", "data-lista-formularios", "data-formulario={f.id}", "data-formulario-titulo={f.titulo}",
                                               "data-formulario-slug={f.slug}", 'marca="data-btn-editar-formulario"', 'marca="data-btn-excluir-formulario"',
                                               "data-btn-confirmar-excluir-formulario"],
    "src/painel/preconsulta/Respostas.tsx": ["data-aba-respostas", "data-lista-respostas", "data-resposta={r.id}", 'data-resposta-aluno={r.paciente_id ?? ""}',
                                             "data-btn-ligar-resposta", 'marca="data-btn-desligar-resposta"', 'marca="data-btn-excluir-resposta"',
                                             "data-btn-confirmar-excluir-resposta"],
    "src/painel/preconsulta/LigarAlunoDialog.tsx": ['data-modal-ligar={resposta?.id ?? ""}', "data-btn-salvar-ligar"],
    "src/painel/alunos/SeletorDeAluno.tsx": ["data-seletor-aluno={campo}", "data-seletor-aluno-busca", "data-opcao-aluno={x.id}"],
    "src/painel/paginas/Dashboard.tsx": ["data-pagina-dashboard", "data-modulos="],
    "src/ui/casca/CascaWeb.tsx": ["data-casca={area}"],
}


# ───────────────────────── o P: o SQL FIXO do que a lib do 2436d0b lia (nunca montado do catálogo) ─────────────────────────
# A tabela/RPC, o filtro, o recorte, a ordem e o limite/página da lib de antes (git show 2436d0b:<lib>), com `select *` nas tabelas (o que o
# PostgREST devolvia; o teto de 1000 era o max_rows) e os embutidos montados à mão (o alimento com as medidas; a receita com os ingredientes e o
# alimento; o aluno do diário). {s} = o schema; {aluno} a matrícula; {uid} quem está logado; {conta} a conta ativa; os outros, os params.
_ALIMENTO_EMBUTIDO = ("(select jsonb_build_object('id', a.id, 'nome', a.nome, 'fonte', a.fonte, 'grupo', a.grupo, 'energia_kcal', a.energia_kcal, "
                      "'proteina_g', a.proteina_g, 'carboidrato_g', a.carboidrato_g, 'lipidio_g', a.lipidio_g, 'fibra_g', a.fibra_g, 'sodio_mg', a.sodio_mg, "
                      "'medidas_caseiras', coalesce((select jsonb_agg(to_jsonb(m)) from {s}.medidas_caseiras m where m.alimento_id = a.id), '[]'::jsonb)) "
                      "from {s}.alimentos a where a.id = i.alimento_id)")
_INGREDIENTES = ("coalesce((select jsonb_agg(to_jsonb(i) || jsonb_build_object('alimento', " + _ALIMENTO_EMBUTIDO + ")) "
                 "from {s}.ingredientes_receita i where i.receita_id = r.id), '[]'::jsonb) as ingredientes")
_MEDIDAS = "coalesce((select jsonb_agg(to_jsonb(m)) from {s}.medidas_caseiras m where m.alimento_id = a.id), '[]'::jsonb) as medidas_caseiras"
_PACIENTE = ("jsonb_build_object('id', p.id, 'nome', p.nome, 'apelido', p.apelido, 'link_codigo', p.link_codigo, 'foto_url', p.foto_url, "
             "'conta_id', p.conta_id, 'nutricionista_id', p.nutricionista_id) as paciente")
_RECORTE_P = "(p.conta_id = {conta} or (p.conta_id is null and p.nutricionista_id = {uid}))"
_RECORTE = "(conta_id = {conta} or (conta_id is null and nutricionista_id = {uid}))"
_DIARIO = ("select d.*, " + _PACIENTE + " from {s}.diario_alimentar d join {s}.pacientes p on p.id = d.paciente_id "
           "where d.deleted_at is null and d.data_hora >= {de} and " + _RECORTE_P)

SQL_DA_LIB: dict[str, tuple[str, str]] = {
    # Dieta › Plano (planos.ts:62/73/80) — as RPCs da hml-17
    "planos_do_aluno": ("nutricao/editor/lib/planos.ts:62", "select to_jsonb({s}.planos_do_aluno(p_aluno => {aluno})) as v"),
    "plano_alimentar": ("nutricao/editor/lib/planos.ts:80", "select to_jsonb({s}.plano_alimentar(p_plano => {plano})) as v"),
    "planos_favoritos": ("nutricao/editor/lib/planos.ts:73 (+ ferramentas/modelos/dados.ts:80: o filtro do dono e da conta)", "select to_jsonb({s}.planos_favoritos()) as v"),
    # Cálculo energético, Acompanhamento, os ✓
    "calculos_do_aluno": ("nutricao/editor/lib/calculosEnergeticos.ts:37-43",
                          "select * from {s}.calculos_energeticos where paciente_id = {aluno} and deleted_at is null order by data desc, created_at desc limit 1000"),
    "registros_diarios": ("nutricao/editor/lib/acompanhamento.ts:37-46",
                          "select * from {s}.registros_diarios where paciente_id = {aluno} and deleted_at is null and data >= {de} and data <= {ate} "
                          "order by data desc, created_at desc, id desc limit 1000"),
    "registros_do_dia": ("nutricao/editor/lib/acompanhamento.ts:57-62 (HEAD)",
                         "select count(*)::int as v from {s}.registros_diarios where paciente_id = {aluno} and data = {dia} and deleted_at is null"),
    "refeicoes_concluidas": ("nutricao/editor/lib/concluidas.ts:9-15",
                             "select refeicao_id, data from {s}.refeicoes_concluidas where paciente_id = {aluno} and data >= {de} and data <= {ate} order by data asc limit 1000"),
    "metas_concluidas": ("nutricao/editor/lib/metasConcluidas.ts:17-23",
                         "select meta_id, data from {s}.metas_concluidas where paciente_id = {aluno} and data >= {de} and data <= {ate} order by data asc limit 1000"),
    # Metas, Orientações, Manipulados, Suplementos (o do aluno; os modelos e o catálogo: o RLS decide)
    "metas_do_aluno": ("nutricao/editor/lib/metas.ts:77-82", "select * from {s}.metas where paciente_id = {aluno} and deleted_at is null order by created_at desc limit 1000"),
    "modelos_meta": ("nutricao/editor/lib/metas.ts:26-31", "select * from {s}.modelos_meta where deleted_at is null order by favorito desc, titulo asc limit 1000"),
    "modelos_orientacao": ("nutricao/editor/lib/orientacoes.ts:23-28", "select * from {s}.modelos_orientacao where deleted_at is null order by favorito desc, titulo asc limit 1000"),
    "modelos_formula": ("nutricao/editor/lib/manipulados.ts:29-34", "select * from {s}.modelos_formula where deleted_at is null order by favorito desc, titulo asc limit 1000"),
    "orientacoes_do_aluno": ("nutricao/editor/lib/orientacoes.ts:68-73", "select * from {s}.orientacoes where paciente_id = {aluno} and deleted_at is null order by created_at desc limit 1000"),
    "formulas_do_aluno": ("nutricao/editor/lib/manipulados.ts:82-88",
                          "select * from {s}.formulas_manipuladas where paciente_id = {aluno} and deleted_at is null order by prescrita_em desc, created_at desc limit 1000"),
    "produtos": ("nutricao/editor/lib/suplementos.ts:34-39", "select * from {s}.produtos where deleted_at is null order by favorito desc, nome asc limit 1000"),
    "indicacoes_do_aluno": ("nutricao/editor/lib/suplementos.ts:69-76",
                            "select * from {s}.indicacoes_produto where paciente_id = {aluno} and deleted_at is null order by ativa desc, ordem asc, created_at asc limit 1000"),
    # Dietas › Alimentos (o editor: montarConsulta + range — alimentos.ts:47-56; o painel: + o recorte "TACO ou os seus" e o id — alimentosPainel.ts:12-16)
    "alimentos_busca": ("nutricao/editor/lib/alimentos.ts:46-53,56 (a lista INTEIRA da busca: o P confere a página dentro dela)",
                        "select a.*, " + _MEDIDAS + " from {s}.alimentos a where a.deleted_at is null and a.busca ilike {palavra} order by a.busca asc, a.fonte asc"),
    "alimentos_busca:total": ("nutricao/editor/lib/alimentos.ts:47 (count exact)", "select count(*)::int as v from {s}.alimentos a where a.deleted_at is null and a.busca ilike {palavra}"),
    "alimentos_busca:painel": ("painel/dietas/alimentosPainel.ts:12-16",
                               "select a.*, " + _MEDIDAS + " from {s}.alimentos a where a.deleted_at is null and (a.fonte = 'taco' or a.nutricionista_id = {uid}) "
                               "order by a.busca asc, a.fonte asc, a.id asc offset 0 limit 20"),
    "alimentos_busca:painel:total": ("painel/dietas/alimentosPainel.ts:16 (count exact)",
                                     "select count(*)::int as v from {s}.alimentos a where a.deleted_at is null and (a.fonte = 'taco' or a.nutricionista_id = {uid})"),
    "grupos_alimentos": ("nutricao/editor/lib/alimentos.ts:68", "select coalesce(jsonb_agg(to_jsonb(g)), '[]'::jsonb) as v from {s}.grupos_alimentos() g"),
    # Dietas › Receitas (a RPC e a releitura pelos ids — receitas.ts:121/127; todas — :152; os nomes da cópia — :139-145; os grupos — :56-58)
    "receitas_pagina": ("nutricao/editor/lib/receitas.ts:121",
                        "select to_jsonb({s}.receitas_da_nutricionista(p_filtros => '{{}}'::jsonb, p_offset => 0, p_limite => 20)) as v"),
    "receitas_pagina:linhas": ("nutricao/editor/lib/receitas.ts:127",
                               "select r.*, " + _INGREDIENTES + " from {s}.receitas r where r.id = any({ids}) and r.deleted_at is null"),
    "receitas_todas": ("nutricao/editor/lib/receitas.ts:152", "select r.*, " + _INGREDIENTES + " from {s}.receitas r where r.deleted_at is null order by r.nome asc limit 1000"),
    "receita_nome": ("nutricao/editor/lib/receitas.ts:139-145",
                     "select nome from {s}.receitas where nutricionista_id = {uid} and deleted_at is null and nome ilike {prefixo} limit 1000"),
    "grupos_receita": ("nutricao/editor/lib/receitas.ts:56-58",
                       "select * from {s}.grupos_receita where deleted_at is null and nutricionista_id = {uid} order by ordem asc, nome asc limit 1000"),
    # Dietas › Diário e o "Diário de hoje" do Dashboard (diario.ts:51-64, :70-79, :134-142, :152-160, :180, :190)
    "diario_pagina": ("painel/dietas/diario.ts:51-64", _DIARIO + " order by d.data_hora desc, d.created_at desc, d.id desc offset 0 limit 20"),
    "diario_pagina:total": ("painel/dietas/diario.ts:53 (count exact)",
                            "select count(*)::int as v from {s}.diario_alimentar d join {s}.pacientes p on p.id = d.paciente_id where d.deleted_at is null "
                            "and d.data_hora >= {de} and " + _RECORTE_P),
    "diario_pagina:dia": ("painel/dietas/diario.ts:69-84,116-123 (HEAD do dia cortado: de e ate)",
                          "select count(*)::int as v from {s}.diario_alimentar d join {s}.pacientes p on p.id = d.paciente_id where d.deleted_at is null "
                          "and d.data_hora >= {de} and d.data_hora < {ate} and " + _RECORTE_P),
    "diario_contagem": ("painel/dietas/diario.ts:70-79 (HEAD, só não reagidas)",
                        "select count(*)::int as v from {s}.diario_alimentar d join {s}.pacientes p on p.id = d.paciente_id where d.deleted_at is null "
                        "and d.data_hora >= {de} and d.reacao_nutri is null and " + _RECORTE_P),
    "diario_alunos": ("painel/dietas/diario.ts:134-142",
                      "select p.id, p.nome, p.apelido, p.link_codigo, p.foto_url from {s}.pacientes p where " + _RECORTE_P + " and exists (select 1 from "
                      "{s}.diario_alimentar d where d.paciente_id = p.id and d.deleted_at is null and d.data_hora >= {de}) order by p.nome asc, p.id asc limit 1000"),
    "diario_hoje": ("painel/dietas/diario.ts:152-160", _DIARIO + " order by d.data_hora desc, d.created_at desc limit 1000"),
    "diario_urls": ("painel/dietas/diario.ts:187-190 (o path dos registros da lista)", "select id, path from {s}.diario_alimentar where id = any({ids}) and deleted_at is null"),
    "diario_foto_url": ("painel/dietas/diario.ts:179-180 (o path do registro)", "select id, path from {s}.diario_alimentar where id = {id} and deleted_at is null"),
    # Pré-consulta (preconsulta/dados.ts:61, :124, :139; novas.ts:23-28) e o Dashboard (dashboard/dados.ts:51, :94-101)
    "formularios_preconsulta": ("painel/preconsulta/dados.ts:61-62",
                                "select * from {s}.formularios_preconsulta where deleted_at is null and " + _RECORTE + " order by titulo asc limit 1000"),
    "preconsulta_numeros": ("painel/preconsulta/dados.ts:139",
                            "select to_jsonb({s}.preconsulta_numeros(p_conta => {conta}, p_inicio_mes => {inicio_mes})) as v"),
    "respostas_da_conta": ("painel/preconsulta/dados.ts:124-126",
                           "select to_jsonb({s}.respostas_da_conta(p_conta => {conta}, p_filtros => '{{}}'::jsonb, p_offset => 0, p_limite => 20)) as v"),
    "preconsulta_novas": ("painel/preconsulta/novas.ts:23-28 (HEAD)",
                          "select count(*)::int as v from {s}.respostas_preconsulta where deleted_at is null and paciente_id is null and " + _RECORTE),
    "painel_resumo": ("painel/dashboard/dados.ts:51", "select to_jsonb({s}.painel_resumo(p_conta => {conta})) as v"),
    "respostas_recentes": ("painel/dashboard/dados.ts:94-101",
                           "select id, nome, respondido_em, paciente_id from {s}.respostas_preconsulta where deleted_at is null and " + _RECORTE
                           + " and respondido_em >= {desde} order by respondido_em desc limit 10"),
}
# a ordem da lib de cada lista (as colunas que a função devolve — para o rank dos empates)
ORDEM_DA_LIB: dict[str, str] = {
    "calculos_do_aluno": "data desc, created_at desc", "registros_diarios": "data desc, created_at desc, id desc", "refeicoes_concluidas": "data asc",
    "metas_concluidas": "data asc", "metas_do_aluno": "created_at desc", "modelos_meta": "favorito desc, titulo asc", "modelos_orientacao": "favorito desc, titulo asc",
    "modelos_formula": "favorito desc, titulo asc", "orientacoes_do_aluno": "created_at desc", "formulas_do_aluno": "prescrita_em desc, created_at desc",
    "produtos": "favorito desc, nome asc", "indicacoes_do_aluno": "ativa desc, ordem asc, created_at asc", "alimentos_busca": "busca asc, fonte asc",
    "alimentos_busca:painel": "busca asc, fonte asc, id asc", "receitas_todas": "nome asc", "grupos_receita": "ordem asc, nome asc",
    "diario_pagina": "data_hora desc, created_at desc, id desc", "diario_hoje": "data_hora desc, created_at desc", "diario_alunos": "nome asc, id asc",
    "formularios_preconsulta": "titulo asc", "respostas_recentes": "respondido_em desc",
}
# as colunas que a TELA usa quando não é o Row inteiro: os recortes da lib (o select de hoje já era fechado)
COLUNAS_DA_TELA_FIXAS: dict[str, list[str]] = {
    "refeicoes_concluidas": ["refeicao_id", "data"], "metas_concluidas": ["meta_id", "data"], "receita_nome": ["nome"],
    "diario_alunos": ["id", "nome", "apelido", "link_codigo", "foto_url"], "respostas_recentes": ["id", "nome", "respondido_em", "paciente_id"],
    "diario_urls": ["id", "path"], "diario_foto_url": ["id", "path"],
}
TABELA_DA_CONSULTA: dict[str, str] = {
    "calculos_do_aluno": "calculos_energeticos", "registros_diarios": "registros_diarios", "metas_do_aluno": "metas", "modelos_meta": "modelos_meta",
    "modelos_orientacao": "modelos_orientacao", "modelos_formula": "modelos_formula", "orientacoes_do_aluno": "orientacoes", "formulas_do_aluno": "formulas_manipuladas",
    "produtos": "produtos", "indicacoes_do_aluno": "indicacoes_produto", "alimentos_busca": "alimentos", "receitas_todas": "receitas", "grupos_receita": "grupos_receita",
    "diario_pagina": "diario_alimentar", "diario_hoje": "diario_alimentar", "formularios_preconsulta": "formularios_preconsulta",
}


def _v(v: object) -> str:
    """Um valor citado (uuid conferido; texto citado; lista de uuids num array)."""
    if isinstance(v, list):
        return "array[" + ", ".join(C.txt(C.uuid_ok(x)) for x in v) + "]::uuid[]"
    return C.txt(str(v))


def sql_da_lib(chave: str, s: str, **valores: object) -> str:
    """O SQL fixo da lib de antes, com os valores (uuid conferido; o resto citado)."""
    _origem, modelo = SQL_DA_LIB[chave]
    campos = {k: (_v(C.uuid_ok(str(v))) if k in ("aluno", "uid", "conta", "plano", "id") else _v(v)) for k, v in valores.items()}
    for falta in re.findall(r"\{([a-z_]+)\}", modelo):
        campos.setdefault(falta, "null")
    campos["s"] = s
    return modelo.format(**campos)


def sql_com_ordem(sql: str, ordem: str | None) -> str:
    """O SQL fixo de uma lista com o nº da linha (_n) e o rank da ordem da lib (_r: os empatados têm o mesmo), num jsonb só."""
    o = ordem or "1"
    return (f"select coalesce(jsonb_agg(jsonb_build_object('n', x._n, 'r', x._r, 'linha', to_jsonb(x) - '_n' - '_r') order by x._n), '[]'::jsonb) as v from ("
            f"select t.*, row_number() over (order by {o}) as _n, dense_rank() over (order by {o}) as _r from ({sql}) t) x")


def _canon(v: object) -> str:
    return json.dumps(v, sort_keys=True, ensure_ascii=False, separators=(",", ":"))


def _chave_do_item(x: object) -> str:
    """A ordem dos itens de um embutido (lista) para comparar como CONJUNTO: pelo id (ou pelo JSON, sem id)."""
    return ("0" + str(x.get("id"))) if isinstance(x, dict) and "id" in x else ("1" + _canon(x))


def em_conjunto(v: object) -> object:
    """O valor com as listas (os embutidos) ordenadas pelo id — a ordem do embed do PostgREST não é a da lib (a tela ordena: as medidas,
    os ingredientes)."""
    if isinstance(v, dict):
        return {k: em_conjunto(x) for k, x in v.items()}
    if isinstance(v, list):
        return [em_conjunto(x) for x in sorted(v, key=_chave_do_item)]
    return v


def projetar(fn_v: object, lib_v: object) -> object:
    """O valor da lib no formato do da função: nos objetos, só as chaves que a função devolve (a que falta na lib fica marcada — difere);
    nas listas, item a item depois de ordenar os 2 lados pelo id (o `*` da lib traz colunas que a tela não usa; quem confere as chaves de
    cada embutido é o colunas_dos_embutidos)."""
    if isinstance(fn_v, dict) and isinstance(lib_v, dict):
        return {k: (projetar(v, lib_v[k]) if k in lib_v else {"__falta_na_lib__": True}) for k, v in fn_v.items()}
    if isinstance(fn_v, list) and isinstance(lib_v, list):
        a, b = sorted(fn_v, key=_chave_do_item), sorted(lib_v, key=_chave_do_item)
        if len(a) != len(b):
            return {"__tamanho_na_lib__": len(b)}
        return [projetar(x, y) for x, y in zip(a, b)]
    return lib_v


def igual_a_lib(fn_v: object, lib_v: object) -> bool:
    return _canon(em_conjunto(fn_v)) == _canon(em_conjunto(projetar(fn_v, lib_v)))


def _linhas_e_ranks(sql: list) -> tuple[list, list]:
    if sql and isinstance(sql[0], dict) and "linha" in sql[0]:
        return [x["linha"] for x in sql], [x.get("r", 0) for x in sql]
    return list(sql), [0] * len(sql)


def comparar_com_a_lib(fn_linhas: list, sql: list, chave_id: str | None = "id", *, ordem: bool = True, janela: tuple[int, int] | None = None,
                       ignorar: tuple[str, ...] = ("url",)) -> tuple[bool, str]:
    """As linhas da função × as do SQL fixo da lib: os mesmos ids (sem id: o mesmo multiconjunto de linhas) na ordem da lib (os empatados
    em qualquer ordem; ordem=False: só o conjunto — a releitura pelos ids) e, coluna a coluna, os valores (os embutidos como conjuntos e
    só com as chaves que a função devolve; a `url` fica de fora). janela=(offset, limite): o SQL é a lista INTEIRA da lib e a função
    devolve a página — os ranks da função = os da fatia [offset, offset+limite) da lib (um empate na borda aceita qualquer escolha)."""
    lib, ranks = _linhas_e_ranks(sql)
    fn = [{k: v for k, v in x.items() if k not in ignorar} for x in fn_linhas]
    esperado = len(lib) if janela is None else max(0, min(janela[1], len(lib) - janela[0]))
    if len(fn) != esperado:
        return False, f"{len(fn)} linha(s) × {esperado} na lib"
    if chave_id is None:
        restam: dict[str, list[int]] = {}
        for li, r in zip(lib, ranks):
            restam.setdefault(_canon(li), []).append(r)
        r_fn = []
        for x in fn:
            c = _canon({k: x[k] for k in x})
            if not restam.get(c):
                return False, "uma linha da função não está na lib"
            r_fn.append(restam[c].pop())
        if ordem and any(b < a for a, b in zip(r_fn, r_fn[1:])):
            return False, "fora da ordem da lib"
        return True, f"{len(fn)} linha(s) iguais às da lib (sem id: o multiconjunto{', na ordem' if ordem else ''})"
    por_id = {li.get(chave_id): (li, r) for li, r in zip(lib, ranks)}
    ids_fn = [x.get(chave_id) for x in fn]
    if len(set(map(str, ids_fn))) != len(ids_fn) or any(i not in por_id for i in ids_fn):
        return False, "ids diferentes dos da lib"
    r_fn = [por_id[i][1] for i in ids_fn]
    if janela is None:
        if len(por_id) != len(lib):
            return False, "ids repetidos na lib"
    elif sorted(r_fn) != sorted(ranks[janela[0]:janela[0] + janela[1]]):
        return False, "a página não é a fatia da lib"
    if ordem and any(b < a for a, b in zip(r_fn, r_fn[1:])):
        return False, "fora da ordem da lib"
    for x in fn:
        li = por_id[x.get(chave_id)][0]
        for col, v in x.items():
            if col not in li:
                return False, f"a coluna {col} não existe na lib"
            if not igual_a_lib(v, li[col]):
                return False, f"a coluna {col} difere da lib"
    return True, f"{len(fn)} linha(s), mesmos ids{' e ordem' if ordem else ''}, {len(fn[0]) if fn else 0} coluna(s) iguais"


def colunas_da_tela(q: str) -> list[str]:
    """As colunas que a tela usa na consulta: o recorte da lib ou o Row inteiro da tabela (as listas)."""
    if q in COLUNAS_DA_TELA_FIXAS:
        return COLUNAS_DA_TELA_FIXAS[q]
    return P20B.colunas_do_tipo(TABELA_DA_CONSULTA[q])


# as chaves de cada embutido que a tela usa (o select de hoje: as medidas = o Row; o ingrediente = o Row + o alimento; o alimento do
# ingrediente = as 10 do ALIMENTO_EMBUTIDO + as medidas; o aluno do diário = as 7 do SELECT_NUTRI)
ALIMENTO_DO_INGREDIENTE = ["id", "nome", "fonte", "grupo", "energia_kcal", "proteina_g", "carboidrato_g", "lipidio_g", "fibra_g", "sodio_mg", "medidas_caseiras"]
PACIENTE_DO_DIARIO = ["id", "nome", "apelido", "link_codigo", "foto_url", "conta_id", "nutricionista_id"]


def embutidos_da_tela(q: str) -> dict[str, list[str]]:
    """O caminho de cada embutido da consulta → as chaves que a tela usa."""
    medidas = P20B.colunas_do_tipo("medidas_caseiras")
    if q == "alimentos_busca":
        return {"medidas_caseiras": medidas}
    if q in ("receitas_todas", "receitas_pagina"):
        return {"ingredientes": P20B.colunas_do_tipo("ingredientes_receita") + ["alimento"], "ingredientes.alimento": ALIMENTO_DO_INGREDIENTE,
                "ingredientes.alimento.medidas_caseiras": medidas}
    if q in ("diario_pagina", "diario_hoje"):
        return {"paciente": PACIENTE_DO_DIARIO}
    return {}


def objetos_no_caminho(linhas: list, caminho: str) -> list[dict]:
    """Os objetos embutidos num caminho (a.b.c), atravessando as listas."""
    atuais: list = list(linhas)
    for parte in caminho.split("."):
        prox: list = []
        for o in atuais:
            v = o.get(parte) if isinstance(o, dict) else None
            prox.extend(v if isinstance(v, list) else [v] if isinstance(v, dict) else [])
        atuais = prox
    return [o for o in atuais if isinstance(o, dict)]


def conferir_embutidos(q: str, linhas: list) -> tuple[bool, str]:
    """As chaves de cada embutido = as que a tela usa (nem a mais, nem a menos)."""
    partes = []
    for caminho, esperadas in embutidos_da_tela(q).items():
        objs = objetos_no_caminho(linhas, caminho)
        ruins = [sorted(set(o) ^ set(esperadas)) for o in objs if set(o) != set(esperadas)]
        if ruins:
            return False, f"{caminho}: chaves diferentes das da tela ({ruins[0][:4]})"
        partes.append(f"{caminho} {len(objs)}")
    return True, ", ".join(partes) or "sem embutido"


def filtrar_favoritos(valor: object, uid: str, conta: str) -> object:
    """O filtro de antes da Ferramentas › Modelos (ferramentas/modelos/dados.ts:80, no 2436d0b): os ★ do dono (quem chama) e da conta."""
    if not isinstance(valor, list):
        return valor
    return [p for p in valor if isinstance(p, dict) and p.get("nutricionista_id") == uid and (p.get("paciente") or {}).get("conta_id") == conta]


# ───────────────────────── os inícios de dia LOCAIS do período (o diasDoPeriodo da lib; aqui no fuso de São Paulo, −3 h) ─────────────────────────
def dias_do_periodo(de_iso: str, dias_depois: int = 2) -> list[str]:
    """O 1º é o início do período e os outros, cada meia-noite de São Paulo seguinte, até a de depois de amanhã (o teto de 100)."""
    import datetime as dt  # noqa: PLC0415
    inicio = dt.datetime.fromisoformat(de_iso.replace("Z", "+00:00"))
    sp = dt.timezone(dt.timedelta(hours=-3))
    agora = dt.datetime.now(sp)
    fim = dt.datetime(agora.year, agora.month, agora.day, tzinfo=sp) + dt.timedelta(days=dias_depois)
    local = inicio.astimezone(sp)
    base = dt.datetime(local.year, local.month, local.day, tzinfo=sp)
    saida = [inicio.astimezone(dt.timezone.utc).isoformat().replace("+00:00", "Z")]
    k = 1
    while len(saida) < 100:
        d = base + dt.timedelta(days=k)
        saida.append(d.astimezone(dt.timezone.utc).isoformat().replace("+00:00", "Z"))
        if d >= fim:
            break
        k += 1
    return saida


def inicio_do_periodo(dias: int) -> str:
    """A meia-noite de São Paulo de hoje − (dias − 1) (o inicioDoPeriodo da tela, no fuso da tela de teste), em ISO."""
    import datetime as dt  # noqa: PLC0415
    sp = dt.timezone(dt.timedelta(hours=-3))
    agora = dt.datetime.now(sp)
    d = dt.datetime(agora.year, agora.month, agora.day, tzinfo=sp) - dt.timedelta(days=max(1, dias) - 1)
    return d.astimezone(dt.timezone.utc).isoformat().replace("+00:00", "Z")


def inicio_do_mes() -> str:
    """O 1º instante do mês em São Paulo (o inicioMes da Pré-consulta, no fuso da tela de teste), em ISO."""
    import datetime as dt  # noqa: PLC0415
    sp = dt.timezone(dt.timedelta(hours=-3))
    agora = dt.datetime.now(sp)
    return dt.datetime(agora.year, agora.month, 1, tzinfo=sp).astimezone(dt.timezone.utc).isoformat().replace("+00:00", "Z")


def _instante(iso: str) -> float:
    import datetime as dt  # noqa: PLC0415
    return dt.datetime.fromisoformat(iso.replace("Z", "+00:00")).timestamp()


def janelas_dos_dias(linhas: list, pagina: int, por_pagina: int, total: int, dias: list[str], de: str) -> list[dict]:
    """Os dias que a página partiu ao meio (o diasQuePodemContinuar da lib do 2436d0b — diario.ts:95-104): o da 1ª linha, se a página
    não é a 1ª; o da última, se há linhas depois — cada um a janela [max(início do dia, de), início do dia seguinte), com os inícios de
    dia de São Paulo (os `dias` da tela). O P conta cada janela no SQL da lib (diario_pagina:total com o fim)."""
    if not linhas or not dias:
        return []
    tempos = [_instante(d) for d in dias]
    inicio = _instante(de)

    def janela(linha: dict) -> dict | None:
        t = _instante(str(linha.get("data_hora")))
        k = max((i for i, x in enumerate(tempos) if x <= t), default=-1)
        if k < 0 or k + 1 >= len(tempos):
            return None
        return {"dia": dias[k], "de": dias[k] if tempos[k] >= inicio else de, "ate": dias[k + 1]}

    saida: list[dict] = []
    if pagina > 1:
        j = janela(linhas[0])
        if j:
            saida.append(j)
    if (pagina - 1) * por_pagina + len(linhas) < total:
        j = janela(linhas[-1])
        if j and not any(x["dia"] == j["dia"] for x in saida):
            saida.append(j)
    return saida


# ───────────────────────── a massa e a limpeza (só staging; só contagem na conferência) ─────────────────────────
def versao_dos_textos() -> str:
    """A versão dos textos legais (o consentimento que o formulário público manda — src/publico/legal/versao.ts)."""
    m = re.search(r'VERSAO_TEXTOS\s*=\s*"(\d{4}-\d{2}-\d{2})"', (B.REPO / "src" / "publico" / "legal" / "versao.ts").read_text(encoding="utf-8"))
    if not m:
        raise SystemExit("VERSAO_TEXTOS não achada em src/publico/legal/versao.ts")
    return m.group(1)


def formulario_de_teste(rodada: str, conta: str) -> dict:
    """O formulário de Pré-consulta da rodada (o corpo do criar, como a tela manda — a pergunta no formato do preconsultaUtil.ts:69): 1
    pergunta de texto, sem faixas, ativo, o título com a marca."""
    return {"conta_id": conta, "titulo": f"{B.MARCA} {rodada} formulário", "descricao": f"{B.MARCA} {rodada}", "origem": "personalizado", "origem_id": None,
            "perguntas": [{"id": "p1", "texto": "Como você dorme?", "tipo": "texto", "max": 4, "pontos_sim": 1, "opcoes": []}], "faixas": [], "ativo": True}


def responder_como_anonimo(slug: str, rodada: str, origem: str = "api") -> tuple[int, str | None]:
    """A resposta pelo formulário público /f/:slug, como ANÔNIMO (a RPC preconsulta_responder de hoje, com o consentimento que a página manda
    — o VERSAO_TEXTOS do front, como o e2e/w21): o nome com a marca da rodada; o e-mail de teste. → (status, o id da resposta)."""
    st, r = B.B17.rpc(None, "preconsulta_responder", {"p_slug": slug, "p_nome": f"{B.MARCA} {rodada} resposta {origem}",
                                                      "p_email": f"hml20.e2e.{rodada}.{origem}.teste.claude@physiqnutri.app", "p_telefone": "",
                                                      "p_respostas": {"p1": "bem"}, "p_consentimento": versao_dos_textos()})
    rid = r.get("id") if isinstance(r, dict) else None
    return st, (str(rid) if C.eh_uuid(rid) else None)


def anotar(estado, tabela: str, id_: object) -> None:
    """Uma linha da massa no Estado (o e2e_estado.json), na lista `linhas` que o --limpar desta área apaga pelos ids. O Estado.linha da
    hml-19 só aceita as tabelas DELA (o Prontuário, a Dieta, a Avaliação) e IGNORA em silêncio as da Pré-consulta — foi assim que a 1ª
    rodada da etapa 2 (13:53) deixou o formulário e a resposta dela no staging (achados pela conferência por SQL e apagados pelos ids)."""
    if tabela in TABELAS_DA_MASSA and C.eh_uuid(id_) and [tabela, id_] not in estado.d["linhas"]:
        estado.d["linhas"].append([tabela, id_])
        estado.salvar()


def criar_foto_do_diario(o, estado, token_aluna: str, pac: str, rodada: str) -> dict | None:
    """1 foto no diário da aluna, como o app faz (a ação da hml-19b: preparar → PUT → enviar; o comentário com a marca)."""
    import datetime as dt  # noqa: PLC0415
    s = B.schema()
    mat = B.ler_principal(f"select nutricionista_id::text as n, coalesce(link_codigo, '') as c from {s}.pacientes where id = {C.txt(pac)}")[0]
    nutri, codigo = C.uuid_ok(mat["n"]), str(mat["c"])
    png = B.png_sintetico()
    pedido = {"paciente_id": pac, "nutricionista_id": nutri, "tipo": "image/png", "tamanho": len(png)}
    st, link, _h, _ms = B.B19.funcao(token_aluna, "aluno_diario_preparar", pedido)
    caminho = str(link.get("caminho") or "")
    if not o.ok(st == 200 and link.get("bucket") == B.bucket_do_diario(s) and caminho.startswith(f"{nutri}/{pac}/") and link.get("token") and codigo,
                f"massa: o link do diário da aluna (a pasta da matrícula) ({st} {link.get('erro')})"):
        return None
    estado.objeto(link["bucket"], caminho)
    st_put = B.subir_no_link(link["bucket"], caminho, link["token"], png, "image/png", token_aluna)
    agora = dt.datetime.now(dt.timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")
    st, r, _h, _ms = B.B19.funcao(token_aluna, "aluno_diario_enviar", {**pedido, "caminho": caminho, "codigo": codigo, "refeicao": "almoco",
                                                                         "comentario": f"{B.MARCA} {rodada} diario", "data_hora": agora})
    reg = (r.get("registro") or {}).get("id")
    if C.eh_uuid(reg):
        anotar(estado, "diario_alimentar", reg)
    if not o.ok(st_put in (200, 201) and st == 200 and C.eh_uuid(reg), f"massa: 1 foto no diário da aluna (o PUT {st_put}; o registro {st} {r.get('erro')})"):
        return None
    return {"id": reg, "path": caminho, "bytes": len(png), "bucket": link["bucket"]}


def sql_contar_marca(s: str, rodada: str | None = None) -> str:
    """Só contagem (SQL só leitura): as linhas com a marca da rodada no diário (o comentário) e na Pré-consulta (o título do formulário, o nome
    da resposta) — vivas e na Lixeira."""
    marca = f"%{B.MARCA}%{rodada}%" if rodada else f"%{B.MARCA}%"
    m = C.txt(marca)
    return (f"select (select count(*) from {s}.diario_alimentar where comentario like {m})::int as diario_alimentar, "
            f"(select count(*) from {s}.formularios_preconsulta where titulo like {m})::int as formularios_preconsulta, "
            f"(select count(*) from {s}.respostas_preconsulta where nome like {m})::int as respostas_preconsulta")


def sql_contar_objetos(s: str, caminhos: list[str]) -> str:
    """Só contagem: os arquivos da rodada no bucket do diário (os caminhos anotados no Estado)."""
    nomes = ", ".join(C.txt(c) for c in caminhos) or "''"
    return f"select count(*)::int as n from storage.objects where bucket_id = {C.txt(B.bucket_do_diario(s))} and name = any(array[{nomes}]::text[])"


TABELAS_DA_MASSA = ("diario_alimentar", "formularios_preconsulta", "respostas_preconsulta")


def sql_apagar(s: str, tabela: str, ids: list[str], *, paciente: str | None = None) -> str:
    """O DELETE das linhas da rodada (só no staging, só os ids ANOTADOS no e2e_estado.json): o diário, também só da matrícula da aluna de
    TESTE; o formulário e a resposta da Pré-consulta, pelos ids (revisão ⚪8 — não pelo dono: o formulário que a outra conta criasse por
    engano no N negativo também sai, e só o que a rodada anotou)."""
    if s != "staging":
        raise SystemExit("a massa só existe no staging — nada a apagar em outro schema")
    if tabela not in TABELAS_DA_MASSA:
        raise SystemExit(f"a massa da 20c não tem a tabela {tabela}")
    validos = [i for i in ids if C.eh_uuid(i)]
    if not validos:
        raise SystemExit("nenhum id da rodada para apagar")
    quem = ""
    if tabela == "diario_alimentar":
        if not paciente:
            raise SystemExit("o diário só se apaga com a matrícula da aluna de teste")
        quem = f"paciente_id = {C.txt(C.uuid_ok(paciente))} and "
    return f"delete from {s}.{tabela} where {quem}id = any(array[{', '.join(C.txt(i) for i in validos)}]::uuid[])"


def limpar_massa(o, estado, L, s: str) -> None:
    """Desfaz a massa da rodada e confere por SQL só leitura (só contagem): pela função (como a nutri: diario_excluir — a linha à Lixeira e o
    arquivo —, preconsulta_resposta_excluir e _formulario_excluir — a Lixeira), o DELETE das linhas da rodada (staging, só os ids), o que
    sobrar no Storage e a conferência (0 linha com a marca; 0 arquivo da rodada)."""
    if estado.vazio():
        o.ok(True, "limpeza: nada pendente no estado")
        estado.apagar()
        return
    if (estado.d.get("area") or "") != AREA_ESTADO:
        o.ok(False, f"a rodada pendente é de outra área ({estado.d.get('area')}): rode o --limpar dela", parar=True)
    tn = L.token(NUTRI)
    por: dict[str, list[str]] = {}
    for tabela, id_ in estado.d["linhas"]:
        por.setdefault(tabela, []).append(id_)
    for id_ in por.get("diario_alimentar", []):
        B.B19.funcao(tn, "diario_excluir", {"id": id_})
    for id_ in por.get("respostas_preconsulta", []):
        B.B19.funcao(tn, "preconsulta_resposta_excluir", {"id": id_})
    for id_ in por.get("formularios_preconsulta", []):
        B.B19.funcao(tn, "preconsulta_formulario_excluir", {"id": id_})
    for bucket in sorted({b for b, _c in estado.d["storage"]}):
        caminhos = [c for b, c in estado.d["storage"] if b == bucket]
        st, n = B.remover_do_storage(bucket, caminhos, tn)
        o.ok(st == 200, f"limpeza: {len(caminhos)} arquivo(s) do {bucket} como a nutri dona da pasta ({st}, {n})")
    estado.d["storage_rodada"] = estado.d["storage"]
    estado.d["storage"] = []
    estado.salvar()
    pac = estado.d.get("pac") or ""
    if por.get("diario_alimentar") and C.eh_uuid(pac):
        C.C2.sql_principal(sql_apagar(s, "diario_alimentar", por["diario_alimentar"], paciente=pac))
    for tabela in ("respostas_preconsulta", "formularios_preconsulta"):
        if por.get(tabela):
            C.C2.sql_principal(sql_apagar(s, tabela, por[tabela]))
    rodada = estado.d.get("rodada")
    sobra = B.ler_principal(sql_contar_marca(s, rodada))[0] if rodada else {}
    o.ok(bool(rodada) and not any(sobra.values()), f"limpeza conferida (SQL só leitura): 0 linha com a marca da rodada no diário e na Pré-consulta ({sobra})")
    todos = [c for _b, c in estado.d.get("storage_rodada") or []]
    objs = B.ler_principal(sql_contar_objetos(s, todos))[0]["n"] if todos else 0
    o.ok(objs == 0, f"limpeza conferida: 0 arquivo da rodada no bucket do diário ({objs})")
    estado.apagar()


# ───────────────────────── o "antes" da spec (rede_por_tela.tsv) para as telas da 20c ─────────────────────────
def antes_da_spec_dieta() -> dict[tuple[str, str], float | None]:
    """O t_pronto medido pela spec (aquecido, pela navegação do app) por (conta, rota) — as rotas da Dieta com :id no lugar da matrícula."""
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
        r = str(c.get("rota", ""))
        if c.get("conta") in (NUTRI, PERSONAL) and (r.startswith("/painel/alunos/:id/dieta") or r.startswith(("/painel/dietas", "/painel/pre-consulta")) or r == "/painel"):
            try:
                saida[(c["conta"], r)] = float(c.get("t_pronto_s", ""))
            except ValueError:
                saida[(c["conta"], r)] = None
    return saida


def rota_da_spec(tela_rota: str) -> str:
    """A rota da tela no formato da planilha da spec (/painel/alunos/:id…)."""
    return tela_rota.replace("{pac}", ":id")


ARQUIVO = Path(__file__).name
