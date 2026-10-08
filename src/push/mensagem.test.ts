import { describe, expect, it } from "vitest";
import {
  avisoVelho,
  base64url,
  CANAL_AVISOS,
  claimsDoGoogle,
  contaAutenticou,
  CORPO_PADRAO_DO_PUSH,
  corpoDoPush,
  fimDoToken,
  ICONE_PUSH,
  lerContaDeServico,
  lerRespostaFcm,
  limiteDoTokenVencido,
  montarMensagem,
  pemParaDer,
  resumirEnvio,
  rotaSegura,
  segredoConfere,
  tituloDoPush,
  TOKEN_DE_VERIFICACAO,
  tokenValido,
} from "../../supabase-principal/functions/_shared/push-regras";

const TOKEN = "fGx1y2z3:APA91bH-exemplo_de_token.do-FCM_com_mais_de_vinte";
const AVISO = { id: "7b0b8a8e-1d2c-4f7e-9a51-2a8f1c3d4e5f", tipo: "consulta_marcada", titulo: "Consulta marcada: qui 02/10 às 08:30. Confirme no app", link: "/perfil/agenda" };

// hml-10 (H-48): os 9 tipos do avisos_tipo_check (migração da W06) com um aviso do jeito que o banco e as funções gravam
// (supabase-principal/migrations e functions): nome da pessoa, valor, motivo, dia e hora — nada disso pode ir no push.
const AVISOS_DE_VERDADE: Array<{ tipo: string; titulo: string; corpo: string }> = [
  { tipo: "comprovante_enviado", titulo: "Joana Prado enviou um comprovante · R$ 189,90", corpo: "Chegou um comprovante de pagamento." },
  { tipo: "pagamento_confirmado", titulo: "Pagamento confirmado · R$ 189,90", corpo: "Um pagamento foi confirmado." },
  { tipo: "pagamento_recusado", titulo: "Comprovante recusado: valor diferente do combinado", corpo: "Um comprovante precisa da sua atenção." },
  { tipo: "consulta_marcada", titulo: "Joana Prado desistiu da consulta de qui 02/10 às 08:30", corpo: "Tem novidade na sua agenda." },
  { tipo: "plano_atualizado", titulo: "Seu treino e sua dieta foram atualizados", corpo: "Seu plano foi atualizado." },
  { tipo: "avaliacao_nova", titulo: "Nova avaliação no seu histórico", corpo: "Você tem uma avaliação nova." },
  { tipo: "reacao_diario", titulo: "Carla Nutri reagiu à foto Café da manhã: 👏 — menos açúcar no café", corpo: "Tem novidade no seu diário." },
  { tipo: "membro_removido", titulo: "Você não faz mais parte da equipe de Studio Prado", corpo: "Houve uma mudança na sua equipe." },
  { tipo: "geral", titulo: "Bruno Lima excluiu a conta e saiu da equipe · 3 aluno(s) sem responsável", corpo: CORPO_PADRAO_DO_PUSH },
];

