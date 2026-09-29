/**
 * Última área usada por quem é profissional e também aluno (spec 4.2: "troca pelo menu do usuário").
 * O profissional abre direto no painel (C12); se trocou para o app de aluno, na próxima abertura
 * volta para o app — útil para quem treina pelo APK.
 */
export type Area = "painel" | "aluno";

const CHAVE = "physiq_area";

export function lembrarArea(area: Area): void {
  try {
    localStorage.setItem(CHAVE, area);
  } catch {
    /* sem armazenamento: vale o padrão */
  }
}

export function ultimaArea(): Area | null {
  try {
    const v = localStorage.getItem(CHAVE);
    return v === "painel" || v === "aluno" ? v : null;
  } catch {
    return null;
  }
}
