import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Copy, ExternalLink, ImageUp, MessageCircle, RefreshCw, TriangleAlert, X } from "lucide-react";
import { toast } from "sonner";
import { useIsMobile } from "@/hooks/use-mobile";
import { enderecoDoDiario } from "@/nucleo/siteAntigoNutri";
import { Botao } from "@/ui/premium/Botao";
import { CabecalhoCartao, Cartao } from "@/ui/premium/Cartao";
import { Chip } from "@/ui/premium/Chip";
import { Esqueleto } from "@/ui/premium/Estados";
import { PainelDeslizante } from "@/ui/premium/Sheet";
import { ErroPerfil, gerarNovoLink } from "../dados/api";
import { linkLigado, mensagemErroPerfil, temNutricao, textoDoLink, whatsappDoAluno } from "../dados/regras";
import type { PerfilAluno } from "../dados/tipos";
import { chavePerfilAluno, usePerfilAluno } from "../dados/usePerfilAluno";

/**
 * Card "Link do diário" do Resumo (W14 — falha F1 / R13): o link do aluno agora é o do DIÁRIO (/d/<código>) — o "Link do
 * paciente" antigo mostrava /p/<código>, que dava 404 (o /p/ antigo passa a abrir o diário, src/publico/LinkAntigo.tsx).
 * Desde a W24 o /d/ é a página pública do Physiq (src/nucleo/siteAntigoNutri.ts — um lugar só); W28: o aviso "abre no site do
 * PhysiqNutri" saiu. Copiar, abrir, mandar no WhatsApp e gerar um link novo (o anterior para). Só para aluno com Nutrição (o
 * diário é da nutricionista).
 */
export default function CardLinkDiario({ alunoId }: { alunoId: string }) {
  const q = usePerfilAluno(alunoId);
  const qc = useQueryClient();
  const celular = useIsMobile();
  const p = q.data;
  const [confirmar, setConfirmar] = useState(false);
  const [gerando, setGerando] = useState(false);

  if (q.isLoading) {
    return (
      <Cartao className="flex min-h-[240px] flex-col px-[18px] py-4" data-card-link-diario="carregando">
        <CabecalhoCartao titulo="Link do diário" />
        <Esqueleto className="h-[120px] w-full" />
      </Cartao>
    );
  }
  if (!p || !temNutricao(p)) return null;

  const link = enderecoDoDiario(p.link_codigo);
  const estado = linkLigado(p.ajustes);
  const zap = whatsappDoAluno(p.telefone);

  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(link);
      toast.success("Link copiado.");
    } catch {
      toast.error("Não deu para copiar. Selecione o link e copie.");
    }
  };

  const novo = async () => {
    setGerando(true);
    try {
      const codigo = await gerarNovoLink(alunoId);
      qc.setQueryData<PerfilAluno>(chavePerfilAluno(alunoId), (antes) => (antes ? { ...antes, link_codigo: codigo } : antes));
      toast.success("Link novo gerado. O anterior deixou de valer.");
      setConfirmar(false);
    } catch (e) {
      toast.error(mensagemErroPerfil(e instanceof ErroPerfil ? e.codigo : e instanceof Error ? e.message : ""));
    } finally {
      setGerando(false);
    }
  };

  return (
    <Cartao className="flex min-h-[240px] flex-col px-[18px] py-4" data-card-link-diario={p.link_codigo} data-link-estado={estado.ligado ? "ligado" : "desligado"}>
      <CabecalhoCartao
        titulo="Link do diário"
        extra={<Chip tom={estado.ligado ? "n" : "a"} data-link-chip>{estado.ligado ? "LIGADO" : "DESLIGADO"}</Chip>}
      />
      <p className="text-[12.5px] leading-relaxed text-texto-2">
        Pelo link, o aluno manda as fotos das refeições sem entrar no app{p.tem_login ? " (no app, ele usa a Foto pro diário)" : ""}.
      </p>
      <div className="mt-3 flex items-start gap-2 rounded-[14px] border border-linha-2 bg-superficie px-3 py-2.5" data-link-url>
        <ImageUp aria-hidden className="mt-px h-4 w-4 flex-none text-texto-3" />
        <code className="min-w-0 flex-1 break-all font-mono text-[12px] leading-snug text-texto" data-link-diario={link}>{link.replace(/^https?:\/\//, "")}</code>
      </div>
      {!estado.ligado && (
        <p className="mt-2 flex items-start gap-1.5 text-[11.5px] leading-relaxed text-ambar-3" data-link-motivo>
          <TriangleAlert aria-hidden className="mt-0.5 h-3.5 w-3.5 flex-none" /> {estado.motivo} Quem abrir o link não consegue mandar fotos.
        </p>
      )}
      <div className="mt-auto flex flex-wrap gap-x-4 gap-y-2 pt-3">
        <button type="button" onClick={() => void copiar()} className="flex items-center gap-1.5 text-[12.5px] font-semibold text-violeta-3" data-link-copiar>
          <Copy aria-hidden className="h-3.5 w-3.5" /> Copiar
        </button>
        <a href={link} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 text-[12.5px] font-semibold text-texto-2 hover:text-texto" data-link-abrir>
          <ExternalLink aria-hidden className="h-3.5 w-3.5" /> Abrir
        </a>
        {zap && (
          <a href={`${zap}?text=${encodeURIComponent(textoDoLink(p.nome, link))}`} target="_blank" rel="noreferrer"
            className="flex items-center gap-1.5 text-[12.5px] font-semibold text-texto-2 hover:text-texto" data-link-whatsapp>
            <MessageCircle aria-hidden className="h-3.5 w-3.5" /> WhatsApp
          </a>
        )}
        {p.pode_editar && (
          <button type="button" onClick={() => setConfirmar(true)} className="flex items-center gap-1.5 text-[12.5px] font-semibold text-texto-3 hover:text-texto-2" data-link-novo>
            <RefreshCw aria-hidden className="h-3.5 w-3.5" /> Gerar link novo
          </button>
        )}
      </div>
      <PainelDeslizante aberto={confirmar} aoMudar={setConfirmar} lado={celular ? "baixo" : "direita"} titulo="Gerar um link novo?">
        <div className="flex flex-col gap-4 pt-2" data-link-confirmar>
          <p className="text-[13px] leading-relaxed text-texto-2">O link atual deixa de funcionar. Quem já recebeu o antigo precisa do novo.</p>
          <div className="flex gap-2">
            <Botao variante="w" icone={RefreshCw} onClick={() => void novo()} disabled={gerando} data-link-confirmar-ok>
              {gerando ? "Gerando…" : "Gerar link novo"}
            </Botao>
            <Botao icone={X} onClick={() => setConfirmar(false)}>Cancelar</Botao>
          </div>
        </div>
      </PainelDeslizante>
    </Cartao>
  );
}
