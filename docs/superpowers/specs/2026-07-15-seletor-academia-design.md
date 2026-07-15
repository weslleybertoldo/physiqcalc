# Seletor de Academia — pesos por academia (15/07/2026)

## Objetivo
O usuário treina em academias diferentes com aparelhos/cargas diferentes. Ele salva os pesos
do treino por academia e, ao trocar de academia, o treino do dia passa a usar os pesos salvos dela.

## Comportamento (validado com Weslley)
- Seletor de academia entre a faixa da semana e o "Treino do dia" (TreinosPage).
- "+ Adicionar academia": cria academia pelo nome. Academias são POR USUÁRIO (não compartilhadas).
- Botão "Salvar treino": abre confirmação **"Certeza que quer salvar os pesos na academia X?"**
  → grava (upsert) o peso de CADA série de TODAS as séries do dia em `tb_academia_pesos`.
- Trocar academia no seletor: abre confirmação **"Realmente quer trocar de academia?"**
  → confirmando, os pesos das séries do treino do dia viram os salvos da nova academia;
  série sem referência na academia nova = **0kg**. Estrutura do treino (exercícios/séries/reps) não muda.
- Histórico: cada série registrada guarda a academia do momento → "S1 13.0kg × 10 reps - (smartfit)".
  Histórico preserva todos os pesos de todas as academias (nunca reescreve o passado).
- Academia atual lembrada no aparelho (localStorage). v1 sem renomear/excluir academia (YAGNI).

## Dados
- `tb_academias` (id uuid pk, user_id uuid, nome text, created_at) — RLS ALL `auth.uid() = user_id`.
- `tb_academia_pesos` (id uuid pk, user_id, academia_id → tb_academias cascade, exercicio_id null,
  exercicio_usuario_id null, numero_serie int, peso real, updated_at) — RLS idem;
  UNIQUE (user_id, academia_id, coalesce(exercicio_id::text,''), coalesce(exercicio_usuario_id::text,''), numero_serie).
- `tb_treino_series` + coluna `academia_nome text null` (denormalizado de propósito: tag histórica).
- Publication `powersync` inclui as 2 tabelas novas; sync stream by_user; schema.ts do cliente espelha.
- Schemas public E staging (staging = escritas isoladas; sync-down lê public).

## Descartado
- JSON blob de pesos por academia (pior pra merge offline do PowerSync).
- Tabela para "academia atual" (localStorage resolve).
