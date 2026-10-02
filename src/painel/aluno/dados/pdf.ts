/**
 * PDFs do ⋯ do cabeçalho do aluno (C32 — o grupo "Dados" do Calc): "Dados & Evolução" para TODOS (quem veio do Calc: o
 * perfil e as avaliações do Banco do Treino, como o antigo; quem veio do Nutri: o cadastro e as antropometrias do banco
 * principal; quem tem os dois: as duas listas juntas, por data) e "Treino" para quem tem o módulo Treino (o mesmo do antigo).
 * Os geradores são os de sempre (src/lib/generateAdminPDF.ts e generateWorkoutPlanPDF.ts), carregados só na hora.
 */
import { principal } from "@/integrations/principal/client";
import { supabase } from "@/integrations/supabase/client";
import { avaliacaoDoPrincipal } from "@/evolucao/serie";
import type { AntropometriaPrincipal, Avaliacao as AvaliacaoSerie } from "@/evolucao/tipos";
import { idadeDe, numero } from "./regras";
import type { PerfilAluno } from "./tipos";

type LinhaPdf = Record<string, unknown> & { data_avaliacao: string; created_at: string | null };

const METODO_CALC: Record<string, string> = { dobras_3: "dobras_3", dobras_7: "dobras_7", bioimpedancia: "bioimpedancia", pollock3: "dobras_3", pollock7: "dobras_7" };

/**
 * O protocolo da antropometria no PDF (W25 — herdado da W18): o MESMO "tipo de avaliação" que a Evolução mostra (src/evolucao/serie.ts,
 * PROTOCOLOS: "Faulkner — 4 dobras", "Guedes — 3 dobras", "Jackson & Pollock — 3 dobras"…; sem protocolo, "Só medidas" ou "Peso e
 * altura") — antes o Faulkner e o Guedes (e as só de medidas) saíam como "3 dobras", o padrão do método do Calc. O travessão vira hífen
 * (a fonte do PDF).
 */
export const protocoloNoPdf = (a: Pick<AvaliacaoSerie, "tipo">): string => (a.tipo || "").replace(/\s*[—–]\s*/g, " - ").trim();

/** Uma antropometria do Nutri (já no formato da Evolução, W10) no formato das avaliações do Calc que o PDF antigo lê. */
export function linhaDaAntropometria(a: AvaliacaoSerie): LinhaPdf {
  return {
    data_avaliacao: a.data,
    created_at: a.criadoEm,
    peso: a.peso,
    altura: a.altura,
    percentual_gordura: a.gordura,
    massa_gorda: a.massaGorda,
    massa_magra: a.massaMagra,
    tmb_mifflin: null,
    tmb_katch: null,
    metodo_avaliacao: METODO_CALC[a.metodo] ?? null,
    rotulo_metodo: protocoloNoPdf(a) || null,
    ...a.medidas,
  };
}

async function antropometriasDoAluno(pacienteId: string): Promise<AvaliacaoSerie[]> {
  const { data, error } = await principal
    .from("antropometrias" as never)
    .select("id, data, peso, altura, sexo, idade, circunferencias, dobras, protocolo, resultados, nutricionista_id, created_at")
    .eq("paciente_id", pacienteId)
    .is("deleted_at", null)
    .order("data", { ascending: true });
  if (error) throw error;
  return ((data ?? []) as unknown as Array<Record<string, unknown>>).map((r) =>
    avaliacaoDoPrincipal({
      ...(r as unknown as AntropometriaPrincipal),
      autor_id: (r.nutricionista_id as string) ?? null,
      autor_nome: null,
      criado_em: (r.created_at as string) ?? null,
    }),
  );
}

/** "Dados & Evolução" (C32). comTreino = a sessão do Banco do Treino está pronta (senão fica só o que é do banco principal). */
export async function gerarPdfDadosEvolucao(perfil: PerfilAluno, comTreino: boolean): Promise<void> {
  const [{ generateAdminPDF }, antropos] = await Promise.all([import("@/lib/generateAdminPDF"), antropometriasDoAluno(perfil.paciente_id).catch(() => [])]);
  const doNutri = antropos.map(linhaDaAntropometria);
  if (perfil.treino_user_id && comTreino) {
    const { data, error } = await supabase.functions.invoke("admin-get-user", { body: { userId: perfil.treino_user_id } });
    const d = data as { profile?: Record<string, unknown>; avaliacoes?: LinhaPdf[] } | null;
    if (!error && d?.profile) {
      const todas = [...(d.avaliacoes ?? []), ...doNutri].sort((a, b) => String(a.data_avaliacao).localeCompare(String(b.data_avaliacao)));
      await generateAdminPDF(d.profile as never, todas as never);
      return;
    }
  }
  const ultima = antropos[antropos.length - 1] ?? null;
  const perfilPdf = {
    nome: perfil.nome,
    email: perfil.email,
    sexo: perfil.genero === "masculino" ? "male" : perfil.genero === "feminino" ? "female" : null,
    idade: idadeDe(perfil.nascimento),
    data_nascimento: perfil.nascimento,
    peso: ultima?.peso ?? numero(perfil.ultima_antropometria?.peso),
    altura: ultima?.altura ?? numero(perfil.ultima_antropometria?.altura),
    percentual_gordura: ultima?.gordura ?? null,
    massa_gorda: ultima?.massaGorda ?? null,
    massa_magra: ultima?.massaMagra ?? null,
    tmb_mifflin: null,
    tmb_katch: null,
    tmb_metodo: null,
    user_code: null,
    metodo_avaliacao: ultima ? (METODO_CALC[ultima.metodo] ?? null) : null,
    rotulo_metodo: ultima ? protocoloNoPdf(ultima) || null : null,
    ...(ultima?.medidas ?? {}),
  };
  await generateAdminPDF(perfilPdf as never, doNutri as never);
}

/** "Treino" (C32): o PDF do treino de hoje do Calc — só para quem tem treino e com a sessão do Banco do Treino. */
export async function gerarPdfTreino(treinoUserId: string): Promise<void> {
  const [{ generateWorkoutPlanPDF }, r] = await Promise.all([
    import("@/lib/generateWorkoutPlanPDF"),
    supabase.functions.invoke("admin-get-workout-plan", { body: { userId: treinoUserId } }),
  ]);
  const d = r.data as { profile?: unknown; dias?: unknown[] } | null;
  if (r.error || !d?.profile) throw r.error ?? new Error("sem_treino");
  await generateWorkoutPlanPDF(d.profile as never, (d.dias ?? []) as never);
}
