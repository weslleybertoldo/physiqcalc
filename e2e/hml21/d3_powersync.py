#!/usr/bin/env python3
"""Physiq hml-21e (H-43 · o fechamento da etapa 3, 14/10/2026) — o D3 do PowerSync POR EFEITO (spec hml-21 §2.8 item 3; contrato da 21e,
decisão C): a GRAVAÇÃO das 15 tabelas que a fila do PowerSync grava, provada pelo REST do Treino do jeito que a fila faz
(src/lib/powersync/connector.ts:66-121 — PUT = POST com Prefer resolution=merge-duplicates, o upsert com o id da linha; PATCH = update
pelo id; DELETE = delete pelo id; 1 pedido por linha), pelo domínio do app (https://api.physiqcalc.com.br — o VITE_SUPABASE_URL do
.env.local do staging) com os cabeçalhos do cliente do Treino (src/integrations/supabase/client.ts:15-20: a chave publicável do Treino, o
Bearer da sessão do Treino, o x-schema e o Accept-Profile/Content-Profile = staging — o molde do e2e/w23/api.py:27-32). O staging não tem
PowerSync (src/lib/powersync/instancia.ts:11-16): a fila grava pelo REST — é ESSE o caminho que o D3 prova. Só o schema staging do Treino.
  · Contas (TESTE): A = w5p-aluna × P = w5p-personal (o professor dela); a sessão do Treino pela MESMA troca do app (trocar-token: o
    Sessoes.sessao_treino do e2e/hml19/_base.py — o login do principal + a troca = 2 linhas no registro de logins por conta, 4 no total),
    com o exige_identidade da 21d ANTES (a conta já existe no Treino: a troca não cria conta nova); no fim, o logout scope=local SÓ das 4
    sessões desta execução (as outras sessões das contas — a LINUX 3 usa as mesmas — ficam).
  · A massa: a linha MÍNIMA por tabela (as colunas NOT NULL sem default + o id que a fila manda, gerado aqui como a fila), SÓ no schema
    staging do Treino, SÓ das 2 contas, com a marca "hml21 e2e <rodada>" nas tabelas com texto e a data SENTINELA 2000-03-NN nas de data
    (uma por conta e por caso: as chaves únicas nunca se encontram); cada id e o dono anotados no Estado (hml19/agente/e2e_estado.json, a
    chave "hml21e") ANTES do pedido; criada e apagada pelo dono. Ordem: os pais primeiro (tb_academias, tb_grupos_treino_usuario,
    tb_exercicios_usuario — a massa deles vive até o fim), depois os filhos e o resto; a limpeza ao contrário (o CASCADE cobre o resto).
  · Os casos, nas 2 direções (A × P e P × A): (a) o dono lê a sua pelo id → 1 (controle) e a da outra → 0; (b) o PATCH da outra com o
    valor de AGORA (lido antes por SQL só leitura) → 0 linha e a linha IGUAL (md5), o DELETE da outra → 0 e a linha viva, o PATCH do dono
    → 1 (controle; o treino_historico não tem policy de UPDATE: 0, o esperado); (c) o PUT da fila com um id NOVO e o user_id da outra →
    403 42501 e 0 linha criada; (c′) o PUT da fila com o id da linha da OUTRA e o próprio user_id (o ON CONFLICT DO UPDATE da fila) → 403
    42501 e a linha da outra igual. physiq_profiles (a fila só grava o foto_url — src/app-aluno/abas/Treino.tsx:109: sem POST/DELETE):
    (a), (b) com o foto_url de agora e (d) o professor lê/atualiza o perfil da aluna DELE → 1/1 e igual; o da w7b-sozinho (sem
    professor) e o do aluno de TESTE da w13-dono (de outro professor) → 0/0 e iguais.
  · Cuidados (o contrato): todo PATCH "da outra" grava o MESMO valor que já está; DELETE "da outra" só em linha de massa; ANTES de
    qualquer login (a revisão da etapa 1), a pré-condição por SQL só leitura: os 2 ids do Treino (o login do principal → o
    physiq_identidades), o e-mail de teste no Auth do Treino, os perfis, o professor da aluna, o acesso do personal, os papéis, os alvos
    (d) e 0 sobra — falhou → para sem login; depois da troca, o sub do token tem de ser esse id. E o catálogo das 15 contra o RETRATO congelado aqui (RLS ligado sem FORCE, S/I/U/D do
    authenticated, 0 SELECT do anon, as policies, os gatilhos — só os 2 da physiq_profiles —, as colunas obrigatórias): mudou numa
    tabela → ela vira "por catálogo" (sem massa; o porquê no placar); um caso que passa quando não devia = ALERTA (🔴 no placar; o D3
    segue as outras tabelas e limpa tudo — nada se corrige aqui); /health dos 2 projetos no começo e a cada 5 tabelas (ruim → PARA de
    mandar pedido, nem a limpeza nem o logout: o Estado guarda a massa para o --limpar); pedidos em série, 1 por vez, ~2 s entre as
    tabelas (--pausa-s); o SQL de conferência em lote (2 consultas por tabela: o ANTES e o DEPOIS; um 429 da Management API numa leitura
    ou no /health → 60 s e repete 1 vez; numa gravação do --limpar → confere o estado por leitura antes de repetir). Na saída, das falhas,
    só o tipo da exceção e o status/código (nunca a mensagem: a da API pode ecoar o SQL).
Uso: python3 e2e/hml21/d3_powersync.py --seco                       (o plano dos pedidos, os controles e as travas — NADA vai à rede)
     python3 e2e/hml21/d3_powersync.py [--tabelas a,b] [--pausa-s 2]  (o staging do Treino: etapa 2, UMA vez, com a PAUSA e o /health antes)
     python3 e2e/hml21/d3_powersync.py --limpar                       (desfaz pelo Estado: como o dono pelo REST; sem sessão, por SQL com trava)
     python3 e2e/hml21/d3_powersync.py --sair                         (o logout scope=local das sessões das 2 contas que ficaram guardadas)
Só o staging do Treino: não há opção de produção (um --base/--schema diferente de staging sai com erro antes de qualquer rede).
Saídas: hml21/agente/d3_powersync_{seco,staging,staging_tabelas,limpar,sair}.txt, a planilha hml21/medicao/d3_powersync.tsv (tabela × caso × direção ×
esperado × obtido × ms) e a linha do e2e-rodadas.tsv. Só status, códigos, contagens, booleanos e ms — nunca ids, valores, e-mails ou corpos.
"""
from __future__ import annotations

import argparse
import ast
import base64
import contextlib
import datetime as dt
import inspect
import io
import json
import os
import re
import subprocess
import sys
import time
import urllib.request
import uuid
from dataclasses import dataclass
from pathlib import Path
from urllib.parse import urlparse

sys.dont_write_bytecode = True
sys.path.insert(0, str(Path(__file__).resolve().parent))
import _base as B  # noqa: E402

C, B5, B19 = B.C, B.B5, B.B19

# ───────────────────────── o alvo: SÓ o schema staging do Treino (a trava de ambiente — decisão L) ─────────────────────────
S = "staging"
TREINO_REF = "uxwpwdbbnlticxgtzcsb"
PRINCIPAL_REF = "hkxvtsbwctxkrqzkkdoz"
API_T = "https://api.physiqcalc.com.br"  # o domínio do app (o VITE_SUPABASE_URL do .env.local do staging)
URL_LOGOUT = {"principal": f"{C.PRINCIPAL_URL}/auth/v1/logout?scope=local", "treino": f"{C.TREINO_URL}/auth/v1/logout?scope=local"}
MARCA = B.MARCA  # "hml21 e2e"
CHAVE = B.CHAVE_21E  # "hml21e": a chave da massa do D3 no Estado
PLANILHA = B.MEDICAO / "d3_powersync.tsv"

A, P = "A", "P"
CONTAS = {A: "w5p-aluna", P: "w5p-personal"}
OUTRO = {A: P, P: A}
SOZINHO = "w7b-sozinho"  # o alvo (d) sem professor
DONO_W13 = "w13-dono"    # o professor de outra conta: o alvo (d) é um aluno de TESTE dele
EMAIL = {c: B5.CONTAS[c][0].lower() for c in (*CONTAS.values(), SOZINHO, DONO_W13)}
SUFIXO_TESTE = "%.teste.claude@physiqnutri.app"

# ───────────────────────── as 15 tabelas da fila e o RETRATO do catálogo (congelado aqui) ─────────────────────────
# Retrato lido no staging do Treino em 14/10/2026 04:17–04:40 pelo redator do contrato da 21e (SQL só leitura: hml21/tmp/redator21e/
# r1_colunas, r4_policies, r5_gatilhos, r19_rls). A pré-condição da execução de verdade confere o catálogo VIVO contra ele.
RETRATO_DE = "14/10/2026 04:17–04:40"
ORDEM = ("tb_academias", "tb_grupos_treino_usuario", "tb_exercicios_usuario",  # os pais (5, 12, 11): a massa deles vive até o fim
         "tb_treino_series", "tb_treino_concluido", "tb_treino_dia_override", "treino_historico", "tb_academia_pesos",
         "tb_series_padrao_usuario", "exercicio_ordem_usuario", "exercicio_substituicao_usuario", "tb_exercicio_comentarios",
         "tb_grupos_exercicios_usuario", "tb_semana_treinos",
         "physiq_profiles")  # a 15ª: só o PATCH do foto_url (a fila não faz POST/DELETE nela)
TABELAS = frozenset(ORDEM)
DA_FILA = tuple(t for t in ORDEM if t != "physiq_profiles")  # as 14 com massa
PAIS = ("tb_academias", "tb_grupos_treino_usuario", "tb_exercicios_usuario")
PAI_DE = {"tb_academia_pesos": "tb_academias", "tb_series_padrao_usuario": "tb_grupos_treino_usuario",
          "tb_grupos_exercicios_usuario": "tb_grupos_treino_usuario"}

COLUNAS = {
    "exercicio_ordem_usuario": ("id", "user_id", "grupo_id", "exercicio_id", "posicao", "updated_at"),
    "exercicio_substituicao_usuario": ("id", "user_id", "grupo_id", "slot_idx", "exercicio_origem_id", "exercicio_novo_id",
                                       "exercicio_novo_usuario_id", "data_treino", "created_at", "updated_at"),
    "physiq_profiles": ("id", "nome", "email", "foto_url", "sexo", "idade", "peso", "altura", "dobra_1", "dobra_2", "dobra_3",
                        "percentual_gordura", "massa_gorda", "massa_magra", "tmb_mifflin", "tmb_katch", "tmb_metodo", "nivel_atividade",
                        "ajuste_calorico", "macro_proteina_multiplicador", "macro_gordura_percentual", "admin_locked", "plano_nome",
                        "plano_expiracao", "user_code", "status", "created_at", "medida_pescoco", "medida_ombro", "medida_peitoral",
                        "medida_cintura", "medida_abdomen", "medida_quadril", "medida_braco_d", "medida_braco_e", "medida_antebraco_d",
                        "medida_antebraco_e", "medida_coxa_d", "medida_coxa_e", "medida_panturrilha_d", "medida_panturrilha_e",
                        "tempo_descanso_segundos", "data_nascimento", "mensalidade_valor", "cobranca_pausada", "professor_id", "series_modo",
                        "series_padrao_qtd", "series_travadas", "metodo_avaliacao", "dobra_4", "dobra_5", "dobra_6", "dobra_7",
                        "massa_muscular", "agua_corporal", "gordura_visceral", "tmb_balanca", "conta_id", "proxima_avaliacao",
                        "proxima_troca_treino"),
    "tb_academia_pesos": ("id", "user_id", "academia_id", "exercicio_id", "exercicio_usuario_id", "numero_serie", "peso", "updated_at"),
    "tb_academias": ("id", "user_id", "nome", "created_at", "equipamentos"),
    "tb_exercicio_comentarios": ("id", "user_id", "exercicio_id", "exercicio_usuario_id", "comentario", "created_at", "updated_at"),
    "tb_exercicios_usuario": ("id", "user_id", "nome", "grupo_muscular", "emoji", "created_at", "updated_at", "tipo", "padrao_movimento",
                              "equipamento", "variacao"),
    "tb_grupos_exercicios_usuario": ("id", "user_id", "grupo_usuario_id", "exercicio_id", "exercicio_usuario_id", "ordem"),
    "tb_grupos_treino_usuario": ("id", "user_id", "nome", "created_at", "updated_at"),
    "tb_semana_treinos": ("id", "dia_semana", "grupo_id", "updated_at", "user_id", "grupo_usuario_id", "slot_idx", "extra",
                          "extra_atrelado_grupo_id", "extra_atrelado_grupo_usuario_id"),
    "tb_series_padrao_usuario": ("id", "user_id", "grupo_id", "grupo_usuario_id", "num_series", "updated_at", "exercicio_id",
                                 "exercicio_usuario_id", "reps_alvo", "descanso_segundos", "carga_sugerida_kg", "observacao"),
    "tb_treino_concluido": ("id", "user_id", "data_treino", "concluido", "created_at", "slot_idx"),
    "tb_treino_dia_override": ("id", "user_id", "data_treino", "grupo_id", "created_at", "grupo_usuario_id", "slot_idx"),
    "tb_treino_series": ("id", "user_id", "exercicio_id", "data_treino", "numero_serie", "peso", "reps", "created_at", "updated_at",
                         "exercicio_usuario_id", "concluida", "tempo_segundos", "distancia_km", "pace_segundos_km", "slot_idx",
                         "academia_nome"),
    "treino_historico": ("id", "user_id", "nome_treino", "iniciado_em", "concluido_em", "duracao_segundos", "exercicios_concluidos",
                         "created_at"),
}
# as NOT NULL sem default (o id tem default nas 14: a fila manda o dela)
OBRIGATORIAS = {
    "exercicio_ordem_usuario": ("user_id", "grupo_id", "exercicio_id", "posicao"),
    "exercicio_substituicao_usuario": ("user_id", "grupo_id", "exercicio_origem_id"),
    "physiq_profiles": ("id",),
    "tb_academia_pesos": ("user_id", "academia_id", "numero_serie"),
    "tb_academias": ("user_id", "nome"),
    "tb_exercicio_comentarios": ("user_id", "comentario"),
    "tb_exercicios_usuario": ("user_id", "nome", "grupo_muscular"),
    "tb_grupos_exercicios_usuario": ("user_id",),
    "tb_grupos_treino_usuario": ("user_id", "nome"),
    "tb_semana_treinos": ("dia_semana",),
    "tb_series_padrao_usuario": ("user_id",),
    "tb_treino_concluido": ("user_id", "data_treino"),
    "tb_treino_dia_override": ("user_id", "data_treino"),
    "tb_treino_series": ("user_id", "data_treino", "numero_serie"),
    "treino_historico": ("user_id", "nome_treino", "iniciado_em", "concluido_em", "duracao_segundos"),
}
_DONO = "(auth.uid() = user_id)"
_ADMIN = "(((auth.jwt() -> 'app_metadata'::text) ->> 'role'::text) = 'admin'::text)"
_STAFF = "(staging.physiq_is_staff() AND (professor_id = auth.uid()))"
# (policyname, cmd, roles, using, with_check), na ordem do nome
POLICIES = {
    "exercicio_ordem_usuario": (("Users manage own exercise order", "ALL", "{authenticated}", _DONO, _DONO),),
    "exercicio_substituicao_usuario": (("Users manage own exercise substitution", "ALL", "{public}", _DONO, _DONO),),
    "physiq_profiles": (
        ("Master gerencia perfis", "ALL", "{authenticated}", "staging.physiq_is_master()", "staging.physiq_is_master()"),
        ("Professor atualiza seus alunos", "UPDATE", "{authenticated}", _STAFF,
         "(staging.physiq_is_staff() AND (professor_id = auth.uid()) AND staging.physiq_professor_acesso_ok(auth.uid()))"),
        ("Professor le seus alunos", "SELECT", "{authenticated}", _STAFF, ""),
        ("Users insert own profile", "INSERT", "{authenticated}", "", "(auth.uid() = id)"),
        ("Users read own profile", "SELECT", "{authenticated}", "(auth.uid() = id)", ""),
        ("Users update own profile", "UPDATE", "{authenticated}", "(auth.uid() = id)", ""),
    ),
    "tb_academia_pesos": (("Usuario gerencia seus pesos por academia", "ALL", "{authenticated}", _DONO, _DONO),),
    "tb_academias": (("Usuario gerencia suas academias", "ALL", "{authenticated}", _DONO, _DONO),),
    "tb_exercicio_comentarios": (("Usuario acessa seus comentarios", "ALL", "{public}", _DONO, _DONO),),
    "tb_exercicios_usuario": (("Usuario acessa seus exercicios", "ALL", "{authenticated}", _DONO, _DONO),),
    "tb_grupos_exercicios_usuario": (("Usuario acessa seus vinculos", "ALL", "{authenticated}", _DONO, _DONO),),
    "tb_grupos_treino_usuario": (("Usuario acessa seus grupos", "ALL", "{authenticated}", _DONO, _DONO),),
    "tb_semana_treinos": (("Usuario acessa propria semana", "ALL", "{authenticated}", _DONO, _DONO),),
    "tb_series_padrao_usuario": (("Usuario gerencia suas series padrao", "ALL", "{authenticated}", _DONO, _DONO),
                                 ("admin_all_series_padrao", "ALL", "{authenticated}", _ADMIN, _ADMIN)),
    "tb_treino_concluido": (("Usuario acessa proprios concluidos", "ALL", "{authenticated}", _DONO, ""),),
    "tb_treino_dia_override": (("Usuario atualiza proprio override", "UPDATE", "{authenticated}", _DONO, _DONO),
                               ("Usuario deleta proprio override", "DELETE", "{authenticated}", _DONO, ""),
                               ("Usuario insere proprio override", "INSERT", "{authenticated}", "", _DONO),
                               ("Usuario le proprios overrides", "SELECT", "{authenticated}", _DONO, "")),
    "tb_treino_series": (("Usuario acessa proprias series", "ALL", "{authenticated}", _DONO, ""),),
    "treino_historico": (("Usuario deleta seus treinos", "DELETE", "{authenticated}", _DONO, ""),
                         ("Usuario insere seus treinos", "INSERT", "{authenticated}", "", _DONO),
                         ("Usuario ve seus treinos", "SELECT", "{authenticated}", _DONO, "")),
}
# os gatilhos (fora os internos): só os 2 da physiq_profiles — o guard (BEFORE UPDATE: devolve professor_id/conta_id e, no próprio, as
# colunas de controle; nada fora da linha) e o user_code (BEFORE INSERT; o D3 não insere perfil). Nenhuma das 15 mexe fora da linha:
# a lista do cuidado 1 (gatilho com efeito fora da linha → sem massa) é VAZIA hoje.
GATILHOS = {"physiq_profiles": ("physiq_profiles_guard_trg", "set_physiq_user_code")}

