# Treinos Padrão Visíveis por Perfil — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fazer cada grupo de treino padrão (`tb_grupos_treino`) aparecer apenas para os usuários explicitamente associados a ele no painel admin.

**Architecture:** Filtro server-side via PowerSync Sync Streams (edition 3) por `auth.user_id()`. Nova tabela `tb_grupos_treino_perfis` mapeia grupo→usuário; sync stream entrega o grupo e seus exercícios só para os user_ids associados. App do usuário não muda. Admin ganha um seletor de perfis por grupo.

**Tech Stack:** Postgres (Supabase, ref `uxwpwdbbnlticxgtzcsb`), PowerSync edition 3 CLI, React + TypeScript + Vite, Supabase JS client.

**Decisões fixas (spec `docs/superpowers/specs/2026-06-04-treinos-padrao-por-perfil-design.md`):**
1. Sem perfil = invisível para todos.
2. Vários perfis por grupo.
3. Filtro server-side (sync rules).
4. Chave = `user_id`.
5. Admin é identificado por `app_metadata.role = 'admin'` (mesmo critério de `requireAdmin` nas edge functions).

**Credenciais:** PowerSync PAT + IDs em `~/.claude-memory-shared/Acesso PowerSync.md`. Supabase: o MCP do plugin não tem privilégio nesse projeto; a migration será aplicada via psql/painel com service role ou MCP de uma conta com acesso. Resolver o acesso ao DB é pré-requisito da Task 1.

---

## File Structure

- **DB (migration)** — nova tabela `tb_grupos_treino_perfis` + RLS + entrada na publication do PowerSync. Aplicada direto no Postgres (não há diretório de migrations versionado no repo; registrar o SQL em `docs/superpowers/plans/`).
- **`powersync/sync-config.yaml`** (novo no repo) — cópia versionada das sync rules com o stream `grupos_por_perfil`. Fonte de verdade para deploy.
- **`src/components/admin/AdminTreinos.tsx`** (modificar) — carregar perfis + usuários na aba Grupos; bloco "Quem vê este treino" com toggle e badge de aviso.

App do usuário (`src/pages/TreinosPage.tsx`) e schema client (`src/lib/powersync/schema.ts`): **não mudam**.

---

## Task 1: Migration Postgres — tabela de perfis + RLS + publication

**Files:**
- Create (registro): `docs/superpowers/plans/2026-06-04-migration-tb_grupos_treino_perfis.sql`
- Apply: Postgres do projeto `uxwpwdbbnlticxgtzcsb`

- [ ] **Step 1: Garantir acesso ao DB**

Confirmar um caminho de execução SQL com privilégio de DDL. Em ordem de preferência:
- `mcp__supabase__apply_migration` (se a conta do MCP tiver acesso ao projeto), ou
- `psql "$PHYSIQ_DB_URL"` com a connection string do pooler/service (pedir ao usuário se não estiver disponível no ambiente).

Não prosseguir sem um caminho funcional. Teste rápido:

```sql
SELECT current_database(), now();
```
Expected: retorna 1 linha sem erro.

- [ ] **Step 2: Inspecionar a publication do PowerSync**

```sql
SELECT pubname FROM pg_publication;
```
Expected: lista as publications. Anotar a usada pela replicação do PowerSync (provável `powersync`). Usar esse nome no Step 4 (substituir `powersync` se for outro).

- [ ] **Step 3: Criar a tabela + RLS (DDL)**

Gravar este SQL em `docs/superpowers/plans/2026-06-04-migration-tb_grupos_treino_perfis.sql` e aplicá-lo:

