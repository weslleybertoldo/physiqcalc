/**
 * Textos da Política de Privacidade (src/publico/Privacidade.tsx) que precisam morar num lugar só — W3 da loja:
 *
 * - FRASE_BACKUPS: a frase das cópias de segurança sai IGUAL na política (Retenção) e na /excluir-conta (O que fica guardado),
 *   para uma página nunca contradizer a outra. W4 da loja — decisão do Weslley de 06/10/2026 ("A"): os backups manuais (os feitos
 *   antes das manutenções) são apagados em 30 dias; com isso a frase ganhou o prazo, "em até 30 dias". Os automáticos do provedor
 *   não passam disso — conferido em 06/10/2026 na Management API do Supabase (só leitura): a organização dos 2 bancos está no plano
 *   Free, que não tem backup diário (0 backups e PITR desligado nos 2 projetos), e a retenção documentada dos planos pagos vai de
 *   7 dias (Pro) a 30 (Enterprise), com o PITR até 28. Histórico: até a W2 as 2 páginas diziam "até 7 dias", o que não se
 *   comprovava; a W3 tirou o prazo até a decisão.
 * - SERVICOS_TERCEIROS: quem recebe dado pessoal fora do Physiq, o que recebe e para quê. Cada item foi conferido no código em
 *   06/10/2026 (o arquivo vai no comentário). Serviço que o código não usa não entra (o Google Play Billing só chega na W6).
 *
 * hml-11 (H-28, A2 — correções de fato, sem base legal, papel, direito nem prazo novo): a frase dos backups passou a dizer o que
 * existe desde a hml-07 (a cópia diária cifrada no notebook, docs/backup.md: 03:23, age, apagada com 29 dias; o provedor no Free
 * não tem backup); o Google (FCM) recebe só o texto fixo por tipo desde a hml-10 (_shared/push-regras.ts, corpoDoPush); o
 * Telegram (os avisos de erro da hml-10, _shared/erros.ts limpa antes) entrou na lista. FRASE_SUPORTE é a "frase A" da hml-08
 * (H-22) para a Política nova (src/publico/legal/politica.ts); a página de hoje não a usa.
 */
export const FRASE_BACKUPS =
  "As cópias de segurança do banco de dados — a cópia diária e as feitas antes de manutenções — são cifradas, guardadas no Brasil e apagadas em até 30 dias depois de feitas; até lá, não são usadas para outro fim.";

/** hml-08 (H-22, frase A): o acesso do suporte, que existe só pelo site. A frase B ("cada acesso fica registrado") só com o registro de leitura. */
export const FRASE_SUPORTE =
  "O suporte do Physiq (quem opera a plataforma) tem acesso administrativo pelo site e pode ver os dados das contas, inclusive os de saúde, só quando for preciso para dar suporte, corrigir um erro, atender a um pedido seu ou do seu profissional, ou cumprir uma obrigação legal. Esse acesso não existe no aplicativo.";

export interface ServicoTerceiro {
  /** marca do item (data-servico, para os testes e o E2E) */
  id: string;
  nome: string;
  /** o que recebe e para quê */
  texto: string;
  /** só no site e no APK baixado pelo site: a versão da Google Play não usa o serviço, e o item não aparece nela */
  soSite?: boolean;
}

