// Physiq hml-20c (H-42 · jeito 2, etapa 2) — o CONTRATO tela × servidor das LEITURAS da Dieta do aluno no Painel, das Dietas, da
// Pré-consulta e do Dashboard de saúde: cada função de leitura das libs manda à nutricao um corpo que PASSA nos leitores REAIS do servidor
// (o motor e o catálogo), o pedido roda no MÓDULO DE VERDADE (functions/nutricao/leituras.ts) sobre um banco falso que faz o PostgREST (as
// colunas pedidas, os embutidos, os filtros, o .or() do recorte, a ordem, a página, o HEAD), o Storage e o RLS da nutricionista (só os
// alunos dela; os modelos/catálogos dela; a TACO), e o que volta pela "rede" (JSON) chega à tela no MESMO tipo e com os MESMOS valores de
// hoje: as linhas que o select("*") de antes devolvia (as colunas do tipo gerado), na ordem da lib, as mesmas URLs assinadas (montadas com
// o domínio do cliente) e os mesmos números. E a tela pede numa ida só: a seção = 1 chamada; as séries de antes, na mesma ida.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { QueryClient } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { lerPedidoDeLeitura } from "../../../../supabase-principal/functions/_shared/leitura-lote";
import { CONSULTAS_NUTRICAO } from "../../../../supabase-principal/functions/_shared/nutricao-leituras";
import { atenderLeitura, type ContextoLeitura } from "../../../../supabase-principal/functions/nutricao/leituras";

const RAIZ = resolve(__dirname, "../../../..");
const EU = "c3c3c3c3-0000-4000-8000-000000000003"; // a nutricionista logada
const OUTRA_NUTRI = "d4d4d4d4-0000-4000-8000-000000000004";
const ALUNA = "a1a1a1a1-0000-4000-8000-000000000001"; // a matrícula que ela vê
const OUTRO_ALUNO = "b2b2b2b2-0000-4000-8000-000000000002"; // de OUTRA conta (o RLS esconde)
const CONTA = "e5e5e5e5-0000-4000-8000-000000000005";
const OUTRA_CONTA = "f6f6f6f6-0000-4000-8000-000000000006";
const BASE = "https://principal.teste.invalid";

/** As colunas do Row de cada tabela no tipo gerado — o select("*") de hoje devolvia exatamente estas. */
function colunasDoTipo(tabela: string): string[] {
  const tipos = readFileSync(resolve(RAIZ, "src/integrations/principal/types.ts"), "utf-8");
  const m = new RegExp(`\\n      ${tabela}: \\{\\n        Row: \\{\\n([\\s\\S]*?)\\n        \\}`).exec(tipos);
  if (!m) throw new Error(`tabela ${tabela} fora do tipo gerado`);
  return [...m[1].matchAll(/^ {10}([a-z_0-9]+)\??: /gm)].map((x) => x[1]);
}