```sql
create table if not exists public.tb_grupos_treino_perfis (
  id uuid primary key default gen_random_uuid(),
  grupo_id uuid not null references public.tb_grupos_treino(id) on delete cascade,
  user_id uuid not null,
  created_at timestamptz not null default now(),
  unique (grupo_id, user_id)
);

create index if not exists idx_grupos_treino_perfis_user
  on public.tb_grupos_treino_perfis (user_id);

alter table public.tb_grupos_treino_perfis enable row level security;

-- Admin (app_metadata.role = 'admin') gerencia tudo via supabase client.
drop policy if exists "admin_all_grupos_treino_perfis" on public.tb_grupos_treino_perfis;
create policy "admin_all_grupos_treino_perfis"
  on public.tb_grupos_treino_perfis
  for all
  to authenticated
  using ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin')
  with check ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

-- Garantir privilégios de tabela para a role authenticated (padrão do projeto, ver nota 13/05 em Acesso Supabase).
grant select, insert, update, delete on public.tb_grupos_treino_perfis to authenticated;
```

- [ ] **Step 4: Adicionar a tabela à publication do PowerSync**

Substituir `powersync` pelo nome real do Step 2 se diferente:

```sql
alter publication powersync add table public.tb_grupos_treino_perfis;
```
Expected: `ALTER PUBLICATION`. (Se a tabela já estiver na publication, ignora o erro de duplicidade.)

- [ ] **Step 5: Validar a estrutura**

```sql
select column_name, data_type from information_schema.columns
where table_name = 'tb_grupos_treino_perfis' order by ordinal_position;

select polname from pg_policies where tablename = 'tb_grupos_treino_perfis';

select 1 from pg_publication_tables
where tablename = 'tb_grupos_treino_perfis';
```
Expected: 4 colunas (id, grupo_id, user_id, created_at); policy `admin_all_grupos_treino_perfis`; 1 linha confirmando a publication.

- [ ] **Step 6: Commit do SQL de registro**

```bash
cd ~/projetos/physiqcalc
git add docs/superpowers/plans/2026-06-04-migration-tb_grupos_treino_perfis.sql
git commit -F - <<'EOF'
feat(db): tabela tb_grupos_treino_perfis para treinos padrão por perfil

Mapeia grupo padrão -> user_id. RLS restrito a admin (app_metadata.role).
Adicionada à publication do PowerSync para replicação.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
```

---

## Task 2: Sync rules PowerSync — stream filtrada por perfil

**Files:**
- Create: `powersync/sync-config.yaml` (cópia versionada das sync rules)

> Não fazer deploy nesta task. Só editar e validar localmente. O deploy ordenado é a Task 6.

- [ ] **Step 1: Puxar as sync rules atuais para o repo**

```bash
cd ~/projetos/physiqcalc
mkdir -p powersync
export PS_ADMIN_TOKEN="$(grep -A2 'PAT pessoal' ~/.claude-memory-shared/'Acesso PowerSync.md' | grep '^jpt_' )"
npx -y powersync@latest pull instance \
  --org-id 69cc4bec866ae00007694860 \
  --project-id 69cc4d1caaa9a30007b4ec2c \
  --instance-id 69cc4d1df69619e9d4834456
cp ./powersync/sync-config.yaml ./powersync/sync-config.yaml.bak
```
Expected: `powersync/sync-config.yaml` criado contendo os streams `global` e `by_user`.

- [ ] **Step 2: Editar `powersync/sync-config.yaml`**

No stream `global`, remover as linhas `- SELECT * FROM tb_grupos_treino` e `- SELECT * FROM tb_grupos_exercicios`. Adicionar o stream novo. Resultado do bloco `streams`:

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
    auto_subscribe: true
    queries:
      - SELECT * FROM tb_treino_series WHERE user_id = auth.user_id()
      - SELECT * FROM tb_treino_concluido WHERE user_id = auth.user_id()
      - SELECT * FROM tb_treino_dia_override WHERE user_id = auth.user_id()
      - SELECT * FROM treino_historico WHERE user_id = auth.user_id()
      - SELECT * FROM physiq_profiles WHERE id = auth.user_id()
      - SELECT * FROM exercicio_ordem_usuario WHERE user_id = auth.user_id()
      - SELECT * FROM tb_grupos_treino_usuario WHERE user_id = auth.user_id()
      - SELECT * FROM tb_exercicios_usuario WHERE user_id = auth.user_id()
      - SELECT * FROM tb_grupos_exercicios_usuario WHERE user_id = auth.user_id()
      - SELECT * FROM tb_exercicio_comentarios WHERE user_id = auth.user_id()
      - SELECT * FROM tb_semana_treinos WHERE user_id = auth.user_id()
