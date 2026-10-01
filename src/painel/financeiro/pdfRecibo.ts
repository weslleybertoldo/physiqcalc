// Physiq W19 — o PDF de um recibo já emitido (lista de Recibos da página, aba Financeiro do aluno): a assinatura é de quem EMITIU o
// recibo (nome e título dele); quando quem gera o PDF não é ele, o autor sai ao lado da data (o padrão da W18). O gerador (jsPDF) é
// carregado sob demanda.
import type { Recibo } from "./dados";
import type { FinanceiroConta } from "./useFinanceiro";

type Assinante = Pick<FinanceiroConta, "assinaturaDe" | "uid">;

/** O PDF de um recibo: a assinatura é de quem o emitiu; quando não é você, o autor sai ao lado da data (W18). */
export async function pdfDoRecibo(f: Assinante, r: Pick<Recibo, "numero" | "valor" | "data" | "descricao" | "texto" | "nutricionista_id">, paciente: string) {
  const a = f.assinaturaDe(r.nutricionista_id);
  const { baixarPDFRecibo } = await import("./reciboPdf");
  return baixarPDFRecibo({
    numero: r.numero, valor: Number(r.valor), data: r.data, descricao: r.descricao, texto: r.texto, paciente,
    profissional: a.nome, rotuloProfissional: a.padrao.rotuloProfissional, rotuloPaciente: a.padrao.rotuloPaciente,
    autor: r.nutricionista_id === f.uid ? null : a.rotulo, emitidoEm: new Date(),
  });
}

