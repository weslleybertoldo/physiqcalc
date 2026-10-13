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
// hml-21b (13/10/2026): + a Agenda (do profissional e do aluno), os Alunos (lista, filtros, seletor, pendentes, convites, o número do menu,
// a Busca) e a parte não saúde do Dashboard — CONSULTAS_AGENDA e CONSULTAS_ALUNOS (o bloco 21b da §2.2), no fim deste arquivo.
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

// ───────────────────────── hml-21b — a Agenda (do profissional e do aluno), os Alunos e a parte não saúde do Dashboard ─────────────────────────
// As MESMAS leituras que as libs faziam no navegador no d357719 (v3.112) — src/painel/agenda/dados.ts, src/app-aluno/perfil/agenda/api.ts,
// src/painel/alunos/{api,novosPorMes}.ts e o buscarEquipe de src/painel/configuracoes/equipe/api.ts —, com as mesmas linhas:
//   · "minha" só onde a lib filtra pelo id de quem está logado: o minhaOuDaConta da Agenda (calendários, agendamentos, bloqueios, travas e os
//     alunos do seletor da Agenda: o `uid` que a tela passava era o de quem está logado) — aqui o recorte "meu_ou_da_conta" com o user do
//     token e a conta do param (sem a conta, só o meu); nada de dono no corpo;
//   · onde a lib passa o profissional/os donos/o aluno/a conta e o RLS ou a RPC decide (as tags dos donos, as regras do profissional, o
//     aluno pelo id, as RPCs da conta e do aluno), o servidor faz igual: o mesmo filtro, o RLS e a RPC de hoje;
//   · as colunas = as que a lib lia: o select("*") de hoje escrito coluna a coluna (a linha inteira, na ordem da tabela — o PADRÃO da 20b)
//     e os selects explícitos dos alunos (nenhum "*"); o teto 1000 onde a lib lia sem limite (o max_rows do PostgREST) ou com 1000;
//   · as RPCs (definer, cada uma pelo auth.uid() lá dentro) devolvem o que já devolvem — o { ok: false, erro } vai à lib, que confere como
//     hoje; os args que a lib mandava são os params (os que ela mandava nulos ficam de fora: o padrão nulo da RPC).
/** O "agora" ou um instante da janela da Agenda: o ISO que a tela calcula (toISOString). */
const instante = { tipo: "instante", obrigatorio: true } as const;
/** Um uuid obrigatório (o calendário, o aluno, a conta das RPCs da conta). */
const uuidObrigatorio = { tipo: "uuid", obrigatorio: true } as const;
/** A conta ativa (opcional nas leituras da Agenda: sem ela, só o que é meu — o contaId || null da tela). */
const contaOpcional = { tipo: "uuid" } as const;
const asc = (coluna: string) => ({ coluna, asc: true }) as const;
/** O recorte da Agenda: o que é MEU (a coluna do dono = quem chama) + o que é da conta do param. */
const minhaOuDaConta = (coluna: string) => ({ modelo: "meu_ou_da_conta", param: "conta", coluna }) as const;

/** O maior inteiro do Postgres (os p_offset/p_limite/p_duracao são integer; a RPC decide o valor). */
const INT4_MIN = -2_147_483_648;
/** Os profissionais das tags de uma leitura (a lista de donos: eu + os donos dos calendários que vejo; no Dashboard, os das consultas). */
export const DONOS_MAX = 200;
/** As consultas que a página Alunos pede de uma vez (a exportação e o "selecionar todos" em lotes de 500 — a RPC corta em 500). */
export const LIMITE_ALUNOS_MAX = 500;
/** Os meses do card "Novos alunos por mês" (a tela pede 6; a RPC aceita o que vier). */
export const MESES_NOVOS_MAX = 120;
/** Os bloqueios futuros do painel lateral (listarBloqueiosFuturos: .limit(50)). */
export const BLOQUEIOS_FUTUROS_MAX = 50;

