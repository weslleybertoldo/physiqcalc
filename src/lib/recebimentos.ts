// src/lib/recebimentos.ts — lista de recebimentos do professor (pedido 13/09/2026): Integração Mercado Pago + chaves Pix; só 1 ativo.
import { formatarChavePix, rotuloPixTipo, type PixTipo } from "./pixChave";

export type TipoRecebimento = "pix" | "mercadopago";

export interface Recebimento {
  id: string;
  professor_id: string;
  tipo: TipoRecebimento;
  pix_tipo: PixTipo | null;
  pix_chave: string | null;
  pix_favorecido: string | null;
  pix_banco: string | null;
  ativo: boolean;
  criado_em: string;
}

/** Item "Integração com Mercado Pago" ainda sem linha no banco (master): ligar cria a linha. */
export const MP_VIRTUAL_ID = "__mercadopago__";

export const NENHUM_ATIVO = "Nenhum recebimento ligado — o aluno não vê chave nem consegue anexar comprovante (útil se você cobra por fora).";

/** Mercado Pago primeiro; depois os Pix na ordem de criação. */
export function ordenarRecebimentos(rows: Recebimento[]): Recebimento[] {
  return [...rows].sort((a, b) => {
    if (a.tipo !== b.tipo) return a.tipo === "mercadopago" ? -1 : 1;
    return a.criado_em.localeCompare(b.criado_em);
  });
}

/** Master sem linha de Mercado Pago vê o item mesmo assim (virtual, desligado). */
export function comMpVirtual(rows: Recebimento[], ehMaster: boolean, professorId: string): Recebimento[] {
  if (!ehMaster || rows.some((r) => r.tipo === "mercadopago")) return rows;
  const virtual: Recebimento = {
    id: MP_VIRTUAL_ID, professor_id: professorId, tipo: "mercadopago", pix_tipo: null, pix_chave: null,
    pix_favorecido: null, pix_banco: null, ativo: false, criado_em: "",
  };
  return [virtual, ...rows];
}

export function tituloRecebimento(r: Recebimento): string {
  return r.tipo === "mercadopago" ? "Integração com Mercado Pago" : `Pix · ${rotuloPixTipo(r.pix_tipo)}`;
}

export function detalheRecebimento(r: Recebimento): string {
  if (r.tipo === "mercadopago") return "O aluno paga por Pix ou cartão dentro do app e a confirmação é automática.";
  return [formatarChavePix(r.pix_tipo, r.pix_chave), r.pix_favorecido?.trim(), r.pix_banco?.trim()].filter(Boolean).join(" · ");
}

/** Estado otimista do switch (a tela troca na hora): ligar um item desliga os demais; desligar só mexe nele. */
export function aplicarOtimista(itens: Recebimento[], otimista: { id: string; ativo: boolean } | null): Recebimento[] {
  if (!otimista) return itens;
  return itens.map((x) => (x.id === otimista.id ? { ...x, ativo: otimista.ativo } : otimista.ativo ? { ...x, ativo: false } : x));
}

/** Lista depois de salvar no popup: troca a linha editada ou acrescenta a nova (sem ir de novo ao banco). */
export function comLinhaSalva(rows: Recebimento[], salva: Recebimento): Recebimento[] {
  const existe = rows.some((x) => x.id === salva.id);
  const base = existe ? rows.map((x) => (x.id === salva.id ? salva : x)) : [...rows, salva];
  return ordenarRecebimentos(salva.ativo ? base.map((x) => (x.id === salva.id ? x : { ...x, ativo: false })) : base);
}

export function descricaoSwitch(r: Recebimento): string {
  if (!r.ativo) return "Desligado: não aparece pro aluno.";
  return r.tipo === "mercadopago"
    ? "Ligado: é por aqui que seus alunos pagam."
    : "Ligado: o aluno vê esta chave na tela Pagamentos e anexa o comprovante.";
}
