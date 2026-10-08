// Physiq hml-10 (H-26, D6) — o aviso de erro do Banco do Treino. O Treino não tem o bot nem a tabela da trava: manda o erro (já
// limpo pelo log) à função erro-avisar do banco principal, que segura os repetidos e avisa no Telegram. Aqui fica só a trava na
// memória (10 min por assinatura e schema), para uma enxurrada de erros não virar uma enxurrada de pedidos.
//
// Quem usa: toda função do Treino, pelo log (log.erro e log.excecao avisam em segundo plano):
//   import { criarLog } from "../_shared/log.ts";
//   import { avisarErro } from "../_shared/avisar-erro.ts";
//   const log = criarLog("trocar-token", { avisar: avisarErro });
// POST ${PRINCIPAL_URL}/functions/v1/erro-avisar com x-espelho-segredo e x-schema; 5 s; nunca derruba a função. Segredos: os
// que o Treino já tem (PRINCIPAL_URL e ESPELHO_SEGREDO) — nenhum novo.
// Sem import de URL e com as variáveis lidas na hora (o Vitest importa este arquivo: src/lib/erroAvisarServidor.test.ts).
import { assinatura, criarTrava, type ErroParaAviso, type SchemaAviso } from "./erros.ts";
import { criarLog } from "./log.ts";

const trava = criarTrava();
const log = criarLog("avisar-erro", { avisar: null }); // o aviso nunca avisa a si mesmo

type ComDeno = { Deno?: { env: { get: (nome: string) => string | undefined } } };

function variavel(nome: string): string {
  try {
    const deno = (globalThis as ComDeno).Deno; // pelo globalThis: o tsc do app (Vitest) não conhece o Deno
    return deno ? (deno.env.get(nome) || "").trim() : "";
  } catch {
    return "";
  }
}

export type ResultadoAviso = "repassado" | "segurado" | "sem_configuracao" | "recusado" | "falhou";

/**
 * O aviso das funções do Treino — o que se passa ao log: criarLog("<slug>", { avisar: avisarErro }). Sem schema (não informado
 * no log), o aviso sai como produção. Nunca lança.
 */
export async function avisarErro(erro: ErroParaAviso, schema: SchemaAviso | null): Promise<ResultadoAviso> {
  const s: SchemaAviso = schema === "staging" ? "staging" : "public";
  let ref = "?";
  try {
    const doTreino: ErroParaAviso = {
      origem: "servidor",
      banco: "treino",
      funcao: erro.funcao,
      codigo: erro.codigo,
      acao: erro.acao,
      status: erro.status,
      mensagem: erro.mensagem,
    };
    ref = assinatura(doTreino); // a mesma que o principal calcula do corpo
    if (trava.segura(`${s}:${ref}`)) {
      log.info({ codigo: "segurado", schema: s, ref, resultado: "memoria" });
      return "segurado";
    }
    const url = variavel("PRINCIPAL_URL").replace(/\/+$/, "");
    const segredo = variavel("ESPELHO_SEGREDO");
    if (!url || segredo.length < 32) {
      log.aviso({ codigo: "aviso_sem_configuracao", schema: s, ref });
      return "sem_configuracao";
    }
    const r = await fetch(`${url}/functions/v1/erro-avisar`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-espelho-segredo": segredo, "x-schema": s },
      body: JSON.stringify({
        origem: "servidor",
        funcao: doTreino.funcao,
        codigo: doTreino.codigo,
        acao: doTreino.acao ?? undefined,
        status: doTreino.status ?? undefined,
        mensagem: doTreino.mensagem ?? undefined,
      }),
      signal: AbortSignal.timeout(5000),
    });
    await r.body?.cancel().catch(() => undefined);
    if (r.status === 204) {
      log.info({ codigo: "aviso_repassado", schema: s, ref });
      return "repassado";
    }
    log.erro({ codigo: "principal_recusou_aviso", schema: s, ref, status: r.status });
    return "recusado";
  } catch (e) {
    // rede, tempo esgotado (5 s)…: só o nome do erro (a mensagem do fetch pode trazer a URL)
    log.erro({ codigo: "aviso_falhou", schema: s, ref, msg: e instanceof Error ? e.name : typeof e });
    return "falhou";
  }
}
