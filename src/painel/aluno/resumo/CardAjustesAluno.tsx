import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Interruptor } from "@/app-aluno/perfil/pecas/Interruptor";
import { CabecalhoCartao, Cartao } from "@/ui/premium/Cartao";
import { Esqueleto } from "@/ui/premium/Estados";
import { ErroPerfil, salvarAjusteAluno } from "../dados/api";
import { AJUSTES, mensagemErroPerfil, observacaoDoAjuste } from "../dados/regras";
import type { ChaveAjuste, PerfilAluno } from "../dados/tipos";
import { chavePerfilAluno, usePerfilAluno } from "../dados/usePerfilAluno";

/**
 * Card "Mensagens automáticas" do Resumo (era o "Ajustes do aluno" da W14 — N-27; falha F2 / R12): o ajuste das mensagens automáticas no
 * WhatsApp (o enfileirador só manda para quem está ligado). W-A P4 (P2/P3 do Weslley, 12/10/2026): o acesso ao app, o diário alimentar com
 * fotos e o envio de fotos pelo link foram para a aba Acessos — aqui fica só o WhatsApp. Grava no mesmo pacientes.config (dados/api.ts —
 * a hml-21c troca só o miolo, com a mesma assinatura).
 */
export default function CardAjustesAluno({ alunoId }: { alunoId: string }) {
  const q = usePerfilAluno(alunoId);
  const qc = useQueryClient();
  const p = q.data;
  const [salvando, setSalvando] = useState<ChaveAjuste | null>(null);

  const mudar = async (chave: ChaveAjuste, valor: boolean) => {
    if (!p) return;
    setSalvando(chave);
    try {
      const ajustes = await salvarAjusteAluno(alunoId, chave, valor);
      qc.setQueryData<PerfilAluno>(chavePerfilAluno(alunoId), (antes) => (antes ? { ...antes, ajustes } : antes));
      toast.success("Ajuste salvo.");
    } catch (e) {
      toast.error(mensagemErroPerfil(e instanceof ErroPerfil ? e.codigo : e instanceof Error ? e.message : ""));
    } finally {
      setSalvando(null);
    }
  };

  return (
    <Cartao className="flex min-h-[240px] flex-col px-[18px] py-4" data-card-ajustes-aluno={p ? p.paciente_id : "carregando"}>
      <CabecalhoCartao titulo="Mensagens automáticas" />
      {q.isLoading ? (
        <Esqueleto className="h-[160px] w-full" />
      ) : !p ? (
        <p className="text-[12.5px] text-texto-3">{mensagemErroPerfil(q.error instanceof Error ? q.error.message : "")}</p>
      ) : (
        <ul className="flex flex-col" data-ajustes-lista>
          {AJUSTES.map((a) => {
            const obs = observacaoDoAjuste(a.chave, p);
            const ligado = p.ajustes[a.chave];
            return (
              <li key={a.chave} className="flex items-start gap-3 border-b border-linha py-2.5 last:border-b-0" data-ajuste={a.chave} data-ajuste-ligado={ligado ? "1" : "0"}>
                <div className="min-w-0 flex-1">
                  <p className="text-[13.5px] font-semibold text-texto">{a.rotulo}</p>
                  <p className="mt-0.5 text-[11.5px] leading-relaxed text-texto-3">{a.ajuda}</p>
                  {obs && <p className="mt-0.5 text-[11.5px] leading-relaxed text-ambar-3" data-ajuste-obs>{obs}</p>}
                </div>
                <Interruptor
                  ligado={ligado}
                  aoMudar={(v) => void mudar(a.chave, v)}
                  rotulo={a.rotulo}
                  desligado={!p.pode_editar || salvando !== null}
                  data-ajuste-botao={a.chave}
                />
              </li>
            );
          })}
        </ul>
      )}
    </Cartao>
  );
}
