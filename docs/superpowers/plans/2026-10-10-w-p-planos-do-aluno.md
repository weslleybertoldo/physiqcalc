# W-P — Planos do aluno criados pelo profissional — Plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** o dono da conta cria planos (nome, duração em meses, valor do período, modalidades aceitas) na aba **Financeiro › Planos**, põe
cada aluno num plano (modalidade, valor negociado, 1º vencimento) e o aluno paga em **Perfil › Pagamentos** o valor certo — o período
todo, o cartão parcelado ou a parcela "4 de 12" —, com "Renovar plano" no fim; quem está no modo de hoje continua igual.

**Architecture:** regras puras num módulo só (`supabase-principal/functions/_shared/planos-regras.ts`, reexportado em
`src/financeiro/planos.ts`); no banco principal, colunas novas com padrão que mantém o de hoje, o valor do próximo pagamento por gatilho
(só com modalidade) e a régua `mensalidade_recalcular` (corpo da w07b) contando `meses_cobertos`; a edge `pagamentos-aluno` (uma para
`public` e `staging`) liga o que é novo só quando a coluna existe no schema; telas pelo padrão premium de hoje.

**Tech Stack:** Postgres (`{schema}`), Deno edge (supabase-js 2.39), React 18 + Vite + TanStack Query + Capacitor, Vitest, E2E em
Python + Playwright (Edge).

**Mestre:** `docs/superpowers/plans/2026-10-10-planos-infinitepay-mp-plano-mestre.md` (regras de todas as entregas, gates, riscos).
**Desenho:** `docs/superpowers/specs/2026-10-10-planos-do-aluno-design.md` — a **seção 7 vale por cima das 3 e 4**.
**Decisões fechadas:** P1–P11 do desenho; **P-A = "1" (10/10/2026)**: mês a mês com a automática ligada, depois da última parcela o plano
renova sozinho (Tarefa 17). Decisões técnicas minhas (FK `SET NULL`, WhatsApp igual, I2 adiada): §6 do mestre.

---

## Mapa de arquivos

| Arquivo | Responsabilidade |
|---|---|
| `supabase-principal/functions/_shared/planos-regras.ts` (novo) | regras puras: valor do pagamento, meses cobertos, parcelas, formas × modo da conta, automática, renovar, textos, validar plano |
| `supabase-principal/functions/_shared/planos-automatica.ts` (novo) | I1: decide e faz o PUT do valor da cobrança automática (o PUT entra por parâmetro — testável com o MP simulado) |
| `src/financeiro/planos.ts` (novo) | reexporta as regras para a tela |
| `supabase-principal/migrations/20261011010000_wp_planos_modalidades.sql` (novo) | colunas, valor por gatilho, propagação, `mensalidade_recalcular`, `financeiro_do_aluno` |
| `supabase-principal/migrations/20261011020000_wp_trava_cobranca.sql` (novo) | I5: guardas por gatilho + `planos_aluno` só leitura para o app |
| `supabase-principal/functions/_shared/financeiro-mp.ts` | colunas da matrícula com fallback em 3 níveis, `COLUNAS_PLANO`, retrato na cobrança da assinatura |
| `supabase-principal/functions/pagamentos-aluno/index.ts` | ações de planos, `prof_definir` novo, I1, cartão parcelado, automática só onde cabe, retrato nos inserts, `mensalidade` com plano |
| `supabase-principal/functions/pagamentos-aluno/mensalidades.ts` | `AlunoDoResumo` com modalidade e meses |
| `src/financeiro/{tipos,api,regras}.ts` | tipos, chamadas e mensagens novas; faixa "Seu plano" |
| `src/painel/financeiro/Planos.tsx` + `PlanoDialog.tsx` (novos) | aba Planos (lista, criar/editar, desativar) |
| `src/financeiro/ui/PlanoDoAluno.tsx` (novo) | ficha do aluno: plano com período ou modo de hoje |
| `src/financeiro/ui/FinanceiroDoAluno.tsx` | usa o `FormPlanoDoAluno`; sufixo; parcela |
| `src/painel/financeiro/financeiroUtil.ts`, `src/painel/paginas/Financeiro.tsx`, `src/painel/financeiro/Mensalidades.tsx` | aba nova; "/mês" → sufixo |
| `src/painel/configuracoes/plano/CartaoPagamento.tsx` | `maxParcelas` (padrão 1) e `installments` |
| `src/app-aluno/perfil/Pagamentos.tsx`, `pagamentos/PagarMercadoPago.tsx` | plano, parcela, Renovar; parcelas; automática só onde cabe |
| `e2e/wp/sql_planos.py`, `e2e/wp/api.py`, `e2e/wp/telas.py` (novos) | banco (bloco desfeito), servidor (staging), telas (site e loja) |

Comandos usados em todo o plano (rodar na worktree `/home/bertoldo/projetos/physiqcalc-planos`):
- Vitest de um arquivo: `npx vitest run <arquivo>` · tudo: `npm test` · tipos: `npm run tipos` · lint: `npm run lint`.
- Migration: `python3 scripts/apply_migration_principal.py <arquivo> --so staging|public` (backup do `public` antes:
  `python3 scripts/backup/backup_principal.py`).
- Função: `scripts/deploy_function.sh hkxvtsbwctxkrqzkkdoz supabase-principal/functions <slug> <verify_jwt>` (`pagamentos-aluno true`,
  `mp-webhook-aluno false`; o script recusa trocar o verify_jwt).
- Commits: `git -c user.name="Weslley Bertoldo" -c user.email="55102421+weslleybertoldo@users.noreply.github.com" commit -m "…"`
  (abaixo: `gcw -m "…"` = esse comando). Mensagem em português.

---

### Task 0: Preparar a worktree

**Files:** nenhum do app (só `docs/` já escritos e o quadro fora do repo).

- [ ] **Step 1: Conferir que ninguém mais está nos mesmos arquivos (comando isolado)**

Run: `git -C /home/bertoldo/projetos/physiqcalc-planos fetch origin && git -C /home/bertoldo/projetos/physiqcalc-planos worktree list && gh pr list --repo weslleybertoldo/physiqcalc --state open`
Expected: só a `physiqcalc-hml-18b` (LINUX 1) além desta; nenhum PR aberto tocando `src/financeiro/**`, `src/painel/financeiro/**`,
`src/app-aluno/perfil/**` ou `supabase-principal/**`. Se houver, parar e avisar.

- [ ] **Step 2: Guardar os documentos e trazer a `main` (v3.95, com a hml-18a)**

```bash
cd /home/bertoldo/projetos/physiqcalc-planos
git add docs/superpowers/specs/2026-10-10-planos-do-aluno-design.md docs/superpowers/plans/
gcw -m "docs(planos): spec-review aplicado e planos da W-P, W1 e W2"
git rebase origin/main
```
Expected: rebase sem conflito (a branch só tem `docs/`).

- [ ] **Step 3: Reservar as migrations e avisar a LINUX 1**

Editar `~/projetos/physiqcalc-scratch/quem-toca-o-que.md` (com o Edit, nunca `sed -i`): na linha da LINUX 3, trocar "(reservo o número
aqui antes)" por "reservadas: `20261011010000_wp_planos_modalidades.sql`, `20261011020000_wp_trava_cobranca.sql`" e "Desde" para a hora
de agora. Depois `SendMessage` para a LINUX 1: "LINUX 3 começou a W-P (planos do aluno): toca `src/financeiro/**`,
`src/painel/financeiro/**`, `src/painel/paginas/Financeiro.tsx`, `src/app-aluno/perfil/**`, `CartaoPagamento.tsx`, `pagamentos-aluno`,
`mp-webhook-aluno`, 2 migrations reservadas no quadro."

- [ ] **Step 4: Ambiente local e base verde**

```bash
cd /home/bertoldo/projetos/physiqcalc-planos
cp ../physiqcalc-hml/.env.local .env.local     # build de STAGING (VITE_DB_SCHEMA=staging)
npm ci
npx vitest run src/financeiro src/painel/financeiro src/app-aluno/perfil src/ui/premium/semDialogoNativo.test.ts src/ui/tema/larguraCelular.test.ts
```
Expected: tudo PASS (é a base; se algo falhar aqui, não é desta entrega — anotar e avisar antes de seguir).

---

### Task 1: Regras puras dos planos (TDD)

**Files:**
- Create: `supabase-principal/functions/_shared/planos-regras.ts`
- Create: `src/financeiro/planos.ts`
- Test: `src/financeiro/planos.test.ts`

- [ ] **Step 1: Escrever o teste que falha**

```ts
// src/financeiro/planos.test.ts
// Physiq W-P — regras puras dos planos do aluno (desenho 2026-10-10 §3 + §7). Os mesmos números do banco: e2e/wp/sql_planos.py.
import { describe, expect, it } from "vitest";
import {
  aceitaAutomatica, descricaoDoPagamento, maxParcelasDoCartao, mesesCobertos, modalidadesDaConta, modalidadesOferecidas, nomeDoPeriodo,
  parcelaMensal, parcelasTotal, parcelasValidas, planoCompleto, precisaRenovar, proximaParcela, retratoDoPlano, sufixoDoValor, validarPlano,
  valorDoPagamento, type Modalidade, type PlanoDoAluno,
} from "./planos";

const anual: PlanoDoAluno = { id: "p1", nome: "Anual", valor: 1000, meses: 12, modalidades: ["avista", "cartao_parcelado", "mensal"],
  max_parcelas_cartao: 10, valor_parcela_mensal: null, ativo: true };
const soNome: PlanoDoAluno = { id: "p2", nome: "Amigos", valor: null, meses: 1, modalidades: ["avista"], max_parcelas_cartao: null,
  valor_parcela_mensal: null, ativo: true };
const TODAS: Modalidade[] = ["avista", "cartao_parcelado", "mensal"];

describe("plano completo e valores (B1, §7)", () => {
  it("plano só com nome (virada do Calc) não é completo e não oferece modalidade", () => {
    expect(planoCompleto(soNome)).toBe(false);
    expect(modalidadesOferecidas(soNome, "mercadopago")).toEqual([]);
  });
  it("parcela = valor ÷ meses com 2 casas; a digitada manda", () => {
    expect(parcelaMensal(anual)).toBe(83.33);
    expect(parcelaMensal({ ...anual, valor_parcela_mensal: 90 })).toBe(90);
  });
  it("valor de cada pagamento: o período todo no à vista/cartão, a parcela no mês a mês, o negociado manda", () => {
    expect(valorDoPagamento(anual, "avista", null)).toBe(1000);
    expect(valorDoPagamento(anual, "cartao_parcelado", null)).toBe(1000);
    expect(valorDoPagamento(anual, "mensal", null)).toBe(83.33);
    expect(valorDoPagamento(anual, "avista", 900)).toBe(900);
    expect(valorDoPagamento(anual, "mensal", 75.5)).toBe(75.5);
    expect(valorDoPagamento(soNome, "avista", null)).toBeNull();
  });
});

describe("cobertura e parcelas (§4.1, §7)", () => {
  it("o período todo cobre os meses do plano; o mês a mês e o modo de hoje cobrem 1", () => {
    expect(mesesCobertos("avista", 12)).toBe(12);
    expect(mesesCobertos("cartao_parcelado", 6)).toBe(6);
    expect(mesesCobertos("mensal", 12)).toBe(1);
    expect(mesesCobertos(null, 12)).toBe(1);
  });
  it("o 'de N' só no mês a mês de 2 meses ou mais", () => {
    expect(parcelasTotal("mensal", 12)).toBe(12);
    expect(parcelasTotal("mensal", 1)).toBeNull();
    expect(parcelasTotal("avista", 12)).toBeNull();
  });
  it("retrato: o modo de hoje não grava as colunas novas (o schema sem a migration não quebra)", () => {
    expect(retratoDoPlano({ plano_modalidade: null, plano: { meses: 12 } })).toEqual({});
    expect(retratoDoPlano({ plano_modalidade: "avista", plano: { meses: 12 } })).toEqual({ meses_cobertos: 12, parcelas_total: null });
    expect(retratoDoPlano({ plano_modalidade: "mensal", plano: { meses: 12 } })).toEqual({ meses_cobertos: 1, parcelas_total: 12 });
  });
  it("próxima parcela: 4 depois da 3; volta a 1 depois da 12 (P-A: renova) e quando troca de plano", () => {
    expect(proximaParcela({ num: 3, total: 12, plano: "p1" }, "p1", 12)).toEqual({ num: 4, total: 12 });
    expect(proximaParcela({ num: 12, total: 12, plano: "p1" }, "p1", 12)).toEqual({ num: 1, total: 12 });
    expect(proximaParcela({ num: 5, total: 12, plano: "outro" }, "p1", 12)).toEqual({ num: 1, total: 12 });
    expect(proximaParcela(null, "p1", 12)).toEqual({ num: 1, total: 12 });
    expect(proximaParcela(null, "p1", null)).toBeNull();
  });
});

describe("formas da conta (§3.6) e cartão (B2, I6)", () => {
  it("Pix manual e 'não cobrar' sem cartão parcelado; Mercado Pago com as 3; modo desconhecido sem nenhuma", () => {
    expect(modalidadesDaConta("pix_manual")).toEqual(["avista", "mensal"]);
    expect(modalidadesDaConta("nenhum")).toEqual(["avista", "mensal"]);
    expect(modalidadesDaConta("mercadopago")).toEqual(TODAS);
    expect(modalidadesDaConta("infinitepay")).toEqual([]);
    expect(modalidadesOferecidas(anual, "pix_manual")).toEqual(["avista", "mensal"]);
    expect(modalidadesOferecidas({ ...anual, ativo: false }, "mercadopago")).toEqual([]);
  });
  it("automática: mês a mês, plano de 1 mês e o modo de hoje (os 2 planos do app ficam iguais — B2)", () => {
    expect(aceitaAutomatica(null, null)).toBe(true);
    expect(aceitaAutomatica("mensal", 12)).toBe(true);
    expect(aceitaAutomatica("avista", 1)).toBe(true);
    expect(aceitaAutomatica("avista", 12)).toBe(false);
    expect(aceitaAutomatica("cartao_parcelado", 6)).toBe(false);
  });
  it("parcelas do cartão: 1 fora do cartão parcelado; até o máximo do plano nele", () => {
    expect(maxParcelasDoCartao("avista", 10)).toBe(1);
    expect(maxParcelasDoCartao("cartao_parcelado", 10)).toBe(10);
    expect(parcelasValidas(10, "cartao_parcelado", 10)).toBe(true);
    expect(parcelasValidas(11, "cartao_parcelado", 10)).toBe(false);
    expect(parcelasValidas(2, "avista", 10)).toBe(false);
    expect(parcelasValidas(1, null, null)).toBe(true);
    expect(parcelasValidas("3", "cartao_parcelado", 10)).toBe(false);
  });
});

describe("textos (§7: '/mês' muda conforme a modalidade) e renovar", () => {
  it("sufixo e nome do período", () => {
    expect(sufixoDoValor(null, null)).toBe("/mês");
    expect(sufixoDoValor("mensal", 12)).toBe("/mês");
    expect(sufixoDoValor("avista", 1)).toBe("/mês");
    expect(sufixoDoValor("avista", 12)).toBe("/ano");
    expect(sufixoDoValor("cartao_parcelado", 6)).toBe(" por 6 meses");
    expect(nomeDoPeriodo(3)).toBe("Trimestral");
    expect(nomeDoPeriodo(9)).toBe("9 meses");
  });
  it("descrição da linha: o modo de hoje igual; o período todo e a parcela", () => {
    expect(descricaoDoPagamento("Amigos", null, 1, "2026-10-01", null)).toBe("Mensalidade · Amigos · Outubro/2026");
    expect(descricaoDoPagamento("Anual", "avista", 12, "2026-10-01", null)).toBe("Plano · Anual · 12 meses · Outubro/2026");
    expect(descricaoDoPagamento("Anual", "mensal", 12, "2026-10-01", { num: 4, total: 12 })).toBe("Plano · Anual · parcela 4 de 12 · Outubro/2026");
  });
  it("renovar = período todo já pago, vencendo ou vencido (o 1º pagamento é 'Pagar')", () => {
    expect(precisaRenovar("avista", "vence_em_breve", "2026-10-20T00:00:00Z")).toBe(true);
    expect(precisaRenovar("cartao_parcelado", "vencida", "2026-10-01T00:00:00Z")).toBe(true);
    expect(precisaRenovar("avista", "vencida", null)).toBe(false);
    expect(precisaRenovar("mensal", "vencida", "2026-10-01T00:00:00Z")).toBe(false);
    expect(precisaRenovar(null, "vencida", "2026-10-01T00:00:00Z")).toBe(false);
  });
});

describe("validarPlano (tela de Planos → servidor)", () => {
  it("aceita e normaliza (nome sem espaços sobrando, modalidades sem repetição e na ordem fixa)", () => {
    expect(validarPlano({ nome: "  Anual  ", meses: 12, valor: 1000, modalidades: ["mensal", "avista", "mensal"] }, TODAS)).toEqual({
      ok: true, plano: { nome: "Anual", meses: 12, valor: 1000, modalidades: ["avista", "mensal"], max_parcelas_cartao: null, valor_parcela_mensal: null },
    });
  });
  it("recusa o que não fecha", () => {
    expect(validarPlano({ nome: "", meses: 12, valor: 10, modalidades: ["avista"] }, TODAS)).toEqual({ ok: false, erro: "nome_invalido" });
    expect(validarPlano({ nome: "X", meses: 25, valor: 10, modalidades: ["avista"] }, TODAS)).toEqual({ ok: false, erro: "meses_invalido" });
    expect(validarPlano({ nome: "X", meses: 1, valor: 0, modalidades: ["avista"] }, TODAS)).toEqual({ ok: false, erro: "valor_invalido" });
    expect(validarPlano({ nome: "X", meses: 1, valor: 10, modalidades: [] }, TODAS)).toEqual({ ok: false, erro: "modalidades_invalidas" });
    expect(validarPlano({ nome: "X", meses: 6, valor: 10, modalidades: ["cartao_parcelado"] }, ["avista", "mensal"])).toEqual({ ok: false, erro: "modalidade_da_conta" });
    expect(validarPlano({ nome: "X", meses: 6, valor: 10, modalidades: ["cartao_parcelado"], max_parcelas_cartao: 13 }, TODAS)).toEqual({ ok: false, erro: "parcelas_invalidas" });
    expect(validarPlano({ nome: "X", meses: 6, valor: 10, modalidades: ["avista"], valor_parcela_mensal: 5 }, TODAS)).toEqual({ ok: false, erro: "parcela_sem_mensal" });
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/financeiro/planos.test.ts`
Expected: FAIL — `Failed to resolve import "./planos"`.

- [ ] **Step 3: Escrever o módulo**

```ts
// supabase-principal/functions/_shared/planos-regras.ts
// Physiq W-P — regras PURAS dos planos do aluno criados pelo profissional (desenho 2026-10-10 §3 com os ajustes do §7). Sem Deno,
// sem rede e sem banco: usadas pela pagamentos-aluno e pela mp-webhook-aluno, reexportadas para a tela (src/financeiro/planos.ts) e
// testadas no Vitest (src/financeiro/planos.test.ts). O banco tem o espelho do valor ({schema}.plano_valor_do_pagamento) — o
// e2e/wp/sql_planos.py confere os mesmos números.
import { descricaoMensalidade, mesPorExtenso, valorValido } from "./financeiro-regras.ts";

/** Como o aluno paga o plano (§7 B1: "modalidade" — "forma" já é o trilho em cobrancas.forma). */
export type Modalidade = "avista" | "cartao_parcelado" | "mensal";
export const MODALIDADES: readonly Modalidade[] = ["avista", "cartao_parcelado", "mensal"];
export const ROTULO_MODALIDADE: Record<Modalidade, string> = { avista: "À vista", cartao_parcelado: "Cartão parcelado", mensal: "Mês a mês" };

export interface PlanoDoAluno {
  id: string;
  nome: string;
  valor: number | null;
  meses: number;
  modalidades: Modalidade[];
  max_parcelas_cartao: number | null;
  valor_parcela_mensal: number | null;
  ativo: boolean;
}

/** O que basta para fazer as contas de um plano (a tela e o banco mandam números ou textos numéricos). */
export interface ValoresDoPlano {
  valor: number | string | null;
  meses: number | null | undefined;
  valor_parcela_mensal?: number | string | null;
}

export function ehModalidade(v: unknown): v is Modalidade {
  return typeof v === "string" && (MODALIDADES as readonly string[]).includes(v);
}

const centavos = (n: number) => Math.round(n * 100) / 100;

/** Plano com valor e meses: só ele vai para a ficha do aluno (o "só nome" da virada do Calc aparece como "completar" — B1). */
export function planoCompleto(p: ValoresDoPlano): boolean {
  const meses = Number(p.meses);
  return Number(p.valor) > 0 && Number.isInteger(meses) && meses >= 1 && meses <= 24;
}

/** Parcela do mês a mês: a que o profissional digitou ou valor ÷ meses com 2 casas (1.000 ÷ 12 = 83,33; o total fica 999,96). */
export function parcelaMensal(p: ValoresDoPlano): number | null {
  if (Number(p.valor_parcela_mensal) > 0) return centavos(Number(p.valor_parcela_mensal));
  if (!planoCompleto(p)) return null;
  return centavos(Number(p.valor) / Number(p.meses));
}

/** Valor de CADA pagamento na modalidade (= pacientes.mensalidade_valor, "o valor do próximo pagamento"); o negociado manda. */
export function valorDoPagamento(p: ValoresDoPlano, modalidade: Modalidade, negociado: number | string | null | undefined): number | null {
  if (Number(negociado) > 0) return centavos(Number(negociado));
  if (modalidade === "mensal") return parcelaMensal(p);
  return planoCompleto(p) ? centavos(Number(p.valor)) : null;
}

/** Quantos meses o pagamento cobre: o período todo no à vista/cartão parcelado; 1 no mês a mês e no modo de hoje. */
export function mesesCobertos(modalidade: Modalidade | null | undefined, meses: number | null | undefined): number {
  const n = Number(meses) || 1;
  return modalidade && modalidade !== "mensal" ? Math.max(1, n) : 1;
}

/** O "de N" do mês a mês (retrato na cobrança); null fora dele e no plano de 1 mês. */
export function parcelasTotal(modalidade: Modalidade | null | undefined, meses: number | null | undefined): number | null {
  const n = Number(meses) || 1;
  return modalidade === "mensal" && n >= 2 ? n : null;
}

/** O que a linha da cobrança grava do plano quando nasce. Modo de hoje: nada (as colunas ficam no padrão — o schema sem a migration
 *  aceita o insert). */
export function retratoDoPlano(m: { plano_modalidade?: Modalidade | null; plano?: { meses?: number | null } | null }): { meses_cobertos?: number; parcelas_total?: number | null } {
  if (!m.plano_modalidade) return {};
  const meses = m.plano?.meses ?? 1;
  return { meses_cobertos: mesesCobertos(m.plano_modalidade, meses), parcelas_total: parcelasTotal(m.plano_modalidade, meses) };
}

/** Modalidades que a forma de receber da conta consegue cobrar (desenho 3.6). A W1 e a W2 acrescentam os modos novos aqui. */
export function modalidadesDaConta(modo: string | null | undefined): Modalidade[] {
  if (modo === "mercadopago") return ["avista", "cartao_parcelado", "mensal"];
  if (modo === "pix_manual" || modo === "nenhum") return ["avista", "mensal"];
  return [];
}

/** Na ficha do aluno: as modalidades do plano que a conta consegue receber (plano incompleto ou desativado: nenhuma). */
export function modalidadesOferecidas(p: ValoresDoPlano & { modalidades: Modalidade[]; ativo: boolean }, modo: string | null | undefined): Modalidade[] {
  if (!p.ativo || !planoCompleto(p)) return [];
  const daConta = modalidadesDaConta(modo);
  return p.modalidades.filter((x) => daConta.includes(x));
}

/** Cobrança automática no cartão (assinatura do MP): mês a mês, plano de 1 mês (à vista = mês a mês — B2) e o modo de hoje. */
export function aceitaAutomatica(modalidade: Modalidade | null | undefined, meses: number | null | undefined): boolean {
  return !modalidade || modalidade === "mensal" || (Number(meses) || 1) === 1;
}

/** Até quantas parcelas o cartão aceita: 1 sempre; até o máximo do plano só no cartão parcelado (I6). */
export function maxParcelasDoCartao(modalidade: Modalidade | null | undefined, max: number | null | undefined): number {
  const n = Number(max);
  return modalidade === "cartao_parcelado" && Number.isInteger(n) && n >= 2 ? Math.min(12, n) : 1;
}

export function parcelasValidas(n: unknown, modalidade: Modalidade | null | undefined, max: number | null | undefined): boolean {
  return typeof n === "number" && Number.isInteger(n) && n >= 1 && n <= maxParcelasDoCartao(modalidade, max);
}

export interface Parcela {
  num: number;
  total: number;
}

/** A próxima do mês a mês ("parcela 4 de 12"): depois da N-ésima volta a 1 (P-A "1": o plano renova); trocou de plano ou de N → 1. */
export function proximaParcela(ultima: { num: number | null; total: number | null; plano: string | null } | null, plano: string | null, total: number | null): Parcela | null {
  if (!total || total < 2) return null;
  if (!ultima || !ultima.num || ultima.plano !== plano || ultima.total !== total) return { num: 1, total };
  return { num: (ultima.num % total) + 1, total };
}

/** "Renovar plano" (§3.3 + §7): período todo já pago uma vez, vencendo (7 dias) ou vencido. */
export function precisaRenovar(modalidade: Modalidade | null | undefined, situacao: string, pagoAte: string | null | undefined): boolean {
  return (modalidade === "avista" || modalidade === "cartao_parcelado") && !!pagoAte && (situacao === "vence_em_breve" || situacao === "vencida");
}

const PERIODOS: Record<number, string> = { 1: "Mensal", 2: "Bimestral", 3: "Trimestral", 6: "Semestral", 12: "Anual" };

/** 1 → "Mensal" · 3 → "Trimestral" · 12 → "Anual" · 9 → "9 meses". */
export function nomeDoPeriodo(meses: number): string {
  return PERIODOS[meses] ?? `${meses} meses`;
}

/** O que vem depois do valor: "/mês" (modo de hoje, mês a mês, plano de 1 mês), "/ano" (12 meses) ou " por N meses". */
export function sufixoDoValor(modalidade: Modalidade | null | undefined, meses: number | null | undefined): string {
  const n = Number(meses) || 1;
  if (!modalidade || modalidade === "mensal" || n === 1) return "/mês";
  return n === 12 ? "/ano" : ` por ${n} meses`;
}

/** Descrição da linha da cobrança. Modo de hoje (e plano de 1 mês): "Mensalidade · <plano> · <Mês/Ano>", igual a sempre. */
export function descricaoDoPagamento(plano: string | null | undefined, modalidade: Modalidade | null | undefined, meses: number | null | undefined, mesRef: string, parcela: Parcela | null): string {
  const n = Number(meses) || 1;
  if (!modalidade || n === 1) return descricaoMensalidade(plano ?? null, mesRef);
  const meio = modalidade === "mensal" ? (parcela ? `parcela ${parcela.num} de ${parcela.total}` : "") : `${n} meses`;
  return ["Plano", (plano ?? "").trim(), meio, mesPorExtenso(mesRef)].filter(Boolean).join(" · ");
}

export interface PlanoSalvar {
  nome: string;
  meses: number;
  valor: number;
  modalidades: Modalidade[];
  max_parcelas_cartao: number | null;
  valor_parcela_mensal: number | null;
}

/** O que a tela manda para salvar um plano → o que vai para o banco (ou o código do erro). */
export function validarPlano(e: Record<string, unknown>, permitidas: readonly Modalidade[]): { ok: true; plano: PlanoSalvar } | { ok: false; erro: string } {
  const nome = String(e.nome ?? "").trim().replace(/\s+/g, " ");
  if (nome.length < 1 || nome.length > 80) return { ok: false, erro: "nome_invalido" };
  const meses = Number(e.meses);
  if (!Number.isInteger(meses) || meses < 1 || meses > 24) return { ok: false, erro: "meses_invalido" };
  const valor = valorValido(e.valor);
  if (valor === null) return { ok: false, erro: "valor_invalido" };
  const lista = Array.isArray(e.modalidades) ? [...new Set(e.modalidades as unknown[])] : [];
  if (!lista.length || !lista.every(ehModalidade)) return { ok: false, erro: "modalidades_invalidas" };
  if (!lista.every((x) => permitidas.includes(x as Modalidade))) return { ok: false, erro: "modalidade_da_conta" };
  const modalidades = MODALIDADES.filter((x) => lista.includes(x));
  let max: number | null = null;
  if (modalidades.includes("cartao_parcelado")) {
    max = Number(e.max_parcelas_cartao);
    if (!Number.isInteger(max) || max < 2 || max > 12) return { ok: false, erro: "parcelas_invalidas" };
  }
  let parcela: number | null = null;
  if (e.valor_parcela_mensal !== null && e.valor_parcela_mensal !== undefined && e.valor_parcela_mensal !== "") {
    if (!modalidades.includes("mensal")) return { ok: false, erro: "parcela_sem_mensal" };
    parcela = valorValido(e.valor_parcela_mensal);
    if (parcela === null) return { ok: false, erro: "parcela_invalida" };
  }
  return { ok: true, plano: { nome, meses, valor, modalidades, max_parcelas_cartao: max, valor_parcela_mensal: parcela } };
}
```

