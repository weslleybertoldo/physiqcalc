// Physiq hml-20b (H-42 · jeito 2, etapa 2) — o CONTRATO tela × servidor das LEITURAS do Painel › Aluno (casca, Resumo, Prontuário ×10,
// Avaliação e PDF): cada função de leitura das libs manda à nutricao um corpo que PASSA nos leitores REAIS do servidor (o motor e o
// catálogo), o pedido roda no MÓDULO DE VERDADE (functions/nutricao/leituras.ts) sobre um banco falso que faz o PostgREST, o Storage e o
// RLS da nutricionista (só os alunos que ela vê), e o que volta pela "rede" (JSON) chega à tela no MESMO tipo e com os MESMOS valores de
// hoje: as linhas que o select("*") de antes devolvia (as colunas do tipo gerado), na ordem da lib, as mesmas URLs assinadas (agora
// assinadas no servidor e montadas com o domínio do cliente) e os mesmos erros. E a tela pede numa ida só: a seção = 1 chamada.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { lerPedidoDeLeitura } from "../../../supabase-principal/functions/_shared/leitura-lote";
import { CONSULTAS_NUTRICAO } from "../../../supabase-principal/functions/_shared/nutricao-leituras";
import { atenderLeitura, type ContextoLeitura } from "../../../supabase-principal/functions/nutricao/leituras";

const RAIZ = resolve(__dirname, "../../..");
const EU = "c3c3c3c3-0000-4000-8000-000000000003"; // a nutricionista logada
const ALUNA = "a1a1a1a1-0000-4000-8000-000000000001"; // a matrícula que ela vê (pacientes.id)
const ROTA = "a1a1a1a1-0000-4000-8000-0000000000ff"; // o id da rota (o do Treino) — as RPCs da casca acham a matrícula por ele
const OUTRA = "b2b2b2b2-0000-4000-8000-000000000002"; // a matrícula de OUTRA conta (o RLS esconde)
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
const PACIENTE_TABELAS = [
  "consultas", "anamneses", "respostas_questionario", "pedidos_exame", "resultados_exame", "avaliacoes_integradas", "gestacoes", "registros_gestacionais",
  "medicamentos_paciente", "analises_farmaco", "documentos", "anexos", "antropometrias",
];
const CATALOGOS = ["modelos_anamnese", "questionarios", "exames_catalogo", "interacoes_farmaco_nutriente", "modelos_documento"];

function montarTabelas(): Record<string, Linha[]> {
  const t: Record<string, Linha[]> = {};
  for (const tabela of PACIENTE_TABELAS) {
    t[tabela] = [
      linha(tabela, { paciente_id: ALUNA, data: "2026-10-01", created_at: "2026-10-01T10:00:00Z", ativo: true, exame: "TSH" }),
      linha(tabela, { paciente_id: ALUNA, data: "2026-10-05", created_at: "2026-10-05T10:00:00Z", ativo: false, exame: "HDL" }),
      linha(tabela, { paciente_id: ALUNA, data: "2026-10-03", created_at: "2026-10-03T10:00:00Z", ativo: true, exame: "Ferritina", deleted_at: "2026-10-06T00:00:00Z" }), // na Lixeira
      linha(tabela, { paciente_id: OUTRA, data: "2026-10-04", created_at: "2026-10-04T10:00:00Z", ativo: true, exame: "TSH" }), // de outra conta
    ].map((l) => Object.fromEntries(Object.entries(l).filter(([k]) => colunasDoTipo(tabela).includes(k))));
  }
  for (const tabela of CATALOGOS) {
    t[tabela] = [
      linha(tabela, { nutricionista_id: null, titulo: "B do sistema", nome: "B do sistema", medicamento: "B", nutriente: "x", favorito: false }),
      linha(tabela, { nutricionista_id: EU, titulo: "A minha", nome: "A minha", medicamento: "A", nutriente: "y", favorito: true }),
      linha(tabela, { nutricionista_id: EU, titulo: "C na Lixeira", nome: "C", medicamento: "C", nutriente: "z", favorito: true, deleted_at: "2026-10-06T00:00:00Z" }),
      linha(tabela, { nutricionista_id: OUTRA, titulo: "De outra", nome: "De outra", medicamento: "D", nutriente: "w", favorito: true }), // o RLS esconde
    ].map((l) => Object.fromEntries(Object.entries(l).filter(([k]) => colunasDoTipo(tabela).includes(k))));
  }
  t.profiles = [
    linha("profiles", { id: EU, nome: "Camila Rocha", dados_profissionais: { crn: "CRN-3 123", telefone: " ", endereco: "Rua A" } }),
    linha("profiles", { id: OUTRA, nome: "Outra Pessoa", dados_profissionais: { crn: "X" } }),
  ];
  // o anexo da aluna com um nome de arquivo de verdade
  t.anexos[0] = { ...t.anexos[0], path: `${EU}/${ALUNA}/f1-Laudo final.pdf`, nome: "Laudo final.pdf" };
  return t;
}
let TABELAS = montarTabelas();

