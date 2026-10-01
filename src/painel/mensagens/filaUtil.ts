import { diaSP, diasEntre, hojeSP } from "@/financeiro/regras";
import { formatarWhatsapp } from "@/painel/configuracoes/perfil/regras";
import type { TomChip } from "@/ui/premium/Chip";
import { ROTULO_TIPO } from "./disparosUtil";

// Physiq W22 — regras puras do HISTÓRICO DA FILA (spec 4.4: "histórico da fila (pendente, enviada, falhou)") e do número do menu
// ("Mensagens (envios com falha)", tela 6). Sem rede: o que vem das funções whatsapp_fila/whatsapp_resumo do banco principal.

export type StatusMensagem = "pendente" | "enviando" | "enviada" | "falhou" | "cancelada";

export interface ItemFila {
  id: string;
  tipo: string;
  status: StatusMensagem;
  destino: string | null;
  texto: string;
  erro: string | null;
  criado_em: string;
  atualizado_em: string;
  agendada_para: string | null;
  enviada_em: string | null;
  aluno: { id: string; nome: string | null; rota: string } | null;
  autor: { id: string; nome: string | null };
  /** a mensagem é da fila de quem vê (só a própria dá para reenviar) */
  minha: boolean;
  pode_reenviar: boolean;
}

export type FiltroFila = "todas" | "fila" | "enviadas" | "falhas";
/** "meus" = a própria fila (o WhatsApp é de cada profissional); "conta" = a fila da conta inteira, para o DONO (P1) */
export type EscopoFila = "meus" | "conta";

export const FILTROS: { valor: FiltroFila; rotulo: string }[] = [
  { valor: "todas", rotulo: "Todas" },
  { valor: "fila", rotulo: "Na fila" },
  { valor: "enviadas", rotulo: "Enviadas" },
  { valor: "falhas", rotulo: "Com falha" },
];

export const ESCOPOS: { valor: EscopoFila; rotulo: string }[] = [
  { valor: "meus", rotulo: "Minha fila" },
  { valor: "conta", rotulo: "Toda a equipe" },
];

/**
 * O número do menu: as falhas NOVAS da própria fila — status "falhou" nos últimos 7 dias (uma falha de mais de uma semana não pede
 * mais ação: a consulta passou, o aniversário passou…), depois do último "Limpar". Some ao reenviar (a mensagem volta para a fila) ou
 * ao limpar. É o mesmo critério do filtro "Com falha" (número = tela).
 */
export const JANELA_FALHAS_DIAS = 7;

export const ROTULO_STATUS_MSG: Record<StatusMensagem, string> = {
  pendente: "Na fila",
  enviando: "Enviando",
  enviada: "Enviada",
  falhou: "Falhou",
  cancelada: "Cancelada",
};

export const TOM_STATUS: Record<StatusMensagem, TomChip> = {
  pendente: "c",
  enviando: "c",
  enviada: "n",
  falhou: "r",
  cancelada: "g",
};

export function rotuloTipo(tipo: string): string {
  return ROTULO_TIPO[tipo] ?? "Mensagem";
}

/** De quem é a linha: o aluno; sem aluno, o próprio profissional (teste e aviso do plano). */
export function nomeDaLinha(item: Pick<ItemFila, "aluno" | "tipo" | "minha" | "autor">): string {
  if (item.aluno?.nome) return item.aluno.nome;
  if (item.tipo === "teste") return item.minha ? "Teste para você" : `Teste de ${primeiroNome(item.autor.nome) || "um profissional"}`;
  if (item.tipo === "assinatura_vencendo") return item.minha ? "Você" : primeiroNome(item.autor.nome) || "Profissional";
  return "Aluno";
}

export function primeiroNome(nome: string | null | undefined): string {
  return (nome ?? "").trim().split(/\s+/)[0] ?? "";
}

const HORA = new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" });

/** "hoje 14:05" · "ontem 14:05" · "12/09 14:05" (relógio de São Paulo) */
export function dataHoraCurta(iso: string | null | undefined, agora: Date = new Date()): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const dia = diaSP(iso)!;
  const hoje = hojeSP(agora);
  const n = diasEntre(dia, hoje);
  const hora = HORA.format(d);
  if (n === 0) return `hoje ${hora}`;
  if (n === 1) return `ontem ${hora}`;
  if (n === -1) return `amanhã ${hora}`;
  return `${dia.slice(8, 10)}/${dia.slice(5, 7)} ${hora}`;
}

/** A coluna do horário: quando saiu, quando falhou, ou para quando está na fila. */
export function quandoDaMensagem(item: Pick<ItemFila, "status" | "criado_em" | "atualizado_em" | "agendada_para" | "enviada_em">, agora: Date = new Date()): string {
  if (item.status === "enviada") return `Enviada ${dataHoraCurta(item.enviada_em ?? item.atualizado_em, agora)}`;
  if (item.status === "falhou") return `Falhou ${dataHoraCurta(item.atualizado_em, agora)}`;
  if (item.status === "cancelada") return `Cancelada ${dataHoraCurta(item.atualizado_em, agora)}`;
  if (item.status === "enviando") return "Enviando agora";
  const agendada = item.agendada_para ? new Date(item.agendada_para) : null;
  if (agendada && agendada.getTime() > agora.getTime() + 60_000) return `Sai ${dataHoraCurta(item.agendada_para, agora)}`;
  return `Na fila desde ${dataHoraCurta(item.criado_em, agora)}`;
}

/** O número de destino para mostrar ("+55 (11) 99999-8888"). */
export function destinoFormatado(e164: string | null | undefined): string {
  return e164 ? formatarWhatsapp(e164) : "";
}

/** "Nenhuma falha nova" · "1 falha nos últimos 7 dias" · "3 falhas nos últimos 7 dias" */
export function resumoFalhas(n: number): string {
  if (n <= 0) return "Nenhuma falha nova";
  return `${n} ${n === 1 ? "falha" : "falhas"} nos últimos ${JANELA_FALHAS_DIAS} dias`;
}

/** Texto do vazio de cada filtro. */
export function textoVazio(filtro: FiltroFila, escopo: EscopoFila): { titulo: string; texto: string } {
  const dono = escopo === "conta";
  switch (filtro) {
    case "fila":
      return { titulo: "Nada na fila", texto: "As mensagens aparecem aqui enquanto esperam o envio." };
    case "enviadas":
      return { titulo: "Nenhuma mensagem enviada ainda", texto: dono ? "As mensagens que a equipe enviar aparecem aqui." : "As mensagens que saírem do seu WhatsApp aparecem aqui." };
    case "falhas":
      return { titulo: "Nenhuma falha nova", texto: `Falhas dos últimos ${JANELA_FALHAS_DIAS} dias aparecem aqui, com o motivo e o botão Reenviar.` };
    default:
      return {
        titulo: "Nenhuma mensagem ainda",
        texto: dono ? "Quando a equipe ligar as mensagens automáticas, o histórico aparece aqui." : "Quando você ligar as mensagens automáticas, o histórico aparece aqui.",
      };
  }
}
