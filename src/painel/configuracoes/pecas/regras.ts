// Configurações do profissional (W5): regras puras das abas Conta e Aplicativo (testadas em configuracoes.test.tsx).

export const ORIGEM_CONTA: Record<string, string> = {
  nova: "Criada no Physiq",
  legado_calc: "Veio do PhysiqCalc",
  legado_nutri: "Veio do PhysiqNutri",
};

export function validarNomeConta(nome: string): string | null {
  const n = nome.trim();
  if (n.length < 2) return "Dê um nome para a conta (ao menos 2 letras).";
  if (n.length > 80) return "O nome da conta pode ter até 80 caracteres.";
  return null;
}

/** "3.10" > "3.9"? (a versão do Physiq é MAJOR.MINOR[.PATCH], como a tag da release) */
export function versaoMaisNova(remota: string, local: string): boolean {
  const a = remota.replace(/^v/, "").split(".").map((n) => Number(n) || 0);
  const b = local.replace(/^v/, "").split(".").map((n) => Number(n) || 0);
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    if ((a[i] ?? 0) !== (b[i] ?? 0)) return (a[i] ?? 0) > (b[i] ?? 0);
  }
  return false;
}
