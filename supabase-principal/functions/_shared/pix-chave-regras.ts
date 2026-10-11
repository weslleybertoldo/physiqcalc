// Physiq W1 — a chave Pix (tipos, validação, normalização e formatação) no SERVIDOR (jeito 2: a pagamentos-aluno valida o que a tela de Recebimento manda) e reexportada para a tela (src/lib/pixChave.ts). Sem Deno, sem rede.
export type PixTipo = "cpf" | "cnpj" | "email" | "telefone" | "aleatoria";

export const PIX_TIPOS: { value: PixTipo; label: string; placeholder: string }[] = [
  { value: "cpf", label: "CPF", placeholder: "000.000.000-00" },
  { value: "cnpj", label: "CNPJ", placeholder: "00.000.000/0000-00" },
  { value: "email", label: "E-mail", placeholder: "voce@exemplo.com" },
  { value: "telefone", label: "Telefone", placeholder: "(82) 99999-9999" },
  { value: "aleatoria", label: "Chave aleatória", placeholder: "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" },
];

export const soDigitos = (v: string) => v.replace(/\D/g, "");
export const telefoneNacional = (dig: string) => (dig.startsWith("55") && dig.length >= 12 ? dig.slice(2) : dig);

/** Mensagem de erro da chave Pix por tipo, ou null quando válida. */
export function validarChavePix(tipo: PixTipo | "", chave: string): string | null {
  const v = chave.trim();
  if (!tipo) return "Escolha o tipo da chave.";
  if (!v) return "Informe a chave Pix.";
  switch (tipo) {
    case "cpf": return soDigitos(v).length === 11 ? null : "CPF precisa ter 11 dígitos.";
    case "cnpj": return soDigitos(v).length === 14 ? null : "CNPJ precisa ter 14 dígitos.";
    case "email": return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v) ? null : "E-mail inválido.";
    case "telefone": {
      const n = telefoneNacional(soDigitos(v));
      return n.length === 10 || n.length === 11 ? null : "Telefone precisa ter DDD + número (10 ou 11 dígitos).";
    }
    case "aleatoria": return v.length >= 32 ? null : "Chave aleatória tem pelo menos 32 caracteres.";
  }
  return null;
}

/** Como a chave é gravada: CPF/CNPJ só dígitos, telefone +55DDDNÚMERO, e-mail minúsculo. */
export function normalizarChavePix(tipo: PixTipo, chave: string): string {
  const v = chave.trim();
  if (tipo === "cpf" || tipo === "cnpj") return soDigitos(v);
  if (tipo === "telefone") return `+55${telefoneNacional(soDigitos(v))}`;
  if (tipo === "email") return v.toLowerCase();
  return v;
}

/** Como a chave aparece na lista: CPF/CNPJ pontuados, telefone com DDD; o resto como está. */
export function formatarChavePix(tipo: PixTipo | null, chave: string | null): string {
  const v = (chave ?? "").trim();
  if (!v) return "";
  const d = soDigitos(v);
  if (tipo === "cpf" && d.length === 11) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
  if (tipo === "cnpj" && d.length === 14) return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
  if (tipo === "telefone") {
    const n = telefoneNacional(d);
    if (n.length === 11) return `(${n.slice(0, 2)}) ${n.slice(2, 7)}-${n.slice(7)}`;
    if (n.length === 10) return `(${n.slice(0, 2)}) ${n.slice(2, 6)}-${n.slice(6)}`;
  }
  return v;
}

export const rotuloPixTipo = (tipo: PixTipo | null) => PIX_TIPOS.find((t) => t.value === tipo)?.label ?? "Pix";

/** As colunas da chave que a função devolve à tela (as mesmas que a tela lia direto — RecebimentoPixDialog até a W1). */
export const COLUNAS_CHAVE = "id, conta_id, membro_id, tipo, chave, favorecido, banco, ativa, criado_em";

const textoOuNull = (v: unknown, max: number): string | null =>
  (typeof v === "string" ? v.trim().replace(/\s+/g, " ").slice(0, max) : "") || null;

/** O que a tela manda para salvar uma chave → o que vai para recebimento_chaves (ou a frase do erro, a mesma da tela). */
export function chaveDoPedido(b: Record<string, unknown>):
  { ok: true; dados: { tipo: PixTipo; chave: string; favorecido: string | null; banco: string | null } } | { ok: false; mensagem: string } {
  const tipo: PixTipo | "" = PIX_TIPOS.some((t) => t.value === b.tipo) ? (b.tipo as PixTipo) : "";
  const chave = typeof b.chave === "string" ? b.chave : "";
  const problema = validarChavePix(tipo, chave);
  if (problema) return { ok: false, mensagem: problema };
  return { ok: true, dados: { tipo: tipo as PixTipo, chave: normalizarChavePix(tipo as PixTipo, chave), favorecido: textoOuNull(b.favorecido, 120), banco: textoOuNull(b.banco, 80) } };
}
