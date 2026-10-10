import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { UserX } from "lucide-react";
import { useIsMobile } from "@/hooks/use-mobile";
import { principal } from "@/integrations/principal/client";
import { useSessao } from "@/nucleo/sessao";
import { PainelDeslizante } from "@/ui/premium/Sheet";
import { useUltimoValor } from "@/ui/premium/useUltimoValor";
import { CHAVE_AVISOS } from "@/ui/premium/useAvisos";

interface AvisoRemovido {
  id: string;
  titulo: string;
  criado_em: string;
}

/**
 * "Você não faz mais parte desta conta" (W5, spec 9 — membro removido): quando o dono tira a pessoa da equipe, o banco grava
 * um aviso para ela (remover_membro); na próxima abertura ela vê a janela uma vez, em qualquer área. O acesso já saiu na hora
 * (banco principal) e sai no Treino pelo espelho.
 */
export default function AvisoMembroRemovido() {
  const { usuario } = useSessao();
  const celular = useIsMobile();
  const qc = useQueryClient();
  const [fechado, setFechado] = useState(false);
  const uid = usuario?.id ?? null;
  const q = useQuery({
    queryKey: ["aviso-membro-removido", uid],
    enabled: Boolean(uid),
    staleTime: 5 * 60_000,
    retry: false,
    networkMode: "online",
    queryFn: async (): Promise<AvisoRemovido | null> => {
      const { data, error } = await principal
        .from("avisos")
        .select("id, titulo, criado_em")
        .eq("tipo", "membro_removido")
        .is("lido_em", null)
        .order("criado_em", { ascending: false })
        .limit(1);
      if (error) return null;
      return (data?.[0] as AvisoRemovido | undefined) ?? null;
    },
  });
  const mostrar = !!q.data && !fechado;
  // hml-18a (H-40, D): a folha fica montada e fecha pelo `aberto` (antes sumia seca no "Entendi"); enquanto sai, o texto continua
  const aviso = useUltimoValor(mostrar ? q.data : null);
  if (!aviso) return null;
  const fechar = () => {
    setFechado(true);
    void principal
      .from("avisos")
      .update({ lido_em: new Date().toISOString() })
      .eq("id", aviso.id)
      .then(() => qc.invalidateQueries({ queryKey: CHAVE_AVISOS }));
  };
  return (
    <PainelDeslizante
      aberto={mostrar}
      lado={celular ? "baixo" : "direita"}
      aoMudar={(aberto) => {
        if (!aberto) fechar();
      }}
      titulo="Você não faz mais parte desta conta"
      descricao={aviso.titulo}
      rodape={
        <button type="button" className="pq-botao pq-botao-w w-full" onClick={fechar} data-aviso-removido-ok>
          Entendi
        </button>
      }
    >
      <div data-aviso-membro-removido className="flex flex-col items-center gap-3 pt-3 text-center">
        <span className="flex h-12 w-12 items-center justify-center rounded-2xl border border-linha bg-superficie text-ambar-3">
          <UserX aria-hidden className="h-[22px] w-[22px]" strokeWidth={1.75} />
        </span>
        <p className="max-w-xs text-[13.5px] leading-relaxed text-texto-2">
          O dono da conta tirou você da equipe: os alunos e as páginas dessa conta não aparecem mais para você. Se foi engano, fale com ele.
        </p>
      </div>
    </PainelDeslizante>
  );
}