# ───────────────────────── a linha mínima, a marca, a sentinela e o que cada caso muda ─────────────────────────
SENTINELA = "2000-03-"  # a data de teste (0 linha antes de 2001 nas tabelas com data, 14/10 04:23)
# o dia da sentinela por (caso, quem MANDA): na mesma conta (o user_id do corpo), massa, (c) e (c′) nunca se encontram
DIA = {("massa", A): 1, ("massa", P): 2, ("c", A): 3, ("c", P): 4, ("c2", A): 5, ("c2", P): 6}
NUMERO = {"massa": 1, "c": 2, "c2": 3}  # o numero_serie dos pesos por academia (a chave única pede)
SLOT = {"c": 1, "c2": 2}                # o slot_idx da semana no (c)/(c′) (a massa fica no 0 do default)
COLUNA_PATCH = {"tb_treino_series": "academia_nome", "tb_treino_concluido": "concluido", "tb_treino_dia_override": "slot_idx",
                "treino_historico": "nome_treino", "tb_academias": "nome", "tb_academia_pesos": "peso",
                "tb_series_padrao_usuario": "observacao", "exercicio_ordem_usuario": "posicao", "exercicio_substituicao_usuario": "grupo_id",
                "tb_exercicio_comentarios": "comentario", "tb_exercicios_usuario": "nome", "tb_grupos_treino_usuario": "nome",
                "tb_grupos_exercicios_usuario": "ordem", "tb_semana_treinos": "extra", "physiq_profiles": "foto_url"}
COLUNA_MARCA = {"tb_treino_series": "academia_nome", "treino_historico": "nome_treino", "tb_academias": "nome",
                "tb_series_padrao_usuario": "observacao", "exercicio_ordem_usuario": "grupo_id", "exercicio_substituicao_usuario": "grupo_id",
                "tb_exercicio_comentarios": "comentario", "tb_exercicios_usuario": "nome", "tb_grupos_treino_usuario": "nome",
                "tb_semana_treinos": "dia_semana"}
COLUNA_DATA = {"tb_treino_series": ("data_treino",), "tb_treino_concluido": ("data_treino",), "tb_treino_dia_override": ("data_treino",),
               "treino_historico": ("iniciado_em", "concluido_em"), "exercicio_substituicao_usuario": ("data_treino",)}
COLUNA_PAI = {"tb_academia_pesos": "academia_id", "tb_series_padrao_usuario": "grupo_usuario_id", "tb_grupos_exercicios_usuario": "grupo_usuario_id"}
# o que só a massa do D3 tem (a marca ou a sentinela; nas 2 sem texto nem data, o pai com a marca) — a conferência e a trava do --limpar
COND = {
    "tb_academias": "nome like '%hml21 e2e%'",
    "tb_grupos_treino_usuario": "nome like '%hml21 e2e%'",
    "tb_exercicios_usuario": "nome like '%hml21 e2e%'",
    "tb_treino_series": "academia_nome like '%hml21 e2e%' or data_treino < '2001-01-01'",
    "tb_treino_concluido": "data_treino < '2001-01-01'",
    "tb_treino_dia_override": "data_treino < '2001-01-01'",
    "treino_historico": "nome_treino like '%hml21 e2e%' or iniciado_em < '2001-01-01'",
    "tb_academia_pesos": "academia_id in (select a.id from staging.tb_academias a where a.nome like '%hml21 e2e%')",
    "tb_series_padrao_usuario": "observacao like '%hml21 e2e%'",
    "exercicio_ordem_usuario": "grupo_id like '%hml21 e2e%'",
    "exercicio_substituicao_usuario": "grupo_id like '%hml21 e2e%' or data_treino < '2001-01-01'",
    "tb_exercicio_comentarios": "comentario like '%hml21 e2e%'",
    "tb_grupos_exercicios_usuario": "grupo_usuario_id in (select g.id from staging.tb_grupos_treino_usuario g where g.nome like '%hml21 e2e%')",
    "tb_semana_treinos": "dia_semana like '%hml21 e2e%'",
}
CASO_TXT = {"massa": "massa", "a": "(a)", "b": "(b)", "c": "(c)", "c2": "(c′)", "limpeza": "limpeza", "d": "(d)", "sql": "SQL"}


class ParouSaude(Exception):
    """O /health ruim no meio: nenhum pedido a mais (nem a limpeza nem o logout) — o Estado guarda a massa para o --limpar."""


def motivo(e: BaseException) -> str:
    """O que sai de uma falha: SÓ o tipo da exceção e o status/código (o HTTP, o status do sqlrw ou o código das travas daqui) — nunca a
    mensagem inteira (a da Management API pode ecoar o SQL, com ids)."""
    texto = str(e)
    cod = re.search(r"\b(trava_[a-z]+)\b", texto) or re.search(r"\b(?:HTTP|status)\s+(\d{3})\b", texto)
    return type(e).__name__ + (f" ({cod.group(1)})" if cod else "")


# ───────────────────────── as travas (sem rede: o --seco prova cada uma) ─────────────────────────
_ESCRITA = re.compile(r"(?i)\b(insert|update|delete|truncate|alter|drop|create|grant|revoke|copy|merge|call|vacuum|refresh)\b\s")
_UUID = r"'[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'"
_DONOS_RX = rf"array\[{_UUID}(?:, {_UUID})?\]::uuid\[\]"
_IDS_RX = rf"array\[(?:{_UUID}(?:, {_UUID})*)?\]::uuid\[\]"
_RE_DELETE = {t: re.compile(rf"\s*delete from staging\.{t} where user_id = any\({_DONOS_RX}\) and \(id = any\({_IDS_RX}\) or "
                            rf"\({re.escape(COND[t])}\)\);\s*") for t in DA_FILA}


def exigir_alvo(base: str = S, schema: str = S, ref: str = TREINO_REF, api: str = API_T) -> None:
    """A trava de ambiente (decisão L): só o schema staging do Treino, pelo domínio do app — qualquer outro alvo sai ANTES da rede."""
    if base != "staging" or schema != "staging" or ref != "uxwpwdbbnlticxgtzcsb" or urlparse(api).hostname != "api.physiqcalc.com.br":
        raise SystemExit("trava_alvo: o D3 só roda no schema staging do Treino (api.physiqcalc.com.br) — recusado antes de qualquer rede")


def trava_pedido(p: Pedido) -> None:
    """Cada pedido ao REST: só as 15 tabelas, só o que a fila faz, a resposta pedida com select=id, a physiq_profiles sem POST/DELETE."""
    if p.tabela not in TABELAS or "public" in p.tabela or "public" in p.consulta:
        raise SystemExit("trava_pedido: tabela fora das 15 da fila — recusado")
    if p.metodo not in ("GET", "POST", "PATCH", "DELETE") or "select=id" not in p.consulta.split("&"):
        raise SystemExit("trava_pedido: pedido fora do que a fila faz (ou sem select=id) — recusado")
    if p.tabela == "physiq_profiles" and p.metodo in ("POST", "DELETE"):
        raise SystemExit("trava_pedido: a physiq_profiles só recebe o PATCH do foto_url — recusado")
    if p.metodo in ("PATCH", "DELETE", "GET") and not re.fullmatch(r"id=eq\.[0-9a-f-]{36}&select=id", p.consulta):
        raise SystemExit("trava_pedido: PATCH/DELETE/GET só por 1 id — recusado")


def trava_leitura(sql: str) -> None:
    """O SQL de leitura: 1 instrução, nenhuma palavra de escrita fora de texto entre aspas, nenhum public."""
    sem_texto = re.sub(r"'[^']*'", "''", sql)
    if _ESCRITA.search(sem_texto) or re.search(r"(?i)\bpublic\s*\.", sql) or sem_texto.strip().rstrip(";").count(";"):
        raise SystemExit("trava_leitura: SQL de leitura com palavra de escrita, public. ou mais de 1 instrução — recusado")


def trava_escrita(sql: str) -> str:
    """A ÚNICA escrita (o --limpar sem sessão): o DELETE da massa de 1 das 14 — SÓ staging, SÓ os 2 donos, SÓ os ids do Estado ou a
    marca/a sentinela (o molde do _RE_DELETE_21D do treinos21d.py). Devolve a tabela; qualquer outra coisa é recusada antes de sair."""
    if re.search(r"(?i)\bpublic\s*\.", sql) or sql.count(";") != 1:
        raise SystemExit("trava_escrita: escrita fora do combinado — recusado")
    for t, rx in _RE_DELETE.items():
        if rx.fullmatch(sql):
            return t
    raise SystemExit("trava_escrita: só o DELETE da massa do D3 (staging do Treino, os 2 donos, os ids/a marca) — recusado")


# ───────────────────────── o pedido (como a fila manda) ─────────────────────────
@dataclass
class Pedido:
    tabela: str
    caso: str               # massa | a | b | c | c2 | limpeza | d
    direcao: str            # "A" (o dono, na sua) · "A×P" (A na linha de P) · "P×sozinho"…
    quem: str               # A | P — o token que manda
    metodo: str
    consulta: str
    corpo: dict | None
    esperado: tuple         # ("linhas", status, n) | ("recusa", 403, "42501")
    nega: bool              # um caso NA LINHA DE OUTRA pessoa: passar = ALERTA
    rotulo: str
    alvo_id: str | None     # o id da linha (no Estado/no plano; nunca impresso)

    @property
    def prefer(self) -> str | None:
        """O Prefer da fila (o upsert manda resolution=merge-duplicates) + o return=representation (contar as linhas; o corpo não sai)."""
        return {"POST": "resolution=merge-duplicates,return=representation", "PATCH": "return=representation",
                "DELETE": "return=representation"}.get(self.metodo)


def cabecalhos(p: Pedido, token: str, chave: str) -> dict:
    """Os cabeçalhos do cliente do Treino (client.ts:15-20 + o postgrest-js: Accept-Profile no GET, Content-Profile no resto)."""
    cab = {"apikey": chave, "Authorization": f"Bearer {token}", "x-schema": S}
    cab["Accept-Profile" if p.metodo == "GET" else "Content-Profile"] = S
    if p.prefer:
        cab["Prefer"] = p.prefer
    return cab


def esperado_txt(e: tuple) -> str:
    return f"{e[1]}·{e[2]} linha" if e[0] == "linhas" else f"{e[1]}·{e[2]}"


def classificar(p: Pedido, st: object, r: object) -> tuple[str, str]:
    """→ (ok | alerta | falha, o obtido). ALERTA = um caso na linha de outra pessoa que PASSOU (linhas > 0 ou um 2xx onde era 403)."""
    n = len(r) if isinstance(r, list) else None
    code = str(r.get("code")) if isinstance(r, dict) and r.get("code") is not None else None
    obtido = f"{st}·{n} linha" if n is not None else f"{st}·{code or '—'}"
    tipo, st_esp, x = p.esperado
    passou = isinstance(st, int) and 200 <= st < 300
    if tipo == "linhas":
        if st == st_esp and n == x:
            return "ok", obtido
        return ("alerta" if p.nega and passou and (n or 0) > 0 else "falha"), obtido
    if st == st_esp and code == x:
        return "ok", obtido
    return ("alerta" if p.nega and passou else "falha"), obtido


# ───────────────────────── o SQL (só leitura, em lote: o ANTES e o DEPOIS por tabela) ─────────────────────────
def _json(v: object) -> object:
    """Um jsonb da Management API (lista/objeto; se vier como texto, decodificado)."""
    if isinstance(v, str):
        try:
            return json.loads(v)
        except json.JSONDecodeError:
            return v
    return v


def lista_uuid(ids, vazia: bool = False) -> str:
    validos = [C.uuid_ok(x) for x in ids]
    if not validos and not vazia:
        raise C.Parou("lista de ids vazia")
    return "array[" + ", ".join(C.txt(x) for x in validos) + "]::uuid[]"


def sql_catalogo() -> str:
    """O catálogo vivo das 15 (só leitura): RLS/FORCE, os grants do authenticated e do anon, as policies, os gatilhos, as colunas."""
    nomes = ", ".join(C.txt(t) for t in ORDEM)
    return ("select c.relname::text as tabela, c.relrowsecurity as rls, c.relforcerowsecurity as force_rls, "
            "(has_table_privilege('authenticated', c.oid, 'SELECT') and has_table_privilege('authenticated', c.oid, 'INSERT') "
            "and has_table_privilege('authenticated', c.oid, 'UPDATE') and has_table_privilege('authenticated', c.oid, 'DELETE')) as siud, "
            "has_table_privilege('anon', c.oid, 'SELECT') as anon_select, "
            "(select coalesce(jsonb_agg(jsonb_build_array(p.policyname, p.cmd, p.roles::text, coalesce(p.qual, ''), coalesce(p.with_check, '')) "
            "order by p.policyname), '[]'::jsonb) from pg_policies p where p.schemaname = 'staging' and p.tablename = c.relname) as policies, "
            "(select coalesce(jsonb_agg(t.tgname::text order by t.tgname), '[]'::jsonb) from pg_trigger t where t.tgrelid = c.oid "
            "and not t.tgisinternal) as gatilhos, "
            "(select coalesce(jsonb_agg(a.attname::text order by a.attnum), '[]'::jsonb) from pg_attribute a where a.attrelid = c.oid "
            "and a.attnum > 0 and not a.attisdropped) as colunas, "
            "(select coalesce(jsonb_agg(a.attname::text order by a.attnum), '[]'::jsonb) from pg_attribute a where a.attrelid = c.oid "
            "and a.attnum > 0 and not a.attisdropped and a.attnotnull and a.attidentity = '' and a.attgenerated = '' "
            "and not exists (select 1 from pg_attrdef d where d.adrelid = a.attrelid and d.adnum = a.attnum)) as obrigatorias "
            "from pg_class c join pg_namespace n on n.oid = c.relnamespace "
            f"where n.nspname = 'staging' and c.relkind = 'r' and c.relname in ({nomes}) order by 1")


