// Physiq W-A P3 — os textos FIXOS das rotinas e dos lembretes (spec W-A §4.3, §4.6, §4.7). Cada um numa constante: trocar = 1 linha. A tela
// nunca mostra o texto cru do banco (os erros vêm pela frase fixa do código — src/aluno-dia/api.ts).
import type { TipoDeRotina } from "@/aluno-dia/tipos";

/**
 * Q3 (spec W-A §9 — sem resposta do Weslley em 13/10/2026; vale a recomendada, "não"): o lembrete de REMÉDIO sai SEM o nome na tela
 * bloqueada — "Hora do seu remédio · 08:00"; o nome aparece ao abrir o app. Os outros tipos saem com o nome. Resposta "sim" (o nome em
 * todos os tipos, como o NutriTrack) = trocar para false.
 */
export const REMEDIO_SEM_NOME_NA_TELA_BLOQUEADA = true;

/** Q4 (spec W-A §9 — respondida pelo Weslley em 13/10/2026: "1", sim): a linha fixa da página. Tirar a linha = trocar para null. */
export const LINHA_PROFISSIONAIS_VEEM: string | null = "Seus profissionais veem as suas rotinas.";

export const TITULO_DO_LEMBRETE = "Hora da rotina";
export const tituloDoRemedio = (hora: string): string => `Hora do seu remédio · ${hora}`;
export const CORPO_DO_REMEDIO = "Toque para ver e marcar como feito.";
export const ROTULO_FEITO = "Feito";
export const SELO_DO_PROFISSIONAL = "do seu profissional";

export const ROTULO_TIPO: Record<TipoDeRotina, string> = { suplemento: "Suplemento", remedio: "Remédio", habito: "Hábito", outro: "Outro" };

export const TEXTOS = {
  card: "Rotinas de hoje",
  vazio: "Crie a sua 1ª rotina (creatina, remédio, água…)",
  criar: "Criar rotina",
  nenhumaHoje: "Nenhuma rotina hoje",
  nenhumaHojeTexto: "As suas rotinas são de outros dias.",
  verRotinas: "Ver rotinas",
  erroLer: "Não deu para carregar as rotinas.",
  semConexao: "Sem conexão",
  semConexaoTexto: "As rotinas aparecem quando a internet voltar.",
  pagina: "Rotinas e lembretes",
  paginaVazia: "Nenhuma rotina ainda",
  nova: "Nova rotina",
  mudar: "Mudar rotina",
  daProfissional: "Criada pelo seu profissional: você pode mudar ou apagar.",
  limite: "Você chegou a 30 rotinas: apague uma para criar outra.",
  notificacoesBloqueadas: "As notificações do Physiq estão bloqueadas neste aparelho: os lembretes não tocam. Libere nas configurações do celular.",
  alarmeExato: "“Alarmes e lembretes” está desligado para o Physiq: o lembrete pode atrasar.",
  ligar: "Ligar",
  bateria: "Se um lembrete não tocar, tire o Physiq da economia de bateria do celular.",
  site: "No site (e no iPhone), o lembrete aparece quando o Physiq está aberto.",
  semInternetMarcar: "Sem internet — marque quando ela voltar.",
  lembreteAntigo: "Esse lembrete já passou: marque a rotina na lista.",
  marcarComoFeita: "Marcar como feita",
  desfazer: "Desfazer",
  feita: (nome: string): string => `${nome} feita`,
  criada: "Rotina criada.",
  salva: "Rotina salva.",
  apagada: "Rotina apagada.",
  semHorario: "Sem horário",
  lembreteSemHorario: "Escolha um horário para ligar o lembrete.",
  permissaoNegada: "Libere as notificações do Physiq para o lembrete tocar.",
} as const;