/** O RLS da nutricionista: as linhas dos alunos que ela vê; os catálogos do sistema + os dela; o próprio profiles. */
function visivel(tabela: string, l: Linha): boolean {
  if (tabela === "profiles") return l.id === EU;
  if (CATALOGOS.includes(tabela)) return l.nutricionista_id === null || l.nutricionista_id === EU;
  return l.paciente_id === ALUNA;
}
type Ida = { tabela: string; colunas: string; contar: boolean; filtros: Array<[string, string, unknown]>; ordem: Array<[string, boolean]>; limite: number | null; range: [number, number] | null };
const idas: Ida[] = [];
const rpcs: Array<{ nome: string; args: Record<string, unknown> }> = [];

/** O que o PostgREST faz com a ida: RLS → filtros → ordem → página/limite → as colunas pedidas ("*" = todas). */
function executar(q: Ida): { data: Linha[]; error: null; count: number | null } {
  let linhas = (TABELAS[q.tabela] ?? []).filter((l) => visivel(q.tabela, l));
  for (const [op, c, v] of q.filtros) {
    if (op === "eq") linhas = linhas.filter((l) => l[c] === v);
    else if (op === "in") linhas = linhas.filter((l) => (v as unknown[]).includes(l[c]));
    else if (op === "is") linhas = linhas.filter((l) => l[c] === v);
  }
  const total = linhas.length;
  linhas = [...linhas].sort((a, b) => {
    for (const [c, asc] of q.ordem) {
      const x = String(a[c] ?? ""), y = String(b[c] ?? "");
      if (x !== y) return (x < y ? -1 : 1) * (asc ? 1 : -1);
    }
    return 0;
  });
  if (q.range) linhas = linhas.slice(q.range[0], q.range[1] + 1);
  else if (q.limite !== null) linhas = linhas.slice(0, q.limite);
  const cols = q.colunas === "*" ? null : q.colunas.split(",").map((c) => c.trim());
  return { data: linhas.map((l) => (cols ? Object.fromEntries(cols.map((c) => [c, l[c]])) : { ...l })), error: null, count: q.contar ? total : null };
}

/** O Storage: a URL assinada com o domínio de quem chama (o do servidor = o <ref>.supabase.co; o do navegador = o do cliente). */
const assinada = (dominio: string, bucket: string, caminho: string, validade: number, download?: string) =>
  encodeURI(`${dominio}/storage/v1/object/sign/${bucket}/${caminho}?token=tk-${validade}`) + (download ? `&download=${encodeURIComponent(download)}` : "");

const RPCS: Record<string, (args: Record<string, unknown>) => { data: unknown; error: unknown }> = {
  aluno_perfil: (a) =>
    a.p_aluno === ROTA ? { data: { ok: true, paciente_id: ALUNA, rota_id: ROTA, nome: "Ana W5P", tags: ["vip", 3], modulos: ["nutricao", "x"], conta_modulos: ["treino"] }, error: null }
      : { data: null, error: { code: "P0001", message: "sem_acesso" } },
  aluno_evolucao: (a) =>
    a.p_aluno === ROTA
      ? { data: { paciente_id: ALUNA, objetivo: "emagrecer", antropometrias: [{ id: "an1", observacao: "ok" }], fotos: [{ id: "fe1", path: `${EU}/${ALUNA}/evo 1.jpg` }, { id: "fe2", path: `${EU}/${ALUNA}/evo2.jpg` }] }, error: null }
      : { data: null, error: { code: "P0001", message: "aluno_inexistente" } },
  aluno_anotacoes: (a) => ({ data: { ok: true, paciente_id: ALUNA, total: 41, clinico: true, anotacoes: [{ id: "n1", data: "2026-10-01T10:00:00Z", texto: "x", visibilidade: "equipe", autor_papel: "personal", autor_id: "u1" }], ...(a.p_offset !== undefined ? { offset: a.p_offset, ultima: { id: "n0", data: "2026-10-02T00:00:00Z" } } : {}) }, error: null }),
  exames_do_aluno: (a) => ({ data: { ok: true, total_datas: 1, total_resultados: 2, fora_referencia: 1, exames: ["TSH", "Ácido úrico"], datas: [{ data: "2026-10-01", resultados: [{ id: "r1", exame: a.p_exame ?? "TSH" }] }] }, error: null }),
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
    auth: { getSession: async () => ({ data: { session: null } }) },
  },
}));
vi.mock("@/integrations/supabase/client", () => ({
  DB_SCHEMA: "staging",
  supabase: {
    functions: {
      invoke: async () => {
        throw new Error("o Treino não entra nas leituras do principal");
      },
    },
  },
}));
const pdf = vi.hoisted(() => ({ gerar: vi.fn() }));
vi.mock("@/lib/generateAdminPDF", () => ({ generateAdminPDF: (...a: unknown[]) => pdf.gerar(...a) }));

