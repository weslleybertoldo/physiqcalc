/**
 * Configurações › Perfil (W5, spec 4.6): regras puras do formulário do profissional. Os dados moram no BANCO PRINCIPAL, em
 * `profiles.nome`, `profiles.tipo_perfil` e `profiles.dados_profissionais` — o MESMO jsonb que o site do PhysiqNutri já usa
 * (crn, whatsapp_e164, telefone formatado, endereco, cidade, uf; os PDFs e o WhatsApp de lá leem daqui), mais registro/cref
 * (W4) e foto_url (W5). O que a tela não edita fica como estava (ex.: plano do Nutri).
 */
export type TipoPerfil = "personal" | "nutricionista" | "academico" | "outra_area";

export const TIPOS_PERFIL: { id: TipoPerfil; rotulo: string; registro: string }[] = [
  { id: "personal", rotulo: "Personal trainer (Ed. Física)", registro: "CREF" },
  { id: "nutricionista", rotulo: "Nutricionista", registro: "CRN" },
  { id: "academico", rotulo: "Acadêmico de Nutrição", registro: "Matrícula / CRN" },
  { id: "outra_area", rotulo: "Outra área", registro: "Registro" },
];

export const UFS = [
  "AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS", "MG", "PA", "PB", "PR", "PE", "PI", "RJ", "RN", "RS", "RO", "RR",
  "SC", "SP", "SE", "TO",
] as const;

export const NOME_MAX = 80;
export const REGISTRO_MAX = 30;
export const ENDERECO_MAX = 160;
export const CIDADE_MAX = 80;
export const SENHA_MIN = 8;

export interface FormPerfil {
  nome: string;
  tipo: TipoPerfil | "";
  registro: string;
  whatsapp: string;
  endereco: string;
  cidade: string;
  uf: string;
}

const objeto = (v: unknown): Record<string, unknown> => (v && typeof v === "object" && !Array.isArray(v) ? { ...(v as Record<string, unknown>) } : {});
const texto = (o: Record<string, unknown>, k: string): string => (typeof o[k] === "string" ? (o[k] as string) : "");
const vazioNull = (s: string): string | null => (s.trim() ? s.trim() : null);

// ---- WhatsApp em E.164 (a integração de mensagens automáticas usa este formato) ----
export const RE_E164 = /^\+[1-9]\d{9,14}$/;

/** "(11) 99999-8888", "11999998888", "+55 11 99999-8888", "5511999998888" → "+5511999998888"; vazio/inválido → null */
export function paraE164(digitado: string, ddiPadrao = "55"): string | null {
  const s = digitado.trim();
  if (!s) return null;
  let d = s.replace(/\D/g, "");
  if (!d) return null;
  if (s.startsWith("+")) {
    const e = `+${d}`;
    return RE_E164.test(e) ? e : null;
  }
  if ((d.length === 12 || d.length === 13) && d.startsWith(ddiPadrao)) d = d.slice(ddiPadrao.length);
  if (d.length !== 10 && d.length !== 11) return null;
  const e = `+${ddiPadrao}${d}`;
  return RE_E164.test(e) ? e : null;
}

/** "+5511999998888" → "+55 (11) 99999-8888" (o `telefone` que os PDFs do Nutri mostram) */
export function formatarWhatsapp(e164: string | null | undefined): string {
  if (!e164) return "";
  const d = e164.replace(/\D/g, "");
  if (!e164.startsWith("+55") || (d.length !== 12 && d.length !== 13)) return e164;
  const ddd = d.slice(2, 4);
  const num = d.slice(4);
  const corte = num.length - 4;
  return `+55 (${ddd}) ${num.slice(0, corte)}-${num.slice(corte)}`;
}