```

(Manter o cabeçalho `config: { edition: 3 }` e os comentários `yaml-language-server` que já vêm no arquivo.)

- [ ] **Step 3: Validar localmente**

```bash
cd ~/projetos/physiqcalc/powersync
npx -y powersync@latest validate
```
Expected: validação OK, sem erros.

**Se o JOIN for rejeitado** pela validação, trocar as duas queries de `grupos_por_perfil` pela forma com subquery e revalidar:

```yaml
      - SELECT * FROM tb_grupos_treino
        WHERE id IN (SELECT grupo_id FROM tb_grupos_treino_perfis WHERE user_id = auth.user_id())
      - SELECT * FROM tb_grupos_exercicios
        WHERE grupo_id IN (SELECT grupo_id FROM tb_grupos_treino_perfis WHERE user_id = auth.user_id())
```

- [ ] **Step 4: Commit das sync rules (sem deploy)**

```bash
cd ~/projetos/physiqcalc
rm -f powersync/sync-config.yaml.bak powersync/cli.yaml powersync/service.yaml
git add powersync/sync-config.yaml
git commit -F - <<'EOF'
feat(powersync): stream grupos_por_perfil filtrando treinos padrão por user_id

Remove tb_grupos_treino/tb_grupos_exercicios do stream global; passam a ser
entregues só aos user_ids em tb_grupos_treino_perfis. Deploy é etapa separada.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
```

---

## Task 3: Admin UI — carregar perfis e usuários na aba Grupos

**Files:**
- Modify: `src/components/admin/AdminTreinos.tsx`

- [ ] **Step 1: Adicionar estado `gruposPerfis`**

Em `AdminTreinos.tsx`, logo após a linha `const [gruposExercicios, setGruposExercicios] = useState<Record<string, string[]>>({});`, adicionar:

```tsx
  const [gruposPerfis, setGruposPerfis] = useState<Record<string, string[]>>({});
```

- [ ] **Step 2: Carregar perfis em `loadData`**

Em `loadData`, incluir a query na `Promise.all` e montar o map. Substituir o bloco que começa em `const [exRes, grRes, smRes, geRes, gmRes] = await Promise.all([` até o `]);` por:

```tsx
      const [exRes, grRes, smRes, geRes, gmRes, perfRes] = await Promise.all([
        supabase.from("tb_exercicios").select("*").order("nome"),
        supabase.from("tb_grupos_treino").select("*").order("nome"),
        supabase.from("tb_semana_treinos").select("dia_semana, grupo_id"),
        supabase.from("tb_grupos_exercicios").select("grupo_id, exercicio_id, ordem").order("ordem"),
        supabase.from("grupos_musculares").select("*").order("nome"),
        (supabase.from as any)("tb_grupos_treino_perfis").select("grupo_id, user_id"),
      ]);
```

E logo após o bloco que monta `gruposExercicios` (depois de `setGruposExercicios(map);`), adicionar:

```tsx
      const perfMap: Record<string, string[]> = {};
      ((perfRes.data as any[]) || []).forEach((p) => {
        if (!perfMap[p.grupo_id]) perfMap[p.grupo_id] = [];
        perfMap[p.grupo_id].push(p.user_id);
      });
      setGruposPerfis(perfMap);
```

- [ ] **Step 3: Carregar usuários também na aba Grupos**

Substituir:

```tsx
  useEffect(() => { if (tab === "relatorio") loadUsers(); }, [tab]);
```
por:

```tsx
  useEffect(() => { if (tab === "relatorio" || tab === "grupos") loadUsers(); }, [tab]);
