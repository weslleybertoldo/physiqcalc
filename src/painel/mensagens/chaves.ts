// Physiq W22 — chaves do react-query do Painel › Mensagens (num módulo pequeno: o número do menu, src/painel/contadores/Mensagens.ts,
// é carregado junto da casca do painel e usa a MESMA leitura do resumo da página).
export const CHAVES_MENSAGENS = {
  tudo: ["mensagens"] as const,
  resumo: (contaId: string, uid: string) => ["mensagens", "resumo", contaId, uid] as const,
  /** o número do menu usa o mesmo resumo (uma leitura só) */
  resumoPrefixo: ["mensagens", "resumo"] as const,
  perfil: (uid: string) => ["mensagens", "perfil", uid] as const,
  conexao: (uid: string) => ["mensagens", "conexao", uid] as const,
  fila: (contaId: string, uid: string, escopo: string, filtro: string) => ["mensagens", "fila", contaId, uid, escopo, filtro] as const,
  filaPrefixo: ["mensagens", "fila"] as const,
};
