// Physiq H5 (N-11 / DN-7) — os horários livres das folhas Reagendar e Marcar, MÊS A MÊS quando a janela não cabe num pedido só:
// "sem trava" não tem mais fim (regra dele de 01/10: "sem trava o usuário poderá marcar em qualquer mês") e um pacote de vários
// meses passa dos 62 dias que o banco devolve por vez (aluno_agenda_horarios). As janelas "só no mês" e "até o fim do mês
// seguinte" cabem inteiras: continuam numa lista só, como na W20.
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { diaSP, intervaloDoMes, janelaPorMes, mesDe, mesPorExtenso, navegacaoDoMes } from "@/agenda/regras";
import { mensagemErroAgenda, type HorarioLivre, type HorariosDoAluno } from "./api";

export interface MesDaJanela {
  /** "2026-11-01" */
  mes: string;
  /** "novembro de 2026" */
  rotulo: string;
  anterior: string | null;
  proximo: string | null;
  ir: (mes: string) => void;
}

export interface HorariosDaFolha {
  horarios: HorarioLivre[];
  carregando: boolean;
  erro: string | null;
  /** null = a janela inteira numa lista só */
  mes: MesDaJanela | null;
  recarregar: () => void;
}

/**
 * `buscar(de?, ate?)` chama aluno_agenda_horarios. O 1º pedido (sem datas) devolve a janela; se ela não cabe num pedido, o app
 * passa a pedir o mês escolhido (começa no mês do início da janela).
 */
export function useHorariosPorMes(chave: readonly unknown[], buscar: (de?: string, ate?: string) => Promise<HorariosDoAluno>, ativo: boolean): HorariosDaFolha {
  const base = useQuery({ queryKey: [...chave, "base"], queryFn: () => buscar(), enabled: ativo, staleTime: 10_000, retry: 1 });
  const janela = base.data?.janela ?? null;
  const porMes = janelaPorMes(janela);
  const [escolhido, setEscolhido] = useState<string | null>(null);
  useEffect(() => {
    if (!ativo) setEscolhido(null);
  }, [ativo]);
  const mes = porMes && janela ? (escolhido ?? mesDe(janela.de)) : null;
  const intervalo = mes && janela ? intervaloDoMes(mes, janela) : null;
  const doMes = useQuery({
    queryKey: [...chave, "mes", intervalo?.de ?? "", intervalo?.ate ?? ""],
    queryFn: () => buscar(intervalo!.de, intervalo!.ate),
    enabled: ativo && !!intervalo,
    staleTime: 10_000,
    retry: 1,
  });

  if (!porMes || !janela || !mes) {
    return {
      horarios: base.data?.horarios ?? [],
      carregando: base.isLoading,
      erro: base.isError ? mensagemErroAgenda(base.error) : null,
      mes: null,
      recarregar: () => void base.refetch(),
    };
  }
  const nav = navegacaoDoMes(mes, janela);
  // só os horários do mês (o banco já corta pela janela; aqui é a garantia do que a lista mostra)
  const horarios = (doMes.data?.horarios ?? []).filter((h) => mesDe(diaSP(h.inicio)) === mes);
  return {
    horarios,
    carregando: doMes.isLoading,
    erro: doMes.isError ? mensagemErroAgenda(doMes.error) : null,
    mes: { mes, rotulo: mesPorExtenso(mes), anterior: nav.anterior, proximo: nav.proximo, ir: setEscolhido },
    recarregar: () => {
      void base.refetch();
      void doMes.refetch();
    },
  };
}