```ts
// src/financeiro/planos.ts
// Physiq W-P — as regras dos planos do aluno são as do servidor (um módulo só, sem Deno): a tela reexporta.
export * from "../../supabase-principal/functions/_shared/planos-regras";
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run src/financeiro/planos.test.ts && npm run tipos`
Expected: PASS (todos os casos) e `tsc` sem erro.

- [ ] **Step 5: Commit**

```bash
git add supabase-principal/functions/_shared/planos-regras.ts src/financeiro/planos.ts src/financeiro/planos.test.ts
gcw -m "feat(planos): regras puras dos planos do aluno (valor, cobertura, parcelas, formas, renovar)"
```

---

### Task 2: Valor da cobrança automática acompanha o próximo pagamento (I1, com o MP simulado)

**Files:**
- Create: `supabase-principal/functions/_shared/planos-automatica.ts`
- Test: `src/financeiro/planosAutomatica.test.ts`

- [ ] **Step 1: Escrever o teste que falha**

```ts
// src/financeiro/planosAutomatica.test.ts
// Physiq W-P (§7 I1): toda mudança do valor do próximo pagamento com a automática ligada faz o PUT /preapproval; o MP é simulado.
import { describe, expect, it, vi } from "vitest";
import { novoValorDaAutomatica } from "../../supabase-principal/functions/_shared/planos-automatica";

const ativa = { mp_preapproval_id: "pre-1", status: "authorized", valor: 100, payload: {} };

describe("I1 — o valor da cobrança automática acompanha o próximo pagamento", () => {
  it("sem automática ligada (ou simulada) não chama o MP", async () => {
    const put = vi.fn();
    expect(await novoValorDaAutomatica(null, 90, put)).toBe("sem_automatica");
    expect(await novoValorDaAutomatica({ ...ativa, status: "cancelled" }, 90, put)).toBe("sem_automatica");
    expect(await novoValorDaAutomatica({ ...ativa, mp_preapproval_id: "sim-1" }, 90, put)).toBe("sem_automatica");
    expect(await novoValorDaAutomatica({ ...ativa, payload: { simulada: true } }, 90, put)).toBe("sem_automatica");
    expect(put).not.toHaveBeenCalled();
  });
  it("mesmo valor não chama o MP", async () => {
    const put = vi.fn();
    expect(await novoValorDaAutomatica(ativa, 100, put)).toBe("igual");
    expect(put).not.toHaveBeenCalled();
  });
  it("valor novo → PUT com o valor em BRL", async () => {
    const put = vi.fn(async () => ({ status: 200, body: { id: "pre-1" } }));
    expect(await novoValorDaAutomatica(ativa, 83.33, put)).toBe("atualizada");
    expect(put).toHaveBeenCalledWith("pre-1", { auto_recurring: { transaction_amount: 83.33, currency_id: "BRL" } });
  });
  it("o MP recusa ou a rede cai → falhou (quem chama avisa o dono)", async () => {
    expect(await novoValorDaAutomatica(ativa, 90, async () => ({ status: 400, body: { message: "x" } }))).toBe("falhou");
    expect(await novoValorDaAutomatica(ativa, 90, async () => { throw new Error("rede"); })).toBe("falhou");
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/financeiro/planosAutomatica.test.ts`
Expected: FAIL — não acha `planos-automatica`.

- [ ] **Step 3: Escrever o módulo**

```ts
// supabase-principal/functions/_shared/planos-automatica.ts
// Physiq W-P (§7 I1) — o valor da cobrança automática no cartão (assinatura do MP) acompanha o "valor do próximo pagamento": o PUT
// /preapproval do aluno_app_plano (W7b), agora para toda troca de plano, modalidade ou valor. Sem Deno e sem rede: o PUT entra por
// parâmetro (a pagamentos-aluno passa o mpFetch; o Vitest, um falso). Quem chama grava o espelho e avisa o dono quando falha.

export type ResultadoValor = "sem_automatica" | "igual" | "atualizada" | "falhou";

export interface AssinaturaParaValor {
  mp_preapproval_id: string | null;
  status: string;
  valor: number | null;
  payload: Record<string, unknown> | null;
}

export type PutAssinatura = (id: string, corpo: { auto_recurring: { transaction_amount: number; currency_id: "BRL" } }) =>
  Promise<{ status: number; body: { id?: unknown } | null }>;

export async function novoValorDaAutomatica(a: AssinaturaParaValor | null, valor: number, put: PutAssinatura): Promise<ResultadoValor> {
  if (!a || a.status !== "authorized" || !a.mp_preapproval_id || a.mp_preapproval_id.startsWith("sim-") || a.payload?.simulada === true) return "sem_automatica";
  if (!(valor > 0)) return "sem_automatica";
  if (Number(a.valor) === valor) return "igual";
  try {
    const r = await put(a.mp_preapproval_id, { auto_recurring: { transaction_amount: valor, currency_id: "BRL" } });
    return r.status < 300 && r.body?.id ? "atualizada" : "falhou";
  } catch {
    return "falhou";
  }
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run src/financeiro/planosAutomatica.test.ts`
Expected: PASS (4 casos).

- [ ] **Step 5: Commit**

```bash
git add supabase-principal/functions/_shared/planos-automatica.ts src/financeiro/planosAutomatica.test.ts
gcw -m "feat(planos): valor da cobrança automática acompanha o próximo pagamento (I1)"
```

---

### Task 3: Banco — colunas, valor por gatilho, régua da cobertura (migration 1)

**Files:**
- Create: `e2e/wp/sql_planos.py` (o teste, primeiro)
- Create: `supabase-principal/migrations/20261011010000_wp_planos_modalidades.sql`

- [ ] **Step 1: Escrever o teste do banco (falha antes da migration)**

```python
#!/usr/bin/env python3
"""Physiq W-P — os planos do aluno NO BANCO (20261011010000_wp_planos_modalidades.sql e 20261011020000_wp_trava_cobranca.sql)
com os MESMOS números das regras puras (src/financeiro/planos.test.ts). Cada caso roda num bloco que termina com erro de propósito
(nada fica gravado): cria um plano de teste na conta da matrícula de TESTE, mexe e devolve o resultado na mensagem do erro.
A regressão recalcula a cobertura de TODOS os alunos dentro de um bloco desfeito e compara com o que está gravado.

Uso: python3 e2e/wp/sql_planos.py [--paciente <matrícula de teste com conta>]                 (staging: todos os casos)
     python3 e2e/wp/sql_planos.py --so-regressao --schema staging|public --guardar <arq.json>   (ANTES da migration)
     python3 e2e/wp/sql_planos.py --so-regressao --schema staging|public --comparar <arq.json>  (DEPOIS: tem que bater)
Saída sem dado pessoal: só contagem, datas e valores dos casos de teste.
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

sys.dont_write_bytecode = True
sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "w02"))
from _comum import Placar, sql_principal  # noqa: E402

p = Placar()


def _resultado(q: str) -> dict:
    try:
        sql_principal(q)
    except RuntimeError as e:
        m = re.search(r"RESULTADO<<(.*)>>", str(e), re.S)
        if m:
            return json.loads(m.group(1))
        raise
    raise RuntimeError("o bloco de teste não terminou com o erro esperado")


def bloco(s: str, pac: str, corpo: str) -> dict:
    return _resultado(f"""do $t$
declare v_nutri uuid; v_conta uuid; v_plano uuid; v_res jsonb := '{{}}'::jsonb; i integer;
begin
  select coalesce(c.dono_id, pa.personal_id, pa.nutricionista_id), pa.conta_id into v_nutri, v_conta
    from {s}.pacientes pa left join {s}.contas c on c.id = pa.conta_id where pa.id = '{pac}';
  delete from {s}.aluno_assinaturas where paciente_id = '{pac}';
  update {s}.cobrancas set deleted_at = now() where paciente_id = '{pac}' and tipo = 'mensalidade' and deleted_at is null;
  update {s}.pacientes set plano_modalidade = null, plano_valor_negociado = null, app_teste_de = null, app_teste_ate = null where id = '{pac}';
  insert into {s}.planos_aluno (conta_id, nome, valor, meses, modalidades, max_parcelas_cartao)
  values (v_conta, 'WP teste ' || gen_random_uuid(), 1000, 12, array['avista', 'cartao_parcelado', 'mensal'], 10) returning id into v_plano;
{corpo}
  raise exception 'RESULTADO<<%>>', v_res::text;
end $t$;""")


def paga(s: str, pac: str, dia: str, meses: int = 1, total: str = "null", status: str = "paga") -> str:
    return (f"  insert into {s}.cobrancas (nutricionista_id, paciente_id, descricao, valor, vencimento, status, pago_em, tipo, forma, origem,"
            f" meses_cobertos, parcelas_total, plano_aluno_id) values (v_nutri, '{pac}', 'teste wp', 10, '{dia}', '{status}', '{dia}T12:00:00Z',"
            f" 'mensalidade', 'manual', 'teste_wp', {meses}, {total}, v_plano);\n")


def pago_ate(s: str, pac: str) -> str:
    return (f"  v_res := v_res || jsonb_build_object('pago_ate', (select to_char(mensalidade_pago_ate at time zone 'UTC', 'YYYY-MM-DD')"
            f" from {s}.pacientes where id = '{pac}'));\n")


def automatica(s: str, pac: str) -> str:
    return (f"  insert into {s}.aluno_assinaturas (paciente_id, status, valor, proximo_vencimento, mp_preapproval_id)"
            f" values ('{pac}', 'authorized', 10, '2026-12-15T12:00:00Z', 'teste-wp-' || gen_random_uuid());\n")


def casos(s: str, pac: str) -> None:
    # 1. cobertura com meses_cobertos (as datas do Calc continuam no e2e/w06/sql_cobertura.py, que tem que seguir passando)
    r = bloco(s, pac, paga(s, pac, "2026-07-15", 12) + pago_ate(s, pac))
    p.check(r == {"pago_ate": "2027-07-15"}, f"à vista de 12 meses: 15/07/2026 → 15/07/2027 ({r})")
    r = bloco(s, pac, paga(s, pac, "2026-01-10") + paga(s, pac, "2026-02-01", 12) + pago_ate(s, pac))
    p.check(r == {"pago_ate": "2027-02-10"}, f"1 mês e depois 12 meses: 10/01 + 01/02 → 10/02/2027 ({r})")
    r = bloco(s, pac, automatica(s, pac) + paga(s, pac, "2026-07-20", 12) + pago_ate(s, pac))
    p.check(r == {"pago_ate": "2027-07-20"}, f"a automática (dia 15) não encurta o período todo ({r})")
    r = bloco(s, pac, automatica(s, pac) + paga(s, pac, "2026-07-20", 1, "12") + pago_ate(s, pac))
    p.check(r == {"pago_ate": "2026-08-15"}, f"no mês a mês o dia da automática continua mandando ({r})")
    # 2. parcela n de N: recusa sai da conta; depois da 12ª volta a 1 (P-A "1": renova)
    r = bloco(s, pac, paga(s, pac, "2026-07-01", 1, "12") + paga(s, pac, "2026-08-01", 1, "12", "cancelada")
              + paga(s, pac, "2026-08-02", 1, "12") + paga(s, pac, "2026-09-01", 1, "12")
              + f"  v_res := jsonb_build_object('nums', (select jsonb_agg(parcela_num order by pago_em) from {s}.cobrancas"
                f" where paciente_id = '{pac}' and origem = 'teste_wp' and status = 'paga' and deleted_at is null));\n")
    p.check(r == {"nums": [1, 2, 3]}, f"parcelas 1, 2, 3 (a cancelada não conta) ({r})")
    r = bloco(s, pac, f"""  for i in 0..12 loop
    insert into {s}.cobrancas (nutricionista_id, paciente_id, descricao, valor, vencimento, status, pago_em, tipo, forma, origem,
                               meses_cobertos, parcelas_total, plano_aluno_id)
    values (v_nutri, '{pac}', 'teste wp', 83.33, '2026-01-05'::date + i * 30, 'paga', ('2026-01-05'::date + i * 30) + time '12:00',
            'mensalidade', 'manual', 'teste_wp', 1, 12, v_plano);
  end loop;
  v_res := jsonb_build_object('nums', (select jsonb_agg(parcela_num order by pago_em) from {s}.cobrancas
                                         where paciente_id = '{pac}' and origem = 'teste_wp' and deleted_at is null));
""")
    p.check(r == {"nums": [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 1]}, f"depois da 12ª volta à parcela 1 ({r})")
    # 3. valor do próximo pagamento: gatilho, negociado, propagação, gravação direta e o modo de hoje (B1)
    v = f"(select mensalidade_valor from {s}.pacientes where id = '{pac}')"
    r = bloco(s, pac, f"""  update {s}.pacientes set plano_aluno_id = v_plano, plano_modalidade = 'mensal' where id = '{pac}';
  v_res := v_res || jsonb_build_object('mensal', {v});
  update {s}.pacientes set plano_valor_negociado = 75 where id = '{pac}';
  v_res := v_res || jsonb_build_object('negociado', {v});
  update {s}.pacientes set plano_valor_negociado = null, plano_modalidade = 'avista' where id = '{pac}';
  v_res := v_res || jsonb_build_object('avista', {v});
  update {s}.planos_aluno set valor = 1200 where id = v_plano;
  v_res := v_res || jsonb_build_object('propagou', {v});
  update {s}.pacientes set mensalidade_valor = 1 where id = '{pac}';
  v_res := v_res || jsonb_build_object('direta', {v});
  update {s}.pacientes set plano_modalidade = null, mensalidade_valor = 50 where id = '{pac}';
  v_res := v_res || jsonb_build_object('hoje', {v}, 'negociado_some', (select plano_valor_negociado is null from {s}.pacientes where id = '{pac}'));
""")
    p.check(r == {"mensal": 83.33, "negociado": 75, "avista": 1000, "propagou": 1200, "direta": 1200, "hoje": 50, "negociado_some": True},
            f"valor: parcela 83,33 · negociado 75 · à vista 1.000 · plano a 1.200 propaga · gravação direta não descasa · modo de hoje manda ({r})")
    # 4. B2: os 2 planos do app ficaram iguais (só leitura)
    n = sql_principal(f"""select count(*)::int as n from {s}.planos_aluno pa join {s}.contas c on c.id = pa.conta_id
                           where c.origem = 'app' and (pa.meses <> 1 or pa.modalidades <> array['avista']::text[] or pa.max_parcelas_cartao is not null)""")[0]["n"]
    p.check(n == 0, f"os planos do app seguem 1 mês, à vista ({n} diferentes)")
    # 5. nada ficou gravado
    sobra = sql_principal(f"select (select count(*) from {s}.cobrancas where origem = 'teste_wp') + (select count(*) from {s}.planos_aluno where nome like 'WP teste %') as n")[0]["n"]
    p.check(sobra == 0, f"nenhuma cobrança nem plano de teste ficou gravado ({sobra})")


def regressao(s: str) -> dict:
    return _resultado(f"""do $t$
declare r record; v_total integer := 0; v_ids text[] := '{{}}';
begin
  for r in select pa.id, pa.mensalidade_pago_ate from {s}.pacientes pa
            where pa.deleted_at is null
              and (pa.mensalidade_pago_ate is not null or exists (select 1 from {s}.cobrancas c where c.paciente_id = pa.id and c.tipo = 'mensalidade'))
  loop
    v_total := v_total + 1;
    if {s}.mensalidade_recalcular(r.id) is distinct from r.mensalidade_pago_ate then v_ids := v_ids || r.id::text; end if;
  end loop;
  raise exception 'RESULTADO<<%>>', jsonb_build_object('total', v_total, 'diferentes', cardinality(v_ids),
    'assinatura', md5(coalesce(array_to_string(array(select x from unnest(v_ids) x order by x), ','), '')))::text;
end $t$;""")


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--schema", default="staging", choices=["staging", "public"])
    ap.add_argument("--paciente")
    ap.add_argument("--so-regressao", action="store_true")
    ap.add_argument("--guardar")
    ap.add_argument("--comparar")
    a = ap.parse_args()
    if a.so_regressao:
        r = regressao(a.schema)
        print(f"   regressão {a.schema}: {r['total']} alunos, {r['diferentes']} já diferentes do gravado")
        if a.guardar:
            Path(a.guardar).write_text(json.dumps(r))
        if a.comparar:
            antes = json.loads(Path(a.comparar).read_text())
            p.check(r == antes, f"a régua nova dá o MESMO 'pago até' que a antiga para todos ({antes} → {r})")
        return p.fim()
    if a.schema != "staging":
        raise SystemExit("os casos com escrita (desfeita) são só do staging")
    pac = a.paciente or sql_principal("""select pa.id::text as id from staging.pacientes pa join staging.contas c on c.id = pa.conta_id
        join auth.users u on u.id = pa.user_id where c.origem is distinct from 'app' and pa.deleted_at is null and pa.ativo
          and lower(u.email) like '%teste%' order by pa.created_at limit 1""")[0]["id"]
    casos("staging", pac)
    return p.fim()


if __name__ == "__main__":
    sys.exit(main())
```

- [ ] **Step 2: Guardar a régua de hoje (antes da migration) e ver o teste falhar**

```bash
mkdir -p ~/projetos/physiqcalc-scratch/wp
python3 e2e/wp/sql_planos.py --so-regressao --schema staging --guardar ~/projetos/physiqcalc-scratch/wp/regressao-staging-antes.json
python3 e2e/wp/sql_planos.py
```
Expected: a 1ª imprime "regressão staging: N alunos, K já diferentes" (guarda); a 2ª FALHA com `column "plano_modalidade" … does not exist`.

- [ ] **Step 3: Escrever a migration**

