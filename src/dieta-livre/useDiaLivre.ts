// Physiq W-A P5 — o que a aba Dieta precisa para a tela "Pode mexer" (spec §4.4): lê o dia de hoje (useMeuDia), decide se a tela está liberada
// (estadoDaDietaLivre: a matrícula do plano que a tela mostra; só hoje e no plano atual — outro dia e plano anterior seguem "só para ver", como
// hoje) e aplica o dia sobre o plano (diaAplicado da P2: os riscados, os que ele pôs, as extras e os totais). Travada = nada daqui aparece.
import { useMemo } from "react";
import { diaAplicado, type DiaAplicado, type RefeicaoNoDia } from "@/aluno-dia/regras";
import type { PlanoAlimentar } from "@/nutricao/app/tipos";
import { diaDaMatricula, estadoDaDietaLivre } from "./regras";
import { useGravarNoDia, useMeuDia, type Gravacao } from "./useDietaLivre";

export interface DiaLivre {
  /** o data-* da aba (os E2E esperam o "travada" de verdade, não o "ainda lendo"): sem plano atual · lendo · travada · liberada */
  estado: "sem" | "lendo" | "travada" | "liberada";
  /** a tela é "Pode mexer" (hoje, no plano atual, com a matrícula do plano liberada) */
  liberada: boolean;
  /** dá para criar refeição extra (a matrícula do plano ativo é a da tela) */
  extra: boolean;
  /** o dia aplicado sobre o plano (null = travada) */
  aplicado: DiaAplicado | null;
  /** a refeição do plano NO DIA, pelo id */
  noDia: ReadonlyMap<string, RefeicaoNoDia>;
  gravar: (g: Gravacao) => Promise<boolean>;
  ocupado: string | null;
}

export function useDiaLivre({ plano, ehAtual, hoje, marcavelHoje, concluidas, aoTravar }: {
  plano: PlanoAlimentar | null;
  ehAtual: boolean;
  hoje: string;
  marcavelHoje: boolean;
  concluidas: ReadonlySet<string>;
  /** a Dieta voltou a "Só ver" no meio de uma gravação (fecha a folha aberta) */
  aoTravar: () => void;
}): DiaLivre {
  const ativo = !!plano && ehAtual;
  const q = useMeuDia(hoje, ativo);
  const estado = estadoDaDietaLivre(q.data, plano?.paciente_id, hoje);
  const liberada = estado.liberada && marcavelHoje;
  const aplicado = useMemo(
    () => (liberada && q.data && plano ? diaAplicado(plano, diaDaMatricula(q.data, plano.paciente_id), concluidas) : null),
    [liberada, q.data, plano, concluidas],
  );
  const noDia = useMemo(() => new Map((aplicado?.refeicoes ?? []).map((r) => [r.refeicao.id, r])), [aplicado]);
  const g = useGravarNoDia(aoTravar);
  const marca = !ativo ? "sem" : liberada ? "liberada" : !q.data && !q.isError ? "lendo" : "travada";
  return { estado: marca, liberada, extra: liberada && estado.extra, aplicado, noDia, gravar: g.gravar, ocupado: g.ocupado };
}