describe("W20c — a mensagem do FCM HTTP v1 de cada aviso do sino", () => {
  it("consulta marcada: título e corpo pelo tipo, a rota no data, canal Avisos, prioridade alta, visibilidade PRIVATE", () => {
    const m = montarMensagem(AVISO, TOKEN);
    expect(m.validate_only).toBeUndefined();
    expect(m.message.token).toBe(TOKEN);
    expect(m.message.notification).toEqual({ title: "Agenda", body: "Tem novidade na sua agenda." });
    expect(m.message.data).toEqual({ link: "/perfil/agenda", aviso_id: AVISO.id, tipo: "consulta_marcada" });
    expect(m.message.android.priority).toBe("HIGH");
    expect(m.message.android.notification).toEqual({
      channel_id: CANAL_AVISOS, icon: ICONE_PUSH, color: "#8B5CF6", tag: `aviso-${AVISO.id}`, visibility: "PRIVATE",
    });
    expect(CANAL_AVISOS).toBe("avisos");
    // os valores do data do FCM são sempre texto
    expect(Object.values(m.message.data).every((v) => typeof v === "string")).toBe(true);
  });
  it("validate_only quando pedido (verificação da conta de serviço — nada é entregue)", () => {
    expect(montarMensagem(AVISO, TOKEN, { validar: true }).validate_only).toBe(true);
  });
  it("cada tipo de aviso ganha o seu título; tipo desconhecido = Physiq", () => {
    expect(tituloDoPush("plano_atualizado")).toBe("Seu plano");
    expect(tituloDoPush("avaliacao_nova")).toBe("Avaliação nova");
    expect(tituloDoPush("pagamento_confirmado")).toBe("Pagamento");
    expect(tituloDoPush("geral")).toBe("Physiq");
    expect(tituloDoPush("outro")).toBe("Physiq");
    expect(tituloDoPush(null)).toBe("Physiq");
  });
  it("link fora do app (outro site, //host, javascript:) nunca vai no data: abre o início", () => {
    expect(montarMensagem({ ...AVISO, link: "https://golpe.example" }, TOKEN).message.data.link).toBe("/");
    expect(rotaSegura("//golpe.example/x")).toBe("/");
    expect(rotaSegura("javascript:alert(1)")).toBe("/");
    expect(rotaSegura("/painel/agenda?data=2026-10-02")).toBe("/painel/agenda?data=2026-10-02");
    expect(rotaSegura(null)).toBe("/");
    expect(rotaSegura("/a\nb")).toBe("/");
  });
});

describe("hml-10 (H-48) — o push sai sem nome e sem valor: o corpo é fixo por tipo; o texto completo fica no sino", () => {
  it("corpo por tipo: os 9 tipos do banco; o 'geral', tipo desconhecido, vazio e chave do Object caem no texto padrão", () => {
    for (const a of AVISOS_DE_VERDADE) expect(corpoDoPush(a.tipo), a.tipo).toBe(a.corpo);
    expect(CORPO_PADRAO_DO_PUSH).toBe("Você tem um aviso novo no Physiq.");
    for (const t of ["geral", "outro", "", null, undefined, "constructor", "__proto__", "toString", "Consulta_Marcada"]) {
      expect(corpoDoPush(t), String(t)).toBe(CORPO_PADRAO_DO_PUSH);
    }
  });
  it("o título do aviso (nome, valor, motivo, dia e hora) nunca vai no push — em nenhum campo da mensagem", () => {
    for (const a of AVISOS_DE_VERDADE) {
      const m = montarMensagem({ id: AVISO.id, tipo: a.tipo, titulo: a.titulo, link: "/perfil/pagamentos" }, TOKEN);
      expect(m.message.notification, a.tipo).toEqual({ title: tituloDoPush(a.tipo), body: a.corpo });
      const tudo = JSON.stringify(m);
      expect(tudo, a.tipo).not.toContain(a.titulo);
      for (const pedaco of ["Joana", "Prado", "Carla", "Bruno", "R$", "189,90", "02/10", "08:30", "recusado:", "açúcar", "Studio"]) {
        expect(tudo, `${a.tipo}: ${pedaco}`).not.toContain(pedaco);
      }
    }
  });
  it("aviso sem título, com título vazio ou enorme: o corpo é o do tipo (o título não é lido)", () => {
    expect(montarMensagem({ ...AVISO, titulo: "   " }, TOKEN).message.notification.body).toBe("Tem novidade na sua agenda.");
    expect(montarMensagem({ ...AVISO, titulo: null }, TOKEN).message.notification.body).toBe("Tem novidade na sua agenda.");
    expect(montarMensagem({ id: AVISO.id, tipo: "avaliacao_nova", link: null }, TOKEN).message.notification.body).toBe("Você tem uma avaliação nova.");
    expect(montarMensagem({ ...AVISO, titulo: "a".repeat(500) }, TOKEN).message.notification.body).toBe("Tem novidade na sua agenda.");
  });
  it("visibilidade PRIVATE escrita em toda mensagem (inclusive a da verificação da conta de serviço)", () => {
    for (const a of AVISOS_DE_VERDADE) {
      expect(montarMensagem({ id: AVISO.id, tipo: a.tipo, titulo: a.titulo, link: null }, TOKEN).message.android.notification.visibility).toBe("PRIVATE");
    }
    const verificacao = montarMensagem({ id: "verificacao", tipo: "geral", titulo: "Verificação", link: "/" }, TOKEN_DE_VERIFICACAO, { validar: true });
    expect(verificacao.message.android.notification.visibility).toBe("PRIVATE");
    expect(verificacao.message.notification).toEqual({ title: "Physiq", body: CORPO_PADRAO_DO_PUSH });
  });
});

