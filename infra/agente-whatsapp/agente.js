// Physiq W28: cópia do physiqnutri (main 294887a, agente-whatsapp/agente.js) antes do repositório do Nutri ser arquivado.
// O agente continua rodando no Moto G7 de casa (Termux); mudanças nele passam a ser feitas a partir daqui.
// PhysiqNutri — W46: agente do WhatsApp que roda no celular de casa (Moto G7 Play, LineageOS + Termux, Node 24).
// Decisões dele (20/09/2026): QR code como no WhatsApp Web (biblioteca Baileys, API não oficial) · cada profissional conecta
// o PRÓPRIO número · o serviço mora no celular · "fechamos assim, camera fora do G7".
//
// O celular só faz conexão de SAÍDA: pergunta à Edge Function whatsapp-agente o que fazer e devolve o resultado. Não há porta
// aberta, túnel nem service_role aqui — a autenticação é o token em ~/.physiqnutri-agente-token (secret WHATSAPP_AGENTE_TOKEN).
// As credenciais da sessão do WhatsApp NUNCA vão pro banco: ficam em ~/whatsapp-pn/sessoes/<schema>/<nutricionista>/.
//
// Uso:
//   node agente.js              roda o loop (é o que o Termux:Boot chama)
//   node agente.js --provar     abre UMA sessão descartável, imprime o QR no terminal e sai (prova que a lib funciona aqui)
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { Boom } from "@hapi/boom";
// ⚠️ a biblioteca é CommonJS: sob ESM o makeWASocket vem no default e os ajudantes como exports NOMEADOS
// (tirar do `default` dá "useMultiFileAuthState is not a function" — foi o 1º erro no celular, 20/09/2026).
import makeWASocket, { DisconnectReason, fetchLatestBaileysVersion, useMultiFileAuthState } from "@whiskeysockets/baileys";
import QRCode from "qrcode";
import pino from "pino";

const CASA = os.homedir();
const RAIZ = path.join(CASA, "whatsapp-pn");
const SESSOES = path.join(RAIZ, "sessoes");
const URL = (leia(".physiqnutri-url") || "https://hkxvtsbwctxkrqzkkdoz.supabase.co").replace(/\/$/, "");
const TOKEN = leia(".physiqnutri-agente-token");
const SCHEMAS = (process.env.PN_SCHEMAS || "public,staging").split(",").map((s) => s.trim()).filter(Boolean);
const INTERVALO_MS = Number(process.env.PN_INTERVALO_MS || 5000);
const PING_MS = 60_000;
const ARQ_LOG = path.join(RAIZ, "agente.log");
// a biblioteca exige um logger no formato do pino; o NOSSO log é append direto no arquivo (o destino assíncrono do pino
// quebrava no encerramento do Termux: "sonic boom is not ready yet")
const silencioso = pino({ level: "silent" });

function leia(nome) {
  try { return fs.readFileSync(path.join(CASA, nome), "utf8").trim(); } catch { return ""; }
}

const log = {
  error(dados, msg) { escreverLog("ERRO " + msg + " " + JSON.stringify(dados)); },
};

function escreverLog(linha) {
  try { fs.appendFileSync(ARQ_LOG, `${new Date().toISOString()} ${linha}\n`); } catch { /* log é melhor esforço */ }
}

function aviso(...partes) {
  const linha = partes.join(" ");
  escreverLog(linha);
  console.log(new Date().toISOString().slice(11, 19), linha);
}

/** fala com a Edge Function; devolve o corpo JSON ou lança */
async function api(schema, corpo) {
  const r = await fetch(`${URL}/functions/v1/whatsapp-agente`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-agente-token": TOKEN, "x-schema": schema },
    body: JSON.stringify(corpo),
    signal: AbortSignal.timeout(30_000),
  });
  const texto = await r.text();
  let json = null;
  try { json = texto ? JSON.parse(texto) : null; } catch { /* corpo não-JSON */ }
  if (!r.ok) throw new Error(`${corpo.acao} ${r.status} ${String(texto).slice(0, 200)}`);
  return json ?? {};
}

// sockets vivos: chave `${schema}:${nutricionista_id}`
const vivos = new Map();
// tentativas de pareamento seguidas sem sucesso, por instância (zera quando conecta)
const tentativas = new Map();
const MAX_TENTATIVAS_PAREAMENTO = 8;
const chave = (schema, nutri) => `${schema}:${nutri}`;
const pastaSessao = (schema, nutri) => path.join(SESSOES, schema, nutri);

/** a pasta guarda um pareamento COMPLETO? (só o QR lido até o fim grava `registered`/`me`) */
function jaPareado(schema, nutri) {
  try {
    const c = JSON.parse(fs.readFileSync(path.join(pastaSessao(schema, nutri), "creds.json"), "utf8"));
    return c?.registered === true || !!c?.me?.id;
  } catch {
    return false;
  }
}

