import { useEffect, useState } from "react";
import { Check, EyeOff } from "lucide-react";
import { toast } from "sonner";
import { Botao } from "@/ui/premium/Botao";
import { CabecalhoCartao, Cartao } from "@/ui/premium/Cartao";
import { Chip } from "@/ui/premium/Chip";
import { Esqueleto } from "@/ui/premium/Estados";
import { ErroPerfil, salvarDadosAluno } from "../dados/api";
import { mensagemErroPerfil } from "../dados/regras";
import { useAtualizarAluno, usePerfilAluno } from "../dados/usePerfilAluno";

const MAX = 4000;

/**
 * Card "Resumo privado" do Resumo (W14 — N-27 "Resumo do paciente" do Nutri): informações e histórico do aluno para a equipe
 * que o acompanha — o aluno não vê (não vai para o app nem para os PDFs). Mesmo campo do site antigo (pacientes.resumo).
 */
export default function CardResumoPrivado({ alunoId }: { alunoId: string }) {
  const q = usePerfilAluno(alunoId);
  const atualizar = useAtualizarAluno(alunoId);
  const p = q.data;
  const [texto, setTexto] = useState("");
  const [salvando, setSalvando] = useState(false);

  useEffect(() => setTexto(p?.resumo ?? ""), [p?.paciente_id, p?.resumo]);

  const mudou = (texto.trim() || null) !== (p?.resumo ?? null);

  const salvar = async () => {
    setSalvando(true);
    try {
      const novo = await salvarDadosAluno(alunoId, { resumo: texto });
      await atualizar(novo);
      toast.success("Resumo salvo.");
    } catch (e) {
      toast.error(mensagemErroPerfil(e instanceof ErroPerfil ? e.codigo : e instanceof Error ? e.message : ""));
    } finally {
      setSalvando(false);
    }
  };

  return (
    <Cartao className="flex min-h-[240px] flex-col px-[18px] py-4" data-card-resumo-privado={p ? p.paciente_id : "carregando"}>
      <CabecalhoCartao titulo="Resumo privado" extra={<Chip tom="g" icone={EyeOff}>O ALUNO NÃO VÊ</Chip>} />
      {q.isLoading ? (
        <Esqueleto className="h-[140px] w-full" />
      ) : !p ? (
        <p className="text-[12.5px] text-texto-3">{mensagemErroPerfil(q.error instanceof Error ? q.error.message : "")}</p>
      ) : (
        <>
          <textarea
            value={texto}
            onChange={(e) => setTexto(e.target.value.slice(0, MAX))}
            maxLength={MAX}
            rows={6}
            disabled={!p.pode_editar}
            placeholder="Informações e histórico deste aluno para a equipe que o acompanha."
            className="min-h-[132px] w-full flex-1 resize-y rounded-[14px] border border-linha-2 bg-superficie px-3.5 py-3 text-[13px] leading-relaxed text-texto outline-none placeholder:text-texto-4 focus:border-violeta/60 disabled:opacity-60"
            data-resumo-texto
          />
          <div className="mt-3 flex items-center gap-3">
            <span className="text-[11px] text-texto-4" data-resumo-contagem>{texto.length}/{MAX}</span>
            {p.pode_editar && (
              <Botao variante="w" tamanho="sm" icone={Check} className="ml-auto" onClick={() => void salvar()} disabled={!mudou || salvando} data-resumo-salvar>
                {salvando ? "Salvando…" : "Salvar"}
              </Botao>
            )}
          </div>
        </>
      )}
    </Cartao>
  );
}
