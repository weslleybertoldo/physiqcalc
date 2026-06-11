# Treino Diário no perfil do usuário (admin) — semana recorrente multi-treino

Data: 2026-06-11
Branch: `feat/admin-semana-usuario`

## Problema

Hoje o admin não tem onde montar a programação semanal de um usuário específico. A
única UI de semana (`AdminTreinos` aba "Semana", `handleSemanaChange`) é **legada e
global** (faz `upsert` sem `user_id`, `onConflict: "dia_semana"`) — quebrada desde a
migração per-user (v2.41). A semana de cada usuário (`tb_semana_treinos`) só é editável
hoje pelo próprio usuário no app, e mesmo assim com **1 treino por dia** (UNIQUE
`user_id, dia_semana`).

Objetivo: no painel "Configurar Usuário" (`AdminUserConfig`), uma seção **Treino Diário**
onde o admin vê os 7 dias da semana e, em cada dia, marca via checkbox quais treinos
(grupos disponíveis ao usuário) aparecem **recorrentemente** naquele dia. Vários treinos
por dia, repetindo toda semana. Marcar reflete na hora na semana do usuário; o que o
usuário já configurou manualmente aparece pré-marcado para o admin.

## Decisões

- **Recorrência multi-treino**: a semana passa de 1/dia para N/dia, usando `slot_idx`
  (mesma lógica que `tb_treino_dia_override` / `tb_treino_series` / `tb_treino_concluido`
  já adotaram na v2.38). NÃO se mexe no mecanismo de override por data — ele continua
  como está e tem precedência sobre a semana, como hoje.
- **7 dias** (DOM–SAB). Pode haver treino em sábado/domingo. Nenhum marcado = descanso.
- **Salvar na hora** (toggle por checkbox), igual ao bloco "Quem vê este treino" do
  `AdminTreinos` — não depende do botão "Salvar" do perfil.
- **Remover** a aba/handler de Semana legada do `AdminTreinos` (global, quebrada).

## Arquitetura

### 1. Schema — `tb_semana_treinos`

Migration (Dev + Prod, via Management API com PAT):

```sql
ALTER TABLE public.tb_semana_treinos
  ADD COLUMN IF NOT EXISTS slot_idx INTEGER NOT NULL DEFAULT 0;
ALTER TABLE public.tb_semana_treinos
  DROP CONSTRAINT IF EXISTS tb_semana_treinos_user_id_dia_semana_key;
ALTER TABLE public.tb_semana_treinos
  ADD CONSTRAINT tb_semana_treinos_user_dia_slot_key
  UNIQUE (user_id, dia_semana, slot_idx);
```

- RLS atual (`auth.uid() = user_id` para ALL) permanece — cobre leitura/escrita do próprio
  usuário. Escrita do admin para terceiros vai por edge function service_role.
- `tb_semana_treinos` já está na publication `powersync` e no stream `by_user`
  (`WHERE user_id = auth.user_id()`) — sem mudança de sync rule. Após migration, rodar
  o workflow keep-alive (`deploy sync-config`) para reprocessar.
- Linhas existentes ficam com `slot_idx = 0` (backward compat — a semana atual da Lívia
  continua válida).

### 2. PowerSync schema (`src/lib/powersync/schema.ts`)

Adicionar `slot_idx: column.integer` na definição de `tb_semana_treinos`. Re-sync
automático no próximo reload do cliente.

### 3. Edge function nova — `admin-semana-treinos`

Padrão das `admin-*`: `requireAdmin(req)` (valida JWT + `app_metadata.role === 'admin'`),
`checkRateLimit`, CORS allowlist incluindo `https://localhost` e `capacitor://localhost`.
`verify_jwt = true`. Service role bypassa RLS.

Actions:

- `get { userId }` → retorna:
  ```jsonc
  {
    "semana": [ { "dia_semana": "SEG", "slot_idx": 0, "grupo_id": "...", "grupo_usuario_id": null }, ... ],
    "gruposDisponiveis": [
      { "id": "...", "nome": "Treino A · Quadríceps", "tipo": "catalogo" },   // via tb_grupos_treino_perfis
      { "id": "...", "nome": "Upper A", "tipo": "pessoal" }                    // via tb_grupos_treino_usuario
    ]
  }
  ```
  - catálogo: `SELECT g.id, g.nome FROM tb_grupos_treino g JOIN tb_grupos_treino_perfis p ON p.grupo_id = g.id WHERE p.user_id = userId`.
  - pessoais: `SELECT id, nome FROM tb_grupos_treino_usuario WHERE user_id = userId`.

