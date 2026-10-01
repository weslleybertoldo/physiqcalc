import { RE_E164, formatarWhatsapp, paraE164 } from "@/painel/configuracoes/perfil/regras";

// Physiq W22 — regras puras da CONEXÃO do WhatsApp (porta de src/lib/whatsappUtil.ts do PhysiqNutri, W46): o QR code como no
// WhatsApp Web, lido pelo agente que roda no celular de casa (Moto G7). Cada profissional conecta o PRÓPRIO número (decisão dele,
// 20/09/2026) — o personal ganha o mesmo (R7). Nada aqui toca a rede — só decide o que a tela mostra.

export type StatusConexao = "desconectado" | "aguardando_qr" | "conectado" | "erro";
export const ROTULO_STATUS: Record<StatusConexao, string> = {
  desconectado: "Não conectado",
  aguardando_qr: "Aguardando leitura do QR",
  conectado: "Conectado",
  erro: "Com erro",
};

/** linha de {schema}.whatsapp_instancias, no que a tela usa (vem da função whatsapp-conectar) */
export type Instancia = {
  id: string;
  status: StatusConexao;
  numero_e164: string | null;
  numero_conectado: string | null;
  qr_code: string | null;
  qr_atualizado_em: string | null;
  conectado_em: string | null;
  ultimo_ping: string | null;
  erro: string | null;
};

const objeto = (v: unknown): Record<string, unknown> => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {});

/** O WhatsApp do profissional salvo em Configurações › Perfil: `dados_profissionais.whatsapp_e164` ou, se não houver, o `telefone`. */
export function numeroDoPerfil(dados: unknown): { e164: string | null; formatado: string } {
  const o = objeto(dados);
  const s = (k: string): string => (typeof o[k] === "string" ? (o[k] as string) : "");
  const e164 = RE_E164.test(s("whatsapp_e164")) ? s("whatsapp_e164") : paraE164(s("telefone"));
  return { e164: e164 || null, formatado: e164 ? formatarWhatsapp(e164) : "" };
}

export type EstadoPasso = "feito" | "pendente" | "em_breve";
export type Passo = { n: number; titulo: string; descricao: string; estado: EstadoPasso };

/** Os 3 passos da conexão. O 3º fecha quando pelo menos um momento está ligado (com o interruptor geral). */
export function passosConexao(temNumero: boolean, status: StatusConexao = "desconectado", momentosLigados = 0): Passo[] {
  return [
    { n: 1, titulo: "Cadastrar o seu WhatsApp", descricao: "Em Configurações › Perfil › WhatsApp.", estado: temNumero ? "feito" : "pendente" },
    {
      n: 2,
      titulo: "Conectar o WhatsApp",
      descricao: "Ler o QR code com o celular do número, como no WhatsApp Web.",
      estado: status === "conectado" ? "feito" : temNumero ? "pendente" : "em_breve",
    },
    {
      n: 3,
      titulo: "Ligar as automáticas",
      descricao: "Ligar cada momento de envio e o texto de cada mensagem.",
      estado: momentosLigados > 0 ? "feito" : status === "conectado" ? "pendente" : "em_breve",
    },
  ];
}

export const ROTULO_PASSO: Record<EstadoPasso, string> = { feito: "Feito", pendente: "Pendente", em_breve: "Em breve" };

// ---------------------------------------------------------------------------
// Estado da tela
// ---------------------------------------------------------------------------

/** O QR só vale por pouco tempo: o agente publica um novo a cada ~20 s. Passou de 50 s, a tela espera o próximo em vez de mostrar código morto. */
export const QR_VALIDO_S = 50;
/**
 * O celular de envio bate o "ping" a cada 60 s em TODAS as linhas (o agente faz um ping geral). Sem batida há mais de 3 min =
 * fora do ar (3 batidas perdidas: um atraso de rede não acende o aviso).
 */
export const PING_VALIDO_S = 180;

const segundosDesde = (iso: string | null | undefined, agora: number): number => {
  const t = iso ? new Date(iso).getTime() : Number.NaN;
  return Number.isFinite(t) ? Math.max(0, Math.round((agora - t) / 1000)) : Number.POSITIVE_INFINITY;
};

/** QR ainda serve pra ser lido? */
export function qrValido(inst: Instancia | null, agora: number = Date.now()): boolean {
  if (!inst?.qr_code) return false;
  return segundosDesde(inst.qr_atualizado_em, agora) <= QR_VALIDO_S;
}

/** O serviço do celular deu sinal de vida faz pouco? (sem batida nenhuma = não sabemos) */
export function agenteVivo(ping: string | null | undefined, agora: number = Date.now()): boolean {
  return segundosDesde(ping, agora) <= PING_VALIDO_S;
}

export interface EstadoAgente {
  /** "vivo" · "fora" (sem batida há mais de 3 min) · "sem_dado" (nenhuma batida registrada ainda: não acusa nada) */
  estado: "vivo" | "fora" | "sem_dado";
  /** a última batida (ISO) */
  desde: string | null;
  /** minutos sem batida (só quando "fora") */
  minutos: number | null;
}