export const SERVICOS_TERCEIROS: readonly ServicoTerceiro[] = [
  // src/integrations/supabase/client.ts (Banco do Treino) · src/integrations/principal/client.ts (banco principal) · supabase/functions e
  // supabase-principal/functions (as funções do servidor) — regiões conferidas na Supabase: us-east-1 e sa-east-1
  {
    id: "supabase",
    nome: "Supabase",
    texto: "os dois bancos de dados, o login e os arquivos enviados (fotos e comprovantes). Guarda os dados descritos nesta página, nas regiões indicadas acima.",
  },
  // src/lib/powersync/connector.ts · powersync/sync-config.yaml (o que vai para o aparelho) · powersync/service.yaml (region: us)
  {
    id: "powersync",
    nome: "PowerSync",
    texto: "sincroniza o treino entre o banco e o aparelho, para ele funcionar sem internet. Recebe os dados de treino e o perfil usado no treino; o servidor fica nos Estados Unidos.",
  },
  // infra/cloudflare/physiqcalc-api/proxy.js e infra/cloudflare/physiq-principal-api/worker.js (proxy com cache: "no-store") ·
  // src/nucleo/captcha.ts (Turnstile) · supabase-principal/functions/entrar-senha e alunos (siteverify)
  {
    id: "cloudflare",
    nome: "Cloudflare",
    texto: "o acesso do app aos bancos de dados passa pela rede dela, sem guardar cópia. O captcha do login com e-mail e senha e do cadastro pelo link do profissional (Turnstile) recebe dados técnicos do navegador, como o endereço IP, para confirmar que é uma pessoa.",
  },
  // vercel.json · docs/api-dominio-proprio.md (o site, @ e www, fica na Vercel)
  {
    id: "vercel",
    nome: "Vercel",
    texto: "hospeda o site physiqcalc.com.br e recebe os dados técnicos de cada acesso (endereço IP e navegador).",
  },
  // src/lib/capacitorAuth.ts (signInWithOAuth, provider google) · supabase-principal/functions/push-enviar e _shared/push-regras.ts
  // (fcm.googleapis.com) · src/push/aparelho.ts (o código do aparelho) · android/app/build.gradle (google-services)
  {
    id: "google",
    nome: "Google",
    texto: "o login com o Google, que envia ao Physiq o seu nome, e-mail e foto quando você autoriza, e as notificações do app no Android (Firebase Cloud Messaging), que recebem o código do aparelho e um texto curto, fixo para cada tipo de aviso (por exemplo, \"Tem novidade na sua agenda.\"), sem nome nem valor; o aviso completo fica só dentro do app.",
  },
  // supabase-principal/functions/convites, alunos, agenda-avisar e aluno-enviar (api.resend.com)
  {
    id: "resend",
    nome: "Resend",
    texto: "envia os e-mails do Physiq (convites, consulta marcada e treino ou plano alimentar atualizado). Recebe o nome e o e-mail de quem recebe e o texto da mensagem.",
  },
  // src/painel/configuracoes/plano/CartaoPagamento.tsx (Card Payment Brick: só o token volta) · src/components/pagamentos/mpInit.ts ·
  // supabase-principal/functions/pagamentos-aluno, cobranca-conta e mp-assinar · supabase/functions/mp-payments (api.mercadopago.com)
  {
    id: "mercado-pago",
    nome: "Mercado Pago",
    texto: "processa os pagamentos com cartão e os Pix do Mercado Pago. Recebe o e-mail de quem paga (às vezes também o nome), o valor e a descrição; o número do cartão é digitado no formulário do próprio Mercado Pago e não passa pelo Physiq.",
  },
  // supabase-principal/functions/whatsapp-conectar e whatsapp-agente · infra/agente-whatsapp/agente.js (a conexão do próprio
  // profissional por QR code) · supabase-principal/migrations/20260920200000_whatsapp_disparos.sql (os momentos) ·
  // src/app-aluno/perfil/pecas/MeusProfissionais.tsx (wa.me)
  {
    id: "whatsapp",
    nome: "WhatsApp",
    texto: "quando o profissional liga as mensagens automáticas (lembrete de consulta, cobrança, parabéns), elas saem pelo WhatsApp dele, conectado por QR code como no WhatsApp Web, sem empresa intermediária; o WhatsApp recebe o seu número e o texto da mensagem. Os botões de WhatsApp do app só abrem a conversa no seu próprio WhatsApp.",
  },
  // hml-10: src/lib/avisoDeErro.ts (app) · supabase-principal/functions/erro-avisar e _shared/avisar-erro.ts (servidor) · a limpeza
  // é a do _shared/erros.ts (limparMensagem, limparRota) — api.telegram.org, grupo de quem opera o Physiq
  {
    id: "telegram",
    nome: "Telegram",
    texto: "recebe os avisos de erro do app e do servidor (a tela ou a função que falhou, a versão e a mensagem técnica), dos quais o sistema tira e-mail, CPF, telefone, endereço IP, códigos de acesso e números longos antes de mandar. Vão só para quem opera o Physiq.",
  },
  // src/lib/apkRelease.ts · src/components/UpdateChecker.tsx · src/entrada/Entrar.tsx (api.github.com) — nada disso existe na
  // versão da Google Play (W1)
  {
    id: "github",
    nome: "GitHub",
    texto: "guarda o instalador do app para Android baixado pelo site e responde quando esse app confere se há versão nova. Recebe só os dados técnicos da conexão (endereço IP).",
    soSite: true,
  },
];

/** Os serviços que valem para a versão do build (`loja` = a da Google Play, sem os `soSite`). */
export function servicosDaVersao(loja: boolean): ServicoTerceiro[] {
  return SERVICOS_TERCEIROS.filter((s) => !(loja && s.soSite));
}

/**
 * O `state` dos links "Política de privacidade" e "Termos de uso" de dentro do app (Perfil do aluno e Configurações do profissional —
 * src/publico/privacidade/LinksPrivacidade.tsx): com ele, o "Voltar" da política volta para a tela de onde a pessoa veio, em vez do
 * início (o Voltar do Android já volta pelo histórico).
 */
export const ESTADO_ABERTA_PELO_APP = { doApp: true } as const;

/** A política foi aberta por um link de dentro do app (o `state` acima). */
export function abertaPeloApp(state: unknown): boolean {
  return Boolean(state && typeof state === "object" && (state as { doApp?: unknown }).doApp === true);
}
