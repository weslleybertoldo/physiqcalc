// Physiq W18 — porta do PhysiqNutri (main ca9f66f, src/lib/gestacional.ts) para o banco principal. Imports trocados; o resto é o do site antigo.
import type { Database } from "@/nutricao/editor/lib/banco";
import { gestacaoParaBanco, registroParaBanco, type FormGestacao, type FormRegistroGestacional } from "@/nutricao/editor/lib/gestacionalUtil";
import { lerNutricao } from "@/nutricao/leitura";
import { acaoNutricao, comFraseDoCodigo } from "@/nutricao/servidor";

// Acesso do Acompanhamento gestacional (W25): as tabelas novas `gestacoes` (1 ATIVA por paciente — índice único parcial) e
// `registros_gestacionais` (1 registro VIVO por gestação/dia — índice único parcial; upsert MANUAL como na W23). RLS: a
// nutricionista só vê as dela; master vê tudo; exclusão SOFT → Lixeira (W32). A leitura da seção dona (antropometrias da
// W6, pra sugerir peso/altura pré-gestacionais) e os dados do perfil pro PDF são reexportados pra tela ter uma porta só.
// hml-19a (H-41 · jeito 2): as gravações vão pela função nutricao; o "upsert" do dia é 1 chamada (o servidor lê o vivo do dia, edita
// ou insere, e trata a corrida do índice único parcial). Mesmas assinaturas.
// hml-20b (H-42 · jeito 2, etapa 2): as LEITURAS também vão pela nutricao, no lote da tela (src/nutricao/leitura.ts), como a pessoa:
// gestacoes_do_aluno e registros_gestacionais (as de TODAS as gestações do paciente, como antes; a tela separa) + as antropometrias da
// seção dona e o profissional (a fonte única, src/nutricao/editor/lib/profissional.ts). Mesmos tipos; o erro é ErroLeitura.

export { listarAntropometrias, type Antropometria } from "@/nutricao/editor/lib/antropometrias";
export { dadosProfissionais, nomeDaNutricionista } from "@/nutricao/editor/lib/profissional";

export type Gestacao = Database["public"]["Tables"]["gestacoes"]["Row"];
export type RegistroGestacional = Database["public"]["Tables"]["registros_gestacionais"]["Row"];

export const MSG_GESTACAO_ATIVA = "Já existe um acompanhamento ativo pra esta aluna";

// ---- Gestações ----

/** Gestações vivas do paciente, a mais recente primeiro (a ativa, se houver, é a que não tem `encerrada_em`). */
export async function listarGestacoes(pacienteId: string): Promise<Gestacao[]> {
  const r = await lerNutricao("gestacoes_do_aluno", { aluno: pacienteId });
  return (r.linhas ?? []) as Gestacao[];
}

export const gestacaoAtiva = (lista: Gestacao[]): Gestacao | null => lista.find((g) => g.encerrada_em === null) ?? null;

/** Inicia o acompanhamento: grava DPP e IMC pré calculados. Já existe uma ativa (índice parcial: conflito) → erro legível. */
export async function iniciarGestacao(nutricionistaId: string, pacienteId: string, f: FormGestacao): Promise<Gestacao> {
  const r = await acaoNutricao<{ linha: Gestacao }>("gestacao_criar", { paciente_id: pacienteId, ...gestacaoParaBanco(f) })
    .catch((e) => comFraseDoCodigo(e, { conflito: MSG_GESTACAO_ATIVA }));
  return r.linha;
}

/** Edita os dados da gestação (recalcula DPP e IMC pré a partir do formulário). */
export async function atualizarGestacao(id: string, f: FormGestacao): Promise<Gestacao> {
  const r = await acaoNutricao<{ linha: Gestacao }>("gestacao_editar", { id, ...gestacaoParaBanco(f) })
    .catch((e) => comFraseDoCodigo(e, { conflito: MSG_GESTACAO_ATIVA }));
  return r.linha;
}

/** Encerra (parto/encerramento): a gestação sai de ativa e a paciente pode iniciar outra (a hora é a do servidor). */
export async function encerrarGestacao(id: string): Promise<Gestacao> {
  const r = await acaoNutricao<{ linha: Gestacao }>("gestacao_encerrar", { id });
  return r.linha;
}

/** Exclusão SOFT da gestação (os registros dela ficam no banco, também fora das listas vivas por `gestacao_id`). */
export async function excluirGestacao(id: string): Promise<void> {
  await acaoNutricao("gestacao_excluir", { id });
}

// ---- Registros (pesagens) ----

/** Registros vivos de TODAS as gestações do paciente, dia mais recente primeiro (a tela separa por `gestacao_id`). */
export async function listarRegistrosDoPaciente(pacienteId: string): Promise<RegistroGestacional[]> {
  const r = await lerNutricao("registros_gestacionais", { aluno: pacienteId });
  return (r.linhas ?? []) as RegistroGestacional[];
}

/**
 * Upsert pelo dia: já existe registro vivo naquele dia da gestação → atualiza; senão insere. Devolve a linha e se foi criada.
 * hml-19a: 1 chamada (registro_gestacional_salvar) — o servidor lê o vivo do dia e trata a corrida (23505 do índice único parcial
 * → relê e edita); antes eram de 2 a 4 pedidos daqui.
 */
export async function salvarRegistro(
  nutricionistaId: string,
  gestacao: { id: string; paciente_id: string },
  f: FormRegistroGestacional,
): Promise<{ registro: RegistroGestacional; criado: boolean }> {
  const r = await acaoNutricao<{ registro: RegistroGestacional; criado: boolean }>("registro_gestacional_salvar", {
    gestacao_id: gestacao.id, paciente_id: gestacao.paciente_id, ...registroParaBanco(f),
  });
  return { registro: r.registro, criado: r.criado === true };
}

export async function atualizarRegistro(id: string, f: FormRegistroGestacional): Promise<RegistroGestacional> {
  const r = await acaoNutricao<{ linha: RegistroGestacional }>("registro_gestacional_editar", { id, ...registroParaBanco(f) });
  return r.linha;
}

/** Exclusão SOFT (o índice único só conta vivos, então o dia pode ser registrado de novo). */
export async function excluirRegistro(id: string): Promise<void> {
  await acaoNutricao("registro_gestacional_excluir", { id });
}
