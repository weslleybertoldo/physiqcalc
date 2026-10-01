// Physiq H3 — o MOLDE de todos os e-mails do app (a "Opção C" que ele escolheu em 01/10/2026: topo lilás com a logo e o
// rótulo, bloco de destaque, saudação, dados em linhas com ícone, botão roxo + secundários, link de reserva, rodapé e o texto
// de prévia). Regras PURAS (sem Deno e sem rede): usadas pelas 4 funções que mandam e-mail (agenda-avisar, aluno-enviar,
// convites, alunos) e testadas no Vitest (src/email/emailModelo.test.ts).
//
// HTML de e-mail: tabelas + CSS inline, cartão de até 560 px (nunca mais que 600), sem JS e sem SVG (o Gmail não mostra SVG
// no corpo — os ícones são PNG hospedados no bucket público "email" do banco principal). A Geist só carrega onde o app de
// e-mail aceita fonte web (Apple Mail); no Gmail cai na fonte do celular. Botão roxo (o branco some no modo escuro do Gmail).
// TODO texto que vem do banco passa pelo escaparHtml aqui dentro (quem monta o e-mail entrega texto puro).

/** Escapa o texto para o HTML do e-mail (nomes, conta, e-mail, títulos — tudo o que vem do banco). */
export function escaparHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string);
}

/** Onde ficam os ícones e a logo (bucket público "email" do banco principal, pelo domínio próprio; v1 = nunca muda). */
export const IMAGENS_EMAIL = "https://api-principal.physiqcalc.com.br/storage/v1/object/public/email/v1";

/** Os PNG do molde (gerados dos ícones Lucide das telas premium; a logo é o icon-192 do app). */
export const ICONES_EMAIL = {
  logo: "logo-physiq.png",
  calendario: "cal-violeta.png",
  relogio: "relogio-violeta.png",
  salada: "salada-violeta.png",
  saladaVerde: "salada-verde.png",
  halter: "halter-violeta.png",
  lista: "lista-violeta.png",
  email: "email-violeta.png",
  escudo: "escudo-violeta.png",
  estetoscopio: "estetoscopio-violeta.png",
  /** 26 px: o bloco "o que mudou" do plano atualizado */
  halterGrande: "halter-violeta-26.png",
  saladaVerdeGrande: "salada-verde-26.png",
} as const;
export type IconeEmail = keyof typeof ICONES_EMAIL;

export function urlDoIcone(icone: IconeEmail): string {
  return `${IMAGENS_EMAIL}/${ICONES_EMAIL[icone]}`;
}

const FONTE = "Geist,-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";
const TABELA = 'role="presentation" cellpadding="0" cellspacing="0" border="0"';
const TABELA_100 = 'role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"';
/** Caracteres invisíveis depois do texto de prévia (30 pares): o Gmail não completa a prévia com o começo do corpo. */
const RECHEIO_PAR = "&#8199;&#847;";
/** Palavra longa sem espaço (um e-mail, um nome de conta) quebra em vez de alargar o cartão e espremer a coluna dos ícones. */
const QUEBRA = "word-break:break-word;overflow-wrap:anywhere";

/** Só http(s) e mailto viram link; qualquer outra coisa cai no site (nunca javascript: nem data:). */
function hrefSeguro(href: string, site: string): string {
  return /^(https?:\/\/|mailto:)/i.test(href.trim()) ? href.trim() : site;
}