/** O cliente "como a nutricionista" do servidor (o módulo chama este no lugar do supabase-js). */
function comoANutri(): ContextoLeitura["comoPessoa"] {
  return {
    rpc: async (nome: string, args: Record<string, unknown>) => {
      rpcs.push({ nome, args });
      return RPCS[nome](args);
    },
    from: (tabela: string) => ({
      select: (colunas: string, opcoes?: { count: "exact" }) => {
        const q: Ida = { tabela, colunas, contar: opcoes?.count === "exact", filtros: [], ordem: [], limite: null, range: null };
        idas.push(q);
        const b = {
          eq: (c: string, v: unknown) => (q.filtros.push(["eq", c, v]), b),
          in: (c: string, v: readonly unknown[]) => (q.filtros.push(["in", c, v]), b),
          is: (c: string, v: null) => (q.filtros.push(["is", c, v]), b),
          order: (c: string, o: { ascending: boolean }) => (q.ordem.push([c, o.ascending]), b),
          limit: (n: number) => ((q.limite = n), b),
          range: (de: number, ate: number) => ((q.range = [de, ate]), b),
          then: (ok: (r: unknown) => unknown, falhou?: (e: unknown) => unknown) => Promise.resolve(executar(q)).then(ok, falhou),
        };
        return b;
      },
    }),
    storage: {
      from: (bucket: string) => ({
        createSignedUrls: async (caminhos: string[], validade: number) => ({
          data: caminhos.map((p) => ({ path: p, error: null, signedUrl: assinada("https://hkxv.supabase.co", bucket, p, validade) })), error: null,
        }),
        createSignedUrl: async (caminho: string, validade: number, o?: { download: string }) => ({
          data: { signedUrl: assinada("https://hkxv.supabase.co", bucket, caminho, validade, o?.download) }, error: null,
        }),
      }),
    },
  } as unknown as ContextoLeitura["comoPessoa"];
}

/** A função nutricao "de verdade": o corpo do navegador → os leitores reais → o módulo → a resposta pela rede (JSON ida e volta). */
beforeEach(() => {
  TABELAS = montarTabelas();
  idas.length = 0;
  rpcs.length = 0;
  h.corpos = [];
  h.invoke.mockReset();
  pdf.gerar.mockReset();
  h.invoke.mockImplementation(async (funcao: string, o: { body: Record<string, unknown> }) => {
    expect(funcao).toBe("nutricao");
    const corpo = JSON.parse(JSON.stringify(o.body)) as Record<string, unknown>;
    h.corpos.push(corpo);
    const log = { info: () => undefined, aviso: () => undefined, erro: () => undefined, excecao: () => undefined };
    const r = await atenderLeitura({ schema: "staging", corpo, userId: EU, comoPessoa: comoANutri(), log });
    return { data: JSON.parse(JSON.stringify(r)), error: null };
  });
});