describe("W20c — a resposta do FCM: token recusado sai da lista; falha passageira não", () => {
  it("200 = enviado (com o id da mensagem)", () => {
    expect(lerRespostaFcm(200, { name: "projects/physiq-br/messages/0:123" })).toEqual({ desfecho: "enviado", status: 200, codigo: "OK", nome: "projects/physiq-br/messages/0:123" });
  });
  it("404 UNREGISTERED (app desinstalado / token apagado) = token inválido", () => {
    const r = lerRespostaFcm(404, { error: { code: 404, status: "NOT_FOUND", message: "Requested entity was not found.", details: [{ "@type": "type.googleapis.com/google.firebase.fcm.v1.FcmError", errorCode: "UNREGISTERED" }] } });
    expect(r.desfecho).toBe("token_invalido");
    expect(r.codigo).toBe("UNREGISTERED");
  });
  it("400 INVALID_ARGUMENT do campo message.token (o token falso do teste) = token inválido", () => {
    const corpo = {
      error: {
        code: 400, status: "INVALID_ARGUMENT", message: "The registration token is not a valid FCM registration token",
        details: [
          { "@type": "type.googleapis.com/google.firebase.fcm.v1.FcmError", errorCode: "INVALID_ARGUMENT" },
          { "@type": "type.googleapis.com/google.rpc.BadRequest", fieldViolations: [{ field: "message.token", description: "Invalid registration token" }] },
        ],
      },
    };
    expect(lerRespostaFcm(400, corpo)).toMatchObject({ desfecho: "token_invalido", status: 400, codigo: "INVALID_ARGUMENT" });
  });
  it("403 SENDER_ID_MISMATCH (token de outro projeto) = token inválido", () => {
    expect(lerRespostaFcm(403, { error: { status: "PERMISSION_DENIED", details: [{ "@type": "type.googleapis.com/google.firebase.fcm.v1.FcmError", errorCode: "SENDER_ID_MISMATCH" }] } }).desfecho).toBe("token_invalido");
  });
  it("400 INVALID_ARGUMENT de OUTRO campo (a mensagem) = falha (o token fica)", () => {
    const r = lerRespostaFcm(400, { error: { status: "INVALID_ARGUMENT", message: "Invalid value at 'message.android.ttl'", details: [{ "@type": "type.googleapis.com/google.rpc.BadRequest", fieldViolations: [{ field: "message.android.ttl" }] }] } });
    expect(r.desfecho).toBe("falha");
  });
  it("401, 429 e 5xx = falha passageira (o token fica)", () => {
    expect(lerRespostaFcm(401, { error: { status: "UNAUTHENTICATED", message: "Request had invalid authentication credentials." } })).toMatchObject({ desfecho: "falha", codigo: "UNAUTHENTICATED" });
    expect(lerRespostaFcm(429, { error: { status: "RESOURCE_EXHAUSTED", details: [{ "@type": "type.googleapis.com/google.firebase.fcm.v1.FcmError", errorCode: "QUOTA_EXCEEDED" }] } })).toMatchObject({ desfecho: "falha", codigo: "QUOTA_EXCEEDED" });
    expect(lerRespostaFcm(503, null)).toMatchObject({ desfecho: "falha", codigo: "HTTP_503" });
  });
  it("a verificação da conta de serviço: 400 de token = autenticou; 401/OAuth = não", () => {
    expect(contaAutenticou(lerRespostaFcm(400, { error: { status: "INVALID_ARGUMENT", message: "The registration token is not a valid FCM registration token" } }))).toBe(true);
    expect(contaAutenticou(lerRespostaFcm(401, { error: { status: "UNAUTHENTICATED" } }))).toBe(false);
    expect(contaAutenticou({ desfecho: "falha", status: 0, codigo: "OAUTH" })).toBe(false);
    expect(tokenValido(TOKEN_DE_VERIFICACAO)).toBe(true);
  });
  it("resumo do envio", () => {
    expect(resumirEnvio([
      { desfecho: "enviado", status: 200, codigo: "OK" },
      { desfecho: "token_invalido", status: 404, codigo: "UNREGISTERED" },
      { desfecho: "falha", status: 503, codigo: "HTTP_503" },
      { desfecho: "enviado", status: 200, codigo: "OK" },
    ])).toEqual({ aparelhos: 4, enviados: 2, recusados: 1, falhas: 1 });
  });
});