async function derrubar(schema, nutri, { apagarCredenciais = false } = {}) {
  const k = chave(schema, nutri);
  const atual = vivos.get(k);
  if (atual) {
    vivos.delete(k);
    try { atual.sock.end(undefined); } catch { /* já morto */ }
  }
  if (apagarCredenciais) {
    try { fs.rmSync(pastaSessao(schema, nutri), { recursive: true, force: true }); } catch { /* nada a apagar */ }
  }
}

/** abre (ou reabre) a sessão de uma profissional; publica o QR e o status pela function.
 * `limpar` apaga credenciais PARCIAIS antes: reabrir com as chaves de um pareamento que não terminou faz o WhatsApp
 * responder badSession (500) em ~4 s, e aí todo QR morre antes de ser lido (caso real dele, 20/09/2026). */
async function abrir(schema, nutri, instanciaId, { limpar = false } = {}) {
  const k = chave(schema, nutri);
  if (vivos.has(k)) return vivos.get(k);
  const pasta = pastaSessao(schema, nutri);
  if (limpar) {
    try { fs.rmSync(pasta, { recursive: true, force: true }); } catch { /* nada a apagar */ }
  }
  fs.mkdirSync(pasta, { recursive: true });
  const { state, saveCreds } = await useMultiFileAuthState(pasta);
  const { version } = await fetchLatestBaileysVersion();
  const sock = makeWASocket({
    version,
    auth: state,
    logger: silencioso,
    printQRInTerminal: false,
    // identificação de navegador comum e aceita; nome inventado aumenta a chance de o WhatsApp recusar o pareamento
    browser: ["Ubuntu", "Chrome", "22.04.4"],
    syncFullHistory: false,
    markOnlineOnConnect: false,
    // um QR novo a cada 40 s, com a tela aceitando até 50 s: sempre há sobreposição e ela nunca exibe código morto
    qrTimeout: 40_000,
  });
  const registro = { sock, nutri, schema, instanciaId, qrEnviadoEm: 0 };
  vivos.set(k, registro);

  sock.ev.on("creds.update", saveCreds);
  sock.ev.on("connection.update", async (u) => {
    const { connection, lastDisconnect, qr } = u;
    try {
      if (qr) {
        // o WhatsApp troca o código a cada ~20 s; a tela só mostra o mais novo
        const dataUrl = await QRCode.toDataURL(qr, { margin: 1, width: 320 });
        registro.qrEnviadoEm = Date.now();
        await api(schema, { acao: "qr", instancia_id: instanciaId, nutricionista_id: nutri, qr_code: dataUrl });
        aviso("QR publicado", schema, nutri.slice(0, 8));
      }
      if (connection === "open") {
        const numero = (sock.user?.id || "").split(":")[0].replace(/\D/g, "");
        tentativas.delete(k);
        await api(schema, { acao: "conectado", instancia_id: instanciaId, nutricionista_id: nutri, numero_conectado: numero });
        aviso("conectado", schema, nutri.slice(0, 8), numero);
      }
      if (connection === "close") {
        const motivo = new Boom(lastDisconnect?.error)?.output?.statusCode;
        const deslogado = motivo === DisconnectReason.loggedOut;
        const substituido = motivo === DisconnectReason.connectionReplaced;
        const pareado = jaPareado(schema, nutri);
        vivos.delete(k);
        if (deslogado) {
          await derrubar(schema, nutri, { apagarCredenciais: true });
          await api(schema, { acao: "caiu", instancia_id: instanciaId, nutricionista_id: nutri, erro: "o WhatsApp desconectou este aparelho", definitivo: false });
          aviso("deslogado", schema, nutri.slice(0, 8));
        } else if (substituido) {
          await api(schema, { acao: "caiu", instancia_id: instanciaId, nutricionista_id: nutri, erro: "outra sessão assumiu a conexão", definitivo: false });
        } else if (!pareado) {
          // caiu ANTES de alguém ler o QR: as chaves gravadas não servem pra nada e reusá-las dá badSession (500).
          // Apaga e deixa a próxima rodada começar do zero — com limite, pra não ficar em loop eterno.
          const n = (tentativas.get(k) ?? 0) + 1;
          tentativas.set(k, n);
          try { fs.rmSync(pastaSessao(schema, nutri), { recursive: true, force: true }); } catch { /* já não existe */ }
          aviso("pareamento não concluído", schema, nutri.slice(0, 8), "motivo", String(motivo), "tentativa", String(n));
          if (n >= MAX_TENTATIVAS_PAREAMENTO) {
            tentativas.delete(k);
            await api(schema, {
              acao: "caiu", instancia_id: instanciaId, nutricionista_id: nutri,
              erro: "não deu pra abrir a conexão com o WhatsApp agora; tente de novo em alguns minutos", definitivo: false,
            });
          }
        } else {
          // queda de rede numa sessão JÁ pareada: a próxima rodada reabre com as credenciais boas
          aviso("queda", schema, nutri.slice(0, 8), "motivo", String(motivo));
        }
      }
    } catch (e) {
      log.error({ e: String(e) }, "connection.update");
    }
  });
  return registro;
}

