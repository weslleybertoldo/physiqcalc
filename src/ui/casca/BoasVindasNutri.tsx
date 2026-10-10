import { useState, type ReactNode } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Capacitor } from "@capacitor/core";
import type { LucideIcon } from "lucide-react";
import { ArrowRight, Download, KeyRound, Mail, Users, X } from "lucide-react";
import { toast } from "sonner";
import { LogoGoogle } from "@/entrada/pecas/BotaoGoogle";
import { useIsMobile } from "@/hooks/use-mobile";
import { baixarNoNavegador, RELEASES_PAGE, ultimoApk } from "@/lib/apkRelease";
import { fecharBoasVindasNutri } from "@/lib/origemNutri";
import { useSessao } from "@/nucleo/sessao";
import { Botao } from "@/ui/premium/Botao";
import { Marca } from "@/ui/premium/Marca";
import { PainelDeslizante } from "@/ui/premium/Sheet";
import { useUltimoValor } from "@/ui/premium/useUltimoValor";
import { ehPaginaDoPaciente, mostraInstalarApp, useVeioDoNutri } from "./veioDoNutri";

const TITULO = "O PhysiqNutri agora é o Physiq";

/**
 * Physiq W28 (virada — spec §9 e §12, risco 11): quem chega do site antigo do Nutri (o 308 de nutri.physiqcalc.com.br com
 * ?origem=nutri, marcado em src/lib/origemNutri.ts antes do React Router) vê, logado OU deslogado, a folha "O PhysiqNutri agora é
 * o Physiq": os 2 apps viraram um só, os pacientes e os dados continuam aqui, e o login é o mesmo. Deslogado: "Entrar com o mesmo
 * e-mail e senha" e "Entrar com o Google"; logado: "Continuar para o Physiq". No navegador do Android, "Instalar o app Physiq"
 * (dentro do APK, não). Nas páginas do paciente (/f, /d, /c, /p) fica leve — uma faixa no topo com "Saiba mais" — para não
 * atrapalhar quem está respondendo. Fechar apaga a marca: não volta na mesma sessão do navegador. Montada no App.tsx (fora da
 * casca logada), ao lado da FaixaAbrirNoApp.
 */
export function BoasVindasNutri() {
  const veio = useVeioDoNutri();
  const { pathname } = useLocation();
  const [saibaMais, setSaibaMais] = useState(false);
  // hml-18a (H-40, D): a folha fica montada e fecha pelo `aberto` (antes sumia seca ao continuar/fechar)
  const jaVeio = useUltimoValor(veio || null);
  if (!jaVeio) return null;
  if (ehPaginaDoPaciente(pathname) && !saibaMais) return veio ? <FaixaNutri aoSaberMais={() => setSaibaMais(true)} /> : null;
  return <FolhaNutri aberto={veio} />;
}

function FaixaNutri({ aoSaberMais }: { aoSaberMais: () => void }) {
  return (
    <div data-faixa-nutri className="relative z-10 mx-auto w-full max-w-5xl px-4 pt-[max(12px,env(safe-area-inset-top,0px))] sm:px-8">
      <div
        role="region"
        aria-label={TITULO}
        className="flex items-center gap-[11px] rounded-2xl border py-2 pl-2.5 pr-1.5"
        style={{ background: "linear-gradient(90deg, rgba(139,92,246,.18), rgba(139,92,246,.04))", borderColor: "rgba(139,92,246,.32)" }}
      >
        <Marca tamanho={30} soIcone />
        <div className="min-w-0 flex-1">
          <div className="truncate text-[13px] font-semibold text-texto">{TITULO}</div>
          <div className="mt-px truncate text-[12px] font-medium text-texto-2">Pode continuar por aqui normalmente</div>
        </div>
        <button type="button" onClick={aoSaberMais} className="pq-botao pq-botao-g pq-botao-sm flex-none" data-faixa-nutri-saiba-mais>
          Saiba mais
        </button>
        <button
          type="button"
          onClick={fecharBoasVindasNutri}
          aria-label="Fechar"
          title="Fechar"
          className="flex h-8 w-8 flex-none items-center justify-center rounded-[10px] text-texto-3 transition-colors hover:text-texto"
          data-faixa-nutri-fechar
        >
          <X aria-hidden className="h-4 w-4" strokeWidth={2.2} />
        </button>
      </div>
    </div>
  );
}

