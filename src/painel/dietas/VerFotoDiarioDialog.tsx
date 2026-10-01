import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { tomReacao } from "@/nutricao/app/diarioUtil";
import { BTN_SEC, DESCRICAO_JANELA, JANELA, TITULO_JANELA } from "@/nutricao/editor/ui/estilos";
import { Chip } from "@/ui/premium/Chip";
import { urlAssinada, type RegistroDiarioNutri } from "./diario";
import { nomeAluno, textoReacaoNutri, textoRegistroCompleto } from "./diarioPainel";

// Physiq W24 — porta do PhysiqNutri (src/components/diario/VerFotoDiarioDialog.tsx) no visual premium: a foto grande por URL assinada
// (gerada ao abrir — a da miniatura pode ter vencido), o aluno, "Almoço · 01/10/2026 12:40", o comentário do aluno, a reação da
// nutricionista e anterior/próxima entre os registros do MESMO dia.

interface Props {
  open: boolean;
  onOpenChange: (aberto: boolean) => void;
  registro: RegistroDiarioNutri | null;
  /** registros do mesmo dia, na ordem da tela (para anterior/próxima) */
  irmas: RegistroDiarioNutri[];
  onTrocar: (r: RegistroDiarioNutri) => void;
}

export default function VerFotoDiarioDialog({ open, onOpenChange, registro, irmas, onTrocar }: Props) {
  const [url, setUrl] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [carregou, setCarregou] = useState(false);

  useEffect(() => {
    setUrl(null);
    setErro(null);
    setCarregou(false);
    if (!open || !registro) return;
    let ativo = true;
    urlAssinada(registro, 300)
      .then((u) => {
        if (ativo) setUrl(u);
      })
      .catch((e) => {
        if (ativo) setErro(e instanceof Error ? e.message : "Não foi possível abrir a foto.");
      });
    return () => {
      ativo = false;
    };
  }, [open, registro]);

  const idx = registro ? irmas.findIndex((f) => f.id === registro.id) : -1;
  const anterior = idx > 0 ? irmas[idx - 1] : null;
  const proxima = idx >= 0 && idx < irmas.length - 1 ? irmas[idx + 1] : null;
  const subtitulo = registro ? textoRegistroCompleto(registro) : "";
  const reacao = registro ? textoReacaoNutri(registro) : "";
  const posicao = idx >= 0 ? `${idx + 1} de ${irmas.length}` : "";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={`${JANELA} max-h-[92vh] overflow-y-auto sm:max-w-3xl`} data-modal-ver-foto-diario={registro?.id ?? ""} data-carregou={carregou ? "1" : "0"}>
        <DialogHeader>
          <DialogTitle className={TITULO_JANELA} data-ver-foto-titulo>{registro ? nomeAluno(registro) : ""}</DialogTitle>
          <DialogDescription className={DESCRICAO_JANELA} data-ver-foto-subtitulo>{subtitulo}</DialogDescription>
        </DialogHeader>
        {registro?.comentario && <p className="whitespace-pre-wrap text-[13px] text-texto-2" data-ver-foto-comentario>“{registro.comentario}”</p>}
        {reacao && (
          <p className="flex flex-wrap items-center gap-2 text-[13px] text-texto" data-ver-foto-reacao={reacao}>
            <Chip tom={tomReacao(registro?.reacao_nutri)} className="h-[22px] px-2.5 text-[10px]">{(reacao.split(" — ")[0] || "").toUpperCase()}</Chip>
            {registro?.comentario_nutri && <span className="text-texto-2">{registro.comentario_nutri}</span>}
          </p>
        )}
        {erro && <p role="alert" className="text-[13px] text-rosa-3" data-erro-ver-foto>{erro}</p>}
        {!erro && !url && <div className="h-[50vh] w-full animate-pulse rounded-[18px] bg-superficie-2" data-abrindo-foto />}
        {url && (
          <img
            src={url}
            alt={subtitulo}
            className="mx-auto max-h-[68vh] w-auto rounded-[18px] object-contain"
            onLoad={() => setCarregou(true)}
            onError={() => setErro("A foto não carregou. Feche e abra de novo.")}
            data-foto-grande
          />
        )}
        <div className="flex items-center justify-between gap-2 pt-2">
          <button type="button" className={BTN_SEC} onClick={() => anterior && onTrocar(anterior)} disabled={!anterior} data-btn-foto-anterior>
            <ChevronLeft aria-hidden /> Anterior
          </button>
          <span className="text-[11.5px] font-semibold uppercase tracking-[0.1em] text-texto-3" data-ver-foto-posicao>{posicao}</span>
          <button type="button" className={BTN_SEC} onClick={() => proxima && onTrocar(proxima)} disabled={!proxima} data-btn-foto-proxima>
            Próxima <ChevronRight aria-hidden />
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