/**
 * As colunas de cada leitura de tabela da 21b. As libs liam com select("*"): aqui a linha inteira escrita coluna a coluna (o Row do tipo
 * gerado = as colunas do catálogo do staging, na ordem da tabela — conferido em 13/10, hml21/medicao/agenda21b_colunas.txt; nenhum "*") —
 * o MESMO objeto que a tela recebia; o select dos alunos da Agenda é o explícito da lib.
 */
export const COLUNAS_DA_AGENDA = {
  /** Calendario (src/painel/agenda/dados.ts:95 — select("*")) */
  calendarios: [
    "id", "nutricionista_id", "nome", "cor", "padrao", "faixa_inicio", "faixa_fim", "created_at", "updated_at", "deleted_at", "conta_id", "slot_minutos",
    "tag_padrao_id",
  ],
  /** Agendamento (dados.ts:215 — select("*")) */
  agendamentos: [
    "id", "nutricionista_id", "calendario_id", "paciente_id", "titulo", "inicio", "fim", "dia_inteiro", "status", "confirmacao", "observacao", "created_at",
    "updated_at", "deleted_at", "modulo", "conta_id", "reagendamentos", "mes_referencia", "origem", "aluno_respondeu_em", "aviso_email_em", "tag_id",
  ],
  /** as tags (dados.ts:146 — select("*"); a tela passa no normalizarTag) */
  agenda_tags: ["id", "profissional_id", "nome", "cor", "area", "base", "ordem", "created_at", "deleted_at"],
  /** Bloqueio (dados.ts:244/252 — select("*")) */
  bloqueios_agenda: ["id", "nutricionista_id", "calendario_id", "inicio", "fim", "motivo", "created_at", "conta_id"],
  /** as travas (dados.ts:282 — select("*"); a tela passa no linhaTrava) */
  agenda_travas: ["id", "profissional_id", "conta_id", "calendario_id", "dias", "hora_inicio", "hora_fim", "motivo", "created_at"],
  /** as regras (dados.ts:301 — select("*"); a tela passa no normalizarRegras: a linha existir = "configurada") */
  agenda_config: [
    "profissional_id", "slot_minutos", "atende_inicio", "atende_fim", "dias", "reagendamentos_max", "janela_reagendamento", "desistencia", "created_at",
    "updated_at",
  ],
  /** AlunoAgenda (dados.ts:334/342 — o select explícito da lib) */
  alunos: ["id", "nome", "apelido", "foto_url", "personal_id", "nutricionista_id", "user_id", "email"],
} as const;

/** O select do aluno do seletor (src/painel/alunos/api.ts:107, alunoDoSeletorPorId) — sem e com o CPF (só o Recibo pede). */
export const COLUNAS_DOS_ALUNOS = {
  seletor: [
    "id", "nome", "apelido", "email", "telefone", "foto_url", "ativo", "acesso_bloqueado_em", "user_id", "personal_id", "nutricionista_id",
    "conta_excluida_em:config->>conta_excluida_em",
  ],
  seletor_com_cpf: [
    "id", "nome", "apelido", "email", "telefone", "cpf", "foto_url", "ativo", "acesso_bloqueado_em", "user_id", "personal_id", "nutricionista_id",
    "conta_excluida_em:config->>conta_excluida_em",
  ],
} as const;

/** Os filtros da lista de alunos (o p_filtros da alunos_da_conta: os que o filtrosParaServidor da tela manda + o exportar) — texto; a RPC decide. */
export const FILTROS_DOS_ALUNOS = [
  "situacao", "q", "modulo", "responsavel", "tag", "pagamento", "genero", "cadastro_de", "cadastro_ate", "modificado_de", "modificado_ate", "ordem", "exportar",
] as const;
/** O teto de cada filtro (o termo da busca é o maior; o resto são palavras curtas e instantes). */
export const FILTRO_ALUNOS_MAX = 200;
/**
 * hml-21b (a varredura das recusas conhecidas — decisão da sessão principal 13/10 06:31): os códigos que a w14_matricula_da_rota LEVANTA de
 * propósito (migration 20260930160000_w14_ajustes.sql:727 — sem login; o aluno existe e a pessoa não pode; o aluno não existe). A
 * aluno_compromissos e a aluno_definir_pacote começam por ela: a recusa volta como o código (o que a tela recebia hoje), não como
 * erro_interno com o aviso de erro inesperado.
 */
