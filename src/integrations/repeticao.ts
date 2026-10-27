// Physiq hml-06 (H-20) — o fetch dos 2 clientes do supabase-js (o do principal, src/integrations/principal/client.ts, e o do
// Treino, src/integrations/supabase/client.ts): timeout de 15 s por tentativa e nova tentativa em 5xx, 429 e rede — mas SÓ no
// que é leitura (GET/HEAD e as RPCs que o Postgres marca STABLE/IMMUTABLE, que não podem gravar). POST/PATCH/PUT/DELETE de
// tabela, as RPCs VOLATILE, toda função (/functions/v1/*: cobrança, envio de e-mail/WhatsApp), o /auth/v1/* (o GoTrue repete
// o refresh sozinho) e o upload do Storage vão UMA vez: o servidor pode ter feito e só a resposta se perdido (a pagamentos-aluno
// cobrava o cartão de novo). RPC nova no front entra em RPC_SO_LEITURA ou em RPC_QUE_GRAVAM (o repeticao.test.ts confere).
// hml-10 (H-26, D5): a resposta FINAL ≥ 500 de uma função (/functions/v1/<slug>, menos a própria erro-avisar) vira aviso ao
// Weslley ("função <slug> · HTTP <st>", com "(Treino)" quando é do Treino: cada cliente diz de qual banco é) — src/lib/avisoDeErro.ts.
// O aviso não muda nada para quem chamou: a resposta volta igual.
// hml-14 (H-32, D5): função espera 25 s (TEMPO_FUNCAO_MS); tabela, RPC, Auth e Storage seguem com o tempo de quem criou (15 s nos
// 2 clientes). Os fetch diretos do front (login, treino-leitura, invokeEdge, release do GitHub, foto) usam criarFetchResiliente(0, ms).
// hml-20a (H-42 · decisão 18): as LEITURAS de saúde passam por funções (POST). Para não perder a nova tentativa que o GET tinha, o POST de
// função repete quando o CORPO é de leitura, numa lista fechada (ACOES_DE_LEITURA: a `ler` da nutricao e da financeiro, a minha_evolucao
// da admin-avaliacoes) — o campo é o que a função lê. Qualquer outra ação dessas funções (as gravações) segue indo 1 vez.
// hml-21a (H-43 · jeito 2, etapa 3): + o `ler` da função conta em ACOES_DE_LEITURA (repete 1 vez, como o GET de hoje; as ações dela não);
// as 14 RPCs que saíram do navegador (a casca e o app do aluno: 6 de leitura e 8 que gravam) saíram das 2 listas — o front não as chama
// mais (a conta chama no servidor). O E2E que mede o front ANTIGO (o "antes" do staging) soma as 6 de leitura à lista da Guarda dele
// (e2e/hml21/_base.py), no molde do RPCS_DO_APP da hml-19b.
// hml-21c (H-43): + as 25 RPCs do Aluno › Resumo, das Configurações, da Mensagens, da Lixeira (e a faixa da casca) saíram das 2 listas (7 de
// leitura e 18 que gravam: a função conta as chama no servidor) — sobram em RPC_QUE_GRAVAM só as 5 dos links públicos (o desvio 21). O E2E
// que mede o front ANTIGO soma as 7 de leitura à Guarda dele (RPCS_DE_LEITURA_DA_21C, e2e/hml21/_base.py).
import type { BancoErro } from "../../supabase-principal/functions/_shared/erros";
import { avisarErro, type AvisoDoApp } from "@/lib/avisoDeErro";

/**
 * hml-14 (H-32, D5): o MÍNIMO que o front espera uma função (/functions/v1/*). Medido na hml-14 (7 dias): pelo supabase-js, a
 * admin-semana-treinos chega a 14,0 s, o pos-login a 13,5 s e a admin-get-user a 13,2 s — rente aos 15 s de antes. A função tem
 * orçamento de 20 s e assim responde o próprio erro antes de o front desistir. Quem cria com mais (o login, 40 s) fica com o seu.
 */
export const TEMPO_FUNCAO_MS = 25_000;

/**
 * hml-17 (H-53): quantas vezes a MAIS os 2 clientes repetem uma leitura (em 5xx, 429 e rede) — era 2. Com o `retry: 1` do React
 * Query (src/integrations/consultas.ts), uma consulta com a API fora faz no máximo 2 × 2 = 4 pedidos e avisa em ~3 s (eram 12 e
 * ~19 s). Cobre a falha passageira de 1–2 s (a espera da nova tentativa é 1 s).
 */
