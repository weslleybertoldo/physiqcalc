import { useState } from "react";
import { CircleAlert, RefreshCw } from "lucide-react";
import { useSessao } from "@/nucleo/sessao";

/**
 * hml-17 (H-39): faixa do topo "Não deu para carregar a sua conta agora" — com login, SEM a situação (nem a guardada no aparelho) e
 * com a busca dela falhando (erroSituacao). Sem a situação, a casca abre como aluno sem módulos e as abas Treino e Dieta somem sem
 * aviso (medido com a API caindo); a faixa explica e oferece "Tentar de novo" (busca a situação de novo). Nunca aparece durante o
 * 1º carregamento: o erroSituacao só liga depois da falha.
 */
export default function FaixaContaNaoCarregou() {
  const { usuario, situacao, erroSituacao, recarregarSituacao } = useSessao();
  const [tentando, setTentando] = useState(false);
  if (!usuario || situacao || !erroSituacao) return null;
  const tentar = async () => {
    setTentando(true);
    try {
      await recarregarSituacao();
    } finally {
      setTentando(false);
    }
  };
  return (
    <div
      role="alert"
      data-faixa-conta-erro
      data-estado="erro"
      className="flex items-center gap-[11px] rounded-2xl border py-2.5 pl-3 pr-2.5"
      style={{ background: "linear-gradient(90deg, rgba(244,63,94,.16), rgba(244,63,94,.04))", borderColor: "var(--p-chip-r-borda)" }}
    >
      <CircleAlert aria-hidden className="h-5 w-5 flex-none" strokeWidth={1.75} style={{ color: "var(--p-rosa-3)" }} />
      <div className="min-w-0 flex-1 text-[13px] font-semibold text-texto">
        <div data-faixa-titulo>Não deu para carregar a sua conta agora.</div>
        <div className="mt-px text-[12px] font-medium text-texto-2" data-faixa-subtitulo>Treino e Dieta voltam assim que ela carregar.</div>
      </div>
      <button type="button" onClick={() => void tentar()} disabled={tentando} className="pq-botao pq-botao-g pq-botao-sm flex-none" data-faixa-conta-tentar>
        <RefreshCw aria-hidden className={tentando ? "h-3.5 w-3.5 animate-spin" : "h-3.5 w-3.5"} />
        Tentar de novo
      </button>
    </div>
  );
}
