import type { ReactNode } from "react";
import { FlaskConical, WifiOff } from "lucide-react";
import { DB_SCHEMA } from "@/integrations/supabase/client";
import { Marca } from "@/ui/premium/Marca";
import { useOnline } from "@/ui/premium/useOnline";

// constante do build (vite define); nos testes pode não existir
const APP_VERSION = typeof __APP_VERSION__ === "string" ? __APP_VERSION__ : "";

/**
 * Moldura das telas de entrada (W3) no padrão da tela 1: fundo com o halo violeta/verde, a marca no topo, o conteúdo
 * numa coluna de celular (390 px) e, embaixo, a versão e os termos. Mostra sozinha o aviso de sem internet e o de
 * ambiente de teste (P26). hml-12 (H-30): no staging, o rodapé fica só com os links (o aceite com registro é a porta).
 */
export function MolduraEntrada({ children, rodape = true, voltar }: { children: ReactNode; rodape?: boolean; voltar?: ReactNode }) {
  const online = useOnline();
  return (
    <div data-entrada className="relative isolate flex min-h-screen flex-col text-texto">
      <div aria-hidden className="pq-halo-app pointer-events-none fixed inset-0 -z-10" />
      <div className="mx-auto flex w-full max-w-[440px] flex-1 flex-col px-5 pb-8 pt-[max(22px,env(safe-area-inset-top,0px))]">
        <header className="flex h-11 items-center justify-between">
          <Marca tamanho={34} />
          {voltar}
        </header>
        <main className="flex flex-1 flex-col justify-center gap-5 py-8">
          {!online && (
            <div role="status" data-entrada-offline className="flex items-start gap-3 rounded-2xl border border-ambar/30 px-3.5 py-3 text-[13px] text-texto"
              style={{ background: "linear-gradient(90deg, var(--p-chip-a-fundo), transparent)" }}>
              <WifiOff aria-hidden className="mt-0.5 h-[18px] w-[18px] flex-none text-ambar-3" strokeWidth={1.9} />
              <span>Conecte-se à internet para entrar pela primeira vez. Depois disso o seu treino abre mesmo sem conexão.</span>
            </div>
          )}
          {DB_SCHEMA === "staging" && (
            <div data-entrada-staging className="flex items-center gap-2.5 rounded-2xl border border-linha px-3.5 py-2.5 text-[12.5px] text-texto-2">
              <FlaskConical aria-hidden className="h-4 w-4 flex-none text-ambar-3" strokeWidth={1.9} />
              Ambiente de teste — só contas de teste entram.
            </div>
          )}
          {children}
        </main>
        {rodape && (
          <footer className="flex flex-col items-center gap-1.5 text-center text-[11.5px] leading-relaxed text-texto-3">
            {/* hml-12 (H-30): o aceite é a porta depois do login (src/publico/legal/aceite), não o rodapé — SÓ no build de staging até a virada */}
            {import.meta.env.VITE_DB_SCHEMA === "staging" ? (
              <p data-rodape-aceite>
                <a href="/termos" target="_blank" rel="noopener noreferrer" className="font-medium text-violeta-3 hover:underline">Termos de Uso</a>
                {" · "}
                <a href="/privacidade" target="_blank" rel="noopener noreferrer" className="font-medium text-violeta-3 hover:underline">Política de Privacidade</a>
              </p>
            ) : (
              <p>
                Ao continuar você aceita a{" "}
                <a href="/privacidade" target="_blank" rel="noopener noreferrer" className="font-medium text-violeta-3 hover:underline">Política de Privacidade</a>{" "}
                e os <a href="/termos" target="_blank" rel="noopener noreferrer" className="font-medium text-violeta-3 hover:underline">termos de uso</a>.
              </p>
            )}
            <p className="text-texto-4">Physiq {APP_VERSION}</p>
          </footer>
        )}
      </div>
    </div>
  );
}

/** Título das telas de entrada (o "Bom dia, Rafael" da tela 1: pequeno em cima, grande embaixo). */
export function TituloEntrada({ sobre, titulo, texto }: { sobre?: ReactNode; titulo: ReactNode; texto?: ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      {sobre && <span className="text-[14px] font-medium text-texto-2">{sobre}</span>}
      <h1 className="font-body text-[30px] font-bold normal-case leading-[1.1] tracking-[-0.035em] text-texto">{titulo}</h1>
      {texto && <p className="mt-1 text-[14.5px] leading-relaxed text-texto-2">{texto}</p>}
    </div>
  );
}
