import { useState, type ReactNode } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { CalendarClock, X } from "lucide-react";
import { ehLoja } from "@/lib/distribuicao";
import { useConta } from "@/nucleo/conta";
import { avisoDoPlano, chaveDoAviso, hojeSP, textoDoAviso } from "@/nucleo/cobranca/regras";
import { recorrenteAtiva, valorMensalDaConta } from "@/nucleo/cobranca/cartao";

function jaFechou(chave: string): boolean {
  try {
    return localStorage.getItem(chave) === "1";
  } catch {
    return false;
  }
}

/**
 * Faixa de aviso do plano no topo do painel (W4, spec 6.2): contas que pagam por Pix/cartão à vista (e o fim do teste) nos dias
 * −7, −2, −1 e 0 do vencimento; o X guarda `aviso-plano:<conta>:<vence_em>:<marco>` no aparelho e a faixa volta no próximo marco.
 * W28 (legado Calc no núcleo): nos dias de tolerância, "Mensalidade de R$ X venceu em DD/MM. Pague até DD/MM para não perder o
 * acesso." (urgente; o X vale só no dia). Quem tem a cobrança automática no cartão não recebe aviso (Nativo OS W30a). Master, conta
 * que ainda estivesse com a cobrança antiga (cobranca_legada — nenhuma depois da virada) e conta do app, não.
 * W1 da loja: na versão da Google Play a faixa só informa (texto neutro do textoDoAviso, sem o valor), sem "Pagar"/"Escolher
 * plano" — o profissional paga pelo site.
 */
export default function FaixaAvisoPlano({ children }: { children: ReactNode }) {
  const { conta, ehDono, ehMaster } = useConta();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const [fechadas, setFechadas] = useState<string[]>([]);
  if (!conta || ehMaster || conta.cobranca_legada || conta.origem === "app") return <>{children}</>;
  const hoje = hojeSP();
  const aviso = avisoDoPlano(conta, hoje, recorrenteAtiva(conta));
  if (!aviso) return <>{children}</>;
  const chave = chaveDoAviso(conta.id, aviso.vence, aviso.marco, hoje);
  if (fechadas.includes(chave) || jaFechou(chave)) return <>{children}</>;
  const fechar = () => {
    try {
      localStorage.setItem(chave, "1");
    } catch {
      /* sem armazenamento: fecha só nesta abertura */
    }
    setFechadas((f) => [...f, chave]);
  };
  const urgente = aviso.marco === "tolerancia" || aviso.dias <= 1;
  const naAbaPlano = pathname.startsWith("/painel/configuracoes/plano");
  return (
    <>
      <div
        role="status"
        data-faixa-aviso-plano={aviso.marco}
        className={`mb-4 flex flex-wrap items-center gap-3 rounded-2xl border px-3.5 py-2.5 text-[13px] text-texto ${urgente ? "border-rosa/35" : "border-ambar/30"}`}
        style={{ background: `linear-gradient(90deg, var(${urgente ? "--p-chip-r-fundo" : "--p-chip-a-fundo"}), transparent)` }}
      >
        <CalendarClock aria-hidden className={`h-[18px] w-[18px] flex-none ${urgente ? "text-rosa-3" : "text-ambar-3"}`} strokeWidth={1.9} />
        <span className="min-w-[200px] flex-1 font-medium">
          {textoDoAviso(aviso, valorMensalDaConta(conta))}
          {!ehDono && ` Fale com ${conta.dono_nome || "o dono da conta"}.`}
        </span>
        {ehDono && !naAbaPlano && !ehLoja && (
          <button type="button" onClick={() => navigate("/painel/configuracoes/plano")} className="pq-botao pq-botao-g pq-botao-sm" data-faixa-aviso-pagar>
            {aviso.teste ? "Escolher plano" : "Pagar"}
          </button>
        )}
        <button type="button" onClick={fechar} aria-label="Fechar o aviso" className="flex h-8 w-8 flex-none items-center justify-center rounded-xl text-texto-3 hover:text-texto" data-faixa-aviso-fechar>
          <X aria-hidden className="h-4 w-4" />
        </button>
      </div>
      {children}
    </>
  );
}
