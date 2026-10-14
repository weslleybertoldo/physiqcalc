import { useEffect, useState } from "react";
import { Check, Copy, KeyRound, ShieldCheck, ShieldOff } from "lucide-react";
import { toast } from "sonner";
import { MensagemForm } from "@/entrada/pecas/Campo";
import { useSessao } from "@/nucleo/sessao";
import {
  codigoValido,
  fatoresVerificados,
  ligadaDesde,
  TEXTO_ERRO_CODIGO,
  type ErroCodigo,
  type FatorDaSessao,
} from "@/nucleo/doisFatoresRegras";
import { Botao } from "@/ui/premium/Botao";
import { CabecalhoCartao, Cartao } from "@/ui/premium/Cartao";
import { Chip } from "@/ui/premium/Chip";
import { EstadoCarregando } from "@/ui/premium/Estados";
import { CampoCodigo } from "./CampoCodigo";
import { comecarCadastro, confirmar, erroDe, fatores, type Cadastro } from "./mfa";

type Estado =
  | { tipo: "carregando" }
  | { tipo: "desligada" }
  | { tipo: "passos"; cadastro: Cadastro }
  | { tipo: "ligada"; fator: FatorDaSessao | null; agora: boolean };

/** O código em texto em grupos de 4 (mais fácil de digitar no app); o "Copiar" leva o código inteiro, sem espaço. */
function emGrupos(segredo: string): string {
  return segredo.replace(/(.{4})/g, "$1 ").trim();
}

/**
 * hml-22 (H-22) — Master › Configurações › "Verificação em 2 etapas": Desligada → "Ativar" → 1. ler o QR (ou digitar o código em
 * texto) e 2. digitar os 6 números → Ligada. Ligada, entrar no painel master pede o código (TelaCodigo). Desligar não fica na tela
 * (decisão da hml-22): tirar ou trocar de celular é pelo suporte (docs/master-2fa.md). O QR e o código em texto levam
 * data-2fa-qr e data-2fa-segredo (o E2E borra antes do print); o segredo fica só na memória desta tela.
 */