function Ponto({ icone: Icone, children }: { icone: LucideIcon; children: ReactNode }) {
  return (
    <div className="flex items-start gap-3 rounded-2xl border border-linha bg-superficie px-3.5 py-3">
      <span className="flex h-9 w-9 flex-none items-center justify-center rounded-xl border border-linha bg-superficie text-violeta-3">
        <Icone aria-hidden className="h-[18px] w-[18px]" strokeWidth={1.8} />
      </span>
      <span className="pt-1.5 text-[13.5px] leading-relaxed text-texto">{children}</span>
    </div>
  );
}

function FolhaNutri({ aberto }: { aberto: boolean }) {
  const { pronto, usuario } = useSessao();
  const location = useLocation();
  const navigate = useNavigate();
  const celular = useIsMobile();
  const [buscando, setBuscando] = useState(false);
  if (!pronto) return null; // espera saber se a pessoa está logada (sem piscar os botões errados)
  const logado = Boolean(usuario);
  const instalar = mostraInstalarApp(typeof navigator === "undefined" ? "" : navigator.userAgent, Capacitor.isNativePlatform());

  const entrar = (destino: string) => {
    fecharBoasVindasNutri();
    // leva junto a página que pediu o login (o "de" da entrada), para voltar a ela depois de entrar
    navigate(destino, { state: location.state, replace: location.pathname === destino });
  };
  const baixarApp = async () => {
    setBuscando(true);
    const r = await ultimoApk();
    setBuscando(false);
    if (!r) {
      toast.error("Não achei o APK agora. Abrindo a página de downloads.");
      baixarNoNavegador(RELEASES_PAGE);
      return;
    }
    toast.success(`Baixando Physiq v${r.version} (APK)…`);
    baixarNoNavegador(r.url);
  };

  return (
    <PainelDeslizante
      aberto={aberto}
      lado={celular ? "baixo" : "direita"}
      aoMudar={(v) => {
        if (!v) fecharBoasVindasNutri();
      }}
      titulo={TITULO}
      descricao="O PhysiqNutri e o PhysiqCalc viraram um app só: o Physiq."
      rodape={
        <div className="flex flex-col gap-2" data-boas-vindas-nutri-acoes>
          {logado ? (
            <Botao variante="w" icone={ArrowRight} className="w-full" onClick={fecharBoasVindasNutri} data-nutri-continuar-physiq>
              Continuar para o Physiq
            </Botao>
          ) : (
            <>
              <Botao variante="w" icone={Mail} className="w-full" onClick={() => entrar("/entrar/email")} data-nutri-entrar-email>
                Entrar com o mesmo e-mail e senha
              </Botao>
              <Botao className="w-full" onClick={() => entrar("/entrar")} data-nutri-entrar-google>
                <LogoGoogle />
                Entrar com o Google
              </Botao>
            </>
          )}
          {instalar && (
            <Botao icone={Download} className="w-full" onClick={() => void baixarApp()} disabled={buscando} data-nutri-instalar-app>
              {buscando ? "Buscando a versão mais nova…" : "Instalar o app Physiq"}
            </Botao>
          )}
          {!logado && (
            <Botao className="w-full" onClick={fecharBoasVindasNutri} data-nutri-continuar>
              Continuar
            </Botao>
          )}
        </div>
      }
    >
      <div data-boas-vindas-nutri={logado ? "logado" : "deslogado"} className="flex flex-col gap-3 pt-2">
        <div className="flex justify-center py-2">
          <Marca tamanho={44} />
        </div>
        <Ponto icone={Users}>Seus pacientes, planos, agenda e dados continuam aqui.</Ponto>
        <Ponto icone={KeyRound}>
          {logado
            ? "Sua conta é a mesma: o mesmo e-mail e senha (ou o Google que você já usava)."
            : "Entre com o mesmo e-mail e senha (ou o Google que você já usava)."}
        </Ponto>
      </div>
    </PainelDeslizante>
  );
}
