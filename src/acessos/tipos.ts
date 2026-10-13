// Physiq W-A P2 — o contrato da aba Acessos (a P4 usa): o que a função acessos (principal) e a treino-acessos (Treino) devolvem. Os níveis e as
// chaves vêm das regras do servidor (uma fonte só).
import type { ChaveDeAcesso } from "../../supabase-principal/functions/_shared/acessos-regras";
import type { NivelDasSeries } from "../../supabase/functions/_shared/treino-acessos-regras";

export type { ChaveDeAcesso, NivelDasSeries };
export type NivelDoApp = "bloqueado" | "liberado";
export type NivelDaDieta = "ver" | "mexer";

export interface LinhasDeAcesso {
  acesso_app: NivelDoApp;
  diario_alimentar: NivelDoApp;
  acesso_link: NivelDoApp;
  dieta: NivelDaDieta;
}

/** A última mudança de uma chave (o "Mudado por <nome> em dd/mm hh:mm" da linha). */
export interface MudancaDeAcesso {
  de: string;
  para: string;
  em: string;
  por_nome: string | null;
}

/** O que a acessos devolve (ler e salvar): a whitelist da função (os ids internos ficam no servidor). */
export interface AcessosDoAluno {
  paciente_id: string;
  tem_login: boolean;
  /** os módulos do ALUNO (a mesma regra do aluno_perfil) */
  modulos: string[];
  /** os módulos da CONTA (as linhas "Só com Treino/Nutrição") */
  conta_modulos: string[];
  /** nutricionista de verdade na matrícula (a linha da Dieta: "Só com nutricionista") */
  tem_nutricionista: boolean;
  pode_mudar: boolean;
  linhas: LinhasDeAcesso;
  mudancas: Partial<Record<ChaveDeAcesso | "treino_series", MudancaDeAcesso>>;
}

export interface SeriesDoAluno {
  series: NivelDasSeries;
  pode_mudar: boolean;
}

export interface SeriesSalvas {
  series: NivelDasSeries;
  /** a mudança entrou no histórico do principal (false: sem mudança, ou o registro falhou — a gravação vale) */
  registrado: boolean;
}
