# Treino Diário no perfil do usuário — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dar ao admin uma seção "Treino Diário" no perfil do usuário para montar a semana recorrente com vários treinos por dia (checkbox), refletindo no app do usuário.

**Architecture:** `tb_semana_treinos` ganha `slot_idx` (1→N treinos/dia, mesma lógica de slots da v2.38). Uma edge function `admin-semana-treinos` (service_role) lê/grava a semana de qualquer usuário. Componente admin `AdminSemanaUsuario` faz toggle por checkbox salvando na hora. `TreinosPage` passa a ler N treinos da semana via `getSlotsForDate`.

**Tech Stack:** React + TypeScript + Vite + PowerSync (SQLite) + Supabase (Postgres + Edge Functions Deno) + vitest.

**Worktree:** `/home/bertoldo/projetos/physiqcalc-semana-usuario` (branch `feat/admin-semana-usuario`, base `origin/main` v2.59). Supabase: `uxwpwdbbnlticxgtzcsb`. Todos os comandos rodam a partir do worktree.

---

## File Structure

- Create: `supabase/functions/admin-semana-treinos/index.ts` — edge function get/setDia.
- Create: `src/components/AdminSemanaUsuario.tsx` — UI dos 7 dias + checkboxes.
- Create: `src/lib/semanaSlots.ts` — helper puro `selectSemanaConfigsForDia` (testável).
- Create: `src/lib/semanaSlots.test.ts` — testes do helper.
- Modify: `src/lib/powersync/schema.ts:20-26` — `slot_idx` em `tb_semana_treinos`.
- Modify: `src/pages/TreinosPage.tsx` — `SemanaConfig.slot_idx`, query, `getSlotsForDate` filter.
- Modify: `src/components/AdminUserConfig.tsx` — render `<AdminSemanaUsuario>`.
- Modify: `src/components/admin/AdminTreinos.tsx` — remover aba/handler "Semana" legada.
- Migration SQL: aplicada via Management API (Dev então Prod) — não versionada como arquivo CLI (projeto usa Management API, ver memória).

---

## Task 1: Migration `slot_idx` + PowerSync schema

**Files:**
- SQL aplicada via Management API (banco `uxwpwdbbnlticxgtzcsb`)
- Modify: `src/lib/powersync/schema.ts:20-26`

- [ ] **Step 1: Aplicar migration no Postgres**

Via MCP/PostgREST não dá DDL; usar Management API. O hook de deploy vai pedir confirmação (migration DDL) — isso é esperado. SQL:

```sql
ALTER TABLE public.tb_semana_treinos
  ADD COLUMN IF NOT EXISTS slot_idx INTEGER NOT NULL DEFAULT 0;
ALTER TABLE public.tb_semana_treinos
  DROP CONSTRAINT IF EXISTS tb_semana_treinos_user_id_dia_semana_key;
ALTER TABLE public.tb_semana_treinos
  ADD CONSTRAINT tb_semana_treinos_user_dia_slot_key
  UNIQUE (user_id, dia_semana, slot_idx);
```

Confirmar o nome real da constraint antiga antes (pode diferir):
```sql
SELECT conname FROM pg_constraint
WHERE conrelid = 'public.tb_semana_treinos'::regclass AND contype = 'u';
```
Usar o `conname` retornado no DROP.

- [ ] **Step 2: Verificar**

```sql
SELECT column_name FROM information_schema.columns
WHERE table_name='tb_semana_treinos' AND column_name='slot_idx';
-- 1 linha
SELECT conname FROM pg_constraint
WHERE conrelid='public.tb_semana_treinos'::regclass AND contype='u';
-- tb_semana_treinos_user_dia_slot_key
```

- [ ] **Step 3: Declarar slot_idx no PowerSync schema**

`src/lib/powersync/schema.ts`, bloco `tb_semana_treinos`:

```typescript
const tb_semana_treinos = new Table({
  user_id: column.text,
  dia_semana: column.text,
  grupo_id: column.text,
  grupo_usuario_id: column.text,
  slot_idx: column.integer,
});
```

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: sem erros novos.