```

- [ ] **Step 4: Verificar typecheck**

Run: `cd ~/projetos/physiqcalc && npx tsc --noEmit`
Expected: sem novos erros (o cast `(supabase.from as any)` evita erro de tipo da tabela ainda não presente em `types.ts`).

- [ ] **Step 5: Commit**

```bash
cd ~/projetos/physiqcalc
git add src/components/admin/AdminTreinos.tsx
git commit -F - <<'EOF'
feat(admin): carregar perfis e usuários na aba Grupos

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
```

---

## Task 4: Admin UI — bloco "Quem vê este treino" + badge

**Files:**
- Modify: `src/components/admin/AdminTreinos.tsx`

- [ ] **Step 1: Adicionar handler de toggle de perfil**

Logo após o handler `handleToggleExercicioInGrupo` (antes da const `tabs`), adicionar:

```tsx
  const handleTogglePerfil = async (grupoId: string, userId: string) => {
    const current = gruposPerfis[grupoId] || [];
    try {
      if (current.includes(userId)) {
        const { error } = await (supabase.from as any)("tb_grupos_treino_perfis")
          .delete().eq("grupo_id", grupoId).eq("user_id", userId);
        if (error) throw error;
      } else {
        const { error } = await (supabase.from as any)("tb_grupos_treino_perfis")
          .insert({ grupo_id: grupoId, user_id: userId });
        if (error) throw error;
      }
      await loadData();
    } catch (err: any) {
      toast.error("Erro ao atualizar perfis: " + (err?.message || "tente novamente"));
    }
  };
```

- [ ] **Step 2: Renderizar o bloco no card do grupo**

No render da aba `grupos`, dentro do `result-card` de cada grupo, inserir este bloco imediatamente **antes** do fechamento `</div>` que encerra o card (logo depois do bloco condicional `isEditing ? (...) : (...)` que lista os exercícios):

```tsx
                  <div className="mt-4 pt-3 border-t border-muted-foreground/10">
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-heading">
                        Quem vê este treino
                      </p>
                      {(gruposPerfis[g.id]?.length ?? 0) === 0 && (
                        <span className="text-[10px] text-destructive font-body">
                          ⚠️ Sem perfil — invisível p/ todos
                        </span>
                      )}
                    </div>
                    {users.length === 0 ? (
                      <p className="text-xs text-muted-foreground font-body">Carregando usuários...</p>
                    ) : (
                      <div className="space-y-1 max-h-40 overflow-y-auto">
                        {users.map((u) => (
                          <label key={u.id} className="flex items-center gap-2 py-1 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={(gruposPerfis[g.id] || []).includes(u.id)}
                              onChange={() => handleTogglePerfil(g.id, u.id)}
                              className="accent-primary"
                            />
                            <span className="text-sm font-body text-foreground">{u.nome}</span>
                            <span className="text-[10px] text-muted-foreground font-body ml-auto truncate max-w-[160px]">
                              {u.email}
                            </span>
                          </label>
                        ))}
                      </div>
                    )}
                  </div>