import * as anamneses from "@/nutricao/prontuario/lib/anamneses";
import * as anexos from "@/nutricao/prontuario/lib/anexos";
import * as anotacoes from "@/nutricao/prontuario/lib/anotacoes";
import * as avaliacaoIntegrada from "@/nutricao/prontuario/lib/avaliacaoIntegrada";
import * as consultas from "@/nutricao/prontuario/lib/consultas";
import * as documentos from "@/nutricao/prontuario/lib/documentos";
import * as exames from "@/nutricao/prontuario/lib/exames";
import * as farmaco from "@/nutricao/prontuario/lib/farmaco";
import * as gestacional from "@/nutricao/prontuario/lib/gestacional";
import * as questionarios from "@/nutricao/prontuario/lib/questionarios";
import * as antropometrias from "@/nutricao/editor/lib/antropometrias";
import * as profissional from "@/nutricao/editor/lib/profissional";
import { buscarPerfilAluno } from "./dados/api";
import { gerarPdfDadosEvolucao } from "./dados/pdf";
import { carregarPrincipalDoPainel } from "./avaliacao/fontes";
import type { PerfilAluno } from "./dados/tipos";

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
function deHoje(tabela: string, filtros: Array<[string, string, unknown]>, ordem: Array<[string, boolean]>): Linha[] {
  return executar({ tabela, colunas: "*", contar: false, filtros, ordem, limite: 1000, range: null }).data;
}
/** Os filtros da lib de hoje: o aluno e só as vivas. */
const doAluno = (): Array<[string, string, unknown]> => [["eq", "paciente_id", ALUNA], ["is", "deleted_at", null]];

/** As listas do aluno: a função de hoje, a consulta, a tabela e a ordem da lib de antes (o select("*").eq(paciente).is(vivas).order…). */
const LISTAS: Array<{ nome: string; ler: () => Promise<unknown>; q: string; tabela: string; ordem: Array<[string, boolean]> }> = [
  { nome: "consultas.listarConsultas", ler: () => consultas.listarConsultas(ALUNA), q: "consultas_do_aluno", tabela: "consultas", ordem: [["data", false], ["created_at", false]] },
  { nome: "anamneses.listarAnamneses", ler: () => anamneses.listarAnamneses(ALUNA), q: "anamneses_do_aluno", tabela: "anamneses", ordem: [["data", false], ["created_at", false]] },
  { nome: "questionarios.listarAplicacoesDoPaciente", ler: () => questionarios.listarAplicacoesDoPaciente(ALUNA), q: "respostas_questionario_do_aluno", tabela: "respostas_questionario", ordem: [["data", false], ["created_at", false]] },
  { nome: "avaliacaoIntegrada.listarAvaliacoes", ler: () => avaliacaoIntegrada.listarAvaliacoes(ALUNA), q: "avaliacoes_integradas_do_aluno", tabela: "avaliacoes_integradas", ordem: [["data", false], ["created_at", false]] },
  { nome: "gestacional.listarGestacoes", ler: () => gestacional.listarGestacoes(ALUNA), q: "gestacoes_do_aluno", tabela: "gestacoes", ordem: [["created_at", false]] },
  { nome: "gestacional.listarRegistrosDoPaciente", ler: () => gestacional.listarRegistrosDoPaciente(ALUNA), q: "registros_gestacionais", tabela: "registros_gestacionais", ordem: [["data", false], ["created_at", false]] },
  { nome: "farmaco.listarMedicamentosDoPaciente", ler: () => farmaco.listarMedicamentosDoPaciente(ALUNA), q: "medicamentos_do_aluno", tabela: "medicamentos_paciente", ordem: [["ativo", false], ["created_at", true]] },
  { nome: "farmaco.listarAnalises", ler: () => farmaco.listarAnalises(ALUNA), q: "analises_farmaco_do_aluno", tabela: "analises_farmaco", ordem: [["data", false], ["created_at", false]] },
  { nome: "documentos.listarDocumentosDoPaciente", ler: () => documentos.listarDocumentosDoPaciente(ALUNA), q: "documentos_do_aluno", tabela: "documentos", ordem: [["created_at", false]] },
  { nome: "anexos.listarAnexosDoPaciente", ler: () => anexos.listarAnexosDoPaciente(ALUNA), q: "anexos_do_aluno", tabela: "anexos", ordem: [["created_at", false]] },
  { nome: "antropometrias.listarAntropometrias", ler: () => antropometrias.listarAntropometrias(ALUNA), q: "antropometrias_do_aluno", tabela: "antropometrias", ordem: [["data", false], ["created_at", false]] },
  // as da Avaliação 360 vêm reexportadas pela lib dela (uma porta só): as MESMAS funções
  { nome: "avaliacaoIntegrada.listarAntropometrias", ler: () => avaliacaoIntegrada.listarAntropometrias(ALUNA), q: "antropometrias_do_aluno", tabela: "antropometrias", ordem: [["data", false], ["created_at", false]] },
  { nome: "gestacional.listarAntropometrias", ler: () => gestacional.listarAntropometrias(ALUNA), q: "antropometrias_do_aluno", tabela: "antropometrias", ordem: [["data", false], ["created_at", false]] },
];
const CATALOGOS_DA_TELA: Array<{ nome: string; ler: () => Promise<unknown>; q: string; tabela: string; ordem: Array<[string, boolean]> }> = [
  { nome: "anamneses.listarModelos", ler: () => anamneses.listarModelos(), q: "modelos_anamnese", tabela: "modelos_anamnese", ordem: [["favorito", false], ["titulo", true]] },
  { nome: "questionarios.listarQuestionarios", ler: () => questionarios.listarQuestionarios(), q: "questionarios", tabela: "questionarios", ordem: [["titulo", true]] },
  { nome: "exames.listarCatalogoExames", ler: () => exames.listarCatalogoExames(), q: "exames_catalogo", tabela: "exames_catalogo", ordem: [["favorito", false], ["nome", true]] },
  { nome: "farmaco.listarBase", ler: () => farmaco.listarBase(), q: "interacoes_farmaco", tabela: "interacoes_farmaco_nutriente", ordem: [["medicamento", true], ["nutriente", true]] },
  { nome: "documentos.listarModelosDocumento", ler: () => documentos.listarModelosDocumento(), q: "modelos_documento", tabela: "modelos_documento", ordem: [["favorito", false], ["titulo", true]] },
];