export const TENTATIVAS_LEITURA = 1;

/**
 * As 39 RPCs STABLE/IMMUTABLE que o front chama (pg_proc, public = staging, lido em 08/10/2026; + a aluno_responsavel da hml-12,
 * STABLE pela migração 20261008200000; + as 5 das listas da hml-14b, STABLE pelas migrações 20261009010000 e 20261009040000; + as
 * 6 da hml-14d, STABLE pelas migrações 20261009050000 (Treino), 20261009070000 e 20261009080000; + as 3 do plano alimentar da
 * hml-17, STABLE pela migração 20261010100000): podem repetir. hml-21a: saíram as 6 que a função conta chama (meu_perfil_aluno,
 * meu_plano_app, minha_agenda, minha_agenda_lista, minha_situacao, pratos_prontos_do_app) — eram 45. hml-21b: saíram as 9 da Agenda e dos
 * Alunos que a função conta chama (agenda_horarios, aluno_agenda_horarios, aluno_compromissos, aluno_convites, alunos_da_conta,
 * alunos_novos_por_mes, alunos_pendentes, equipe_da_conta, minhas_regras_agenda) — eram 39. hml-21c: saíram as 7 do Resumo, das
 * Configurações, da Mensagens, da Lixeira e da faixa que a função conta chama (aluno_responsavel, lixeira_da_conta, mensagens_desligadas,
 * paciente_dado_livre, w2l_prontuarios_para_baixar, whatsapp_fila, whatsapp_resumo) — eram 30.
 */
export const RPC_SO_LEITURA = new Set<string>([
  "aluno_anotacoes", "aluno_evolucao",
  "aluno_perfil", "aluno_treino",
  "financeiro_do_aluno", "grupos_alimentos", "master_alunos_do_app",
  "minha_dieta", "minha_evolucao",
  "painel_resumo",
  // hml-14b (B21): as listas do painel por página, com o total e as somas do banco
  "financeiro_lancamentos", "financeiro_recibos", "financeiro_resumo_periodo", "receitas_da_nutricionista", "respostas_da_conta",
  // hml-14d (B21): as listas do Treino (banco do Treino), os números da Pré-consulta e as listas/somas por aluno
  "exames_do_aluno", "exercicios_da_lista", "financeiro_totais_do_aluno", "modelos_da_lista",
  "preconsulta_numeros",
  // hml-17 (H-38): o plano alimentar do aluno montado no banco (o painel lê por elas)
  "plano_alimentar", "planos_do_aluno", "planos_favoritos",
]);

/**
 * As 29 VOLATILE que o front chama (+ as 2 da hml-12 que gravam o aceite e o consentimento do responsável): nunca repetem. hml-19b: a
 * paciente_marcar_refeicao e a aluno_marcar_meta saíram do front (o app do aluno marca pela função nutricao, que chama as 2 lá); a
 * diario_enviar fica (o link público /d/:codigo segue chamando direto — decisão 13). hml-19c: a aluno_avisar_avaliacao saiu do front
 * (o aviso "avaliação nova" vai pela função nutricao, ação avaliacao_avisar, que chama a RPC lá). hml-21a: saíram as 8 que a função conta
 * chama (aceitar_no_acesso, criar_minha_conta, entrar_sem_profissional, marcar_aviso_mudanca, minha_senha_definida, mudar_objetivo_app,
 * push_esquecer, push_registrar) — eram 37. hml-21b: saíram as 6 da Agenda que a função conta chama (agenda_garantir_tags,
 * aluno_agenda_confirmar, aluno_agenda_desistir, aluno_agenda_marcar, aluno_agenda_reagendar, aluno_definir_pacote) — eram 29. hml-21c:
 * saíram as 18 do Resumo, das Configurações, da Mensagens, da Lixeira e da faixa que a função conta chama (aluno_acesso, alterar_papeis_membro,
 * aluno_avisar_plano, aluno_novo_link, aluno_responsavel_registrar, aluno_salvar_ajustes, aluno_salvar_dados, garantir_meu_codigo,
 * lixeira_apagar, lixeira_restaurar, mensagens_aviso_fechar, mensagens_ligar_para_todos, paciente_criar_acesso, paciente_redefinir_senha,
 * remover_membro, whatsapp_limpar_falhas, whatsapp_reenviar, whatsapp_salvar_config) — eram 23; sobram só as 5 dos links públicos (o desvio 21).
 */
