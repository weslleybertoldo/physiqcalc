// Physiq W-P — Painel › Financeiro › Planos. Lê e grava pela pagamentos-aluno (prof_planos · prof_plano_salvar · prof_plano_ativo — §7
// I5: o app não grava em planos_aluno). Só o dono e o master (decisão do Weslley 10/10, ponto 1): a página nem mostra a aba para os
// outros (paginas/Financeiro.tsx) e o 403 so_o_dono da função vira o aviso daqui — nunca quebra.
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Layers, Lock, Pencil, Plus, Power } from "lucide-react";
import { toast } from "sonner";
import { ativarPlano, buscarPlanosDaConta, ErroFinanceiro } from "@/financeiro/api";
import { nomeDoPeriodo, ROTULO_MODALIDADE, sufixoDoValor } from "@/financeiro/planos";
import { mensagemErroFinanceiro, reais } from "@/financeiro/regras";
import type { PlanoNaLista } from "@/financeiro/tipos";
import { Botao } from "@/ui/premium/Botao";
import { CabecalhoCartao, Cartao } from "@/ui/premium/Cartao";
import { Chip } from "@/ui/premium/Chip";
import { Esqueleto, EstadoErro, EstadoVazio } from "@/ui/premium/Estados";
import { useConfirmar } from "@/ui/premium/useConfirmar";
import { useUltimoValor } from "@/ui/premium/useUltimoValor";
import { PlanoDialog } from "./PlanoDialog";
import { CHAVES, type FinanceiroConta } from "./useFinanceiro";

const chavePlanos = (contaId: string) => ["financeiro-planos", contaId] as const;
/** Respostas que outra tentativa não muda: o aviso aparece na hora (o padrão do app tenta de novo 1 vez, 1 s depois). */
const DEFINITIVOS = new Set(["so_o_dono", "sem_permissao", "planos_indisponivel", "conta_invalida"]);

/**
 * Painel › Financeiro › Planos (W-P, desenho §3.1): os planos que a conta oferece aos alunos — nome, duração, valor do período, formas
 * aceitas, até X parcelas e a parcela do mês a mês; desativado some da lista de planos novos (quem está nele continua); o "só nome"
 * da virada do Calc aparece como "Completar" (B1). Só o dono grava (pela pagamentos-aluno — §7 I5).
 */
