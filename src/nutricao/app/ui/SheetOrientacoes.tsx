import { useState } from "react";
import { FileDown, LoaderCircle, NotebookPen } from "lucide-react";
import { toast } from "sonner";
import { Botao } from "@/ui/premium/Botao";
import { EstadoVazio } from "@/ui/premium/Estados";
import { PainelDeslizante } from "@/ui/premium/Sheet";
import { formatarDataOrientacao, ordenarOrientacoes, textoContagem, textoTopicos, topicosDoTexto } from "../orientacoesUtil";
import type { Orientacao } from "../tipos";
import { Blocos } from "./Blocos";

/** Orientações (N-50): as que a nutricionista escreveu, da mais nova para a mais antiga, com o mesmo markdown simples e o PDF de cada. */
export function SheetOrientacoes({
  aberto,
  aoMudar,
  orientacoes,
  aluno,
  nutricionista,
}: {
  aberto: boolean;
  aoMudar: (v: boolean) => void;
  orientacoes: Orientacao[];
  aluno: string;
  nutricionista: string | null;
}) {
  const [gerando, setGerando] = useState<string | null>(null);
  const lista = ordenarOrientacoes(orientacoes);

  const baixar = async (o: Orientacao) => {
    setGerando(o.id);
    try {
      const { baixarPDFOrientacao } = await import("../pdf/orientacaoPdf");
      await baixarPDFOrientacao({ titulo: o.titulo, data: new Date(o.created_at), aluno, nutricionista, conteudo: o.conteudo });
      toast.success("PDF gerado", { description: o.titulo });
    } catch (e) {
      console.warn("[dieta] PDF da orientação:", e);
      toast.error("Não foi possível gerar o PDF");
    } finally {
      setGerando(null);
    }
  };

  return (
    <PainelDeslizante aberto={aberto} aoMudar={aoMudar} titulo="Orientações" descricao={lista.length ? textoContagem(lista.length) : undefined}>
      {lista.length === 0 ? (
        <EstadoVazio icone={NotebookPen} titulo="Nenhuma orientação ainda" texto="As orientações que a sua nutricionista escrever para você ficam aqui." />
      ) : (
        <div className="flex flex-col gap-3" data-folha-orientacoes={lista.length}>
          {lista.map((o) => (
            <article key={o.id} className="pq-cartao flex flex-col gap-3 px-4 py-3.5" data-orientacao={o.id}>
              <header className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <h3 className="font-body text-[15px] font-semibold normal-case tracking-[-0.01em] text-texto" data-orientacao-titulo>{o.titulo}</h3>
                  <p className="mt-0.5 text-[12px] text-texto-2">{formatarDataOrientacao(o.created_at)} · {textoTopicos(topicosDoTexto(o.conteudo))}</p>
                </div>
                <Botao variante="g" tamanho="sm" icone={gerando === o.id ? LoaderCircle : FileDown} onClick={() => void baixar(o)} disabled={gerando === o.id} className="flex-none" data-orientacao-pdf>
                  PDF
                </Botao>
              </header>
              <Blocos conteudo={o.conteudo} />
            </article>
          ))}
        </div>
      )}
    </PainelDeslizante>
  );
}