def sql_exercicios() -> str:
    """2 exercícios GLOBAIS (professor_id nulo): a série de teste e as 2 séries padrão do (c)/(c′)."""
    return "select e.id::text as id from staging.tb_exercicios e where e.professor_id is null order by e.id limit 2"


def sql_sobras(donos: list[str]) -> str:
    """Quantas linhas das 2 contas têm a marca/a sentinela em cada uma das 14 (o começo pede 0; a limpeza deixa 0)."""
    d = lista_uuid(donos)
    return "jsonb_build_object(" + ", ".join(
        f"{C.txt(t)}, (select count(*) from staging.{t} where user_id = any({d}) and ({COND[t]}))" for t in DA_FILA) + ")"


def sql_uid_principal(conta: str) -> str:
    """O id do login do principal da conta de TESTE (o mesmo SQL do B.uid_da_conta; nada sai na tela)."""
    if not C.eh_email_de_teste(EMAIL[conta]):
        raise SystemExit("trava_conta: não é conta de teste")
    return f"select id::text as id from auth.users where lower(email) = {C.txt(EMAIL[conta])}"


def sql_identidades(uid_principal: str) -> str:
    """As identidades do Treino desse login (o physiq_identidades: principal → Treino) — a do exige_identidade da 21d; tem de ser 1."""
    return f"select treino_user_id::text as id from staging.physiq_identidades where principal_user_id = {C.txt(C.uuid_ok(uid_principal))}"


def sql_comeco(sub_a: str, sub_p: str) -> str:
    """A pré-condição das contas (só leitura, ANTES de qualquer login): o e-mail das 2 no Auth do Treino (= o de teste), os 2 perfis, o
    professor da aluna, o acesso do personal, o papel no auth.users, os 2 alvos (d) de TESTE (os e-mails ficam na memória, para conferir
    — nunca na saída) e 0 sobra nas 14."""
    a, p = C.txt(C.uuid_ok(sub_a)), C.txt(C.uuid_ok(sub_p))
    return (f"select coalesce((select lower(u.email) from auth.users u where u.id = {a}), '') as email_a, "
            f"coalesce((select lower(u.email) from auth.users u where u.id = {p}), '') as email_p, "
            f"(select count(*) from staging.physiq_profiles x where x.id = {a})::int as perfil_a, "
            f"(select count(*) from staging.physiq_profiles x where x.id = {p})::int as perfil_p, "
            f"coalesce((select x.professor_id = {p}::uuid from staging.physiq_profiles x where x.id = {a}), false) as professor_eh_o_personal, "
            # o corpo do staging.physiq_professor_acesso_ok (o papel só leitura da Management API não tem EXECUTE nela — EXPLAIN de 14/10)
            "coalesce((select pr.status = 'ativo' and pr.nucleo_acesso_ate is not null and pr.nucleo_acesso_ate >= "
            f"(now() at time zone 'America/Sao_Paulo')::date from staging.physiq_professores pr where pr.id = {p}), false) as acesso_ok, "
            f"coalesce((select u.raw_app_meta_data ->> 'role' from auth.users u where u.id = {a}), '') as papel_a, "
            f"coalesce((select u.raw_app_meta_data ->> 'role' from auth.users u where u.id = {p}), '') as papel_p, "
            "(select coalesce(jsonb_agg(jsonb_build_object('id', x.id::text, 'email', lower(u.email), 'sem_professor', x.professor_id is null) "
            "order by x.id), '[]'::jsonb) from staging.physiq_profiles x join auth.users u on u.id = x.id "
            f"where lower(u.email) = {C.txt(EMAIL[SOZINHO])}) as sozinho, "
            "(select coalesce(jsonb_agg(jsonb_build_object('id', x.id::text, 'email', lower(u.email)) order by x.id), '[]'::jsonb) "
            "from staging.physiq_profiles x join auth.users u on u.id = x.id "
            f"where x.professor_id = (select w.id from auth.users w where lower(w.email) = {C.txt(EMAIL[DONO_W13])}) "
            f"and lower(u.email) like {C.txt(SUFIXO_TESTE)}) as w13_alunos, "
            f"{sql_sobras([sub_a, sub_p])} as sobras")


def sql_perfis(ids: list[str]) -> str:
    """O md5 da linha e o foto_url de agora dos perfis (o foto_url fica na memória — o PATCH grava o MESMO valor; nunca no log)."""
    return (f"select x.id::text as id, md5(x::text) as h, x.foto_url as foto from staging.physiq_profiles x where x.id = any({lista_uuid(ids)}) "
            "order by 1")


def sql_antes(t: str, ids: list[str]) -> str:
    """O ANTES de uma tabela (1 consulta): o md5 das 2 linhas de massa e o valor de AGORA da coluna do PATCH (na memória)."""
    return (f"select x.id::text as id, md5(x::text) as h, to_jsonb(x) -> {C.txt(COLUNA_PATCH[t])} as v from staging.{t} x "
            f"where x.id = any({lista_uuid(ids)}) order by 1")


def sql_depois(t: str, massa: list[str], ids_c: list[str], donos: list[str]) -> str:
    """O DEPOIS de uma tabela (1 consulta): o md5 das 2 linhas de massa, as linhas do (c) criadas (0) e as linhas com a marca/a
    sentinela das 2 contas (2 = só a massa)."""
    return (f"select (select coalesce(jsonb_object_agg(x.id::text, md5(x::text)), '{{}}'::jsonb) from staging.{t} x "
            f"where x.id = any({lista_uuid(massa)})) as massa, "
            f"(select count(*) from staging.{t} x where x.id = any({lista_uuid(ids_c)}))::int as criadas_c, "
            f"(select count(*) from staging.{t} where user_id = any({lista_uuid(donos)}) and ({COND[t]}))::int as n_marca")


def sql_fim(donos: list[str], perfis: list[str]) -> str:
    """A conferência da limpeza (1 consulta): 0 linha da massa nas 14 e o md5 dos 4 perfis (iguais ao começo)."""
    return (f"select {sql_sobras(donos)} as sobras, (select coalesce(jsonb_object_agg(x.id::text, md5(x::text)), '{{}}'::jsonb) "
            f"from staging.physiq_profiles x where x.id = any({lista_uuid(perfis)})) as perfis")


def sql_sessoes(ids: list[str], desde: str) -> str:
    """As sessões das 2 contas abertas desde o começo desta execução (só contagem)."""
    return f"select count(*)::int as n from auth.sessions s where s.user_id = any({lista_uuid(ids)}) and s.created_at >= {C.txt(desde)}::timestamptz"


def sql_apagar(t: str, donos: list[str], ids: list[str]) -> str:
    """O DELETE da massa de 1 tabela (o --limpar sem sessão): SÓ staging, SÓ os 2 donos, os ids do Estado OU a marca/a sentinela."""
    if t not in DA_FILA:
        raise SystemExit("trava_escrita: tabela fora das 14 com massa — recusado")
    return (f"delete from staging.{t} where user_id = any({lista_uuid(donos)}) and (id = any({lista_uuid(ids, vazia=True)}) "
            f"or ({COND[t]}));")


def saude_com_429(ler, esperar) -> tuple[bool, dict]:
    """O /health dos 2 projetos (o B19.saude: {"http": 429} quando a Management API recusa por ritmo): um 429 NÃO é saúde ruim — espera
    60 s e repete 1 vez (decisão K); o que vier depois vale."""
    ok, estados = ler()
    if not ok and any(isinstance(v, dict) and v.get("http") == 429 for v in (estados or {}).values()):
        esperar(60)
        ok, estados = ler()
    return ok, estados


def ler_mgmt(ref: str, rotulo: str, sql: str) -> list[dict]:
    """SQL SÓ LEITURA pela Management API (read_only: o Postgres recusa qualquer escrita); 429 → 60 s e repete 1 vez (decisão K)."""
    trava_leitura(sql)
    for tentativa in (1, 2):
        st, r, _h = B5.http("POST", f"https://api.supabase.com/v1/projects/{ref}/database/query", {"query": sql, "read_only": True},
                            {"Authorization": f"Bearer {C.C2.pat()}"}, timeout=180)
        if st == 429 and tentativa == 1:
            print(f"   (429 da Management API na leitura {rotulo}: 60 s e repete 1 vez)", flush=True)
            time.sleep(60)
            continue
        if st not in (200, 201):
            raise RuntimeError(f"SQL só leitura ({rotulo}) → HTTP {st}")
        return r if isinstance(r, list) else []
    return []


# ───────────────────────── o transporte de verdade (etapa 2): o REST do Treino, a Management API só leitura, o Auth ─────────────────────────
def logout_local(token: str, banco: str) -> int:
    """O logout SÓ desta sessão (o escopo local) — as outras sessões da conta ficam."""
    chave = B5.anon(PRINCIPAL_REF if banco == "principal" else TREINO_REF)
    st, _r, _h = B5.http("POST", URL_LOGOUT[banco], {}, {"apikey": chave, "Authorization": f"Bearer {token}"})
    return st


def sair_restrito(o, L, contas: list[str]) -> None:
    """O logout (escopo local) SÓ das sessões guardadas destas contas (o molde do Sessoes.sair do e2e/hml19/_base.py, restrito às
    chaves "treino:<conta>" e "<conta>"): a que falhar fica no arquivo para o --sair; o arquivo só some se ficar vazio."""
    for k in [x for conta in contas for x in (f"treino:{conta}", conta)]:
        s = L.d.get(k)
        if not s:
            continue
        banco = "treino" if k.startswith("treino:") else "principal"
        if int(s.get("expires_at") or 0) - time.time() < 120:
            s = (B19._refresh_treino(s) if banco == "treino" else B19._refresh(s)) or s
        try:
            st: object = logout_local(s.get("access_token", ""), banco)
        except Exception as e:  # noqa: BLE001
            st = type(e).__name__
        if o.ok(st in (200, 204), f"logout (escopo local) da sessão {k} ({st})", parar=False):
            L.d.pop(k, None)
        else:
            L.d[k] = s
    if L.d:
        L._salvar()
    elif B19.ARQ_SESSOES.exists():
        B19.ARQ_SESSOES.unlink()


class Transporte:
    """A rede de verdade — SÓ na etapa 2 (o --seco usa o TransporteSeco, sem rede)."""

    seco = False

    def __init__(self, o, L) -> None:
        self.o, self.L = o, L
        self._chave: str | None = None

    def contas_do_treino(self) -> dict:
        """ANTES de qualquer login: o id do login do principal (pelo e-mail de teste) e as identidades do Treino de cada conta — SQL só
        leitura (o molde do exige_identidade da 21d: treinos21d.py:218-223)."""
        saida = {}
        for q, conta in CONTAS.items():
            linhas = ler_mgmt(PRINCIPAL_REF, f"uid:{q}", sql_uid_principal(conta))
            uid = linhas[0].get("id") if len(linhas) == 1 else None
            ids = [x.get("id") for x in ler_mgmt(TREINO_REF, f"identidade:{q}", sql_identidades(uid))] if C.eh_uuid(uid) else []
            saida[q] = {"uid_p": uid, "ids": ids}
        return saida

    def sessao_treino(self, conta: str) -> dict:
        return self.L.sessao_treino(conta)  # o login do principal + a troca (contados no registro de logins)

    def sessao_treino_sem_login(self, conta: str) -> dict | None:
        """A sessão do Treino guardada (o refresh não é login) — o --limpar NUNCA faz login."""
        s = self.L.d.get(f"treino:{conta}")
        if s and int(s.get("expires_at") or 0) - time.time() < 120:
            s = B19._refresh_treino(s)
            if s:
                self.L.d[f"treino:{conta}"] = s
                self.L._salvar()
        return s if s and s.get("access_token") else None

    def rest(self, p: Pedido, token: str) -> tuple[object, object, int]:
        if self._chave is None:
            self._chave = B5.anon(TREINO_REF)
        t0 = time.time()
        try:
            st, r, _h = B5.http(p.metodo, f"{API_T}/rest/v1/{p.tabela}?{p.consulta}", p.corpo, cabecalhos(p, token, self._chave), timeout=60)
        except Exception as e:  # noqa: BLE001 — a rede caiu: o D3 confere a saúde
            return f"erro {type(e).__name__}", None, round((time.time() - t0) * 1000)
        return st, r, round((time.time() - t0) * 1000)

    def ler(self, rotulo: str, sql: str, ctx: dict | None = None) -> list[dict]:  # noqa: ARG002 — o ctx é do --seco
        return ler_mgmt(TREINO_REF, rotulo, sql)

    def ler_principal(self, rotulo: str, sql: str) -> list[dict]:
        return ler_mgmt(PRINCIPAL_REF, rotulo, sql)

    def escrever(self, sql: str) -> None:
        """A escrita do --limpar sem sessão: o sqlrw.py (PERMITIR_ESCRITA=1 + --confirmo) pelo com_pat.py — SÓ o DELETE da trava."""
        trava_escrita(sql)
        env = dict(os.environ, PERMITIR_ESCRITA="1")
        r = subprocess.run(["python3", str(B.COM_PAT), "python3", str(B.SQLRW), TREINO_REF, "--confirmo"], input=sql, capture_output=True,
                           text=True, env=env, timeout=180)
        st = re.search(r"status (\d+)", r.stdout or "")
        if r.returncode != 0 or not st or not st.group(1).startswith("20"):
            raise RuntimeError(f"sqlrw (Treino staging) → status {st.group(1) if st else '000'}")

    def saude(self) -> tuple[bool, dict]:
        return saude_com_429(B.saude, self._esperar_429)

    def _esperar_429(self, s: float) -> None:
        self.o.linha(f"   (429 da Management API no /health: {s:.0f} s e repete 1 vez)")
        time.sleep(s)

    def pausa(self, s: float) -> None:
        time.sleep(s)

    def sair(self, o, contas: list[str]) -> None:
        sair_restrito(o, self.L, contas)


# ───────────────────────── o D3 (o MESMO código no --seco e no staging) ─────────────────────────
def novo_id() -> str:
    return str(uuid.uuid4())  # como a fila: o id nasce no aparelho


def papel_do_token(token: str) -> str | None:
    """O app_metadata.role do token do Treino (o que o physiq_papel() lê) — decodificado aqui, sem rede, nada impresso."""
    papel = ((C.claims(token) or {}).get("app_metadata") or {}).get("role")
    return papel if isinstance(papel, str) else None


def pode_abrir(estado) -> bool:
    """Nenhuma rodada pendente no Estado (de qualquer W: o vazio() da hml-19, a foto/o destino da 21a, a massa da 21b/21d/21c/21e)."""
    return (estado.vazio() and not estado.d.get("hml21_foto") and not estado.d.get("hml21_destino") and not B.tem_massa_21b(estado)
            and not B.tem_massa_21d(estado) and not B.tem_massa_21c(estado) and not B.tem_massa_21e(estado))


