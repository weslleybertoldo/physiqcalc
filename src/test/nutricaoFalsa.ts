// Physiq hml-20b (H-42 · jeito 2, etapa 2) — a ação `ler` da função nutricao nos testes de TELA e de lib que já falsificavam o banco
// (supabase.rpc/from/storage do @/nutricao/editor/lib/banco): em vez de responder o lote à mão, roda o servidor de verdade sobre o MESMO
// banco falso do teste — as idas ao banco são as mesmas que o navegador fazia (agora o servidor faz, como a pessoa), então o teste segue
// provando o mesmo, e o que volta passa pela "rede" (JSON).
// hml-21c (H-112): o falso é o GENÉRICO (src/test/leituraFalsa.ts — o motor comum com o catálogo como parâmetro); aqui só a entrada da
// nutricao (o CATALOGO_NUTRICAO), com o nome de antes (os testes que importam não mudam).
import { CATALOGO_NUTRICAO } from "../../supabase-principal/functions/_shared/nutricao-leituras";
import { ehLerDaFuncao, lerPeloMotor } from "./leituraFalsa";

/**
 * O `functions.invoke` da nutricao para o `ler`: (corpo) → { data, error } como o supabase-js devolve. `userId` = quem está logado no
 * teste (o dono das consultas "minhas": o profissional); `schema` = o do ambiente (o bucket "-staging" no staging).
 */
export function lerPeloModulo(banco: unknown, opcoes: { userId?: string; schema?: "public" | "staging" } = {}) {
  return lerPeloMotor(CATALOGO_NUTRICAO, banco, opcoes);
}

/** O corpo é o `ler` da nutricao? (o resto — as gravações e o padroes_garantir — segue no falso de cada teste) */
export const ehLer = ehLerDaFuncao;