// ───────────────────────── o banco falso (o PostgREST + Storage com o RLS da nutricionista) ─────────────────────────
type Linha = Record<string, unknown>;
let serie = 0;
/** Uma linha COMPLETA da tabela (todas as colunas do tipo — o "*"), com os valores dados. */
function linha(tabela: string, valores: Linha): Linha {
  serie += 1;
  const base: Linha = {};
  for (const c of colunasDoTipo(tabela)) base[c] = c === "id" ? `00000000-0000-4000-8000-${String(serie).padStart(12, "0")}` : c === "deleted_at" ? null : `${c}-${serie}`;
  return { ...base, ...valores };
}
const DO_ALUNO = ["calculos_energeticos", "registros_diarios", "metas", "orientacoes", "formulas_manipuladas", "indicacoes_produto"];
const MODELOS = ["modelos_meta", "modelos_orientacao", "modelos_formula", "produtos", "grupos_receita"];
let TABELAS: Record<string, Linha[]> = {};
function montarTabelas(): Record<string, Linha[]> {
  const t: Record<string, Linha[]> = {};
  for (const tabela of DO_ALUNO) {
    t[tabela] = [
      linha(tabela, { paciente_id: ALUNA, data: "2026-10-01", created_at: "2026-10-01T10:00:00Z", prescrita_em: "2026-10-01", ativa: true, ordem: 1 }),
      linha(tabela, { paciente_id: ALUNA, data: "2026-10-05", created_at: "2026-10-05T10:00:00Z", prescrita_em: "2026-10-05", ativa: false, ordem: 0 }),
      linha(tabela, { paciente_id: ALUNA, data: "2026-10-03", created_at: "2026-10-03T10:00:00Z", prescrita_em: "2026-10-03", ativa: true, ordem: 0, deleted_at: "2026-10-06T00:00:00Z" }),
      linha(tabela, { paciente_id: OUTRO_ALUNO, data: "2026-10-04", created_at: "2026-10-04T10:00:00Z", prescrita_em: "2026-10-04", ativa: true, ordem: 0 }),
    ].map((l) => Object.fromEntries(Object.entries(l).filter(([k]) => colunasDoTipo(tabela).includes(k))));
  }
  for (const tabela of MODELOS) {
    t[tabela] = [
      linha(tabela, { nutricionista_id: EU, titulo: "B meu", nome: "B meu", favorito: false, ordem: 1 }),
      linha(tabela, { nutricionista_id: EU, titulo: "A meu", nome: "A meu", favorito: true, ordem: 0 }),
      linha(tabela, { nutricionista_id: EU, titulo: "C na Lixeira", nome: "C", favorito: true, ordem: 2, deleted_at: "2026-10-06T00:00:00Z" }),
      linha(tabela, { nutricionista_id: OUTRA_NUTRI, titulo: "De outra", nome: "De outra", favorito: true, ordem: 0 }), // o RLS esconde
    ].map((l) => Object.fromEntries(Object.entries(l).filter(([k]) => colunasDoTipo(tabela).includes(k))));
  }
  t.refeicoes_concluidas = [
    linha("refeicoes_concluidas", { paciente_id: ALUNA, refeicao_id: "r1", data: "2026-10-06" }), linha("refeicoes_concluidas", { paciente_id: ALUNA, refeicao_id: "r2", data: "2026-10-02" }),
    linha("refeicoes_concluidas", { paciente_id: ALUNA, refeicao_id: "r3", data: "2026-09-20" }), linha("refeicoes_concluidas", { paciente_id: OUTRO_ALUNO, refeicao_id: "r9", data: "2026-10-03" }),
  ];
  t.metas_concluidas = [
    linha("metas_concluidas", { paciente_id: ALUNA, meta_id: "m1", data: "2026-10-04" }), linha("metas_concluidas", { paciente_id: ALUNA, meta_id: "m1", data: "2026-10-01" }),
    linha("metas_concluidas", { paciente_id: OUTRO_ALUNO, meta_id: "m9", data: "2026-10-02" }),
  ];
  // os alimentos (a TACO, os meus, os de outra nutri) e as medidas (fora de ordem: a tela ordena)
  t.alimentos = [
    linha("alimentos", { nome: "Arroz integral cozido", busca: "arroz integral cozido", fonte: "taco", grupo: "Cereais", nutricionista_id: null }),
    linha("alimentos", { nome: "Arroz da casa", busca: "arroz da casa", fonte: "proprio", grupo: "Cereais", nutricionista_id: EU }),
    linha("alimentos", { nome: "Arroz de outra", busca: "arroz de outra", fonte: "proprio", grupo: "Cereais", nutricionista_id: OUTRA_NUTRI }),
    linha("alimentos", { nome: "Feijão", busca: "feijao", fonte: "taco", grupo: "Leguminosas", nutricionista_id: null }),
    linha("alimentos", { nome: "Arroz velho", busca: "arroz velho", fonte: "proprio", grupo: "Cereais", nutricionista_id: EU, deleted_at: "2026-10-01T00:00:00Z" }),
  ];
  t.medidas_caseiras = [
    linha("medidas_caseiras", { alimento_id: t.alimentos[0].id, descricao: "colher", gramas: 25, ordem: 1 }),
    linha("medidas_caseiras", { alimento_id: t.alimentos[0].id, descricao: "xícara", gramas: 160, ordem: 0 }),
  ];
  t.receitas = [
    linha("receitas", { nutricionista_id: EU, nome: "Bolo 50% (cópia)", favorita: false }), linha("receitas", { nutricionista_id: EU, nome: "Atum ao forno", favorita: true }),
    linha("receitas", { nutricionista_id: OUTRA_NUTRI, nome: "Bolo de outra", favorita: false }),
  ];
  t.ingredientes_receita = [linha("ingredientes_receita", { receita_id: t.receitas[1].id, alimento_id: t.alimentos[0].id, ordem: 0 })];
  // o diário da conta (a aluna, com o código do link) e o de outra conta
  t.pacientes = [
    linha("pacientes", { id: ALUNA, nome: "Ana W5P", apelido: null, link_codigo: "ana1", foto_url: null, conta_id: CONTA, nutricionista_id: EU }),
    linha("pacientes", { id: OUTRO_ALUNO, nome: "Bruno", apelido: null, link_codigo: "bru1", foto_url: null, conta_id: OUTRA_CONTA, nutricionista_id: OUTRA_NUTRI }),
  ];
  t.diario_alimentar = [
    linha("diario_alimentar", { paciente_id: ALUNA, data_hora: "2026-10-12T15:00:00.000Z", created_at: "2026-10-12T15:00:01Z", path: `${EU}/${ALUNA}/f1.jpg`, reacao_nutri: null }),
    linha("diario_alimentar", { paciente_id: ALUNA, data_hora: "2026-10-12T11:00:00.000Z", created_at: "2026-10-12T11:00:01Z", path: `${EU}/${ALUNA}/f2.jpg`, reacao_nutri: "bom" }),
    linha("diario_alimentar", { paciente_id: ALUNA, data_hora: "2026-10-10T12:00:00.000Z", created_at: "2026-10-10T12:00:01Z", path: `${EU}/${ALUNA}/f3.jpg`, reacao_nutri: null }),
    linha("diario_alimentar", { paciente_id: ALUNA, data_hora: "2026-10-11T12:00:00.000Z", created_at: "2026-10-11T12:00:01Z", path: `${EU}/${ALUNA}/f4.jpg`, reacao_nutri: null, deleted_at: "2026-10-11T13:00:00Z" }),
    linha("diario_alimentar", { paciente_id: OUTRO_ALUNO, data_hora: "2026-10-12T16:00:00.000Z", created_at: "2026-10-12T16:00:01Z", path: `x/${OUTRO_ALUNO}/f9.jpg`, reacao_nutri: null }),
  ];
  t.formularios_preconsulta = [
    linha("formularios_preconsulta", { titulo: "Pré-anamnese", conta_id: CONTA, nutricionista_id: EU }),
    linha("formularios_preconsulta", { titulo: "Antigo sem conta", conta_id: null, nutricionista_id: EU }),
    linha("formularios_preconsulta", { titulo: "De outra conta", conta_id: OUTRA_CONTA, nutricionista_id: OUTRA_NUTRI }),
  ];
  t.respostas_preconsulta = [
    linha("respostas_preconsulta", { nome: "Nova", conta_id: CONTA, nutricionista_id: EU, paciente_id: null, respondido_em: "2026-10-11T10:00:00Z" }),
    linha("respostas_preconsulta", { nome: "Ligada", conta_id: CONTA, nutricionista_id: EU, paciente_id: ALUNA, respondido_em: "2026-10-12T10:00:00Z" }),
    linha("respostas_preconsulta", { nome: "Velha", conta_id: CONTA, nutricionista_id: EU, paciente_id: null, respondido_em: "2026-09-01T10:00:00Z" }),
    linha("respostas_preconsulta", { nome: "De outra", conta_id: OUTRA_CONTA, nutricionista_id: OUTRA_NUTRI, paciente_id: null, respondido_em: "2026-10-12T11:00:00Z" }),
  ];
  t.profiles = [linha("profiles", { id: EU, nome: "Camila Rocha" })];
  return t;
}