class D3:
    def __init__(self, o, tr, estado, tabelas: tuple[str, ...], so_massa: frozenset[str], pausa_s: float, rodada: str, inicio: str) -> None:
        self.o, self.tr, self.estado = o, tr, estado
        self.tabelas, self.so_massa, self.pausa_s, self.rodada, self.inicio = tabelas, so_massa, pausa_s, rodada, inicio
        self.marca = f"{MARCA} {rodada}"
        self.placar: list[dict] = []
        self.alertas: list[str] = []
        self.por_catalogo: dict[str, str] = {}
        self.parou_saude = False
        self.aberto = False
        self.tok: dict[str, str] = {}
        self.sub: dict[str, str] = {}
        self.uid_p: dict[str, str] = {}
        self.ex: list[str] = []
        self.massa: dict[tuple[str, str], str] = {}   # (tabela, quem) → o id da massa VIVA
        self.perfis: dict[str, str] = {}              # A, P, sozinho, w13_aluno → o id (na memória)
        self.foto: dict[str, object] = {}             # o foto_url de agora (na memória; nunca no log)
        self.md5_perfis: dict[str, str] = {}
        self.professor_ok = self.acesso_ok = False
        self.papel: dict[str, str] = {}               # o app_metadata.role do auth.users do Treino (a pré-condição)
        self.logou = False                            # houve login/troca (o fechar faz o logout das sessões desta execução)
        self.pulos: list[str] = []
        self.t0 = time.time()
        self.pausas = 0

    # ── o placar ──
    def registrar(self, tabela: str, caso: str, direcao: str, esperado: str, obtido: str, ms: object, resultado: str, rotulo: str = "") -> None:
        self.placar.append({"tabela": tabela, "caso": caso, "direcao": direcao, "esperado": esperado, "obtido": obtido, "ms": ms,
                            "resultado": resultado, "rotulo": rotulo})

    def marcar(self, resultado: str, texto: str) -> None:
        if resultado == "ok":
            self.o.ok(True, texto)
        elif resultado == "alerta":
            self.alertas.append(texto)
            self.o.ok(False, "🔴 ALERTA " + texto, parar=False)
        elif resultado == "pulou":
            self.o.linha("⏭️ " + texto)
        else:
            self.o.ok(False, texto, parar=False)

    # ── a saúde (H-80) ──
    def saude(self, rotulo: str) -> None:
        ok, estados = self.tr.saude()
        self.o.ok(ok, f"/health dos 2 projetos antes de {rotulo}: {estados}", parar=False)
        if not ok:
            self.parou_saude = True
            raise ParouSaude(rotulo)

    # ── o pedido ──
    def mandar(self, p: Pedido) -> bool:
        trava_pedido(p)
        if p.metodo == "POST" and not self.anotado(p.alvo_id):
            raise SystemExit("trava_estado: o id do POST não está no Estado — recusado (anotar ANTES do pedido)")
        st, r, ms = self.tr.rest(p, self.tok[p.quem])
        resultado, obtido = classificar(p, st, r)
        esp = esperado_txt(p.esperado)
        self.registrar(p.tabela, p.caso, p.direcao, esp, obtido, ms, resultado, p.rotulo)
        self.marcar(resultado, f"[{p.tabela}] {CASO_TXT[p.caso]} {p.direcao} {p.rotulo} → {obtido} (esperado {esp}) · {ms} ms")
        if not isinstance(st, int) or st >= 500:
            self.saude(f"seguir depois de um {st} em {p.tabela}")  # um erro de servidor/rede: o banco pode estar ruim
        return resultado == "ok"

    def get(self, t: str, caso: str, direcao: str, quem: str, id_: str, n: int, nega: bool, rotulo: str) -> bool:
        return self.mandar(Pedido(t, caso, direcao, quem, "GET", f"id=eq.{id_}&select=id", None, ("linhas", 200, n), nega, rotulo, id_))

    def patch(self, t: str, caso: str, direcao: str, quem: str, id_: str, corpo: dict, n: int, nega: bool, rotulo: str) -> bool:
        return self.mandar(Pedido(t, caso, direcao, quem, "PATCH", f"id=eq.{id_}&select=id", corpo, ("linhas", 200, n), nega, rotulo, id_))

    def delete(self, t: str, caso: str, direcao: str, quem: str, id_: str, n: int, nega: bool, rotulo: str) -> bool:
        return self.mandar(Pedido(t, caso, direcao, quem, "DELETE", f"id=eq.{id_}&select=id", None, ("linhas", 200, n), nega, rotulo, id_))

    def put(self, t: str, caso: str, direcao: str, quem: str, corpo: dict, esperado: tuple, nega: bool, rotulo: str) -> bool:
        return self.mandar(Pedido(t, caso, direcao, quem, "POST", "select=id", corpo, esperado, nega, rotulo, corpo["id"]))

    # ── o Estado (a chave hml21e) ──
    def m(self) -> dict:
        return self.estado.d[CHAVE]

    def anotado(self, id_: str | None) -> bool:
        return bool(self.aberto and id_ and any(x[1] == id_ for x in self.m()["linhas"]))

    def anotar(self, t: str, id_: str, dono: str) -> None:
        """O id e o dono ANTES do pedido (uma rodada que cair no meio limpa pelo Estado)."""
        if t in DA_FILA and C.eh_uuid(id_) and C.eh_uuid(dono) and not self.anotado(id_):
            self.m()["linhas"].append([t, id_, dono])
            self.estado.salvar()

    def desanotar(self, id_: str) -> None:
        self.m()["linhas"] = [x for x in self.m()["linhas"] if x[1] != id_]
        self.estado.salvar()

    def abrir_estado(self) -> None:
        self.estado.d[CHAVE] = {"schema": S, "rodada": self.rodada, "inicio_utc": self.inicio, "donos": [self.sub[A], self.sub[P]],
                                "linhas": [], "perfis": dict(self.perfis), "perfis_md5": dict(self.md5_perfis)}
        self.aberto = True
        self.estado.salvar()

    # ── a linha mínima ──
    def corpo(self, t: str, caso: str, quem: str, dono: str, id_: str) -> dict:
        """A linha MÍNIMA de `t`: `quem` manda, `dono` é o user_id do corpo (a OUTRA no (c)), `id_` o id do pedido (o da OUTRA no (c′))."""
        dia = f"{SENTINELA}{DIA[(caso, quem)]:02d}"
        marca = self.marca if caso == "massa" else f"{self.marca} {caso}"
        c: dict = {"id": id_, "user_id": self.sub[dono]}
        pai = PAI_DE.get(t)
        if pai:
            c[COLUNA_PAI[t]] = self.massa[(pai, dono)]  # o pai DE MASSA do dono do corpo
        if t == "tb_treino_series":
            c.update(data_treino=dia, numero_serie=1, exercicio_id=self.ex[0], academia_nome=marca)
        elif t in ("tb_treino_concluido", "tb_treino_dia_override"):
            c.update(data_treino=dia)
        elif t == "treino_historico":
            c.update(nome_treino=marca, iniciado_em=f"{dia}T10:00:00+00:00", concluido_em=f"{dia}T11:00:00+00:00", duracao_segundos=3600)
        elif t in ("tb_academias", "tb_grupos_treino_usuario"):
            c.update(nome=marca)
        elif t == "tb_exercicios_usuario":
            c.update(nome=marca, grupo_muscular=MARCA)
        elif t == "tb_academia_pesos":
            c.update(numero_serie=NUMERO[caso])
        elif t == "tb_series_padrao_usuario":
            c.update(observacao=marca)
            if caso in ("c", "c2"):  # a chave única (user, alvo, exercício): o (c)/(c′) com um exercício global — nunca encontram a massa
                c.update(exercicio_id=self.ex[0 if caso == "c" else 1])
        elif t == "exercicio_ordem_usuario":
            c.update(grupo_id=marca, exercicio_id=f"hml21-e2e-{caso}", posicao=0)
        elif t == "exercicio_substituicao_usuario":
            c.update(grupo_id=marca, exercicio_origem_id=f"hml21-e2e-{caso}", data_treino=dia)
        elif t == "tb_exercicio_comentarios":
            c.update(comentario=marca)
        elif t == "tb_semana_treinos":
            c.update(dia_semana=marca)
            if caso in SLOT:
                c.update(slot_idx=SLOT[caso])
        return c

    # ── a execução ──
    def rodar(self) -> None:
        self.saude("o começo do D3")
        self.catalogo()
        self.precondicao()    # SQL só leitura, ANTES de qualquer login: falhou → para aqui (0 login)
        self.sessoes()        # os 4 logins (2 contas × o login + a troca); o sub do token = o id da pré-condição
        self.perfis_comeco()  # o md5 e o foto_url dos 4 perfis DEPOIS das trocas (o espelho da troca não conta)
        self.abrir_estado()
        for i, t in enumerate(self.tabelas):
            if i:
                self.tr.pausa(self.pausa_s)
                self.pausas += 1
            if i and i % 5 == 0:
                self.saude(f"a tabela {i + 1} de {len(self.tabelas)}")
            try:
                self.tabela(t)
            except (ParouSaude, C.Parou, SystemExit):
                raise
            except Exception as e:  # noqa: BLE001 — uma tabela que caiu no meio: marca, confere a saúde e segue
                self.registrar(t, "—", "—", "—", motivo(e), None, "falha")
                self.o.ok(False, f"[{t}] parou no meio: {motivo(e)}", parar=False)
                self.saude(f"seguir depois da falha em {t}")
        self.saude("a limpeza dos pais")
        for t in reversed(PAIS):
            if t in self.tabelas:
                self.limpeza(t)

    def catalogo(self) -> None:
        vivo = {x.get("tabela"): x for x in self.tr.ler("catalogo", sql_catalogo())}
        for t in ORDEM:
            x, motivos = vivo.get(t), []
            if not x:
                motivos.append("a tabela não existe no staging")
            else:
                if x.get("rls") is not True or x.get("force_rls") is not False:
                    motivos.append("o RLS (ligado, sem FORCE) mudou")
                if x.get("siud") is not True or x.get("anon_select") is not False:
                    motivos.append("os grants (S/I/U/D do authenticated, 0 SELECT do anon) mudaram")
                if tuple(sorted(tuple(p) for p in (_json(x.get("policies")) or []))) != POLICIES[t]:
                    motivos.append("as policies mudaram")
                if tuple(sorted(_json(x.get("gatilhos")) or ())) != GATILHOS.get(t, ()):
                    motivos.append("os gatilhos mudaram")
                if tuple(_json(x.get("obrigatorias")) or ()) != OBRIGATORIAS[t]:
                    motivos.append("as colunas obrigatórias mudaram")
                if set(self.colunas_que_manda(t)) - set(_json(x.get("colunas")) or ()):
                    motivos.append("uma coluna que o D3 manda sumiu")
            if motivos:
                self.por_catalogo[t] = "; ".join(motivos)
                self.o.ok(False, f"ACHADO [{t}] o catálogo vivo ≠ o retrato de {RETRATO_DE} ({self.por_catalogo[t]}) → POR CATÁLOGO (sem massa)",
                          parar=False)
            else:
                self.o.ok(True, f"[{t}] o catálogo vivo = o retrato de {RETRATO_DE} (RLS ligado sem FORCE; S/I/U/D do authenticated; 0 SELECT do "
                                f"anon; {len(POLICIES[t])} policy(s); gatilhos: {', '.join(GATILHOS.get(t, ())) or 'nenhum'}; as obrigatórias)")
        for filho, pai in PAI_DE.items():
            if pai in self.por_catalogo and filho not in self.por_catalogo:
                self.por_catalogo[filho] = f"o pai {pai} está por catálogo"
        self.ex = [x.get("id") for x in self.tr.ler("exercicios", sql_exercicios())]
        self.o.ok(len(self.ex) == 2 and all(C.eh_uuid(e) for e in self.ex), "2 exercícios GLOBAIS do staging (a série de teste e o (c)/(c′) da "
                                                                           "série padrão)", parar=True)

    def colunas_que_manda(self, t: str) -> list[str]:
        """As colunas que o D3 manda em `t` (os corpos de massa, (c) e (c′) + a coluna do PATCH)."""
        if t == "physiq_profiles":
            return ["foto_url"]
        cols = {COLUNA_PATCH[t], "id", "user_id"}
        cols |= set(OBRIGATORIAS[t]) | ({COLUNA_PAI[t]} if t in COLUNA_PAI else set())
        cols |= {COLUNA_MARCA[t]} if t in COLUNA_MARCA else set()
        cols |= set(COLUNA_DATA.get(t, ()))
        extras = {"tb_treino_series": {"exercicio_id"}, "treino_historico": {"duracao_segundos"}, "tb_series_padrao_usuario": {"exercicio_id"},
                  "tb_semana_treinos": {"slot_idx", "user_id"}, "tb_exercicios_usuario": {"grupo_muscular"}}
        return sorted(cols | extras.get(t, set()))

    def precondicao(self) -> None:
        """ANTES de qualquer login (a revisão da etapa 1): os 2 ids do Treino (o login do principal pelo e-mail de teste → o
        physiq_identidades: 1 — o exige_identidade da 21d), o e-mail das 2 no Auth do Treino (= o de teste), os perfis, os papéis, o
        professor da aluna, o acesso do personal, os 2 alvos (d) e 0 sobra nas 14 — tudo por SQL só leitura; falhou → para AQUI, sem login
        (o D3 só vale 100 % com o (d) provado)."""
        contas = self.tr.contas_do_treino()
        for q in (A, P):
            c = contas.get(q) or {}
            ids = c.get("ids") or []
            self.o.ok(C.eh_uuid(c.get("uid_p")) and len(ids) == 1 and C.eh_uuid(ids[0]),
                      f"{q}: a conta de teste já existe no Treino (o login do principal → o physiq_identidades: {len(ids)}) — a troca de token não "
                      "cria conta nova (o exige_identidade da 21d), conferido ANTES de qualquer login", parar=True)
            self.sub[q], self.uid_p[q] = ids[0], c["uid_p"]
        self.o.ok(self.sub[A] != self.sub[P], "as 2 contas são pessoas diferentes no Treino", parar=True)
        r = (self.tr.ler("comeco", sql_comeco(self.sub[A], self.sub[P]), {"sub": dict(self.sub)}) or [{}])[0]
        self.o.ok(all((r.get(f"email_{q.lower()}") or "") == EMAIL[CONTAS[q]] and C.eh_email_de_teste(EMAIL[CONTAS[q]]) for q in (A, P)),
                  "o e-mail das 2 no Auth do Treino = o de TESTE de cada uma (o id veio do login certo)", parar=True)
        self.o.ok(r.get("perfil_a") == 1 and r.get("perfil_p") == 1, "as 2 contas com o physiq_profiles no staging do Treino", parar=True)
        self.papel = {A: r.get("papel_a") or "", P: r.get("papel_p") or ""}
        self.o.ok(self.papel[A] not in ("admin", "master") and self.papel[P] == "professor",
                  f"os papéis no Auth do Treino: a aluna sem admin/master ({self.papel[A] or 'nenhum'}), o personal professor ({self.papel[P] or 'nenhum'})",
                  parar=True)
        self.professor_ok = r.get("professor_eh_o_personal") is True
        self.acesso_ok = r.get("acesso_ok") is True
        self.o.ok(self.professor_ok, "o professor da aluna é o personal (o (d) da aluna)", parar=True)
        self.o.ok(self.acesso_ok, "o acesso do personal passa na regra do physiq_professor_acesso_ok (o (d)-P de UPDATE)", parar=True)
        sobras = _json(r.get("sobras")) or {}
        self.o.ok(set(sobras) == set(DA_FILA) and not any(sobras.values()),
                  f"0 linha com a marca/a sentinela das 2 contas nas 14 ({sum(int(v or 0) for v in sobras.values())}; sobrou → o --limpar antes)",
                  parar=True)
        soz = [x for x in (_json(r.get("sozinho")) or []) if C.eh_uuid(x.get("id")) and C.eh_email_de_teste(x.get("email") or "")
               and x.get("sem_professor") is True]
        self.o.ok(len(soz) == 1, f"o alvo (d) w7b-sozinho: conta de TESTE, sem professor ({len(soz)})", parar=True)
        w13 = [x for x in (_json(r.get("w13_alunos")) or []) if C.eh_uuid(x.get("id")) and C.eh_email_de_teste(x.get("email") or "")
               and x.get("id") not in (self.sub[A], self.sub[P], soz[0]["id"])]
        self.perfis = {A: self.sub[A], P: self.sub[P], "sozinho": soz[0]["id"]}
        if w13:
            self.perfis["w13_aluno"] = sorted(x["id"] for x in w13)[0]
            self.o.ok(True, f"o alvo (d) aluno de TESTE da w13-dono (de outro professor; {len(w13)} com e-mail de teste — o 1º)")
        else:
            self.pulos.append("o alvo (d) aluno de TESTE da w13-dono: nenhum com e-mail de teste (SQL) — só a w7b-sozinho")
            self.o.linha("⏭️ o alvo (d) aluno de TESTE da w13-dono: nenhum com e-mail de teste (SQL) — só a w7b-sozinho")

    def sessoes(self) -> None:
        self.logou = True  # daqui em diante há sessão para fechar (o fechar faz o logout das 4, mesmo se parar no meio)
        for q in (A, P):
            s = self.tr.sessao_treino(CONTAS[q])  # o login do principal + a troca (2 linhas no registro)
            tok = s.get("access_token") or ""
            self.tok[q] = tok
            self.o.ok((C.claims(tok) or {}).get("sub") == self.sub[q],
                      f"a sessão do Treino de {q} pela troca do app: o sub do token = o id do Treino da pré-condição", parar=True)
            papel = papel_do_token(tok)
            self.o.ok(papel not in ("admin", "master") and (papel or "") == self.papel[q],
                      f"o token de {q} sem admin/master e com o papel do Auth do Treino (app_metadata.role: {papel or 'nenhum'})", parar=True)

    def ler_perfis(self, rotulo: str, ctx_extra: dict | None = None) -> dict[str, tuple]:
        """O md5 da linha e o foto_url de agora dos perfis do (d) (SQL só leitura; o foto_url fica na memória, nunca no log)."""
        linhas = self.tr.ler(rotulo, sql_perfis(list(self.perfis.values())), {"perfis": dict(self.perfis), **(ctx_extra or {})})
        por_id = {x.get("id"): x for x in linhas}
        return {alias: (por_id[id_].get("h"), por_id[id_].get("foto")) for alias, id_ in self.perfis.items() if id_ in por_id}

    def perfis_comeco(self) -> None:
        lidos = self.ler_perfis("perfis")
        for alias, (h, foto) in lidos.items():
            self.md5_perfis[alias], self.foto[alias] = h, foto
        self.o.ok(len(lidos) == len(self.perfis), f"o começo: os {len(self.perfis)} physiq_profiles (o md5 de cada linha e o foto_url de agora — "
                                                  "na memória, nunca no log)", parar=True)

    def tabela(self, t: str) -> None:
        if t in self.por_catalogo:
            self.registrar(t, "—", "—", "por catálogo", self.por_catalogo[t], None, "por_catalogo")
            self.o.linha(f"⏭️ [{t}] POR CATÁLOGO ({self.por_catalogo[t]}) — sem massa")
            return
        if t == "physiq_profiles":
            self.perfis_d()
            return
        ids: dict[str, str] = {}
        for q in (A, P):  # massa: cada dono cria a sua pelo PUT da fila (201; o controle do caminho)
            pai = PAI_DE.get(t)
            if pai and (pai, q) not in self.massa:
                self.registrar(t, "massa", q, "201·1 linha", f"sem a massa do pai {pai}", None, "pulou")
                self.marcar("pulou", f"[{t}] massa {q}: sem a massa do pai {pai} — a tabela pula")
                return
            id_ = novo_id()
            self.anotar(t, id_, self.sub[q])
            if not self.put(t, "massa", q, q, self.corpo(t, "massa", q, q, id_), ("linhas", 201, 1), False, "o dono cria a sua (o PUT da fila)"):
                return  # sem as 2 linhas, os casos cruzados não têm alvo (a que foi criada sai na limpeza do fim, pelo Estado)
            ids[q] = self.massa[(t, q)] = id_
        if t in self.so_massa:
            return
        antes = {x.get("id"): x for x in self.tr.ler(f"antes:{t}", sql_antes(t, [ids[A], ids[P]]), {"t": t, "ids": dict(ids)})}
        self.o.ok(set(antes) == set(ids.values()), f"[{t}] o ANTES (SQL só leitura, 1 consulta): as 2 linhas de massa — o md5 e o "
                                                  f"{COLUNA_PATCH[t]} de agora (na memória)", parar=True)  # sem elas depois de 2 × 201: para
        h = {q: antes[ids[q]].get("h") for q in (A, P)}
        v = {q: antes[ids[q]].get("v") for q in (A, P)}
        col = COLUNA_PATCH[t]
        for q in (A, P):  # (a)
            self.get(t, "a", q, q, ids[q], 1, False, "o dono lê a sua pelo id (controle)")
            self.get(t, "a", f"{q}×{OUTRO[q]}", q, ids[OUTRO[q]], 0, True, "lê a da outra pelo id")
        dono_n = 0 if t == "treino_historico" else 1  # o histórico não tem policy de UPDATE: o PATCH do dono também dá 0 (o esperado)
        for q in (A, P):  # (b)
            o_ = OUTRO[q]
            self.patch(t, "b", f"{q}×{o_}", q, ids[o_], {col: v[o_]}, 0, True, f"{col} = o de agora, na da outra")
            self.delete(t, "b", f"{q}×{o_}", q, ids[o_], 0, True, "na da outra")
            self.patch(t, "b", q, q, ids[q], {col: v[q]}, dono_n, False,
                       f"{col} = o de agora, na do dono ({'sem policy de UPDATE: 0, o esperado' if dono_n == 0 else 'controle'})")
        ids_c = []
        for q in (A, P):  # (c): um id NOVO com o user_id da outra
            o_, cid = OUTRO[q], novo_id()
            ids_c.append(cid)
            self.anotar(t, cid, self.sub[o_])  # o dono do corpo é a outra: se o RLS falhar, a linha é dela (o --limpar a acha)
            self.put(t, "c", f"{q}×{o_}", q, self.corpo(t, "c", q, o_, cid), ("recusa", 403, "42501"), True, "um id novo com o user_id da outra")
        for q in (A, P):  # (c′): o id da linha da OUTRA com o próprio user_id (o ON CONFLICT DO UPDATE da fila)
            o_ = OUTRO[q]
            self.put(t, "c2", f"{q}×{o_}", q, self.corpo(t, "c2", q, q, ids[o_]), ("recusa", 403, "42501"), True,
                     "o id da linha da outra com o próprio user_id" + (" (sem policy de UPDATE: o 403 vem dela — o dono também levaria)"
                                                                       if t == "treino_historico" else ""))
        d = (self.tr.ler(f"depois:{t}", sql_depois(t, [ids[A], ids[P]], ids_c, [self.sub[A], self.sub[P]]),
                         {"t": t, "ids": dict(ids), "h": dict(h)}) or [{}])[0]
        for q in (A, P):  # a linha de q só muda se a OUTRA conseguiu o (b) ou o (c′)
            igual = (_json(d.get("massa")) or {}).get(ids[q]) == h[q]
            self.registrar(t, "sql", f"{OUTRO[q]}×{q}", "md5 igual", "igual" if igual else "MUDOU", None, "ok" if igual else "alerta")
            self.marcar("ok" if igual else "alerta", f"[{t}] (b)(c′) {OUTRO[q]}×{q}: a linha de {q} viva e igual depois do DELETE e do PUT (c′) "
                                                     f"da outra (md5, SQL só leitura; o PATCH da outra regrava o mesmo valor — a prova dele é o "
                                                     f"200 com 0 linha)")
        criadas = int(d.get("criadas_c") or 0)
        self.registrar(t, "sql", "A×P · P×A", "0 linha criada", f"{criadas}", None, "ok" if criadas == 0 else "alerta")
        self.marcar("ok" if criadas == 0 else "alerta", f"[{t}] (c) 0 linha criada pelos 2 PUT com o user_id da outra (SQL: {criadas})")
        if criadas == 0:
            for cid in ids_c:
                self.desanotar(cid)
        n_marca = int(d.get("n_marca") or 0)
        self.o.ok(n_marca == 2, f"[{t}] as linhas com a marca/a sentinela das 2 contas = as 2 de massa ({n_marca})", parar=False)
        if t not in PAIS:
            self.limpeza(t)

    def limpeza(self, t: str) -> None:
        for q in (A, P):  # cada dono apaga a sua → 1
            id_ = self.massa.get((t, q))
            if id_ and self.delete(t, "limpeza", q, q, id_, 1, False, "o dono apaga a sua"):
                self.desanotar(id_)
                del self.massa[(t, q)]

    def perfis_d(self) -> None:
        t, ida, idp = "physiq_profiles", self.perfis[A], self.perfis[P]
        lidos = self.ler_perfis("perfis_antes_d")  # o foto_url e o md5 de AGORA (a revisão: lidos logo antes do (d), não no começo)
        self.o.ok(len(lidos) == len(self.perfis), f"[{t}] os {len(self.perfis)} perfis lidos de novo logo antes do (d) (SQL só leitura)", parar=True)
        mudou = sorted(alias for alias, (h, _f) in lidos.items() if h != self.md5_perfis.get(alias))
        if mudou:
            self.o.linha(f"   ({len(mudou)} perfil(is) mudou(aram) entre o começo e o (d), fora do D3 — o (d) usa o valor de agora)")
        for alias, (h, foto) in lidos.items():
            self.md5_perfis[alias], self.foto[alias] = h, foto
        self.m()["perfis_md5"] = dict(self.md5_perfis)
        self.estado.salvar()
        self.get(t, "a", "A×P", A, idp, 0, True, "a aluna lê o perfil do personal")
        self.get(t, "a", A, A, ida, 1, False, "a aluna lê o próprio (controle)")
        self.get(t, "a", P, P, idp, 1, False, "o personal lê o próprio (controle)")
        self.patch(t, "b", "A×P", A, idp, {"foto_url": self.foto[P]}, 0, True, "foto_url = o de agora, no do personal")
        self.patch(t, "b", A, A, ida, {"foto_url": self.foto[A]}, 1, False, "foto_url = o de agora, no próprio")
        self.patch(t, "b", P, P, idp, {"foto_url": self.foto[P]}, 1, False, "foto_url = o de agora, no próprio")
        if self.professor_ok:
            self.get(t, "d", "P×A", P, ida, 1, False, "o professor lê o perfil da aluna DELE")
            if self.acesso_ok:
                self.patch(t, "d", "P×A", P, ida, {"foto_url": self.foto[A]}, 1, False, "o professor: foto_url = o de agora, no da aluna DELE")
            else:
                self.registrar(t, "d", "P×A", "200·1 linha", "PULOU: o acesso do personal não passa", None, "pulou")
                self.marcar("pulou", "[physiq_profiles] (d) P×A PATCH: o acesso do personal não passa no physiq_professor_acesso_ok — PULA")
        else:
            self.registrar(t, "d", "P×A", "200·1 linha", "PULOU: o professor da aluna não é o personal", None, "pulou")
            self.marcar("pulou", "[physiq_profiles] (d) P×A: o professor da aluna não é o personal — PULA")
        for alvo in ("sozinho", "w13_aluno"):
            if alvo not in self.perfis:
                self.registrar(t, "d", f"P×{alvo}", "200·0 linha", "PULOU: sem aluno de TESTE da w13-dono", None, "pulou")
                continue
            self.get(t, "d", f"P×{alvo}", P, self.perfis[alvo], 0, True, "o professor lê o perfil de quem NÃO é aluno dele")
            self.patch(t, "d", f"P×{alvo}", P, self.perfis[alvo], {"foto_url": self.foto[alvo]}, 0, True,
                       "o professor: foto_url = o de agora, em quem NÃO é aluno dele")
        depois = self.ler_perfis("perfis_depois", {"h": dict(self.md5_perfis)})
        for alias in self.perfis:
            igual = (depois.get(alias) or (None,))[0] == self.md5_perfis.get(alias)
            res = "ok" if igual else ("falha" if alias == A else "alerta")  # a da aluna: o professor PODE gravar (o mesmo valor)
            self.registrar(t, "sql", alias, "md5 igual", "igual" if igual else "MUDOU", None, res)
            self.marcar(res, f"[{t}] o perfil {alias} igual ao começo (md5, SQL só leitura)")

    # ── o fim (no finally): o que sobrou no Estado, a conferência, o logout ──
    def fechar(self) -> None:
        if self.parou_saude:
            self.o.linha("PAROU saúde: nenhum pedido a mais (nem a limpeza nem o logout) — o Estado guarda a massa; o --limpar e o --sair "
                         "quando o banco voltar")
            return
        try:
            if self.aberto:
                self.limpar_resto()
                self.conferir_fim()
        except ParouSaude:
            self.o.linha("PAROU saúde (na limpeza): nenhum pedido a mais — o Estado guarda o que sobrou; o --limpar e o --sair quando o banco "
                         "voltar")
            return
        except Exception as e:  # noqa: BLE001
            self.o.ok(False, f"a limpeza parou no meio: {motivo(e)} — o Estado fica para o --limpar", parar=False)
        self.sair()

    def limpar_resto(self) -> None:
        """O que ainda está no Estado (uma tabela que caiu no meio, um (c) que passou): o dono apaga pelo REST — os filhos antes dos pais; o
        que não saiu pelo REST é conferido por 1 SQL só leitura por tabela (decisão K): já sem linha (o CASCADE do pai levou / o PUT tinha
        falhado) → sai do Estado; viva → fica para o --limpar."""
        restam = list(self.m()["linhas"])
        if not restam:
            return
        self.saude("a limpeza do que sobrou no Estado")
        dono_de = {self.sub[q]: q for q in (A, P) if q in self.sub}
        for t in reversed(DA_FILA):
            falhou = []
            for _t, id_, dono in [x for x in restam if x[0] == t]:
                q = dono_de.get(dono)
                if not (q and q in self.tok):
                    continue  # sem a sessão do dono: fica no Estado para o --limpar
                if self.delete(t, "limpeza", q, q, id_, 1, False, "limpeza do que sobrou (o dono apaga)"):
                    self.desanotar(id_)
                else:
                    falhou.append(id_)
            if falhou:
                vivas = self.vivos(t, falhou)
                for id_ in falhou:
                    if id_ not in vivas:
                        self.desanotar(id_)

    def vivos(self, t: str, ids: list[str]) -> set[str]:
        """Quais destes ids ainda existem em `t` — 1 SQL só leitura por tabela, em lote (decisão K); os ids ficam na memória."""
        r = self.tr.ler(f"vivos:{t}", f"select x.id::text as id from staging.{t} x where x.id = any({lista_uuid(ids)})", {"t": t}) or []
        return {x.get("id") for x in r if C.eh_uuid(x.get("id"))}

    def conferir_fim(self) -> None:
        m = self.m()
        r = (self.tr.ler("fim", sql_fim(m["donos"], list(m["perfis"].values())), {"perfis": dict(m["perfis"]), "h": dict(m["perfis_md5"])})
             or [{}])[0]
        sobras = _json(r.get("sobras")) or {}
        zero = set(sobras) == set(DA_FILA) and not any(sobras.values())
        self.o.ok(zero, f"limpeza conferida (SQL só leitura, só contagem): 0 linha da massa nas 14 ({sum(int(v or 0) for v in sobras.values())})",
                  parar=False)
        perfis = _json(r.get("perfis")) or {}
        iguais = all(perfis.get(id_) == m["perfis_md5"].get(alias) for alias, id_ in m["perfis"].items())
        self.o.ok(iguais, f"os md5 dos {len(m['perfis'])} physiq_profiles iguais ao começo", parar=False)
        if zero and iguais and not m["linhas"]:
            del self.estado.d[CHAVE]
            self.aberto = False
            if self.estado.vazio() and len(set(self.estado.d) - {"rodada", "schema", "area", "linhas", "storage", "n8"}) == 0:
                self.estado.apagar()
            else:
                self.estado.salvar()
            self.o.ok(True, "o Estado sem a chave hml21e (a massa do D3 desfeita)")
        else:
            self.o.ok(False, f"o Estado FICA com a chave hml21e ({len(m['linhas'])} linha(s)) — rode o --limpar", parar=False)

    def sair(self) -> None:
        if not self.logou:
            return
        self.tr.sair(self.o, [CONTAS[A], CONTAS[P]])
        try:
            n_t = int((self.tr.ler("sessoes:treino", sql_sessoes([self.sub[q] for q in (A, P) if q in self.sub], self.inicio)) or [{}])[0].get("n") or 0)
            ids_p = [self.uid_p[q] for q in (A, P) if C.eh_uuid(self.uid_p.get(q))]
            n_p = int((self.tr.ler_principal("sessoes:principal", sql_sessoes(ids_p, self.inicio)) or [{}])[0].get("n") or 0) if ids_p else -1
            self.o.ok(n_t == 0 and n_p == 0, f"as sessões desta execução fechadas (SQL só leitura, só contagem, desde o começo): Treino {n_t}, "
                                             f"principal {n_p}", parar=False)
        except Exception as e:  # noqa: BLE001
            self.o.ok(False, f"a conferência das sessões parou: {motivo(e)}", parar=False)

    # ── o resumo ──
    def resumo(self) -> None:
        o = self.o
        reqs = [x for x in self.placar if x["caso"] not in ("sql", "—")]
        com_massa = sorted({x["tabela"] for x in self.placar if x["caso"] == "massa" and x["resultado"] == "ok"})
        o.linha(f"\n## placar do D3 (rodada {self.rodada}): {len(reqs)} pedidos REST · tabelas com massa {len(com_massa)}/14 · "
                f"por catálogo {len(self.por_catalogo)} · alertas {len(self.alertas)} · falhas "
                f"{sum(1 for x in self.placar if x['resultado'] == 'falha')} · pulos {sum(1 for x in self.placar if x['resultado'] == 'pulou')} · "
                f"{round(time.time() - self.t0)} s · {self.pausas} pausa(s) de {self.pausa_s} s")
        simbolo = {"ok": "✅", "alerta": "🔴", "falha": "❌", "pulou": "⏭️", "por_catalogo": "📖"}
        for t in self.tabelas:
            partes = []
            for caso in ("massa", "a", "b", "c", "c2", "d", "sql", "limpeza"):
                xs = [x for x in self.placar if x["tabela"] == t and x["caso"] == caso]
                if xs:
                    pior = next((r for r in ("alerta", "falha", "pulou", "ok") if any(x["resultado"] == r for x in xs)), "ok")
                    partes.append(f"{CASO_TXT[caso]} {simbolo[pior]}×{len(xs)}")
            if t in self.por_catalogo:
                partes = [f"📖 POR CATÁLOGO ({self.por_catalogo[t]})"]
            o.linha(f"   {t}: " + " · ".join(partes))
        for a in self.alertas:
            o.linha(f"   🔴 {a}")
        if self.alertas:
            o.linha("   → PAROU D3: " + " | ".join(re.sub(r" → .*$", "", a) for a in self.alertas) + " (o agente escreve o ## PAROU; nada se "
                    "corrige aqui — seria migration)")
        for p in self.pulos:
            o.linha(f"   ⏭️ {p}")

    def gravar_planilha(self) -> None:
        novo = not PLANILHA.exists()
        PLANILHA.parent.mkdir(parents=True, exist_ok=True)
        with PLANILHA.open("a", encoding="utf-8") as f:
            if novo:
                f.write("quando\trodada\ttabela\tcaso\tdirecao\tesperado\tobtido\tms\tresultado\n")
            quando = time.strftime("%Y-%m-%d %H:%M:%S")
            for x in self.placar:
                f.write("\t".join(str(v) for v in (quando, self.rodada, x["tabela"], CASO_TXT.get(x["caso"], x["caso"]), x["direcao"],
                                                   x["esperado"], x["obtido"], "" if x["ms"] is None else x["ms"], x["resultado"])) + "\n")


