// Physiq hml-06 (H-20) — a reserva da fila do WhatsApp (whatsapp-agente › tarefas). Uma mensagem só vai ao celular se ESTA
// chamada a trocou de 'pendente' para 'enviando' com a contagem que leu (troca condicional): 2 'tarefas' juntas não pegam a
// mesma mensagem, e cada saída da fila soma 1 em tentativas. O whatsapp_destravar_fila (pg_cron */10) devolve 'enviando' há
// mais de 10 min a 'pendente' só com tentativas < 3 — antes a reserva gravava sempre 1 e a desistência nunca chegava (celular
// que morria no meio, ou resultado que falhava depois do envio: o paciente recebia a mesma mensagem a cada 10 min, para
// sempre). Máximo 3 saídas por mensagem; o botão Reenviar zera e dá mais 3.
// Sem Deno, sem rede e sem import do supabase-js: o Vitest (src/painel/mensagens/whatsappFila.test.ts) passa um db falso.

export interface MensagemFila {
  id: string;
  nutricionista_id: string;
  destino_e164: string;
  texto: string;
  tentativas: number;
  tipo: string | null;
}

export const COLUNAS_FILA = "id, nutricionista_id, destino_e164, texto, tentativas, tipo";

/** O pedaço do cliente do supabase-js que a reserva usa (a função passa o de verdade; o teste, um falso). */
export interface FiltroReserva {
  eq(coluna: string, valor: string | number): FiltroReserva;
  select(colunas: string): { maybeSingle(): PromiseLike<{ data: unknown; error: unknown }> };
}
export interface DbFila {
  from(tabela: string): { update(campos: Record<string, unknown>): FiltroReserva };
}

/** Reserva as mensagens lidas (≤ 20; quase sempre 0) e devolve SÓ as que esta chamada reservou — as que vão ao celular. */
export async function reservarFila(db: DbFila, msgs: MensagemFila[]): Promise<MensagemFila[]> {
  const fila: MensagemFila[] = [];
  for (const m of msgs) {
    const { data: r, error } = await db.from("mensagens_whatsapp").update({ status: "enviando", tentativas: m.tentativas + 1 })
      .eq("id", m.id).eq("status", "pendente").eq("tentativas", m.tentativas)
      .select(COLUNAS_FILA).maybeSingle();
    if (error) throw error;
    if (r) fila.push(r as MensagemFila); // outra chamada levou antes (ou a mensagem mudou): não vai daqui
  }
  return fila;
}
