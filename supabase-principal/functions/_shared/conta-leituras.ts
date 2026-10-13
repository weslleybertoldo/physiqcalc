// Physiq hml-21a (H-43 · jeito 2, etapa 3, 12/10/2026) — o CATÁLOGO das leituras da função conta (ação `ler`), PURO: sem Deno, sem rede e
// sem banco. O motor comum (_shared/leitura-servidor.ts, H-112) lê o pedido por este catálogo e roda cada consulta COMO A PESSOA (o RLS e
// as RPCs de hoje decidem quem vê). Cada entrada declara os params (tipo e teto; o resto do corpo cai), a fonte (a RPC de leitura de hoje
// com os args montados no servidor, ou a tabela com as colunas em lista fechada, os filtros, a ordem e o teto) e o dono (consulta "minha":
// a coluna = quem chama, nunca um id do corpo).
// hml-21a — a casca (o sino, o aviso de membro removido, a situação da sessão) e o app do aluno (o Perfil, a Agenda, o Meu plano, os pratos
// prontos e a foto do perfil): as MESMAS leituras que as libs faziam no navegador no 53f2583 (v3.110), com as mesmas linhas:
//   · "minha" só onde a lib filtrava pelo id de quem está logado: a foto do perfil (o profiles de quem chama — app-aluno/perfil/Conta.tsx);
//   · o sino e o aviso de membro removido NÃO filtravam (o RLS decide: a única policy de leitura do `avisos` é destino_user_id =
//     auth.uid()) — aqui igual: outra conta lê os avisos DELA, nunca os de outra pessoa;
//   · as RPCs (definer, cada uma pelo auth.uid() lá dentro) devolvem o que já devolvem — o valor vai à lib como veio (ela confere o ok/erro
//     como hoje); os args que a lib mandava são os params (o corpo nunca vira arg).
// Os contadores da casca (o número de Alunos, o whatsapp_resumo e a faixa mensagens_desligadas) vão com a área deles (21b e 21c).
import type { CatalogoLeitura, ConsultaLeitura } from "./leitura-lote.ts";
import type { CatalogoDoServidor } from "./leitura-servidor.ts";

/** Os avisos do sino: os 30 mais novos (useAvisos.ts: .limit(30)). */
export const AVISOS_MAX = 30;
/** O tipo do aviso "Você não faz mais parte desta conta" (AvisoMembroRemovido.tsx: .eq("tipo", "membro_removido")). */
export const TIPO_MEMBRO_REMOVIDO = "membro_removido";
/** O maior inteiro do Postgres (o p_offset da minha_agenda_lista é integer). */
export const INT4_MAX = 2_147_483_647;
/** A minha_agenda_lista corta o limite em 100 (least(…, 100)); a tela pede 20 (POR_PAGINA). */
export const LIMITE_AGENDA_MAX = 100;
/** Um texto curto que a RPC confere (o tipo da lista da agenda, o objetivo): o teto barra o abuso, a RPC decide o valor. */
export const TEXTO_CURTO_MAX = 40;

/** As colunas de cada leitura de tabela = as que a lib/o tipo usam hoje (nenhum "*"). */
export const COLUNAS_DA_CONTA = {
  /** AvisoSino (src/ui/premium/useAvisos.ts:63) */
  avisos: ["id", "tipo", "titulo", "link", "lido_em", "criado_em"],
  /** AvisoRemovido (src/ui/avisos/AvisoMembroRemovido.tsx:37) */
  aviso_membro_removido: ["id", "titulo", "criado_em"],
  /** só a chave da foto do dados_profissionais (o JSON do perfil leva registro, CRN, WhatsApp… — fica no servidor) */
  perfil_foto: ["foto_url:dados_profissionais->>foto_url"],
} as const;

const desc = (coluna: string) => ({ coluna, asc: false }) as const;
const textoCurto = { tipo: "texto", max: TEXTO_CURTO_MAX } as const;