# ───────────────────────── o --limpar e o --sair ─────────────────────────
def limpar(o, tr, estado) -> None:
    """Desfaz pelo Estado (a chave hml21e): como o dono pelo REST (a sessão guardada — NUNCA um login); sem sessão, por SQL com a trava
    (SÓ staging, SÓ os 2 donos, SÓ os ids do Estado ou a marca/a sentinela) — os filhos antes dos pais; conferido por SQL só leitura."""
    m = estado.d.get(CHAVE)
    if not isinstance(m, dict):
        o.ok(True, "nada a limpar: o Estado sem a chave hml21e")
        return
    if m.get("schema") != S or not all(C.eh_uuid(x) for x in m.get("donos") or []) or len(m.get("donos") or []) != 2:
        o.ok(False, "o Estado da hml21e sem o schema staging ou sem os 2 donos — recusado", parar=True)
    ok, estados = tr.saude()
    o.ok(ok, f"/health dos 2 projetos antes do --limpar: {estados}", parar=True)
    donos = list(m["donos"])
    tokens: dict[str, str] = {}
    for conta in CONTAS.values():
        s = tr.sessao_treino_sem_login(conta)
        sub = (C.claims((s or {}).get("access_token") or "") or {}).get("sub")
        if s and sub in donos:
            tokens[sub] = s["access_token"]
    o.linha(f"   sessões do Treino guardadas (sem login): {len(tokens)} de 2 — o resto vai por SQL com a trava")
    for t in reversed(DA_FILA):
        for _t, id_, dono in [x for x in m["linhas"] if x[0] == t]:
            if dono in tokens:
                p = Pedido(t, "limpeza", "dono", "—", "DELETE", f"id=eq.{id_}&select=id", None, ("linhas", 200, 1), False, "o dono apaga", id_)
                trava_pedido(p)
                st, r, _ms = tr.rest(p, tokens[dono])
                if st == 200 and isinstance(r, list) and len(r) in (0, 1):
                    m["linhas"] = [x for x in m["linhas"] if x[1] != id_]
                    estado.salvar()
                o.ok(st == 200, f"[{t}] limpeza pelo REST como o dono → {st}·{len(r) if isinstance(r, list) else '—'} linha", parar=False)
    sobras = (tr.ler("limpar:sobras", f"select {sql_sobras(donos)} as sobras", {"donos": donos}) or [{}])[0].get("sobras")
    sobras = _json(sobras) or {}
    for t in reversed(DA_FILA):
        ids_t = [x[1] for x in m["linhas"] if x[0] == t]
        if not ids_t and not int(sobras.get(t) or 0):
            continue
        for tentativa in (1, 2):
            try:
                tr.escrever(sql_apagar(t, donos, ids_t))
                erro = None
            except RuntimeError as e:
                erro = motivo(e)  # só o tipo e o status (nunca a mensagem)
            n = (tr.ler(f"limpar:{t}", f"select count(*)::int as n from staging.{t} where user_id = any({lista_uuid(donos)}) and "
                                       f"(id = any({lista_uuid(ids_t, vazia=True)}) or ({COND[t]}))", {"t": t}) or [{}])[0].get("n")
            if int(n or 0) == 0 or tentativa == 2:
                break
            o.linha(f"   [{t}] a escrita falhou ({erro or 'sobrou linha'}): conferido por leitura ({n}) — repete 1 vez" + (" em 60 s" if erro and "429" in erro else ""))
            if erro and "429" in erro:
                tr.pausa(60)
        o.ok(int(n or 0) == 0, f"[{t}] limpeza por SQL (a trava: staging, os 2 donos, os ids/a marca) → sobram {n}", parar=False)
        if int(n or 0) == 0:
            m["linhas"] = [x for x in m["linhas"] if x[0] != t]
            estado.salvar()
    r = (tr.ler("fim", sql_fim(donos, list(m["perfis"].values())), {"perfis": dict(m["perfis"]), "h": dict(m["perfis_md5"])}) or [{}])[0]
    zero = not any((_json(r.get("sobras")) or {}).values())
    iguais = all((_json(r.get("perfis")) or {}).get(id_) == m["perfis_md5"].get(alias) for alias, id_ in m["perfis"].items())
    o.ok(zero, "limpeza conferida (SQL só leitura, só contagem): 0 linha da massa nas 14", parar=False)
    o.ok(iguais, f"os md5 dos {len(m['perfis'])} physiq_profiles iguais ao começo", parar=False)
    if zero and iguais and not m["linhas"]:
        del estado.d[CHAVE]
        if estado.vazio() and len(set(estado.d) - {"rodada", "schema", "area", "linhas", "storage", "n8"}) == 0:
            estado.apagar()
        else:
            estado.salvar()
        o.ok(True, "o Estado sem a chave hml21e")