```

- [ ] **Step 3: Build + typecheck**

Run: `cd ~/projetos/physiqcalc && npx tsc --noEmit && npm run build`
Expected: build sem erros.

- [ ] **Step 4: Rodar a suíte de testes (garantir que nada quebrou)**

Run: `cd ~/projetos/physiqcalc && npm test`
Expected: testes existentes passam (nenhum teste novo foi adicionado — a mudança é UI de I/O + sync rules, validada manualmente na Task 6).

- [ ] **Step 5: Commit**

```bash
cd ~/projetos/physiqcalc
git add src/components/admin/AdminTreinos.tsx
git commit -F - <<'EOF'
feat(admin): bloco "Quem vê este treino" por grupo + aviso de grupo sem perfil

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
```

---

## Task 5: Bump de versão

**Files:**
- Modify: `package.json` (campo `version`) e qualquer `APP_VERSION` espelhado.

- [ ] **Step 1: Localizar a versão atual**

Run: `cd ~/projetos/physiqcalc && grep -n '"version"' package.json && grep -rn "APP_VERSION" src | head`
Expected: versão atual (ex.: `2.42`). Identificar se há `APP_VERSION` a sincronizar.

- [ ] **Step 2: Bump (minor) em package.json e APP_VERSION (se existir)**

Editar `package.json` `version` para o próximo minor (ex.: `2.42` → `2.43`) e atualizar `APP_VERSION` no mesmo valor onde aparecer.

- [ ] **Step 3: Commit**

```bash
cd ~/projetos/physiqcalc
git add package.json src
git commit -F - <<'EOF'
chore: bump version to v2.43

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
```

---

## Task 6: Deploy ordenado + validação manual

> **Ordem crítica (risco):** migration (Task 1, já feita) → app/UI em produção → atribuir perfis → **só então** deploy das sync rules. Inverter a ordem faz os grupos padrão sumirem para todos antes de existirem perfis.

- [ ] **Step 1: Deploy do app (UI admin) em produção**

Push para a branch de produção (repo pessoal — push direto em `main` é permitido):

```bash
cd ~/projetos/physiqcalc && git push origin main
```
Expected: deploy automático na Vercel conclui. Confirmar build verde.

- [ ] **Step 2: Atribuir perfis no admin (antes das sync rules)**

No app em produção, logado como admin: aba Gerenciar Treinos → Grupos. Para cada grupo padrão que deve continuar visível, marcar os usuários em "Quem vê este treino". Para o caso de teste, associar `weslleybertoldo18@gmail.com` ao grupo **"Costa + bíceps"**.

Verificar persistência:
```sql
select count(*) from tb_grupos_treino_perfis;
```
Expected: > 0, refletindo as associações feitas.

- [ ] **Step 3: Deploy das sync rules (Production + Development)**

```bash
cd ~/projetos/physiqcalc/powersync
export PS_ADMIN_TOKEN="$(grep '^jpt_' ~/.claude-memory-shared/'Acesso PowerSync.md')"
# Production
npx -y powersync@latest deploy sync-config \
  --org-id 69cc4bec866ae00007694860 \
  --project-id 69cc4d1caaa9a30007b4ec2c \
  --instance-id 69cc4d1df69619e9d4834456
# Development
npx -y powersync@latest deploy sync-config \
  --org-id 69cc4bec866ae00007694860 \
  --project-id 69cc4d1caaa9a30007b4ec2c \
  --instance-id 69cc4d1d8fa42c16d7f6eb27
```
Expected: deploy aceito; instância reprocessa as sync rules sem erro de validação.

- [ ] **Step 4: Validação manual (smoke test)**

1. Logar no app como `weslleybertoldo18@gmail.com` → o grupo "Costa + bíceps" **aparece** na lista de grupos/seleção de semana.
2. Logar como um usuário **sem** esse perfil → o grupo **não aparece**.
3. Um grupo padrão **sem nenhum perfil** → não aparece para **nenhum** usuário.
4. Confirmar que **criação de grupo pessoal** segue funcionando (ModalCriarGrupoPessoal) e que `tb_exercicios`/`grupos_musculares` continuam disponíveis.

Expected: os 4 itens conforme descrito. Se um grupo não sincronizar para quem deveria, checar `powersync status` e os logs da instância.

- [ ] **Step 5: Pós-deploy**

Confirmar que a versão nova está em produção (rodapé/about do app) e que não há erros no console. Registrar o resultado.

---

## Pendência fora deste plano

- **Keep-alive do PowerSync não resolve a inatividade** (cron `fb76e23` não segura a instância ativa). Investigar **após** esta feature.

---

## Self-review (do autor do plano)

- **Cobertura da spec:** Banco → Task 1; sync rules → Task 2 + deploy Task 6; Admin UI (carregar perfis/users) → Task 3; bloco "Quem vê este treino" + badge → Task 4; "app do usuário não muda" → respeitado (nenhuma task toca TreinosPage/schema.ts); risco de ordem de deploy → Task 6 header; versionamento → Task 5; pendência keep-alive → registrada. Sem gaps.
- **Placeholders:** nenhum "TBD/TODO"; todo passo de código tem o código; o único valor descoberto em runtime (nome da publication, versão atual) tem comando de descoberta + ação concreta e fallback.
- **Consistência de nomes:** `gruposPerfis` (estado), `handleTogglePerfil`, tabela `tb_grupos_treino_perfis`, stream `grupos_por_perfil`, cast `(supabase.from as any)` — usados de forma idêntica entre as tasks 3 e 4.
