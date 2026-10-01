// Physiq W22 — regras puras das MENSAGENS AUTOMÁTICAS do WhatsApp (porta de src/lib/whatsappDisparosUtil.ts do PhysiqNutri, W47).
// Tudo nasce DESLIGADO: o profissional liga o que quiser e escreve o texto. A config mora em profiles.config.whatsapp — a MESMA do
// site antigo do Nutri (a nutri vê a mesma coisa nos 2 lugares).
// ⚠️ Os textos padrão aqui são os MESMOS da função whatsapp_texto() do banco principal — quem envia é o banco; a tela só mostra o
// padrão como sugestão. Mudou um, muda o outro (e o do site antigo, src/lib/whatsappDisparosUtil.ts do PhysiqNutri).

export type Momento =
  | "aniversario"
  | "lembrete_vespera"
  | "lembrete_dia"
  | "cobranca_vencendo"
  | "cobranca_vencida"
  | "confirmacao_agendamento";

export type Disparo = {
  chave: Momento;
  titulo: string;
  /** o nome curto da linha no cartão (o título inteiro fica no painel do texto) */
  curto: string;
  descricao: string;
  /** quando sai (o resumo da linha) */
  quando: string;
  /** variáveis que fazem sentido neste momento */
  variaveis: string[];
  padrao: string;
};

export const DISPAROS: Disparo[] = [
  {
    chave: "aniversario",
    curto: "Aniversário",
    titulo: "Aniversário do aluno",
    descricao: "No dia do aniversário, no horário escolhido.",
    quando: "No dia",
    variaveis: ["{nome}", "{profissional}"],
    padrao: "Oi, {nome}! Feliz aniversário! 🎉 Que seu dia seja ótimo. Um abraço, {profissional}.",
  },
  {
    chave: "lembrete_vespera",
    curto: "Véspera da consulta",
    titulo: "Lembrete de consulta — véspera",
    descricao: "Um dia antes da consulta.",
    quando: "Véspera",
    variaveis: ["{nome}", "{data}", "{hora}"],
    padrao: "Oi, {nome}! Passando pra lembrar da sua consulta amanhã, dia {data}, às {hora}. Até lá!",
  },
  {
    chave: "lembrete_dia",
    curto: "Dia da consulta",
    titulo: "Lembrete de consulta — no dia",
    descricao: "No dia da consulta, só se ela ainda não começou.",
    quando: "No dia",
    variaveis: ["{nome}", "{hora}"],
    padrao: "Oi, {nome}! Sua consulta é hoje às {hora}. Te espero!",
  },
  {
    chave: "cobranca_vencendo",
    curto: "Cobrança a vencer",
    titulo: "Cobrança a vencer",
    descricao: "Um dia antes do vencimento da mensalidade ou da cobrança.",
    quando: "D-1",
    variaveis: ["{nome}", "{data}", "{valor}"],
    padrao: "Oi, {nome}! Sua mensalidade de {valor} vence amanhã, dia {data}. Qualquer dúvida é só me chamar.",
  },
  {
    chave: "cobranca_vencida",
    curto: "Cobrança vencida",
    titulo: "Cobrança vencida",
    descricao: "Um dia depois do vencimento, se continuar em aberto.",
    quando: "D+1",
    variaveis: ["{nome}", "{data}", "{valor}"],
    padrao: "Oi, {nome}! Notei que a mensalidade de {valor}, que venceu em {data}, ainda está em aberto. Se já pagou, me avisa pra eu dar baixa.",
  },
  {
    chave: "confirmacao_agendamento",
    curto: "Confirmação ao agendar",
    titulo: "Confirmação ao agendar",
    descricao: "Na hora em que a consulta é marcada, não no horário escolhido.",
    quando: "Na hora",
    variaveis: ["{nome}", "{data}", "{hora}"],
    padrao: "Oi, {nome}! Sua consulta ficou marcada para {data} às {hora}. Até lá!",
  },
];

export type ConfigWhatsapp = {
  ativo: boolean;
  horario: string;
  momentos: Partial<Record<Momento, boolean>>;
  textos: Partial<Record<Momento, string>>;
};

export const CONFIG_PADRAO: ConfigWhatsapp = { ativo: false, horario: "09:00", momentos: {}, textos: {} };

/** horários oferecidos na tela (de hora em hora, no fuso de São Paulo) — os mesmos do site antigo e da função do banco */
export const HORARIOS: string[] = Array.from({ length: 16 }, (_, i) => `${String(i + 6).padStart(2, "0")}:00`);

const objeto = (v: unknown): Record<string, unknown> => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {});