# ───────────────────────── o --seco: o plano dos pedidos, os controles e as travas — SEM rede ─────────────────────────
@dataclass(frozen=True)
class Lido:
    """O marcador do valor que a execução de verdade lê por SQL só leitura (o --seco não vai ao banco); `leitura` = qual leitura (o
    foto_url do (d) vem da releitura "antes_d", logo antes do (d))."""
    tabela: str
    quem: str
    coluna: str
    leitura: str = ""


def jwt_falso(sub: str, papel: str | None) -> str:
    """Um token SÓ de forma (não assinado; nunca sai daqui): o sub e o app_metadata.role, para o mesmo código ler."""
    def b64(d: dict) -> str:
        return base64.urlsafe_b64encode(json.dumps(d).encode()).decode().rstrip("=")
    return f"{b64({'alg': 'none'})}.{b64({'sub': sub, 'role': 'authenticated', 'app_metadata': ({'role': papel} if papel else {})})}.seco"


FALSO = {A: "00000000-0000-4000-8000-0000000000a1", P: "00000000-0000-4000-8000-0000000000b2",
         "sozinho": "00000000-0000-4000-8000-0000000000c3", "w13_aluno": "00000000-0000-4000-8000-0000000000d4",
         "ex1": "00000000-0000-4000-8000-0000000000e5", "ex2": "00000000-0000-4000-8000-0000000000e6",
         "pA": "00000000-0000-4000-8000-0000000000f7", "pP": "00000000-0000-4000-8000-0000000000f8"}


class TransporteSeco:
    """O transporte do --seco: anota cada pedido (na ordem) e responde o ESPERADO de cada caso (ou o que o cenário mandar) — sem rede."""

    seco = True

    def __init__(self, cenario: dict | None = None, com_sessao: bool = True) -> None:
        self.cen = cenario or {}
        self.eventos: list[dict] = []
        self.d3: D3 | None = None
        self.estado = None  # o --limpar
        self.saudes = list(self.cen.get("saude", []))
        self.com_sessao = com_sessao

    def contas_do_treino(self) -> dict:
        """Os ids ANTES do login: o MESMO SQL da execução de verdade (anotado e conferido pela trava), com a resposta do cenário."""
        saida = {}
        for q, conta in CONTAS.items():
            uid = FALSO["pA" if q == A else "pP"]
            for rotulo, sql in ((f"uid:{q}", sql_uid_principal(conta)), (f"identidade:{q}", sql_identidades(uid))):
                trava_leitura(sql)
                self.eventos.append({"tipo": "sql", "rotulo": rotulo, "sql": sql})
            saida[q] = {"uid_p": uid, "ids": list(self.cen.get("identidades", {}).get(q, [FALSO[q]]))}
        return saida

    def sessao_treino(self, conta: str) -> dict:
        q = A if conta == CONTAS[A] else P
        self.eventos.append({"tipo": "troca", "conta": conta})
        sub = "00000000-0000-4000-8000-0000000000ff" if q in self.cen.get("sub_errado", ()) else FALSO[q]
        return {"access_token": jwt_falso(sub, "professor" if q == P else None)}

    def sessao_treino_sem_login(self, conta: str) -> dict | None:
        if not self.com_sessao:
            return None
        return self.sessao_treino(conta)

    def anotados(self) -> set[str]:
        est = self.d3.estado if self.d3 else self.estado
        m = (est.d.get(CHAVE) if est else None) or {}
        return {x[1] for x in m.get("linhas", [])}

    def rest(self, p: Pedido, token: str) -> tuple[object, object, int]:
        cab = cabecalhos(p, token, "‹a chave publicável do Treino›")
        self.eventos.append({"tipo": "rest", "p": p, "url": f"{API_T}/rest/v1/{p.tabela}?{p.consulta}", "cab": cab,
                             "quem_token": (C.claims(token) or {}).get("sub"), "anotado": p.alvo_id in self.anotados()})
        resp = self.cen.get("rest", {}).get((p.tabela, p.caso, p.direcao, p.metodo))
        if resp is not None:
            return resp[0], resp[1], 0
        tipo, st, x = p.esperado
        return (st, [{"id": p.alvo_id}] * x, 0) if tipo == "linhas" else (st, {"code": x}, 0)

    def ler(self, rotulo: str, sql: str, ctx: dict | None = None) -> list[dict]:
        trava_leitura(sql)
        self.eventos.append({"tipo": "sql", "rotulo": rotulo, "sql": sql})
        ctx = ctx or {}
        if rotulo in self.cen.get("sql", {}):
            return self.cen["sql"][rotulo]
        if rotulo == "catalogo":
            return [{"tabela": t, "rls": True, "force_rls": False, "siud": True, "anon_select": False, "policies": [list(x) for x in POLICIES[t]],
                     "gatilhos": list(GATILHOS.get(t, ())), "colunas": list(COLUNAS[t]), "obrigatorias": list(OBRIGATORIAS[t])} for t in ORDEM]
        if rotulo == "exercicios":
            return [{"id": FALSO["ex1"]}, {"id": FALSO["ex2"]}]
        if rotulo == "comeco":
            return [{"email_a": EMAIL[CONTAS[A]], "email_p": EMAIL[CONTAS[P]], "perfil_a": 1, "perfil_p": 1, "professor_eh_o_personal": True, "acesso_ok": True, "papel_a": "", "papel_p": "professor",
                     "sozinho": [{"id": FALSO["sozinho"], "email": EMAIL[SOZINHO], "sem_professor": True}],
                     "w13_alunos": [{"id": FALSO["w13_aluno"], "email": "w13.aluno.teste.claude@physiqnutri.app"}],
                     "sobras": {t: 0 for t in DA_FILA}}]
        if rotulo in ("perfis", "perfis_antes_d", "perfis_depois"):
            leitura = "antes_d" if rotulo == "perfis_antes_d" else ""
            return [{"id": id_, "h": f"md5-perfil-{alias}", "foto": Lido("physiq_profiles", alias, "foto_url", leitura)}
                    for alias, id_ in ctx.get("perfis", {}).items()]
        if rotulo.startswith("vivos:"):
            return []
        if rotulo.startswith("antes:"):
            t = ctx["t"]
            return [{"id": id_, "h": f"md5-{t}-{q}", "v": Lido(t, q, COLUNA_PATCH[t])} for q, id_ in ctx["ids"].items()]
        if rotulo.startswith("depois:"):
            return [{"massa": {id_: ctx["h"][q] for q, id_ in ctx["ids"].items()}, "criadas_c": 0, "n_marca": 2}]
        if rotulo == "fim":
            return [{"sobras": {t: 0 for t in DA_FILA}, "perfis": {id_: ctx["h"][alias] for alias, id_ in ctx["perfis"].items()}}]
        if rotulo == "limpar:sobras":
            return [{"sobras": {t: 0 for t in DA_FILA}}]
        return [{"n": 0}]

    def ler_principal(self, rotulo: str, sql: str) -> list[dict]:
        return self.ler(rotulo, sql)

    def escrever(self, sql: str) -> None:
        self.eventos.append({"tipo": "sql_escrita", "tabela": trava_escrita(sql), "sql": sql})

    def saude(self) -> tuple[bool, dict]:
        return saude_com_429(self._ler_saude, self._esperar)

    def _ler_saude(self) -> tuple[bool, dict]:
        """O /health do cenário: True (bom), False (ruim) ou 429 (a Management API recusou por ritmo — o {"http": 429} do B19.saude)."""
        v = self.saudes.pop(0) if self.saudes else True
        ok = v is True
        self.eventos.append({"tipo": "saude", "ok": ok, "v": v})
        if v == 429:
            return False, {"uxwpwd": {"http": 429}, "hkxvts": {"db": "ACTIVE_HEALTHY"}}
        return ok, {"seco": "ACTIVE_HEALTHY" if ok else "UNHEALTHY"}

    def _esperar(self, s: float) -> None:
        self.eventos.append({"tipo": "espera", "s": s})

    def pausa(self, s: float) -> None:
        self.eventos.append({"tipo": "pausa", "s": s})

    def sair(self, o, contas: list[str]) -> None:  # noqa: ARG002
        for k in [x for conta in contas for x in (f"treino:{conta}", conta)]:
            self.eventos.append({"tipo": "logout", "chave": k, "url": URL_LOGOUT["treino" if k.startswith("treino:") else "principal"]})


class SaidaMuda(C.Saida):
    """A Saida de um cenário do --seco: guarda as linhas (não imprime, não grava) — o --seco confere o resultado."""

    def linha(self, texto: str) -> None:
        self.linhas.append(texto)

    def fim(self) -> int:
        return 1 if self.falhas else 0


class EstadoNaMemoria(B.Estado):
    """O Estado do --seco: na memória (o e2e_estado.json de verdade não é tocado)."""

    def __init__(self, dados: dict | None = None) -> None:
        super().__init__(dados)
        self.gravacoes, self.apagado = 0, False

    def salvar(self) -> None:
        self.gravacoes += 1

    def apagar(self) -> None:
        self.apagado = True


class SemRede:
    """No --seco, toda função de rede vira uma que anota e recusa (a prova de que o --seco não vai à rede)."""

    def __init__(self) -> None:
        self.tentativas = 0
        self._orig: list[tuple] = []

    def _recusa(self, *_a, **_k):
        self.tentativas += 1
        raise RuntimeError("rede no --seco — recusado")

    def __enter__(self) -> SemRede:
        for mod, nome in ((B5, "http"), (C, "http"), (C.C2, "http"), (urllib.request, "urlopen"), (subprocess, "run")):
            self._orig.append((mod, nome, getattr(mod, nome)))
            setattr(mod, nome, self._recusa)
        return self

    def __exit__(self, *_a) -> None:
        for mod, nome, f in self._orig:
            setattr(mod, nome, f)