async function enviarMensagem(schema, msg) {
  const k = chave(schema, msg.nutricionista_id);
  const registro = vivos.get(k);
  if (!registro) return { ok: false, erro: "sessão não está aberta neste aparelho" };
  const destino = String(msg.destino_e164 || "").replace(/\D/g, "");
  if (destino.length < 12) return { ok: false, erro: "número inválido" };
  try {
    const jid = `${destino}@s.whatsapp.net`;
    const [existe] = await registro.sock.onWhatsApp(jid);
    if (!existe?.exists) return { ok: false, erro: "esse número não tem WhatsApp" };
    await registro.sock.sendMessage(existe.jid, { text: String(msg.texto || "") });
    return { ok: true };
  } catch (e) {
    return { ok: false, erro: String(e).slice(0, 200) };
  }
}

async function rodada(schema) {
  const t = await api(schema, { acao: "tarefas" });
  for (const inst of t.conectar ?? []) {
    // ⚠️ NÃO derrubar e reabrir a cada rodada: enquanto ninguém lê o QR a instância continua em 'aguardando_qr' e
    // voltaria nesta lista a cada 5 s. O socket vivo já emite um QR novo a cada ~20 s sozinho (e o handler republica).
    if (vivos.has(chave(schema, inst.nutricionista_id))) continue;
    await abrir(schema, inst.nutricionista_id, inst.id, { limpar: !jaPareado(schema, inst.nutricionista_id) });
  }
  for (const nutri of t.derrubar ?? []) {
    if (vivos.has(chave(schema, nutri))) {
      await derrubar(schema, nutri, { apagarCredenciais: true });
      aviso("derrubada a pedido", schema, String(nutri).slice(0, 8));
    }
  }
  // conectadas no banco mas sem socket aqui (o celular reiniciou): reabre do disco, sem QR
  for (const nutri of t.manter ?? []) {
    if (!vivos.has(chave(schema, nutri)) && fs.existsSync(path.join(pastaSessao(schema, nutri), "creds.json"))) {
      await abrir(schema, nutri, null);
      aviso("sessão restaurada", schema, String(nutri).slice(0, 8));
    }
  }
  for (const msg of t.fila ?? []) {
    const r = await enviarMensagem(schema, msg);
    await api(schema, { acao: "resultado", mensagem_id: msg.id, ok: r.ok, erro: r.erro });
    aviso("mensagem", msg.tipo, r.ok ? "enviada" : `falhou (${r.erro})`);
  }
}

async function loop() {
  if (!TOKEN) throw new Error("falta ~/.physiqnutri-agente-token");
  aviso("agente no ar", URL, "schemas:", SCHEMAS.join("+"));
  let ultimoPing = 0;
  for (;;) {
    for (const schema of SCHEMAS) {
      try { await rodada(schema); } catch (e) { log.error({ e: String(e) }, `rodada ${schema}`); }
    }
    if (Date.now() - ultimoPing > PING_MS) {
      ultimoPing = Date.now();
      for (const schema of SCHEMAS) {
        try { await api(schema, { acao: "ping" }); } catch { /* ping é melhor esforço */ }
      }
    }
    await new Promise((r) => setTimeout(r, INTERVALO_MS));
  }
}

/** prova local: abre uma sessão descartável e imprime o QR aqui, sem tocar no banco */
async function provar() {
  const pasta = path.join(RAIZ, "sessao-prova");
  fs.rmSync(pasta, { recursive: true, force: true });
  fs.mkdirSync(pasta, { recursive: true });
  const { state, saveCreds } = await useMultiFileAuthState(pasta);
  const { version } = await fetchLatestBaileysVersion();
  console.log("versão do WhatsApp Web:", version.join("."));
  const sock = makeWASocket({ version, auth: state, logger: silencioso, browser: ["PhysiqNutri", "Chrome", "1.0.0"] });
  sock.ev.on("creds.update", saveCreds);
  await new Promise((resolve) => {
    const limite = setTimeout(() => { console.log("sem QR em 60 s"); resolve(); }, 60_000);
    sock.ev.on("connection.update", async ({ qr, connection }) => {
      if (qr) {
        const dataUrl = await QRCode.toDataURL(qr, { margin: 1, width: 320 });
        console.log("QR gerado: texto", qr.length, "chars | dataURL", dataUrl.length, "chars");
        console.log(await QRCode.toString(qr, { type: "terminal", small: true }));
        clearTimeout(limite);
        try { sock.end(undefined); } catch { /* fim */ }
        resolve();
      }
      if (connection === "close") { clearTimeout(limite); resolve(); }
    });
  });
  fs.rmSync(pasta, { recursive: true, force: true });
}

const alvo = process.argv.includes("--provar") ? provar : loop;
alvo().catch((e) => { console.error("agente parou:", e); process.exit(1); });
