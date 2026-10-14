// Physiq hml-20d (H-42 · jeito 2, etapa 2, parte 4) — a ação `ler` da função financeiro nos testes de TELA e de lib que já falsificavam o
// banco (principal.rpc/from do @/integrations/principal/client): em vez de responder o lote à mão, roda o servidor de verdade sobre o MESMO
// banco falso do teste — as idas ao banco são as mesmas que o navegador fazia (agora o servidor faz, como a pessoa), então o teste segue
// provando o mesmo, e o que volta passa pela "rede" (JSON).
// hml-21c (H-112): o falso é o GENÉRICO (src/test/leituraFalsa.ts — o motor comum com o catálogo como parâmetro; a DUPLICAÇÃO da hml-20d
// saiu); aqui só a entrada da financeiro (o CATALOGO_FINANCEIRO), com o nome de antes (os testes que importam não mudam).
import { CATALOGO_FINANCEIRO } from "../../supabase-principal/functions/_shared/financeiro-leituras";
import { ehLerDaFuncao, lerPeloMotor } from "./leituraFalsa";

/**
 * O `functions.invoke` da financeiro para o `ler`: (corpo) → { data, error } como o supabase-js devolve. `userId` = quem está logado no
 * teste (o dono das consultas "minhas" e do recorte da conta ativa).
 */
export function lerFinanceiroPeloModulo(banco: unknown, opcoes: { userId?: string; schema?: "public" | "staging" } = {}) {
  return lerPeloMotor(CATALOGO_FINANCEIRO, banco, opcoes);
}

/** O corpo é o `ler` da financeiro? (o resto — as gravações e o padroes_garantir — segue no falso de cada teste) */
export const ehLerFinanceiro = ehLerDaFuncao;