- [ ] **Step 5: Commit**

```bash
git add src/lib/powersync/schema.ts
git commit -m "feat(semana): adiciona slot_idx em tb_semana_treinos (multi-treino/dia)"
```

---

## Task 2: App do usuário lê N treinos da semana (TDD)

**Files:**
- Create: `src/lib/semanaSlots.ts`
- Test: `src/lib/semanaSlots.test.ts`
- Modify: `src/pages/TreinosPage.tsx` (interface `SemanaConfig`, query `semanaRows`, `getSlotsForDate`)

- [ ] **Step 1: Escrever o teste do helper puro**

`src/lib/semanaSlots.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { selectSemanaConfigsForDia, type SemanaConfigLike } from "./semanaSlots";

const rows: SemanaConfigLike[] = [
  { dia_semana: "SEG", slot_idx: 1, grupo_id: "b", grupo_usuario_id: null },
  { dia_semana: "SEG", slot_idx: 0, grupo_id: "a", grupo_usuario_id: null },
  { dia_semana: "TER", slot_idx: 0, grupo_id: "c", grupo_usuario_id: null },
];

describe("selectSemanaConfigsForDia", () => {
  it("retorna todos os treinos do dia ordenados por slot_idx", () => {
    const seg = selectSemanaConfigsForDia(rows, "SEG");
    expect(seg.map((r) => r.grupo_id)).toEqual(["a", "b"]);
  });
  it("retorna 1 treino quando só há um", () => {
    expect(selectSemanaConfigsForDia(rows, "TER")).toHaveLength(1);
  });
  it("retorna vazio em dia de descanso", () => {
    expect(selectSemanaConfigsForDia(rows, "DOM")).toEqual([]);
  });
  it("trata slot_idx ausente como 0", () => {
    const r = selectSemanaConfigsForDia(
      [{ dia_semana: "QUA", slot_idx: null, grupo_id: "x", grupo_usuario_id: null }],
      "QUA",
    );
    expect(r).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Rodar o teste e ver falhar**

Run: `npx vitest run src/lib/semanaSlots.test.ts`
Expected: FAIL — `Cannot find module './semanaSlots'`.

- [ ] **Step 3: Implementar o helper**

`src/lib/semanaSlots.ts`:

```typescript
export interface SemanaConfigLike {
  dia_semana: string;
  slot_idx: number | null;
  grupo_id: string | null;
  grupo_usuario_id: string | null;
}

/** Todos os treinos recorrentes de um dia da semana, ordenados por slot_idx. */
export function selectSemanaConfigsForDia<T extends SemanaConfigLike>(
  semanaConfig: T[],
  diaSemana: string,
): T[] {
  return semanaConfig
    .filter((s) => s.dia_semana === diaSemana)
    .sort((a, b) => (a.slot_idx ?? 0) - (b.slot_idx ?? 0));
}
```

- [ ] **Step 4: Rodar o teste e ver passar**

Run: `npx vitest run src/lib/semanaSlots.test.ts`
Expected: PASS (4 testes).

- [ ] **Step 5: Adicionar slot_idx ao tipo e à query da semana em TreinosPage**

`src/pages/TreinosPage.tsx` — interface `SemanaConfig` (≈ linha 75):

```typescript
interface SemanaConfig {
  dia_semana: string;
  slot_idx: number | null;
  grupo_id: string | null;
  grupo_usuario_id: string | null;
  tb_grupos_treino: GrupoTreino | null;
}
```

Query `semanaRows` (≈ linha 312) — adicionar `s.slot_idx`:

```typescript
  const { data: semanaRows } = useQuery(
    `SELECT s.dia_semana, s.slot_idx, s.grupo_id, s.grupo_usuario_id,
            g.id as grupo_treino_id, g.nome as grupo_treino_nome
     FROM tb_semana_treinos s
     LEFT JOIN tb_grupos_treino g ON s.grupo_id = g.id
     WHERE s.user_id = ?`,
    [userId]
  );