/** máscara ao digitar: (11) 99999-8888 aos poucos; "55" colado na frente sai */
export function mascararTelefoneBR(digitado: string): string {
  let d = digitado.replace(/\D/g, "");
  if ((d.length === 12 || d.length === 13) && d.startsWith("55")) d = d.slice(2);
  d = d.slice(0, 11);
  if (!d) return "";
  if (d.length <= 2) return `(${d}`;
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

export function rotuloRegistro(tipo: TipoPerfil | ""): string {
  return TIPOS_PERFIL.find((t) => t.id === tipo)?.registro ?? "Registro profissional";
}

/** O formulário a partir do perfil (sem nome no perfil, o do cadastro — nunca o e-mail). */
export function formDoPerfil(p: { nome?: string | null; tipo_perfil?: string | null; dados_profissionais?: unknown } | null, nomeCadastro = ""): FormPerfil {
  const o = objeto(p?.dados_profissionais);
  const tipo = TIPOS_PERFIL.some((t) => t.id === p?.tipo_perfil) ? (p!.tipo_perfil as TipoPerfil) : "";
  const e164 = RE_E164.test(texto(o, "whatsapp_e164")) ? texto(o, "whatsapp_e164") : paraE164(texto(o, "telefone")) ?? "";
  const registro = texto(o, "registro") || (tipo === "personal" ? texto(o, "cref") : texto(o, "crn")) || texto(o, "crn") || texto(o, "cref");
  const uf = texto(o, "uf");
  return {
    nome: (p?.nome ?? "").trim() || nomeCadastro,
    tipo,
    registro,
    whatsapp: e164 ? mascararTelefoneBR(e164.startsWith("+55") ? e164.slice(3) : e164) : "",
    endereco: texto(o, "endereco"),
    cidade: texto(o, "cidade"),
    uf: (UFS as readonly string[]).includes(uf) ? uf : "",
  };
}

/** Validação ao vivo (null = ok). */
export function validarPerfil(f: FormPerfil): string | null {
  const nome = f.nome.trim();
  if (nome.length < 2) return "Informe seu nome (pelo menos 2 letras).";
  if (nome.length > NOME_MAX) return `O nome pode ter até ${NOME_MAX} caracteres.`;
  if (f.registro.trim().length > REGISTRO_MAX) return `O registro pode ter até ${REGISTRO_MAX} caracteres.`;
  if (f.whatsapp.trim() && !paraE164(f.whatsapp)) return "WhatsApp inválido: informe DDD e número, ex. (11) 99999-8888.";
  if (f.endereco.trim().length > ENDERECO_MAX) return `O endereço pode ter até ${ENDERECO_MAX} caracteres.`;
  if (f.cidade.trim().length > CIDADE_MAX) return `A cidade pode ter até ${CIDADE_MAX} caracteres.`;
  if (f.uf && !(UFS as readonly string[]).includes(f.uf)) return "UF inválida.";
  return null;
}

/**
 * O jsonb a gravar: preserva o que a tela não edita (plano do Nutri, foto…), guarda o registro em `registro` e no campo do
 * conselho (crn para nutrição, cref para o personal — como o "Sou profissional" da W4) e o WhatsApp nos 2 formatos de hoje.
 */
export function dadosParaGravar(f: FormPerfil, anterior: unknown): Record<string, unknown> {
  const e164 = paraE164(f.whatsapp);
  const registro = vazioNull(f.registro);
  const o = objeto(anterior);
  const saida: Record<string, unknown> = {
    ...o,
    registro,
    whatsapp_e164: e164,
    telefone: e164 ? formatarWhatsapp(e164) : null,
    endereco: vazioNull(f.endereco),
    cidade: vazioNull(f.cidade),
    uf: f.uf || null,
  };
  if (f.tipo === "personal") saida.cref = registro;
  else if (f.tipo === "nutricionista" || f.tipo === "academico") saida.crn = registro;
  return saida;
}

/** A foto do Perfil (a que o profissional enviou) — sem ela vale a do Google. */
export function fotoDoPerfil(dados: unknown): string | null {
  const f = texto(objeto(dados), "foto_url").trim();
  return /^https:\/\//i.test(f) ? f : null;
}

export function comFoto(dados: unknown, url: string | null): Record<string, unknown> {
  return { ...objeto(dados), foto_url: url };
}

export function validarNovaSenha(f: { senha: string; confirmacao: string }): string | null {
  if (f.senha.length < SENHA_MIN) return `A senha precisa ter pelo menos ${SENHA_MIN} caracteres.`;
  if (!/[A-Za-z]/.test(f.senha) || !/[0-9]/.test(f.senha)) return "A senha precisa ter letras e números.";
  if (f.senha !== f.confirmacao) return "A confirmação não é igual à senha.";
  return null;
}

/** Como a pessoa entra hoje (as identidades do login do principal). */
export function formasDeEntrar(u: { identities?: Array<{ provider?: string }> | null; app_metadata?: Record<string, unknown> } | null | undefined): { google: boolean; senha: boolean } {
  const provs = new Set<string>();
  for (const i of u?.identities ?? []) if (i?.provider) provs.add(i.provider);
  const lista = (u?.app_metadata?.providers as unknown) ?? [];
  if (Array.isArray(lista)) for (const p of lista) if (typeof p === "string") provs.add(p);
  return { google: provs.has("google"), senha: provs.has("email") };
}
