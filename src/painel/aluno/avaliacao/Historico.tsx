import { useMemo, useState } from "react";
import { ClipboardCheck, Eye, FileDown, Pencil, Ruler, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { dataLonga } from "@/evolucao/formato";
import type { Avaliacao } from "@/evolucao/tipos";
import { excluirAntropometria } from "@/nutricao/editor/lib/antropometrias";
import { BTN_PERIGO, BTN_SEC } from "@/nutricao/editor/ui/estilos";
import { Botao } from "@/ui/premium/Botao";
import { CabecalhoCartao, Cartao } from "@/ui/premium/Cartao";
import { Chip } from "@/ui/premium/Chip";
import { PainelDeslizante } from "@/ui/premium/Sheet";
import { useIsMobile } from "@/hooks/use-mobile";
import { excluirAvaliacaoFisica } from "./avaliacaoApi";
import { mensagemDoErro } from "./mensagens";
import { autorNoPainel, composicaoDepoisDeExcluir, numerosDoHistorico, podeExcluir, tituloDoHistorico, type PermissoesAvaliacao } from "./regras";

/**
 * Histórico único (W17 — C35, N-35): as avaliações físicas do personal (Banco do Treino) e as antropometrias da nutricionista
 * (banco principal) na mesma lista, a mais recente primeiro, com o autor; "Ver" abre a composição completa (a mesma da Evolução do
 * aluno), "PDF" o da antropometria (o do Nutri) e "Excluir" sai do histórico do aluno (o personal exclui a física, a nutri a
 * antropometria — a antropometria vai para a Lixeira, como no site antigo).
 */
export function HistoricoAvaliacoes({ avaliacoes, perm, nomeAluno, linhasTreino, treinoUserId, aoVer, aoPdf, aoEditar, aoExcluiu }: {
  avaliacoes: Avaliacao[];
  perm: PermissoesAvaliacao;
  nomeAluno: string;
  /** as linhas de physiq_avaliacoes (para a composição atual voltar à anterior quando a mais recente sai) */
  linhasTreino: Record<string, unknown>[];
  treinoUserId: string | null;
  aoVer: (av: Avaliacao) => void;
  aoPdf: (av: Avaliacao) => void;
  /** editar a antropometria (o formulário do Nutri) — só para quem muda a nutrição */
  aoEditar?: (av: Avaliacao) => void;
  aoExcluiu: () => void;
}) {
  const celular = useIsMobile();
  const lista = useMemo(() => [...avaliacoes].reverse(), [avaliacoes]);
  const [paraExcluir, setParaExcluir] = useState<Avaliacao | null>(null);
  const [excluindo, setExcluindo] = useState(false);

  const excluir = async () => {
    const av = paraExcluir;
    if (!av) return;
    setExcluindo(true);
    try {
      if (av.origem === "treino") {
        const colunas = treinoUserId ? composicaoDepoisDeExcluir(av.idOriginal, linhasTreino) : null;
        await excluirAvaliacaoFisica(av.idOriginal, colunas && treinoUserId ? { treinoUserId, colunas } : null);
      } else await excluirAntropometria(av.idOriginal);
      toast.success(av.origem === "treino" ? "Avaliação física excluída." : "Antropometria excluída (vai para a Lixeira).");
      setParaExcluir(null);
      aoExcluiu();
    } catch (e) {
      toast.error(mensagemDoErro(e));
    } finally {
      setExcluindo(false);
    }
  };

  return (
    <Cartao className="flex flex-col px-[18px] py-4" data-avaliacao-historico={lista.length}>
      <CabecalhoCartao titulo="Histórico" extra={<Chip tom="g">{lista.length} {lista.length === 1 ? "AVALIAÇÃO" : "AVALIAÇÕES"}</Chip>} />
      {lista.length === 0 ? (
        <p className="text-[12.5px] text-texto-3" data-avaliacao-historico-vazio>Nenhuma avaliação ainda.</p>
      ) : (
        <ul className="flex flex-col divide-y divide-linha" data-avaliacao-lista>
          {lista.map((av) => {
            const treino = av.origem === "treino";
            const Icone = treino ? ClipboardCheck : Ruler;
            const excluivel = podeExcluir(av, perm);
            return (
              <li key={av.id} className="flex flex-wrap items-center gap-3 py-3" data-avaliacao-item={av.id} data-avaliacao-origem={av.origem}
                data-avaliacao-data={av.data} data-avaliacao-peso={av.peso ?? ""} data-avaliacao-gordura={av.gordura ?? ""}>
                <span className="flex h-10 w-10 flex-none items-center justify-center rounded-[13px] border border-linha-2"
                  style={{ background: treino ? "var(--p-chip-t-fundo)" : "var(--p-chip-n-fundo)", color: treino ? "var(--p-chip-t-texto)" : "var(--p-chip-n-texto)" }}>
                  <Icone aria-hidden className="h-[18px] w-[18px]" strokeWidth={1.75} />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <b className="text-[14px] font-semibold text-texto" data-avaliacao-titulo>{tituloDoHistorico(av)}</b>
                    <Chip tom={treino ? "t" : "n"}>{treino ? "TREINO" : "NUTRIÇÃO"}</Chip>
                  </div>
                  <div className="mt-0.5 text-[12.5px] text-texto-2" data-avaliacao-autor>
                    {av.data ? dataLonga(av.data) : "Dados atuais"} · {autorNoPainel(av.autor)}
                  </div>
                  <div className="mt-0.5 text-[12.5px] text-texto-3" data-avaliacao-numeros>{numerosDoHistorico(av)}</div>
                </div>
                <div className="flex flex-none items-center gap-1.5">
                  <Botao variante="g" tamanho="sm" icone={Eye} onClick={() => aoVer(av)} data-avaliacao-ver={av.id}>Ver</Botao>
                  {!treino && <Botao variante="g" tamanho="sm" icone={FileDown} onClick={() => aoPdf(av)} data-avaliacao-pdf={av.id}>PDF</Botao>}
                  {!treino && aoEditar && excluivel && (
                    <Botao variante="g" tamanho="sm" icone={Pencil} onClick={() => aoEditar(av)} data-avaliacao-editar={av.id}>Editar</Botao>
                  )}
                  {excluivel && (
                    <button type="button" className={BTN_PERIGO} onClick={() => setParaExcluir(av)} data-avaliacao-excluir={av.id}>
                      <Trash2 aria-hidden /> Excluir
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <PainelDeslizante aberto={!!paraExcluir} aoMudar={(v) => !v && setParaExcluir(null)} lado={celular ? "baixo" : "direita"}
        titulo={paraExcluir?.origem === "treino" ? "Excluir a avaliação física?" : "Excluir a antropometria?"}
        descricao={paraExcluir ? `${tituloDoHistorico(paraExcluir)} de ${dataLonga(paraExcluir.data)} — ${nomeAluno}.` : undefined}>
        <div className="flex flex-col gap-4 pt-2" data-confirmar-excluir-avaliacao={paraExcluir?.id ?? ""}>
          <p className="text-[13px] leading-relaxed text-texto-2">
            {paraExcluir?.origem === "treino"
              ? "Ela sai do histórico e da Evolução do aluno (no app também). Se for a mais recente, a composição atual volta à da anterior."
              : "Ela sai do histórico e da Evolução do aluno e vai para a Lixeira (dá para restaurar no site do PhysiqNutri)."}
          </p>
          <div className="flex justify-end gap-2">
            <button type="button" className={BTN_SEC} onClick={() => setParaExcluir(null)} disabled={excluindo}>Cancelar</button>
            <button type="button" className={BTN_PERIGO} onClick={() => void excluir()} disabled={excluindo} data-btn-confirmar-excluir-avaliacao>
              {excluindo ? "Excluindo…" : "Excluir"}
            </button>
          </div>
        </div>
      </PainelDeslizante>
    </Cartao>
  );
}
