// Physiq H5 (N-34) — "Ver" da foto de progresso no painel: a porta do VisualizarFotoDialog do Nutri (main 294887a,
// src/components/evolucao/VisualizarFotoDialog.tsx) no visual premium — a imagem grande, "posição · data" (+ a observação da
// nutricionista), anterior/próxima entre as fotos da MESMA data (na ordem das posições) e Baixar. Vale para as 2 origens: as fotos
// mensais do personal (Banco do Treino) e as de evolução da nutricionista (banco principal), sempre por URL assinada.
import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, Download, PenLine } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ROTULO_POSICAO } from "@/evolucao/formato";
import type { Foto } from "@/evolucao/tipos";
import { Botao } from "@/ui/premium/Botao";
import { Chip } from "@/ui/premium/Chip";
import { baixarFoto, nomeArquivoFoto, textoDaFoto } from "./baixarFoto";


export function VisualizarFoto({ foto, irmas, observacao, nomeAluno, podeEditar, aoTrocar, aoFechar, aoEditar }: {
  foto: Foto | null;
  /** as fotos da mesma data (mesma origem), na ordem das posições */
  irmas: Foto[];
  observacao?: string | null;
  nomeAluno: string;
  podeEditar: boolean;
  aoTrocar: (f: Foto) => void;
  aoFechar: () => void;
  aoEditar: (f: Foto) => void;
}) {
  const [carregou, setCarregou] = useState(false);
  const [falhou, setFalhou] = useState(false);
  const [baixando, setBaixando] = useState(false);
  useEffect(() => {
    setCarregou(false);
    setFalhou(false);
  }, [foto?.id]);

  const i = foto ? irmas.findIndex((x) => x.id === foto.id) : -1;
  const anterior = i > 0 ? irmas[i - 1] : null;
  const proxima = i >= 0 && i < irmas.length - 1 ? irmas[i + 1] : null;

  const baixar = async () => {
    if (!foto?.url) return;
    setBaixando(true);
    try {
      const nome = nomeArquivoFoto(nomeAluno, ROTULO_POSICAO[foto.posicao], foto.mensal ? foto.data.slice(0, 7) : foto.data, foto.caminho);
      const como = await baixarFoto(foto.url, nome);
      toast.success(como === "compartilhado" ? "Foto pronta para salvar ou enviar." : `Baixando ${nome}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível baixar a foto");
    } finally {
      setBaixando(false);
    }
  };

  return (
    <Dialog open={!!foto} onOpenChange={(v) => !v && aoFechar()}>
      <DialogContent className="max-h-[94vh] overflow-y-auto border-linha-2 bg-tela text-texto sm:max-w-3xl sm:rounded-[24px]"
        data-visualizar-foto={foto?.id ?? ""} data-carregou={carregou ? "1" : "0"}>
        {foto && (
          <>
            <DialogHeader>
              <DialogTitle className="flex flex-wrap items-center gap-2 font-body text-[17px] font-semibold normal-case tracking-[-0.02em] text-texto" data-visualizar-titulo>
                {textoDaFoto(foto)}
                <Chip tom={foto.origem === "treino" ? "t" : "n"}>{foto.origem === "treino" ? "TREINO" : "NUTRIÇÃO"}</Chip>
              </DialogTitle>
              <DialogDescription className="font-body text-[12.5px] text-texto-2" data-visualizar-observacao={observacao ?? ""}>
                {[foto.autor.nome ? `Por ${foto.autor.nome}` : null, observacao?.trim() || null].filter(Boolean).join(" · ") || "Foto de progresso"}
              </DialogDescription>
            </DialogHeader>

            {!foto.url || falhou ? (
              <p role="alert" className="rounded-2xl border border-linha-2 bg-superficie px-4 py-6 text-center text-[13px] text-texto-2" data-visualizar-erro>
                A foto não abriu agora (o link vence em 1 hora). Feche e abra a aba de novo.
              </p>
            ) : (
              <div className="flex min-h-[200px] items-center justify-center overflow-hidden rounded-2xl border border-linha bg-[rgba(0,0,0,.35)]">
                <img src={foto.url} alt={textoDaFoto(foto)} className="max-h-[66vh] w-auto object-contain" onLoad={() => setCarregou(true)} onError={() => setFalhou(true)}
                  data-visualizar-imagem />
              </div>
            )}

            <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
              <div className="flex items-center gap-1.5">
                <Botao variante="g" tamanho="sm" icone={ChevronLeft} onClick={() => anterior && aoTrocar(anterior)} disabled={!anterior}
                  title={anterior ? textoDaFoto(anterior) : undefined} data-foto-anterior>
                  Anterior
                </Botao>
                <Botao variante="g" tamanho="sm" onClick={() => proxima && aoTrocar(proxima)} disabled={!proxima} title={proxima ? textoDaFoto(proxima) : undefined}
                  data-foto-proxima>
                  Próxima <ChevronRight aria-hidden className="h-4 w-4" />
                </Botao>
                {irmas.length > 1 && i >= 0 && <span className="text-[12px] tabular-nums text-texto-3" data-visualizar-indice>{i + 1}/{irmas.length}</span>}
              </div>
              <div className="flex items-center gap-2">
                {podeEditar && (
                  <Botao variante="g" tamanho="sm" icone={PenLine} onClick={() => aoEditar(foto)} data-foto-editar-visualizar>
                    Editar
                  </Botao>
                )}
                <Botao variante="w" tamanho="sm" icone={Download} onClick={() => void baixar()} disabled={baixando || !foto.url} data-leitura data-foto-baixar>
                  {baixando ? "Baixando…" : "Baixar"}
                </Botao>
              </div>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