```sql
-- Physiq W-P — planos do aluno criados pelo profissional (desenho docs/superpowers/specs/2026-10-10-planos-do-aluno-design.md §3 com
-- os ajustes do §7). Idempotente. SÓ ACRESCENTA: colunas com padrão que mantém tudo como hoje (os 2 planos do app e os planos "só
-- nome" da virada continuam iguais — B1/B2), o valor do próximo pagamento por gatilho SÓ para quem tem modalidade e a régua da
-- cobertura (mensalidade_recalcular da w07b — §7 I3) contando meses_cobertos e a "parcela n de N".
--
-- Aplicar (backup ANTES — scripts/backup/backup_principal.py):
--   python3 scripts/apply_migration_principal.py supabase-principal/migrations/20261011010000_wp_planos_modalidades.sql --so staging
--   python3 scripts/apply_migration_principal.py supabase-principal/migrations/20261011010000_wp_planos_modalidades.sql --so public

-- ============================================================================================================
-- 1. planos_aluno: duração, modalidades aceitas, parcelas do cartão e a parcela do mês a mês (o "ativo" de hoje continua — §7)
-- ============================================================================================================
alter table {schema}.planos_aluno add column if not exists meses integer not null default 1;
alter table {schema}.planos_aluno drop constraint if exists planos_aluno_meses_check;
alter table {schema}.planos_aluno add constraint planos_aluno_meses_check check (meses between 1 and 24);
alter table {schema}.planos_aluno add column if not exists modalidades text[] not null default '{avista}';
alter table {schema}.planos_aluno drop constraint if exists planos_aluno_modalidades_check;
alter table {schema}.planos_aluno add constraint planos_aluno_modalidades_check
  check (cardinality(modalidades) >= 1 and modalidades <@ array['avista', 'cartao_parcelado', 'mensal']::text[]);
alter table {schema}.planos_aluno add column if not exists max_parcelas_cartao integer;
alter table {schema}.planos_aluno drop constraint if exists planos_aluno_max_parcelas_check;
alter table {schema}.planos_aluno add constraint planos_aluno_max_parcelas_check
  check ((max_parcelas_cartao is null and not ('cartao_parcelado' = any (modalidades)))
      or (max_parcelas_cartao between 2 and 12 and 'cartao_parcelado' = any (modalidades)));
alter table {schema}.planos_aluno add column if not exists valor_parcela_mensal numeric(10,2);
alter table {schema}.planos_aluno drop constraint if exists planos_aluno_valor_parcela_check;
alter table {schema}.planos_aluno add constraint planos_aluno_valor_parcela_check check (valor_parcela_mensal is null or valor_parcela_mensal > 0);

-- ============================================================================================================
-- 2. pacientes: a modalidade do aluno no plano (nula = o modo de hoje: o valor digitado manda — B1) e o valor negociado
-- ============================================================================================================
alter table {schema}.pacientes add column if not exists plano_modalidade text;
alter table {schema}.pacientes drop constraint if exists pacientes_plano_modalidade_check;
alter table {schema}.pacientes add constraint pacientes_plano_modalidade_check
  check (plano_modalidade is null or plano_modalidade in ('avista', 'cartao_parcelado', 'mensal'));
alter table {schema}.pacientes add column if not exists plano_valor_negociado numeric(10,2);
alter table {schema}.pacientes drop constraint if exists pacientes_plano_valor_negociado_check;
alter table {schema}.pacientes add constraint pacientes_plano_valor_negociado_check check (plano_valor_negociado is null or plano_valor_negociado > 0);

-- ============================================================================================================
-- 3. cobrancas: quantos meses o pagamento cobre e o "de N" do mês a mês (retrato do plano quando a linha nasce); parcela_num é cache
-- ============================================================================================================
alter table {schema}.cobrancas add column if not exists meses_cobertos integer not null default 1;
alter table {schema}.cobrancas drop constraint if exists cobrancas_meses_cobertos_check;
alter table {schema}.cobrancas add constraint cobrancas_meses_cobertos_check check (meses_cobertos between 1 and 24);
alter table {schema}.cobrancas add column if not exists parcelas_total integer;
alter table {schema}.cobrancas drop constraint if exists cobrancas_parcelas_total_check;
alter table {schema}.cobrancas add constraint cobrancas_parcelas_total_check check (parcelas_total is null or parcelas_total between 2 and 24);
alter table {schema}.cobrancas add column if not exists parcela_num integer;

-- ============================================================================================================
-- 4. Valor de CADA pagamento — espelho de valorDoPagamento (supabase-principal/functions/_shared/planos-regras.ts)
-- ============================================================================================================
create or replace function {schema}.plano_valor_do_pagamento(p_plano uuid, p_modalidade text, p_negociado numeric) returns numeric
language sql stable security definer set search_path = '' as $$
  select case
           when p_modalidade is null then null
           when p_negociado > 0 then round(p_negociado, 2)
           when p_modalidade = 'mensal' then coalesce(pa.valor_parcela_mensal,
                  case when pa.valor > 0 and pa.meses between 1 and 24 then round(pa.valor / pa.meses, 2) end)
           when pa.valor > 0 and pa.meses between 1 and 24 then pa.valor
         end
    from {schema}.planos_aluno pa where pa.id = p_plano;
$$;
revoke execute on function {schema}.plano_valor_do_pagamento(uuid, text, numeric) from public, anon, authenticated;
grant execute on function {schema}.plano_valor_do_pagamento(uuid, text, numeric) to service_role;

-- o valor do próximo pagamento acompanha o plano (BEFORE: a gravação direta de mensalidade_valor não descasa — §7, resposta 1)
create or replace function {schema}.pacientes_valor_do_plano() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v numeric;
begin
  if new.plano_modalidade is null then
    new.plano_valor_negociado := null;   -- B1: sem modalidade = o modo de hoje (o valor digitado manda)
    return new;
  end if;
  if new.plano_aluno_id is null then
    raise exception 'plano_modalidade sem plano_aluno_id' using errcode = '23514';
  end if;
  v := {schema}.plano_valor_do_pagamento(new.plano_aluno_id, new.plano_modalidade, new.plano_valor_negociado);
  if v is not null then
    new.mensalidade_valor := v;
  end if;
  return new;
end;
$$;
revoke execute on function {schema}.pacientes_valor_do_plano() from public, anon, authenticated;
drop trigger if exists trg_pacientes_valor_do_plano on {schema}.pacientes;
create trigger trg_pacientes_valor_do_plano
  before insert or update of plano_aluno_id, plano_modalidade, plano_valor_negociado, mensalidade_valor on {schema}.pacientes
  for each row execute function {schema}.pacientes_valor_do_plano();

-- mudar valor/meses/parcela do plano vale a partir do próximo pagamento de quem segue o plano (§3.4) — sem valor negociado e fora da
-- conta do app (B2: lá a matrícula guarda o valor do plano escolhido — W7b)
create or replace function {schema}.planos_aluno_propagar_valor() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  update {schema}.pacientes p
     set mensalidade_valor = {schema}.plano_valor_do_pagamento(new.id, p.plano_modalidade, null)
   where p.plano_aluno_id = new.id
     and p.plano_modalidade is not null
     and p.plano_valor_negociado is null
     and p.deleted_at is null
     and not exists (select 1 from {schema}.contas c where c.id = p.conta_id and c.origem = 'app')
     and {schema}.plano_valor_do_pagamento(new.id, p.plano_modalidade, null) is not null
     and p.mensalidade_valor is distinct from {schema}.plano_valor_do_pagamento(new.id, p.plano_modalidade, null);
  return null;
end;
$$;
revoke execute on function {schema}.planos_aluno_propagar_valor() from public, anon, authenticated;
drop trigger if exists trg_planos_aluno_propagar_valor on {schema}.planos_aluno;
create trigger trg_planos_aluno_propagar_valor after update of valor, meses, valor_parcela_mensal on {schema}.planos_aluno
  for each row execute function {schema}.planos_aluno_propagar_valor();

-- ============================================================================================================
-- 5. Cobertura (corpo da w07b — §7 I3 — com o teste grátis do app): cada pagamento empurra o "pago até" em meses_cobertos meses; o dia
--    da cobrança automática só manda no pagamento de 1 mês (o período todo não é encurtado); a "parcela n de N" é cache como
--    cobre_de/cobre_ate (recusa, estorno e remoção renumeram sozinhos) e volta a 1 depois da N-ésima (P-A "1": o plano renova)
-- ============================================================================================================
create or replace function {schema}.mensalidade_recalcular(p_paciente uuid) returns timestamptz
language plpgsql security definer set search_path = '' set timezone = 'UTC' as $$
declare
  v_ancora integer;
  v_cob timestamptz := null;
  v_base timestamptz;
  v_fim timestamptz;
  v_prox timestamptz;
  v_teste_de timestamptz;
  v_teste_ate timestamptz;
  v_teste_aplicado boolean;
  v_meses integer;
  v_seq integer := 0;
  v_seq_plano uuid := null;
  v_seq_total integer := null;
  v_num integer;
  r record;
begin
  if p_paciente is null then
    return null;
  end if;
  select p.app_teste_de, p.app_teste_ate into v_teste_de, v_teste_ate from {schema}.pacientes p where p.id = p_paciente;
  v_teste_aplicado := v_teste_ate is null;
  select extract(day from a.proximo_vencimento)::integer into v_ancora
    from {schema}.aluno_assinaturas a
   where a.paciente_id = p_paciente and a.status = 'authorized' and a.proximo_vencimento is not null
   order by a.criado_em desc limit 1;
  for r in
    select c.id, c.pago_em, c.meses_cobertos, c.parcelas_total, c.plano_aluno_id from {schema}.cobrancas c
     where c.paciente_id = p_paciente and c.tipo = 'mensalidade' and c.status = 'paga'
       and c.deleted_at is null and c.pago_em is not null
     order by c.pago_em, c.created_at, c.id
  loop
    if not v_teste_aplicado and coalesce(v_teste_de, v_teste_ate) <= r.pago_em then
      v_cob := greatest(coalesce(v_cob, v_teste_ate), v_teste_ate);
      v_teste_aplicado := true;
    end if;
    v_meses := greatest(coalesce(r.meses_cobertos, 1), 1);
    v_base := greatest(r.pago_em, coalesce(v_cob, r.pago_em));
    v_fim := v_base + make_interval(months => v_meses);         -- o Postgres trava no fim do mês (31/01 + 1 mês = 28/02)
    if v_ancora is not null and v_meses = 1 then
      v_prox := {schema}.financeiro_proxima_ancora(v_base, v_ancora);
      if v_prox < v_fim then v_fim := v_prox; end if;
    end if;
    if r.parcelas_total is not null then
      if v_seq_plano is not distinct from r.plano_aluno_id and v_seq_total = r.parcelas_total then
        v_seq := v_seq + 1;
      else
        v_seq := 1;
        v_seq_plano := r.plano_aluno_id;
        v_seq_total := r.parcelas_total;
      end if;
      v_num := ((v_seq - 1) % r.parcelas_total) + 1;
    else
      v_seq := 0;
      v_seq_plano := null;
      v_seq_total := null;
      v_num := null;
    end if;
    update {schema}.cobrancas set cobre_de = v_base, cobre_ate = v_fim, parcela_num = v_num
     where id = r.id and (cobre_de is distinct from v_base or cobre_ate is distinct from v_fim or parcela_num is distinct from v_num);
    v_cob := v_fim;
  end loop;
  if not v_teste_aplicado then
    v_cob := greatest(coalesce(v_cob, v_teste_ate), v_teste_ate);
  end if;
  -- o que deixou de ser pago (recusa, estorno, removido) sai da cobertura e da contagem das parcelas
  update {schema}.cobrancas set cobre_de = null, cobre_ate = null, parcela_num = null
   where paciente_id = p_paciente and tipo = 'mensalidade' and (status <> 'paga' or deleted_at is not null)
     and (cobre_de is not null or cobre_ate is not null or parcela_num is not null);
  update {schema}.pacientes set mensalidade_pago_ate = v_cob where id = p_paciente and mensalidade_pago_ate is distinct from v_cob;
  return v_cob;
end;
$$;
revoke execute on function {schema}.mensalidade_recalcular(uuid) from public, anon, authenticated;
grant execute on function {schema}.mensalidade_recalcular(uuid) to service_role;

-- o gatilho da cobertura também olha meses_cobertos e parcelas_total (o recálculo grava cobre_*/parcela_num e não dispara de novo)
drop trigger if exists trg_cobrancas_mensalidade on {schema}.cobrancas;
create trigger trg_cobrancas_mensalidade
  after insert or delete or update of status, pago_em, deleted_at, tipo, paciente_id, meses_cobertos, parcelas_total on {schema}.cobrancas
  for each row execute function {schema}.cobrancas_recalcular_mensalidade();

-- ============================================================================================================
-- 6. financeiro_do_aluno() (corpo da w07b) + a modalidade e os meses do plano (a faixa do topo diz "Seu plano" no período todo)
-- ============================================================================================================
create or replace function {schema}.financeiro_do_aluno() returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(x.j order by x.criado), '[]'::jsonb) from (
    select p.created_at as criado, jsonb_build_object(
      'paciente_id', p.id,
      'conta_id', p.conta_id,
      'conta_nome', c.nome,
      'recebimento_modo', coalesce(c.recebimento_modo, 'pix_manual'),
      'bloquear_inadimplente', coalesce(c.bloquear_app_inadimplente, false),
      'tem_chave', exists (select 1 from {schema}.recebimento_chaves k where k.conta_id = p.conta_id and k.ativa),
      'profissional', case when c.origem = 'app' then 'Physiq' else
                        (select coalesce(nullif(btrim(pr.nome), ''), pr.email) from {schema}.profiles pr
                          where pr.id = coalesce(c.dono_id, p.personal_id, p.nutricionista_id)) end,
      'mensalidade_valor', p.mensalidade_valor,
      'plano_nome', (select pa.nome from {schema}.planos_aluno pa where pa.id = p.plano_aluno_id),
      'pausada', p.cobranca_pausada,
      'pago_ate', p.mensalidade_pago_ate,
      'desde', p.mensalidade_desde,
      'aguardando', exists (select 1 from {schema}.cobrancas a where a.paciente_id = p.id and a.deleted_at is null
                              and a.status = 'aguardando_confirmacao' and a.tipo = 'mensalidade'),
      'assinatura_ativa', exists (select 1 from {schema}.aluno_assinaturas s where s.paciente_id = p.id and s.status = 'authorized'),
      'abertas', (select coalesce(jsonb_agg(jsonb_build_object('id', a.id, 'descricao', a.descricao, 'valor', a.valor,
                          'vencimento', a.vencimento) order by a.vencimento), '[]'::jsonb)
                    from {schema}.cobrancas a where a.paciente_id = p.id and a.deleted_at is null and a.status = 'aberta'),
      'aguardando_avulsas', (select count(*) from {schema}.cobrancas a where a.paciente_id = p.id and a.deleted_at is null
                               and a.status = 'aguardando_confirmacao' and a.tipo = 'avulsa'),
      -- W7b
      'app', coalesce(c.origem = 'app', false),
      'teste_ate', case when c.origem = 'app' then p.app_teste_ate end,
      'plano_codigo', (select pa.codigo from {schema}.planos_aluno pa where pa.id = p.plano_aluno_id),
      -- W-P
      'modalidade', p.plano_modalidade,
      'plano_meses', (select pa.meses from {schema}.planos_aluno pa where pa.id = p.plano_aluno_id)
    ) as j
    from {schema}.pacientes p
    left join {schema}.contas c on c.id = p.conta_id
    where p.user_id = auth.uid() and p.deleted_at is null and p.ativo
  ) x;
$$;
revoke execute on function {schema}.financeiro_do_aluno() from public, anon;
grant execute on function {schema}.financeiro_do_aluno() to authenticated, service_role;
```

- [ ] **Step 4: Aplicar no staging e rodar os testes do banco**

```bash
python3 scripts/apply_migration_principal.py supabase-principal/migrations/20261011010000_wp_planos_modalidades.sql --so staging
python3 e2e/wp/sql_planos.py
python3 e2e/w06/sql_cobertura.py
python3 e2e/wp/sql_planos.py --so-regressao --schema staging --comparar ~/projetos/physiqcalc-scratch/wp/regressao-staging-antes.json
python3 e2e/hml01/banco.py --schema staging
```
Expected: `sql_planos.py` todos ✅ (cobertura, parcelas, valor, B2, nada gravado); `sql_cobertura.py` (as datas do Calc) todos ✅;
regressão ✅ ("o MESMO 'pago até' para todos"); `hml01/banco.py` sem regressão. Qualquer ❌ → `superpowers:systematic-debugging`
antes de seguir.

- [ ] **Step 5: Commit**

```bash
git add supabase-principal/migrations/20261011010000_wp_planos_modalidades.sql e2e/wp/sql_planos.py
gcw -m "feat(planos): banco — duração e modalidades, valor por gatilho, cobertura em meses e parcela n de N"
```

---

### Task 4: Banco — trava das colunas de cobrança (migration 2, §7 I5)

**Files:**
- Create: `supabase-principal/migrations/20261011020000_wp_trava_cobranca.sql`
- Test: a prova é pela API do app (Task 9, caso `mensal`: o dono tenta gravar direto); aqui, a conferência do catálogo.

- [ ] **Step 1: Escrever a conferência que falha**

Run (só leitura): `python3 -c "import sys; sys.path.insert(0,'e2e/w02'); from _comum import sql_principal as q; print(q(\"select tgname from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname='staging' and tgname in ('trg_pacientes_guard_cobranca','trg_cobrancas_guard_periodo')\"), q(\"select policyname from pg_policies where schemaname='staging' and tablename='planos_aluno'\"))"`
Expected (antes): `[]` e as 3 policies, incluindo `planos_aluno: dono edita`.

- [ ] **Step 2: Escrever a migration**

```sql
-- Physiq W-P — trava NO BANCO das colunas de cobrança (desenho §7 I5). Idempotente. O app (authenticated) tinha UPDATE direto em
-- pacientes.mensalidade_valor/mensalidade_pago_ate/plano_aluno_id/cobranca_pausada (a policy "pacientes: editar pela conta" inclui o
-- personal e a nutri responsáveis) e INSERT/UPDATE em cobrancas — com meses_cobertos, uma linha "paga" inserida pela API valeria N meses.
-- Agora: essas colunas só mudam pelo servidor (pagamentos-aluno, service_role) ou pelo master; a AVULSA que o site antigo do Nutri grava
-- direto continua (só as colunas de período ficam no padrão). planos_aluno vira só leitura para o app (a gravação é da função, só o dono).
--
-- Aplicar (depois da 20261011010000; backup ANTES):
--   python3 scripts/apply_migration_principal.py supabase-principal/migrations/20261011020000_wp_trava_cobranca.sql --so staging
--   python3 scripts/apply_migration_principal.py supabase-principal/migrations/20261011020000_wp_trava_cobranca.sql --so public

create or replace function {schema}.pacientes_guard_cobranca() returns trigger
language plpgsql set search_path = '' as $$
begin
  if current_user = 'authenticated' and not {schema}.eh_master() then
    if tg_op = 'INSERT' then
      new.mensalidade_valor := null;
      new.mensalidade_pago_ate := null;
      new.plano_aluno_id := null;
      new.plano_modalidade := null;
      new.plano_valor_negociado := null;
      new.cobranca_pausada := false;
    else
      new.mensalidade_valor := old.mensalidade_valor;
      new.mensalidade_pago_ate := old.mensalidade_pago_ate;
      new.plano_aluno_id := old.plano_aluno_id;
      new.plano_modalidade := old.plano_modalidade;
      new.plano_valor_negociado := old.plano_valor_negociado;
      new.cobranca_pausada := old.cobranca_pausada;
    end if;
  end if;
  return new;
end;
$$;
revoke execute on function {schema}.pacientes_guard_cobranca() from public, anon, authenticated;
-- o nome vem antes de trg_pacientes_valor_do_plano na ordem dos gatilhos BEFORE (alfabética): a guarda devolve o valor velho e só
-- depois o valor do plano é recalculado
drop trigger if exists trg_pacientes_guard_cobranca on {schema}.pacientes;
create trigger trg_pacientes_guard_cobranca before insert or update on {schema}.pacientes
  for each row execute function {schema}.pacientes_guard_cobranca();

create or replace function {schema}.cobrancas_guard_periodo() returns trigger
language plpgsql set search_path = '' as $$
begin
  if current_user = 'authenticated' and not {schema}.eh_master() then
    if tg_op = 'INSERT' then
      new.meses_cobertos := 1;
      new.parcelas_total := null;
      new.parcela_num := null;
    else
      new.meses_cobertos := old.meses_cobertos;
      new.parcelas_total := old.parcelas_total;
      new.parcela_num := old.parcela_num;
    end if;
  end if;
  return new;
end;
$$;
revoke execute on function {schema}.cobrancas_guard_periodo() from public, anon, authenticated;
drop trigger if exists trg_cobrancas_guard_periodo on {schema}.cobrancas;
create trigger trg_cobrancas_guard_periodo before insert or update on {schema}.cobrancas
  for each row execute function {schema}.cobrancas_guard_periodo();

-- planos_aluno: os membros leem e o master edita (policies de hoje); a escrita do dono passa a ser só pela pagamentos-aluno
drop policy if exists "planos_aluno: dono edita" on {schema}.planos_aluno;
```

- [ ] **Step 3: Aplicar no staging e conferir**

```bash
python3 scripts/apply_migration_principal.py supabase-principal/migrations/20261011020000_wp_trava_cobranca.sql --so staging
python3 e2e/wp/sql_planos.py
python3 e2e/hml01/banco.py --schema staging
```
E repetir o comando do Step 1. Expected: os 2 gatilhos aparecem; as policies de `planos_aluno` são só `membros leem` e `master tudo`;
`sql_planos.py` continua ✅ (roda como `postgres`, a guarda não atrapalha); `hml01` sem regressão.

- [ ] **Step 4: Commit**

```bash
git add supabase-principal/migrations/20261011020000_wp_trava_cobranca.sql
gcw -m "feat(planos): trava no banco das colunas de cobrança e planos_aluno só leitura para o app (I5)"
```

---

### Task 5: Servidor — matrícula com o plano (fallback em 3 níveis) e retrato na cobrança da assinatura

**Files:**
- Modify: `supabase-principal/functions/_shared/financeiro-mp.ts` (tipo `Matricula`, `COLUNAS_MATRICULA`, `carregarMatricula`, `registrarPagamentoAvulsoDoMp`)

- [ ] **Step 1: Teste — o tipo novo quebra o `tsc` até o código acompanhar**

Acrescentar ao fim de `src/financeiro/servidor.test.ts`:

```ts
import { retratoDoPlano as retratoServidor } from "../../supabase-principal/functions/_shared/planos-regras";
import type { Matricula } from "../../supabase-principal/functions/_shared/financeiro-mp";

describe("W-P: a matrícula carrega o plano com período", () => {
  it("o retrato sai da matrícula como o servidor a carrega", () => {
    const m = { plano_modalidade: "mensal", plano: { id: "p", nome: "Anual", meses: 12 } } as Pick<Matricula, "plano_modalidade" | "plano">;
    expect(retratoServidor(m)).toEqual({ meses_cobertos: 1, parcelas_total: 12 });
  });
});
```
Run: `npx vitest run src/financeiro/servidor.test.ts && npm run tipos` → Expected: FAIL no `tsc` (`plano_modalidade` não existe em `Matricula`).

> Atenção: `financeiro-mp.ts` importa `https://esm.sh/...` só como `import type` — o Vitest já lê `financeiro-regras.ts` assim; se o
> import de tipo do `financeiro-mp.ts` quebrar o Vitest, troque o teste para `import type { Matricula }` (já é) e mantenha.

- [ ] **Step 2: Implementar**

Em `financeiro-mp.ts`:

1. No topo, junto dos imports:
```ts
import { retratoDoPlano, type Modalidade } from "./planos-regras.ts";
```
2. No `interface Matricula`, trocar a linha do `plano` e acrescentar as 2 colunas:
```ts
  /** W-P — a modalidade do aluno no plano (nula = o modo de hoje) e o valor negociado; ausentes no schema sem a migration */
  plano_modalidade?: Modalidade | null;
  plano_valor_negociado?: number | null;
  conta: { id: string; nome: string; dono_id: string | null; recebimento_modo: string; bloquear_app_inadimplente: boolean; origem: string } | null;
  plano: { id: string; nome: string; codigo?: string | null; valor?: number | null; meses?: number; modalidades?: Modalidade[];
           max_parcelas_cartao?: number | null; valor_parcela_mensal?: number | null } | null;
```
3. Trocar `COLUNAS_MATRICULA` e acrescentar a de antes (W7b) e a do plano:
```ts
/** As colunas do plano com período (W-P) — prof_planos, prof_aluno e a ficha. */
export const COLUNAS_PLANO = "id, nome, valor, ativo, meses, modalidades, max_parcelas_cartao, valor_parcela_mensal";

export const COLUNAS_MATRICULA =
  "id, conta_id, user_id, treino_user_id, nome, email, cpf, foto_url, ativo, tags, personal_id, nutricionista_id, plano_aluno_id, " +
  "mensalidade_valor, cobranca_pausada, mensalidade_desde, mensalidade_pago_ate, deleted_at, app_teste_de, app_teste_ate, objetivo_app, " +
  "plano_modalidade, plano_valor_negociado, " +
  "conta:contas(id, nome, dono_id, recebimento_modo, bloquear_app_inadimplente, origem), " +
  "plano:planos_aluno(id, nome, codigo, valor, meses, modalidades, max_parcelas_cartao, valor_parcela_mensal)";

/** As colunas de antes da W-P (o schema que ainda não recebeu a migration dos planos). */
const COLUNAS_MATRICULA_W7B =
  "id, conta_id, user_id, treino_user_id, nome, email, cpf, foto_url, ativo, tags, personal_id, nutricionista_id, plano_aluno_id, " +
  "mensalidade_valor, cobranca_pausada, mensalidade_desde, mensalidade_pago_ate, deleted_at, app_teste_de, app_teste_ate, objetivo_app, " +
  "conta:contas(id, nome, dono_id, recebimento_modo, bloquear_app_inadimplente, origem), plano:planos_aluno(id, nome, codigo)";
```
4. Trocar o corpo de `carregarMatricula` (a W-P → a W7b → a W6, nessa ordem):
```ts
const COLUNA_AUSENTE = /column|coluna|does not exist|42703|PGRST20/i;

export async function carregarMatricula(db: SupabaseClient, id: string): Promise<Matricula | null> {
  // a função é publicada uma vez para public e staging: o schema sem a migration da W-P (ou da W7b) lê as colunas de antes
  for (const colunas of [COLUNAS_MATRICULA, COLUNAS_MATRICULA_W7B, COLUNAS_MATRICULA_W6]) {
    const { data, error } = await db.from("pacientes").select(colunas).eq("id", id).maybeSingle();
    if (error && COLUNA_AUSENTE.test(`${error.code ?? ""} ${error.message ?? ""}`)) continue;
    if (error) throw error;
    return (data as unknown as Matricula | null) ?? null;
  }
  throw new Error("pacientes: nenhuma lista de colunas serviu");
}
```
5. Em `registrarPagamentoAvulsoDoMp`, no `insert` da cobrança, trocar
`plano_aluno_id: m.plano_aluno_id, origem: extra.origem,` por
`plano_aluno_id: m.plano_aluno_id, origem: extra.origem, ...retratoDoPlano(m),`.

- [ ] **Step 3: Rodar**

Run: `npx vitest run src/financeiro && npm run tipos`
Expected: PASS e `tsc` limpo.

- [ ] **Step 4: Commit**

```bash
git add supabase-principal/functions/_shared/financeiro-mp.ts src/financeiro/servidor.test.ts
gcw -m "feat(planos): a matrícula carrega o plano (fallback para o schema sem a migration) e a assinatura grava o retrato"
```

---

### Task 6: Servidor — ações dos planos (`prof_planos`, `prof_plano_salvar`, `prof_plano_ativo`)

**Files:**
- Modify: `supabase-principal/functions/pagamentos-aluno/index.ts`

- [ ] **Step 1: Cabeçalho e imports**