export const ERROS_DA_MATRICULA_DA_ROTA = ["sem_login", "sem_acesso", "aluno_inexistente"] as const;
const filtroDoAluno = { tipo: "texto", max: FILTRO_ALUNOS_MAX } as const;
/** Cada filtro como texto com teto (os que não estão aqui caem — o p_filtros nunca leva chave de fora). */
const CAMPOS_DOS_FILTROS = Object.fromEntries(FILTROS_DOS_ALUNOS.map((k) => [k, filtroDoAluno])) as Record<(typeof FILTROS_DOS_ALUNOS)[number], typeof filtroDoAluno>;

export const CONSULTAS_AGENDA = {
  // ───── Painel › Agenda (e o Dashboard: os agendamentos de 14 dias, os alunos e as tags) ─────
  // os calendários vivos que eu vejo: os meus + os da conta ativa (o dono vê a equipe; o RLS decide o resto), do mais velho ao mais novo
  agenda_calendarios: {
    params: { conta: contaOpcional },
    fonte: { tabela: "calendarios", colunas: COLUNAS_DA_AGENDA.calendarios, teto: 1000, vivas: true, recorte: minhaOuDaConta("nutricionista_id"), ordem: [asc("created_at")] },
  },
  // as tags vivas destes profissionais (o meu + os donos dos calendários que vejo) — sempre por profissional_id (o master lê todas pelo RLS)
  agenda_tags: {
    params: { donos: { tipo: "uuids", max: DONOS_MAX, obrigatorio: true } },
    fonte: {
      tabela: "agenda_tags", colunas: COLUNAS_DA_AGENDA.agenda_tags, teto: 1000, vivas: true, filtros: [{ param: "donos", coluna: "profissional_id", op: "in" }],
      ordem: [asc("ordem"), asc("created_at")],
    },
  },
  // os agendamentos vivos que tocam [de, ate) — meus + da conta —, os 1000 MAIS RECENTES (do fim para o começo: a lib desvira)
  agenda_agendamentos: {
    params: { de: instante, ate: instante, conta: contaOpcional },
    fonte: {
      tabela: "agendamentos", colunas: COLUNAS_DA_AGENDA.agendamentos, teto: 1000, vivas: true, recorte: minhaOuDaConta("nutricionista_id"),
      filtros: [{ param: "ate", coluna: "inicio", op: "lt" }, { param: "de", coluna: "fim", op: "gt" }], ordem: [desc("inicio"), desc("id")],
    },
  },
  // os bloqueios que tocam [de, ate) — meus + da conta —, por início
  agenda_bloqueios: {
    params: { de: instante, ate: instante, conta: contaOpcional },
    fonte: {
      tabela: "bloqueios_agenda", colunas: COLUNAS_DA_AGENDA.bloqueios_agenda, teto: 1000, recorte: minhaOuDaConta("nutricionista_id"),
      filtros: [{ param: "ate", coluna: "inicio", op: "lt" }, { param: "de", coluna: "fim", op: "gt" }], ordem: [asc("inicio")],
    },
  },
  // os bloqueios ainda vigentes ou futuros (o painel lateral): fim ≥ o agora da tela, os 50 primeiros por início
  agenda_bloqueios_futuros: {
    params: { agora: instante, conta: contaOpcional },
    fonte: {
      tabela: "bloqueios_agenda", colunas: COLUNAS_DA_AGENDA.bloqueios_agenda, teto: BLOQUEIOS_FUTUROS_MAX, recorte: minhaOuDaConta("nutricionista_id"),
      filtros: [{ param: "agora", coluna: "fim", op: "gte" }], ordem: [asc("inicio")],
    },
  },
  // as travas recorrentes — minhas + da conta —, pela hora de início
  agenda_travas: {
    params: { conta: contaOpcional },
    fonte: { tabela: "agenda_travas", colunas: COLUNAS_DA_AGENDA.agenda_travas, teto: 1000, recorte: minhaOuDaConta("profissional_id"), ordem: [asc("hora_inicio")] },
  },
  // as regras de um profissional (a tela pede as de quem está logado; o RLS deixa o dono ler as da equipe), 1 linha (a chave é o profissional)
  agenda_regras: {
    params: { profissional: uuidObrigatorio },
    fonte: { tabela: "agenda_config", colunas: COLUNAS_DA_AGENDA.agenda_config, teto: 1, filtros: [{ param: "profissional", coluna: "profissional_id", op: "eq" }] },
  },
  // os horários de UM dia de um calendário (a conta do banco: slots, regras e o slot do calendário); duração e "ignorar" só se a tela mandou
  agenda_horarios: {
    params: { calendario: uuidObrigatorio, dia: { tipo: "data", obrigatorio: true }, duracao: { tipo: "inteiro", min: INT4_MIN, max: INT4_MAX }, ignorar: { tipo: "uuid" } },
    fonte: { rpc: "agenda_horarios", args: { p_calendario: "calendario", p_de: "dia", p_ate: "dia", p_duracao: "duracao", p_ignorar: "ignorar" }, erros: ["sem_login"] },
  },
  // os alunos ativos do seletor da Agenda (os da conta + os meus; sem conta, só os meus), por nome, até 1000
  agenda_alunos: {
    params: { conta: contaOpcional },
    fonte: {
      tabela: "pacientes", colunas: COLUNAS_DA_AGENDA.alunos, teto: 1000, vivas: true, fixos: [{ coluna: "ativo", valor: true }],
      recorte: { ...minhaOuDaConta("nutricionista_id"), contaPrimeiro: true }, ordem: [asc("nome")],
    },
  },
  // o aluno do ?aluno= da Agenda, pelo id (vivo; o RLS decide se é visível) — 0 linha = null na tela
  agenda_aluno: {
    params: { id: uuidObrigatorio },
    fonte: { tabela: "pacientes", colunas: COLUNAS_DA_AGENDA.alunos, teto: 1, vivas: true, filtros: [{ param: "id", coluna: "id", op: "eq" }] },
  },
  // o card "Próximos compromissos" e o pacote do aluno (Aluno › Resumo)
  aluno_compromissos: { params: { aluno: uuidObrigatorio }, fonte: { rpc: "aluno_compromissos", args: { p_aluno: "aluno" }, erros: ERROS_DA_MATRICULA_DA_ROTA } },

  // ───── a Agenda do aluno (app › Perfil › Agenda) ─────
  // as regras e o pacote de cada profissional do aluno
  minhas_regras_agenda: { params: {}, fonte: { rpc: "minhas_regras_agenda" } },
  // os horários livres para reagendar uma consulta (agendamento) ou marcar a do pacote (profissional), na janela de/ate (datas)
  aluno_agenda_horarios: {
    params: { agendamento: { tipo: "uuid" }, profissional: { tipo: "uuid" }, de: { tipo: "data" }, ate: { tipo: "data" } },
    fonte: {
      rpc: "aluno_agenda_horarios", args: { p_agendamento: "agendamento", p_profissional: "profissional", p_de: "de", p_ate: "ate" },
      erros: ["agendamento_inexistente", "sem_login"],
    },
  },
} as const satisfies Record<string, ConsultaLeitura>;