describe("hml-20b — o contrato tela × servidor: as listas do Prontuário, da Avaliação e da Dieta", () => {
  it.each(LISTAS.map((l) => [l.nome, l] as const))("%s → a consulta do catálogo { aluno } → as MESMAS linhas do select(\"*\") de hoje, na ordem da lib", async (_n, l) => {
    const r = await l.ler();
    expect(corposAceitos()).toEqual([{ q: l.q, params: { aluno: ALUNA } }]);
    expect(r).toEqual(deHoje(l.tabela, doAluno(), l.ordem));
    expect((r as Linha[]).length).toBe(2); // só as 2 vivas da aluna: nem a da Lixeira, nem a de outra conta
    expect(idas[0].colunas).not.toContain("*");
  });

  it.each(CATALOGOS_DA_TELA.map((l) => [l.nome, l] as const))("%s → a consulta sem params (o RLS decide) → os do sistema + os próprios, na ordem da lib", async (_n, l) => {
    const r = await l.ler();
    expect(corposAceitos()).toEqual([{ q: l.q, params: {} }]);
    expect(r).toEqual(deHoje(l.tabela, [["is", "deleted_at", null]], l.ordem));
    expect((r as Linha[]).map((x) => x.nutricionista_id).sort()).toEqual([EU, null].sort()); // nunca o de outra conta, nunca o da Lixeira
  });

  it("N1 (como hoje): o aluno de OUTRA conta → lista vazia em todas (o RLS da pessoa no servidor)", async () => {
    const r = await Promise.all([consultas.listarConsultas(OUTRA), anexos.listarAnexosDoPaciente(OUTRA), antropometrias.listarAntropometrias(OUTRA)]);
    expect(r).toEqual([[], [], []]);
  });
});

