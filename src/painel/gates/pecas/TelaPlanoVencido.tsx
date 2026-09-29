import { useNavigate } from "react-router-dom";
import { CalendarX2, Dumbbell, Lock, MessageCircle, Salad, ShieldAlert, Smartphone, Wallet } from "lucide-react";
import type { ContaSituacao } from "@/nucleo/situacao";
import { NOME_FAIXA, NOME_PLANO_CARTAO, dataBR, ehFaixa, ehPlano, reais, type MotivoTrava } from "@/nucleo/cobranca/regras";
import { valorMensalDaConta } from "@/nucleo/cobranca/cartao";
import { Cartao } from "@/ui/premium/Cartao";
import { Chip } from "@/ui/premium/Chip";
import { KpiCompacto } from "@/ui/premium/Kpi";

/**
 * Tela de plano vencido no lugar do painel (spec 6.2, 6.5 e 9), no visual das telas 6/7: o dono vai direto para
 * Configurações › Plano (Pagar); os outros membros veem "Fale com <dono>"; conta suspensa = "Fale com o suporte" (sem
 * Pagar). Os alunos continuam usando o app — a tela diz isso.
 */
export function TelaPlanoVencido({ conta, motivo, fim, dono }: { conta: ContaSituacao; motivo: MotivoTrava; fim: string | null; dono: boolean }) {
  const navigate = useNavigate();
  const suspensa = motivo !== "vencida";
  const valor = valorMensalDaConta(conta);
  const venceu = fim ? dataBR(fim, false) : null;
  const titulo = suspensa ? (motivo === "cancelada" ? "Conta cancelada" : "Conta suspensa") : venceu ? `Seu plano venceu em ${venceu}` : "Seu plano venceu";
  const texto = suspensa
    ? "O painel desta conta está pausado. Fale com o suporte do Physiq para voltar a usar."
    : dono
      ? "Pague para voltar ao painel na hora — por Pix, cartão ou cobrança automática. Nada foi apagado."
      : `O painel volta assim que ${conta.dono_nome || "o dono da conta"} pagar o plano. Nada foi apagado.`;
  return (
    <div className="flex min-h-[62vh] items-center justify-center py-8" data-plano-vencido={motivo}>
      <Cartao brilho className="flex w-full max-w-[640px] flex-col gap-5 p-6 sm:p-7">
        <div className="flex items-start gap-4">
          <span className="flex h-12 w-12 flex-none items-center justify-center rounded-2xl border border-linha bg-superficie text-rosa-3">
            {suspensa ? <ShieldAlert aria-hidden className="h-[22px] w-[22px]" strokeWidth={1.8} /> : <Lock aria-hidden className="h-[22px] w-[22px]" strokeWidth={1.8} />}
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-1.5">
              {conta.modulos.includes("treino") && <Chip tom="t" icone={Dumbbell}>TREINO</Chip>}
              {conta.modulos.includes("nutricao") && <Chip tom="n" icone={Salad}>NUTRIÇÃO</Chip>}
              <Chip tom="r">{suspensa ? "SUSPENSA" : "VENCIDA"}</Chip>
            </div>
            <h2 className="mt-2.5 font-body text-[22px] font-bold normal-case leading-tight tracking-[-0.03em] text-texto" data-plano-vencido-titulo>{titulo}</h2>
            <p className="mt-1.5 text-[13.5px] leading-relaxed text-texto-2">{texto}</p>
          </div>
        </div>

        {!suspensa && (
          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
            <KpiCompacto rotulo="Plano" valor={ehPlano(conta.plano) ? NOME_PLANO_CARTAO[conta.plano].replace("Plano ", "") : "—"} tomDetalhe="neutro"
              detalhe={ehFaixa(conta.faixa) ? NOME_FAIXA[conta.faixa] : undefined} />
            <KpiCompacto rotulo="Mensalidade" valor={reais(valor)} tomDetalhe="neutro" detalhe="Pix, cartão ou automático" />
            <KpiCompacto rotulo="Venceu em" valor={venceu ? venceu.slice(0, 5) : "—"} icone={CalendarX2} tomDetalhe="rosa" detalhe="painel travado" />
          </div>
        )}

        <div className="flex items-center gap-2.5 rounded-2xl border border-linha bg-superficie-3 px-3.5 py-3 text-[13px] text-texto-2">
          <Smartphone aria-hidden className="h-4 w-4 flex-none text-verde-2" />
          Seus alunos continuam usando o app normalmente: treinos, dietas e histórico seguem guardados.
        </div>

        <div className="flex flex-wrap gap-2">
          {!suspensa && dono && (
            <button type="button" className="pq-botao pq-botao-w" onClick={() => navigate("/painel/configuracoes/plano")} data-plano-vencido-pagar>
              <Wallet aria-hidden /> Pagar agora
            </button>
          )}
          {!suspensa && !dono && (
            <span className="flex items-center gap-2 text-[13px] font-medium text-texto" data-plano-vencido-fale>
              <MessageCircle aria-hidden className="h-4 w-4 text-violeta-3" /> Fale com {conta.dono_nome || "o dono da conta"}.
            </span>
          )}
          {suspensa && (
            <span className="flex items-center gap-2 text-[13px] font-medium text-texto" data-plano-suspenso-suporte>
              <MessageCircle aria-hidden className="h-4 w-4 text-violeta-3" /> Fale com o suporte do Physiq.
            </span>
          )}
        </div>
      </Cartao>
    </div>
  );
}