```

`semanaConfig` memo (≈ linha 320) — incluir `slot_idx`:

```typescript
  const semanaConfig = useMemo<SemanaConfig[]>(() => {
    if (!semanaRows) return [];
    return (semanaRows as any[]).map((row) => ({
      dia_semana: String(row.dia_semana),
      slot_idx: row.slot_idx ?? 0,
      grupo_id: row.grupo_id,
      grupo_usuario_id: row.grupo_usuario_id,
      tb_grupos_treino: row.grupo_treino_id
        ? { id: row.grupo_treino_id, nome: row.grupo_treino_nome }
        : null,
    }));
  }, [semanaRows]);
```

- [ ] **Step 6: Usar o helper em getSlotsForDate (find → filter, N slots)**

`src/pages/TreinosPage.tsx` — adicionar import no topo:

```typescript
import { selectSemanaConfigsForDia } from "@/lib/semanaSlots";
```

Substituir o ramo da semana em `getSlotsForDate` (≈ linhas 495-505) por:

```typescript
    const configs = selectSemanaConfigsForDia(semanaConfig, diaSemana);
    const slots: DiaSlot[] = [];
    configs.forEach((config, idx) => {
      const slotIdx = config.slot_idx ?? idx;
      if (config.grupo_usuario_id) {
        const grupo = gruposPessoais.find((g) => g.id === config.grupo_usuario_id) || null;
        if (grupo) {
          slots.push({ slot_idx: slotIdx, grupo, exercicios: gruposExerciciosPessoais[config.grupo_usuario_id] || [], overrideVazio: false, source: 'semana' });
        }
      } else if (config.grupo_id) {
        const grupo = config.tb_grupos_treino || grupos.find((g) => g.id === config.grupo_id) || null;
        slots.push({ slot_idx: slotIdx, grupo, exercicios: gruposExercicios[config.grupo_id] || [], overrideVazio: false, source: 'semana' });
      }
    });
    return slots;
```

(O `return []` final pré-existente fica inalcançável e pode ser removido; o ramo de override acima permanece intacto e com precedência.)

- [ ] **Step 7: Typecheck + todos os testes**

Run: `npx tsc --noEmit && npx vitest run`
Expected: sem erros; suíte verde (inclui os 4 novos).

- [ ] **Step 8: Commit**

```bash
git add src/lib/semanaSlots.ts src/lib/semanaSlots.test.ts src/pages/TreinosPage.tsx
git commit -m "feat(semana): app lê N treinos recorrentes por dia (slot_idx)"
```

---

## Task 3: Edge function `admin-semana-treinos`

**Files:**
- Create: `supabase/functions/admin-semana-treinos/index.ts`

- [ ] **Step 1: Criar a função (CORS + requireAdmin idênticos ao padrão)**

`supabase/functions/admin-semana-treinos/index.ts`:

```typescript
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";

const ALLOWED_ORIGINS = new Set([
  "https://physiqcalc.vercel.app",
  "https://physiqcalc.lovable.app",
  "capacitor://localhost",
  "https://localhost",
  "http://localhost:8080",
  "http://localhost:5173",
]);

function corsHeaders(origin: string | null): Record<string, string> {
  const allow = origin && ALLOWED_ORIGINS.has(origin) ? origin : "https://physiqcalc.vercel.app";
  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin",
  };
}

function jsonErr(msg: string, status: number, origin: string | null) {
  return new Response(JSON.stringify({ error: msg }), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders(origin) },
  });
}

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const DIAS = new Set(["DOM", "SEG", "TER", "QUA", "QUI", "SEX", "SAB"]);

async function checkRateLimit(userId: string, endpoint: string, maxCount: number, windowSecs: number): Promise<boolean> {
  try {
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);
    const { data, error } = await admin.rpc("check_rate_limit", {
      p_user_id: userId, p_endpoint: endpoint, p_max_count: maxCount, p_window_secs: windowSecs,
    });
    if (error) return true;
    return data === true;
  } catch { return true; }
}