describe("hml-20b — Exames: a página dos pedidos com o total, os resultados todos (o laço no servidor) e a RPC por data", () => {
  it("paginaPedidosDoPaciente(aluno, 1) → pedidos_exame_do_aluno { aluno, pagina } → { itens, total } como o paginar de hoje (range + count)", async () => {
    const p = await exames.paginaPedidosDoPaciente(ALUNA, 1);
    expect(corposAceitos()).toEqual([{ q: "pedidos_exame_do_aluno", params: { aluno: ALUNA, pagina: 1 } }]);
    const ordem: Array<[string, boolean]> = [["data", false], ["created_at", false], ["id", false]];
    expect(p).toEqual({ itens: deHoje("pedidos_exame", doAluno(), ordem), total: 2 });
    expect(idas[0]).toMatchObject({ contar: true, range: [0, 19] });
    // a página que a tela pede fora do formato vai normalizada (o intervalo() da tela: a 1ª é 1)
    await exames.paginaPedidosDoPaciente(ALUNA, 0);
    await exames.paginaPedidosDoPaciente(ALUNA, 2.6);
    expect(corposAceitos().slice(1).map((c) => c.params.pagina)).toEqual([1, 2]);
  });

  it("listarResultadosDoPaciente → resultados_exame_do_aluno, num lote SÓ DELE (sozinha) → todos, na ordem estável de hoje", async () => {
    const [res, cat] = await Promise.all([exames.listarResultadosDoPaciente(ALUNA), exames.listarCatalogoExames()]);
    expect(h.corpos.map((c) => (c.itens as Array<{ q: string }>).map((i) => i.q))).toEqual([["resultados_exame_do_aluno"], ["exames_catalogo"]]);
    const ordem: Array<[string, boolean]> = [["data", false], ["exame", true], ["id", true]];
    expect(res).toEqual(deHoje("resultados_exame", doAluno(), ordem));
    expect(cat).toHaveLength(2);
  });

  it("paginaDeExames → exames_do_aluno { aluno, exame?, offset, limite } → a MESMA RPC com os args de hoje e a mesma leitura do JSON", async () => {
    const p = await exames.paginaDeExames(ALUNA, " Ácido  ", 3);
    expect(corposAceitos()).toEqual([{ q: "exames_do_aluno", params: { aluno: ALUNA, exame: "Ácido", offset: 40, limite: 20 } }]);
    expect(rpcs).toEqual([{ nome: "exames_do_aluno", args: { p_aluno: ALUNA, p_exame: "Ácido", p_offset: 40, p_limite: 20 } }]);
    expect(p).toEqual({ totalDatas: 1, totalResultados: 2, foraReferencia: 1, exames: ["Ácido úrico", "TSH"], datas: [{ data: "2026-10-01", resultados: [{ id: "r1", exame: "Ácido" }] }] });
    await exames.paginaDeExames(ALUNA, "", 1);
    expect(rpcs[1]).toEqual({ nome: "exames_do_aluno", args: { p_aluno: ALUNA, p_offset: 0, p_limite: 20 } }); // sem filtro: o padrão null
  });
});

describe("hml-20b — Anotações (o card do Resumo, a página da aba, o PDF com todas)", () => {
  it("as 3 formas de hoje → anotacoes { aluno, limite[, offset] } / anotacoes_todas { aluno } → a aluno_anotacoes com os MESMOS args", async () => {
    const card = await anotacoes.listarAnotacoes(ROTA, 3);
    const pagina = await anotacoes.listarAnotacoes(ROTA, 20, 20);
    const todas = await anotacoes.listarAnotacoes(ROTA);
    expect(corposAceitos()).toEqual([
      { q: "anotacoes", params: { aluno: ROTA, limite: 3 } }, { q: "anotacoes", params: { aluno: ROTA, limite: 20, offset: 20 } },
      { q: "anotacoes_todas", params: { aluno: ROTA } },
    ]);
    expect(rpcs.map((r) => r.args)).toEqual([{ p_aluno: ROTA, p_limite: 3 }, { p_aluno: ROTA, p_limite: 20, p_offset: 20 }, { p_aluno: ROTA }]);
    expect(card).toMatchObject({ paciente_id: ALUNA, total: 41, clinico: true, anotacoes: [{ id: "n1", visibilidade: "equipe", autor_papel: "personal" }] });
    expect("ultima" in card).toBe(false);
    expect(pagina.ultima).toEqual({ id: "n0", data: "2026-10-02T00:00:00Z" });
    expect(todas.total).toBe(41);
  });
});

describe("hml-20b — o profissional (a fonte única do nome e dos dados profissionais)", () => {
  it("nomeDaNutricionista e dadosProfissionais (todas as portas) → profissional (o profiles de QUEM CHAMA) → os mesmos valores de hoje; juntos = 1 chamada, 1 ida ao banco", async () => {
    const r = await Promise.all([
      profissional.nomeDaNutricionista(EU), profissional.dadosProfissionais(EU), anamneses.nomeDaNutricionista(EU), documentos.dadosProfissionais(EU),
      documentos.nomeDaNutricionista(EU), questionarios.nomeDaNutricionista(EU), exames.dadosProfissionais(EU), farmaco.nomeDaNutricionista(EU),
      gestacional.dadosProfissionais(EU), avaliacaoIntegrada.nomeDaNutricionista(EU),
    ]);
    const dados = { crn: "CRN-3 123", telefone: null, endereco: "Rua A" };
    expect(r).toEqual(["Camila Rocha", dados, "Camila Rocha", dados, "Camila Rocha", "Camila Rocha", dados, "Camila Rocha", dados, "Camila Rocha"]);
    expect(h.corpos).toHaveLength(1); // a mesma volta da tela = 1 chamada
    expect(idas).toEqual([{ tabela: "profiles", colunas: "nome, dados_profissionais", contar: false, filtros: [["eq", "id", EU]], ordem: [], limite: 1, range: null }]);
    // o id que a tela passa não vai: o dono é quem chama (no servidor)
    expect(JSON.stringify(h.corpos)).not.toContain(EU);
  });

  it("sem userId → null sem chamar (como antes); a função fora do ar → null (como o erro do banco de antes)", async () => {
    expect(await profissional.nomeDaNutricionista("")).toBeNull();
    expect(await profissional.dadosProfissionais("")).toBeNull();
    expect(h.invoke).not.toHaveBeenCalled();
    h.invoke.mockResolvedValueOnce({ data: null, error: { name: "FunctionsFetchError", context: new TypeError("Failed to fetch") } });
    expect(await profissional.nomeDaNutricionista(EU)).toBeNull();
  });
});