describe("W20c — token, segredo, conta de serviço e prazos", () => {
  it("token aceito: só os caracteres do FCM, de 20 a 4096", () => {
    expect(tokenValido(TOKEN)).toBe(true);
    expect(tokenValido("curto")).toBe(false);
    expect(tokenValido("com espaço e mais de vinte caracteres")).toBe(false);
    expect(tokenValido("'; drop table push_aparelhos; --xxxxxxxx")).toBe(false);
    expect(tokenValido(null)).toBe(false);
    expect(fimDoToken(TOKEN)).toBe("…_vinte");
  });
  it("segredo do cabeçalho: igual = ok; diferente, vazio ou curto = não", () => {
    const s = "x".repeat(48);
    expect(segredoConfere(s, s)).toBe(true);
    expect(segredoConfere(s.slice(0, 47) + "y", s)).toBe(false);
    expect(segredoConfere(s + "z", s)).toBe(false);
    expect(segredoConfere("", s)).toBe(false);
    expect(segredoConfere(null, s)).toBe(false);
    expect(segredoConfere("curto", "curto")).toBe(false);
  });
  it("conta de serviço: lê o JSON da chave; faltou campo = null", () => {
    const json = JSON.stringify({ type: "service_account", project_id: "physiq-br", client_email: "fcm-envio@physiq-br.iam.gserviceaccount.com", private_key: "-----BEGIN PRIVATE KEY-----\nAAAA\n-----END PRIVATE KEY-----\n", token_uri: "https://oauth2.googleapis.com/token" });
    expect(lerContaDeServico(json)).toMatchObject({ project_id: "physiq-br", client_email: "fcm-envio@physiq-br.iam.gserviceaccount.com", token_uri: "https://oauth2.googleapis.com/token" });
    expect(lerContaDeServico(JSON.stringify({ project_id: "x" }))).toBeNull();
    expect(lerContaDeServico("não é json")).toBeNull();
    expect(lerContaDeServico(undefined)).toBeNull();
    expect(lerContaDeServico(JSON.stringify({ project_id: "p", client_email: "a@b", private_key: "-----BEGIN PRIVATE KEY-----x" }))?.token_uri).toBe("https://oauth2.googleapis.com/token");
  });
  it("claims do JWT do Google: escopo do FCM, 1 hora", () => {
    expect(claimsDoGoogle({ client_email: "a@b.iam", token_uri: "https://oauth2.googleapis.com/token" }, 1000)).toEqual({
      iss: "a@b.iam", scope: "https://www.googleapis.com/auth/firebase.messaging", aud: "https://oauth2.googleapis.com/token", iat: 1000, exp: 4600,
    });
  });
  it("base64url e PEM → DER", () => {
    expect(base64url('{"alg":"RS256","typ":"JWT"}')).toBe("eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9");
    expect(base64url(new Uint8Array([251, 255, 254]))).toBe("-__-");
    expect(Array.from(pemParaDer("-----BEGIN PRIVATE KEY-----\nAQID\n-----END PRIVATE KEY-----\n"))).toEqual([1, 2, 3]);
  });
  it("aviso com mais de 6 h não vira push; token sem abrir o app há 270 dias vence", () => {
    const agora = new Date("2026-10-01T12:00:00Z");
    expect(avisoVelho("2026-10-01T11:59:00Z", agora)).toBe(false);
    expect(avisoVelho("2026-10-01T05:59:00Z", agora)).toBe(true);
    expect(avisoVelho(null, agora)).toBe(true);
    expect(limiteDoTokenVencido(agora)).toBe("2026-01-04T12:00:00.000Z");
  });
});