export const CONSULTAS_CONTA = {
  // ───── a casca (todas as áreas) ─────
  // o sino: os 30 avisos mais novos da pessoa (o RLS: só os dela), do mais novo para o mais velho
  avisos: {
    params: {},
    fonte: { tabela: "avisos", colunas: COLUNAS_DA_CONTA.avisos, teto: AVISOS_MAX, ordem: [desc("criado_em")] },
  },
  // o aviso "membro removido" ainda não lido (o mais novo): o tipo é o param — SÓ o "membro_removido" passa (a lib manda; nenhum outro)
  aviso_membro_removido: {
    params: { tipo: { tipo: "enum", valores: [TIPO_MEMBRO_REMOVIDO], obrigatorio: true } },
    fonte: {
      tabela: "avisos", colunas: COLUNAS_DA_CONTA.aviso_membro_removido, teto: 1, filtros: [{ param: "tipo", coluna: "tipo", op: "eq" }],
      nulos: ["lido_em"], ordem: [desc("criado_em")],
    },
  },
  // a situação de quem está logado (nucleo/sessao.tsx: a abertura com o pos-login feito, a volta da internet, o recarregar)
  situacao: { params: {}, fonte: { rpc: "minha_situacao" } },

  // ───── o app do aluno ─────
  // o card do aluno e "Meus profissionais" (Início, Perfil, Conta)
  meu_perfil_aluno: { params: {}, fonte: { rpc: "meu_perfil_aluno" } },
  // a agenda do aluno desde o início da janela (o ISO que a tela calcula; sem ele, o padrão da RPC)
  minha_agenda: { params: { desde: { tipo: "instante" } }, fonte: { rpc: "minha_agenda", args: { p_desde: "desde" } } },
  // o "Ver todas" da Agenda: a página (o offset e o limite que a lib manda — a RPC corta em 100) com o total
  minha_agenda_lista: {
    params: {
      tipo: { ...textoCurto, obrigatorio: true },
      offset: { tipo: "inteiro", min: 0, max: INT4_MAX, obrigatorio: true },
      limite: { tipo: "inteiro", min: 1, max: LIMITE_AGENDA_MAX, obrigatorio: true },
    },
    fonte: { rpc: "minha_agenda_lista", args: { p_tipo: "tipo", p_offset: "offset", p_limite: "limite" } },
  },
  // o Meu plano / as Boas-vindas do aluno sem profissional (os planos do app e a matrícula)
  meu_plano_app: { params: {}, fonte: { rpc: "meu_plano_app" } },
  // a Dieta › Pratos prontos do aluno sem profissional (o objetivo escolhido na tela; sem ele, o do aluno)
  pratos_prontos_do_app: { params: { objetivo: textoCurto }, fonte: { rpc: "pratos_prontos_do_app", args: { p_objetivo: "objetivo" } } },
  // a foto do perfil de quem chama (o profiles dele: id = o user do token) — só a chave da foto
  perfil_foto: {
    params: {},
    fonte: { tabela: "profiles", colunas: COLUNAS_DA_CONTA.perfil_foto, teto: 1 },
    dono: "id",
  },
} as const satisfies Record<string, ConsultaLeitura>;

export type ConsultaDaConta = keyof typeof CONSULTAS_CONTA;
export const CONSULTAS_DA_CONTA = Object.keys(CONSULTAS_CONTA) as ConsultaDaConta[];

/** O catálogo da conta para o motor comum (sem Storage, sem filtros a mais, o valor das RPCs como veio). */
export const CATALOGO_CONTA: CatalogoDoServidor = { consultas: CONSULTAS_CONTA as unknown as CatalogoLeitura };

/** A consulta, se está no catálogo; senão null. */
export function consultaDaConta(q: unknown): ConsultaLeitura | null {
  return typeof q === "string" && Object.prototype.hasOwnProperty.call(CONSULTAS_CONTA, q) ? (CONSULTAS_CONTA as Record<string, ConsultaLeitura>)[q] : null;
}