async function requireAdmin(req: Request, endpoint: string, maxCount = 60, windowSecs = 60): Promise<{ user: any; error: Response | null }> {
  const origin = req.headers.get("Origin");
  const auth = req.headers.get("Authorization");
  if (!auth?.startsWith("Bearer ")) return { user: null, error: jsonErr("missing_auth", 401, origin) };
  const token = auth.slice(7);
  const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
  const userClient = createClient(SUPABASE_URL, anon, { global: { headers: { Authorization: auth } } });
  const { data, error } = await userClient.auth.getUser(token);
  if (error || !data?.user) return { user: null, error: jsonErr("invalid_token", 401, origin) };
  const role = (data.user.app_metadata as any)?.role;
  if (role !== "admin") return { user: null, error: jsonErr("forbidden", 403, origin) };
  const allowed = await checkRateLimit(data.user.id, endpoint, maxCount, windowSecs);
  if (!allowed) return { user: null, error: jsonErr("rate_limited", 429, origin) };
  return { user: data.user, error: null };
}

async function gruposDisponiveis(admin: any, userId: string): Promise<{ catalogo: Set<string>; pessoal: Set<string>; lista: any[] }> {
  const [perf, pess] = await Promise.all([
    admin.from("tb_grupos_treino_perfis").select("grupo_id, tb_grupos_treino(id, nome)").eq("user_id", userId),
    admin.from("tb_grupos_treino_usuario").select("id, nome").eq("user_id", userId),
  ]);
  const catalogo = new Set<string>();
  const lista: any[] = [];
  ((perf.data as any[]) || []).forEach((p) => {
    if (p.grupo_id) { catalogo.add(p.grupo_id); lista.push({ id: p.grupo_id, nome: p.tb_grupos_treino?.nome ?? "(grupo)", tipo: "catalogo" }); }
  });
  const pessoal = new Set<string>();
  ((pess.data as any[]) || []).forEach((g) => { pessoal.add(g.id); lista.push({ id: g.id, nome: g.nome, tipo: "pessoal" }); });
  return { catalogo, pessoal, lista };
}

Deno.serve(async (req) => {
  const origin = req.headers.get("Origin");
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders(origin) });
  const { error: authErr } = await requireAdmin(req, "admin-semana-treinos", 60, 60);
  if (authErr) return authErr;
  try {
    const body = await req.json();
    const action = body?.action;
    const userId = body?.userId;
    if (!userId || typeof userId !== "string") return jsonErr("missing_userId", 400, origin);
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

    if (action === "get") {
      const [semanaRes, disp] = await Promise.all([
        admin.from("tb_semana_treinos").select("dia_semana, slot_idx, grupo_id, grupo_usuario_id").eq("user_id", userId),
        gruposDisponiveis(admin, userId),
      ]);
      if (semanaRes.error) throw semanaRes.error;
      return new Response(JSON.stringify({ semana: semanaRes.data ?? [], gruposDisponiveis: disp.lista }), {
        headers: { "Content-Type": "application/json", ...corsHeaders(origin) },
      });
    }

    if (action === "setDia") {
      const dia = body?.dia_semana;
      const grupos = Array.isArray(body?.grupos) ? body.grupos : [];
      if (!DIAS.has(dia)) return jsonErr("invalid_dia", 400, origin);
      const { catalogo, pessoal } = await gruposDisponiveis(admin, userId);
      // valida: cada grupo pertence aos disponíveis do usuário
      for (const g of grupos) {
        if (g?.grupo_id && !catalogo.has(g.grupo_id)) return jsonErr("grupo_nao_disponivel", 400, origin);
        if (g?.grupo_usuario_id && !pessoal.has(g.grupo_usuario_id)) return jsonErr("grupo_nao_disponivel", 400, origin);
        if (!g?.grupo_id && !g?.grupo_usuario_id) return jsonErr("grupo_invalido", 400, origin);
      }
      const del = await admin.from("tb_semana_treinos").delete().eq("user_id", userId).eq("dia_semana", dia);
      if (del.error) throw del.error;
      if (grupos.length > 0) {
        const rows = grupos.map((g: any, i: number) => ({
          user_id: userId, dia_semana: dia, slot_idx: i,
          grupo_id: g.grupo_id ?? null, grupo_usuario_id: g.grupo_usuario_id ?? null,
          updated_at: new Date().toISOString(),
        }));
        const ins = await admin.from("tb_semana_treinos").insert(rows);
        if (ins.error) throw ins.error;
      }
      return new Response(JSON.stringify({ ok: true }), {
        headers: { "Content-Type": "application/json", ...corsHeaders(origin) },
      });
    }

    return jsonErr("invalid_action", 400, origin);
  } catch (_e) { return jsonErr("internal", 500, origin); }
});
```

- [ ] **Step 2: Commit (deploy só na fase de deploy)**

```bash
git add supabase/functions/admin-semana-treinos/index.ts
git commit -m "feat(admin): edge function admin-semana-treinos (get/setDia)"
```

---

## Task 4: Componente `AdminSemanaUsuario` + integração

**Files:**
- Create: `src/components/AdminSemanaUsuario.tsx`
- Modify: `src/components/AdminUserConfig.tsx` (import + render no fim)

- [ ] **Step 1: Criar o componente**

`src/components/AdminSemanaUsuario.tsx`:

```typescript
import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface Props { userId: string }