export const RPC_QUE_GRAVAM = new Set<string>([
  // sem escrita direta no corpo, mas mexem no limite_publico (3) — os links públicos /d/ e /f/
  "diario_link", "diario_listar", "preconsulta_formulario",
  // gravam (2) — os links públicos /d/ e /f/
  "diario_enviar", "preconsulta_responder",
]);

/**
 * hml-20a (decisão 18): as ações de LEITURA das funções do jeito 2 — o POST com um destes corpos repete 1 vez, como o GET de hoje.
 * `campo` = o campo do corpo que a FUNÇÃO lê (a nutricao e a financeiro leem `acao`; a admin-avaliacoes, `action`): um corpo com
 * { action: "ler", acao: "<gravação>" } não engana (a nutricao faria a gravação → não repete). hml-21a: + o `ler` da conta.
 * hml-21b (pedido da LINUX 3, decisão da sessão principal 13/10 03:07): + o `ler` das 3 da W-A — conferido no código que ele SÓ LÊ: a
 * acessos (a RPC acessos_ler: a wa_rota e o wa_acessos_json, sem escrita), a aluno-dia (as RPCs minhas_rotinas, meu_dia, meus_alimentos e
 * buscar_alimentos_do_aluno — STABLE — e rotinas_do_aluno e dia_do_aluno — só leem, com ajudantes stable/immutable) e a treino-acessos
 * (a acessos_ler no principal + o select de physiq_identidades/physiq_profiles; a única escrita, o update, é do `salvar`).
 */
export const ACOES_DE_LEITURA: Readonly<Record<string, { campo: "acao" | "action"; acoes: readonly string[] }>> = {
  nutricao: { campo: "acao", acoes: ["ler"] },
  financeiro: { campo: "acao", acoes: ["ler"] },
  "admin-avaliacoes": { campo: "action", acoes: ["minha_evolucao"] },
  conta: { campo: "acao", acoes: ["ler"] },
  acessos: { campo: "acao", acoes: ["ler"] },
  "aluno-dia": { campo: "acao", acoes: ["ler"] },
  "treino-acessos": { campo: "acao", acoes: ["ler"] },
  // play-W6: o `estado` da play-compras SÓ lê (a matrícula do app, a assinatura viva, a trava e a automática do MP); o `registrar` grava
  // (reconhece no Google) → 1 vez
  "play-compras": { campo: "acao", acoes: ["estado"] },
};

/** O corpo (o texto JSON que o supabase-js manda) é de uma ação de LEITURA da função? Corpo ilegível, sem a ação ou outra → não. */
export function corpoDeLeitura(funcao: string, corpo: unknown): boolean {
  if (!Object.prototype.hasOwnProperty.call(ACOES_DE_LEITURA, funcao) || typeof corpo !== "string") return false;
  const regra = ACOES_DE_LEITURA[funcao];
  try {
    const b = JSON.parse(corpo) as unknown;
    if (!b || typeof b !== "object" || Array.isArray(b)) return false;
    const acao = (b as Record<string, unknown>)[regra.campo];
    return typeof acao === "string" && regra.acoes.includes(acao);
  } catch {
    return false;
  }
}

/**
 * O pedido pode ir de novo sem risco de fazer 2 vezes? GET/HEAD, POST das RPCs de leitura e (hml-20a) o POST de função com o corpo de
 * uma ação de leitura (ACOES_DE_LEITURA); o resto, não.
 */
export function podeRepetir(input: RequestInfo | URL, init?: RequestInit): boolean {
  const pedido = typeof Request !== "undefined" && input instanceof Request ? input : null;
  const metodo = (init?.method ?? pedido?.method ?? "GET").toUpperCase();
  if (metodo === "GET" || metodo === "HEAD") return true;
  if (metodo !== "POST") return false;
  let caminho = "";
  try {
    caminho = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : (pedido?.url ?? "")).pathname;
  } catch {
    return false; // endereço que não dá para ler: na dúvida, não repete
  }
  const funcao = /^\/functions\/v1\/([a-z0-9-]+)$/.exec(caminho);
  if (funcao) return corpoDeLeitura(funcao[1], init?.body); // o corpo de um Request não dá para ler aqui: na dúvida, não repete
  const rpc = /\/rest\/v1\/rpc\/([a-z0-9_]+)$/.exec(caminho);
  return !!rpc && RPC_SO_LEITURA.has(rpc[1]);
}