- `setDia { userId, dia_semana, grupos: [ { grupo_id } | { grupo_usuario_id } ] }` →
  substitui o conjunto daquele dia: `DELETE WHERE user_id = userId AND dia_semana = dia`,
  depois `INSERT` uma linha por grupo com `slot_idx` 0..n. Lista vazia = dia de descanso.
  Valida `dia_semana ∈ {DOM,SEG,TER,QUA,QUI,SEX,SAB}` e que cada grupo pertence aos
  `gruposDisponiveis` do usuário (evita injeção de grupo de terceiro).

Rate limits: `get` 60/min, `setDia` 60/min.

### 4. Frontend admin — `AdminSemanaUsuario.tsx` (novo)

Componente isolado, props `{ userId: string }`. Renderizado no fim do `AdminUserConfig`
(após "Observação da Avaliação", antes ou depois do botão Salvar — seção própria).

- `useEffect` chama `admin-semana-treinos` `get` → guarda `semana` e `gruposDisponiveis`.
- Renderiza os 7 dias (ordem SEG→DOM para leitura, mas armazena os códigos corretos).
  Para cada dia, uma lista de checkboxes (um por grupo disponível); marcado quando o grupo
  está na semana daquele dia.
- onToggle(dia, grupo): monta o novo conjunto do dia (marcados) e chama `setDia`; atualiza
  estado local otimista + revalida. Toast em erro.
- Estado vazio: se `gruposDisponiveis` está vazio, mostra aviso "Nenhum treino atribuído a
  este usuário — atribua grupos na aba Gerenciar Treinos › Grupos".

### 5. App do usuário — `TreinosPage.tsx`

- Query `semanaRows`: adicionar `s.slot_idx` ao SELECT; `SemanaConfig` ganha `slot_idx`.
- `getSlotsForDate`: o ramo da semana (quando não há override) troca
  `semanaConfig.find(s => s.dia_semana === diaSemana)` por `.filter(...)`, ordena por
  `slot_idx` e mapeia para N `DiaSlot` (cada um com seu `slot_idx`, grupo e exercícios).
  O ramo de override permanece intacto e continua com precedência.
- Resto do fluxo (conclusão por slot, override, "+ Adicionar treino") não muda.

### 6. Limpeza — `AdminTreinos.tsx`

Remover a UI da aba "Semana" e o `handleSemanaChange` legado (global, sem `user_id`).
Remover o carregamento `smRes`/`setSemanaConfig` se ficar órfão. Não tocar nas abas
Biblioteca/Grupos/Relatório.

## Fluxo de dados

Admin marca checkbox → `setDia` (service_role grava `tb_semana_treinos` do usuário com
`slot_idx`) → PowerSync replica via stream `by_user` para o device do usuário → `TreinosPage`
lê N linhas da semana e `getSlotsForDate` materializa N slots no dia → usuário vê os treinos.

## Erros / segurança

- `setDia` valida dia válido e que cada grupo pertence aos disponíveis do usuário.
- Sem `userId` ou dia inválido → 400. Não-admin → 403. Rate limit → 429.
- Falha de gravação → toast no admin, sem alterar estado otimista (revalida do servidor).

## Testes

- Unit (vitest): `getSlotsForDate` com semana multi-slot (2 grupos no mesmo dia) retorna 2
  slots ordenados; com override no dia, override vence; dia sem config → `[]`.
- Manual: marcar 2 treinos numa segunda no admin → recarregar app do usuário → ambos
  aparecem na segunda e nas segundas seguintes. Desmarcar → some. Sábado/domingo idem.
- Edge function: `get` retorna disponíveis corretos; `setDia` com grupo de terceiro → erro.

## Deploy (protocolo local→staging→prod; PhysiqCalc não tem staging → Dev PowerSync faz as vezes)

1. Worktree `physiqcalc-semana-usuario` (feito).
2. Migration no **Dev** (Supabase é único; a migration é a mesma — aplicar uma vez) +
   `schema.ts`. Testar local (`vite`) apontando pro mesmo Supabase.
3. Validar local: marcar treinos, conferir no app.
4. Migration em Prod (idempotente, mesma SQL) + deploy edge function (Supabase CLI/Mgmt API)
   + push → Vercel + reprocessar PowerSync (workflow keep-alive).
5. Validar prod (server-side + abrir app).

> Nota: PhysiqCalc tem **um** projeto Supabase (`uxwpwdbbnlticxgtzcsb`) e duas instâncias
> PowerSync (Prod/Dev). A migration de banco roda uma vez; o reprocessamento PowerSync é
> feito em ambas via keep-alive.

## Fora de escopo (YAGNI)

- Reordenar treinos dentro do dia (drag) — `slot_idx` é por ordem de marcação.
- Editar séries/reps/periodização (schema não guarda; fica no PDF).
- Copiar semana de um usuário para outro.