/** lê `profiles.config.whatsapp` com tolerância: qualquer coisa estranha vira o padrão (tudo desligado) */
export function lerConfig(config: unknown): ConfigWhatsapp {
  const w = objeto(objeto(config).whatsapp);
  const momentos: Partial<Record<Momento, boolean>> = {};
  const textos: Partial<Record<Momento, string>> = {};
  const m = objeto(w.momentos);
  const t = objeto(w.textos);
  for (const d of DISPAROS) {
    if (typeof m[d.chave] === "boolean") momentos[d.chave] = m[d.chave] as boolean;
    if (typeof t[d.chave] === "string" && (t[d.chave] as string).trim()) textos[d.chave] = (t[d.chave] as string).trim();
  }
  return {
    ativo: w.ativo === true,
    horario: HORARIOS.includes(String(w.horario)) ? String(w.horario) : CONFIG_PADRAO.horario,
    momentos,
    textos,
  };
}

/** o `whatsapp` a gravar (a função do banco guarda só isto em profiles.config, o resto do config fica como está) */
export function paraGravar(novo: ConfigWhatsapp): ConfigWhatsapp {
  const textos: Partial<Record<Momento, string>> = {};
  for (const [k, v] of Object.entries(novo.textos) as [Momento, string | undefined][]) {
    const limpo = (v ?? "").trim();
    // texto igual ao padrão não precisa ser guardado: assim ele acompanha melhorias futuras do padrão (regra do site antigo)
    const d = DISPAROS.find((x) => x.chave === k);
    if (limpo && limpo !== d?.padrao) textos[k] = limpo;
  }
  return { ativo: novo.ativo, horario: HORARIOS.includes(novo.horario) ? novo.horario : CONFIG_PADRAO.horario, momentos: { ...novo.momentos }, textos };
}

/** o texto que vale pra este momento (o do profissional ou o padrão) */
export function textoDoMomento(cfg: ConfigWhatsapp, chave: Momento): string {
  const d = DISPAROS.find((x) => x.chave === chave);
  return cfg.textos[chave] ?? d?.padrao ?? "";
}

export const LIMITE_TEXTO = 400;
export const VARIAVEIS_VALIDAS = ["{nome}", "{data}", "{hora}", "{valor}", "{profissional}"];

/** erro do texto, ou null. Vazio não é erro: cai no padrão. */
export function erroTexto(texto: string): string | null {
  const t = (texto ?? "").trim();
  if (!t) return null;
  if (t.length > LIMITE_TEXTO) return `Máximo de ${LIMITE_TEXTO} caracteres.`;
  const chaves = t.match(/\{[a-z]+\}/g) ?? [];
  const invalida = chaves.find((c) => !VARIAVEIS_VALIDAS.includes(c));
  if (invalida) return `${invalida} não existe. Use ${VARIAVEIS_VALIDAS.join(", ")}.`;
  return null;
}

/** prévia com valores de exemplo — o que o aluno vai ler */
export function previa(texto: string): string {
  const t = (texto ?? "").trim();
  if (!t) return "";
  return t
    .replace(/\{nome\}/g, "Ana")
    .replace(/\{data\}/g, "21/09")
    .replace(/\{hora\}/g, "14:30")
    .replace(/\{valor\}/g, "R$ 250,00")
    .replace(/\{profissional\}/g, "Marina");
}

/** quantos momentos estão ligados (o cabeçalho do cartão mostra isso) */
export function quantosLigados(cfg: ConfigWhatsapp): number {
  return DISPAROS.filter((d) => cfg.momentos[d.chave]).length;
}

/** quantos momentos vão sair de verdade (interruptor geral ligado) */
export function quantosValendo(cfg: ConfigWhatsapp): number {
  return cfg.ativo ? quantosLigados(cfg) : 0;
}

/** nada ligado, ou o interruptor geral desligado = nenhuma mensagem sai */
export function resumoCard(cfg: ConfigWhatsapp, conectado: boolean): string {
  if (!conectado) return "Conecte o WhatsApp para ligar as mensagens automáticas.";
  if (!cfg.ativo) return "Mensagens automáticas desligadas.";
  const n = quantosLigados(cfg);
  if (n === 0) return "Ligado, mas nenhum momento selecionado — nada será enviado.";
  return `${n} ${n === 1 ? "momento ligado" : "momentos ligados"}, a partir das ${cfg.horario}.`;
}

/** as 2 configs são iguais (o botão Salvar só acende quando algo mudou) */
export function mesmaConfig(a: ConfigWhatsapp, b: ConfigWhatsapp): boolean {
  const x = paraGravar(a);
  const y = paraGravar(b);
  if (x.ativo !== y.ativo || x.horario !== y.horario) return false;
  return DISPAROS.every((d) => !!x.momentos[d.chave] === !!y.momentos[d.chave] && (x.textos[d.chave] ?? "") === (y.textos[d.chave] ?? ""));
}

export const ROTULO_TIPO: Record<string, string> = {
  teste: "Teste",
  aniversario: "Aniversário",
  lembrete_consulta: "Lembrete de consulta",
  cobranca_vencendo: "Cobrança a vencer",
  cobranca_vencida: "Cobrança vencida",
  confirmacao_agendamento: "Confirmação de agendamento",
  assinatura_vencendo: "Aviso do seu plano",
};