def cenario(cen: dict | None = None, tabelas: tuple[str, ...] = ORDEM, so_massa: frozenset[str] = frozenset()) -> tuple[D3, TransporteSeco, int]:
    """Roda o D3 inteiro (o MESMO código da execução de verdade) com o transporte do --seco → (o D3, o transporte, o código de saída)."""
    tr = TransporteSeco(cen)
    so = SaidaMuda("d3_powersync_seco_cenario")
    d3 = D3(so, tr, EstadoNaMemoria({"rodada": "seco", "schema": S, "area": CHAVE, "linhas": [], "storage": [], "n8": None}), tabelas,
            so_massa, 2.0, "10140000-seco", "2026-10-14 00:00:00+00")
    tr.d3 = d3
    try:
        d3.rodar()
    except ParouSaude:
        pass
    except (Exception, SystemExit) as e:  # noqa: BLE001
        if not getattr(e, "impresso", False):
            so.ok(False, f"parou no meio: {motivo(e)}", parar=False)
    finally:
        d3.fechar()
        d3.resumo()
    return d3, tr, so.fim()


def recusa(f, *a) -> bool:
    """f(*a) sai com SystemExit/Parou (a trava funcionou) antes de qualquer rede."""
    try:
        with contextlib.redirect_stderr(io.StringIO()):
            f(*a)
    except (SystemExit, C.Parou):
        return True
    return False


def seco(o) -> None:
    with SemRede() as rede:
        _seco(o)
    o.ok(rede.tentativas == 0, f"sem rede: {rede.tentativas} tentativa(s) de rede no --seco inteiro (nenhum login, nenhum pedido ao REST, nenhum SQL)")


def _seco(o) -> None:
    # ── 0. a trava de ambiente (decisão L): qualquer alvo fora do staging do Treino sai ANTES da rede ──
    o.ok(recusa(argumentos, ["--base", "prod"]) and recusa(argumentos, ["--schema", "public"]) and recusa(argumentos, ["--base", "public"])
         and not recusa(argumentos, ["--seco"]),
         "[L] a trava de ambiente: --base prod, --schema public e --base public saem com erro antes de qualquer rede (não há opção de produção)")
    o.ok(recusa(exigir_alvo, "prod") and recusa(exigir_alvo, S, "public") and recusa(exigir_alvo, S, S, "hkxvtsbwctxkrqzkkdoz")
         and recusa(exigir_alvo, S, S, TREINO_REF, "https://api-principal.physiqcalc.com.br") and not recusa(exigir_alvo),
         "[L] o alvo fixo: só o schema staging, só o projeto do Treino, só o domínio do app (api.physiqcalc.com.br)")
    ruim = Pedido("public.tb_academias", "a", "A", A, "GET", f"id=eq.{FALSO[A]}&select=id", None, ("linhas", 200, 1), False, "x", FALSO[A])
    fora = Pedido("tb_exercicios", "a", "A", A, "GET", f"id=eq.{FALSO[A]}&select=id", None, ("linhas", 200, 1), False, "x", FALSO[A])
    sem_sel = Pedido("tb_academias", "a", "A", A, "GET", f"id=eq.{FALSO[A]}", None, ("linhas", 200, 1), False, "x", FALSO[A])
    perfil_post = Pedido("physiq_profiles", "massa", "A", A, "POST", "select=id", {"id": FALSO[A]}, ("linhas", 201, 1), False, "x", FALSO[A])
    perfil_del = Pedido("physiq_profiles", "b", "A", A, "DELETE", f"id=eq.{FALSO[A]}&select=id", None, ("linhas", 200, 0), True, "x", FALSO[A])
    em_massa = Pedido("tb_academias", "b", "A", A, "DELETE", "user_id=eq.x&select=id", None, ("linhas", 200, 0), True, "x", None)
    o.ok(all(recusa(trava_pedido, x) for x in (ruim, fora, sem_sel, perfil_post, perfil_del, em_massa)),
         "a trava do pedido: public./tabela fora das 15/sem select=id/POST ou DELETE na physiq_profiles/DELETE sem o id → recusados")
    o.ok(recusa(trava_leitura, "select * from public.tb_academias") and recusa(trava_leitura, "delete from staging.tb_academias")
         and recusa(trava_leitura, "select 1; select 2") and not recusa(trava_leitura, sql_catalogo()),
         "a trava da leitura: public., palavra de escrita e 2 instruções → recusados (o catálogo passa)")
    donos = [FALSO[A], FALSO[P]]
    boa = sql_apagar("tb_academia_pesos", donos, [FALSO["ex1"]])
    o.ok(trava_escrita(boa) == "tb_academia_pesos" and trava_escrita(sql_apagar("tb_semana_treinos", donos, [])) == "tb_semana_treinos"
         and recusa(trava_escrita, boa.replace("staging.", "public.")) and recusa(trava_escrita, boa.replace("tb_academia_pesos", "tb_exercicios", 1))
         and recusa(trava_escrita, boa + " delete from staging.tb_academias where true;") and recusa(sql_apagar, "physiq_profiles", donos, [])
         and recusa(trava_escrita, boa.replace(f"any(array['{FALSO[A]}', '{FALSO[P]}']::uuid[])", "any(array[]::uuid[])"))
         and recusa(trava_escrita, boa.replace("academia_id in", "true or academia_id in")),
         "a trava da escrita (o --limpar sem sessão): só o DELETE de 1 das 14, staging, os 2 donos, os ids/a marca — o resto recusado")
    fonte = Path(__file__).read_text(encoding="utf-8")
    textos = [n.value for n in ast.walk(ast.parse(fonte)) if isinstance(n, ast.Constant) and isinstance(n.value, str)]
    outro_escopo = re.compile("scope" + "=" + "(?!local)")
    o.ok(not any(outro_escopo.search(x) for x in textos) and all(u.endswith("/auth/v1/logout?scope=local") for u in URL_LOGOUT.values()),
         "nenhum logout com outro escopo no código (só o escopo local — a LINUX 3 usa as mesmas contas)")
    vazio = EstadoNaMemoria()
    com = {k: EstadoNaMemoria() for k in ("hml21d", "hml21e", "linhas", "foto")}
    com["hml21d"].d[B.CHAVE_21D] = {"donos": [FALSO[A]], "linhas": [], "storage": []}
    com["hml21e"].d[CHAVE] = {"donos": donos, "linhas": []}
    com["linhas"].d["linhas"] = [["x", FALSO[A]]]
    com["foto"].d["hml21_foto"] = {"url": "x"}
    o.ok(pode_abrir(vazio) and not any(pode_abrir(e) for e in com.values()) and B.tem_massa_21e(com["hml21e"]) and not B.tem_massa_21e(vazio),
         "o Estado: o D3 não abre por cima de outra rodada (a 21d, a 21e, a hml-19, a foto da 21a) e o tem_massa_21e do _base.py acha a chave hml21e")

    class _ComD3(EstadoNaMemoria):  # o Estado "lido" com a massa do D3 pendente (na memória: nada vai ao e2e_estado.json)
        @classmethod
        def ler(cls) -> _ComD3:
            e = cls()
            e.d[CHAVE] = {"donos": donos, "linhas": [["tb_academias", FALSO["ex1"], FALSO[A]]]}
            return e
    original, B.Estado = B.Estado, _ComD3
    try:
        recusou = recusa(B.abrir_rodada, SaidaMuda("d3_powersync_seco_abrir"), S)
    finally:
        B.Estado = original
    o.ok(recusou and "tem_massa_21e(estado)" in inspect.getsource(B.fechar_rodada),
         "o _base.py por acréscimo: com a massa do D3 no Estado, o abrir_rodada da 21a–21d RECUSA (rode o --limpar) e o fechar_rodada não apaga o Estado")

    # ── 1. o cenário normal = o PLANO dos pedidos ──
    d3, tr, cod = cenario()
    ev = tr.eventos
    rest = [e for e in ev if e["tipo"] == "rest"]
    sqls = [e for e in ev if e["tipo"] == "sql"]
    o.linha("\n## o plano dos pedidos (cenário normal, sem rede; ids e valores não saem — o --seco responde o ESPERADO de cada caso)")
    for e in rest:
        p = e["p"]
        o.linha(f"   · [{p.tabela}] {CASO_TXT[p.caso]} {p.direcao} {p.metodo} {p.rotulo} → esperado {esperado_txt(p.esperado)}")
    o.linha(f"   SQL só leitura ({len(sqls)}): " + ", ".join(e["rotulo"] for e in sqls))
    o.linha("")
    falsos = {FALSO[A], FALSO[P]}
    o.ok(cod == 0 and not d3.alertas and not d3.por_catalogo and all(x["resultado"] == "ok" for x in d3.placar),
         f"o cenário normal fecha 100 % (0 alerta, 0 falha, 0 por catálogo; {len(d3.placar)} linhas no placar)")
    o.ok(all(e["url"].startswith(f"{API_T}/rest/v1/") and e["cab"]["x-schema"] == S and e["cab"].get("Accept-Profile", e["cab"].get("Content-Profile")) == S
             and "public" not in e["url"] for e in rest) and all("public." not in e["sql"].lower() for e in sqls),
         f"só o staging em todo pedido ({len(rest)}: o domínio do app, x-schema e Accept/Content-Profile = staging) e em todo SQL ({len(sqls)}: nenhum public.)")
    o.ok({e["p"].tabela for e in rest} == set(ORDEM) and all(e["p"].tabela in TABELAS for e in rest), "só as 15 tabelas da fila (e as 15 visitadas)")
    corpos = [e["p"].corpo for e in rest if e["p"].corpo and "user_id" in e["p"].corpo]
    o.ok(corpos and all(c["user_id"] in falsos for c in corpos), f"os user_id só dos 2 donos ({len(corpos)} corpos)")
    posts = [e["p"] for e in rest if e["p"].metodo == "POST"]
    patches = [e["p"] for e in rest if e["p"].metodo == "PATCH"]
    o.ok(all(set(OBRIGATORIAS[p.tabela]) <= set(p.corpo) and set(p.corpo) <= set(COLUNAS[p.tabela]) for p in posts)
         and all(len(p.corpo) == 1 and set(p.corpo) <= set(COLUNAS[p.tabela]) for p in patches),
         f"cada corpo: TODAS as obrigatórias + só colunas do retrato de {RETRATO_DE} ({len(posts)} PUT; {len(patches)} PATCH com 1 coluna)")
    marca = f"{MARCA} {d3.rodada}"
    massa_de = {(e["p"].tabela, e["p"].quem): e["p"].alvo_id for e in rest if e["p"].caso == "massa"}
    o.ok(all(p.corpo[COLUNA_MARCA[p.tabela]].startswith(marca) for p in posts if p.tabela in COLUNA_MARCA)
         and all(p.corpo[c].startswith(SENTINELA) for p in posts for c in COLUNA_DATA.get(p.tabela, ()))
         and all(p.corpo[COLUNA_PAI[p.tabela]] in {massa_de[(PAI_DE[p.tabela], q)] for q in (A, P)} for p in posts if p.tabela in COLUNA_PAI),
         f"a marca \"{MARCA} <rodada>\" em toda tabela com texto ({len(COLUNA_MARCA)}), a sentinela {SENTINELA}NN nas de data ({len(COLUNA_DATA)}) "
         f"e o pai DE MASSA nas {len(COLUNA_PAI)} sem texto nem data")
    o.ok(all(e["anotado"] for e in rest if e["p"].metodo == "POST"), f"o id de cada POST anotado no Estado ANTES do pedido ({len(posts)})")
    da_outra = [p for p in patches if p.nega]
    dono_da_linha = {id_: q for (_t, q), id_ in massa_de.items()} | {FALSO[x]: x for x in (A, P, "sozinho", "w13_aluno")}
    o.ok(all(isinstance(v, Lido) and v.tabela == p.tabela and v.coluna == COLUNA_PATCH[p.tabela] and v.quem == dono_da_linha[p.alvo_id]
             and v.leitura == ("antes_d" if p.tabela == "physiq_profiles" else "") for p in patches for v in p.corpo.values())
         and all(v.quem != p.quem for p in da_outra for v in p.corpo.values()),
         f"todo PATCH ({len(patches)}) grava o valor de AGORA da PRÓPRIA linha, lido por SQL (o marcador; o foto_url do (d) da releitura logo "
         f"antes dele): os {len(da_outra)} \"da outra\" com o "
         "valor da outra — mesmo com o RLS quebrado, nada mudaria")
    o.ok(all(set(p.corpo) <= set(d3.colunas_que_manda(p.tabela)) for p in posts + patches),
         "os corpos usam só as colunas que a pré-condição confere no catálogo vivo (colunas_que_manda)")
    dels = [e["p"] for e in rest if e["p"].metodo == "DELETE"]
    o.ok(all(p.alvo_id in massa_de.values() for p in dels), f"todo DELETE ({len(dels)}: da outra e a limpeza) só em id de massa do próprio D3")
    o.ok(not any(e["p"].tabela == "physiq_profiles" and e["p"].metodo in ("POST", "DELETE") for e in rest), "a physiq_profiles sem POST/DELETE")
    hist = [p for p in patches if p.tabela == "treino_historico" and not p.nega]
    o.ok(len(hist) == 2 and all(p.esperado == ("linhas", 200, 0) for p in hist), "o treino_historico: o PATCH do dono com o 0 esperado (sem policy de UPDATE)")
    alvos_d = {e["p"].direcao for e in rest if e["p"].caso == "d"}
    o.ok(alvos_d == {"P×A", "P×sozinho", "P×w13_aluno"} and C.eh_email_de_teste(EMAIL[SOZINHO]) and C.eh_email_de_teste(EMAIL[DONO_W13]),
         "o (d) com os 2 alvos de TESTE (a w7b-sozinho e o aluno de TESTE da w13-dono; o e-mail conferido na execução) + a aluna dele")
    o.ok(all("select=id" in e["p"].consulta.split("&") for e in rest) and all("return=representation" in (e["cab"].get("Prefer") or "")
                                                                           for e in rest if e["p"].metodo != "GET"),
         "toda resposta pedida com select=id (e o return=representation nas gravações: contar as linhas)")
    o.ok(all(_ESCRITA.search(re.sub(r"'[^']*'", "''", e["sql"])) is None for e in sqls), f"o SQL de leitura sem palavra de escrita ({len(sqls)})")
    logouts = [e for e in ev if e["tipo"] == "logout"]
    o.ok(len(logouts) == 4 and all(e["url"].endswith("/auth/v1/logout?scope=local") for e in logouts),
         "no fim, o logout de escopo local SÓ das 4 sessões desta execução (Treino e principal das 2 contas)")
    i_troca = [i for i, e in enumerate(ev) if e["tipo"] == "troca"]
    i_sql = {e["rotulo"]: i for i, e in enumerate(ev) if e["tipo"] == "sql"}
    i_perfil = next(i for i, e in enumerate(ev) if e["tipo"] == "rest" and e["p"].tabela == "physiq_profiles")
    o.ok(len(i_troca) == 2 and all(i_sql[r] < i_troca[0] for r in ("uid:A", "identidade:A", "uid:P", "identidade:P", "catalogo", "exercicios",
                                                                   "comeco"))
         and i_sql["perfis"] > i_troca[-1] and not any(e["tipo"] == "rest" for e in ev[:i_troca[0]]),
         "a pré-condição INTEIRA por SQL só leitura (os 2 ids do Treino pelo login do principal → o physiq_identidades, o e-mail no Auth do "
         "Treino, os perfis, os papéis, o professor, o acesso, os alvos (d), 0 sobra) ANTES do 1º login; 4 logins planejados (2 contas × o "
         "login + a troca); o md5 e o foto_url do começo DEPOIS das trocas")
    o.ok([e["tipo"] for e in ev[i_perfil - 1:i_perfil]] == ["sql"] and ev[i_perfil - 1]["rotulo"] == "perfis_antes_d",
         "o foto_url e o md5 dos 4 perfis lidos de NOVO logo antes do (d) (a revisão: nunca o valor do começo)")
    primeira = [e["p"].tabela for e in rest]
    vistas = list(dict.fromkeys(primeira))
    limpezas_pais = [e["p"].tabela for e in rest if e["p"].caso == "limpeza" and e["p"].tabela in PAIS]
    o.ok(vistas == list(ORDEM) and limpezas_pais == [t for t in reversed(PAIS) for _ in (A, P)] and all(
        primeira.index(t) < primeira.index(f) for f, t in PAI_DE.items()),
         "a ordem: os pais primeiro (tb_academias, tb_grupos_treino_usuario, tb_exercicios_usuario — vivos até o fim), os filhos depois, a "
         "limpeza dos pais ao contrário")
    saudes = [i for i, e in enumerate(ev) if e["tipo"] == "saude"]
    pausas = [e for e in ev if e["tipo"] == "pausa"]
    o.ok(len(saudes) == 4 and saudes[0] == 0 and len(pausas) == len(ORDEM) - 1 and all(e["s"] == 2.0 for e in pausas),
         f"o ritmo: o /health no começo, a cada 5 tabelas e antes da limpeza dos pais ({len(saudes)}); {len(pausas)} pausas de 2 s entre as tabelas")
    por_t = {t: sum(1 for e in sqls if e["rotulo"].endswith(f":{t}")) for t in DA_FILA}
    o.ok(all(n == 2 for n in por_t.values()), "o SQL de conferência em lote: 2 consultas por tabela (o ANTES e o DEPOIS), nunca uma por caso")
    o.ok(not d3.estado.d.get(CHAVE) and d3.estado.apagado, "no fim, o Estado sem a chave hml21e (a massa desfeita e conferida)")
    casos = {}
    for e in rest:
        casos[CASO_TXT[e["p"].caso]] = casos.get(CASO_TXT[e["p"].caso], 0) + 1
    o.linha(f"\n## o placar planejado: {len(rest)} pedidos REST em série (1 por vez) · {len(sqls)} SQL só leitura (4 delas os ids ANTES do "
            f"login) · 4 logins (2 contas × login + "
            f"troca) · tabelas com massa {len({t for t, _q in massa_de})}/14 · por catálogo 0 · physiq_profiles: (a)(b)(d) sem massa")
    o.linha("   por caso: " + " · ".join(f"{k} {v}" for k, v in casos.items()))
    o.linha("   por tabela (as 14): massa 2 (A, P) · (a) 4 (cada dono a sua + a da outra, nas 2 direções) · (b) 6 (PATCH e DELETE da outra + o PATCH "
            "do dono, nas 2 direções) · (c) 2 · (c′) 2 · limpeza 2 = 18 pedidos + 2 SQL (o ANTES e o DEPOIS)")
    o.linha("   physiq_profiles: (a) 3 (A×P, A, P) · (b) 3 (A×P, A, P) · (d) 6 (P×A ler/atualizar; P×sozinho e P×w13_aluno ler/atualizar) + 1 SQL")
    o.ok(len(rest) == 14 * 18 + 12, f"o total planejado: 14 × 18 + 12 = {14 * 18 + 12} pedidos ({len(rest)})")

    # ── 2. os controles: o D3 reage como o contrato manda ──
    d3, tr, cod = cenario({"rest": {("tb_academias", "a", "A×P", "GET"): (200, [{"id": "x"}])}})
    rest = [e for e in tr.eventos if e["tipo"] == "rest"]
    o.ok(len(d3.alertas) == 1 and "tb_academias" in d3.alertas[0] and cod == 1 and {e["p"].tabela for e in rest} == set(ORDEM)
         and not d3.estado.d.get(CHAVE) and any("PAROU D3" in x for x in d3.o.linhas),
         "[controle] um ALERTA (a aluna lê a academia do personal): 🔴 no placar, o D3 segue as outras 14 tabelas, limpa tudo e pede o ## PAROU")
    cat = TransporteSeco().ler("catalogo", sql_catalogo())
    for x in cat:
        if x["tabela"] == "tb_semana_treinos":
            x["policies"] = [["Usuario acessa propria semana", "ALL", "{authenticated}", "true", "true"]]
        if x["tabela"] == "tb_academias":
            x["gatilhos"] = ["um_gatilho_novo"]
    d3, tr, cod = cenario({"sql": {"catalogo": cat}})
    rest = [e for e in tr.eventos if e["tipo"] == "rest"]
    o.ok(set(d3.por_catalogo) == {"tb_semana_treinos", "tb_academias", "tb_academia_pesos"} and not any(
        e["p"].tabela in d3.por_catalogo for e in rest) and cod == 1,
         "[controle] o catálogo mudou (uma policy na tb_semana_treinos, um gatilho na tb_academias): as 2 + o filho tb_academia_pesos viram POR "
         "CATÁLOGO, sem nenhum pedido; as outras seguem")
    d3, tr, cod = cenario({"saude": [True, False]})
    ev = tr.eventos
    i_ruim = next(i for i, e in enumerate(ev) if e["tipo"] == "saude" and not e["ok"])
    o.ok(d3.parou_saude and not any(e["tipo"] in ("rest", "logout", "sql") for e in ev[i_ruim + 1:]) and d3.estado.d.get(CHAVE, {}).get("linhas"),
         f"[controle] o /health ruim na tabela 6: NENHUM pedido a mais (nem a limpeza nem o logout); o Estado guarda a massa "
         f"({len(d3.estado.d[CHAVE]['linhas'])} linha(s)) para o --limpar")
    d3, tr, cod = cenario({"rest": {("tb_exercicio_comentarios", "massa", P, "POST"): (500, {"code": "XX000"})}})
    rest = [e for e in tr.eventos if e["tipo"] == "rest"]
    depois_500 = [e["tipo"] for e in tr.eventos[next(i for i, e in enumerate(tr.eventos) if e["tipo"] == "rest" and e["p"].tabela ==
                                                     "tb_exercicio_comentarios" and e["p"].quem == P) + 1:]][:1]
    o.ok(depois_500 == ["saude"] and not d3.estado.d.get(CHAVE) and any(e["p"].tabela == "tb_exercicio_comentarios" and e["p"].caso == "limpeza"
                                                                        for e in rest) and cod == 1,
         "[controle] a massa que falha (500): o /health na hora, a tabela pula os casos cruzados e a linha que nasceu sai na limpeza do fim")
    d3, tr, cod = cenario(tabelas=("tb_grupos_treino_usuario", "tb_series_padrao_usuario"), so_massa=frozenset({"tb_grupos_treino_usuario"}))
    rest = [e for e in tr.eventos if e["tipo"] == "rest"]
    o.ok([e["p"].caso for e in rest if e["p"].tabela == "tb_grupos_treino_usuario"] == ["massa", "massa", "limpeza", "limpeza"] and cod == 0
         and not d3.estado.d.get(CHAVE),
         "[controle] --tabelas tb_series_padrao_usuario: o pai entra SÓ com a massa (sem os casos) e sai no fim")

    # ── a revisão da etapa 1: o 429 do /health, a pré-condição antes do login, o sub do token, o ANTES vazio ──
    d3, tr, cod = cenario({"saude": [429, True]})
    ev = tr.eventos
    o.ok(not d3.parou_saude and cod == 0 and [e["s"] for e in ev if e["tipo"] == "espera"] == [60]
         and [e["v"] for e in ev if e["tipo"] == "saude"][:2] == [429, True] and not d3.estado.d.get(CHAVE),
         "[controle] um 429 da Management API no /health: espera 60 s e repete 1 vez — o 2º bom, o D3 segue e fecha 100 %")
    d3, tr, cod = cenario({"saude": [429, 429]})
    ev = tr.eventos
    o.ok(d3.parou_saude and not any(e["tipo"] in ("troca", "rest", "logout") for e in ev) and [e["s"] for e in ev if e["tipo"] == "espera"] == [60],
         "[controle] 429 de novo depois dos 60 s: saúde ruim — para, 0 login, 0 pedido")
    sem_login = []
    for nome, cen in (("a conta sem identidade no Treino", {"identidades": {A: []}}),
                      ("o e-mail no Auth do Treino ≠ o de teste", {"sql": {"comeco": [{**TransporteSeco().ler("comeco", sql_comeco(FALSO[A], FALSO[P]))[0],
                                                                                         "email_p": "outra.pessoa@exemplo.com"}]}}),
                      ("o professor da aluna ≠ o personal", {"sql": {"comeco": [{**TransporteSeco().ler("comeco", sql_comeco(FALSO[A], FALSO[P]))[0],
                                                                                   "professor_eh_o_personal": False}]}}),
                      ("o acesso do personal não passa", {"sql": {"comeco": [{**TransporteSeco().ler("comeco", sql_comeco(FALSO[A], FALSO[P]))[0],
                                                                                "acesso_ok": False}]}}),
                      ("sobra da massa de antes", {"sql": {"comeco": [{**TransporteSeco().ler("comeco", sql_comeco(FALSO[A], FALSO[P]))[0],
                                                                         "sobras": {**{t: 0 for t in DA_FILA}, "tb_academias": 1}}]}})):
        d3, tr, cod = cenario(cen)
        sem_login.append((nome, cod == 1 and not any(e["tipo"] in ("troca", "rest", "logout") for e in tr.eventos) and not d3.aberto
                          and not d3.estado.d.get(CHAVE)))
    o.ok(all(ok for _n, ok in sem_login), "[controle] a pré-condição que falha PARA ANTES de qualquer login (0 troca, 0 pedido, sem Estado): "
         + " · ".join(f"{n} {'ok' if ok else 'NÃO PAROU'}" for n, ok in sem_login))
    d3, tr, cod = cenario({"sub_errado": (P,)})
    ev = tr.eventos
    o.ok(cod == 1 and [e["conta"] for e in ev if e["tipo"] == "troca"] == [CONTAS[A], CONTAS[P]] and not any(e["tipo"] == "rest" for e in ev)
         and len([e for e in ev if e["tipo"] == "logout"]) == 4 and not d3.estado.d.get(CHAVE),
         "[controle] o sub do token ≠ o id do Treino da pré-condição: para logo depois da troca, sem massa, e o logout das 4 sessões abertas")
    d3, tr, cod = cenario({"sql": {"antes:tb_academias": []}})
    ev = tr.eventos
    rest = [e["p"] for e in ev if e["tipo"] == "rest"]
    o.ok(cod == 1 and [(p.caso, p.metodo) for p in rest] == [("massa", "POST"), ("massa", "POST"), ("limpeza", "DELETE"), ("limpeza", "DELETE")]
         and not d3.estado.d.get(CHAVE) and len([e for e in ev if e["tipo"] == "logout"]) == 4,
         "[controle] o ANTES sem as 2 linhas logo depois de 2 × 201: PARA (parar=True) e a limpeza do fim apaga as 2 pelo REST (o dono); o Estado sai")

    # ── 3. o --limpar (pelo Estado): como o dono pelo REST; sem sessão, por SQL com a trava ──
    for com_sessao in (True, False):
        est = EstadoNaMemoria()
        est.d[CHAVE] = {"schema": S, "rodada": "seco", "donos": donos, "linhas": [["tb_academias", FALSO["ex1"], FALSO[A]],
                        ["tb_academia_pesos", FALSO["ex2"], FALSO[A]], ["tb_academias", FALSO["w13_aluno"], FALSO[P]]],
                        "perfis": {A: FALSO[A], P: FALSO[P]}, "perfis_md5": {A: "md5-perfil-A", P: "md5-perfil-P"}}
        tr = TransporteSeco(com_sessao=com_sessao)
        tr.estado = est
        so = SaidaMuda("d3_powersync_seco_limpar")
        limpar(so, tr, est)
        rest = [e["p"].tabela for e in tr.eventos if e["tipo"] == "rest"]
        escr = [e["tabela"] for e in tr.eventos if e["tipo"] == "sql_escrita"]
        if com_sessao:
            o.ok(rest == ["tb_academia_pesos", "tb_academias", "tb_academias"] and not escr and not so.falhas and est.apagado,
                 "[--limpar] com a sessão guardada (sem login): o dono apaga pelo REST, os filhos antes dos pais; conferido; o Estado sai")
        else:
            o.ok(not rest and escr == ["tb_academia_pesos", "tb_academias"] and not so.falhas and est.apagado,
                 "[--limpar] sem sessão: o DELETE por SQL com a trava (1 por tabela, os filhos antes dos pais); conferido por leitura; o Estado sai")