/** O RLS da nutricionista: os alunos dela; os modelos/receitas/grupos dela; a TACO + os alimentos dela; a conta dela no diário/Pré-consulta. */
function visivel(tabela: string, l: Linha): boolean {
  if ([...DO_ALUNO, "refeicoes_concluidas", "metas_concluidas", "diario_alimentar"].includes(tabela)) return l.paciente_id === ALUNA;
  if ([...MODELOS, "receitas"].includes(tabela)) return l.nutricionista_id === EU;
  if (tabela === "alimentos") return l.fonte === "taco" || l.nutricionista_id === EU;
  if (tabela === "pacientes") return l.id === ALUNA;
  if (tabela === "formularios_preconsulta" || tabela === "respostas_preconsulta") return l.conta_id === CONTA || (l.conta_id === null && l.nutricionista_id === EU);
  if (tabela === "profiles") return l.id === EU;
  return true;
}

/** As partes do select no 1º nível (os embutidos com os parênteses deles). */
function partesDoSelect(s: string): string[] {
  const saida: string[] = [];
  let nivel = 0;
  let atual = "";
  for (const ch of s) {
    if (ch === "(") nivel++;
    if (ch === ")") nivel--;
    if (ch === "," && nivel === 0) {
      saida.push(atual.trim());
      atual = "";
    } else atual += ch;
  }
  if (atual.trim()) saida.push(atual.trim());
  return saida;
}
const EMBUTIDO = /^(?:([a-z_]+):)?([a-z_]+)(!inner)?\((.*)\)$/s;
/** Os relacionamentos que o banco falso conhece (pai → filhos por FK, ou filho → pai). */
function relacionados(pai: string, l: Linha, filho: string): Linha[] | Linha | null {
  const vivos = (t: string) => (TABELAS[t] ?? []).filter((x) => visivel(t, x) || t === "pacientes" || t === "medidas_caseiras" || t === "ingredientes_receita");
  if (pai === "alimentos" && filho === "medidas_caseiras") return vivos(filho).filter((m) => m.alimento_id === l.id);
  if (pai === "receitas" && filho === "ingredientes_receita") return vivos(filho).filter((i) => i.receita_id === l.id);
  if (pai === "ingredientes_receita" && filho === "alimentos") return (TABELAS.alimentos ?? []).find((a) => a.id === l.alimento_id) ?? null;
  if (pai === "diario_alimentar" && filho === "pacientes") return (TABELAS.pacientes ?? []).find((p) => p.id === l.paciente_id) ?? null;
  if (pai === "pacientes" && filho === "diario_alimentar") return (TABELAS.diario_alimentar ?? []).filter((d) => d.paciente_id === l.id);
  throw new Error(`relacionamento desconhecido ${pai} → ${filho}`);
}
/** O .or() do recorte (as 2 formas que o servidor monta) sobre uma linha. */
function casaOu(filtro: string, l: Linha | null): boolean {
  if (!l) return false;
  const conta = /^conta_id\.eq\.([^,]+),and\(conta_id\.is\.null,nutricionista_id\.eq\.([^)]+)\)$/.exec(filtro);
  if (conta) return l.conta_id === conta[1] || (l.conta_id === null && l.nutricionista_id === conta[2]);
  const taco = /^fonte\.eq\.taco,nutricionista_id\.eq\.(.+)$/.exec(filtro);
  if (taco) return l.fonte === "taco" || l.nutricionista_id === taco[1];
  throw new Error(`.or() desconhecido ${filtro}`);
}
const comoLike = (padrao: string) => new RegExp(`^${padrao.replace(/\\([\\%_])|([%_])|([.*+?^${}()|[\]])/g, (_m, esc, cur, re) => (esc ? `\\${esc}` : cur === "%" ? ".*" : cur === "_" ? "." : `\\${re}`))}$`, "i");
type Ida = { tabela: string; colunas: string; opcoes: { count?: string; head?: boolean } | null; passos: Array<[string, ...unknown[]]> };
const idas: Ida[] = [];
const rpcs: Array<{ nome: string; args: Record<string, unknown> }> = [];

/** Projeta a linha pelas partes do select (os embutidos pelos relacionamentos, com os filtros e o limite deles). */
function projetar(tabela: string, l: Linha, partes: string[], q: Ida, caminho = ""): Linha | null {
  const saida: Linha = {};
  for (const p of partes) {
    const e = EMBUTIDO.exec(p);
    if (!e) {
      saida[p] = l[p];
      continue;
    }
    const [, apelido, filho, interno, dentro] = e;
    const chave = apelido ?? filho;
    const aqui = caminho ? `${caminho}.${chave}` : chave;
    let valor = relacionados(tabela, l, filho);
    if (Array.isArray(valor)) {
      for (const [op, c, v] of q.passos) {
        if (typeof c !== "string" || !c.startsWith(`${aqui}.`)) continue;
        const col = c.slice(aqui.length + 1);
        if (op === "is") valor = valor.filter((x) => x[col] === v);
        if (op === "gte") valor = valor.filter((x) => String(x[col]) >= String(v));
      }
      const lim = q.passos.find(([op, , o]) => op === "limit" && (o as { referencedTable?: string } | undefined)?.referencedTable === aqui);
      if (lim) valor = valor.slice(0, lim[1] as number);
      if (interno && !valor.length) return null;
      saida[chave] = valor.map((x) => projetar(filho, x, partesDoSelect(dentro), q, aqui));
    } else {
      // o .or() do recorte no embutido (referencedTable)
      for (const [op, f, o] of q.passos) if (op === "or" && (o as { referencedTable?: string } | undefined)?.referencedTable === aqui && !casaOu(f as string, valor)) valor = null;
      if (interno && !valor) return null;
      saida[chave] = valor ? projetar(filho, valor, partesDoSelect(dentro), q, aqui) : null;
    }
  }
  return saida;
}