export function CartaoDoisFatores() {
  const { sessao } = useSessao();
  const [estado, setEstado] = useState<Estado>({ tipo: "carregando" });
  const [codigo, setCodigo] = useState("");
  const [erro, setErro] = useState<ErroCodigo | null>(null);
  const [ocupado, setOcupado] = useState(false);

  // o estado vem do Auth (fresco); sem resposta, vale o que a sessão guardou
  useEffect(() => {
    let vivo = true;
    void fatores().then((r) => {
      if (!vivo) return;
      const verificados = r.ok ? r.valor.verificados : fatoresVerificados(sessao?.user?.factors);
      setEstado(verificados.length ? { tipo: "ligada", fator: verificados[0], agora: false } : { tipo: "desligada" });
    });
    return () => {
      vivo = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- lê o Auth uma vez ao abrir; o cadastro atualiza o estado sozinho
  }, []);

  async function ativar() {
    setOcupado(true);
    setErro(null);
    setCodigo("");
    const r = await comecarCadastro();
    setOcupado(false);
    if (!r.ok) {
      toast.error(TEXTO_ERRO_CODIGO[erroDe(r) === "muitas" ? "muitas" : "falhou"]);
      return;
    }
    setEstado({ tipo: "passos", cadastro: r.valor });
  }

  async function confirmarCodigo(valor = codigo) {
    if (estado.tipo !== "passos" || ocupado || !codigoValido(valor)) return;
    setOcupado(true);
    setErro(null);
    const r = await confirmar(estado.cadastro.id, valor);
    setOcupado(false);
    const e = erroDe(r);
    if (e) {
      setErro(e === "sem_fator" ? "falhou" : e);
      setCodigo("");
      return;
    }
    // ligada: o fator fresco (a data); sem resposta, a de agora
    const lido = await fatores();
    const fator = lido.ok && lido.valor.verificados.length ? lido.valor.verificados[0] : null;
    setEstado({ tipo: "ligada", fator, agora: true });
  }

  async function copiar(segredo: string) {
    try {
      await navigator.clipboard.writeText(segredo);
      toast.success("Código copiado.");
    } catch {
      toast.error("Não deu para copiar. Selecione o código e copie.");
    }
  }

  const desde = estado.tipo === "ligada" ? ligadaDesde(estado.fator) ?? ligadaDesde({ created_at: new Date().toISOString(), updated_at: null }) : null;
  const chip =
    estado.tipo === "ligada" ? (
      <Chip tom="n" icone={ShieldCheck} data-2fa-estado="ligada">
        Ligada desde {desde}
      </Chip>
    ) : estado.tipo === "carregando" ? null : (
      <Chip tom="g" icone={ShieldOff} data-2fa-estado={estado.tipo === "passos" ? "ativando" : "desligada"}>
        Desligada
      </Chip>
    );

  return (
    <Cartao brilho className="px-[18px] pb-4 pt-4" data-cartao-2fa>
      <CabecalhoCartao titulo="Verificação em 2 etapas" extra={chip} />
      <p className="mb-3 text-[13px] leading-relaxed text-texto-2">
        Com ela, entrar no painel master pede um código de 6 números do app autenticador, além da senha ou do Google.
      </p>

      {estado.tipo === "carregando" && <EstadoCarregando linhas={2} />}

      {estado.tipo === "desligada" && (
        <Botao variante="w" icone={KeyRound} disabled={ocupado} onClick={() => void ativar()} data-2fa-ativar>
          {ocupado ? "Preparando…" : "Ativar"}
        </Botao>
      )}

      {estado.tipo === "passos" && (
        <div className="flex flex-col gap-4" data-2fa-passos>
          <div className="flex flex-col gap-3 rounded-2xl border border-linha bg-superficie-3 p-3.5">
            <b className="text-[13.5px] text-texto">1. No app autenticador, leia o QR.</b>
            <div className="flex justify-center">
              <img
                src={estado.cadastro.qr}
                alt="QR para o app autenticador"
                width={180}
                height={180}
                className="h-[180px] w-[180px] rounded-xl bg-white p-2"
                data-2fa-qr
              />
            </div>
            <span className="text-[12.5px] text-texto-3">Não dá para ler? Digite este código no app:</span>
            <div className="flex flex-wrap items-center gap-2">
              <code className="min-w-0 flex-1 break-all rounded-xl border border-linha-2 bg-superficie px-3 py-2 font-mono text-[13px] tracking-wide text-texto" data-2fa-segredo>
                {emGrupos(estado.cadastro.segredo)}
              </code>
              <Botao tamanho="sm" icone={Copy} onClick={() => void copiar(estado.cadastro.segredo)} data-2fa-copiar>
                Copiar
              </Botao>
            </div>
            <span className="text-[12px] text-texto-3">Dica: leia o mesmo QR também num 2º aparelho seu, de reserva.</span>
          </div>
          <div className="flex flex-col gap-3 rounded-2xl border border-linha bg-superficie-3 p-3.5">
            <b className="text-[13.5px] text-texto">2. Digite os 6 números que aparecem.</b>
            <CampoCodigo
              valor={codigo}
              aoMudar={(v) => {
                setCodigo(v);
                if (v) setErro(null);
              }}
              aoCompletar={(v) => void confirmarCodigo(v)}
              desligado={ocupado}
              invalido={erro === "errado"}
            />
            {erro && erro !== "sem_fator" && <MensagemForm data-2fa-erro={erro}>{TEXTO_ERRO_CODIGO[erro]}</MensagemForm>}
            <div className="flex flex-wrap gap-2">
              <Botao variante="w" icone={Check} disabled={ocupado || !codigoValido(codigo)} onClick={() => void confirmarCodigo()} data-2fa-confirmar>
                {ocupado ? "Conferindo…" : "Ligar a verificação"}
              </Botao>
              <Botao disabled={ocupado} onClick={() => setEstado({ tipo: "desligada" })} data-2fa-cancelar>
                Cancelar
              </Botao>
            </div>
          </div>
        </div>
      )}

      {estado.tipo === "ligada" && (
        <div className="flex flex-col gap-2" data-2fa-ligada>
          {estado.agora && (
            <MensagemForm tom="ok" data-2fa-pronto>
              Pronto. A verificação está ligada. As outras sessões abertas desta conta foram encerradas.
            </MensagemForm>
          )}
          <p className="text-[12.5px] text-texto-3">Para tirar ou trocar de celular, fale com o suporte.</p>
        </div>
      )}
    </Cartao>
  );
}