# ───────────────────────── a execução ─────────────────────────
def argumentos(argv: list[str] | None = None) -> argparse.Namespace:
    ap = argparse.ArgumentParser(description="hml-21e — o D3 do PowerSync por efeito (as 15 tabelas da fila no staging do Treino)")
    ap.add_argument("--seco", action="store_true", help="o plano dos pedidos, os controles e as travas — sem rede (etapa 1)")
    ap.add_argument("--limpar", action="store_true", help="desfaz a massa pelo Estado (a chave hml21e)")
    ap.add_argument("--sair", action="store_true", help="o logout (escopo local) das sessões das 2 contas que ficaram guardadas")
    ap.add_argument("--tabelas", default="", help="só estas (separadas por vírgula; o pai entra só com a massa)")
    ap.add_argument("--pausa-s", type=float, default=2.0, help="a pausa entre as tabelas (s)")
    ap.add_argument("--base", default="staging", choices=("staging",), help="só o staging (não há produção)")
    ap.add_argument("--schema", default="staging", choices=("staging",), help="só o schema staging do Treino")
    return ap.parse_args(argv)


def escolher(tabelas: str) -> tuple[tuple[str, ...], frozenset[str]]:
    """As tabelas da execução (na ORDEM) e os pais que entram só com a massa (um filho pedido sem o pai)."""
    pedidas = [x.strip() for x in tabelas.split(",") if x.strip()]
    if not pedidas:
        return ORDEM, frozenset()
    fora = [x for x in pedidas if x not in TABELAS]
    if fora:
        raise SystemExit(f"tabelas fora das 15 da fila: {fora}")
    so_massa = frozenset(PAI_DE[t] for t in pedidas if t in PAI_DE and PAI_DE[t] not in pedidas)
    return tuple(t for t in ORDEM if t in pedidas or t in so_massa), so_massa


def main(argv: list[str] | None = None) -> int:
    a = argumentos(argv)
    exigir_alvo(a.base, a.schema)
    B.corte_vira_saida()
    if a.seco:
        o = C.Saida("d3_powersync_seco")
        o.linha(f"o D3 do PowerSync em --seco: o plano, os controles e as travas — sem rede, sem login (o retrato do catálogo: {RETRATO_DE})")
        try:
            seco(o)
        except (Exception, SystemExit) as e:  # noqa: BLE001
            o.ok(False, f"o --seco parou: {motivo(e)}")
        return o.fim()
    B.usar_base("staging")
    if a.limpar or a.sair:
        o = C.Saida("d3_powersync_limpar" if a.limpar else "d3_powersync_sair")
        try:
            L = B.Sessoes("hml-21e D3 do PowerSync (d3_powersync.py)")
            tr = Transporte(o, L)
            if a.limpar:
                limpar(o, tr, B.Estado.ler())
            else:
                B.exigir_saude(o, "o --sair do D3")
                tr.sair(o, list(CONTAS.values()))
        except (Exception, SystemExit) as e:  # noqa: BLE001
            if not getattr(e, "impresso", False):
                o.ok(False, f"parou no meio: {motivo(e)}")
        C.C2.registrar_rodada(o.oks, o.oks + o.falhas)
        return o.fim()
    tabelas, so_massa = escolher(a.tabelas)
    o = C.Saida("d3_powersync_staging" if not a.tabelas else "d3_powersync_staging_tabelas")
    d3 = None
    try:
        if not pode_abrir(B.Estado.ler()):
            o.ok(False, "há uma rodada pendente no Estado (hml19/agente/e2e_estado.json): rode o --limpar dela antes", parar=True)
        L = B.Sessoes("hml-21e D3 do PowerSync (d3_powersync.py)")
        rodada = B.nova_rodada()
        inicio = (dt.datetime.now(dt.timezone.utc) - dt.timedelta(seconds=5)).strftime("%Y-%m-%d %H:%M:%S+00")
        d3 = D3(o, Transporte(o, L), B.Estado({"rodada": rodada, "schema": S, "area": CHAVE, "linhas": [], "storage": [], "n8": None}),
                tabelas, so_massa, a.pausa_s, rodada, inicio)
        d3.rodar()
    except ParouSaude:
        pass
    except (Exception, SystemExit) as e:  # noqa: BLE001
        if not getattr(e, "impresso", False):
            o.ok(False, f"parou no meio: {motivo(e)}")
    finally:
        if d3 is not None:
            d3.fechar()
            d3.resumo()
            d3.gravar_planilha()
    C.C2.registrar_rodada(o.oks, o.oks + o.falhas)
    return o.fim()


if __name__ == "__main__":
    raise SystemExit(main())