/** O que o PostgREST faz com a ida: RLS → filtros → embutidos → ordem → página/limite → as colunas pedidas. */
function executar(q: Ida): { data: Linha[] | null; error: null; count: number | null } {
  let linhas = (TABELAS[q.tabela] ?? []).filter((l) => visivel(q.tabela, l));
  for (const [op, c, v, o] of q.passos) {
    // o .or() do 1º nível (sem o referencedTable — o texto dele tem pontos); o do embutido é do projetar
    if (op === "or") {
      if (!(v as { referencedTable?: string } | undefined)?.referencedTable) linhas = linhas.filter((l) => casaOu(c as string, l));
      continue;
    }
    if (typeof c !== "string" || c.includes(".") || (o as { referencedTable?: string } | undefined)?.referencedTable) continue;
    if (op === "eq") linhas = linhas.filter((l) => l[c] === v);
    else if (op === "in") linhas = linhas.filter((l) => (v as unknown[]).includes(l[c]));
    else if (op === "is") linhas = linhas.filter((l) => l[c] === v);
    else if (op === "gte") linhas = linhas.filter((l) => String(l[c]) >= String(v));
    else if (op === "lte") linhas = linhas.filter((l) => String(l[c]) <= String(v));
    else if (op === "lt") linhas = linhas.filter((l) => String(l[c]) < String(v));
    else if (op === "ilike") linhas = linhas.filter((l) => comoLike(v as string).test(String(l[c])));
  }
  const partes = partesDoSelect(q.colunas);
  let projetadas = linhas.map((l) => ({ l, p: projetar(q.tabela, l, partes, q) })).filter((x) => x.p !== null);
  const total = projetadas.length;
  const ordem = q.passos.filter(([op]) => op === "order") as Array<[string, string, { ascending: boolean }]>;
  projetadas = [...projetadas].sort((a, b) => {
    for (const [, c, o] of ordem) {
      const x = String(a.l[c] ?? ""), y = String(b.l[c] ?? "");
      if (x !== y) return (x < y ? -1 : 1) * (o.ascending ? 1 : -1);
    }
    return 0;
  });
  const range = q.passos.find(([op]) => op === "range");
  const limite = q.passos.find(([op, , o]) => op === "limit" && o === undefined);
  if (range) projetadas = projetadas.slice(range[1] as number, (range[2] as number) + 1);
  else if (limite) projetadas = projetadas.slice(0, limite[1] as number);
  if (q.opcoes?.head) return { data: null, error: null, count: total };
  return { data: projetadas.map((x) => x.p as Linha), error: null, count: q.opcoes?.count === "exact" ? total : null };
}

/** O Storage: a URL assinada com o domínio de quem chama (o do servidor = o <ref>.supabase.co). */
const assinada = (dominio: string, bucket: string, caminho: string, validade: number) => `${dominio}/storage/v1/object/sign/${bucket}/${caminho}?token=tk-${validade}`;

const RPCS: Record<string, (args: Record<string, unknown>) => { data: unknown; error: unknown }> = {
  planos_do_aluno: (a) => ({ data: a.p_aluno === ALUNA ? [{ id: "p1", titulo: "Plano", refeicoes: [{ id: "r2", ordem: 1, itens: [] }, { id: "r1", ordem: 0, itens: [] }] }] : [], error: null }),
  plano_alimentar: (a) => ({ data: a.p_plano === "p1" ? { id: "p1", titulo: "Plano", refeicoes: [] } : null, error: null }),
  planos_favoritos: () => ({
    data: [
      { id: "f1", nutricionista_id: EU, titulo: "★ meu", refeicoes: [], paciente: { id: ALUNA, nome: "Ana", conta_id: CONTA } },
      { id: "f2", nutricionista_id: OUTRA_NUTRI, titulo: "★ da colega", refeicoes: [], paciente: { id: ALUNA, nome: "Ana", conta_id: CONTA } },
      { id: "f3", nutricionista_id: EU, titulo: "★ meu de outra conta", refeicoes: [], paciente: { id: "x", nome: "X", conta_id: OUTRA_CONTA } },
    ],
    error: null,
  }),
  grupos_alimentos: () => ({ data: [{ grupo: "Cereais", total: "3" }, { grupo: "Leguminosas", total: 1 }], error: null }),
  receitas_da_nutricionista: () => ({
    data: { ok: true, ids: [TABELAS.receitas[1].id, TABELAS.receitas[0].id], total: 2, total_geral: 2, favoritas: 1, por_grupo: { g1: 1 } }, error: null,
  }),
  preconsulta_numeros: () => ({ data: { ok: true, total: 3, novas: 2, ligadas: 1, importadas: 0, mes: 2, semanas: [0, 0, 0, 0, 0, 0, 1, 1], por_formulario: {} }, error: null }),
  respostas_da_conta: () => ({ data: { ok: true, total: 1, total_conta: 3, novas: 2, titulos: ["Pré-anamnese"], aluno: null, itens: [{ id: "r1", nome: "Nova" }] }, error: null }),
  painel_resumo: (a) => ({ data: a.p_conta === CONTA ? { ok: true, hoje: "2026-10-12", alunos: [{ id: ALUNA, modulos: ["nutricao", "x"] }], conta: { modulos: ["nutricao"] }, eu: { id: EU } } : { ok: false, erro: "sem_acesso" }, error: null }),
};

const h = vi.hoisted(() => ({ invoke: vi.fn(), corpos: [] as Array<Record<string, unknown>> }));
vi.mock("@/integrations/principal/client", () => ({
  PRINCIPAL_SCHEMA: "staging",
  PRINCIPAL_URL: "https://principal.teste.invalid",
  principalConfigurado: true,
  principal: {
    functions: { invoke: (f: string, o: { body: Record<string, unknown> }) => h.invoke(f, o) },
    from: (t: string) => {
      throw new Error(`leitura direta na tabela ${t}`);
    },
    rpc: (f: string) => {
      throw new Error(`RPC direta ${f}`);
    },
    storage: {
      from: () => {
        throw new Error("Storage direto");
      },
    },
  },
}));
vi.mock("@/treino/editor/api", () => ({
  invocar: async () => {
    throw new Error("o Treino não entra nas leituras do principal");
  },
}));

