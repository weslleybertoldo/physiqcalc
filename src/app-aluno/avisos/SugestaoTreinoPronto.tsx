import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@powersync/react";
import { ListChecks, X } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useSessao } from "@/nucleo/sessao";
import { matriculaDoApp } from "@/nucleo/situacao";
import { treinoEscolhido } from "@/app-aluno/sozinho/aplicarTreino";

const CHAVE = "physiq_sugestao_treino_pronto_fechada:";

/**
 * Faixa do topo da aba de abertura (W7b): o aluno sem profissional que ainda não tem treino (nenhum treino próprio e nada na
 * semana) é convidado a escolher um treino pronto pelo objetivo — a aba Treino antiga não conhece o catálogo. Some quando ele
 * escolhe um, monta o dele ou fecha no X (guardado no aparelho).
 */
export default function SugestaoTreinoPronto() {
  const navigate = useNavigate();
  const { situacao } = useSessao();
  const { user } = useAuth();
  const uid = user?.id ?? "";
  const doApp = matriculaDoApp(situacao);
  const [fechada, setFechada] = useState(() => {
    try {
      return !!uid && localStorage.getItem(CHAVE + uid) === "1";
    } catch {
      return false;
    }
  });
  const { data } = useQuery<{ grupos: number; semana: number }>(
    "SELECT (SELECT count(*) FROM tb_grupos_treino_usuario WHERE user_id = ?) AS grupos, (SELECT count(*) FROM tb_semana_treinos WHERE user_id = ?) AS semana",
    [uid, uid],
  );
  const linha = data?.[0];
  if (!doApp || !uid || fechada || treinoEscolhido(uid) || !linha || Number(linha.grupos) > 0 || Number(linha.semana) > 0) return null;
  const fechar = () => {
    setFechada(true);
    try {
      localStorage.setItem(CHAVE + uid, "1");
    } catch {
      /* noop */
    }
  };
  return (
    <div role="status" data-sugestao-treino-pronto className="flex items-center gap-[11px] rounded-2xl border py-2.5 pl-3 pr-1.5"
      style={{ background: "linear-gradient(90deg, rgba(139,92,246,.18), rgba(139,92,246,.04))", borderColor: "rgba(139,92,246,.32)" }}>
      <ListChecks aria-hidden className="h-5 w-5 flex-none text-violeta-3" strokeWidth={1.75} />
      <div className="min-w-0 flex-1 text-[13px] font-semibold text-texto">
        <div className="truncate">Escolha um treino pronto</div>
        <div className="mt-px truncate text-[12px] font-medium text-texto-2">Pelo seu objetivo, ou monte o seu em "Alterar grupo"</div>
      </div>
      <button type="button" onClick={() => navigate("/perfil/treinos-prontos")} className="pq-botao pq-botao-g pq-botao-sm flex-none" data-sugestao-ver>Ver</button>
      <button type="button" onClick={fechar} aria-label="Fechar" className="flex h-8 w-8 flex-none items-center justify-center rounded-xl text-texto-3 hover:text-texto" data-sugestao-fechar>
        <X aria-hidden className="h-4 w-4" />
      </button>
    </div>
  );
}