/** O aviso "o celular de envio está fora do ar" (spec 4.4, risco 8): pela última batida do agente (max(ultimo_ping)). */
export function estadoDoAgente(ping: string | null | undefined, agora: number = Date.now()): EstadoAgente {
  const s = segundosDesde(ping, agora);
  if (!Number.isFinite(s)) return { estado: "sem_dado", desde: null, minutos: null };
  if (s <= PING_VALIDO_S) return { estado: "vivo", desde: ping ?? null, minutos: null };
  return { estado: "fora", desde: ping ?? null, minutos: Math.floor(s / 60) };
}

/** "há 12 min" · "há 3 h" · "há 2 dias" (o tempo sem batida do celular) */
export function tempoSemSinal(minutos: number): string {
  if (minutos < 60) return `há ${Math.max(1, minutos)} min`;
  const h = Math.floor(minutos / 60);
  if (h < 48) return `há ${h} h`;
  return `há ${Math.floor(h / 24)} dias`;
}

export type SituacaoTela =
  | "sem_numero" // falta cadastrar o WhatsApp em Configurações
  | "desconectado" // pronto pra conectar
  | "aguardando_agente" // pediu conexão, o QR ainda não veio
  | "qr" // QR na tela, esperando a leitura
  | "conectado"
  | "erro";

/** O que a tela mostra agora. Uma regra só, testável, sem depender de relógio externo. */
export function situacaoTela(inst: Instancia | null, temNumero: boolean, agora: number = Date.now()): SituacaoTela {
  if (!temNumero && (!inst || inst.status === "desconectado")) return "sem_numero";
  if (!inst) return "desconectado";
  if (inst.status === "erro") return "erro";
  if (inst.status === "conectado") return "conectado";
  if (inst.status === "aguardando_qr") return qrValido(inst, agora) ? "qr" : "aguardando_agente";
  return "desconectado";
}

/** Texto de apoio abaixo do status — explica o que está acontecendo sem jargão. */
export function textoSituacao(situacao: SituacaoTela, inst: Instancia | null, agora: number = Date.now(), ping?: string | null): string {
  switch (situacao) {
    case "sem_numero":
      return "Cadastre o seu WhatsApp em Configurações › Perfil para poder conectar.";
    case "desconectado":
      return "Seu WhatsApp não está conectado. As mensagens automáticas só saem depois de conectar.";
    case "aguardando_agente":
      return agenteVivo(ping ?? inst?.ultimo_ping, agora)
        ? "Gerando o QR code, aguarde alguns segundos..."
        : "Preparando a conexão. Se demorar mais de um minuto, tente de novo.";
    case "qr":
      return "Abra o WhatsApp no celular do número, toque em Aparelhos conectados e leia o código ao lado.";
    case "conectado":
      return inst?.numero_conectado ? `Conectado com o número ${formatarWhatsapp(inst.numero_conectado)}.` : "Conectado.";
    case "erro":
      return inst?.erro ? `A conexão falhou: ${inst.erro}` : "A conexão falhou. Tente conectar de novo.";
  }
}

/** Rótulo do botão principal da conexão. */
export function rotuloBotao(situacao: SituacaoTela): string {
  if (situacao === "conectado") return "Desconectar";
  if (situacao === "qr" || situacao === "aguardando_agente") return "Cancelar";
  return "Conectar WhatsApp";
}

/** A tela faz polling enquanto a conexão está em curso — parada quando não há nada a esperar. */
export const devePollar = (situacao: SituacaoTela): boolean => situacao === "qr" || situacao === "aguardando_agente";

/** Erro cru das funções (whatsapp-conectar e as RPCs da W22) → frase que o profissional entende. */
export function traduzErro(codigo: string): string {
  const mapa: Record<string, string> = {
    sem_numero: "Cadastre o seu WhatsApp em Configurações › Perfil antes de conectar.",
    nao_conectado: "Conecte o WhatsApp antes de mandar a mensagem.",
    sem_acesso: "Esta conta não tem acesso ao WhatsApp.",
    sem_perfil: "Não encontramos seu perfil.",
    erro_interno: "Algo deu errado de nosso lado. Tente de novo em instantes.",
    sem_internet: "Sem internet. Confira a conexão e tente de novo.",
    nao_encontrada: "Esta mensagem não é sua ou não existe mais.",
    nao_falhou: "Esta mensagem não está com falha.",
    antiga: "Só dá para reenviar falhas dos últimos 7 dias.",
    aluno_inativo: "O aluno foi desativado ou removido.",
    mensagens_desligadas: "As mensagens automáticas deste aluno estão desligadas (Ajustes no perfil do aluno).",
    sem_telefone: "O aluno está sem um telefone válido. Corrija no perfil dele e tente de novo.",
    consulta_passou: "A consulta já passou ou foi desmarcada.",
    cobranca_resolvida: "A cobrança já foi paga ou cancelada.",
    fora_do_dia: "O aniversário já passou: a mensagem não é mais reenviada.",
    texto_longo: "O texto passou do limite de 400 caracteres.",
    config_invalida: "Não deu para salvar as mensagens automáticas.",
  };
  return mapa[codigo] ?? "Não foi possível completar a ação. Tente de novo.";
}