/** "https://physiqcalc.com.br/perfil/agenda" → "physiqcalc.com.br/perfil/agenda" (o que aparece no link de reserva). */
export function linkSemProtocolo(url: string): string {
  return url.trim().replace(/^https?:\/\//i, "").replace(/\/+$/, "");
}

/** "Weslley Bertoldo" → "WB" · "Lucas" → "L" · "" → "P" (as iniciais do avatar e do selo). */
export function iniciaisDe(nome: string | null | undefined): string {
  const palavras = (nome ?? "").trim().split(/\s+/).map((p) => Array.from(p).find((c) => /[\p{L}\p{N}]/u.test(c)) ?? "").filter(Boolean);
  if (!palavras.length) return "P";
  const ini = palavras.length === 1 ? palavras[0] : `${palavras[0]}${palavras[palavras.length - 1]}`;
  return ini.toLocaleUpperCase("pt-BR");
}

// ───────────────────────── as peças ─────────────────────────

/** Trecho da saudação: texto puro ou em negrito (os 2 escapados aqui). */
export type Trecho = string | { forte: string };

export interface LinhaEmail {
  /** ícone PNG (18 px) — ou as iniciais num círculo (o "com"/"por"/"convidado por") */
  icone?: IconeEmail;
  iniciais?: string;
  rotulo: string;
  valor: string;
  /** o valor vira link (ex.: mailto: do e-mail do convite) */
  href?: string | null;
  /** texto menor embaixo do valor */
  nota?: string | null;
}

export interface BotaoEmail {
  texto: string;
  href: string;
}

/** O visual à esquerda do destaque: a folhinha do calendário, os ícones do que mudou, a inicial da pessoa ou o selo da equipe. */
export type VisualDestaque =
  | { tipo: "calendario"; semana: string; dia: string; mes: string }
  | { tipo: "icones"; icones: readonly IconeEmail[] }
  | { tipo: "pessoa"; iniciais: string }
  | { tipo: "equipe"; iniciais: string };

export interface DestaqueEmail {
  visual: VisualDestaque;
  /** o texto pequeno em caixa alta ("CONSULTA DE NUTRIÇÃO", "O QUE MUDOU") */
  olho: string;
  /** o texto grande ("13:30", "Treino e dieta", o nome) */
  titulo: string;
  /** a linha de baixo ("até 14:00 · 30 min") */
  sub?: string | null;
}

export interface EmailModelo {
  /** o <title> do HTML */
  titulo: string;
  /** o texto de prévia (aparece na lista da caixa de entrada) */
  preheader: string;
  /** o rótulo no canto do topo ("Convite de consulta") */
  rotulo: string;
  /** os blocos de destaque (a agenda manda 1 por consulta; os outros, 1) */
  destaques?: readonly DestaqueEmail[];
  saudacao: readonly Trecho[];
  linhas: readonly LinhaEmail[];
  primario: BotaoEmail;
  /** até 2 botões secundários (lado a lado) */
  secundarios?: readonly BotaoEmail[];
  /** o link de reserva embaixo dos botões ("Os botões abrem o app. Se não abrir, use o link:") */
  reserva: { texto: string; href: string };
  /** a 1ª linha do rodapé ("Você recebeu este e-mail porque…") */
  rodape: string;
  /** o site do ambiente (rodapé e reserva dos links) */
  site: string;
}

/** "Os botões abrem o app." · "O botão abre o Physiq." — o começo do texto de reserva pela quantidade de botões. */
export function textoDaReserva(botoes: number, destino: "o app" | "o Physiq" = "o app"): string {
  return `${botoes > 1 ? "Os botões abrem" : "O botão abre"} ${destino}. Se não abrir, use o link:`;
}

const esc = escaparHtml;

function visualDoDestaque(v: VisualDestaque): { celula: string; largura: number; alinhar: "top" | "middle" } {
  if (v.tipo === "calendario") {
    return {
      largura: 78,
      alinhar: "top",
      celula: `<table ${TABELA} width="78" style="width:78px;border-collapse:separate">
            <tr><td align="center" bgcolor="#7C3AED" style="padding:5px 0 4px;border-radius:14px 14px 0 0;background-color:#7C3AED;font-size:11px;line-height:14px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;color:#ffffff">${esc(v.semana)}</td></tr>
            <tr><td align="center" bgcolor="#ffffff" style="padding:4px 0 8px;border:1px solid #DDD6FE;border-top:0;border-radius:0 0 14px 14px;background-color:#ffffff">
              <p style="margin:0;font-size:34px;line-height:38px;font-weight:700;letter-spacing:-0.03em;color:#09090B">${esc(v.dia)}</p>
              <p style="margin:0;font-size:11px;line-height:14px;font-weight:600;letter-spacing:0.12em;text-transform:uppercase;color:#71717A">${esc(v.mes)}</p>
            </td></tr>
          </table>`,
    };
  }
  if (v.tipo === "icones") {
    const icones = v.icones
      .map((i, n) => `<td${n < v.icones.length - 1 ? ' style="padding-right:6px"' : ""}><img src="${urlDoIcone(i)}" width="26" height="26" alt="" style="display:block;width:26px;height:26px;border:0"></td>`)
      .join("");
    return {
      largura: 78,
      alinhar: "top",
      celula: `<table ${TABELA} width="78" style="width:78px;border-collapse:separate"><tr>
            <td align="center" valign="middle" height="76" bgcolor="#ffffff" style="height:76px;border:1px solid #DDD6FE;border-radius:16px;background-color:#ffffff">
              <table ${TABELA} align="center"><tr>${icones}</tr></table>
            </td>
          </tr></table>`,
    };
  }
  const pessoa = v.tipo === "pessoa";
  const fundo = pessoa
    ? "border-radius:36px;background-color:#7C3AED;background-image:linear-gradient(135deg,#8B5CF6,#10B981);font-size:24px;line-height:72px;font-weight:600"
    : "border-radius:20px;background-color:#6D28D9;background-image:linear-gradient(135deg,#8B5CF6,#4F46E5);font-size:24px;line-height:72px;font-weight:700";
  return {
    largura: 72,
    alinhar: "middle",
    celula: `<table ${TABELA}><tr>
            <td width="72" height="72" align="center" valign="middle" bgcolor="${pessoa ? "#7C3AED" : "#6D28D9"}" style="width:72px;height:72px;${fundo};letter-spacing:0.01em;color:#ffffff">${esc(v.iniciais)}</td>
          </tr></table>`,
  };
}

/** Tamanho do texto grande de cada destaque (o da agenda é a hora; o do plano, 2 palavras; o dos convites, um nome). */
function tituloDoDestaque(v: VisualDestaque): { tamanho: number; altura: number; margemSub: string } {
  if (v.tipo === "calendario") return { tamanho: 34, altura: 40, margemSub: "0" };
  if (v.tipo === "icones") return { tamanho: 28, altura: 34, margemSub: "0" };
  if (v.tipo === "pessoa") return { tamanho: 24, altura: 30, margemSub: "0" };
  return { tamanho: 24, altura: 29, margemSub: "2px 0 0" };
}

function blocoDestaque(d: DestaqueEmail, primeiro: boolean): string {
  const v = visualDoDestaque(d.visual);
  const t = tituloDoDestaque(d.visual);
  const sub = (d.sub ?? "").trim();
  return `
      <table ${TABELA_100} style="margin-top:${primeiro ? 20 : 14}px"><tr>
        <td width="${v.largura}" valign="${v.alinhar}" style="width:${v.largura}px">
          ${v.celula}
        </td>
        <td valign="middle" style="padding-left:16px">
          <p style="margin:0;font-size:11px;line-height:16px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:#7C3AED">${esc(d.olho)}</p>
          <p style="margin:2px 0 0;font-size:${t.tamanho}px;line-height:${t.altura}px;font-weight:700;letter-spacing:-0.03em;color:#09090B;${QUEBRA}">${esc(d.titulo)}</p>${sub ? `
          <p style="margin:${t.margemSub};font-size:13px;line-height:18px;color:#52525B">${esc(sub)}</p>` : ""}
        </td>
      </tr></table>`;
}

function avatarPequeno(iniciais: string): string {
  return `<table ${TABELA}><tr><td width="22" height="22" align="center" valign="middle" bgcolor="#7C3AED" style="width:22px;height:22px;border-radius:11px;background-color:#7C3AED;background-image:linear-gradient(135deg,#8B5CF6,#10B981);font-size:9px;line-height:22px;font-weight:700;color:#ffffff">${esc(iniciais)}</td></tr></table>`;
}

function linhaDeDados(l: LinhaEmail, primeira: boolean, ultima: boolean, site: string): string {
  const baixo = ultima ? 4 : 11;
  const borda = primeira ? "" : ";border-top:1px solid #F0F0F2";
  const comAvatar = !l.icone;
  const icone = comAvatar
    ? avatarPequeno(l.iniciais || iniciaisDe(l.valor))
    : `<img src="${urlDoIcone(l.icone!)}" width="18" height="18" alt="" style="display:block;width:18px;height:18px;border:0;margin-top:2px">`;
  const valor = l.href
    ? `<a href="${esc(hrefSeguro(l.href, site))}" style="color:#18181B;text-decoration:none">${esc(l.valor)}</a>`
    : esc(l.valor);
  const nota = (l.nota ?? "").trim();
  return `
        <tr>
          <td width="30" valign="top" style="width:30px;padding:${comAvatar ? 12 : 13}px 0 ${baixo}px${borda}">${icone}</td>
          <td valign="top" style="padding:12px 0 ${baixo}px${borda}">
            <p style="margin:0;font-size:11px;line-height:15px;font-weight:600;letter-spacing:0.08em;text-transform:uppercase;color:#A1A1AA">${esc(l.rotulo)}</p>
            <p style="margin:2px 0 0;font-size:15px;line-height:21px;font-weight:600;color:#18181B;${QUEBRA}">${valor}</p>${nota ? `
            <p style="margin:1px 0 0;font-size:13px;line-height:19px;color:#71717A;${QUEBRA}">${esc(nota)}</p>` : ""}
          </td>
        </tr>`;
}

function botaoPrimario(b: BotaoEmail, site: string): string {
  return `<table ${TABELA_100}><tr>
        <td align="center" bgcolor="#6D28D9" style="border-radius:14px;background-color:#6D28D9;background-image:linear-gradient(180deg,#8B5CF6,#6D28D9)">
          <a href="${esc(hrefSeguro(b.href, site))}" style="display:block;padding:15px 20px;font-family:${FONTE};font-size:15px;line-height:20px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:14px">${esc(b.texto)}</a>
        </td>
      </tr></table>`;
}

function botaoSecundario(b: BotaoEmail, site: string): string {
  return `<table ${TABELA_100}><tr>
            <td align="center" bgcolor="#ffffff" style="border:1px solid #DDD6FE;border-radius:14px;background-color:#ffffff">
              <a href="${esc(hrefSeguro(b.href, site))}" style="display:block;padding:13px 8px;font-family:${FONTE};font-size:14px;line-height:20px;font-weight:600;color:#6D28D9;text-decoration:none;border-radius:14px">${esc(b.texto)}</a>
            </td>
          </tr></table>`;
}

function botoesSecundarios(lista: readonly BotaoEmail[], site: string): string {
  const bs = lista.slice(0, 2);
  if (!bs.length) return "";
  const celulas = bs.length === 1
    ? `<td valign="top">
          ${botaoSecundario(bs[0], site)}
        </td>`
    : `<td width="50%" valign="top" style="padding-right:5px">
          ${botaoSecundario(bs[0], site)}
        </td>
        <td width="50%" valign="top" style="padding-left:5px">
          ${botaoSecundario(bs[1], site)}
        </td>`;
  return `
      <table ${TABELA_100} style="margin-top:10px"><tr>
        ${celulas}
      </tr></table>`;
}

function saudacaoHtml(trechos: readonly Trecho[]): string {
  return trechos
    .map((t) => (typeof t === "string" ? esc(t) : `<strong style="font-weight:600;color:#18181B">${esc(t.forte)}</strong>`))
    .join("");
}

/** O e-mail inteiro no molde C. */
export function montarEmail(e: EmailModelo): string {
  const site = hrefSeguro(e.site, "https://physiqcalc.com.br").replace(/\/+$/, "");
  const reserva = hrefSeguro(e.reserva.href, site);
  const destaques = (e.destaques ?? []).map((d, i) => blocoDestaque(d, i === 0)).join("");
  const linhas = e.linhas.map((l, i) => linhaDeDados(l, i === 0, i === e.linhas.length - 1, site)).join("");
  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="x-apple-disable-message-reformatting">
<meta name="format-detection" content="telephone=no, date=no, address=no, email=no">
<meta name="color-scheme" content="light">
<meta name="supported-color-schemes" content="light">
<title>${esc(e.titulo)}</title>
<style>
@font-face{font-family:'Geist';font-style:normal;font-weight:100 900;src:url('https://physiqcalc.com.br/fonts/geist-latin-wght.woff2') format('woff2')}
</style>
</head>
<body style="margin:0;padding:0;width:100%;background-color:#ffffff;-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%">
<div style="display:none;font-size:1px;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;mso-hide:all">${esc(e.preheader)}${RECHEIO_PAR.repeat(30)}</div>
<table ${TABELA_100} style="border-collapse:collapse">
<tr><td align="center" style="padding:0;font-family:${FONTE}">

  <!-- cartão -->
  <table ${TABELA_100} style="max-width:560px;border-collapse:separate;border:1px solid #E4E4E7;border-radius:20px;background-color:#ffffff">

    <!-- topo lilás: logo + destaque -->
    <tr><td bgcolor="#F5F3FF" style="padding:16px 18px 20px;border-radius:19px 19px 0 0;background-color:#F5F3FF">
      <table ${TABELA_100}><tr>
        <td width="26" valign="middle" style="width:26px"><img src="${urlDoIcone("logo")}" width="26" height="26" alt="" style="display:block;width:26px;height:26px;border:0;outline:none;text-decoration:none"></td>
        <td valign="middle" style="padding-left:9px;font-size:16px;line-height:22px;font-weight:700;letter-spacing:-0.03em;color:#18181B">Physiq</td>
        <td align="right" valign="middle" style="font-size:12px;line-height:16px;font-weight:600;color:#6D28D9">${esc(e.rotulo)}</td>
      </tr></table>${destaques}
    </td></tr>

    <!-- texto + dados em linhas -->
    <tr><td style="padding:20px 18px 0">
      <p style="margin:0 0 6px;font-size:15px;line-height:22px;color:#3F3F46">${saudacaoHtml(e.saudacao)}</p>
${e.linhas.length ? `
      <table ${TABELA_100}>${linhas}
      </table>` : ""}
    </td></tr>

    <!-- botões -->
    <tr><td style="padding:20px 18px 0">
      ${botaoPrimario(e.primario, site)}${botoesSecundarios(e.secundarios ?? [], site)}
    </td></tr>

    <!-- link de reserva -->
    <tr><td style="padding:16px 18px 18px">
      <p style="margin:0;text-align:center;font-size:12px;line-height:18px;color:#71717A">${esc(e.reserva.texto)}<br><a href="${esc(reserva)}" style="color:#52525B;text-decoration:underline">${esc(linkSemProtocolo(reserva))}</a></p>
    </td></tr>
  </table>

  <!-- rodapé -->
  <table ${TABELA_100} style="max-width:560px"><tr>
    <td align="center" style="padding:18px 12px 6px;font-size:12px;line-height:18px;color:#71717A">${esc(e.rodape)}<br><span style="font-weight:600;color:#52525B">Physiq</span> · <a href="${esc(site)}" style="color:#A1A1AA;text-decoration:none">${esc(linkSemProtocolo(site))}</a></td>
  </tr></table>

</td></tr>
</table>
</body>
</html>`;
}