export const CONSULTAS_ALUNOS = {
  // a lista da página Alunos, a exportação (exportar: "true"), o seletor, a Busca (Ctrl K) e o número do menu (limite 0): a MESMA RPC
  alunos_da_conta: {
    params: {
      conta: uuidObrigatorio,
      filtros: { tipo: "objeto", campos: CAMPOS_DOS_FILTROS },
      offset: { tipo: "inteiro", min: 0, max: INT4_MAX },
      limite: { tipo: "inteiro", min: 0, max: LIMITE_ALUNOS_MAX },
    },
    fonte: { rpc: "alunos_da_conta", args: { p_conta: "conta", p_filtros: "filtros", p_offset: "offset", p_limite: "limite" } },
  },
  // o aluno já escolhido no seletor (o ?aluno=, a consulta, a movimentação): só desta conta e vivo; o CPF só com o com_cpf (o Recibo)
  aluno_do_seletor: {
    params: { conta: uuidObrigatorio, id: uuidObrigatorio, com_cpf: { tipo: "booleano" } },
    fonte: {
      tabela: "pacientes", colunas: COLUNAS_DOS_ALUNOS.seletor, colunasSe: { param: "com_cpf", colunas: COLUNAS_DOS_ALUNOS.seletor_com_cpf }, teto: 1, vivas: true,
      filtros: [{ param: "id", coluna: "id", op: "eq" }, { param: "conta", coluna: "conta_id", op: "eq" }],
    },
  },
  // os convites de aluno da conta (Novo aluno) e os cadastros pendentes (Pendentes)
  aluno_convites: { params: { conta: uuidObrigatorio }, fonte: { rpc: "aluno_convites", args: { p_conta: "conta" } } },
  alunos_pendentes: { params: { conta: uuidObrigatorio }, fonte: { rpc: "alunos_pendentes", args: { p_conta: "conta" } } },
  // o card "Novos alunos por mês" e o "+N este mês" do Dashboard (a mesma consulta)
  alunos_novos_por_mes: {
    params: { conta: uuidObrigatorio, meses: { tipo: "inteiro", min: 1, max: MESES_NOVOS_MAX } },
    fonte: { rpc: "alunos_novos_por_mes", args: { p_conta: "conta", p_meses: "meses" } },
  },
  // a equipe da conta (Configurações › Equipe e os seletores do dono na Agenda, no Financeiro e na Pré-consulta) — só a leitura (21b)
  equipe_da_conta: { params: { conta: uuidObrigatorio }, fonte: { rpc: "equipe_da_conta", args: { p_conta: "conta" } } },
} as const satisfies Record<string, ConsultaLeitura>;

