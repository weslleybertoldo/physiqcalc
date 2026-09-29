/**
 * Redirecionamentos das rotas antigas dos 2 apps para as rotas do Physiq (spec 4.8). Links salvos,
 * favoritos, links "já logado" e (depois da W28) tudo o que chega por nutri.physiqcalc.com.br continuam
 * valendo: a query e o # vão junto, e o que a regra acrescenta (ex.: `?aba=respostas`) entra por cima.
 *
 * Função pura (testada linha a linha da tabela 4.8 em redirecionamentos.test.ts); o roteador só chama
 * `destinoDaRotaAntiga()` nas rotas de ROTAS_ANTIGAS.
 */

/** Grupo do "Configurar aluno" do Calc (`?ct=`) → aba do perfil do aluno (tabela do fim da 5.2). */
export const ABA_DO_CT: Record<string, AbaAluno> = {
  dados: "resumo",
  geral: "resumo",
  dobras: "avaliacao",
  evolucao: "avaliacao",
  registros: "avaliacao",
  treino: "treino",
  historico: "treino",
  config: "treino",
  plano: "financeiro",
};

export type AbaAluno = "resumo" | "treino" | "dieta" | "avaliacao" | "prontuario" | "financeiro";

/** Seção do prontuário do Nutri (`/pacientes/:id/<seção>`) → aba (tabela do fim da 5.2). */
export const ABA_DA_SECAO_NUTRI: Record<string, AbaAluno> = {
  perfil: "resumo",
  acompanhamento: "dieta",
  "calculo-energetico": "dieta",
  planejamento: "dieta",
  suplementos: "dieta",
  metas: "dieta",
  manipulados: "dieta",
  orientacoes: "dieta",
  antropometria: "avaliacao",
  evolucao: "avaliacao",
  "avaliacao-integrada": "prontuario",
  consultas: "prontuario",
  anamnese: "prontuario",
  questionarios: "prontuario",
  exames: "prontuario",
  gestacional: "prontuario",
  prontuario: "prontuario",
  documentos: "prontuario",
  anexos: "prontuario",
  "farmaco-nutrientes": "prontuario",
  financeiro: "financeiro",
};

/** Seção das Configurações antigas do Calc (`?s=`) → aba nova de Configurações. */
const ABA_CONFIG_DO_S: Record<string, string> = { perfil: "perfil", convite: "convite", recebimento: "recebimento" };

/** Rotas antigas que o roteador registra (cada uma cai em `destinoDaRotaAntiga`). */
export const ROTAS_ANTIGAS: readonly string[] = [
  // PhysiqCalc
  "/treinos",
  "/avaliacao",
  "/pagamentos",
  "/login",
  "/admin",
  "/admin/alunos",
  "/admin/alunos/:id",
  "/admin/alunos/:id/ver",
  "/admin/treinos",
  "/admin/cobranca",
  "/admin/planos",
  "/admin/configuracoes",
  "/admin/calculadora",
  "/master/professores",
  // PhysiqNutri
  "/dashboard",
  "/pacientes",
  "/pacientes/:id",
  "/pacientes/:id/:secao",
  "/agenda",
  "/pre-consulta",
  "/respostas-pre-consulta",
  "/whatsapp",
  "/favoritos",
  "/alimentos",
  "/receitas",
  "/diario",
  "/financeiro",
  "/impressos",
  "/lixeira",
  "/configuracoes",
  "/master/profissionais",
  "/app",
  "/app/plano",
  "/app/orientacoes",
  "/app/metas",
  "/app/diario",
  "/app/agenda",
  "/app/recibos",
  "/app/entrar",
  "/entrar/nutricionista",
];

/** Troca direta caminho → caminho (com parâmetros extras opcionais). */
const DIRETAS: Record<string, string> = {
  "/treinos": "/treino",
  "/avaliacao": "/evolucao",
  "/pagamentos": "/perfil/pagamentos",
  "/login": "/entrar",
  "/admin/alunos": "/painel/alunos",
  "/admin/treinos": "/painel/treinos",
  "/admin/cobranca": "/painel/financeiro",
  "/admin/planos": "/painel/configuracoes/plano",
  "/admin/calculadora": "/painel/calculadora",
  "/master/professores": "/master/contas",
  "/dashboard": "/painel",
  "/pacientes": "/painel/alunos",
  "/agenda": "/painel/agenda",
  "/pre-consulta": "/painel/pre-consulta",
  "/respostas-pre-consulta": "/painel/pre-consulta?aba=respostas",
  "/whatsapp": "/painel/mensagens",
  "/favoritos": "/painel/modelos",
  "/alimentos": "/painel/dietas?aba=alimentos",
  "/receitas": "/painel/dietas?aba=receitas",
  "/diario": "/painel/dietas?aba=diario",
  "/financeiro": "/painel/financeiro",
  "/impressos": "/painel/impressos",
  "/lixeira": "/painel/lixeira",
  "/configuracoes": "/painel/configuracoes",
  "/master/profissionais": "/master/contas",
  "/app": "/",
  "/app/plano": "/dieta",
  "/app/orientacoes": "/dieta?ver=orientacoes",
  "/app/metas": "/dieta?ver=metas",
  "/app/diario": "/dieta?ver=diario",
  "/app/agenda": "/perfil/agenda",
  "/app/recibos": "/perfil/pagamentos",
  "/app/entrar": "/entrar/email",
  "/entrar/nutricionista": "/entrar",
};