describe("hml-20b — Anexos: a URL de 1 anexo por clique, assinada no servidor (só o caminho e o nome da linha que ele releu)", () => {
  it("urlAssinada(anexo, 60, true) e (anexo, 120, false) → anexo_url { id, download } SÓ com o id → a MESMA URL de hoje (o domínio do cliente, o prazo, o nome)", async () => {
    const a = TABELAS.anexos[0] as { id: string; path: string; nome: string };
    const baixar = await anexos.urlAssinada({ id: a.id, path: "outra/pasta/x.pdf", nome: "outro.pdf" }, 60, true);
    const ver = await anexos.urlAssinada(a, 120, false);
    expect(h.corpos.map((c) => (c.itens as unknown[]).length)).toEqual([1, 1]); // cada clique, num lote só dele
    expect(corposAceitos()).toEqual([{ q: "anexo_url", params: { id: a.id, download: true } }, { q: "anexo_url", params: { id: a.id, download: false } }]);
    expect(JSON.stringify(h.corpos)).not.toContain(".pdf"); // nenhum caminho nem nome vai daqui
    // hoje: supabase.storage.from("anexos-staging").createSignedUrl(path, 60, { download: nome }) no navegador
    expect(baixar).toBe(assinada(BASE, "anexos-staging", a.path, 60, a.nome));
    expect(ver).toBe(assinada(BASE, "anexos-staging", a.path, 120));
  });

  it("o anexo de outra conta (ou já excluído) → o erro (hoje o Storage recusava); a URL que não veio → a frase de antes", async () => {
    const deOutra = TABELAS.anexos[3] as { id: string; path: string; nome: string };
    await expect(anexos.urlAssinada(deOutra)).rejects.toMatchObject({ codigo: "nao_encontrado" });
    h.invoke.mockResolvedValueOnce({ data: { ok: true, itens: [{ ok: true, linhas: [{ id: "x", url: null }] }] }, error: null });
    await expect(anexos.urlAssinada(deOutra)).rejects.toThrow("Não foi possível gerar o link do arquivo");
  });
});

