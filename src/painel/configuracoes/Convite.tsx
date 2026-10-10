import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import QRCode from "qrcode";
import { Copy, Hash, MessageCircle, QrCode, Share2 } from "lucide-react";
import { toast } from "sonner";
import { PRINCIPAL_SCHEMA } from "@/integrations/principal/client";
import { useConta } from "@/nucleo/conta";
import { TopoPagina } from "@/ui/casca/topo";
import { Botao } from "@/ui/premium/Botao";
import { Chip } from "@/ui/premium/Chip";
import { EstadoCarregando, EstadoErro, EstadoVazio } from "@/ui/premium/Estados";
import { SecaoForm } from "./pecas/Form";
import { ErroEquipe, garantirMeuCodigo } from "./equipe/api";
import { ChipsPapeis } from "./equipe/Linhas";
import { TEXTO_CONVITE_ALUNO, linkDoAluno, linkWhatsApp, mensagemErroEquipe, textoDoLink } from "./equipe/regras";

async function copiar(texto: string, aviso: string) {
  try {
    await navigator.clipboard.writeText(texto);
    toast.success(aviso);
  } catch {
    toast.error("Não foi possível copiar. Selecione o texto e copie.");
  }
}

async function compartilhar(link: string) {
  if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
    try {
      await navigator.share({ title: "Physiq", text: TEXTO_CONVITE_ALUNO, url: link });
      return;
    } catch (e) {
      if ((e as { name?: string } | null)?.name === "AbortError") return;
    }
  }
  await copiar(link, "Link copiado! Cole no WhatsApp do aluno.");
}

/**
 * Configurações › Convite (W5, spec 4.6 — cada membro): o código e o link pessoal do profissional (`?prof=PROF-NOME-SOBRENOME`,
 * o mesmo de hoje). Quem entra por ele vira aluno da conta com este profissional como responsável dos módulos dele. O código
 * é fixo; quem ainda não tinha (ex.: veio do PhysiqNutri) ganha um aqui.
 */
export default function Convite() {
  const { conta } = useConta();
  const codigoConta = conta?.codigo_convite ?? null;
  const q = useQuery({
    queryKey: ["meu-codigo", conta?.id, codigoConta],
    queryFn: async () => codigoConta ?? (await garantirMeuCodigo(conta!.id)),
    enabled: Boolean(conta?.id),
    staleTime: Infinity,
    retry: 1,
  });
  const [qr, setQr] = useState<string | null>(null);
  const codigo = q.data ?? null;
  const link = codigo ? linkDoAluno(codigo, PRINCIPAL_SCHEMA) : "";

  useEffect(() => {
    if (!link) return;
    let vivo = true;
    QRCode.toDataURL(link, { margin: 1, width: 360, color: { dark: "#09090B", light: "#FFFFFF" } })
      .then((u) => vivo && setQr(u))
      .catch(() => vivo && setQr(null));
    return () => {
      vivo = false;
    };
  }, [link]);

  if (!conta) {
    return (
      <div data-config-aba="convite" data-estado-aba="vazio">
        <EstadoVazio titulo="Nenhuma conta ativa" texto="O seu link de convite aparece aqui quando você faz parte de uma conta de profissional." />
      </div>
    );
  }
  if (q.isLoading) return <div data-config-aba="convite" data-estado-aba="carregando"><EstadoCarregando linhas={2} rotulo="Carregando o seu código" /></div>;
  if (q.isError || !codigo) {
    const cod = q.error instanceof ErroEquipe ? q.error.codigo : null;
    return (
      <div data-config-aba="convite" data-estado-aba="erro">
        <EstadoErro titulo="Não deu para carregar o seu código" texto={mensagemErroEquipe(cod)} aoTentar={() => void q.refetch()} />
      </div>
    );
  }

  return (
    <div data-config-aba="convite" className="flex flex-col gap-3.5">
      <TopoPagina titulo="Convite" subtitulo={`Seu link de aluno na ${conta.nome}`} />
      <div className="grid grid-cols-1 gap-3.5 lg:grid-cols-[minmax(0,1.08fr)_minmax(0,1fr)]">
        <SecaoForm brilho titulo="Seu link de convite" marca="convite-link" extra={<ChipsPapeis papeis={conta.papeis} />}
          descricao={textoDoLink(conta.papeis, conta.nome)}>
          <div className="flex flex-col gap-4">
            <div>
              <span className="text-[12.5px] font-semibold text-texto-2">Código</span>
              <div className="mt-1.5 flex items-center gap-2">
                <span className="flex h-12 flex-1 items-center rounded-[14px] border border-linha-2 bg-superficie px-4 text-[16px] font-semibold tracking-[0.06em] text-texto tabular-nums" data-convite-codigo>
                  {codigo}
                </span>
                <Botao icone={Hash} onClick={() => void copiar(codigo, "Código copiado!")} data-convite-copiar-codigo>Copiar</Botao>
              </div>
            </div>
            <div>
              <span className="text-[12.5px] font-semibold text-texto-2">Link</span>
              <input readOnly value={link} onFocus={(e) => e.currentTarget.select()} data-convite-link
                className="mt-1.5 h-12 w-full rounded-[14px] border border-linha-2 bg-superficie px-4 text-[14px] text-texto outline-none" />
            </div>
            <div className="flex flex-wrap gap-2 border-t border-linha pt-4">
              <Botao variante="w" icone={Copy} onClick={() => void copiar(link, "Link copiado!")} data-convite-copiar-link>Copiar link</Botao>
              <Botao icone={Share2} onClick={() => void compartilhar(link)} data-convite-compartilhar>Compartilhar</Botao>
              <a href={linkWhatsApp(link)} target="_blank" rel="noopener noreferrer" className="pq-botao pq-botao-g" data-convite-whatsapp>
                <MessageCircle aria-hidden /> WhatsApp
              </a>
            </div>
            <p className="text-[12px] text-texto-3">O link e o código são fixos: não mudam nem precisam ser gerados de novo. O aluno também pode digitar o código em "Tenho um código".</p>
          </div>
        </SecaoForm>
        <SecaoForm titulo="QR code" marca="convite-qr" extra={<Chip tom="g" icone={QrCode}>PRESENCIAL</Chip>}
          descricao="O aluno aponta a câmera do celular e cai direto no Physiq com o seu código.">
          <div className="flex justify-center py-2">
            {qr ? (
              <img src={qr} alt={`QR code do link de convite ${codigo}`} width={220} height={220} className="rounded-2xl border border-linha bg-white p-2" data-convite-qr />
            ) : (
              <div className="h-[220px] w-[220px] animate-pulse rounded-2xl bg-superficie-2" />
            )}
          </div>
        </SecaoForm>
      </div>
    </div>
  );
}