/** O cliente "como a nutricionista" do servidor (o módulo chama este no lugar do supabase-js). */
function comoANutri(): ContextoLeitura["comoPessoa"] {
  return {
    rpc: async (nome: string, args: Record<string, unknown>) => {
      rpcs.push({ nome, args });
      return RPCS[nome](args);
    },
    from: (tabela: string) => ({
      select: (colunas: string, opcoes?: { count?: string; head?: boolean }) => {
        const q: Ida = { tabela, colunas, opcoes: opcoes ?? null, passos: [] };
        idas.push(q);
        const b: Record<string, unknown> = {};
        for (const op of ["eq", "in", "is", "gte", "lte", "lt", "ilike", "or", "order", "limit", "range"]) b[op] = (...a: unknown[]) => (q.passos.push([op, ...a]), b);
        b.then = (ok: (r: unknown) => unknown, falhou?: (e: unknown) => unknown) => Promise.resolve(executar(q)).then(ok, falhou);
        return b;
      },
    }),
    storage: {
      from: (bucket: string) => ({
        createSignedUrls: async (caminhos: string[], validade: number) => ({
          data: caminhos.map((p) => ({ path: p, error: null, signedUrl: assinada("https://hkxv.supabase.co", bucket, p, validade) })), error: null,
        }),
      }),
    },
  } as unknown as ContextoLeitura["comoPessoa"];
}

beforeEach(() => {
  TABELAS = montarTabelas();
  idas.length = 0;
  rpcs.length = 0;
  h.corpos = [];
  h.invoke.mockReset();
  h.invoke.mockImplementation(async (funcao: string, o: { body: Record<string, unknown> }) => {
    expect(funcao).toBe("nutricao");
    const corpo = JSON.parse(JSON.stringify(o.body)) as Record<string, unknown>;
    h.corpos.push(corpo);
    const log = { info: () => undefined, aviso: () => undefined, erro: () => undefined, excecao: () => undefined };
    const r = await atenderLeitura({ schema: "staging", corpo, userId: EU, comoPessoa: comoANutri(), log });
    return { data: JSON.parse(JSON.stringify(r)), error: null };
  });
});

import * as acompanhamento from "./acompanhamento";
import * as alimentos from "./alimentos";
import * as calculos from "./calculosEnergeticos";
import * as concluidas from "./concluidas";
import * as manipulados from "./manipulados";
import * as metas from "./metas";
import * as metasConcluidas from "./metasConcluidas";
import * as orientacoes from "./orientacoes";
import * as planos from "./planos";
import * as receitas from "./receitas";
import * as suplementos from "./suplementos";
import { chavePlanos, planoDaLista } from "./consultas";
import * as alimentosPainel from "@/painel/dietas/alimentosPainel";
import * as diario from "@/painel/dietas/diario";
import * as preconsulta from "@/painel/preconsulta/dados";
import { contarRespostasNovas } from "@/painel/preconsulta/novas";
import { buscarResumoPrincipal, listarRespostasRecentes } from "@/painel/dashboard/dados";
import { FILTROS_VAZIOS } from "@/painel/preconsulta/respostasUtil";

/** Cada corpo que a tela mandou passa nos leitores REAIS do servidor (a q do catálogo, os params na forma). */
function corposAceitos(): Array<{ q: string; params: Record<string, unknown> }> {
  return h.corpos.flatMap((corpo) => {
    expect(corpo.acao).toBe("ler");
    const r = lerPedidoDeLeitura(corpo, CONSULTAS_NUTRICAO);
    if (r.ok === false) throw new Error(`o servidor recusaria o pedido: ${r.erro}`);
    return r.itens.map((i) => {
      if (i.ok === false) throw new Error(`o servidor recusaria o item ${i.q}: ${i.erro} ${i.campo ?? ""}`);
      return { q: i.q, params: i.params };
    });
  });
}

/** O que o select("*") de HOJE devolvia (a lib lia direto, com o RLS da nutri): as linhas completas, na ordem da lib. */
function deHoje(tabela: string, filtro: (l: Linha) => boolean, ordem: Array<[string, boolean]>): Linha[] {
  return (TABELAS[tabela] ?? []).filter((l) => visivel(tabela, l) && filtro(l)).sort((a, b) => {
    for (const [c, asc] of ordem) {
      const x = String(a[c] ?? ""), y = String(b[c] ?? "");
      if (x !== y) return (x < y ? -1 : 1) * (asc ? 1 : -1);
    }
    return 0;
  });
}
const vivo = (l: Linha) => l.deleted_at === null;
const daAluna = (l: Linha) => l.paciente_id === ALUNA && vivo(l);