No comentário do topo, na lista PROFISSIONAL, acrescentar:
```ts
//   prof_planos       { conta_id }                          W-P: os planos da conta (completo, parcela, quantos alunos) e o modo
//   prof_plano_salvar { conta_id, id?, nome, meses, valor, modalidades, max_parcelas_cartao?, valor_parcela_mensal? }  só o dono
//   prof_plano_ativo  { conta_id, id, ativo }               W-P: desativar/reativar (quem já está no plano continua)
```
Nos imports, acrescentar:
```ts
import {
  MODALIDADES, aceitaAutomatica, descricaoDoPagamento, ehModalidade, maxParcelasDoCartao, modalidadesDaConta, modalidadesOferecidas,
  parcelaMensal, parcelasValidas, planoCompleto, proximaParcela, retratoDoPlano, validarPlano, type Modalidade, type Parcela, type PlanoDoAluno,
} from "../_shared/planos-regras.ts";
import { novoValorDaAutomatica, type ResultadoValor } from "../_shared/planos-automatica.ts";
```
e incluir `COLUNAS_PLANO` no import de `../_shared/financeiro-mp.ts`.

- [ ] **Step 2: Capacidade do schema (fora do `Deno.serve`, depois do `const log = …`)**

```ts
// W-P: a função é uma só para public e staging — o que é dos planos só liga no schema que já tem a migration (o molde do
// COLUNAS_MATRICULA_W6). Guardado 60 s por schema nesta instância.
const PLANOS_NO_SCHEMA = new Map<Schema, { tem: boolean; em: number }>();
```

- [ ] **Step 3: Ajudantes (dentro do `Deno.serve`, depois de `exigirMensalidade`)**

```ts
  const schemaTemPlanos = async (): Promise<boolean> => {
    const guardado = PLANOS_NO_SCHEMA.get(schema);
    if (guardado && Date.now() - guardado.em < 60_000) return guardado.tem;
    const { error } = await db.from("planos_aluno").select("meses").limit(1);
    if (error && !/column|coluna|does not exist|42703|PGRST20/i.test(`${error.code ?? ""} ${error.message ?? ""}`)) throw error;
    PLANOS_NO_SCHEMA.set(schema, { tem: !error, em: Date.now() });
    return !error;
  };
  /** A matrícula veio com as colunas da W-P (o schema tem a migration)? */
  const temPlanos = (m: Matricula) => m.plano_modalidade !== undefined;

  /** Papel de quem chama na CONTA (a tela de Planos): master, dono, membro. */
  const papelNaConta = async (contaId: string) => {
    if (ehMaster) return { master: true, dono: true, membro: true };
    const { data, error } = await db.from("conta_membros").select("papeis").eq("conta_id", contaId).eq("user_id", user.id).eq("status", "ativo").maybeSingle();
    if (error) throw error;
    const papeis = ((data as { papeis: string[] } | null)?.papeis ?? []) as string[];
    return { master: false, dono: papeis.includes("dono"), membro: !!data };
  };

  /** A conta da tela de Planos: o modo de receber e se é a conta do app (os 2 planos do app são do master — B2). */
  const contaDosPlanos = async (contaId: unknown, exigirDono: boolean) => {
    if (!ehUuidFin(contaId)) falhar("conta_invalida");
    if (!(await schemaTemPlanos())) falhar("planos_indisponivel", 409);
    const papel = await papelNaConta(String(contaId));
    if (!papel.membro) falhar("sem_permissao", 403);
    if (exigirDono && !papel.master && !papel.dono) falhar("so_o_dono", 403);
    const { data, error } = await db.from("contas").select("id, recebimento_modo, origem").eq("id", String(contaId)).maybeSingle();
    if (error) throw error;
    if (!data) falhar("conta_invalida", 404);
    const c = data as { id: string; recebimento_modo: string | null; origem: string | null };
    if (exigirDono && c.origem === "app") falhar("conta_do_app", 403);
    return { id: c.id, modo: c.recebimento_modo ?? "pix_manual", app: c.origem === "app", papel };
  };

  /** I1: o valor do próximo pagamento mudou e a automática está ligada → PUT no MP; falhou → aviso ao dono. */
  const sincronizarAutomatica = async (m: Matricula): Promise<ResultadoValor> => {
    const a = await assinaturaDe(m.id);
    const r = await novoValorDaAutomatica(a, Number(m.mensalidade_valor), async (id, corpo) => {
      const { status: st, body: pre } = await mpFetch<AssinaturaMp>(credencial, `/preapproval/${encodeURIComponent(id)}`,
        { method: "PUT", body: JSON.stringify(corpo) }, { prazo: prazoDoPedido });
      if (st < 300 && pre?.id) {
        const { error } = await db.from("aluno_assinaturas").update({
          ...espelhoAssinaturaAluno(pre, { ...(a!.payload ?? {}), valor_trocado_em: new Date().toISOString() }),
          valor: corpo.auto_recurring.transaction_amount,
        }).eq("id", a!.id);
        if (error) throw error;
      }
      return { status: st, body: pre };
    });
    if (r === "falhou") {
      log.erro({ codigo: "mp_valor_assinatura_falhou", schema, acao, ref: a?.id ?? m.id });
      await avisar(db, recebedor(m), "geral", `Não deu para mudar o valor da cobrança automática de ${m.nome}. Confira no financeiro do aluno.`,
        linkDoAlunoNoPainel(m), log, schema);
    }
    return r;
  };

  /** I1 em lote: quem segue o plano (sem negociado) depois que o dono mudou o valor/meses/parcela — o gatilho já mudou o valor. */
  const sincronizarAutomaticasDoPlano = async (planoId: string) => {
    const { data, error } = await db.from("pacientes").select("id").eq("plano_aluno_id", planoId).not("plano_modalidade", "is", null)
      .is("plano_valor_negociado", null).is("deleted_at", null).limit(200);
    if (error) throw error;
    let atualizadas = 0;
    let falharam = 0;
    for (const { id } of (data ?? []) as Array<{ id: string }>) {
      const m = await carregarMatricula(db, id);
      if (!m) continue;
      const r = await sincronizarAutomatica(m);
      if (r === "atualizada") atualizadas++;
      if (r === "falhou") falharam++;
    }
    return { atualizadas, falharam };
  };
```

- [ ] **Step 4: As 3 ações (antes de `if (acao === "prof_resumo")`)**

```ts
    if (acao === "prof_planos") {
      const conta = await contaDosPlanos(body.conta_id, false);
      const { data, error } = await db.from("planos_aluno").select(COLUNAS_PLANO).eq("conta_id", conta.id).order("ativo", { ascending: false }).order("nome");
      if (error) throw error;
      const planos = (data ?? []) as unknown as PlanoDoAluno[];
      const alunos = await Promise.all(planos.map(async (pl) => {
        const { count, error: ec } = await db.from("pacientes").select("id", { count: "exact", head: true }).eq("plano_aluno_id", pl.id).is("deleted_at", null);
        if (ec) throw ec;
        return count ?? 0;
      }));
      return json({
        ok: true, modo: conta.modo, app: conta.app, pode_editar: (conta.papel.master || conta.papel.dono) && !conta.app,
        modalidades_da_conta: modalidadesDaConta(conta.modo),
        planos: planos.map((pl, i) => ({ ...pl, completo: planoCompleto(pl), parcela: parcelaMensal(pl), alunos: alunos[i] })),
      }, 200, origin);
    }

    if (acao === "prof_plano_salvar") {
      const conta = await contaDosPlanos(body.conta_id, true);
      const v = validarPlano(body, modalidadesDaConta(conta.modo));
      if (!v.ok) falhar(v.erro);
      const plano = (v as { ok: true; plano: Record<string, unknown> & { modalidades: Modalidade[] } }).plano;
      const id = ehUuidFin(body.id) ? String(body.id) : null;
      if (id) {
        // não tira uma modalidade que tem aluno nela (o personal passa os alunos para outra antes)
        const removidas = MODALIDADES.filter((x) => !plano.modalidades.includes(x));
        if (removidas.length) {
          const { count, error } = await db.from("pacientes").select("id", { count: "exact", head: true }).eq("plano_aluno_id", id)
            .in("plano_modalidade", removidas).is("deleted_at", null);
          if (error) throw error;
          if ((count ?? 0) > 0) falhar("modalidade_em_uso", 409, { alunos: count });
        }
      }
      const { data: salvo, error } = id
        ? await db.from("planos_aluno").update(plano).eq("id", id).eq("conta_id", conta.id).select(COLUNAS_PLANO).maybeSingle()
        : await db.from("planos_aluno").insert({ ...plano, conta_id: conta.id }).select(COLUNAS_PLANO).single();
      if (error) {
        if (String(error.code) === "23505") falhar("nome_repetido", 409);
        throw error;
      }
      if (!salvo) falhar("plano_invalido", 404);
      const automaticas = id ? await sincronizarAutomaticasDoPlano(id) : { atualizadas: 0, falharam: 0 };
      return json({ ok: true, plano: salvo, automaticas }, 200, origin);
    }

    if (acao === "prof_plano_ativo") {
      const conta = await contaDosPlanos(body.conta_id, true);
      if (!ehUuidFin(body.id)) falhar("plano_invalido");
      const { data, error } = await db.from("planos_aluno").update({ ativo: body.ativo === true }).eq("id", String(body.id)).eq("conta_id", conta.id)
        .select(COLUNAS_PLANO).maybeSingle();
      if (error) throw error;
      if (!data) falhar("plano_invalido", 404);
      return json({ ok: true, plano: data }, 200, origin);
    }
```

- [ ] **Step 5: Conferir tipos e commit**

Run: `npm run tipos && npx vitest run src/financeiro`
Expected: limpo. (A função é Deno: a prova de verdade é o `e2e/wp/api.py`, Task 9.)

```bash
git add supabase-principal/functions/pagamentos-aluno/index.ts
gcw -m "feat(planos): ações da tela de Planos na pagamentos-aluno (listar, salvar, desativar)"
```

---

### Task 7: Servidor — `prof_definir` com plano de período (e o modo de hoje intacto, B1)

**Files:**
- Modify: `supabase-principal/functions/pagamentos-aluno/index.ts` (bloco `if (acao === "prof_definir")`, ~linha 983)

- [ ] **Step 1: Cabeçalho**

Trocar a linha do `prof_definir` no comentário do topo por:
```ts
//   prof_definir      { aluno, plano_aluno_id?, plano_novo?, valor }   modo de hoje: plano só com nome e valor (o APK antigo manda assim)
//                     { aluno, plano_aluno_id, plano_modalidade, plano_valor_negociado?, inicio?, cancelar_automatica? }   W-P:
//                     plano com período (o valor sai do plano); plano_modalidade: null volta ao modo de hoje
```

- [ ] **Step 2: Ajudante para desligar a automática (junto dos ajudantes da Task 6)**

```ts
  /** Trocar para o período todo desliga a automática (§4.4) — com o OK de quem troca; o aluno é avisado. */
  const cancelarAutomatica = async (m: Matricula, a: NonNullable<Awaited<ReturnType<typeof assinaturaDe>>>) => {
    if (a.mp_preapproval_id && !simulado(a.mp_preapproval_id)) {
      const { status: sc, body: pre } = await mpFetch<AssinaturaMp>(credencial, `/preapproval/${encodeURIComponent(a.mp_preapproval_id)}`, {
        method: "PUT", body: JSON.stringify({ status: "cancelled" }),
      }, { prazo: prazoDoPedido });
      if (sc >= 300 || !pre?.id) falhar("mp_error", 502, { status_mp: sc });
      const { error } = await db.from("aluno_assinaturas").update(espelhoAssinaturaAluno(pre!, { ...(a.payload ?? {}), cancelada_por: user.id, motivo: "plano_periodo" })).eq("id", a.id);
      if (error) throw error;
    } else {
      const { error } = await db.from("aluno_assinaturas").update({ status: "cancelled" }).eq("id", a.id);
      if (error) throw error;
    }
    await avisar(db, m.user_id, "geral", "Seu plano mudou: a cobrança automática no cartão foi desligada. Veja em Pagamentos.", "/perfil/pagamentos", log, schema);
  };
```

- [ ] **Step 3: Trocar o bloco `prof_definir` inteiro**

```ts
    if (acao === "prof_definir") {
      const { m, p } = await matriculaDoPainel(body.aluno);
      exigirMensalidade(p);
      if (!m.conta_id) falhar("sem_conta");
      if ("plano_modalidade" in body && body.plano_modalidade !== null) {
        // W-P: aluno num plano com período — plano, modalidade, valor negociado e 1º vencimento (o valor sai do plano, pelo gatilho)
        if (!temPlanos(m)) falhar("planos_indisponivel", 409);
        if (ehDoApp(m)) falhar("conta_do_app", 403);
        if (!ehModalidade(body.plano_modalidade)) falhar("modalidade_invalida");
        const modalidade = body.plano_modalidade as Modalidade;
        if (!ehUuidFin(body.plano_aluno_id)) falhar("plano_invalido");
        const planoId = String(body.plano_aluno_id);
        const { data: pl, error: ep } = await db.from("planos_aluno").select(COLUNAS_PLANO).eq("id", planoId).eq("conta_id", m.conta_id!).maybeSingle();
        if (ep) throw ep;
        if (!pl) falhar("plano_invalido");
        const plano = pl as unknown as PlanoDoAluno;
        // plano novo: só ativo, completo e numa modalidade que a conta recebe; quem já está no plano (mesmo desativado) continua
        const ofertas = m.plano_aluno_id === planoId ? (planoCompleto(plano) ? plano.modalidades : []) : modalidadesOferecidas(plano, m.conta?.recebimento_modo);
        if (!ofertas.includes(modalidade)) falhar("modalidade_indisponivel");
        const vazio = body.plano_valor_negociado === null || body.plano_valor_negociado === "" || body.plano_valor_negociado === undefined;
        const negociado = vazio ? null : valorValido(body.plano_valor_negociado);
        if (!vazio && negociado === null) falhar("valor_invalido");
        const a = await assinaturaDe(m.id);
        if (a && ["authorized", "pending", "paused"].includes(a.status) && !aceitaAutomatica(modalidade, plano.meses)) {
          if (body.cancelar_automatica !== true) falhar("automatica_ativa", 409);
          await cancelarAutomatica(m, a);
        }
        const patch: Record<string, unknown> = { plano_aluno_id: planoId, plano_modalidade: modalidade, plano_valor_negociado: negociado };
        // 1º vencimento de quem nunca pagou (padrão hoje); quem já pagou segue a régua dele ("vale a partir do próximo pagamento")
        if (!m.mensalidade_pago_ate) {
          const inicio = typeof body.inicio === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.inicio) ? body.inicio : hoje;
          patch.mensalidade_desde = new Date(`${inicio}T12:00:00Z`).toISOString();
        }
        const { error } = await db.from("pacientes").update(patch).eq("id", m.id);
        if (error) throw error;
        const atual = (await carregarMatricula(db, m.id))!;
        const automatica = await sincronizarAutomatica(atual);
        return json({ ok: true, mensalidade: await mensalidadeComPlano(atual), automatica }, 200, origin);
      }
      // modo de hoje (B1): plano só com nome e o valor digitado. O APK antigo não manda plano_modalidade — quem está num plano com
      // período só muda pela tela nova
      if (m.plano_modalidade && !("plano_modalidade" in body)) falhar("aluno_em_plano_novo", 409);
      let planoId: string | null = ehUuidFin(body.plano_aluno_id) ? String(body.plano_aluno_id) : null;
      const planoNovo = textoCurto(body.plano_novo, 80);
      if (planoNovo) {
        const { data: ja } = await db.from("planos_aluno").select("id").eq("conta_id", m.conta_id).ilike("nome", planoNovo).maybeSingle();
        if (ja) planoId = (ja as { id: string }).id;
        else {
          const { data: novo, error } = await db.from("planos_aluno").insert({ conta_id: m.conta_id, nome: planoNovo }).select("id").single();
          if (error) throw error;
          planoId = (novo as { id: string }).id;
        }
      }
      if (planoId) {
        const { data: pl } = await db.from("planos_aluno").select("id").eq("id", planoId).eq("conta_id", m.conta_id).maybeSingle();
        if (!pl) falhar("plano_invalido");
      }
      const vazio = body.valor === null || body.valor === "" || body.valor === undefined;
      const valor = vazio ? null : valorValido(body.valor);
      if (!vazio && valor === null) falhar("valor_invalido");
      const patch: Record<string, unknown> = { plano_aluno_id: planoId, mensalidade_valor: valor };
      if (temPlanos(m)) Object.assign(patch, { plano_modalidade: null, plano_valor_negociado: null });
      // 1º vencimento de quem nunca pagou = hoje (quem já tinha histórico segue na régua dele)
      if (valor && !m.mensalidade_desde && !m.mensalidade_pago_ate) patch.mensalidade_desde = new Date().toISOString();
      const { error } = await db.from("pacientes").update(patch).eq("id", m.id);
      if (error) throw error;
      const atual = (await carregarMatricula(db, m.id))!;
      // I1 também no modo de hoje: o valor digitado mudou com a automática ligada → o MP passa a cobrar o novo
      const automatica = await sincronizarAutomatica(atual);
      return json({ ok: true, mensalidade: await mensalidadeComPlano(atual), automatica }, 200, origin);
    }
```

- [ ] **Step 4: Conferir tipos e commit**

Run: `npm run tipos` (o `mensalidadeComPlano` entra na Task 8 — rodar o `tsc` depois dela se acusar só isso).

```bash
git add supabase-principal/functions/pagamentos-aluno/index.ts
gcw -m "feat(planos): prof_definir com plano de período, automática desligada com OK e o modo de hoje intacto (B1, I1)"
```

---

### Task 8: Servidor — o aluno paga o valor certo (parcela, cartão parcelado, automática, retrato, resumo)

**Files:**
- Modify: `supabase-principal/functions/pagamentos-aluno/index.ts`
- Modify: `supabase-principal/functions/pagamentos-aluno/mensalidades.ts`

- [ ] **Step 1: `mensalidadeVista` + parcela (trocar o `mensalidadeVista` atual)**

```ts
  const mensalidadeVista = (m: Matricula) =>
    m.mensalidade_valor
      ? { valor: Number(m.mensalidade_valor), plano_id: m.plano_aluno_id, plano: m.plano?.nome ?? null, pausada: m.cobranca_pausada,
          pago_ate: m.mensalidade_pago_ate, desde: m.mensalidade_desde, coberta: coberto(m.mensalidade_pago_ate),
          // W7b: aluno sem profissional — o teste grátis do app e o código do plano (Treino · Treino + Alimentação)
          teste_ate: ehDoApp(m) ? m.app_teste_ate ?? null : null, plano_codigo: ehDoApp(m) ? m.plano?.codigo ?? null : null,
          // W-P: o plano com período (no modo de hoje: modalidade nula, 1 mês, 1 parcela, automática liberada)
          modalidade: m.plano_modalidade ?? null, meses: m.plano_modalidade ? m.plano?.meses ?? 1 : 1,
          negociado: m.plano_valor_negociado ?? null,
          max_parcelas: maxParcelasDoCartao(m.plano_modalidade ?? null, m.plano?.max_parcelas_cartao ?? null),
          automatica: aceitaAutomatica(m.plano_modalidade ?? null, m.plano?.meses ?? 1) }
      : null;

  /** A próxima parcela do mês a mês ("parcela 4 de 12"), pela última paga com o "de N" (parcela_num é o cache do banco). */
  const parcelaDe = async (m: Matricula): Promise<Parcela | null> => {
    if (m.plano_modalidade !== "mensal" || !m.plano_aluno_id) return null;
    const total = m.plano?.meses ?? 1;
    const { data, error } = await db.from("cobrancas").select("parcela_num, parcelas_total, plano_aluno_id").eq("paciente_id", m.id)
      .eq("tipo", "mensalidade").eq("status", "paga").is("deleted_at", null).not("parcelas_total", "is", null)
      .order("pago_em", { ascending: false }).limit(1);
    if (error) throw error;
    const u = ((data ?? []) as Array<{ parcela_num: number | null; parcelas_total: number | null; plano_aluno_id: string | null }>)[0];
    return proximaParcela(u ? { num: u.parcela_num, total: u.parcelas_total, plano: u.plano_aluno_id } : null, m.plano_aluno_id, total);
  };

  const mensalidadeComPlano = async (m: Matricula) => {
    const v = mensalidadeVista(m);
    return v ? { ...v, parcela: await parcelaDe(m) } : null;
  };
```
Trocar `mensalidade: mensalidadeVista(atual),` por `mensalidade: await mensalidadeComPlano(atual),` no `aluno_status` e
`mensalidade: veMensalidade ? mensalidadeVista(atual) : null,` por `mensalidade: veMensalidade ? await mensalidadeComPlano(atual) : null,`
no `prof_aluno`.

- [ ] **Step 2: Retrato e descrição nos 3 inserts desta função (o 4º é o da Task 5)**

Ajudante (junto de `linhaParaMp`):
```ts
  /** O que a linha da mensalidade grava do plano (descrição + retrato) — MP, Pix manual e pagamento por fora. */
  const linhaDoPlano = async (m: Matricula, mesRef: string) => ({
    descricao: descricaoDoPagamento(m.plano?.nome ?? null, m.plano_modalidade ?? null, m.plano?.meses ?? 1, mesRef, await parcelaDe(m)),
    ...retratoDoPlano(m),
  });
```
- `linhaParaMp` (insert da mensalidade): trocar `descricao: descricaoMensalidade(m.plano?.nome ?? null, alvo.mesRef),` por
  `...(await linhaDoPlano(m, alvo.mesRef)),`.
- `aluno_avisar_pix` (insert da mensalidade, ~linha 598): a mesma troca com `alvo.mesRef`.
- `prof_registrar` (insert da mensalidade, ~linha 1077): trocar `descricao: descricaoMensalidade(m.plano?.nome ?? null, mes),` por
  `...(await linhaDoPlano(m, mes)),`.

- [ ] **Step 3: Cartão parcelado no `aluno_mp_cartao` (I6)**

A validação vem ANTES de qualquer linha nascer (sem `desfazerLinha`): logo depois de
`const alvo = await alvoDoPagamento(m, body.cobranca_id);`, no bloco `aluno_mp_pix || aluno_mp_cartao`, acrescentar
```ts
      // I6: parcelas só no cartão parcelado, até o máximo do plano (a avulsa e o modo de hoje: 1×)
      const parcelas = body.installments === undefined ? 1 : body.installments;
      if (acao === "aluno_mp_cartao" && !parcelasValidas(parcelas, alvo.avulsa ? null : m.plano_modalidade ?? null, m.plano?.max_parcelas_cartao ?? null)) {
        falhar("parcelas_invalidas");
      }
```
e no `pedido` (o objeto do cartão), trocar `installments: 1,` por `installments: Number(parcelas),`.

- [ ] **Step 4: Automática só onde cabe (`aluno_mp_assinar`)**

Depois de `if (!m.mensalidade_valor || m.cobranca_pausada) falhar("sem_mensalidade");`:
```ts
      // W-P (B2): automática no mês a mês, no plano de 1 mês e no modo de hoje; no período todo, não (P-A "1": sem data de fim — renova)
      if (!aceitaAutomatica(m.plano_modalidade ?? null, m.plano?.meses ?? 1)) falhar("modalidade_sem_automatica");
```

- [ ] **Step 5: Resumo das Mensalidades com a modalidade (`prof_resumo`)**

- `interface LinhaAlunoResumo`: acrescentar `plano_modalidade?: string | null;` e trocar `plano: { nome: string } | null;` por
  `plano: { nome: string; meses?: number } | null;`.
- No `prof_resumo`, antes do `let q = db.from("pacientes").select(…)`: `const wp = await schemaTemPlanos();` e trocar a string do
  `select` por
  `` `id, treino_user_id, nome, email, ativo, personal_id, nutricionista_id, mensalidade_valor, cobranca_pausada, mensalidade_pago_ate, mensalidade_desde${wp ? ", plano_modalidade, plano:planos_aluno(nome, meses)" : ", plano:planos_aluno(nome)"}` ``.
- No mapeamento (a linha com `plano: dono ? (a.plano?.nome ?? null) : null, pausada: …`), acrescentar
  `modalidade: dono ? (a.plano_modalidade ?? null) : null, meses: a.plano?.meses ?? 1,`.
- Em `mensalidades.ts`, `interface AlunoDoResumo`: acrescentar
  ```ts
  /** W-P: a modalidade do plano (nula = modo de hoje) e os meses — o "/mês" da lista vira "/ano" ou " por N meses" */
  modalidade?: string | null;
  meses?: number;
  ```

- [ ] **Step 6: `prof_aluno` com os planos completos**

Trocar a leitura dos planos no `prof_aluno` por:
```ts
      const wp = await schemaTemPlanos();
      const { data: planos, error: erroPlanos } = atual.conta_id
        ? await db.from("planos_aluno").select(wp ? COLUNAS_PLANO : "id, nome, valor, ativo").eq("conta_id", atual.conta_id).order("nome")
        : { data: [], error: null };
```
e na resposta `conta:` acrescentar `modalidades: wp ? modalidadesDaConta(atual.conta?.recebimento_modo) : [],`.