/** O slug da função chamada (/functions/v1/<slug>, sem subcaminho nem query) — ou null quando o pedido não é de uma função. */
export function funcaoDoPedido(input: RequestInfo | URL): string | null {
  const pedido = typeof Request !== "undefined" && input instanceof Request ? input : null;
  try {
    const caminho = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : (pedido?.url ?? "")).pathname;
    return /\/functions\/v1\/([^/]+)/.exec(caminho)?.[1] ?? null;
  } catch {
    return null;
  }
}

export interface OpcoesFetch {
  /** De qual banco é o cliente: o aviso do 5xx de função diz "(Treino)" quando é do Treino (sem ele, o principal). */
  banco?: BancoErro;
  /** Quem recebe o 5xx final de uma função (o padrão é o avisarErro; o teste passa um falso). */
  avisar?: (aviso: AvisoDoApp) => unknown;
  /**
   * hml-14 (D5): o relógio segue armado até quem chamou ler o corpo (o arquivo baixado, como a foto) — sem isto ele para quando
   * chegam os cabeçalhos (a regra dos 2 clientes). Desarmar depois do corpo lido não muda nada.
   */
  ateOCorpo?: boolean;
}

/**
 * fetch com timeout e nova tentativa (a regra de antes dos 2 clientes): sem repetir em 401/403; em 5xx e 429, até `tentativas`
 * vezes a mais com espera crescente — SÓ no que podeRepetir; o resto vai 1 vez e volta como veio (resposta ou erro).
 * `base` = o fetch de verdade (o teste passa um falso). hml-10: a resposta final ≥ 500 de uma função (menos a erro-avisar) avisa.
 * hml-14 (D5): o tempo de cada tentativa é `timeoutMs`, e o de uma função, no mínimo TEMPO_FUNCAO_MS (25 s). Estourou a última
 * tentativa → rejeita com o AbortError; `tentativas` 0 = 1 vez só (os fetch diretos).
 */
export function criarFetchResiliente(
  tentativas = 2,
  timeoutMs = 15000,
  base: typeof fetch = (input: RequestInfo | URL, init?: RequestInit) => fetch(input, init),
  opcoes: OpcoesFetch = {},
) {
  const avisar = opcoes.avisar ?? avisarErro;
  /** A resposta que volta para quem chamou: se for o 5xx final de uma função, avisa antes (sem nunca atrapalhar a resposta). */
  const devolver = (input: RequestInfo | URL, resposta: Response): Response => {
    if (resposta.status >= 500) {
      const funcao = funcaoDoPedido(input);
      if (funcao && funcao !== "erro-avisar") {
        try {
          avisar({ origem: "funcao", funcao, banco: opcoes.banco ?? "principal", status: resposta.status });
        } catch {
          // o aviso nunca muda a resposta
        }
      }
    }
    return resposta;
  };
  return async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const max = podeRepetir(input, init) ? tentativas : 0;
    const tempo = funcaoDoPedido(input) ? Math.max(timeoutMs, TEMPO_FUNCAO_MS) : timeoutMs;
    let ultimoErro: Error | null = null;
    for (let tentativa = 0; tentativa <= max; tentativa++) {
      const controle = new AbortController();
      const timer = setTimeout(() => controle.abort(), tempo);
      try {
        const resposta = await base(input, { ...init, signal: controle.signal });
        if (!opcoes.ateOCorpo) clearTimeout(timer);
        if (resposta.status === 401 || resposta.status === 403) return resposta;
        if ((resposta.status >= 500 || resposta.status === 429) && tentativa < max) {
          clearTimeout(timer);
          await new Promise((r) => setTimeout(r, Math.min(1000 * 2 ** tentativa, 10000) + Math.random() * 500));
          continue;
        }
        return devolver(input, resposta);
      } catch (e) {
        clearTimeout(timer);
        ultimoErro = e as Error;
        if (tentativa < max && (e as Error).name !== "AbortError") {
          await new Promise((r) => setTimeout(r, Math.min(1000 * 2 ** tentativa, 10000)));
          continue;
        }
      }
    }
    throw ultimoErro || new Error("Falha de rede depois das tentativas");
  };
}