describe("hml-20b — a Avaliação (o Editar) e a casca (o perfil e a série do principal)", () => {
  it("buscarAntropometria(id) → antropometria { id } → a linha completa (o select(\"*\").eq(id).maybeSingle() de hoje); de outra conta → null", async () => {
    const a = TABELAS.antropometrias[0];
    expect(await antropometrias.buscarAntropometria(String(a.id))).toEqual(a);
    expect(corposAceitos()).toEqual([{ q: "antropometria", params: { id: a.id } }]);
    expect(idas[0].filtros).toEqual([["eq", "id", a.id]]); // pelo id, sem o filtro da Lixeira (como a tela lia)
    expect(await antropometrias.buscarAntropometria(String(TABELAS.antropometrias[3].id))).toBeNull();
  });

  it("buscarPerfilAluno(rota) → aluno_perfil { aluno } → o PerfilAluno normalizado de hoje; outra conta → ErroPerfil('sem_acesso') como antes", async () => {
    const p = await buscarPerfilAluno(ROTA);
    expect(corposAceitos()).toEqual([{ q: "aluno_perfil", params: { aluno: ROTA } }]);
    expect(rpcs).toEqual([{ nome: "aluno_perfil", args: { p_aluno: ROTA } }]);
    expect(p).toMatchObject({ paciente_id: ALUNA, rota_id: ROTA, tags: ["vip", 3], modulos: ["nutricao"], conta_modulos: ["treino"] });
    await expect(buscarPerfilAluno(OUTRA)).rejects.toMatchObject({ codigo: "sem_acesso", message: "sem_acesso" });
  });

  it("carregarPrincipalDoPainel(rota) → aluno_evolucao_painel { aluno } → a série de hoje com as fotos assinadas na MESMA ida (a URL de hoje)", async () => {
    const r = await carregarPrincipalDoPainel(ROTA);
    expect(corposAceitos()).toEqual([{ q: "aluno_evolucao_painel", params: { aluno: ROTA } }]);
    expect(h.corpos).toHaveLength(1); // a assinatura não é mais uma 2ª ida do navegador
    const p1 = `${EU}/${ALUNA}/evo 1.jpg`;
    const p2 = `${EU}/${ALUNA}/evo2.jpg`;
    expect(r).toEqual({
      pacienteId: ALUNA, objetivo: "emagrecer", antropometrias: [{ id: "an1", observacao: "ok" }],
      fotos: [{ id: "fe1", path: p1, url: assinada(BASE, "evolucao-staging", p1, 3600) }, { id: "fe2", path: p2, url: assinada(BASE, "evolucao-staging", p2, 3600) }],
    });
    await expect(carregarPrincipalDoPainel(OUTRA)).rejects.toMatchObject({ parte: "principal", message: "aluno_inexistente" });
  });

  it("o PDF Dados & Evolução → antropometrias_pdf { paciente } → as 12 colunas de hoje, as vivas, da mais antiga para a mais nova", async () => {
    const perfil = { paciente_id: ALUNA, treino_user_id: null, nome: "Ana", email: null, genero: "feminino", nascimento: null, ultima_antropometria: null } as unknown as PerfilAluno;
    await gerarPdfDadosEvolucao(perfil, false);
    expect(corposAceitos()).toEqual([{ q: "antropometrias_pdf", params: { paciente: ALUNA } }]);
    expect(idas[0]).toMatchObject({
      tabela: "antropometrias", colunas: "id, data, peso, altura, sexo, idade, circunferencias, dobras, protocolo, resultados, nutricionista_id, created_at",
      filtros: [["eq", "paciente_id", ALUNA], ["is", "deleted_at", null]], ordem: [["data", true]],
    });
    const [, linhas] = pdf.gerar.mock.calls[0] as [unknown, Array<{ data_avaliacao: string }>];
    expect(linhas.map((l) => l.data_avaliacao)).toEqual(["2026-10-01", "2026-10-05"]); // as 2 vivas da aluna, da mais antiga para a mais nova
  });
});

describe("hml-20b — a seção pede numa ida só (o lote da volta)", () => {
  it("Documentos: os modelos, os documentos, o nome e os dados profissionais na mesma volta = 1 chamada `ler` (o profissional 1 vez no banco)", async () => {
    await Promise.all([
      documentos.listarModelosDocumento(), documentos.listarDocumentosDoPaciente(ALUNA), documentos.nomeDaNutricionista(EU), documentos.dadosProfissionais(EU),
    ]);
    expect(h.corpos).toHaveLength(1);
    expect((h.corpos[0].itens as Array<{ q: string }>).map((i) => i.q)).toEqual(["modelos_documento", "documentos_do_aluno", "profissional", "profissional"]);
    expect(idas.map((i) => i.tabela).sort()).toEqual(["documentos", "modelos_documento", "profiles"]);
  });

  it("Avaliação 360: as 5 fontes + a lista dela + o profissional = 2 chamadas (os resultados de exame num lote só deles)", async () => {
    await Promise.all([
      avaliacaoIntegrada.listarAvaliacoes(ALUNA), avaliacaoIntegrada.listarAnamneses(ALUNA), avaliacaoIntegrada.listarAntropometrias(ALUNA),
      avaliacaoIntegrada.listarResultadosDoPaciente(ALUNA), avaliacaoIntegrada.listarAplicacoesDoPaciente(ALUNA),
      avaliacaoIntegrada.nomeDaNutricionista(EU), avaliacaoIntegrada.dadosProfissionais(EU),
    ]);
    expect(h.corpos.map((c) => (c.itens as Array<{ q: string }>).map((i) => i.q))).toEqual([
      ["resultados_exame_do_aluno"],
      ["avaliacoes_integradas_do_aluno", "anamneses_do_aluno", "antropometrias_do_aluno", "respostas_questionario_do_aluno", "profissional", "profissional"],
    ]);
  });
});
