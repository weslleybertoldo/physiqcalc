import { useEffect, useState } from "react";
import { CircleAlert, RefreshCw, UserRoundCheck, Wallet } from "lucide-react";
import { reais } from "@/financeiro/regras";
import { useIsMobile } from "@/hooks/use-mobile";
import { useSessao } from "@/nucleo/sessao";
import { MENSAGEM_VINCULO, type ErroVinculo, type ResultadoVinculo } from "@/nucleo/situacao";
import { oQueGanha, previaDoCodigo, rotuloDoTipo, type PreviaVinculo } from "@/nucleo/vinculo";
import { Avatar } from "@/ui/premium/Avatar";
import { Botao } from "@/ui/premium/Botao";
import { Chip, type TomChip } from "@/ui/premium/Chip";
import { Esqueleto } from "@/ui/premium/Estados";
import { PainelDeslizante } from "@/ui/premium/Sheet";

const PASSAGEIROS: ErroVinculo[] = ["sem_internet", "rate_limited", "erro_interno"];

function tomDoTipo(p: PreviaVinculo["profissional"]): TomChip {
  const papeis = p?.papeis ?? [];
  if (p?.tipo_perfil === "personal" || (papeis.includes("personal") && !papeis.includes("nutricionista"))) return "t";
  if (p?.tipo_perfil === "nutricionista" || p?.tipo_perfil === "academico" || (papeis.includes("nutricionista") && !papeis.includes("personal"))) return "n";
  return "g";
}

export type FimDoPopup = "vinculou" | "cancelou" | "recusado";

/**
 * Popup "confirmar o profissional" (pedido dele, 29/09): antes de vincular pelo código, mostra o nome, a foto e o tipo do
 * profissional e o que vai acontecer (a mesma regra do vínculo — P7, limite da faixa…); Confirmar vincula (vincular-aluno),
 * Cancelar fecha e nada muda. Usado no campo do Perfil, no "Tenho um código" das Boas-vindas e no link ?prof= (site e APK).
 */
