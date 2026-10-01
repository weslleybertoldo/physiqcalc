import { useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { BellOff, Check, List, MessageCircleOff, X } from "lucide-react";
import { toast } from "sonner";
import { useIsMobile } from "@/hooks/use-mobile";
import { useConta } from "@/nucleo/conta";
import { buscarMensagensDesligadas, fecharAvisoMensagens, ligarMensagensParaTodos } from "@/painel/aluno/dados/api";
import { formatarTelefone, textoMensagensDesligadas } from "@/painel/aluno/dados/regras";
import { Botao } from "@/ui/premium/Botao";
import { PainelDeslizante } from "@/ui/premium/Sheet";

const CHAVE = ["mensagens-desligadas"] as const;

/**
 * Aviso ÚNICO da migração P15 (W14 — R12): o WhatsApp automático agora só vai para quem tem o ajuste "Mensagens automáticas"
 * LIGADO (antes ia para todo paciente com telefone). Para o profissional que já tem o WhatsApp no Physiq e tem alunos com
 * telefone e o ajuste desligado: "Ver quais" (a lista = o número) e "Ligar para todos" (liga exatamente os da lista). Fechar ou
 * ligar guarda no perfil dele (profiles.config.aviso_mensagens_w14) — não volta, em nenhum aparelho.
 * W23: vale também para o PERSONAL — a lista são os alunos de quem a pessoa é a nutricionista OU o personal (os alunos do personal
 * nascem com as mensagens desligadas; o padrão não muda). A regra mora no banco (mensagens_desligadas / mensagens_ligar_para_todos).
 */
export default function FaixaMensagensDesligadas({ children }: { children: ReactNode }) {
  const { conta } = useConta();
  const qc = useQueryClient();
  const celular = useIsMobile();
  const [ver, setVer] = useState(false);
  const [indo, setIndo] = useState(false);
  const q = useQuery({ queryKey: CHAVE, queryFn: buscarMensagensDesligadas, enabled: !!conta, staleTime: 5 * 60_000, retry: 1, networkMode: "online" });
  const d = q.data;
  if (!d || !d.mostrar || d.total === 0) return <>{children}</>;

  const pronto = (ligados?: number) => {
    qc.setQueryData(CHAVE, { ...d, mostrar: false, visto: { em: new Date().toISOString() } });
    void qc.invalidateQueries({ queryKey: ["aluno-perfil"] });
    if (ligados !== undefined) toast.success(ligados === 1 ? "Mensagens ligadas para 1 aluno." : `Mensagens ligadas para ${ligados} alunos.`);
  };
  const ligar = async () => {
    setIndo(true);
    try {
      const n = await ligarMensagensParaTodos(d.alunos.map((a) => a.id));
      setVer(false);
      pronto(n);
    } catch {
      toast.error("Não deu para ligar agora. Tente de novo.");
    } finally {
      setIndo(false);
    }
  };
  const fechar = async () => {
    try {
      await fecharAvisoMensagens();
    } catch {
      /* fecha nesta abertura; volta na próxima se não gravou */
    }
    pronto();
  };

  return (
    <>
      <div role="status" data-faixa-mensagens={d.total}
        className="mb-4 flex flex-wrap items-center gap-3 rounded-2xl border border-ambar/30 px-3.5 py-2.5 text-[13px] text-texto"
        style={{ background: "linear-gradient(90deg, var(--p-chip-a-fundo), transparent)" }}>
        <MessageCircleOff aria-hidden className="h-[18px] w-[18px] flex-none text-ambar-3" strokeWidth={1.9} />
        <span className="min-w-[220px] flex-1 font-medium">
          {textoMensagensDesligadas(d.total)}{" "}
          <span className="font-normal text-texto-2">Agora o WhatsApp automático só vai para quem está com o ajuste ligado.</span>
        </span>
        <button type="button" onClick={() => setVer(true)} className="pq-botao pq-botao-g pq-botao-sm" data-faixa-mensagens-ver>
          <List aria-hidden /> Ver quais
        </button>
        <button type="button" onClick={() => void ligar()} disabled={indo} className="pq-botao pq-botao-w pq-botao-sm" data-faixa-mensagens-ligar>
          <Check aria-hidden /> {indo ? "Ligando…" : "Ligar para todos"}
        </button>
        <button type="button" onClick={() => void fechar()} aria-label="Fechar o aviso" className="flex h-8 w-8 flex-none items-center justify-center rounded-xl text-texto-3 hover:text-texto"
          data-faixa-mensagens-fechar>
          <X aria-hidden className="h-4 w-4" />
        </button>
      </div>
      <PainelDeslizante aberto={ver} aoMudar={setVer} lado={celular ? "baixo" : "direita"} titulo="Mensagens desligadas"
        descricao={textoMensagensDesligadas(d.total)}
        rodape={
          <div className="flex gap-2">
            <Botao variante="w" icone={Check} onClick={() => void ligar()} disabled={indo} data-mensagens-lista-ligar>
              {indo ? "Ligando…" : `Ligar para os ${d.total}`}
            </Botao>
            <Botao icone={BellOff} onClick={() => void fechar()}>Deixar assim</Botao>
          </div>
        }>
        <ul className="flex flex-col" data-mensagens-lista={d.alunos.length}>
          {d.alunos.map((a) => (
            <li key={a.id} className="flex items-center gap-3 border-b border-linha py-2.5 text-[13px] last:border-b-0" data-mensagens-aluno={a.id}>
              <Link to={`/painel/alunos/${encodeURIComponent(a.rota_id)}`} onClick={() => setVer(false)} className="min-w-0 flex-1 truncate font-medium text-texto hover:text-violeta-3">
                {a.nome}
              </Link>
              <span className="flex-none text-texto-3">{formatarTelefone(a.telefone)}</span>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-[12px] leading-relaxed text-texto-3">
          Você também liga ou desliga um por um no perfil do aluno, em Ajustes do aluno.
        </p>
      </PainelDeslizante>
      {children}
    </>
  );
}
