import { CONTATO_SUPORTE } from "@/nucleo/suporte";

/**
 * hml-11 (H-28, D3) — os textos legais do Physiq: a Política de Privacidade, os Termos de Uso e os Termos de assinatura. A virada (D12
 * da hml-11 + a hml-12) publicou os 3 em 29/10/2026, COMO ESTAVAM no código, sem advogado — decisão do dono ("Não tenho advogado" →
 * "Sim, como estão"). Desde então eles, o resumo antes de pagar, o aceite no próximo acesso, o consentimento de saúde e a regra de idade
 * valem em todo build (site, APK e Google Play); a revisão no staging (8/10/2026) ficou no histórico (docs/textos-legais.md).
 *
 * A versão é UMA para os 3 documentos e é a data da publicação (AAAA-MM-DD): é o que a hml-12 grava no aceite, e o banco tem que ter a
 * MESMA (app_config.textos_legais, a migração supabase-principal/migrations/20261029200000_virada_textos_legais.sql — o textos.test.ts
 * confere). A data da publicação mudou? Troque as 2 constantes abaixo e a data da migração, juntas. Mudou o texto de forma relevante →
 * data nova aqui + 1 migração de 1 linha + o aviso de 30 dias (P8; docs/textos-legais.md, processo 8).
 */
export const VERSAO_TEXTOS = "2026-10-29";
export const DATA_DOS_TEXTOS = "29 de outubro de 2026";

/**
 * Quem vende (Decreto 7.962/2013, art. 2º: nome, CPF, endereço físico e eletrônico, em destaque): os dados do MEI do dono, os
 * MESMOS do `FORNECEDOR` do Nativo OS (features/legal/versao.ts; decisão "1" de 07/10/2026). O e-mail é o do suporte (P7: até a
 * hml-16 criar o do Physiq, muda só o CONTATO_SUPORTE).
 */
export const VENDEDOR = {
  nome: "Weslley Bertoldo da Silva",
  cpf: "123.232.784-01",
  endereco: "Rua 10, 3, Cidade Universitária, Maceió/AL, CEP 57073-031",
  email: CONTATO_SUPORTE,
} as const;

export const ROTA_POLITICA = "/privacidade";
export const ROTA_TERMOS = "/termos";
export const ROTA_ASSINATURA = "/assinatura";
