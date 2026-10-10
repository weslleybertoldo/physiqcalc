// Physiq W21 — o número do item "Pré-consulta" do menu (respostas NOVAS: vivas e sem aluno ligado — o critério do Nutri, o
// "respostas de pré-consulta sem paciente" do Dashboard de lá) e o recorte da conta ativa. Módulo leve de propósito: o contador do
// menu (src/painel/contadores/PreConsulta.ts) é carregado junto da casca do painel.
import { principal } from "@/integrations/principal/client";

/** O recorte da conta ativa (o mesmo da W19): o que é da conta + o que é meu sem conta (site antigo). A RLS decide o resto (P1). */
export const recorteDaConta = (contaId: string, uid: string): string => `conta_id.eq.${contaId},and(conta_id.is.null,nutricionista_id.eq.${uid})`;

/** Chaves do react-query da página e do contador (ligar/importar/excluir invalida `CHAVE_NOVAS` → o número do menu acompanha). */
export const CHAVE_NOVAS = ["preconsulta-novas"] as const;
export const CHAVES_PRECONSULTA = {
  tudo: ["preconsulta"] as const,
  formularios: (conta: string, uid: string) => ["preconsulta", "formularios", conta, uid] as const,
  respostas: (conta: string, uid: string) => ["preconsulta", "respostas", conta, uid] as const,
  modelos: (uid: string) => ["preconsulta", "modelos", uid] as const,
  questionarios: (uid: string) => ["preconsulta", "questionarios", uid] as const,
  equipe: (conta: string) => ["preconsulta", "equipe", conta] as const,
  novas: (conta: string, uid: string) => [...CHAVE_NOVAS, conta, uid] as const,
};

/** Respostas vivas sem aluno ligado no recorte da conta ativa (só a contagem — HEAD; a RLS tira o que você não pode ler). */
export async function contarRespostasNovas(contaId: string, uid: string): Promise<number> {
  const { count, error } = await principal
    .from("respostas_preconsulta")
    .select("id", { count: "exact", head: true })
    .is("deleted_at", null)
    .is("paciente_id", null)
    .or(recorteDaConta(contaId, uid));
  if (error) throw new Error(error.message);
  return count ?? 0;
}