- [ ] **Step 7: Tipos, testes e commit**

Run: `npm run tipos && npx vitest run src/financeiro`
Expected: limpo.

```bash
git add supabase-principal/functions/pagamentos-aluno/index.ts supabase-principal/functions/pagamentos-aluno/mensalidades.ts
gcw -m "feat(planos): o aluno paga o valor do plano — parcela n de N, cartão parcelado, automática só onde cabe"
```

---

### Task 8b: Fila das cobranças automáticas + os 3 pontos decididos (Weslley, 10/10/2026 ~22h)

Decisões dele (respostas "1", "2" e "1"): **ponto 1** — só o dono vê os planos e os valores, igual à mensalidade (os outros
profissionais da conta não veem); **ponto 2** — a troca do valor das cobranças automáticas vai para uma **fila em segundo plano,
tentando de novo de hora em hora** (antes: um PUT por aluno dentro do pedido do dono; com muitos alunos os últimos caíam por tempo e
cada falha virava um aviso); **ponto 3** — o MP aceitou o valor novo e a gravação da cópia no nosso banco falhou → **não avisar o dono**:
o erro vai para a aba Bugs e a cópia se corrige sozinha.

**Files:**
- Modify: `supabase-principal/functions/pagamentos-aluno/index.ts` (prof_planos só dono/master; I1 em lote → fila; I1 de 1 aluno: falhou → fila; ponto 3)
- Modify: `supabase-principal/functions/_shared/planos-automatica.ts` (regras puras da fila) + `src/financeiro/planosAutomatica.test.ts`
- Create: `supabase-principal/migrations/20261011030000_wp_fila_automaticas.sql` (número RESERVADO no quadro)
- Create: `supabase-principal/functions/automaticas-fila/index.ts` (verify_jwt **false**, no molde da `espelho-enviar` + `{schema}.espelho_disparar()` da `20261010010000_hml16c_segredo_fila.sql`)
- Create: `e2e/wp/sql_fila.py` (banco, blocos desfeitos, como o `sql_planos.py`)
- Modify, se preciso: `scripts/segredos/servidor.py` (o segredo novo `automaticas_fila`, no molde do `espelho_fila`)
- Já feito (commit `aec7f1b`): a 20261011020000 troca a policy "planos_aluno: membros leem" por "planos_aluno: dono lê" (ponto 1 no banco).

- [ ] **Step 0: Ponto 1 no servidor** — `prof_planos` só para master/dono: depois do `contaDosPlanos(body.conta_id, false)`,
  `if (!conta.papel.master && !conta.papel.dono) falhar("so_o_dono", 403);` (o master continua lendo a conta do app). Nenhum outro
  retorno novo das Tasks 7/8 pode mostrar plano/valor/modalidade/parcela a quem não `podeMexerNaMensalidade` (conferir `prof_aluno`,
  `prof_resumo`, `prof_definir`).

- [ ] **Step 1: Ponto 3** — no `sincronizarAutomatica`, PUT do MP deu certo e o update do espelho (`aluno_assinaturas`) falhou → NÃO
  lançar: registrar com `log.erro({ codigo: "espelho_valor_assinatura_falhou", schema, acao, ref })` (conferir que o `log.erro` cai na
  aba Bugs; se não cair, usar o caminho que cai) e devolver o corpo do MP (conta como `atualizada`, sem aviso ao dono). Conferir que o
  `conferirAssinatura` (o `prof_aluno` chama) regrava o `valor` a partir do MP; se não regravar, acrescentar.