function semBarraNoFim(caminho: string): string {
  return caminho.length > 1 ? caminho.replace(/\/+$/, "") : caminho;
}

/** Junta destino (que pode ter query) + query antiga + #. A query do destino vence em caso de chave repetida. */
export function montarUrl(destino: string, queryAntiga = "", hash = "", tirar: string[] = []): string {
  const [caminho, queryDestino = ""] = destino.split("?");
  const params = new URLSearchParams(queryAntiga.startsWith("?") ? queryAntiga.slice(1) : queryAntiga);
  tirar.forEach((k) => params.delete(k));
  new URLSearchParams(queryDestino).forEach((valor, chave) => params.set(chave, valor));
  const q = params.toString();
  const h = hash && hash !== "#" ? (hash.startsWith("#") ? hash : `#${hash}`) : "";
  return `${caminho}${q ? `?${q}` : ""}${h}`;
}

function caminhoDoAluno(id: string, aba: AbaAluno): string {
  const base = `/painel/alunos/${encodeURIComponent(id)}`;
  return aba === "resumo" ? base : `${base}/${aba}`;
}

/**
 * Destino novo para uma rota antiga, ou null se o caminho não é rota antiga.
 * Ex.: ("/admin/alunos/u1", "?ct=treino&wt=volume") → "/painel/alunos/u1/treino?ct=treino&wt=volume".
 */
export function destinoDaRotaAntiga(pathname: string, search = "", hash = ""): string | null {
  const caminho = semBarraNoFim(pathname);
  const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);

  // /admin?v=config&u=<id>&ct=… (links de antes da sidebar, 12/09/2026 — o AdminRedirect antigo)
  if (caminho === "/admin") {
    const v = params.get("v");
    const u = params.get("u");
    const manter = (chaves: string[]) => {
      const q = new URLSearchParams();
      chaves.forEach((k) => {
        const valor = params.get(k);
        if (valor) q.set(k, valor);
      });
      return q.toString() ? `?${q.toString()}` : "";
    };
    if (v === "config" && u) {
      const ct = params.get("ct") ?? "";
      return montarUrl(caminhoDoAluno(u, ABA_DO_CT[ct] ?? "resumo"), manter(["ct", "wt"]), hash);
    }
    if (v === "view" && u) return montarUrl(caminhoDoAluno(u, "resumo"), "?ct=dados", hash);
    if (v === "treinos") return montarUrl("/painel/treinos", manter(["t", "pasta"]), hash);
    if (v === "calculator") return montarUrl("/painel/calculadora", "", hash);
    return montarUrl("/painel", "", hash);
  }

  // /admin/alunos/:id[/ver] — o id é o do Banco do Treino (a W13 passa a usar o da matrícula e acha pelo do Treino)
  let m = caminho.match(/^\/admin\/alunos\/([^/]+)\/ver$/);
  if (m) return montarUrl(caminhoDoAluno(decodeURIComponent(m[1]), "resumo"), "?ct=dados", hash);
  m = caminho.match(/^\/admin\/alunos\/([^/]+)$/);
  if (m) {
    const ct = params.get("ct") ?? "";
    return montarUrl(caminhoDoAluno(decodeURIComponent(m[1]), ABA_DO_CT[ct] ?? "resumo"), search, hash);
  }

  // /admin/configuracoes?s=convite → a aba certa das Configurações novas
  if (caminho === "/admin/configuracoes") {
    const aba = ABA_CONFIG_DO_S[params.get("s") ?? ""];
    return montarUrl(aba ? `/painel/configuracoes/${aba}` : "/painel/configuracoes", search, hash);
  }

  // /pacientes/:id/<seção> (Nutri) — a seção vira a aba; `secao` fica na query para a aba abrir a parte certa
  m = caminho.match(/^\/pacientes\/([^/]+)(?:\/([^/]+))?$/);
  if (m) {
    const id = decodeURIComponent(m[1]);
    const secao = m[2] ? decodeURIComponent(m[2]) : "";
    const aba = ABA_DA_SECAO_NUTRI[secao] ?? "resumo";
    const extra = secao && aba !== "resumo" && secao !== aba ? `?secao=${encodeURIComponent(secao)}` : "";
    return montarUrl(`${caminhoDoAluno(id, aba)}${extra}`, search, hash);
  }

  const direta = DIRETAS[caminho];
  if (direta) return montarUrl(direta, search, hash);
  return null;
}