describe("hml-20c — a Dieta do aluno: as MESMAS linhas de hoje, pelo servidor, como a nutricionista", () => {
  it.each([
    ["calculos.listarCalculos", () => calculos.listarCalculos(ALUNA), "calculos_energeticos", [["data", false], ["created_at", false]]],
    ["metas.listarMetasDoPaciente", () => metas.listarMetasDoPaciente(ALUNA), "metas", [["created_at", false]]],
    ["orientacoes.listarOrientacoes", () => orientacoes.listarOrientacoes(ALUNA), "orientacoes", [["created_at", false]]],
    ["manipulados.listarFormulasDoPaciente", () => manipulados.listarFormulasDoPaciente(ALUNA), "formulas_manipuladas", [["prescrita_em", false], ["created_at", false]]],
    ["suplementos.listarIndicacoesDoPaciente", () => suplementos.listarIndicacoesDoPaciente(ALUNA), "indicacoes_produto", [["ativa", false], ["ordem", true], ["created_at", true]]],
  ] as const)("%s: as colunas do tipo, só as vivas da aluna (a de outra conta o RLS esconde), na ordem da lib", async (_n, ler, tabela, ordem) => {
    const r = await ler();
    expect(r).toEqual(deHoje(tabela, daAluna, ordem as unknown as Array<[string, boolean]>));
    expect(Object.keys((r as Linha[])[0]).sort()).toEqual(colunasDoTipo(tabela).sort());
    expect(h.invoke).toHaveBeenCalledTimes(1);
    expect(corposAceitos()).toHaveLength(1);
  });

  it("os registros do período (as 2 pontas valem) e o HEAD do dia; os ✓ das refeições e das metas entre 2 dias (as 2 colunas de hoje, a data AAAA-MM-DD)", async () => {
    TABELAS.registros_diarios[0].data = "2026-10-01";
    TABELAS.registros_diarios[1].data = "2026-10-05";
    expect(await acompanhamento.listarRegistrosDoPaciente(ALUNA, "2026-10-01", "2026-10-04")).toEqual([TABELAS.registros_diarios[0]]);
    expect(await acompanhamento.contarRegistrosDoDia(ALUNA, "2026-10-05")).toBe(1);
    expect(await acompanhamento.contarRegistrosDoDia(ALUNA, "2026-10-03")).toBe(0); // o da Lixeira não conta
    expect(await concluidas.listarConcluidas(ALUNA, "2026-10-01", "2026-10-07")).toEqual([{ refeicao_id: "r2", data: "2026-10-02" }, { refeicao_id: "r1", data: "2026-10-06" }]);
    expect(await metasConcluidas.listarMetasConcluidas(ALUNA, "2026-10-01", "2026-10-04")).toEqual([{ meta_id: "m1", data: "2026-10-01" }, { meta_id: "m1", data: "2026-10-04" }]);
    expect(await concluidas.listarConcluidas(OUTRO_ALUNO, "2026-10-01", "2026-10-07")).toEqual([]); // N1: outra conta → vazio
    corposAceitos();
  });

  it("os modelos e o catálogo: o RLS decide (os meus; a lib não filtrava por dono), as vivas, favoritos primeiro e depois o nome", async () => {
    for (const [ler, tabela, ordem] of [
      [metas.listarModelosMeta, "modelos_meta", "titulo"], [orientacoes.listarModelos, "modelos_orientacao", "titulo"],
      [manipulados.listarModelosFormula, "modelos_formula", "titulo"], [suplementos.listarProdutos, "produtos", "nome"],
    ] as const) {
      expect(await ler(), tabela).toEqual(deHoje(tabela, vivo, [["favorito", false], [ordem, true]]));
    }
    expect(corposAceitos().map((c) => c.params)).toEqual([{}, {}, {}, {}]);
  });

  it("o nome da nutricionista das seções (orientações, metas, manipulados): a fonte única — o profiles de QUEM CHAMA, no lote da tela", async () => {
    const [a, b, c] = await Promise.all([orientacoes.nomeDaNutricionista(EU), metas.nomeDaNutricionista(EU), manipulados.nomeDaNutricionista(EU)]);
    expect([a, b, c]).toEqual(["Camila Rocha", "Camila Rocha", "Camila Rocha"]);
    expect(h.invoke).toHaveBeenCalledTimes(1); // os 3 na mesma volta = 1 chamada, 1 item (iguais rodam 1 vez)
    expect(corposAceitos().map((x) => x.q)).toEqual(["profissional", "profissional", "profissional"]);
  });

  it("a SEÇÃO numa ida: o Acompanhamento (os planos, as antropometrias, os cálculos, os registros e os ✓) = 1 chamada com os 5 itens", async () => {
    await Promise.all([
      acompanhamento.listarPlanos(ALUNA), acompanhamento.listarAntropometrias(ALUNA), acompanhamento.listarCalculos(ALUNA),
      acompanhamento.listarRegistrosDoPaciente(ALUNA, "2026-09-12", "2026-10-12"), concluidas.listarConcluidas(ALUNA, "2026-10-06", "2026-10-12"),
    ]);
    expect(h.invoke).toHaveBeenCalledTimes(1);
    expect(corposAceitos().map((c) => c.q)).toEqual(["planos_do_aluno", "antropometrias_do_aluno", "calculos_do_aluno", "registros_diarios", "refeicoes_concluidas"]);
  });
});