interface GrupoDisp { id: string; nome: string; tipo: "catalogo" | "pessoal" }
interface SemanaRow { dia_semana: string; slot_idx: number | null; grupo_id: string | null; grupo_usuario_id: string | null }

// chave única por grupo (catálogo usa grupo_id, pessoal usa grupo_usuario_id)
const keyOf = (g: { id: string; tipo: string }) => `${g.tipo}:${g.id}`;
const keyOfRow = (r: SemanaRow) => r.grupo_usuario_id ? `pessoal:${r.grupo_usuario_id}` : `catalogo:${r.grupo_id}`;

const DIAS: { code: string; label: string }[] = [
  { code: "SEG", label: "Segunda" }, { code: "TER", label: "Terça" },
  { code: "QUA", label: "Quarta" }, { code: "QUI", label: "Quinta" },
  { code: "SEX", label: "Sexta" }, { code: "SAB", label: "Sábado" },
  { code: "DOM", label: "Domingo" },
];

export default function AdminSemanaUsuario({ userId }: Props) {
  const [grupos, setGrupos] = useState<GrupoDisp[]>([]);
  // marcados[dia] = Set de keys de grupo
  const [marcados, setMarcados] = useState<Record<string, Set<string>>>({});
  const [loading, setLoading] = useState(true);
  const [savingDia, setSavingDia] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("admin-semana-treinos", { body: { action: "get", userId } });
      if (error) throw error;
      setGrupos((data?.gruposDisponiveis as GrupoDisp[]) || []);
      const map: Record<string, Set<string>> = {};
      ((data?.semana as SemanaRow[]) || []).forEach((r) => {
        (map[r.dia_semana] ||= new Set()).add(keyOfRow(r));
      });
      setMarcados(map);
    } catch {
      toast.error("Erro ao carregar a semana do usuário.");
    } finally { setLoading(false); }
  }, [userId]);

  useEffect(() => { load(); }, [load]);

  const toggle = async (dia: string, grupo: GrupoDisp) => {
    const k = keyOf(grupo);
    const atual = new Set(marcados[dia] || []);
    if (atual.has(k)) atual.delete(k); else atual.add(k);
    setMarcados((prev) => ({ ...prev, [dia]: atual })); // otimista
    setSavingDia(dia);
    try {
      const payload = grupos.filter((g) => atual.has(keyOf(g))).map((g) =>
        g.tipo === "pessoal" ? { grupo_usuario_id: g.id } : { grupo_id: g.id });
      const { error } = await supabase.functions.invoke("admin-semana-treinos", {
        body: { action: "setDia", userId, dia_semana: dia, grupos: payload },
      });
      if (error) throw error;
    } catch {
      toast.error("Erro ao salvar — recarregando.");
      await load(); // reverte pro estado do servidor
    } finally { setSavingDia(null); }
  };

  return (
    <section className="section-divider pt-10">
      <h2 className="font-heading text-lg text-foreground mb-2">Treino Diário</h2>
      <p className="text-xs text-muted-foreground font-body mb-6">
        Marque os treinos que aparecem em cada dia. Repetem toda semana. Salva automaticamente.
      </p>
      {loading ? (
        <p className="text-sm text-muted-foreground font-body">Carregando…</p>
      ) : grupos.length === 0 ? (
        <p className="text-sm text-muted-foreground font-body">
          Nenhum treino atribuído a este usuário. Atribua grupos em Gerenciar Treinos › Grupos.
        </p>
      ) : (
        <div className="flex flex-col gap-6">
          {DIAS.map((d) => (
            <div key={d.code} className="flex flex-col gap-2">
              <div className="flex items-center gap-2">
                <span className="text-sm font-heading uppercase tracking-wider text-foreground">{d.label}</span>
                {savingDia === d.code && <span className="text-xs text-muted-foreground">salvando…</span>}
                {(marcados[d.code]?.size ?? 0) === 0 && <span className="text-xs text-muted-foreground">descanso</span>}
              </div>
              <div className="flex flex-col gap-1 pl-1">
                {grupos.map((g) => {
                  const checked = marcados[d.code]?.has(keyOf(g)) ?? false;
                  return (
                    <label key={g.id} className="flex items-center gap-2 text-sm font-body cursor-pointer">
                      <input type="checkbox" checked={checked} onChange={() => toggle(d.code, g)} className="accent-primary" />
                      <span>{g.nome}{g.tipo === "pessoal" ? " (pessoal)" : ""}</span>
                    </label>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
```

- [ ] **Step 2: Integrar no AdminUserConfig**

`src/components/AdminUserConfig.tsx` — adicionar import (após linha 8):

```typescript
import AdminSemanaUsuario from "./AdminSemanaUsuario";
```

Inserir a seção logo após o fechamento da seção "Observação da Avaliação" e ANTES do `{/* Save button */}` (≈ linha 491):

```typescript
          {/* Treino Diário */}
          <AdminSemanaUsuario userId={userId} />

```

- [ ] **Step 3: Typecheck + build**

Run: `npx tsc --noEmit`
Expected: sem erros.

- [ ] **Step 4: Commit**

```bash
git add src/components/AdminSemanaUsuario.tsx src/components/AdminUserConfig.tsx
git commit -m "feat(admin): seção Treino Diário no perfil do usuário"
```

---

## Task 5: Remover aba "Semana" legada do AdminTreinos

**Files:**
- Modify: `src/components/admin/AdminTreinos.tsx`

- [ ] **Step 1: Remover estado, carregamento e handler da semana**

Em `src/components/admin/AdminTreinos.tsx`:
- Mudar o default da aba (linha 47): `useState<"grupos" | "biblioteca" | "relatorio">("grupos")` (remover `"semana"`).
- Remover a interface `SemanaConfig` (linhas 27-29) se ficar órfã.
- Remover `const [semanaConfig, setSemanaConfig] = useState<SemanaConfig[]>([]);` (linha 50).
- No `loadData` (linha 81): remover `smRes` do array do `Promise.all` e a query `supabase.from("tb_semana_treinos")...` (linha 84) e a linha `setSemanaConfig(...)` (linha 95). Ajustar a desestruturação `[exRes, grRes, geRes, gmRes, perfRes]`.
- Remover toda a função `handleSemanaChange` (linhas 134-145).
- Remover o item `{ key: "semana" as const, label: "📅 Semana" }` do array de tabs (linha 302).
- Remover o ramo de render `) : tab === "semana" ? ( ... )` (a partir da linha 336) inteiro, mantendo os demais ramos (grupos/biblioteca/relatorio).
- Ajustar o texto do subtítulo (linha 317) de "Configuração de exercícios, grupos e semana" → "Configuração de exercícios e grupos".

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: sem erros (nenhuma referência órfã a `semanaConfig`/`handleSemanaChange`/`SemanaConfig`).

- [ ] **Step 3: Grep de sobra**

Run: `grep -n "handleSemanaChange\|setSemanaConfig\|tab === \"semana\"" src/components/admin/AdminTreinos.tsx`
Expected: nenhuma saída.

- [ ] **Step 4: Commit**

```bash
git add src/components/admin/AdminTreinos.tsx
git commit -m "refactor(admin): remove aba Semana legada (global, quebrada pós per-user)"
```

---

## Task 6: Validação local + deploy (local→staging→prod)

**Files:** nenhuma mudança de código; deploy.

- [ ] **Step 1: Build + testes completos**

Run: `npx tsc --noEmit && npx vitest run && npx vite build`
Expected: tudo verde, build OK.

- [ ] **Step 2: Rodar local e smoke test**

Run: `npx vite --port 3000 --host` (background)
Validar manualmente logado como admin (Weslley): abrir perfil da Lívia → seção Treino Diário aparece → marcar 2 treinos numa segunda → sem erro. Como o app aponta pro mesmo Supabase, a gravação é real (Dev/Prod PowerSync compartilham banco) — usar usuário de teste se preferir não alterar a Lívia.

- [ ] **Step 3: GATE — eu valido**

Subiu sem erro + smoke test ok + sem erro novo no console. `auth.py` não se aplica (projeto não tem bypass). Migration já é idempotente.

- [ ] **Step 4: Deploy edge function**

Via Supabase CLI (PAT conta 2 em `SUPABASE_ACCESS_TOKEN`), preservando `verify_jwt=true`:
```bash
cd /home/bertoldo/projetos/physiqcalc-semana-usuario
SUPABASE_ACCESS_TOKEN=<PAT> npx supabase functions deploy admin-semana-treinos --project-ref uxwpwdbbnlticxgtzcsb
```
Validar: `curl -i -X OPTIONS` com Origin `https://localhost` retorna `Allow-Origin: https://localhost`.

- [ ] **Step 5: Migration em Prod**

A migration do Task 1 já roda no único banco `uxwpwdbbnlticxgtzcsb` (Prod). Confirmar idempotência (rodar de novo não falha pelos `IF EXISTS`/`IF NOT EXISTS`). Re-verificar a constraint.

- [ ] **Step 6: Merge + push (Vercel auto-deploy)**

```bash
git checkout main && git pull origin main
git merge --no-ff feat/admin-semana-usuario
git push origin main
```
(Deixar o github-actions[bot] versionar; NÃO bumpar package.json manualmente — ver memória.)

- [ ] **Step 7: Reprocessar PowerSync**

Disparar o workflow keep-alive (deploy sync-config prod+dev) pra o slot_idx novo entrar no schema sincronizado:
```bash
gh auth switch -u weslleybertoldo
gh workflow run keep-alive.yml -R weslleybertoldo/physiqcalc
gh auth switch -u weslleybertoldo-br
```

- [ ] **Step 8: Validar prod**

- Server-side: marcar treinos pela UI prod (physiqcalc.vercel.app) num usuário de teste → `curl` PostgREST confirma rows com `slot_idx` 0..n.
- App do usuário: abrir/atualizar → vários treinos aparecem no dia e repetem na semana seguinte.

- [ ] **Step 9: Limpeza do worktree**

Após validado e merge: `git worktree remove ../physiqcalc-semana-usuario` e deletar branch.

---

## Self-Review

- **Spec coverage:** schema slot_idx (T1) ✓; app lê N (T2) ✓; edge function get/setDia (T3) ✓; UI admin 7 dias toggle (T4) ✓; remover legada (T5) ✓; deploy/reprocessar (T6) ✓; testes do helper (T2) ✓.
- **Placeholder scan:** sem TODO/TBD; código completo em cada step. O PAT do deploy (T6 Step4) é segredo runtime, não placeholder de código.
- **Type consistency:** `selectSemanaConfigsForDia`/`SemanaConfigLike` (T2) batem entre helper, teste e uso; `SemanaConfig.slot_idx` adicionado; `keyOf`/`keyOfRow` consistentes no componente; actions `get`/`setDia` batem entre edge function (T3) e componente (T4).
