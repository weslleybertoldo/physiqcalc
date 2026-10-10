import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { CircleAlert, Inbox, RefreshCw, WifiOff } from "lucide-react";
import { cn } from "@/lib/utils";
import { Botao } from "./Botao";
import { Cartao } from "./Cartao";

/** Bloco cinza pulsando (esqueleto) enquanto o dado chega. */
export function Esqueleto({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return <div aria-hidden className={cn("animate-pulse rounded-xl bg-superficie-2", className)} style={style} />;
}

/**
 * hml-18a (H-40, E): o cartão-esqueleto no lugar de um cartão que ainda carrega — o mesmo tamanho (passe a altura/colunas do
 * cartão de verdade em `className`), para nada aparecer do nada nem empurrar a tela (antes: `return null` enquanto carregava).
 */
export function CartaoCarregando({ className, rotulo = "Carregando" }: { className?: string; rotulo?: string }) {
  return (
    <Cartao role="status" aria-busy="true" aria-label={rotulo} data-estado="carregando" className={cn("flex flex-col gap-3 px-[18px] py-4", className)}>
      <Esqueleto className="h-4 w-2/5" />
      <Esqueleto className="min-h-8 w-full flex-1" />
    </Cartao>
  );
}

/** Carregando: cartões-esqueleto no formato da tela (nada de texto "Carregando..." solto). */
export function EstadoCarregando({ linhas = 3, className, rotulo = "Carregando" }: { linhas?: number; className?: string; rotulo?: string }) {
  return (
    <div role="status" aria-busy="true" aria-label={rotulo} data-estado="carregando" className={cn("flex flex-col gap-3", className)}>
      {Array.from({ length: linhas }, (_, i) => (
        <Cartao key={i} className="flex items-center gap-3 p-4">
          <Esqueleto className="h-11 w-11 flex-none rounded-[14px]" />
          <div className="flex flex-1 flex-col gap-2">
            <Esqueleto className="h-3.5 w-2/5" />
            <Esqueleto className="h-3 w-3/5" />
          </div>
        </Cartao>
      ))}
      <span className="sr-only">{rotulo}…</span>
    </div>
  );
}

function Moldura({ icone: Icone, tom, titulo, texto, acao, estado, className }: { icone: LucideIcon; tom: string; titulo: ReactNode; texto?: ReactNode; acao?: ReactNode; estado: string; className?: string }) {
  return (
    <Cartao data-estado={estado} className={cn("flex flex-col items-center gap-3 px-6 py-8 text-center", className)}>
      <span className="flex h-12 w-12 items-center justify-center rounded-2xl border border-linha bg-superficie" style={{ color: tom }}>
        <Icone aria-hidden className="h-[22px] w-[22px]" strokeWidth={1.75} />
      </span>
      <div className="text-[15px] font-semibold tracking-[-0.01em] text-texto">{titulo}</div>
      {texto && <p className="max-w-sm text-[13px] leading-relaxed text-texto-2">{texto}</p>}
      {acao && <div className="mt-1">{acao}</div>}
    </Cartao>
  );
}

/** Vazio: texto + a ação que resolve (ex.: "Adicionar aluno"). */
export function EstadoVazio({ icone = Inbox, titulo, texto, acao, className }: { icone?: LucideIcon; titulo: ReactNode; texto?: ReactNode; acao?: ReactNode; className?: string }) {
  return <Moldura estado="vazio" icone={icone} tom="var(--p-texto-2)" titulo={titulo} texto={texto} acao={acao} className={className} />;
}

/** Erro: mensagem + "Tentar de novo". */
export function EstadoErro({
  titulo = "Não deu para carregar",
  texto = "Confira a internet e tente de novo.",
  aoTentar,
  className,
}: {
  titulo?: ReactNode;
  texto?: ReactNode;
  aoTentar?: () => void;
  className?: string;
}) {
  return (
    <Moldura
      estado="erro"
      icone={CircleAlert}
      tom="var(--p-rosa-3)"
      titulo={titulo}
      texto={texto}
      className={className}
      acao={aoTentar ? <Botao variante="g" tamanho="sm" icone={RefreshCw} onClick={aoTentar}>Tentar de novo</Botao> : undefined}
    />
  );
}

/** Sem internet: o que depende da rede espera ela voltar. */
export function EstadoSemInternet({
  titulo = "Sem conexão",
  texto = "Isto aparece quando a internet voltar.",
  className,
}: {
  titulo?: ReactNode;
  texto?: ReactNode;
  className?: string;
}) {
  return <Moldura estado="sem-internet" icone={WifiOff} tom="var(--p-ambar-3)" titulo={titulo} texto={texto} className={className} />;
}