describe("hml-20c — o Plano: as RPCs da hml-17 pelo servidor e o editor SEM a 2ª ida em série (o plano que a lista já trouxe)", () => {
  it("listarPlanos/buscarPlano: os args de hoje; o plano montado (as refeições na ordem) e null quando não existe", async () => {
    const [p] = await planos.listarPlanos(ALUNA);
    expect(p.refeicoes.map((r) => r.id)).toEqual(["r1", "r2"]);
    expect(await planos.buscarPlano("00000000-0000-4000-8000-0000000000aa")).toBeNull();
    expect(rpcs).toEqual([{ nome: "planos_do_aluno", args: { p_aluno: ALUNA } }, { nome: "plano_alimentar", args: { p_plano: "00000000-0000-4000-8000-0000000000aa" } }]);
    expect(await planos.listarPlanos(OUTRO_ALUNO)).toEqual([]);
  });

  it("série = 1 ida: o usePlano começa com o plano da lista dos planos do aluno no cache (a idade da lista); sem a lista, null (a ida de sempre)", async () => {
    const qc = new QueryClient();
    expect(planoDaLista(qc, "p1")).toBeNull();
    const lista = await planos.listarPlanos(ALUNA);
    qc.setQueryData(chavePlanos(ALUNA), lista);
    const achado = planoDaLista(qc, "p1");
    expect(achado?.plano).toBe(lista[0]);
    expect(achado?.em).toBe(qc.getQueryState(chavePlanos(ALUNA))?.dataUpdatedAt);
    expect(planoDaLista(qc, "outro")).toBeNull();
    expect(planoDaLista(qc, null)).toBeNull();
    // o JSON da lista é o MESMO da plano_alimentar (as 2 RPCs montam pelo plano_alimentar_json — migração hml-17)
    const sql = readFileSync(resolve(RAIZ, "supabase-principal/migrations/20261010100000_hml17_planos_do_aluno.sql"), "utf-8");
    expect(sql).toMatch(/jsonb_agg\(\{schema\}\.plano_alimentar_json\(pl\.id\) order by pl\.created_at desc/);
    expect(sql).toMatch(/return \{schema\}\.plano_alimentar_json\(p_plano\);/);
  });

  it("H-108: listarPlanosFavoritos() = o de hoje (todos que a pessoa vê); com a conta, só os de QUEM CHAMA e daquela conta (o filtro é do servidor)", async () => {
    expect((await planos.listarPlanosFavoritos()).map((p) => p.id)).toEqual(["f1", "f2", "f3"]);
    expect((await planos.listarPlanosFavoritos({ conta: CONTA })).map((p) => p.id)).toEqual(["f1"]);
    // o contexto do React Query (o Planejamento passa a função direto no queryFn) não é uma conta: o de hoje
    expect((await planos.listarPlanosFavoritos({ signal: new AbortController().signal } as object)).map((p) => p.id)).toEqual(["f1", "f2", "f3"]);
    const corpos = corposAceitos();
    expect(corpos.map((c) => c.params)).toEqual([{}, { conta: CONTA }, {}]);
    expect(h.invoke).toHaveBeenCalledTimes(3); // num lote só dele (sozinha), cada um
  });
});

describe("hml-20c — as Dietas: Alimentos, Receitas e Diário pelo servidor (as mesmas linhas, os mesmos números, as séries numa ida)", () => {
  it("a busca do editor: cada palavra (sem acento) é um ilike na busca, a faixa e o total; o alimento com as medidas ordenadas — as colunas do tipo", async () => {
    const r = await alimentos.listarAlimentos({ q: "ARROZ", grupo: "Cereais", fonte: "" }, 0, 12);
    expect(r.total).toBe(2); // a TACO e o meu (o de outra nutri o RLS esconde; o da Lixeira não)
    expect(r.itens.map((a) => a.nome)).toEqual(["Arroz da casa", "Arroz integral cozido"]);
    const taco = r.itens[1];
    expect(Object.keys(taco).sort()).toEqual([...colunasDoTipo("alimentos"), "medidas_caseiras"].sort());
    expect(taco.medidas_caseiras.map((m) => m.descricao)).toEqual(["xícara", "colher"]);
    expect(Object.keys(taco.medidas_caseiras[0]).sort()).toEqual(colunasDoTipo("medidas_caseiras").sort());
    expect(corposAceitos()[0].params).toEqual({ palavras: ["arroz"], grupo: "Cereais", offset: 0, limite: 12 });
  });

  it("a lista do painel: a TACO ou os MEUS (o id do token), o desempate pelo id; os grupos (a RPC, o total em número)", async () => {
    const r = await alimentosPainel.listarAlimentosDoPainel({ q: "", grupo: "", fonte: "" }, EU, 0, 20);
    expect(r.itens.map((a) => a.nome)).toEqual(["Arroz da casa", "Arroz integral cozido", "Feijão"]);
    expect(corposAceitos()[0].params).toMatchObject({ meus: true, offset: 0, limite: 20 });
    expect(await alimentos.listarGrupos()).toEqual([{ grupo: "Cereais", total: 3 }, { grupo: "Leguminosas", total: 1 }]);
  });

  it("a página de receitas: a RPC e as receitas da página pelos ids NA MESMA IDA (1 chamada, 1 item), na ORDEM do banco, com os ingredientes", async () => {
    const p = await receitas.listarReceitasPagina({ q: "Pão", grupo: "", favoritas: true }, 1);
    expect(h.invoke).toHaveBeenCalledTimes(1);
    expect(corposAceitos()).toEqual([{ q: "receitas_pagina", params: { filtros: { q: "pao", favoritas: "true" }, offset: 0, limite: 20 } }]);
    expect(rpcs).toEqual([{ nome: "receitas_da_nutricionista", args: { p_filtros: { q: "pao", favoritas: "true" }, p_offset: 0, p_limite: 20 } }]);
    expect(p.itens.map((r) => r.nome)).toEqual(["Atum ao forno", "Bolo 50% (cópia)"]);
    expect(p.itens[0].ingredientes[0].alimento?.medidas_caseiras.map((m) => m.ordem)).toEqual([0, 1]);
    expect(p).toMatchObject({ total: 2, totalGeral: 2, favoritas: 1, porGrupo: { g1: 1 } });
  });

  it("todas as receitas (o 'Da receita' do plano), os nomes para a cópia (os meus, o LIKE escapado) e os grupos (os meus, com o uid)", async () => {
    expect((await receitas.listarReceitas()).map((r) => r.nome).sort()).toEqual(["Atum ao forno", "Bolo 50% (cópia)"]);
    expect(await receitas.nomesParaCopia(EU, "Bolo 50% (cópia 2)")).toEqual(["Bolo 50% (cópia)"]);
    expect(await receitas.nomesParaCopia(EU, "Bolo _ x")).toEqual([]);
    expect((await receitas.listarGrupos(EU)).map((g) => g.nome)).toEqual(["A meu", "B meu"]);
    corposAceitos();
  });

  it("o Diário: a página com o total de cada dia que ela partiu NA MESMA IDA (os inícios de dia locais vão no corpo); a contagem; as opções do filtro; a janela de hoje", async () => {
    const deIso = new Date(2026, 9, 6).toISOString();
    const p = await diario.listarDiarioPaginaComDias(CONTA, EU, { deIso, alunoId: "", soNaoReagidas: false }, 1);
    expect(h.invoke).toHaveBeenCalledTimes(1);
    expect(p.total).toBe(3); // a aluna (as 3 vivas); a de outra conta não; a da Lixeira não
    expect(p.itens.map((r) => r.path)).toEqual([`${EU}/${ALUNA}/f1.jpg`, `${EU}/${ALUNA}/f2.jpg`, `${EU}/${ALUNA}/f3.jpg`]);
    expect(p.itens[0].paciente).toEqual({ id: ALUNA, nome: "Ana W5P", apelido: null, link_codigo: "ana1", foto_url: null, conta_id: CONTA, nutricionista_id: EU });
    expect(Object.keys(p.itens[0]).sort()).toEqual([...colunasDoTipo("diario_alimentar"), "paciente"].sort());
    expect(p.porDia).toEqual({}); // a página 1 coube inteira
    expect(await diario.contarDiario(CONTA, EU, { deIso, alunoId: "", soNaoReagidas: true })).toBe(2);
    expect(await diario.contarDiario(CONTA, EU, { deIso, alunoId: OUTRO_ALUNO, soNaoReagidas: false })).toBe(0);
    expect(await diario.listarAlunosDoDiario(CONTA, EU, deIso)).toEqual([{ id: ALUNA, nome: "Ana W5P", apelido: null, link_codigo: "ana1", foto_url: null }]);
    expect((await diario.listarDiarioDaConta(CONTA, EU, new Date(2026, 9, 12).toISOString())).length).toBeGreaterThanOrEqual(1);
    const [pagina] = corposAceitos();
    expect(pagina.q).toBe("diario_pagina");
    expect((pagina.params.dias as string[])[0]).toBe(deIso);
    // N1: a conta de outra pessoa → o recorte não acha nada da aluna
    expect((await diario.listarDiarioPaginaComDias(OUTRA_CONTA, EU, { deIso, alunoId: "", soNaoReagidas: false }, 1)).itens).toEqual([]);
  });

  it("as fotos: as miniaturas em lote (só os ids vão; o servidor relê o caminho e assina, 1 h) e a foto grande (300 s) — a URL com o domínio do cliente", async () => {
    const [f1, f2] = TABELAS.diario_alimentar;
    const urls = await diario.urlsAssinadas([{ id: f1.id as string, path: "caminho/que/a/tela/tinha.jpg" }, { id: f2.id as string, path: f2.path as string }, { id: "sem-path", path: "" }]);
    expect(urls).toEqual({
      [f1.id as string]: `${BASE}/storage/v1/object/sign/diario-staging/${EU}/${ALUNA}/f1.jpg?token=tk-3600`,
      [f2.id as string]: `${BASE}/storage/v1/object/sign/diario-staging/${EU}/${ALUNA}/f2.jpg?token=tk-3600`,
    });
    expect(await diario.urlAssinada(f1 as never, 300)).toBe(`${BASE}/storage/v1/object/sign/diario-staging/${EU}/${ALUNA}/f1.jpg?token=tk-300`);
    // a foto de outra conta: o RLS não devolve a linha → nada assinado
    const outra = TABELAS.diario_alimentar[4];
    expect(await diario.urlsAssinadas([{ id: outra.id as string, path: outra.path as string }])).toEqual({});
    // (a foto grande que o RLS não devolve — outra conta ou já excluída — chega como o código, com a frase fixa dele: decisão 20)
    await expect(diario.urlAssinada(outra as never)).rejects.toMatchObject({ codigo: "nao_encontrado" });
    expect(corposAceitos().map((c) => c.q)).toEqual(["diario_urls", "diario_foto_url", "diario_urls", "diario_foto_url"]);
  });
});

describe("hml-20c — a Pré-consulta e o Dashboard de saúde pelo servidor", () => {
  it("os formulários do recorte da conta (os da conta + os meus sem conta), por título; as respostas e os números pelas RPCs com os args de hoje", async () => {
    expect((await preconsulta.listarFormularios(CONTA, EU)).map((f) => f.titulo)).toEqual(["Antigo sem conta", "Pré-anamnese"]);
    const pag = await preconsulta.listarRespostasPagina(CONTA, { ...FILTROS_VAZIOS, busca: "zé", soNovas: true }, 2);
    expect(pag).toMatchObject({ total: 1, totalConta: 3, novas: 2 });
    const n = await preconsulta.buscarNumerosPreConsulta(CONTA, new Date(2026, 9, 1));
    expect(n).toMatchObject({ total: 3, novas: 2 });
    expect(rpcs).toEqual([
      { nome: "respostas_da_conta", args: { p_conta: CONTA, p_filtros: { q: "zé", novas: "true" }, p_offset: 20, p_limite: 20 } },
      { nome: "preconsulta_numeros", args: { p_conta: CONTA, p_inicio_mes: new Date(2026, 9, 1).toISOString() } },
    ]);
    corposAceitos();
  });

  it("o contador do menu (respostas novas: vivas, sem aluno, do recorte — HEAD) e a Atividade recente (as 4 colunas, desde o instante, as 10 mais novas)", async () => {
    expect(await contarRespostasNovas(CONTA, EU)).toBe(2);
    expect(await contarRespostasNovas(OUTRA_CONTA, EU)).toBe(0);
    const rec = await listarRespostasRecentes(CONTA, EU, "2026-10-06T03:00:00.000Z");
    expect(rec.map((r) => r.nome)).toEqual(["Ligada", "Nova"]);
    expect(Object.keys(rec[0]).sort()).toEqual(["id", "nome", "paciente_id", "respondido_em"]);
    corposAceitos();
  });

  it("o painel_resumo pela nutricao (o mesmo normalizado); o erro → ErroDashboard('erro_interno') como antes", async () => {
    const r = await buscarResumoPrincipal(CONTA);
    expect(r.alunos[0].modulos).toEqual(["nutricao"]);
    expect(rpcs).toEqual([{ nome: "painel_resumo", args: { p_conta: CONTA } }]);
    await expect(buscarResumoPrincipal(OUTRA_CONTA)).rejects.toMatchObject({ codigo: "sem_acesso" });
    h.invoke.mockResolvedValueOnce({ data: null, error: { name: "FunctionsFetchError", context: new Error("rede") } });
    await expect(buscarResumoPrincipal(CONTA)).rejects.toMatchObject({ codigo: "erro_interno" });
  });
});
