import { useEffect, useRef, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { Browser } from "@capacitor/browser";
import { ExternalLink, ShieldCheck } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { DB_SCHEMA } from "@/integrations/supabase/client";
import { masterNesteAparelho } from "@/lib/plataforma";
import { useSessao } from "@/nucleo/sessao";
import { siteDoAmbiente } from "@/painel/configuracoes/equipe/regras";
import { Cartao } from "@/ui/premium/Cartao";
import { Marca } from "@/ui/premium/Marca";

/**
 * hml-08 (H-22) — o painel master fica SÓ no site (decisão do dono, 07/10/2026). No app (APK e AAB), a conta master sai DESTE
 * aparelho e vê este cartão. Conta master = o master da situação do principal (senha, Google e o master de teste do staging) ou
 * o papel admin|master do Treino (quando a situação não vem). O logout é LOCAL: o site e os outros aparelhos continuam logados.
 * O aviso fica num estado, para o cartão seguir na tela depois que o login some. No site, passa direto. Molde do StagingGate.
 */
export function MasterSoNoSite({ children }: { children: ReactNode }) {
  const { usuario, situacao, sair } = useSessao();
  const { isMaster } = useAuth();
  const navigate = useNavigate();
  const [aviso, setAviso] = useState(false);
  const saindo = useRef(false);
  const travar = !masterNesteAparelho() && Boolean(usuario) && (Boolean(situacao?.master) || isMaster);

  useEffect(() => {
    if (!travar || saindo.current) return;
    // uma vez por trava: a sessão some quando o sair termina (e a trava com ela)
    saindo.current = true;
    setAviso(true);
    void sair({ escopo: "local" }).finally(() => {
      saindo.current = false;
    });
  }, [travar, sair]);

  if (!aviso && !travar) return <>{children}</>;

  const abrirSite = () => {
    void Browser.open({ url: `${siteDoAmbiente(DB_SCHEMA)}/master` }).catch(() => undefined);
  };
  const entendi = () => {
    setAviso(false);
    navigate("/entrar", { replace: true });
  };

  return (
    <div data-master-so-no-site className="relative isolate flex min-h-screen items-center justify-center px-5 py-8">
      <div aria-hidden className="pq-halo-app pointer-events-none fixed inset-0 -z-10" />
      <Cartao brilho className="flex w-full max-w-sm flex-col items-center gap-4 px-6 py-8 text-center">
        <Marca tamanho={40} soIcone />
        <span className="flex h-11 w-11 items-center justify-center rounded-2xl border border-linha bg-superficie text-violeta-3">
          <ShieldCheck aria-hidden className="h-5 w-5" strokeWidth={1.8} />
        </span>
        <h1 className="font-body text-[18px] font-semibold normal-case tracking-[-0.02em] text-texto">Conta master: use o site</h1>
        <p className="text-[13.5px] leading-relaxed text-texto-2">
          O painel master fica só no site physiqcalc.com.br (no computador ou no navegador do celular). Esta conta saiu do app neste
          aparelho. Para usar o app, entre com uma conta de aluno ou de profissional.
        </p>
        <div className="flex w-full flex-col gap-2.5 pt-1">
          <button type="button" onClick={abrirSite} data-master-so-no-site-abrir className="pq-botao pq-botao-w h-[52px] w-full rounded-2xl text-[15.5px]">
            <ExternalLink aria-hidden />
            Abrir o site
          </button>
          <button type="button" onClick={entendi} data-master-so-no-site-entendi className="pq-botao pq-botao-g h-[48px] w-full rounded-2xl text-[14.5px]">
            Entendi
          </button>
        </div>
      </Cartao>
    </div>
  );
}