- [ ] **Step 2: Regras puras + testes (TDD)** em `planos-automatica.ts`: `proximaTentativaEm(agora, tentativas)` (+1 hora),
  `MAX_TENTATIVAS = 24` (1 dia), `destinoDoResultado(resultado, tentativas)` → `feito` (atualizada | igual | sem_automatica) |
  `de_novo` (falhou, < 24) | `desistiu` (falhou na 24ª), `textoDoAvisoDaFila(nomes)` ("Não deu para mudar o valor da cobrança automática
  de: Ana, Bia. Confira no financeiro de cada aluno." — até 5 nomes + "e mais N"). Testes primeiro em `src/financeiro/planosAutomatica.test.ts`.

- [ ] **Step 3: Migration `20261011030000_wp_fila_automaticas.sql`** (idempotente; staging + public; cabeçalho no padrão das outras):
  - `{schema}.automaticas_fila`: `id bigint generated always as identity primary key`, `paciente_id uuid not null references
    {schema}.pacientes(id) on delete cascade`, `conta_id uuid`, `motivo text not null check (motivo in ('plano','aluno'))`,
    `tentativas integer not null default 0`, `proxima_em timestamptz not null default now()`, `feito_em timestamptz`, `resultado text`,
    `erro text`, `avisado_em timestamptz`, `criado_em timestamptz not null default now()`. Índice único parcial `(paciente_id) where
    feito_em is null` (uma pendência por aluno) e índice `(proxima_em) where feito_em is null`. RLS ligado SEM policy para
    `anon`/`authenticated` + `revoke all` deles (só `service_role` e as funções definer). **O valor NÃO fica na fila**: quem processa
    usa o `mensalidade_valor` atual do aluno (o último valor ganha).
  - `{schema}.automaticas_enfileirar(p_pacientes uuid[], p_motivo text) returns integer` (security definer, `search_path = ''`, só
    `service_role` executa): para cada aluno, já há pendente → `tentativas = 0, proxima_em = now(), motivo = p_motivo`; senão insere
    (com o `conta_id` do aluno). Devolve quantos ficaram pendentes.
  - `{schema}.automaticas_disparar() returns bigint` (security definer, `search_path = ''`, só `service_role` executa), no MOLDE da
    `{schema}.espelho_disparar()`: só chama se há pendente pronta (`feito_em is null and tentativas < 24 and proxima_em <= now()`), se o
    `pg_net` existe e se o segredo `physiq_automaticas_fila_segredo` está no Vault; `net.http_post` para a função `automaticas-fila`
    (a URL montada do mesmo jeito que a `espelho_disparar` monta a da `espelho-enviar`) com o header `x-fila-segredo` e o corpo
    `{"schema": "{schema}"}`.
  - pg_cron de hora em hora: `select cron.schedule('automaticas-fila-{schema}', '7 * * * *', $$select {schema}.automaticas_disparar()$$);`
    (o mesmo nome ATUALIZA o job).

- [ ] **Step 4: Função `automaticas-fila`** (Deno, verify_jwt false):
  - confere `x-fila-segredo` contra a env `SEGREDO_AUTOMATICAS_FILA` (lista de aceitos separada por vírgula, como a espelho-enviar);
    sem/errado → 401 (log sem o segredo). Schema só `staging` | `public` (outro → 400). Cliente `service_role` nesse schema.
  - pega até 50 pendentes prontas (ordem `proxima_em`), 5 por vez: `carregarMatricula`, assinatura mais recente,
    `novoValorDaAutomatica(a, Number(m.mensalidade_valor), put)` com o MESMO PUT da pagamentos-aluno — extrair para `_shared/` o que for
    preciso (credencial do MP da conta, `mpFetch`, `espelhoAssinaturaAluno`, o ponto 3) em vez de duplicar regra.
  - destino pelo `destinoDoResultado`: `feito` → `feito_em = now(), resultado`; `de_novo` → `tentativas + 1, proxima_em = +1h, erro`;
    `desistiu` → `feito_em = now(), resultado = 'desistiu'` + `log.erro` + entra no aviso.
  - aviso ao dono: **1 só por conta por rodada**, com `textoDoAvisoDaFila` (só as que desistiram), marcando `avisado_em`.
  - sobrou pendente pronta (mais de 50) → `rpc("automaticas_disparar")` no fim.

- [ ] **Step 5: A pagamentos-aluno usa a fila**:
  - `sincronizarAutomaticasDoPlano` (o dono mudou valor/meses/parcela do plano): no lugar do laço, `rpc("automaticas_enfileirar",
    { p_pacientes: ids, p_motivo: "plano" })` + `rpc("automaticas_disparar")` (o pg_net manda depois do commit) e devolve
    `{ enfileiradas: n }` (a tela da Task 10 diz "As cobranças automáticas dos alunos vão ser atualizadas em instantes").
  - `sincronizarAutomatica` de 1 aluno (prof_definir): continua na hora (1 PUT); `falhou` → enfileira (`motivo 'aluno'`) em vez do aviso.
  - schema sem a migration (o `public` antes da Task 20): a rpc devolve "function … does not exist" → cair no comportamento de antes
    (laço/aviso), sem quebrar.

- [ ] **Step 6: Testes do banco** (`e2e/wp/sql_fila.py`, staging, blocos desfeitos — roda na Task 9 depois de aplicar): enfileirar 2× o
  mesmo aluno = 1 pendente com `tentativas = 0`; `automaticas_disparar()` sem pendente pronta = null; `authenticated` não lê a fila
  (`set local role authenticated` → 0 linhas/erro de permissão); o job `automaticas-fila-staging` existe no `cron.job`.

- [ ] **Step 7: Rodar** `npx vitest run src/financeiro src/painel/financeiro src/app-aluno/perfil` + as guardas que leem as funções +
  `npm run tipos` + `deno check` da `pagamentos-aluno` e da `automaticas-fila` (só erro NOVO conta). Commit(s) com o autor do Weslley.

- [ ] **Step 8 (fica para a Task 9, com a trava da LINUX 1, publicar só depois das 01:00):** reaplicar a 20261011020000 no staging
  (policy "dono lê"), aplicar a 20261011030000 no staging, criar o segredo (cofre B Code Segredos › PhysiqCalc "Physiq — fila das
  automáticas (W-P)" + Vault `physiq_automaticas_fila_segredo` + env `SEGREDO_AUTOMATICAS_FILA`), publicar a `automaticas-fila`
  (`scripts/deploy_function.sh hkxvtsbwctxkrqzkkdoz supabase-principal/functions automaticas-fila false`) junto com as 2 de sempre e
  acrescentar ao `e2e/wp/api.py`: mudar o valor de um plano com aluno em automática simulada → `enfileiradas ≥ 1` → chamar a
  `automaticas-fila` com o segredo → a pendência fica `feito_em` com `resultado = sem_automatica`; sem o segredo → 401. No `public`:
  Task 20 (m1 → m2 → m3, backup antes).

---

### Task 9: Publicar as 2 funções e provar o servidor no staging

**Files:**
- Create: `e2e/wp/api.py`

> Gate: publicar a `pagamentos-aluno` e a `mp-webhook-aluno` vale para `public` e `staging` — está no OK do plano (G0 do mestre). No
> `public` (sem a migration) a parte nova fica desligada (fallback das Tasks 5 e 8).

- [ ] **Step 1: Escrever o E2E de servidor**

```python
#!/usr/bin/env python3
"""Physiq W-P — E2E de SERVIDOR dos planos do aluno (staging, contas de TESTE prof2/aluno2, em série; a guarda de /health antes).
Casos:
  planos    o dono cria; nome repetido; Pix manual sem cartão parcelado; o aluno não grava; a lista; o app não grava direto (I5)
  periodo   à vista de 12 meses: valor, pagamento por fora cobre 12 meses, o APK antigo recebe 409, remover recua, volta ao modo de hoje
  mensal    mês a mês: parcela 83,33, "parcela 3 de 12"; a trava I5 segura a gravação direta do dono; a avulsa direta continua
  mp        conta no Mercado Pago (sandbox): 4× recusado, 3× (APRO) cobre 12 meses, automática recusada no período todo e
            aceita no mês a mês (pendente no sandbox)
Uso: python3 e2e/wp/api.py [--casos planos,periodo,mensal,mp]
"""
from __future__ import annotations

import argparse
import sys
import uuid
from pathlib import Path

sys.dont_write_bytecode = True
sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "w06"))
import _base as B  # noqa: E402

p = B.p
B.ESTADO["schema"] = "staging"
S = "staging"
DONO, ALUNO = "prof2", "aluno2"
NOME = f"WP Anual {uuid.uuid4().hex[:6]}"
CTX: dict = {}


def salvar(**campos):
    return B.pag(DONO, "prof_plano_salvar", {"conta_id": CTX["conta"], **campos})


def preparar() -> None:
    m = B.matricula(ALUNO)
    CTX.update(m=m, conta=m["conta_id"])
    CTX["antes"] = B.sql_principal(f"select mensalidade_valor::float as v from {S}.pacientes where id = '{m['id']}'")[0]["v"]
    B.sql_principal(f"update {S}.cobrancas set deleted_at = now() where paciente_id = '{m['id']}' and deleted_at is null and origem in ('app', 'teste_wp')")


def caso_planos() -> None:
    print("\n── planos: o dono cria (prof2)")
    st, r = salvar(nome=NOME, meses=12, valor=1000, modalidades=["avista", "mensal"])
    p.check(st == 200 and r["plano"]["meses"] == 12, f"plano criado ({st} {r.get('erro')})")
    CTX["plano"] = r["plano"]["id"]
    st, r = salvar(nome=NOME.upper(), meses=1, valor=10, modalidades=["avista"])
    p.check(st == 409 and r.get("erro") == "nome_repetido", "nome repetido recusado (outra caixa também)")
    st, r = salvar(nome=f"{NOME} X", meses=6, valor=10, modalidades=["cartao_parcelado"], max_parcelas_cartao=3)
    p.check(st == 400 and r.get("erro") == "modalidade_da_conta", "Pix manual não oferece cartão parcelado (3.6)")
    st, r = B.pag(ALUNO, "prof_plano_salvar", {"conta_id": CTX["conta"], "nome": "Y", "meses": 1, "valor": 10, "modalidades": ["avista"]})
    p.check(st == 403, f"o aluno não grava plano ({st})")
    st, r = B.pag(DONO, "prof_planos", {"conta_id": CTX["conta"]})
    meu = next((x for x in (r or {}).get("planos", []) if x["id"] == CTX["plano"]), None)
    p.check(st == 200 and meu and meu["completo"] and meu["parcela"] == 83.33 and meu["alunos"] == 0, f"a lista traz completo, parcela e alunos ({meu})")
    B.rest(DONO, "PATCH", f"planos_aluno?id=eq.{CTX['plano']}", {"valor": 1})
    v = B.sql_principal(f"select valor::float as v from {S}.planos_aluno where id = '{CTX['plano']}'")[0]["v"]
    p.check(v == 1000.0, f"o app não grava direto em planos_aluno (I5: {v})")


def caso_periodo() -> None:
    print("\n── periodo: à vista de 12 meses")
    m = CTX["m"]
    st, r = B.pag(DONO, "prof_definir", {"aluno": m["id"], "plano_aluno_id": CTX["plano"], "plano_modalidade": "avista",
                                         "plano_valor_negociado": None, "inicio": B.hoje()})
    ms = (r or {}).get("mensalidade") or {}
    p.check(st == 200 and ms.get("valor") == 1000 and ms.get("modalidade") == "avista" and ms.get("meses") == 12, f"no plano: R$ 1.000 por 12 meses ({st} {r.get('erro')})")
    st, r = B.pag(DONO, "prof_definir", {"aluno": m["id"], "valor": 99.9})
    p.check(st == 409 and r.get("erro") == "aluno_em_plano_novo", "o APK antigo não mexe em quem está no plano novo")
    st, r = B.pag(DONO, "prof_registrar", {"aluno": m["id"], "data": B.hoje(), "metodo": "dinheiro"})
    c = (r or {}).get("cobranca") or {}
    linha = B.sql_principal(f"select meses_cobertos, (cobre_ate::date - cobre_de::date) as dias from {S}.cobrancas where id = '{c.get('id')}'")
    p.check(st == 200 and linha and linha[0]["meses_cobertos"] == 12 and 360 <= linha[0]["dias"] <= 366, f"o pagamento por fora cobre 12 meses ({linha})")
    st, r = B.pag(ALUNO, "aluno_status")
    mm = r["matriculas"][0]["mensalidade"]
    p.check(st == 200 and mm["modalidade"] == "avista" and mm["coberta"] and mm["automatica"] is False, "o aluno vê o plano coberto e sem automática")
    st, _ = B.pag(DONO, "prof_remover", {"cobranca_id": c["id"]})
    p.check(st == 200, "remover o pagamento por fora recua a cobertura")
    st, r = B.pag(DONO, "prof_definir", {"aluno": m["id"], "plano_modalidade": None, "plano_aluno_id": None, "valor": 99.9})
    v = B.sql_principal(f"select mensalidade_valor::float as v, plano_modalidade as mo from {S}.pacientes where id = '{m['id']}'")[0]
    p.check(st == 200 and v == {"v": 99.9, "mo": None}, f"de volta ao modo de hoje com o valor digitado ({v})")


def caso_mensal() -> None:
    print("\n── mensal: mês a mês e a trava I5")
    m = CTX["m"]
    st, r = B.pag(DONO, "prof_definir", {"aluno": m["id"], "plano_aluno_id": CTX["plano"], "plano_modalidade": "mensal", "inicio": B.hoje()})
    p.check(st == 200 and r["mensalidade"]["valor"] == 83.33, f"parcela de R$ 83,33 ({st} {r.get('erro')})")
    for d in (B.dias(-40), B.dias(-10)):
        st, _ = B.pag(DONO, "prof_registrar", {"aluno": m["id"], "data": d, "metodo": "pix"})
        p.check(st == 200, f"parcela paga em {d}")
    nums = B.sql_principal(f"""select coalesce(json_agg(parcela_num order by pago_em), '[]') as n from {S}.cobrancas
                                where paciente_id = '{m['id']}' and status = 'paga' and deleted_at is null and parcelas_total = 12""")[0]["n"]
    p.check(nums == [1, 2], f"parcelas 1 e 2 ({nums})")
    st, r = B.pag(ALUNO, "aluno_status")
    p.check(r["matriculas"][0]["mensalidade"].get("parcela") == {"num": 3, "total": 12}, "o aluno vê: parcela 3 de 12")
    B.rest(DONO, "PATCH", f"pacientes?id=eq.{m['id']}", {"mensalidade_valor": 1, "plano_modalidade": "avista", "cobranca_pausada": True})
    v = B.sql_principal(f"select mensalidade_valor::float as v, plano_modalidade as mo, cobranca_pausada as pa from {S}.pacientes where id = '{m['id']}'")[0]
    p.check(v == {"v": 83.33, "mo": "mensal", "pa": False}, f"o dono não grava as colunas de cobrança direto (I5: {v})")
    st, r = B.rest(DONO, "POST", "cobrancas", {"paciente_id": m["id"], "conta_id": CTX["conta"], "nutricionista_id": B.uid(DONO), "tipo": "avulsa",
                                              "descricao": "teste wp I5", "valor": 10, "vencimento": B.hoje(), "status": "aberta",
                                              "meses_cobertos": 12, "origem": "teste_wp"})
    meses = B.sql_principal(f"select meses_cobertos from {S}.cobrancas where origem = 'teste_wp' and paciente_id = '{m['id']}' order by created_at desc limit 1")
    p.check(st in (200, 201) and meses and meses[0]["meses_cobertos"] == 1, f"a avulsa direta continua, sem período (I5: {meses})")


def caso_mp() -> None:
    print("\n── mp: conta no Mercado Pago (sandbox)")
    m = CTX["m"]
    B.sql_principal(f"update {S}.contas set recebimento_modo = 'mercadopago' where id = '{CTX['conta']}'")
    try:
        st, r = salvar(id=CTX["plano"], nome=NOME, meses=12, valor=1000, modalidades=["avista", "cartao_parcelado", "mensal"], max_parcelas_cartao=3)
        p.check(st == 200, f"plano com cartão parcelado até 3× ({st} {r.get('erro')})")
        B.sql_principal(f"update {S}.cobrancas set deleted_at = now() where paciente_id = '{m['id']}' and deleted_at is null and tipo = 'mensalidade'")
        st, r = B.pag(DONO, "prof_definir", {"aluno": m["id"], "plano_aluno_id": CTX["plano"], "plano_modalidade": "cartao_parcelado", "cancelar_automatica": True})
        p.check(st == 200 and r["mensalidade"]["max_parcelas"] == 3, f"aluno no cartão parcelado ({st} {r.get('erro')})")
        st, r = B.pag(ALUNO, "aluno_mp_cartao", {"paciente_id": m["id"], "card_token": B.token_cartao("APRO"), "payment_method_id": "master", "installments": 4})
        p.check(st == 400 and r.get("erro") == "parcelas_invalidas", "4× recusado (o plano deixa até 3×)")
        st, r = B.pag(ALUNO, "aluno_mp_cartao", {"paciente_id": m["id"], "card_token": B.token_cartao("APRO"), "payment_method_id": "master", "installments": 3})
        c = (r or {}).get("cobranca") or {}
        linha = B.sql_principal(f"select meses_cobertos, valor::float as v from {S}.cobrancas where id = '{c.get('id')}'")
        p.check(st == 200 and c.get("status") == "paga" and linha and linha[0] == {"meses_cobertos": 12, "v": 1000.0}, f"3× aprovado cobre 12 meses ({st} {r.get('erro')} {linha})")
        st, r = B.pag(ALUNO, "aluno_mp_assinar", {"paciente_id": m["id"], "checkout": True})
        p.check(st == 400 and r.get("erro") == "modalidade_sem_automatica", "sem automática no período todo")
        B.sql_principal(f"update {S}.cobrancas set deleted_at = now() where paciente_id = '{m['id']}' and deleted_at is null and tipo = 'mensalidade'")
        B.pag(DONO, "prof_definir", {"aluno": m["id"], "plano_aluno_id": CTX["plano"], "plano_modalidade": "mensal"})
        st, r = B.pag(ALUNO, "aluno_mp_assinar", {"paciente_id": m["id"], "checkout": True})
        p.check(st == 200 and float(r["assinatura"]["valor"]) == 83.33, f"automática no mês a mês com a parcela ({st} {r.get('erro')})")
    finally:
        B.sql_principal(f"update {S}.aluno_assinaturas set status = 'cancelled' where paciente_id = '{m['id']}' and status <> 'cancelled'")
        B.sql_principal(f"update {S}.contas set recebimento_modo = 'pix_manual' where id = '{CTX['conta']}'")


def limpar() -> None:
    m = CTX.get("m")
    if not m:
        return
    B.pag(DONO, "prof_definir", {"aluno": m["id"], "plano_modalidade": None, "plano_aluno_id": None, "valor": CTX.get("antes") or 99.9})
    B.sql_principal(f"update {S}.cobrancas set deleted_at = now() where paciente_id = '{m['id']}' and deleted_at is null and origem in ('app', 'teste_wp')")
    if CTX.get("plano"):
        B.sql_principal(f"update {S}.pacientes set plano_aluno_id = null where plano_aluno_id = '{CTX['plano']}'")
        B.sql_principal(f"delete from {S}.planos_aluno where id = '{CTX['plano']}'")


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--casos", default="planos,periodo,mensal,mp")
    a = ap.parse_args()
    if not B.saude_treino():
        print("   o banco do Treino não está saudável — parar (regra de 10/10)")
        return 2
    casos = [c.strip() for c in a.casos.split(",") if c.strip()]
    if "planos" not in casos:
        casos.insert(0, "planos")  # os outros casos usam o plano que ele cria
    preparar()
    try:
        for c in casos:
            {"planos": caso_planos, "periodo": caso_periodo, "mensal": caso_mensal, "mp": caso_mp}[c]()
    finally:
        limpar()
    return p.fim()


if __name__ == "__main__":
    sys.exit(main())
```

- [ ] **Step 2: Rodar contra a função ANTIGA e ver falhar**

Run: `python3 e2e/wp/api.py --casos planos`
Expected: FAIL (`prof_plano_salvar` → 400 `acao_invalida`/desconhecida).

- [ ] **Step 3: Publicar as 2 funções**

```bash
scripts/deploy_function.sh hkxvtsbwctxkrqzkkdoz supabase-principal/functions pagamentos-aluno true
scripts/deploy_function.sh hkxvtsbwctxkrqzkkdoz supabase-principal/functions mp-webhook-aluno false
```
Expected: as 2 publicadas com o `verify_jwt` de sempre.

- [ ] **Step 4: Smoke só leitura no `public` (a parte nova desligada lá)**

Run: `python3 e2e/w10/api.py` e `python3 e2e/w06/smoke_prod.py` (só leitura).
Expected: os placares de sempre (o `public` ainda não tem a migration: `carregarMatricula` cai na lista W7b, `prof_resumo` sem
`plano_modalidade`). Se algo cair: republicar a versão da `origin/main` (`git stash` NÃO — `git worktree add /tmp/…/main origin/main` e
publicar de lá) e investigar.

- [ ] **Step 5: Rodar o E2E de servidor (um por vez, guarda de /health)**

Run: `python3 e2e/wp/api.py` e depois `python3 e2e/w06/api.py --casos pix,porfora,acesso`
Expected: todos ✅ (o 2º prova que o modo de hoje continua igual).

- [ ] **Step 6: Commit**

```bash
git add e2e/wp/api.py
gcw -m "test(planos): E2E de servidor dos planos do aluno (staging)"
```

---

### Task 10: Painel — chamadas, tipos e a aba Planos

**Files:**
- Modify: `src/financeiro/tipos.ts`, `src/financeiro/api.ts`, `src/financeiro/regras.ts` (`MENSAGEM_ERRO_FINANCEIRO`)
- Modify: `src/painel/financeiro/financeiroUtil.ts`, `src/painel/paginas/Financeiro.tsx`
- Create: `src/painel/financeiro/Planos.tsx`, `src/painel/financeiro/PlanoDialog.tsx`
- Test: `src/painel/financeiro/Planos.test.tsx`

- [ ] **Step 1: Escrever o teste que falha**

```tsx
// src/painel/financeiro/Planos.test.tsx
// Physiq W-P — Painel › Financeiro › Planos: a lista (período, valor, formas, alunos, "Completar"), só o dono edita, desativar pede a
// confirmação do app e o novo plano grava o que a tela validou. A função é falsa.
import { fireEvent, render, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ProvedorConfirmar } from "@/ui/premium/Confirmar";

const h = vi.hoisted(() => ({ planos: vi.fn(), salvar: vi.fn(), ativar: vi.fn() }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/integrations/supabase/client", () => ({ DB_SCHEMA: "staging", supabase: {} }));
vi.mock("@/financeiro/api", async (orig) => ({
  ...(await orig<typeof import("@/financeiro/api")>()),
  buscarPlanosDaConta: (...a: unknown[]) => h.planos(...a),
  salvarPlano: (...a: unknown[]) => h.salvar(...a),
  ativarPlano: (...a: unknown[]) => h.ativar(...a),
}));

import Planos from "./Planos";

const ANUAL = { id: "pl1", nome: "Anual", valor: 1000, meses: 12, modalidades: ["avista", "mensal"], max_parcelas_cartao: null,
  valor_parcela_mensal: null, ativo: true, completo: true, parcela: 83.33, alunos: 2 };
const SO_NOME = { ...ANUAL, id: "pl2", nome: "Amigos", valor: null, meses: 1, modalidades: ["avista"], completo: false, parcela: null, alunos: 5 };
const resposta = (x: Record<string, unknown> = {}) => ({ ok: true, modo: "pix_manual", app: false, pode_editar: true,
  modalidades_da_conta: ["avista", "mensal"], planos: [ANUAL, SO_NOME], ...x });
const montar = () =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <ProvedorConfirmar>
        <Planos f={{ contaId: "c1" } as never} />
      </ProvedorConfirmar>
    </QueryClientProvider>,
  );

beforeEach(() => {
  h.planos.mockReset().mockResolvedValue(resposta());
  h.salvar.mockReset().mockResolvedValue({ ok: true });
  h.ativar.mockReset().mockResolvedValue({ ok: true });
});

describe("Painel › Financeiro › Planos (W-P)", () => {
  it("lista com o valor, a parcela, quantos alunos e o 'Completar' do plano só com nome", async () => {
    montar();
    await waitFor(() => expect(document.querySelector('[data-plano-card="pl1"]')).not.toBeNull());
    expect(document.querySelector('[data-plano-card="pl1"]')!.textContent).toContain("12× de R$ 83,33");
    expect(document.querySelector('[data-plano-card="pl1"] [data-plano-alunos]')!.textContent).toBe("2 alunos");
    expect(document.querySelector('[data-plano-card="pl2"] [data-plano-completar]')).not.toBeNull();
  });
  it("quem não é dono só vê", async () => {
    h.planos.mockResolvedValue(resposta({ pode_editar: false }));
    montar();
    await waitFor(() => expect(document.querySelector("[data-lista-planos]")).not.toBeNull());
    expect(document.querySelector("[data-novo-plano]")).toBeNull();
    expect(document.querySelector("[data-editar-plano]")).toBeNull();
  });
  it("desativar pede a confirmação do app e só então grava", async () => {
    montar();
    await waitFor(() => expect(document.querySelector('[data-ativar-plano="pl1"]')).not.toBeNull());
    fireEvent.click(document.querySelector('[data-ativar-plano="pl1"]')!);
    await waitFor(() => expect(document.querySelector("[data-confirmar-ok]")).not.toBeNull());
    expect(h.ativar).not.toHaveBeenCalled();
    fireEvent.click(document.querySelector("[data-confirmar-ok]")!);
    await waitFor(() => expect(h.ativar).toHaveBeenCalledWith("c1", "pl1", false));
  });
  it("novo plano: grava o que a tela validou", async () => {
    montar();
    await waitFor(() => expect(document.querySelector("[data-novo-plano]")).not.toBeNull());
    fireEvent.click(document.querySelector("[data-novo-plano]")!);
    await waitFor(() => expect(document.querySelector("[data-plano-nome]")).not.toBeNull());
    fireEvent.change(document.querySelector("[data-plano-nome]")!, { target: { value: "Semestral" } });
    fireEvent.change(document.querySelector("[data-plano-meses]")!, { target: { value: "6" } });
    fireEvent.change(document.querySelector("[data-plano-valor]")!, { target: { value: "600" } });
    fireEvent.click(document.querySelector('[data-plano-modalidade="mensal"]')!);
    fireEvent.click(document.querySelector("[data-plano-salvar]")!);
    await waitFor(() => expect(h.salvar).toHaveBeenCalledWith("c1", { nome: "Semestral", meses: 6, valor: 600, modalidades: ["avista", "mensal"],
      max_parcelas_cartao: null, valor_parcela_mensal: null }));
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/painel/financeiro/Planos.test.tsx`
Expected: FAIL — não acha `./Planos`.

- [ ] **Step 3: Tipos, chamadas e mensagens**

`src/financeiro/tipos.ts` — no topo `import type { Modalidade, Parcela, PlanoDoAluno } from "./planos";` e:
```ts
/** W-P — um plano na aba Planos (prof_planos). */
export type PlanoNaLista = PlanoDoAluno & { completo: boolean; parcela: number | null; alunos: number };

export interface PlanosDaConta {
  ok: true;
  modo: ModoRecebimento;
  app: boolean;
  pode_editar: boolean;
  modalidades_da_conta: Modalidade[];
  planos: PlanoNaLista[];
}
```
Em `MensalidadeVista`, acrescentar (opcionais: a função antiga não manda):
```ts
  /** W-P — plano com período (nulo = modo de hoje) */
  modalidade?: Modalidade | null;
  meses?: number;
  negociado?: number | null;
  max_parcelas?: number;
  automatica?: boolean;
  parcela?: Parcela | null;
```
Em `FinanceiroProfissional`: `planos: Array<{ id: string; nome: string; valor: number | null; ativo: boolean } & Partial<Omit<PlanoDoAluno, "id" | "nome" | "valor" | "ativo">>>;`
e em `conta:` acrescentar `modalidades?: Modalidade[];`. Em `AlunoResumo`: `modalidade?: Modalidade | null; meses?: number;`. Em
`ResumoMatricula`: `modalidade?: Modalidade | null; plano_meses?: number | null;`.

`src/financeiro/api.ts` (no fim):
```ts
/** W-P — a aba Planos (prof_planos · prof_plano_salvar · prof_plano_ativo; só o dono grava). */
export const buscarPlanosDaConta = (contaId: string) => acaoFinanceiro<PlanosDaConta>("prof_planos", { conta_id: contaId });
export const salvarPlano = (contaId: string, plano: { id?: string } & PlanoSalvar) =>
  acaoFinanceiro<{ ok: true; plano: PlanoDoAluno }>("prof_plano_salvar", { conta_id: contaId, ...plano });
export const ativarPlano = (contaId: string, id: string, ativo: boolean) => acaoFinanceiro<{ ok: true }>("prof_plano_ativo", { conta_id: contaId, id, ativo });
```
(imports: `PlanosDaConta` de `./tipos`; `PlanoDoAluno`, `PlanoSalvar` de `./planos`).

`src/financeiro/regras.ts` — em `MENSAGEM_ERRO_FINANCEIRO`, acrescentar as chaves que ainda não existirem:
```ts
  nome_invalido: "Dê um nome ao plano (até 80 letras).",
  meses_invalido: "A duração vai de 1 a 24 meses.",
  modalidades_invalidas: "Marque pelo menos uma forma de pagar.",
  modalidade_da_conta: "Essa forma de pagar não é aceita pelo seu recebimento.",
  parcelas_invalidas: "Escolha de 2 a 12 parcelas.",
  parcela_sem_mensal: "A parcela é só do mês a mês.",
  parcela_invalida: "Parcela inválida.",
  nome_repetido: "Já existe um plano com esse nome (mesmo desativado).",
  modalidade_em_uso: "Há alunos nessa forma de pagar. Passe-os para outra antes de tirar.",
  modalidade_indisponivel: "Essa forma de pagar não está neste plano.",
  modalidade_invalida: "Escolha como o aluno vai pagar.",
  modalidade_sem_automatica: "A cobrança automática é só no mês a mês.",
  automatica_ativa: "O aluno tem a cobrança automática ligada.",
  aluno_em_plano_novo: "Este aluno está num plano com período. Atualize o app para mudar.",
  planos_indisponivel: "Os planos ainda não chegaram a este ambiente.",
  conta_do_app: "Os planos do app são do Physiq.",
```

- [ ] **Step 4: A aba**

`src/painel/financeiro/financeiroUtil.ts`:
```ts
export type IdAba = "resumo" | "mensalidades" | "planos" | "lancamentos" | "recibos" | "categorias";
export const IDS_ABA: IdAba[] = ["resumo", "mensalidades", "planos", "lancamentos", "recibos", "categorias"];
```
`src/painel/paginas/Financeiro.tsx`: importar `Layers` do `lucide-react` e `Planos from "@/painel/financeiro/Planos"`; em `ABAS`,
depois de Mensalidades: `{ id: "planos", rotulo: "Planos", icone: Layers },`; no conteúdo, depois da linha das Mensalidades:
`{aba === "planos" && <Planos f={f} />}`.

```tsx
// src/painel/financeiro/Planos.tsx
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Layers, Pencil, Plus, Power } from "lucide-react";
import { toast } from "sonner";
import { ativarPlano, buscarPlanosDaConta, ErroFinanceiro } from "@/financeiro/api";
import { nomeDoPeriodo, ROTULO_MODALIDADE } from "@/financeiro/planos";
import { mensagemErroFinanceiro, reais } from "@/financeiro/regras";
import type { PlanoNaLista } from "@/financeiro/tipos";
import { Botao } from "@/ui/premium/Botao";
import { CabecalhoCartao, Cartao } from "@/ui/premium/Cartao";
import { Chip } from "@/ui/premium/Chip";
import { Esqueleto, EstadoErro, EstadoVazio } from "@/ui/premium/Estados";
import { useConfirmar } from "@/ui/premium/useConfirmar";
import { PlanoDialog } from "./PlanoDialog";
import type { FinanceiroConta } from "./useFinanceiro";

export const chavePlanos = (contaId: string) => ["financeiro-planos", contaId] as const;

/**
 * Painel › Financeiro › Planos (W-P, desenho §3.1): os planos que a conta oferece aos alunos — nome, duração, valor do período, formas
 * aceitas, até X parcelas e a parcela do mês a mês; desativado some da lista de planos novos (quem está nele continua); o "só nome"
 * da virada do Calc aparece como "Completar" (B1). Só o dono grava (pela pagamentos-aluno — §7 I5).
 */
export default function Planos({ f }: { f: Pick<FinanceiroConta, "contaId"> }) {
  const contaId = f.contaId ?? "";
  const qc = useQueryClient();
  const confirmar = useConfirmar();
  const [editando, setEditando] = useState<PlanoNaLista | "novo" | null>(null);
  const q = useQuery({ queryKey: chavePlanos(contaId), queryFn: () => buscarPlanosDaConta(contaId), enabled: !!contaId });
  const recarregar = () => void qc.invalidateQueries({ queryKey: chavePlanos(contaId) });

  if (q.isLoading) {
    return (
      <div className="grid grid-cols-1 gap-3.5 md:grid-cols-2 xl:grid-cols-3" data-planos-carregando>
        {[0, 1, 2].map((i) => <Cartao key={i} className="h-[160px] p-5"><Esqueleto className="h-full w-full" /></Cartao>)}
      </div>
    );
  }
  if (q.isError || !q.data) {
    const codigo = q.error instanceof ErroFinanceiro ? q.error.codigo : null;
    return <EstadoErro titulo="Não deu para abrir os planos" texto={mensagemErroFinanceiro(codigo, "Confira a internet e tente de novo.")} aoTentar={() => void q.refetch()} />;
  }
  const d = q.data;
  const alternar = async (pl: PlanoNaLista) => {
    if (pl.ativo && !(await confirmar({
      titulo: `Desativar o plano ${pl.nome}?`,
      descricao: pl.alunos ? `Os ${pl.alunos} alunos dele continuam no plano; ele só some da lista de planos novos.` : "Ele some da lista de planos novos.",
      rotuloConfirmar: "Desativar", perigo: true,
    }))) return;
    try {
      await ativarPlano(contaId, pl.id, !pl.ativo);
      toast.success(pl.ativo ? "Plano desativado." : "Plano reativado.");
      recarregar();
    } catch (e) {
      toast.error(mensagemErroFinanceiro(e instanceof ErroFinanceiro ? e.codigo : null));
    }
  };
  return (
    <div className="flex flex-col gap-3.5" data-aba-planos data-pode-editar={d.pode_editar ? "1" : "0"}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="min-w-0 text-[13px] text-texto-2">Quanto custa, por quanto tempo e como o aluno pode pagar. Mudar um plano vale a partir do próximo pagamento.</p>
        {d.pode_editar && <Botao variante="w" icone={Plus} onClick={() => setEditando("novo")} data-novo-plano>Novo plano</Botao>}
      </div>
      {!d.planos.length ? (
        <EstadoVazio icone={Layers} titulo="Nenhum plano ainda" texto="Crie o primeiro: mensal, trimestral, semestral, anual…" />
      ) : (
        <div className="grid grid-cols-1 gap-3.5 md:grid-cols-2 xl:grid-cols-3" data-lista-planos>
          {d.planos.map((pl) => (
            <Cartao key={pl.id} className="flex flex-col gap-2.5 p-5" data-plano-card={pl.id} data-plano-ativo={pl.ativo ? "1" : "0"}>
              <CabecalhoCartao titulo={pl.nome}
                extra={!pl.completo ? <Chip tom="a" data-plano-completar>Completar</Chip> : !pl.ativo ? <Chip tom="g">Desativado</Chip> : <Chip tom="n">{nomeDoPeriodo(pl.meses)}</Chip>} />
              {pl.completo ? (
                <p className="text-[13px] text-texto-2">
                  <b className="text-[20px] font-bold tabular-nums text-texto">{reais(pl.valor)}</b> no período
                  {pl.modalidades.includes("mensal") && pl.meses > 1 && pl.parcela ? ` · ou ${pl.meses}× de ${reais(pl.parcela)}` : ""}
                </p>
              ) : (
                <p className="text-[13px] text-texto-2">Falta o valor e a duração para oferecer este plano.</p>
              )}
              <div className="flex flex-wrap gap-1.5">
                {pl.modalidades.map((x) => (
                  <Chip key={x} tom="g">{ROTULO_MODALIDADE[x]}{x === "cartao_parcelado" && pl.max_parcelas_cartao ? ` até ${pl.max_parcelas_cartao}×` : ""}</Chip>
                ))}
              </div>
              <p className="text-[12px] text-texto-3" data-plano-alunos>{pl.alunos === 1 ? "1 aluno" : `${pl.alunos} alunos`}</p>
              {d.pode_editar && (
                <div className="mt-auto flex flex-wrap gap-2">
                  <Botao tamanho="sm" icone={Pencil} onClick={() => setEditando(pl)} data-editar-plano={pl.id}>{pl.completo ? "Editar" : "Completar"}</Botao>
                  <Botao tamanho="sm" variante="g" icone={Power} onClick={() => void alternar(pl)} data-ativar-plano={pl.id}>{pl.ativo ? "Desativar" : "Reativar"}</Botao>
                </div>
              )}
            </Cartao>
          ))}
        </div>
      )}
      <PlanoDialog aberto={editando !== null} plano={editando === "novo" ? null : editando} contaId={contaId} modalidadesDaConta={d.modalidades_da_conta}
        aoFechar={() => setEditando(null)} aoSalvo={() => { setEditando(null); recarregar(); }} />
    </div>
  );
}
```

```tsx
// src/painel/financeiro/PlanoDialog.tsx
import { useEffect, useState, type FormEvent } from "react";
import { Save } from "lucide-react";
import { toast } from "sonner";
import { Campo, MensagemForm } from "@/entrada/pecas/Campo";
import { ErroFinanceiro, salvarPlano } from "@/financeiro/api";
import { MODALIDADES, parcelaMensal, ROTULO_MODALIDADE, validarPlano, type Modalidade } from "@/financeiro/planos";
import { lerValor, mensagemErroFinanceiro, reais } from "@/financeiro/regras";
import type { PlanoNaLista } from "@/financeiro/tipos";
import { CampoSelect } from "@/painel/configuracoes/pecas/Form";
import { Botao } from "@/ui/premium/Botao";
import { PainelDeslizante } from "@/ui/premium/Sheet";

const DURACOES = [1, 2, 3, 6, 12, 24];
const noCampo = (v: number | null | undefined) => (v ? Number(v).toFixed(2).replace(".", ",") : "");

/** Criar/editar um plano (W-P §3.1): as formas que o recebimento da conta não aceita aparecem desligadas. */
export function PlanoDialog({ aberto, plano, contaId, modalidadesDaConta, aoFechar, aoSalvo }: {
  aberto: boolean;
  plano: PlanoNaLista | null;
  contaId: string;
  modalidadesDaConta: Modalidade[];
  aoFechar: () => void;
  aoSalvo: () => void;
}) {
  const [nome, setNome] = useState("");
  const [meses, setMeses] = useState("1");
  const [valor, setValor] = useState("");
  const [modalidades, setModalidades] = useState<Modalidade[]>(["avista"]);
  const [max, setMax] = useState("12");
  const [parcela, setParcela] = useState("");
  const [erro, setErro] = useState("");
  const [salvando, setSalvando] = useState(false);
  useEffect(() => {
    if (!aberto) return;
    setNome(plano?.nome ?? "");
    setMeses(String(plano?.meses ?? 1));
    setValor(noCampo(plano?.valor));
    setModalidades(plano?.modalidades?.length ? plano.modalidades : ["avista"]);
    setMax(String(plano?.max_parcelas_cartao ?? 12));
    setParcela(noCampo(plano?.valor_parcela_mensal));
    setErro("");
  }, [aberto, plano]);
  const n = Number(meses);
  const sugerida = parcelaMensal({ valor: lerValor(valor), meses: n, valor_parcela_mensal: lerValor(parcela) });
  const alternar = (x: Modalidade) => setModalidades((a) => (a.includes(x) ? a.filter((y) => y !== x) : [...a, x]));
  const salvar = async (ev: FormEvent) => {
    ev.preventDefault();
    const r = validarPlano({
      nome, meses: n, valor: lerValor(valor), modalidades,
      max_parcelas_cartao: modalidades.includes("cartao_parcelado") ? Number(max) : null,
      valor_parcela_mensal: modalidades.includes("mensal") && parcela.trim() ? lerValor(parcela) : null,
    }, modalidadesDaConta);
    if (!r.ok) return setErro(mensagemErroFinanceiro(r.erro));
    setSalvando(true);
    setErro("");
    try {
      await salvarPlano(contaId, { ...(plano ? { id: plano.id } : {}), ...r.plano });
      toast.success("Plano salvo.");
      aoSalvo();
    } catch (e) {
      setErro(mensagemErroFinanceiro(e instanceof ErroFinanceiro ? e.codigo : null));
    } finally {
      setSalvando(false);
    }
  };
  return (
    <PainelDeslizante aberto={aberto} aoMudar={(a) => !a && aoFechar()} lado="direita" titulo={plano ? "Editar plano" : "Novo plano"}
      descricao="Mudar um plano vale a partir do próximo pagamento de quem está nele.">
      <form onSubmit={salvar} className="flex flex-col gap-3" data-form-plano>
        <Campo rotulo="Nome" maxLength={80} value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex.: Consultoria anual" data-plano-nome />
        <CampoSelect rotulo="Duração" value={meses} onChange={(e) => setMeses(e.target.value)} data-plano-meses>
          {DURACOES.map((m) => <option key={m} value={m}>{m === 1 ? "1 mês (mensal)" : `${m} meses`}</option>)}
        </CampoSelect>
        <Campo rotulo="Valor do período todo (R$)" inputMode="decimal" value={valor} onChange={(e) => setValor(e.target.value)} data-plano-valor />
        <fieldset className="flex flex-col gap-2" data-plano-modalidades>
          <legend className="mb-1 text-[12.5px] font-semibold text-texto-2">Como o aluno pode pagar</legend>
          {MODALIDADES.map((x) => {
            const pode = modalidadesDaConta.includes(x);
            return (
              <label key={x} className="flex items-center gap-2 text-[13.5px] text-texto">
                <input type="checkbox" checked={modalidades.includes(x)} disabled={!pode && !modalidades.includes(x)} onChange={() => alternar(x)} data-plano-modalidade={x} />
                {ROTULO_MODALIDADE[x]}{!pode ? <span className="text-texto-3"> (o seu recebimento não aceita)</span> : null}
              </label>
            );
          })}
        </fieldset>
        {modalidades.includes("cartao_parcelado") && (
          <CampoSelect rotulo="Parcelas no cartão (até)" value={max} onChange={(e) => setMax(e.target.value)} data-plano-max>
            {Array.from({ length: 11 }, (_, i) => i + 2).map((k) => <option key={k} value={k}>{k}×</option>)}
          </CampoSelect>
        )}
        {modalidades.includes("mensal") && n > 1 && (
          <>
            <Campo rotulo="Parcela do mês a mês (R$, opcional)" inputMode="decimal" value={parcela} onChange={(e) => setParcela(e.target.value)}
              placeholder={sugerida ? reais(sugerida) : ""} data-plano-parcela />
            {sugerida && <p className="text-[12px] text-texto-3" data-plano-total-mensal>{n}× de {reais(sugerida)} = {reais(Math.round(sugerida * n * 100) / 100)}</p>}
          </>
        )}
        {erro && <MensagemForm>{erro}</MensagemForm>}
        <Botao type="submit" variante="w" icone={Save} disabled={salvando} data-plano-salvar>{salvando ? "Salvando…" : "Salvar"}</Botao>
      </form>
    </PainelDeslizante>
  );
}
```

- [ ] **Step 5: Rodar**

Run: `npx vitest run src/painel/financeiro src/ui/premium/semDialogoNativo.test.ts src/ui/tema/larguraCelular.test.ts && npm run tipos`
Expected: PASS (inclui as guardas de diálogo nativo e de largura) e `tsc` limpo. Se o `financeiroUtil.test.ts` listar as abas, acrescentar
`"planos"` na lista esperada dele.

- [ ] **Step 6: Commit**

```bash
git add src/financeiro/tipos.ts src/financeiro/api.ts src/financeiro/regras.ts src/painel/financeiro/financeiroUtil.ts src/painel/paginas/Financeiro.tsx src/painel/financeiro/Planos.tsx src/painel/financeiro/PlanoDialog.tsx src/painel/financeiro/Planos.test.tsx
gcw -m "feat(planos): aba Planos no Financeiro (criar, editar, desativar)"
```

---

### Task 11: Painel — o plano na ficha do aluno

**Files:**
- Create: `src/financeiro/ui/PlanoDoAluno.tsx`
- Modify: `src/financeiro/ui/FinanceiroDoAluno.tsx` (`CartaoMensalidade`)
- Test: `src/financeiro/ui/PlanoDoAluno.test.tsx`

- [ ] **Step 1: Escrever o teste que falha**

```tsx
// src/financeiro/ui/PlanoDoAluno.test.tsx
// Physiq W-P — ficha do aluno: o modo de hoje igual (B1); plano com período manda plano + modalidade + início; só as modalidades que
// o plano e a conta aceitam; trocar para o período todo com a automática ligada pede a confirmação do app e manda cancelar_automatica.
import { fireEvent, render, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ProvedorConfirmar } from "@/ui/premium/Confirmar";
import type { FinanceiroProfissional } from "../tipos";
import { hojeSP } from "../regras";

import { FormPlanoDoAluno } from "./PlanoDoAluno";

const h = vi.hoisted(() => ({ agir: vi.fn(), salvo: vi.fn() }));
const ANUAL = { id: "pl1", nome: "Anual", valor: 1000, ativo: true, meses: 12, modalidades: ["avista", "cartao_parcelado", "mensal"] as const,
  max_parcelas_cartao: 10, valor_parcela_mensal: null };
const SO_NOME = { id: "pl2", nome: "Amigos", valor: null, ativo: true, meses: 1, modalidades: ["avista"] as const, max_parcelas_cartao: null, valor_parcela_mensal: null };

function dados(x: Partial<FinanceiroProfissional> = {}): FinanceiroProfissional {
  return {
    ok: true, ambiente: "staging", simulacao: true, hoje: hojeSP(), agora: new Date().toISOString(),
    aluno: { paciente_id: "p1", treino_user_id: "t1", nome: "Rafael Moura", email: null, cpf: null, foto_url: null, ativo: true, tags: [], conta_id: "c1", conta_nome: "Lucas", tem_login: true },
    permissoes: { master: false, dono: true, responsavel: true, mensalidade: true },
    conta: { id: "c1", nome: "Lucas", modo: "pix_manual", bloquear: false, origem: "nova", chave: null, modalidades: ["avista", "mensal"] },
    planos: [ANUAL as never, SO_NOME as never],
    mensalidade: { valor: 99.9, plano_id: null, plano: null, pausada: false, pago_ate: null, desde: null, coberta: false, modalidade: null, meses: 1 },
    assinatura: null, cobrancas: [], ...x,
  } as FinanceiroProfissional;
}
const montar = (d: FinanceiroProfissional) =>
  render(<ProvedorConfirmar><MemoryRouter><FormPlanoDoAluno d={d} agir={h.agir} aoSalvo={h.salvo} /></MemoryRouter></ProvedorConfirmar>);

beforeEach(() => {
  h.agir.mockReset().mockResolvedValue({ mensalidade: { valor: 83.33 } });
  h.salvo.mockReset();
});

describe("ficha do aluno › plano (W-P)", () => {
  it("modo de hoje: o valor livre continua e manda plano_modalidade: null", async () => {
    montar(dados());
    expect(document.querySelector("[data-form-mensalidade]")!.getAttribute("data-modo-plano")).toBe("hoje");
    fireEvent.change(document.querySelector("[data-mensalidade-valor]")!, { target: { value: "120" } });
    fireEvent.click(document.querySelector("[data-mensalidade-salvar]")!);
    await waitFor(() => expect(h.agir).toHaveBeenCalledWith("prof_definir", { aluno: "p1", valor: 120, plano_aluno_id: null, plano_modalidade: null }, "Plano e mensalidade salvos."));
  });
  it("plano só com nome continua no modo de hoje", () => {
    montar(dados());
    fireEvent.change(document.querySelector("[data-mensalidade-plano]")!, { target: { value: "pl2" } });
    expect(document.querySelector("[data-form-mensalidade]")!.getAttribute("data-modo-plano")).toBe("hoje");
  });
  it("plano com período: só as modalidades da conta (Pix manual: sem cartão parcelado) e o 1º vencimento", async () => {
    montar(dados());
    fireEvent.change(document.querySelector("[data-mensalidade-plano]")!, { target: { value: "pl1" } });
    const opcoes = [...document.querySelectorAll("[data-mensalidade-modalidade] option")].map((o) => (o as HTMLOptionElement).value);
    expect(opcoes).toEqual(["", "avista", "mensal"]);
    fireEvent.change(document.querySelector("[data-mensalidade-modalidade]")!, { target: { value: "mensal" } });
    expect(document.querySelector("[data-mensalidade-previsto]")!.textContent).toBe("Cada pagamento: R$ 83,33");
    fireEvent.click(document.querySelector("[data-mensalidade-salvar]")!);
    await waitFor(() => expect(h.agir).toHaveBeenCalledWith("prof_definir", { aluno: "p1", plano_aluno_id: "pl1", plano_modalidade: "mensal",
      plano_valor_negociado: null, inicio: hojeSP() }, "Plano do aluno salvo."));
    expect(h.salvo).toHaveBeenCalledWith("Anual", 83.33);
  });
  it("período todo com a automática ligada: confirma no app e manda cancelar_automatica", async () => {
    montar(dados({ assinatura: { id: "a1", status: "authorized", valor: 99.9, proximo_vencimento: null, sandbox: false, simulada: false, init_point: null } }));
    fireEvent.change(document.querySelector("[data-mensalidade-plano]")!, { target: { value: "pl1" } });
    fireEvent.change(document.querySelector("[data-mensalidade-modalidade]")!, { target: { value: "avista" } });
    fireEvent.click(document.querySelector("[data-mensalidade-salvar]")!);
    await waitFor(() => expect(document.querySelector("[data-confirmar-ok]")).not.toBeNull());
    expect(h.agir).not.toHaveBeenCalled();
    fireEvent.click(document.querySelector("[data-confirmar-ok]")!);
    await waitFor(() => expect(h.agir).toHaveBeenCalledWith("prof_definir", expect.objectContaining({ plano_modalidade: "avista", cancelar_automatica: true }), "Plano do aluno salvo."));
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/financeiro/ui/PlanoDoAluno.test.tsx`
Expected: FAIL — não acha `./PlanoDoAluno`.

- [ ] **Step 3: Escrever o formulário**

```tsx
// src/financeiro/ui/PlanoDoAluno.tsx
import { useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { Save } from "lucide-react";
import { Campo, MensagemForm } from "@/entrada/pecas/Campo";
import { CampoSelect } from "@/painel/configuracoes/pecas/Form";
import { Botao } from "@/ui/premium/Botao";
import { useConfirmar } from "@/ui/premium/useConfirmar";
import { aceitaAutomatica, ehModalidade, modalidadesOferecidas, planoCompleto, ROTULO_MODALIDADE, valorDoPagamento, type Modalidade } from "../planos";
import { hojeSP, lerValor, reais } from "../regras";
import type { FinanceiroProfissional } from "../tipos";
import type { useFinanceiroDoAluno } from "./useFinanceiroDoAluno";

type Agir = ReturnType<typeof useFinanceiroDoAluno>["agir"];
const noCampo = (v: number | null | undefined) => (v ? Number(v).toFixed(2).replace(".", ",") : "");

/**
 * Ficha do aluno › plano (W-P, desenho §3.2 + §7 B1): num plano com período o personal escolhe a modalidade (só as que o plano e o
 * recebimento da conta aceitam), o valor negociado (vazio = o do plano) e o 1º vencimento (só de quem nunca pagou); sem plano com
 * período, o valor livre de hoje. Trocar vale a partir do próximo pagamento.
 */
export function FormPlanoDoAluno({ d, agir, aoSalvo }: { d: FinanceiroProfissional; agir: Agir; aoSalvo: (planoNome: string | null, valor: number | null) => void }) {
  const m = d.mensalidade;
  const confirmar = useConfirmar();
  const [plano, setPlano] = useState(m?.plano_id ?? "");
  const [modalidade, setModalidade] = useState<Modalidade | "">(m?.modalidade ?? "");
  const [negociado, setNegociado] = useState(noCampo(m?.negociado));
  const [inicio, setInicio] = useState(hojeSP());
  const [valor, setValor] = useState(m && !m.modalidade ? noCampo(m.valor) : "");
  const [erro, setErro] = useState("");
  const [salvando, setSalvando] = useState(false);
  useEffect(() => {
    setPlano(d.mensalidade?.plano_id ?? "");
    setModalidade(d.mensalidade?.modalidade ?? "");
    setNegociado(noCampo(d.mensalidade?.negociado));
    setValor(d.mensalidade && !d.mensalidade.modalidade ? noCampo(d.mensalidade.valor) : "");
  }, [d.mensalidade]);

  const escolhido = d.planos.find((p) => p.id === plano) ?? null;
  const meses = escolhido?.meses ?? 1;
  const comPeriodo = !!escolhido && planoCompleto({ valor: escolhido.valor, meses });
  const doPlano = { valor: escolhido?.valor ?? null, meses, valor_parcela_mensal: escolhido?.valor_parcela_mensal ?? null };
  // quem já está no plano continua nele mesmo desativado (§3.1); plano novo: só o que a conta recebe
  const ofertas: Modalidade[] = !escolhido || !comPeriodo ? [] : escolhido.id === m?.plano_id
    ? [...(escolhido.modalidades ?? [])]
    : modalidadesOferecidas({ ...doPlano, modalidades: [...(escolhido.modalidades ?? ["avista"])], ativo: escolhido.ativo }, d.conta.modo);
  const previsto = comPeriodo && modalidade ? valorDoPagamento(doPlano, modalidade, lerValor(negociado)) : null;
  const nunca = !m?.pago_ate;

  const salvar = async (ev: FormEvent) => {
    ev.preventDefault();
    if (comPeriodo) {
      if (!modalidade || !ofertas.includes(modalidade)) return setErro("Escolha como o aluno vai pagar.");
      if (negociado.trim() && !lerValor(negociado)) return setErro("Valor negociado inválido.");
      let cancelar = false;
      if (d.assinatura && ["authorized", "pending", "paused"].includes(d.assinatura.status) && !aceitaAutomatica(modalidade, meses)) {
        if (!(await confirmar({
          titulo: "Desligar a cobrança automática?",
          descricao: `${d.aluno.nome} paga no cartão todo mês. "${ROTULO_MODALIDADE[modalidade]}" não usa a cobrança automática: ela é cancelada e o aluno recebe um aviso.`,
          rotuloConfirmar: "Trocar e desligar", perigo: true,
        }))) return;
        cancelar = true;
      }
      setSalvando(true);
      setErro("");
      const r = await agir<{ mensalidade: { valor: number } | null }>("prof_definir", {
        aluno: d.aluno.paciente_id, plano_aluno_id: plano, plano_modalidade: modalidade,
        plano_valor_negociado: negociado.trim() ? lerValor(negociado) : null,
        ...(nunca ? { inicio } : {}), ...(cancelar ? { cancelar_automatica: true } : {}),
      }, "Plano do aluno salvo.");
      setSalvando(false);
      if (r) aoSalvo(escolhido!.nome, r.mensalidade?.valor ?? null);
      return;
    }
    const v = valor.trim() ? lerValor(valor) : null;
    if (valor.trim() && !v) return setErro("Valor inválido.");
    setSalvando(true);
    setErro("");
    const r = await agir("prof_definir", { aluno: d.aluno.paciente_id, valor: v, plano_aluno_id: plano || null, plano_modalidade: null }, "Plano e mensalidade salvos.");
    setSalvando(false);
    if (r) aoSalvo(escolhido?.nome ?? null, v);
  };

  return (
    <form onSubmit={salvar} className="flex flex-col gap-3" data-form-mensalidade data-modo-plano={comPeriodo ? "periodo" : "hoje"}>
      <CampoSelect rotulo="Plano do aluno" value={plano} onChange={(e) => { setPlano(e.target.value); setModalidade(""); setErro(""); }} data-mensalidade-plano>
        <option value="">Sem plano (valor livre)</option>
        {d.planos.filter((p) => p.ativo || p.id === m?.plano_id).map((p) => (
          <option key={p.id} value={p.id}>{p.nome}{planoCompleto({ valor: p.valor, meses: p.meses ?? 1 }) ? "" : " (sem período)"}</option>
        ))}
      </CampoSelect>
      {comPeriodo ? (
        <>
          <CampoSelect rotulo="Como o aluno paga" value={modalidade} onChange={(e) => { setModalidade(ehModalidade(e.target.value) ? e.target.value : ""); setErro(""); }} data-mensalidade-modalidade>
            <option value="">Escolha…</option>
            {ofertas.map((x) => <option key={x} value={x}>{ROTULO_MODALIDADE[x]}</option>)}
          </CampoSelect>
          <Campo rotulo="Valor negociado (R$, opcional)" inputMode="decimal" value={negociado} onChange={(e) => setNegociado(e.target.value)}
            placeholder="Vazio = o valor do plano" data-mensalidade-negociado />
          {nunca && <Campo rotulo="1º vencimento" type="date" value={inicio} onChange={(e) => setInicio(e.target.value)} data-mensalidade-inicio />}
          {previsto && <p className="text-[12px] text-texto-3" data-mensalidade-previsto>Cada pagamento: {reais(previsto)}</p>}
        </>
      ) : (
        <Campo rotulo="Mensalidade (R$)" inputMode="decimal" value={valor} onChange={(e) => { setValor(e.target.value); setErro(""); }} placeholder="Vazio = sem cobrança" data-mensalidade-valor />
      )}
      {erro && <MensagemForm>{erro}</MensagemForm>}
      <div className="flex flex-wrap items-center gap-2">
        <Botao type="submit" variante="w" icone={Save} disabled={salvando} data-mensalidade-salvar>{salvando ? "Salvando…" : "Salvar"}</Botao>
        {d.permissoes.dono && <Link to="/painel/financeiro?aba=planos" className="text-[12.5px] font-semibold text-violeta-3" data-link-planos>Criar ou editar planos</Link>}
      </div>
    </form>
  );
}
```

- [ ] **Step 4: Ligar no `CartaoMensalidade` (`FinanceiroDoAluno.tsx`)**

1. Imports: `import { FormPlanoDoAluno } from "./PlanoDoAluno";` e
   `import { precisaRenovar, sufixoDoValor } from "../planos";`. Tirar `Campo` e `CampoSelect` dos imports se não sobrar uso.
2. No `CartaoMensalidade`: apagar os estados `plano`, `planoNovo`, `valor`, `erro`, `salvando`, o `useEffect` deles e a função `salvar`;
   trocar o `<form …>…</form>` inteiro por:
```tsx
      <FormPlanoDoAluno d={d} agir={agir} aoSalvo={(planoNome, valor) => espelharNoTreino(d.aluno.treino_user_id, planoNome, valor)} />
      {m && (
        <div className="mt-2 flex flex-wrap gap-2">
          {m.pausada ? (
            <Botao icone={Play} onClick={() => void agir("prof_pausar", { aluno: d.aluno.paciente_id, pausar: false }, "Cobrança reativada.")} data-mensalidade-reativar>Reativar cobrança</Botao>
          ) : (
            <Botao icone={Pause} onClick={() => void confirmar({ titulo: "Parar a cobrança pelo app?", descricao: "O aluno deixa de ver a pendência e o Pagar.", rotuloConfirmar: "Parar" })
              .then((sim) => { if (sim) void agir("prof_pausar", { aluno: d.aluno.paciente_id, pausar: true }, "Cobrança parada."); })} data-mensalidade-parar>Não cobrar pelo app</Botao>
          )}
        </div>
      )}
```
3. Cabeçalho: trocar `extra={m ? <Chip tom="g">{reaisCurto(m.valor)}/MÊS</Chip> : undefined}` por
   `extra={m ? <Chip tom="g">{reaisCurto(m.valor)}{sufixoDoValor(m.modalidade ?? null, m.meses).toUpperCase()}</Chip> : undefined}`.
4. No bloco `data-mensalidade-situacao`, depois do `<p>` da situação:
```tsx
        {m?.parcela && <p className="mt-1.5" data-mensalidade-parcela>Próximo pagamento: parcela {m.parcela.num} de {m.parcela.total}</p>}
        {m && precisaRenovar(m.modalidade ?? null, e.situacao, m.pago_ate) && <p className="mt-1.5 font-semibold text-ambar-3" data-mensalidade-renovar>Hora de renovar o plano</p>}
```

- [ ] **Step 5: Rodar**

Run: `npx vitest run src/financeiro && npx vitest run src/ui/premium/semDialogoNativo.test.ts src/ui/tema/larguraCelular.test.ts && npm run tipos`
Expected: PASS — inclusive o `FinanceiroDoAluno.test.tsx` de antes (ajustar só os seletores que ele usava do formulário antigo, se
algum mudou: `data-mensalidade-plano`, `data-mensalidade-valor` e `data-mensalidade-salvar` continuam).

- [ ] **Step 6: Commit**

```bash
git add src/financeiro/ui/PlanoDoAluno.tsx src/financeiro/ui/PlanoDoAluno.test.tsx src/financeiro/ui/FinanceiroDoAluno.tsx
gcw -m "feat(planos): o plano com período na ficha do aluno (modalidade, negociado, início; automática com confirmação)"
```

---

### Task 12: Painel — "/mês" da lista de Mensalidades conforme a modalidade

**Files:**
- Modify: `src/painel/financeiro/Mensalidades.tsx` (linha ~205)
- Test: `src/painel/financeiro/telas.test.tsx`

- [ ] **Step 1: Teste que falha** — acrescentar em `src/painel/financeiro/telas.test.tsx` um caso no `describe` das Mensalidades que
monta um aluno com `mensalidade_valor: 1000, modalidade: "avista", meses: 12` e espera o texto `R$ 1.000,00/ano` na linha dele, e outro
com `modalidade: null` esperando `R$ 99,90/mês` (seguir o molde de montagem que o arquivo já usa para a lista; os campos novos são
opcionais em `AlunoResumo`).

Run: `npx vitest run src/painel/financeiro/telas.test.tsx` → Expected: FAIL no `/ano`.

- [ ] **Step 2: Implementar**

Import `import { ehModalidade, sufixoDoValor } from "@/financeiro/planos";` e trocar
`{reais(Number(a.mensalidade_valor))}/mês` por
`{reais(Number(a.mensalidade_valor))}{sufixoDoValor(ehModalidade(a.modalidade) ? a.modalidade : null, a.meses)}`.

- [ ] **Step 3: Rodar e commit**

Run: `npx vitest run src/painel/financeiro` → Expected: PASS.
```bash
git add src/painel/financeiro/Mensalidades.tsx src/painel/financeiro/telas.test.tsx
gcw -m "feat(planos): a lista de Mensalidades mostra /ano ou por N meses no plano de período"
```

---

### Task 13: App — cartão com parcelas (I6)

**Files:**
- Modify: `src/painel/configuracoes/plano/CartaoPagamento.tsx`
- Test: `src/painel/configuracoes/plano/CartaoPagamento.test.tsx`

- [ ] **Step 1: Escrever o teste que falha**

```tsx
// src/painel/configuracoes/plano/CartaoPagamento.test.tsx
// Physiq W-P (§7 I6): o máximo de parcelas vem por prop, padrão 1 — o pagamento do plano do personal ao Weslley continua 1×.
import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ props: [] as Array<{ customization: { paymentMethods: { maxInstallments: number } } }> }));
vi.mock("@mercadopago/sdk-react", () => ({ CardPayment: (p: never) => { h.props.push(p); return null; } }));
vi.mock("@/components/pagamentos/mpInit", () => ({ MP_PUBLIC_KEY: "TEST-chave", ensureMpInit: vi.fn() }));

import { CartaoPagamento } from "./CartaoPagamento";

const base = { aberto: true, aoMudar: () => {}, valor: 1000, email: "a@teste.com", descricao: "x", aoEnviar: async () => {} };

describe("CartaoPagamento — parcelas (I6)", () => {
  it("padrão = 1 parcela", () => {
    h.props.length = 0;
    render(<CartaoPagamento {...base} modo="avista" />);
    expect(h.props.at(-1)!.customization.paymentMethods.maxInstallments).toBe(1);
  });
  it("cartão parcelado: até o máximo do plano e o texto 'Em até N×'", () => {
    h.props.length = 0;
    render(<CartaoPagamento {...base} modo="avista" maxParcelas={10} />);
    expect(h.props.at(-1)!.customization.paymentMethods.maxInstallments).toBe(10);
    expect(document.body.textContent).toContain("Em até 10× no cartão");
  });
  it("a cobrança automática é sempre 1×", () => {
    h.props.length = 0;
    render(<CartaoPagamento {...base} modo="assinar" maxParcelas={10} />);
    expect(h.props.at(-1)!.customization.paymentMethods.maxInstallments).toBe(1);
  });
});
```
Run: `npx vitest run src/painel/configuracoes/plano/CartaoPagamento.test.tsx` → Expected: FAIL (prop inexistente, texto ausente).

- [ ] **Step 2: Implementar**

- `DadosCartao`: acrescentar `installments?: number;`.
- Props: acrescentar `maxParcelas = 1,` na desestruturação e `/** W-P (I6): até quantas parcelas (cartão parcelado); padrão 1 */ maxParcelas?: number;` no tipo.
- Antes do `return`: `const parcelas = modo === "assinar" ? 1 : Math.max(1, Math.min(12, maxParcelas));`
- Texto: trocar `{modo === "assinar" ? "Todo mês, no mesmo dia" : "Pagamento único"}` por
  `{modo === "assinar" ? "Todo mês, no mesmo dia" : parcelas > 1 ? `Em até ${parcelas}× no cartão` : "Pagamento único"}`.
- Brick: `key={`${modo}-${valor}-${parcelas}`}` e `paymentMethods: { maxInstallments: parcelas },`.

- [ ] **Step 3: Rodar e commit**

Run: `npx vitest run src/painel/configuracoes/plano` → Expected: PASS.
```bash
git add src/painel/configuracoes/plano/CartaoPagamento.tsx src/painel/configuracoes/plano/CartaoPagamento.test.tsx
gcw -m "feat(planos): cartão com parcelas por prop (padrão 1×) — I6"
```

---

### Task 14: App — Pagamentos com o plano (período, parcela, Renovar) no site e na loja

**Files:**
- Modify: `src/app-aluno/perfil/Pagamentos.tsx` (`CartaoMensalidade`), `src/app-aluno/perfil/pagamentos/PagarMercadoPago.tsx`
- Test: `src/app-aluno/perfil/Pagamentos.test.tsx` (acrescentar), `src/app-aluno/perfil/PagamentosPlano.loja.test.tsx` (novo)

- [ ] **Step 1: Escrever os testes que falham**

No fim de `Pagamentos.test.tsx`:
```tsx
const PLANO = (x: Partial<NonNullable<MatriculaPagamentos["mensalidade"]>> = {}) => matricula({
  conta: { id: "c1", nome: "Consultoria", modo: "pix_manual", bloquear: false, profissional: "Lucas Ferreira" },
  chave: { tipo: "email", chave: "lucas@teste.com", favorecido: "Lucas", banco: null },
  mensalidade: { valor: 1000, plano_id: "pl1", plano: "Anual", pausada: false, pago_ate: null, desde: dia(-1), coberta: false,
    modalidade: "avista", meses: 12, negociado: null, max_parcelas: 1, automatica: false, parcela: null, ...x },
});

describe("Perfil › Pagamentos — plano com período (W-P)", () => {
  it("período todo: 'Plano · Anual', '/ano' e Pagar o valor todo", async () => {
    h.status.mockResolvedValue(status([PLANO()]));
    montar();
    await waitFor(() => expect(document.querySelector("[data-mensalidade-aluno]")).not.toBeNull());
    const cartao = document.querySelector("[data-mensalidade-aluno]")!;
    expect(cartao.textContent).toContain("Plano · Anual");
    expect(cartao.textContent).toContain("/ano");
    expect(document.querySelector("[data-pagar-mensalidade]")!.textContent).toBe("Pagar R$ 1.000,00");
  });
  it("mês a mês: '/mês' e 'parcela 4 de 12'", async () => {
    h.status.mockResolvedValue(status([PLANO({ valor: 83.33, modalidade: "mensal", automatica: true, parcela: { num: 4, total: 12 } })]));
    montar();
    await waitFor(() => expect(document.querySelector("[data-mensalidade-aluno]")).not.toBeNull());
    expect(document.querySelector("[data-linha-mensalidade]")!.textContent).toContain("parcela 4 de 12");
    expect(document.querySelector("[data-mensalidade-aluno]")!.textContent).toContain("/mês");
  });
  it("período todo já pago e vencendo: 'Renovar plano'", async () => {
    h.status.mockResolvedValue(status([PLANO({ pago_ate: dia(3), desde: dia(-360), coberta: true })]));
    montar();
    await waitFor(() => expect(document.querySelector("[data-pagar-mensalidade]")).not.toBeNull());
    expect(document.querySelector("[data-pagar-mensalidade]")!.textContent).toBe("Renovar plano · R$ 1.000,00");
  });
});
```

Novo `src/app-aluno/perfil/PagamentosPlano.loja.test.tsx` — copiar do topo do `Pagamentos.test.tsx` os `vi.hoisted`, os `vi.mock`
(trocando o da distribuição por `vi.mock("@/lib/distribuicao", () => ({ ehLoja: true, DISTRIBUICAO: "play" }));`), as funções
`dia`, `matricula`, `status`, `montar` e o `beforeEach`, e o caso:
```tsx
describe("Perfil › Pagamentos — versão da loja (W-P)", () => {
  it("o aluno paga o PLANO DO PERSONAL também na loja (serviço do profissional, não libera recurso do app)", async () => {
    h.status.mockResolvedValue(status([matricula({
      conta: { id: "c1", nome: "Consultoria", modo: "pix_manual", bloquear: false, profissional: "Lucas Ferreira" },
      chave: { tipo: "email", chave: "lucas@teste.com", favorecido: "Lucas", banco: null },
      mensalidade: { valor: 1000, plano_id: "pl1", plano: "Anual", pausada: false, pago_ate: null, desde: dia(-1), coberta: false,
        modalidade: "avista", meses: 12, negociado: null, max_parcelas: 1, automatica: false, parcela: null },
    })]));
    montar();
    await waitFor(() => expect(document.querySelector("[data-pagar-mensalidade]")).not.toBeNull());
    expect(document.querySelector("[data-pagar-mensalidade]")!.textContent).toBe("Pagar R$ 1.000,00");
  });
});
```
Run: `npx vitest run src/app-aluno/perfil` → Expected: FAIL nos casos novos ("Mensalidade · Anual", "/mês", "Pagar R$ 1.000,00" no
lugar de "Renovar…").

- [ ] **Step 2: Implementar no `CartaoMensalidade` do `Pagamentos.tsx`**

Imports: `RefreshCw` no import do `lucide-react`; `import { precisaRenovar, sufixoDoValor } from "@/financeiro/planos";`.
Depois de `const formas = …`:
```tsx
  // W-P: plano com período — o valor é o do pagamento na modalidade ("/ano", " por 6 meses" ou "/mês" + "parcela 4 de 12")
  const modalidade = ms.modalidade ?? null;
  const sufixo = sufixoDoValor(modalidade, ms.meses);
  const renovar = precisaRenovar(modalidade, e.situacao, ms.pago_ate);
  const parcela = ms.parcela ? ` · parcela ${ms.parcela.num} de ${ms.parcela.total}` : "";
```
- Na `linha`: trocar `` `Grátis até ${dataBR(e.vence)} · depois ${reais(ms.valor)}/mês · ${formas}` `` por
  `` `Grátis até ${dataBR(e.vence)} · depois ${reais(ms.valor)}${sufixo} · ${formas}` `` e `` `${quando} · ${formas}` `` por
  `` `${quando}${parcela} · ${formas}` ``.
- Título: `{doApp ? "Plano do app" : modalidade ? "Plano" : "Mensalidade"}{ms.plano ? ` · ${ms.plano}` : ""}`.
- Valor: trocar `<span className="ml-1 text-[13px] font-medium text-texto-2">/mês</span>` por
  `<span className="ml-1 text-[13px] font-medium text-texto-2">{sufixo}</span>`.
- Botão: trocar o `<Botao … data-pagar-mensalidade>` por
```tsx
            <Botao variante="w" icone={renovar ? RefreshCw : QrCode} onClick={() => aoPagar({ tipo: "mensalidade" })} data-pagar-mensalidade data-renovar={renovar ? "1" : undefined}>
              {e.situacao === "teste" ? `Assinar · ${reais(ms.valor)}/mês` : renovar ? `Renovar plano · ${reais(ms.valor)}` : `Pagar ${reais(ms.valor)}`}
            </Botao>
```

- [ ] **Step 3: Implementar no `PagarMercadoPago.tsx`**

Depois de `const corpoAlvo = …`:
```tsx
  // W-P: o cartão parcelado vai até o máximo do plano (I6); a automática só onde a modalidade aceita (B2)
  const maxParcelas = alvo?.tipo === "mensalidade" ? matricula.mensalidade?.max_parcelas ?? 1 : 1;
  const podeAutomatica = alvo?.tipo === "mensalidade" && (matricula.mensalidade?.automatica ?? true);
```
- Botão da automática: trocar `{alvo?.tipo === "mensalidade" && !matricula.assinatura?.status?.match(/authorized/) && (` por
  `{podeAutomatica && !matricula.assinatura?.status?.match(/authorized/) && (`.
- Texto do cartão: `>{maxParcelas > 1 ? `Pagar com cartão (até ${maxParcelas}×)` : "Pagar com cartão"}</Botao>` no botão `data-mp-cartao`.
- `aluno_mp_cartao`: no corpo, acrescentar `installments: Number(d.installments) || 1,`.
- `<CartaoPagamento …>`: acrescentar `maxParcelas={cartao === "assinar" ? 1 : maxParcelas}`.

- [ ] **Step 4: Rodar**

Run: `npx vitest run src/app-aluno src/financeiro && npm run tipos`
Expected: PASS (site e loja).

- [ ] **Step 5: Commit**

```bash
git add src/app-aluno/perfil/Pagamentos.tsx src/app-aluno/perfil/pagamentos/PagarMercadoPago.tsx src/app-aluno/perfil/Pagamentos.test.tsx src/app-aluno/perfil/PagamentosPlano.loja.test.tsx
gcw -m "feat(planos): Pagamentos com o plano — período, parcela n de N, Renovar e cartão parcelado (site e loja)"
```

---

### Task 15: App — faixa do topo "Seu plano" no período todo

**Files:**
- Modify: `src/financeiro/regras.ts` (`faixaDoAluno`)
- Test: `src/financeiro/regras.test.ts`

- [ ] **Step 1: Teste que falha** — no `describe("faixa do topo (tela 1; A13)")`, acrescentar:
```ts
  it("W-P: no plano do período todo a faixa fala do plano; no mês a mês, da mensalidade", () => {
    const base = { paciente_id: "p", conta_id: "c", conta_nome: "C", recebimento_modo: "pix_manual" as const, bloquear_inadimplente: false,
      tem_chave: true, profissional: "Lucas", mensalidade_valor: 1000, plano_nome: "Anual", pausada: false, aguardando: false,
      assinatura_ativa: false, abertas: [], aguardando_avulsas: 0, desde: null };
    const agora = new Date("2026-10-10T15:00:00Z");
    expect(faixaDoAluno([{ ...base, pago_ate: "2026-10-12T12:00:00Z", modalidade: "avista", plano_meses: 12 }], agora)!.titulo).toBe("Seu plano vence em 2 dias");
    expect(faixaDoAluno([{ ...base, pago_ate: "2026-10-12T12:00:00Z", modalidade: "mensal", plano_meses: 12 }], agora)!.titulo).toBe("Sua mensalidade vence em 2 dias");
  });
```
Run: `npx vitest run src/financeiro/regras.test.ts` → Expected: FAIL ("Sua mensalidade…" no 1º).

- [ ] **Step 2: Implementar** — em `faixaDoAluno`, no ramo `vence_em_breve`/`vencida`/`pendente`, trocar
`titulo: \`Sua mensalidade ${textoDoVencimento(e)}\`,` por
```ts
        titulo: r.modalidade === "avista" || r.modalidade === "cartao_parcelado" ? `Seu plano ${textoDoVencimento(e)}` : `Sua mensalidade ${textoDoVencimento(e)}`,
```

- [ ] **Step 3: Rodar e commit**

Run: `npx vitest run src/financeiro` → Expected: PASS.
```bash
git add src/financeiro/regras.ts src/financeiro/regras.test.ts
gcw -m "feat(planos): faixa do topo fala do plano no período todo"
```

---

### Task 16: P-A — decisão dele "1" (10/10/2026): o mês a mês com a automática renova sozinho

**Files:** nenhum código novo — a regra já está na Task 1 (`proximaParcela` volta a 1), na Task 3 (`parcela_num` cíclico) e na Task 8
(`aluno_mp_assinar` sem `auto_recurring.end_date`). Esta tarefa só trava a decisão com teste.

- [ ] **Step 1: Teste de guarda da decisão**

Acrescentar em `src/financeiro/planos.test.ts`:
```ts
describe("P-A (decisão dele, 10/10/2026: '1')", () => {
  it("depois da última parcela o plano renova: a contagem volta a 1 e a automática segue sem data de fim", () => {
    expect(proximaParcela({ num: 12, total: 12, plano: "p1" }, "p1", 12)).toEqual({ num: 1, total: 12 });
  });
});
```
e uma guarda de fonte em `src/financeiro/servidor.test.ts`:
```ts
import { readFileSync } from "node:fs";
it("P-A '1': a assinatura do aluno não manda data de fim (renova)", () => {
  const fonte = readFileSync(new URL("../../supabase-principal/functions/pagamentos-aluno/index.ts", import.meta.url), "utf8");
  expect(fonte).not.toMatch(/end_date/);
});
```
Run: `npx vitest run src/financeiro/planos.test.ts src/financeiro/servidor.test.ts` → Expected: PASS.

- [ ] **Step 2: Commit**

```bash
git add src/financeiro/planos.test.ts src/financeiro/servidor.test.ts
gcw -m "test(planos): P-A — o mês a mês com a automática renova sozinho (decisão de 10/10)"
```

---

### Task 17: Testes locais finais + E2E de tela (site e loja) + prints

**Files:**
- Create: `e2e/wp/telas.py`
- Modify: `docs/e2e-rodadas.md`

- [ ] **Step 1: Suíte inteira, tipos, lint e os 2 builds**

```bash
npm test && npm run tipos && npm run lint
npm run build && cp -r dist /tmp/claude-1000/-home-bertoldo/4e326906-3248-4c2a-acca-1fe44655da08/scratchpad/dist-site
npm run build:loja && mv dist /tmp/claude-1000/-home-bertoldo/4e326906-3248-4c2a-acca-1fe44655da08/scratchpad/dist-loja && mv /tmp/claude-1000/-home-bertoldo/4e326906-3248-4c2a-acca-1fe44655da08/scratchpad/dist-site dist
```
Expected: tudo verde (o build usa o `.env.local` de staging).

- [ ] **Step 2: Escrever o E2E de tela**

```python
#!/usr/bin/env python3
"""Physiq W-P — E2E de TELA dos planos do aluno (celular 390 × 844, Edge). Massa pela função (e2e/w06/_base.py: prof2/aluno2), telas pelo
e2e/hml18/_base.py. Casos: 1 aba Planos (criar pela tela) · 2 ficha do aluno (pôr no plano à vista) · 3 app do aluno (Pagamentos: plano,
"/ano", "Pagar R$ 1.000,00") · 4 Renovar (pago por fora e vencendo). --loja: o build da loja servido no localhost:8080 (o pagamento ao
personal continua). Um por vez, com a guarda de /health antes. Prints em physiqcalc-scratch/prints/wp/.
Uso: python3 e2e/wp/telas.py --base local|staging [--loja] [--canal msedge]
"""
from __future__ import annotations

import argparse
import importlib.util
import sys
import uuid
from pathlib import Path

sys.dont_write_bytecode = True
AQUI = Path(__file__).resolve().parent


def _carregar(nome: str, caminho: Path):
    espec = importlib.util.spec_from_file_location(nome, caminho)
    mod = importlib.util.module_from_spec(espec)
    sys.modules[nome] = mod
    espec.loader.exec_module(mod)  # type: ignore[union-attr]
    return mod


B = _carregar("_base_hml18", AQUI.parent / "hml18" / "_base.py")
W6 = _carregar("_base_w06", AQUI.parent / "w06" / "_base.py")
W6.ESTADO["schema"] = "staging"
B.PRINTS = Path.home() / "projetos" / "physiqcalc-scratch" / "prints" / "wp"
S = "staging"
DONO, ALUNO = "prof2", "aluno2"
NOME = f"WP Tela {uuid.uuid4().hex[:5]}"


def caso_painel(R, nav, ctx) -> None:
    cel = B.Celular(nav, ctx["base"], 390)
    try:
        cel.entrar(ctx["logins"], DONO, "/painel/financeiro?aba=planos")
        R.ok(cel.esperar(lambda: cel.tem("[data-aba-planos]"), 40), "1. a aba Planos abre")
        cel.pg.click("[data-novo-plano]")
        cel.pg.fill("[data-plano-nome]", NOME)
        cel.pg.select_option("[data-plano-meses]", "12")
        cel.pg.fill("[data-plano-valor]", "1000")
        cel.pg.click("[data-plano-salvar]")
        R.ok(cel.esperar(lambda: cel.pg.locator(f"[data-plano-card]:has-text('{NOME}')").count() == 1, 20), "1. o plano novo aparece na lista")
        cel.print(ctx["prefixo"], "1_planos")
        plano = W6.sql_principal(f"select id::text as id from {S}.planos_aluno where nome = '{NOME}'")[0]["id"]
        ctx["plano"] = plano
        cel.ir(f"/painel/alunos/{ctx['aluno']}/financeiro")
        R.ok(cel.esperar(lambda: cel.tem("[data-form-mensalidade]"), 40), "2. a ficha do aluno abre")
        cel.pg.select_option("[data-mensalidade-plano]", plano)
        cel.pg.select_option("[data-mensalidade-modalidade]", "avista")
        cel.pg.click("[data-mensalidade-salvar]")
        R.ok(cel.esperar(lambda: "/ANO" in (cel.pg.locator("[data-cartao-mensalidade]").first.inner_text() or ""), 20), "2. o cartão mostra R$ 1.000/ANO")
        cel.print(ctx["prefixo"], "2_ficha")
    finally:
        cel.fim()


def caso_app(R, nav, ctx) -> None:
    cel = B.Celular(nav, ctx["base"], 390)
    try:
        cel.entrar(ctx["logins"], ALUNO, "/perfil/pagamentos")
        R.ok(cel.esperar(lambda: cel.tem("[data-mensalidade-aluno]"), 40), "3. Pagamentos abre")
        texto = cel.pg.locator("[data-mensalidade-aluno]").first.inner_text()
        R.ok("Plano · " in texto and "/ano" in texto, f"3. o cartão diz 'Plano' e '/ano' ({'loja' if ctx['loja'] else 'site'})")
        R.ok(cel.pg.locator("[data-pagar-mensalidade]").first.inner_text().strip() == "Pagar R$ 1.000,00", "3. Pagar o período todo")
        cel.print(ctx["prefixo"], "3_app")
        # 4. pago por fora 1 ano atrás menos 3 dias → vence em 3 dias → Renovar
        W6.pag(DONO, "prof_registrar", {"aluno": ctx["aluno"], "data": W6.dias(-362), "metodo": "dinheiro"})
        cel.ir("/perfil/pagamentos")
        R.ok(cel.esperar(lambda: "Renovar plano" in (cel.pg.locator("[data-pagar-mensalidade]").first.inner_text() or ""), 30), "4. Renovar plano no fim do período")
        cel.print(ctx["prefixo"], "4_renovar")
    finally:
        cel.fim()


def limpar(ctx) -> None:
    W6.pag(DONO, "prof_definir", {"aluno": ctx["aluno"], "plano_modalidade": None, "plano_aluno_id": None, "valor": ctx["valor_antes"] or 99.9})
    W6.sql_principal(f"update {S}.cobrancas set deleted_at = now() where paciente_id = '{ctx['aluno']}' and deleted_at is null and origem = 'app' and forma = 'manual'")
    if ctx.get("plano"):
        W6.sql_principal(f"update {S}.pacientes set plano_aluno_id = null where plano_aluno_id = '{ctx['plano']}'")
        W6.sql_principal(f"delete from {S}.planos_aluno where id = '{ctx['plano']}'")


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--base", required=True, help="local (http://localhost:8080) | staging")
    ap.add_argument("--loja", action="store_true", help="o localhost:8080 está servindo o build da loja")
    ap.add_argument("--canal", default="msedge", choices=("msedge", "chromium", "chrome"))
    a = ap.parse_args()
    base, prefixo, producao = B.resolver_base(a.base)
    if producao:
        raise SystemExit("o E2E de tela da W-P cria massa: só local e staging")
    if not W6.saude_treino():
        print("   o banco do Treino não está saudável — parar (regra de 10/10)")
        return 2
    R = B.Rodada(f"wp_telas_{prefixo}{'_loja' if a.loja else ''}")
    m = W6.matricula(ALUNO)
    ctx = {"base": base, "prefixo": f"{prefixo}{'_loja' if a.loja else ''}", "loja": a.loja, "aluno": m["id"], "logins": B.Logins(f"wp/telas.py {prefixo}"),
           "valor_antes": W6.sql_principal(f"select mensalidade_valor::float as v from {S}.pacientes where id = '{m['id']}'")[0]["v"]}
    W6.sql_principal(f"update {S}.cobrancas set deleted_at = now() where paciente_id = '{m['id']}' and deleted_at is null and tipo = 'mensalidade'")
    from playwright.sync_api import sync_playwright  # noqa: PLC0415

    with sync_playwright() as pw:
        try:
            for fn in (caso_painel, caso_app):
                nav = pw.chromium.launch(channel=a.canal, args=["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu"])
                try:
                    fn(R, nav, ctx)
                except Exception as e:  # noqa: BLE001
                    R.ok(False, f"[{fn.__name__}] {type(e).__name__}: {str(e)[:240]}")
                finally:
                    nav.close()
        finally:
            limpar(ctx)
            ctx["logins"].fechar(R)
    return R.fim()


if __name__ == "__main__":
    raise SystemExit(main())
```

- [ ] **Step 3: Rodar no local, um por vez (site, depois loja)**

```bash
tmux new-session -d -s wp-preview "npx vite preview --port 8080 --strictPort"   # o dist/ do site (tmux: nada solto em background)
python3 e2e/wp/telas.py --base local
tmux kill-session -t wp-preview
rm -rf dist && mv /tmp/claude-1000/-home-bertoldo/4e326906-3248-4c2a-acca-1fe44655da08/scratchpad/dist-loja dist
tmux new-session -d -s wp-preview "npx vite preview --port 8080 --strictPort"   # o dist/ da loja
python3 e2e/wp/telas.py --base local --loja
tmux kill-session -t wp-preview
```
Antes do 1º: `git worktree list` e `ss -ltnp | grep 8080` (a LINUX 1 pode estar com preview na mesma porta — o `--strictPort` falha em vez
de cair em outra). Expected: os 2 placares completos ✅.

- [ ] **Step 4: Conferir os prints (Read em cada um) e registrar a rodada**

Abrir com o Read `~/projetos/physiqcalc-scratch/prints/wp/local_1_planos_390.png`, `…_2_ficha_390.png`, `…_3_app_390.png`,
`…_4_renovar_390.png` e os `local_loja_*`. Conferir: nada passando da largura, textos certos, sem dado de pessoa real. Acrescentar as
linhas da rodada em `docs/e2e-rodadas.md` (o `Placar.fim()` grava no `e2e-rodadas.tsv`).

- [ ] **Step 5: Commit**

```bash
git add e2e/wp/telas.py docs/e2e-rodadas.md
gcw -m "test(planos): E2E de tela da W-P (painel e app, site e loja)"
```

---

### Task 18: GATE 1 — link local para o Weslley

- [ ] **Step 1:** refazer o build do site (`npm run build`) e subir o preview no tmux (`tmux new-session -d -s wp-preview "npx vite preview --port 8080 --strictPort"`), confirmar o CHECK DE PORTA e o CHECK DE
  LOGIN da skill de deploy (abrir `http://localhost:8080/painel/financeiro?aba=planos` logado com a conta de teste).
- [ ] **Step 2:** mandar o link + os prints conferidos (painel: aba Planos, novo plano, ficha; app: período todo, mês a mês, Renovar;
  loja) com o resumo em ≤ 6 linhas, no terminal e no tópico. Esperar o "ok". Ajuste pedido → volta à tarefa do ajuste, testes, novo link.

---

### Task 19: Staging (depois do OK do G1)

- [ ] **Step 1: Check anti-sobrescrita (comando isolado)**

Run: `git fetch origin && git worktree list && gh pr list --repo weslleybertoldo/physiqcalc --state open`
Expected: nada novo nos arquivos desta entrega; se a `main` andou, `git rebase origin/main` e rodar `npm test` de novo.

- [ ] **Step 2: PR e push no staging (um por vez, avisando a LINUX 1)**

```bash
git push -u origin feat/planos-do-aluno
gh pr create --title "feat(planos): planos do aluno criados pelo profissional (W-P)" --body-file /tmp/claude-1000/-home-bertoldo/4e326906-3248-4c2a-acca-1fe44655da08/scratchpad/pr-wp.md
```
(o corpo: o que muda, as 2 migrations, as funções publicadas, os E2E com placar, e no fim `🤖 Generated with [Claude Code](https://claude.com/claude-code)`.)
`SendMessage` à LINUX 1: "vou subir a `feat/planos-do-aluno` no `staging` agora (fast-forward), aviso quando terminar". Depois:
`git push origin feat/planos-do-aluno:staging` (fast-forward; se não for, parar e combinar com a LINUX 1). Aviso de "terminei".

- [ ] **Step 3: Smoke no staging (um por vez, guarda de /health)**

```bash
python3 e2e/wp/api.py --casos periodo,mensal
python3 e2e/wp/telas.py --base staging
python3 e2e/w10/api.py
python3 e2e/hml01/banco.py --schema staging
```
Expected: todos ✅. Linhas no `docs/e2e-rodadas.md` (commit no PR).

- [ ] **Step 4: GATE 2** — link `https://physiqcalc-staging.vercel.app/painel/financeiro?aba=planos` + prints do staging (conferidos) no
terminal e no tópico. Esperar o "ok" = pode ir para produção.

---

### Task 20: Produção (depois do OK do G2)

- [ ] **Step 1: Check anti-sobrescrita de novo (isolado)** — o mesmo da Task 19, Step 1.

- [ ] **Step 2: Backup e regressão de antes no `public`**

```bash
python3 scripts/backup/backup_principal.py
python3 e2e/wp/sql_planos.py --so-regressao --schema public --guardar ~/projetos/physiqcalc-scratch/wp/regressao-public-antes.json
```

- [ ] **Step 3: As 2 migrations no `public` e a regressão de depois**

```bash
python3 scripts/apply_migration_principal.py supabase-principal/migrations/20261011010000_wp_planos_modalidades.sql --so public
python3 scripts/apply_migration_principal.py supabase-principal/migrations/20261011020000_wp_trava_cobranca.sql --so public
python3 e2e/wp/sql_planos.py --so-regressao --schema public --comparar ~/projetos/physiqcalc-scratch/wp/regressao-public-antes.json
python3 e2e/hml01/banco.py --schema public
```
Expected: regressão ✅ (o mesmo "pago até" para todos); `hml01` sem regressão. ❌ → parar, não fazer merge, avisar com o placar.

- [ ] **Step 4: Tipos do banco gerados de novo e commit no PR**

Run: `curl -sS -H "Authorization: Bearer $(cat ~/.pc-pat)" -H "User-Agent: physiq-unificado/1.0" "https://api.supabase.com/v1/projects/hkxvtsbwctxkrqzkkdoz/types/typescript?included_schemas=public" | python3 -c "import json,sys; print(json.load(sys.stdin)['types'])" > /tmp/claude-1000/-home-bertoldo/4e326906-3248-4c2a-acca-1fe44655da08/scratchpad/types.ts`
e trocar o corpo de `src/integrations/principal/types.ts` mantendo as 3 linhas de comentário do topo. `npm run tipos` limpo →
`gcw -m "chore(tipos): tipos do principal com os planos do aluno"` → `git push`.

- [ ] **Step 5: Merge (um por vez, avisando a LINUX 1)**

`SendMessage` à LINUX 1 ("vou fazer o merge da W-P na main") → `gh pr merge --squash --delete-branch=false` (autor do squash = Weslley;
conferir com `git log origin/main -1 --format='%an <%ae>'`) → esperar o CI (`gh run watch`) e o commit `chore: bump version to v3.9x`.
Aviso à LINUX 1: merge feito (`<sha>`).

- [ ] **Step 6: Smoke de produção (só leitura) e fechamento**

```bash
python3 e2e/w06/smoke_prod.py
python3 e2e/w10/api.py
```
Abrir `https://physiqcalc.com.br/painel/financeiro?aba=planos` com a conta de teste de produção (sem criar nada) e conferir que a aba abre.
Atualizar: `docs/e2e-rodadas.md` (no próximo PR), o JSON da foto (`W-P` → `feito`, `duracao_min`, `tag: "PR #… · v3.9x"`) e mandar a
página em andamento (`andamento_worktrees.py … --atual`); quadro `quem-toca-o-que.md` (✅ W-P com a hora); resumo no grupo Validação
(`remoto_validacao`, tópico do Physiq); `claude-orfaos.sh`.

---

## Self-review (feito ao escrever)

- **Cobertura do desenho:** §3.1 aba Planos → T10; §3.2 ficha → T11; §3.3 app (Pagamentos, Renovar, parcela, cartão parcelado,
  automática) → T8/T13/T14; §3.4 regras (alunos de hoje iguais, valor propaga só sem negociado, plano com aluno só desativa, só o dono)
  → T3/T6/T7; §3.6 formas × modo → T1/T6/T10; §4.1 dados → T3 (sem `desativado_em`, sem FK `restrict` — §6 do mestre); §4.5 testes →
  T1/T2/T3/T9/T10/T11/T13/T14/T17; §7: B1 → T1/T7; B2 → T1/T3/T6; I1 → T2/T6/T7; I2 → adiada (§6 do mestre); I3 → T3; I4 → T14; I5 → T4;
  I6 → T8/T13; menores (nome único entre desativados → `nome_repetido`; parcela 83,33 e o total → T1/T10; textos "/mês" → T11/T12/T13/
  T14/T15; renovar → T1/T14; sandbox → T9); pedido da LINUX 1 (`pdfDoRecibo`) retirado por ela — o `pdfRecibo.ts` já carrega o
  `reciboPdf` no clique; regras de tela (useConfirmar, grade) → T10/T11 com as guardas;
  loja → T14/T17; P-A → T16.
- **Sem marcador pendente:** conferido (os 2 pontos "copie o molde" — Tasks 12 e 14 — dizem exatamente o que copiar e de onde).
- **Nomes iguais em todas as tarefas:** `plano_modalidade`, `plano_valor_negociado`, `meses_cobertos`, `parcelas_total`, `parcela_num`,
  `COLUNAS_PLANO`, `retratoDoPlano`, `mensalidadeComPlano`, `parcelaDe`, `sincronizarAutomatica`, `schemaTemPlanos`, `temPlanos`,
  `buscarPlanosDaConta`/`salvarPlano`/`ativarPlano`, `FormPlanoDoAluno`, `maxParcelas`, `max_parcelas`, `automatica`, `parcela`.
