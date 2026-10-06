/**
 * Canal de distribuição do build (W1 da loja — decisões dele de 06/10/2026).
 *
 * - "site": o site (Vercel) e o APK das GitHub Releases — tudo como sempre: o app se atualiza sozinho pelo APK, o profissional
 *   se cadastra e paga o plano, o aluno sem profissional assina o plano do app.
 * - "play": a versão da Google Play. A loja proíbe app que se atualiza por fora dela e a venda de serviço digital fora do Google
 *   Play Billing (botão, link, preço, texto ou cadastro que leve a pagar fora). Nela: sem o atualizador do APK, sem o cadastro de
 *   profissional, o plano do profissional só com a situação (ele paga pelo site), sem "Treinar sem profissional" e sem as ações
 *   de pagamento da conta do app (até o Play Billing da W6). O aluno pagando o PROFISSIONAL (Pix com comprovante e o Mercado Pago
 *   da conta dele) continua igual.
 *
 * Definido no build: `npm run build:loja` (VITE_DISTRIBUICAO=play). Qualquer outro valor (ou nenhum) = site — nunca esconde nada
 * do site por engano. No Android, o build type `playRelease` (android/app/build.gradle) tira a permissão REQUEST_INSTALL_PACKAGES
 * (android/app/src/playRelease/AndroidManifest.xml) e não registra o ApkInstallerPlugin (BuildConfig.LOJA).
 */
export type Distribuicao = "site" | "play";

/** "play" só com o valor exato; qualquer outra coisa (vazio, "loja", "PLAY"…) = site. */
export function distribuicaoDe(valor: unknown): Distribuicao {
  return valor === "play" ? "play" : "site";
}

export const DISTRIBUICAO: Distribuicao = distribuicaoDe(import.meta.env.VITE_DISTRIBUICAO);

/** true na versão da Google Play (build com VITE_DISTRIBUICAO=play). */
export const ehLoja: boolean = DISTRIBUICAO === "play";