/** Todas as consultas da função: a 21a (a casca e o app do aluno) + a 21b (a Agenda e os Alunos). */
const TODAS = { ...CONSULTAS_CONTA, ...CONSULTAS_AGENDA, ...CONSULTAS_ALUNOS };

export type ConsultaDaConta = keyof typeof TODAS;
/** As consultas da 21a (a casca e o app do aluno) — a lista que o teste da 21a fixa. */
export const CONSULTAS_DA_CONTA = Object.keys(CONSULTAS_CONTA) as Array<keyof typeof CONSULTAS_CONTA>;
/** hml-21b: as consultas da Agenda e dos Alunos. */
export const CONSULTAS_DA_21B = [...Object.keys(CONSULTAS_AGENDA), ...Object.keys(CONSULTAS_ALUNOS)] as ConsultaDaConta[];
/** Todas as consultas da função, na ordem (21a e 21b). */
export const TODAS_AS_CONSULTAS = Object.keys(TODAS) as ConsultaDaConta[];

/** O catálogo da conta para o motor comum (sem Storage, sem filtros a mais, o valor das RPCs como veio) — as 21a e as 21b. */
export const CATALOGO_CONTA: CatalogoDoServidor = { consultas: TODAS as unknown as CatalogoLeitura };

/** A consulta, se está no catálogo (21a ou 21b); senão null. */
export function consultaDaConta(q: unknown): ConsultaLeitura | null {
  return typeof q === "string" && Object.prototype.hasOwnProperty.call(TODAS, q) ? (TODAS as Record<string, ConsultaLeitura>)[q] : null;
}
