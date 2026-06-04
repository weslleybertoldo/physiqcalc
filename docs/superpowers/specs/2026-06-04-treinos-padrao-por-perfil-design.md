# Treinos padrão visíveis por perfil

**Data:** 2026-06-04
**Status:** Aprovado para planejamento

## Problema

Hoje todos os grupos de treino padrão (`tb_grupos_treino`) são sincronizados para
todos os usuários via PowerSync (stream `global`). Queremos que cada grupo padrão
só apareça para usuários explicitamente associados a ele no painel admin.

## Decisões (validadas com o usuário)

1. **Sem perfil = invisível para todos.** Grupo padrão sem nenhum perfil associado
   não aparece para ninguém. (Não é aditivo ao comportamento atual.)
2. **Vários perfis por grupo.** Um grupo pode ser associado a N usuários.
3. **Filtro server-side via sync rules do PowerSync.** O device só recebe os grupos
   a que tem direito. App do usuário não muda.
4. **Chave = `user_id`.** Admin seleciona usuários da lista (`admin-list-users`),
   salva `user_id`. Sync rules filtram por `auth.user_id()`.
5. **Sync rules editadas via CLI/PAT PowerSync** (credenciais em memória).

## Escopo

- Criação de **grupos pessoais** (`tb_grupos_treino_usuario`) permanece **intacta**.
- App do usuário (`TreinosPage.tsx`) **não muda** — as sync rules já filtram.
- A mudança afeta apenas os grupos **padrão** e a aba **Grupos** do admin.

## Arquitetura atual (referência)

- `src/components/admin/AdminTreinos.tsx` — aba Grupos lê/escreve via Supabase direto
  (`tb_grupos_treino`, `tb_grupos_exercicios`). Já tem `admin-list-users` (usada hoje
  só na aba Relatório).
- `src/pages/TreinosPage.tsx` — lê `SELECT id,nome FROM tb_grupos_treino` via PowerSync `useQuery`.
- PowerSync **edition 3 (Sync Streams)**. Stream `global` (auto_subscribe) entrega
  `tb_grupos_treino`, `tb_exercicios`, `tb_grupos_exercicios`, `grupos_musculares`.
  Stream `by_user` filtra o resto por `auth.user_id()`.

## Componentes da solução

### 1. Banco de dados (migration)

```sql
create table tb_grupos_treino_perfis (
  id uuid primary key default gen_random_uuid(),
  grupo_id uuid not null references tb_grupos_treino(id) on delete cascade,
  user_id uuid not null,
  created_at timestamptz not null default now(),
  unique (grupo_id, user_id)
);
create index on tb_grupos_treino_perfis (user_id);

alter table tb_grupos_treino_perfis enable row level security;
-- Política: só admin gerencia (mesmo padrão das outras tabelas admin do projeto).
-- A replicação do PowerSync usa role própria (não afetada por RLS).

-- Necessário para o PowerSync replicar a tabela:
alter publication powersync add table tb_grupos_treino_perfis;
```

> Confirmar o nome real da publication na instância antes do ALTER (provável `powersync`).

### 2. Sync rules (PowerSync edition 3)

Remover `tb_grupos_treino` e `tb_grupos_exercicios` do stream `global`. `tb_exercicios`
e `grupos_musculares` continuam globais (são só definições).

```yaml
streams:
  global:
    auto_subscribe: true
    queries:
      - SELECT * FROM tb_exercicios
      - SELECT * FROM grupos_musculares

  grupos_por_perfil:
    auto_subscribe: true
    queries:
      - SELECT g.* FROM tb_grupos_treino g
        JOIN tb_grupos_treino_perfis p ON p.grupo_id = g.id
        WHERE p.user_id = auth.user_id()
      - SELECT ge.* FROM tb_grupos_exercicios ge
        JOIN tb_grupos_treino_perfis p ON p.grupo_id = ge.grupo_id
        WHERE p.user_id = auth.user_id()

  by_user:
    # inalterado
```

- Validar com `powersync validate` antes do deploy.
- **Fallback** se JOIN não for suportado em stream edition 3:
  `WHERE id IN (SELECT grupo_id FROM tb_grupos_treino_perfis WHERE user_id = auth.user_id())`.
- Deploy via `powersync deploy sync-config` (PAT em `Acesso PowerSync.md`),
  aplicar na instância **Production** (`69cc4d1df69619e9d4834456`) e **Development**.

### 3. Admin UI — `AdminTreinos.tsx`, aba Grupos

- Carregar a lista de usuários (`admin-list-users`) também quando a aba `grupos` abre
  (hoje só carrega em `relatorio`).
- Carregar `tb_grupos_treino_perfis` em `loadData()` e montar
  `Record<grupo_id, user_id[]>`.
- Em cada card de grupo, novo bloco **"Quem vê este treino"**: lista de usuários com
  checkbox (nome + email). Toggle faz insert/delete em `tb_grupos_treino_perfis`.
- **Badge de aviso** no card quando o grupo está sem nenhum perfil:
  "⚠️ Sem perfil — não aparece para ninguém".

### 4. App do usuário

Nenhuma mudança. `TreinosPage.tsx` continua com `SELECT id,nome FROM tb_grupos_treino`;
o PowerSync entrega apenas os grupos sincronizados para aquele `user_id`.

## Fluxo de dados

1. Admin abre aba Grupos → vê todos os grupos (Supabase direto, não filtrado).
2. Admin marca usuários em "Quem vê este treino" → insert em `tb_grupos_treino_perfis`.
3. Postgres replica a tabela para o PowerSync.
4. No device de cada usuário, a stream `grupos_por_perfil` passa a (ou deixa de)
   sincronizar aquele grupo + seus exercícios.
5. `TreinosPage` reativo re-renderiza com os grupos disponíveis.

## Tratamento de erros

- Toggle de perfil com erro → `toast.error` (padrão atual do componente).
- `admin-list-users` indisponível → toast e bloco de perfis vazio (degrada sem quebrar).
- Migration idempotente (`if not exists` onde aplicável).

## Testes / validação

- `powersync validate` nas sync rules (lint).
- Manual: associar `weslleybertoldo18@gmail.com` ao grupo "Costa + bíceps"; logar como
  esse usuário e confirmar que o grupo aparece; logar como outro usuário e confirmar
  que **não** aparece; confirmar que grupo sem perfil não aparece para ninguém.
- Confirmar que criação de grupo pessoal segue funcionando.

## Risco operacional (importante)

Ao remover `tb_grupos_treino`/`tb_grupos_exercicios` do stream `global`, **todos os
usuários param de ver os grupos padrão até que perfis sejam atribuídos**. Comportamento
esperado (decisão 1), mas exige atribuir os perfis no admin logo após o deploy das sync
rules. Sequência recomendada: migration → UI admin (deploy app) → atribuir perfis →
só então fazer deploy das sync rules.

## Fora de escopo / pendência

- **Keep-alive PowerSync não resolve inatividade** da instância (cron `fb76e23` não
  segura). Investigar **após** esta feature.
