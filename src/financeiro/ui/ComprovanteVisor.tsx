import { useEffect, useState } from "react";
import { ExternalLink, FileText } from "lucide-react";
import { Esqueleto, EstadoErro } from "@/ui/premium/Estados";
import { PainelDeslizante } from "@/ui/premium/Sheet";
import { acaoFinanceiro, ErroFinanceiro } from "../api";
import { mensagemErroFinanceiro } from "../regras";

/**
 * O comprovante anexado pelo aluno (imagem ou PDF), por URL assinada de 5 min (bucket privado). `quem` = de que lado abre:
 * o aluno (aluno_comprovante) ou o profissional (prof_comprovante).
 */
export function ComprovanteVisor({ cobrancaId, quem, aoFechar }: { cobrancaId: string | null; quem: "aluno" | "prof"; aoFechar: () => void }) {
  const [estado, setEstado] = useState<{ url: string; pdf: boolean } | "carregando" | { erro: string }>("carregando");
  const [falhouImagem, setFalhouImagem] = useState(false);

  useEffect(() => {
    if (!cobrancaId) return;
    let vivo = true;
    setEstado("carregando");
    setFalhouImagem(false);
    acaoFinanceiro<{ url: string; pdf: boolean }>(quem === "aluno" ? "aluno_comprovante" : "prof_comprovante", { cobranca_id: cobrancaId })
      .then((r) => vivo && setEstado({ url: r.url, pdf: r.pdf }))
      .catch((e) => vivo && setEstado({ erro: mensagemErroFinanceiro(e instanceof ErroFinanceiro ? e.codigo : null, "Não deu para abrir o comprovante.") }));
    return () => {
      vivo = false;
    };
  }, [cobrancaId, quem]);

  return (
    <PainelDeslizante aberto={!!cobrancaId} aoMudar={(a) => !a && aoFechar()} titulo="Comprovante" descricao="Link válido por 5 minutos." lado="baixo">
      <div data-comprovante-visor className="flex flex-col gap-3">
        {estado === "carregando" ? (
          <Esqueleto className="h-[320px] w-full rounded-[18px]" />
        ) : "erro" in estado ? (
          <EstadoErro titulo="Comprovante indisponível" texto={estado.erro} />
        ) : estado.pdf || falhouImagem ? (
          <div className="flex flex-col items-center gap-3 rounded-[18px] border border-linha bg-superficie px-4 py-8 text-center">
            <FileText aria-hidden className="h-8 w-8 text-texto-2" />
            <p className="text-[13px] text-texto-2">Comprovante em PDF — abra para ver.</p>
          </div>
        ) : (
          <img src={estado.url} alt="Comprovante" onError={() => setFalhouImagem(true)} data-comprovante-imagem
            className="max-h-[60vh] w-full rounded-[18px] border border-linha bg-black/40 object-contain" />
        )}
        {estado !== "carregando" && !("erro" in estado) && (
          <a href={estado.url} target="_blank" rel="noopener noreferrer" className="pq-botao pq-botao-g w-full" data-comprovante-abrir>
            <ExternalLink aria-hidden /> Abrir em outra aba
          </a>
        )}
      </div>
    </PainelDeslizante>
  );
}
