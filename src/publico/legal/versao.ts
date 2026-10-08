import { CONTATO_SUPORTE } from "@/nucleo/suporte";

/**
 * hml-11 (H-28, D3) — os textos legais NOVOS do Physiq: a Política de Privacidade, os Termos de Uso e os Termos de assinatura. O
 * texto final só vai para a produção depois que o advogado conferir (regra do dono): até a virada (D12), as 3 páginas e o resumo
 * antes de pagar existem só no build de staging (src/rotas/Rotas.tsx e as 3 telas que vendem), e a guarda de CI
 * (scripts/ci/sem-texto-legal-novo.sh) confere que a produção sai sem eles.
 *
 * A versão é UMA para os 3 documentos e é a data do texto (AAAA-MM-DD): é o que a hml-12 grava no aceite. Até a virada é a data da
 * revisão; na virada, passa à data da publicação. Mudou o texto de forma relevante → data nova aqui (e o aviso de 30 dias, P8).
 */
export const VERSAO_TEXTOS = "2026-10-08";
export const DATA_DOS_TEXTOS = "8 de outubro de 2026";

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
