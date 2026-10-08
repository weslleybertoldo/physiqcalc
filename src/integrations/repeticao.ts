// Physiq hml-06 (H-20) — o fetch dos 2 clientes do supabase-js (o do principal, src/integrations/principal/client.ts, e o do
// Treino, src/integrations/supabase/client.ts): timeout de 15 s por tentativa e nova tentativa em 5xx, 429 e rede — mas SÓ no
// que é leitura (GET/HEAD e as RPCs que o Postgres marca STABLE/IMMUTABLE, que não podem gravar). POST/PATCH/PUT/DELETE de
// tabela, as RPCs VOLATILE, toda função (/functions/v1/*: cobrança, envio de e-mail/WhatsApp), o /auth/v1/* (o GoTrue repete
// o refresh sozinho) e o upload do Storage vão UMA vez: o servidor pode ter feito e só a resposta se perdido (a pagamentos-aluno
// cobrava o cartão de novo). RPC nova no front entra em RPC_SO_LEITURA ou em RPC_QUE_GRAVAM (o repeticao.test.ts confere).
// hml-10 (H-26, D5): a resposta FINAL ≥ 500 de uma função (/functions/v1/<slug>, menos a própria erro-avisar) vira aviso ao
// Weslley ("função <slug> · HTTP <st>", com "(Treino)" quando é do Treino: cada cliente diz de qual banco é) — src/lib/avisoDeErro.ts.
// O aviso não muda nada para quem chamou: a resposta volta igual.
import type { BancoErro } from "../../supabase-principal/functions/_shared/erros";
import { avisarErro, type AvisoDoApp } from "@/lib/avisoDeErro";

/**
 * As 31 RPCs STABLE/IMMUTABLE que o front chama (pg_proc, public = staging, lido em 08/10/2026; + a aluno_responsavel da hml-12,
 * STABLE pela migração 20261008200000): podem repetir.
 */
export const RPC_SO_LEITURA = new Set<string>([
  "agenda_horarios", "aluno_agenda_horarios", "aluno_anotacoes", "aluno_compromissos", "aluno_convites", "aluno_evolucao",
  "aluno_perfil", "aluno_responsavel", "aluno_treino", "alunos_da_conta", "alunos_novos_por_mes", "alunos_pendentes",
  "equipe_da_conta", "financeiro_do_aluno", "grupos_alimentos", "lixeira_da_conta", "master_alunos_do_app", "mensagens_desligadas",
  "meu_perfil_aluno", "meu_plano_app", "minha_agenda", "minha_dieta", "minha_evolucao", "minha_situacao",
  "minhas_regras_agenda", "paciente_dado_livre", "painel_resumo", "pratos_prontos_do_app", "w2l_prontuarios_para_baixar",
  "whatsapp_fila", "whatsapp_resumo",
]);

/** As 40 VOLATILE que o front chama (+ as 2 da hml-12 que gravam o aceite e o consentimento do responsável): nunca repetem. */
export const RPC_QUE_GRAVAM = new Set<string>([
  // sem escrita direta no corpo, mas mexem no limite_publico / garantir_* / matricular_no_app (6)
  "agenda_garantir_tags", "aluno_acesso", "diario_link", "diario_listar", "entrar_sem_profissional", "preconsulta_formulario",
  // gravam (34)
  "aceitar_no_acesso", "alterar_papeis_membro", "aluno_agenda_confirmar", "aluno_agenda_desistir", "aluno_agenda_marcar",
  "aluno_agenda_reagendar", "aluno_avisar_avaliacao", "aluno_avisar_plano", "aluno_definir_pacote", "aluno_marcar_meta",
  "aluno_novo_link", "aluno_responsavel_registrar", "aluno_salvar_ajustes", "aluno_salvar_dados", "criar_minha_conta",
  "diario_enviar", "garantir_meu_codigo", "lixeira_apagar", "lixeira_restaurar", "marcar_aviso_mudanca", "mensagens_aviso_fechar",
  "mensagens_ligar_para_todos", "minha_senha_definida", "mudar_objetivo_app", "paciente_criar_acesso", "paciente_marcar_refeicao",
  "paciente_redefinir_senha", "preconsulta_responder", "push_esquecer", "push_registrar", "remover_membro",
  "whatsapp_limpar_falhas", "whatsapp_reenviar", "whatsapp_salvar_config",
]);

/** O pedido pode ir de novo sem risco de fazer 2 vezes? GET/HEAD e POST das RPCs de leitura; o resto, não. */
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
}

/**
 * fetch com timeout e nova tentativa (a regra de antes dos 2 clientes): sem repetir em 401/403; em 5xx e 429, até `tentativas`
 * vezes a mais com espera crescente — SÓ no que podeRepetir; o resto vai 1 vez e volta como veio (resposta ou erro).
 * `base` = o fetch de verdade (o teste passa um falso). hml-10: a resposta final ≥ 500 de uma função (menos a erro-avisar) avisa.
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
    let ultimoErro: Error | null = null;
    for (let tentativa = 0; tentativa <= max; tentativa++) {
      const controle = new AbortController();
      const timer = setTimeout(() => controle.abort(), timeoutMs);
      try {
        const resposta = await base(input, { ...init, signal: controle.signal });
        clearTimeout(timer);
        if (resposta.status === 401 || resposta.status === 403) return resposta;
        if ((resposta.status >= 500 || resposta.status === 429) && tentativa < max) {
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