export function ConfirmarVinculo({
  codigo,
  aberto,
  aoFechar,
}: {
  codigo: string | null;
  aberto: boolean;
  /** vinculou (com o resultado) · cancelou (Cancelar/X) · recusado (o código não serve — só "Fechar") */
  aoFechar: (fim: FimDoPopup, resultado?: ResultadoVinculo) => void;
}) {
  const { vincularCodigo } = useSessao();
  const celular = useIsMobile();
  const [previa, setPrevia] = useState<PreviaVinculo | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [confirmando, setConfirmando] = useState(false);
  const [erro, setErro] = useState<ErroVinculo | null>(null);
  const [tentativa, setTentativa] = useState(0);

  useEffect(() => {
    if (!aberto || !codigo) return;
    let vivo = true;
    setPrevia(null);
    setErro(null);
    setCarregando(true);
    previaDoCodigo(codigo)
      .then((p) => vivo && setPrevia(p))
      .finally(() => vivo && setCarregando(false));
    return () => {
      vivo = false;
    };
  }, [aberto, codigo, tentativa]);

  const confirmar = async () => {
    if (!codigo) return;
    setConfirmando(true);
    setErro(null);
    const r = await vincularCodigo(codigo);
    setConfirmando(false);
    if (r.ok) {
      aoFechar("vinculou", r);
      return;
    }
    setErro(r.erro ?? "erro_interno");
  };

  const prof = previa?.profissional ?? null;
  const falha = erro ?? (previa && !previa.ok ? previa.erro : null);
  const passageira = !!falha && PASSAGEIROS.includes(falha);
  const podeConfirmar = !!previa?.ok && !erro;
  const primeiro = (prof?.nome ?? "").split(" ")[0] || "o profissional";
  const fechar = () => aoFechar(podeConfirmar || passageira || carregando ? "cancelou" : "recusado");

  return (
    <PainelDeslizante
      aberto={aberto}
      lado={celular ? "baixo" : "direita"}
      aoMudar={(v) => !v && !confirmando && fechar()}
      titulo="Confirmar o profissional"
      descricao={codigo ? `Código ${codigo}` : undefined}
      rodape={
        carregando ? null : podeConfirmar ? (
          <div className="flex gap-2">
            <Botao className="flex-1" onClick={() => aoFechar("cancelou")} disabled={confirmando} data-vinculo-cancelar>Cancelar</Botao>
            <Botao variante="w" className="flex-1" icone={UserRoundCheck} onClick={() => void confirmar()} disabled={confirmando} data-vinculo-confirmar>
              {confirmando ? "Confirmando…" : "Confirmar"}
            </Botao>
          </div>
        ) : passageira ? (
          <div className="flex gap-2">
            <Botao className="flex-1" onClick={() => aoFechar("cancelou")} data-vinculo-cancelar>Cancelar</Botao>
            <Botao variante="w" className="flex-1" icone={RefreshCw} onClick={() => { setErro(null); setTentativa((t) => t + 1); }} data-vinculo-tentar>
              Tentar de novo
            </Botao>
          </div>
        ) : (
          <Botao variante="w" className="w-full" onClick={() => aoFechar("recusado")} data-vinculo-fechar>Fechar</Botao>
        )
      }
    >
      <div className="flex flex-col gap-4 pt-2" data-popup-vinculo={carregando ? "carregando" : podeConfirmar ? (previa?.jaEra ? "ja-era" : "confirmar") : `erro-${falha ?? ""}`}>
        {carregando ? (
          <div className="flex items-center gap-4">
            <Esqueleto className="h-[72px] w-[72px] rounded-full" />
            <div className="flex flex-1 flex-col gap-2">
              <Esqueleto className="h-4 w-1/2" />
              <Esqueleto className="h-3 w-1/3" />
            </div>
          </div>
        ) : (
          <>
            {prof && (
              <div className="flex items-center gap-4 rounded-[22px] border border-linha bg-superficie p-4" data-vinculo-profissional>
                <Avatar src={prof.foto_url} nome={prof.nome} tamanho={72} />
                <div className="min-w-0 flex-1">
                  <b className="block truncate text-[18px] font-bold tracking-[-0.02em] text-texto" data-vinculo-nome>{prof.nome}</b>
                  <Chip tom={tomDoTipo(prof)} className="mt-1.5" data-vinculo-tipo>{rotuloDoTipo(prof).toUpperCase()}</Chip>
                  {previa?.contaNome && previa.contaNome !== prof.nome && (
                    <span className="mt-1.5 block truncate text-[12px] text-texto-2">{previa.contaNome}</span>
                  )}
                </div>
              </div>
            )}
            {podeConfirmar ? (
              <>
                <p className="text-[13.5px] leading-relaxed text-texto" data-vinculo-o-que>
                  {previa?.jaEra
                    ? `Você já está na lista de ${primeiro}. Confirmar só atualiza o vínculo.`
                    : `Você vai entrar na lista de ${primeiro} e receber ${oQueGanha(previa?.modulos ?? [])} pelo Physiq. Confirma?`}
                </p>
                {previa?.app && (
                  <p className="flex items-start gap-2 rounded-2xl border border-linha bg-superficie px-3.5 py-3 text-[12.5px] leading-relaxed text-texto-2" data-vinculo-app>
                    <Wallet aria-hidden className="mt-0.5 h-4 w-4 flex-none text-violeta-3" />
                    <span>
                      A mensalidade do app{previa.app.valor ? ` (${reais(previa.app.valor)}/mês)` : ""} para aqui
                      {previa.app.assinatura_ativa ? " e a cobrança automática no cartão é cancelada" : ""}. Daqui em diante, você paga como combinar com {primeiro}.
                    </span>
                  </p>
                )}
              </>
            ) : falha ? (
              <p className="flex items-start gap-2 text-[13.5px] leading-relaxed text-texto" role="alert" data-vinculo-erro={falha}>
                <CircleAlert aria-hidden className="mt-0.5 h-4 w-4 flex-none text-ambar-3" />
                {MENSAGEM_VINCULO[falha]}
              </p>
            ) : null}
          </>
        )}
      </div>
    </PainelDeslizante>
  );
}