export default function Planos({ f }: { f: Pick<FinanceiroConta, "contaId"> }) {
  const contaId = f.contaId ?? "";
  const qc = useQueryClient();
  const confirmar = useConfirmar();
  const [editando, setEditando] = useState<PlanoNaLista | "novo" | null>(null);
  // hml-18a (H-40, D): enquanto o painel sai (a animação), ele continua com o plano que estava aberto
  const visto = useUltimoValor(editando);
  const [mudando, setMudando] = useState<string | null>(null);
  const q = useQuery({
    queryKey: chavePlanos(contaId),
    queryFn: () => buscarPlanosDaConta(contaId),
    enabled: !!contaId,
    retry: (tentativas, e) => tentativas < 1 && !(e instanceof ErroFinanceiro && DEFINITIVOS.has(e.codigo)),
  });
  const recarregar = () => void qc.invalidateQueries({ queryKey: chavePlanos(contaId) });

  if (q.isLoading) {
    return (
      <div className="grid grid-cols-1 gap-3.5 md:grid-cols-2 xl:grid-cols-3" data-aba-financeiro-conteudo="planos" data-estado="carregando" data-planos-carregando
        role="status" aria-busy="true" aria-label="Carregando os planos">
        {[0, 1, 2].map((i) => <Cartao key={i} className="h-[160px] p-5"><Esqueleto className="h-full w-full" /></Cartao>)}
      </div>
    );
  }
  if (q.isError || !q.data) {
    const codigo = q.error instanceof ErroFinanceiro ? q.error.codigo : null;
    if (codigo === "so_o_dono") {
      return (
        <div data-aba-financeiro-conteudo="planos" data-estado="so-do-dono" data-planos-so-do-dono>
          <EstadoVazio icone={Lock} titulo="Os planos são do dono da conta" texto="Quem cria os planos e vê os valores dos alunos é o dono da conta." />
        </div>
      );
    }
    return (
      <div data-aba-financeiro-conteudo="planos" data-estado="erro">
        <EstadoErro titulo="Não deu para abrir os planos" texto={mensagemErroFinanceiro(codigo, "Confira a internet e tente de novo.")} aoTentar={() => void q.refetch()} />
      </div>
    );
  }
  const d = q.data;
  const alternar = async (pl: PlanoNaLista) => {
    if (pl.ativo && !(await confirmar({
      titulo: `Desativar o plano ${pl.nome}?`,
      descricao: pl.alunos === 1 ? "O aluno dele continua no plano; ele só some da lista de planos novos."
        : pl.alunos ? `Os ${pl.alunos} alunos dele continuam no plano; ele só some da lista de planos novos.` : "Ele some da lista de planos novos.",
      rotuloConfirmar: "Desativar", perigo: true,
    }))) return;
    setMudando(pl.id);
    try {
      await ativarPlano(contaId, pl.id, !pl.ativo);
      toast.success(pl.ativo ? "Plano desativado." : "Plano reativado.");
      recarregar();
    } catch (e) {
      toast.error(mensagemErroFinanceiro(e instanceof ErroFinanceiro ? e.codigo : null));
    } finally {
      setMudando(null);
    }
  };
  return (
    <div className="flex flex-col gap-3.5" data-aba-financeiro-conteudo="planos" data-aba-planos data-pode-editar={d.pode_editar ? "1" : "0"}
      data-atualizando={q.isFetching ? "1" : "0"}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="min-w-0 text-[13px] text-texto-2">
          {d.app ? mensagemErroFinanceiro("conta_do_app") : "Quanto custa, por quanto tempo e como o aluno pode pagar. Mudar um plano vale a partir do próximo pagamento."}
        </p>
        {d.pode_editar && <Botao variante="w" icone={Plus} onClick={() => setEditando("novo")} data-novo-plano>Novo plano</Botao>}
      </div>
      {!d.planos.length ? (
        <EstadoVazio icone={Layers} titulo="Nenhum plano ainda" texto={d.pode_editar ? "Crie o primeiro: mensal, trimestral, semestral, anual…" : undefined} />
      ) : (
        <div className="grid grid-cols-1 gap-3.5 md:grid-cols-2 xl:grid-cols-3" data-lista-planos>
          {d.planos.map((pl) => (
            <Cartao key={pl.id} className="flex flex-col gap-2.5 p-5" data-plano-card={pl.id} data-plano-ativo={pl.ativo ? "1" : "0"}>
              <CabecalhoCartao className="mb-0" titulo={pl.nome}
                extra={!pl.completo ? <Chip tom="a" data-plano-completar>Completar</Chip> : !pl.ativo ? <Chip tom="g">Desativado</Chip> : <Chip tom="n">{nomeDoPeriodo(pl.meses)}</Chip>} />
              {pl.completo ? (
                <p className="text-[13px] text-texto-2" data-plano-valor-texto>
                  <b className="text-[20px] font-bold tabular-nums text-texto">{reais(pl.valor)}</b>{sufixoDoValor("avista", pl.meses)}
                  {pl.modalidades.includes("mensal") && pl.meses > 1 && pl.parcela ? ` · ou ${pl.meses}× de ${reais(pl.parcela)}` : ""}
                </p>
              ) : (
                <p className="text-[13px] text-texto-2">Falta o valor e a duração para oferecer este plano.</p>
              )}
              <div className="flex flex-wrap gap-1.5">
                {pl.modalidades.map((x) => (
                  <Chip key={x} tom="g">{ROTULO_MODALIDADE[x]}{x === "cartao_parcelado" && pl.max_parcelas_cartao ? ` até ${pl.max_parcelas_cartao}×` : ""}</Chip>
                ))}
              </div>
              <p className="text-[12px] text-texto-3" data-plano-alunos>{pl.alunos === 1 ? "1 aluno" : `${pl.alunos} alunos`}</p>
              {d.pode_editar && (
                <div className="mt-auto flex flex-wrap gap-2">
                  <Botao tamanho="sm" icone={Pencil} onClick={() => setEditando(pl)} data-editar-plano={pl.id}>{pl.completo ? "Editar" : "Completar"}</Botao>
                  <Botao tamanho="sm" variante="g" icone={Power} disabled={mudando === pl.id} onClick={() => void alternar(pl)} data-ativar-plano={pl.id}>
                    {pl.ativo ? "Desativar" : "Reativar"}
                  </Botao>
                </div>
              )}
            </Cartao>
          ))}
        </div>
      )}
      <PlanoDialog aberto={editando !== null} plano={visto === "novo" ? null : visto} contaId={contaId} modalidadesDaConta={d.modalidades_da_conta}
        aoFechar={() => setEditando(null)}
        aoSalvo={() => {
          setEditando(null);
          recarregar();
          // o valor de quem segue o plano muda junto (gatilho do banco): Mensalidades e o Resumo leem de novo
          void qc.invalidateQueries({ queryKey: CHAVES.resumoConta(contaId) });
        }} />
    </div>
  );
}
