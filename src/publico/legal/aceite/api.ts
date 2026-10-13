// Physiq hml-12 (H-30) — o aceite no acesso: 1 RPC do banco principal (aceitar_no_acesso, SECURITY DEFINER; ninguém lê nem grava a
// tabela `aceites` direto). O banco confere a versão (a que a pessoa leu = VERSAO_TEXTOS; outra → versao_desatualizada), grava o
// aceite dos Termos e da Política (2 toques = 1 linha) e, se pendentes, o consentimento de saúde e a data de nascimento do aluno do
// app; devolve o `legal` novo. É VOLATILE: não repete sozinho (src/integrations/repeticao.ts).
// hml-21a (H-43 · jeito 2): a RPC é chamada pela função conta (ação aceitar_textos, com os mesmos 5 argumentos, como a pessoa); o
// { ok, erro, versao, legal } dela volta igual no `resultado`. A falha da chamada: sem internet → sem_internet; o resto → erro_interno.
import { acaoConta, codigoDaGravacao, resultadoDaAcao } from "@/conta/gravar";
import { normalizarLegal, type LegalSituacao } from "@/nucleo/situacao";
import { versaoDoApp, type OrigemDoAceite } from "./regras";

export type ResultadoAceite = { ok: true; legal: LegalSituacao | null } | { ok: false; erro: string; versao: string | null };

const semInternet = () => typeof navigator !== "undefined" && navigator.onLine === false;

export async function aceitarNoAcesso({
  versao,
  origem,
  saude,
  nascimento,
}: {
  versao: string;
  origem: OrigemDoAceite;
  saude: boolean;
  nascimento: string | null;
}): Promise<ResultadoAceite> {
  if (semInternet()) return { ok: false, erro: "sem_internet", versao: null };
  let resposta: { resultado?: unknown };
  try {
    resposta = await acaoConta<{ resultado?: unknown }>("aceitar_textos", {
      versao, origem, saude, nascimento: nascimento || null, versao_app: versaoDoApp(),
    });
  } catch (e) {
    const rede = codigoDaGravacao(e) === "sem_internet" || semInternet();
    return { ok: false, erro: rede ? "sem_internet" : "erro_interno", versao: null };
  }
  const r = resultadoDaAcao(resposta) as { ok?: unknown; erro?: unknown; versao?: unknown; legal?: unknown };
  if (r.ok === true) return { ok: true, legal: normalizarLegal(r.legal) };
  return { ok: false, erro: typeof r.erro === "string" ? r.erro : "erro_interno", versao: typeof r.versao === "string" ? r.versao : null };
}
