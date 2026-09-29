import { useId, type ReactNode, type SelectHTMLAttributes } from "react";
import { Check } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { CabecalhoCartao, Cartao } from "@/ui/premium/Cartao";

/**
 * Peças de formulário das Configurações (W5) no padrão da tela 8: cartão com cabeçalho (`.bh`), rótulo pequeno, caixa de
 * vidro com raio 14 (o Campo da entrada, W3), opções em pílula e a linha de ações embaixo.
 */
export function SecaoForm({
  titulo,
  extra,
  acao,
  descricao,
  brilho,
  children,
  className,
  marca,
}: {
  titulo: ReactNode;
  extra?: ReactNode;
  acao?: ReactNode;
  descricao?: ReactNode;
  brilho?: boolean;
  children: ReactNode;
  className?: string;
  /** vira data-secao (E2E) */
  marca?: string;
}) {
  return (
    <Cartao brilho={brilho} className={cn("p-5", className)} data-secao={marca}>
      <CabecalhoCartao titulo={titulo} extra={extra} acao={acao} className={descricao ? "mb-1" : undefined} />
      {descricao && <p className="mb-4 text-[13px] leading-relaxed text-texto-2">{descricao}</p>}
      {children}
    </Cartao>
  );
}

/** Seletor (UF…) com o mesmo visual do Campo. */
export function CampoSelect({ rotulo, dica, className, children, ...props }: SelectHTMLAttributes<HTMLSelectElement> & { rotulo: string; dica?: ReactNode }) {
  const id = useId();
  return (
    <label htmlFor={props.id ?? id} className="flex flex-col gap-1.5">
      <span className="text-[12.5px] font-semibold text-texto-2">{rotulo}</span>
      <select
        id={props.id ?? id}
        className={cn(
          "h-12 w-full rounded-[14px] border border-linha-2 bg-superficie px-3.5 text-[15px] text-texto outline-none transition-colors",
          "focus:border-violeta/60 focus:bg-superficie-2 disabled:opacity-60 [&>option]:bg-tela [&>option]:text-texto",
          className,
        )}
        {...props}
      >
        {children}
      </select>
      {dica && <span className="text-[12px] text-texto-3">{dica}</span>}
    </label>
  );
}

export interface OpcaoPilula<T extends string> {
  valor: T;
  rotulo: string;
  dica?: string;
  icone?: LucideIcon;
  desligada?: boolean;
  porque?: string | null;
}

/**
 * Opções em pílula (escolha única ou várias): o tipo de perfil do Perfil e os papéis do convite. Desligada = o plano não
 * permite (a dica diz o porquê).
 */
export function OpcoesPilula<T extends string>({
  rotulo,
  opcoes,
  valores,
  aoMudar,
  varias,
  nome,
  colunas = 2,
}: {
  rotulo: string;
  opcoes: OpcaoPilula<T>[];
  valores: T[];
  aoMudar: (v: T[]) => void;
  varias?: boolean;
  nome: string;
  /** 1 = uma embaixo da outra (painel deslizante estreito) */
  colunas?: 1 | 2;
}) {
  const alternar = (v: T) => {
    if (varias) aoMudar(valores.includes(v) ? valores.filter((x) => x !== v) : [...valores, v]);
    else aoMudar([v]);
  };
  return (
    <fieldset className="flex flex-col gap-1.5" data-opcoes={nome}>
      <legend className="mb-1.5 text-[12.5px] font-semibold text-texto-2">{rotulo}</legend>
      <div className={cn("grid gap-2", colunas === 2 && "sm:grid-cols-2")}>
        {opcoes.map((o) => {
          const ativa = valores.includes(o.valor);
          const Icone = o.icone;
          return (
            <button
              key={o.valor}
              type="button"
              role={varias ? "checkbox" : "radio"}
              aria-checked={ativa}
              disabled={o.desligada}
              onClick={() => alternar(o.valor)}
              data-opcao={o.valor}
              data-ativa={ativa || undefined}
              className={cn(
                "flex min-h-[52px] items-center gap-3 rounded-2xl border px-3.5 py-2.5 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-50",
                ativa ? "border-violeta/55 bg-[var(--p-chip-t-fundo)]" : "border-linha bg-superficie hover:bg-superficie-2",
              )}
            >
              {Icone && (
                <span className={cn("flex h-8 w-8 flex-none items-center justify-center rounded-[10px] border border-linha bg-superficie", ativa ? "text-violeta-3" : "text-texto-2")}>
                  <Icone aria-hidden className="h-4 w-4" strokeWidth={1.8} />
                </span>
              )}
              <span className="min-w-0 flex-1">
                <span className="block text-[13.5px] font-semibold text-texto">{o.rotulo}</span>
                {(o.desligada ? o.porque : o.dica) && <span className="block text-[11.5px] text-texto-3">{o.desligada ? o.porque : o.dica}</span>}
              </span>
              <span
                aria-hidden
                className={cn(
                  "flex h-5 w-5 flex-none items-center justify-center rounded-[7px] border",
                  ativa ? "border-transparent bg-[var(--p-botao-w-fundo)] text-[var(--p-botao-w-texto)]" : "border-linha-2",
                )}
              >
                {ativa && <Check className="h-3.5 w-3.5" strokeWidth={3} />}
              </span>
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}

/** Linha "rótulo → valor" de leitura (resumo da conta, acesso). */
export function LinhaInfo({ rotulo, valor, icone: Icone }: { rotulo: string; valor: ReactNode; icone?: LucideIcon }) {
  return (
    <div className="flex min-h-[44px] items-center gap-3 border-t border-linha-3 py-2 first:border-t-0">
      {Icone && (
        <span className="flex h-[30px] w-[30px] flex-none items-center justify-center rounded-[10px] bg-superficie text-suave">
          <Icone aria-hidden className="h-4 w-4" strokeWidth={1.75} />
        </span>
      )}
      <span className="flex-1 text-[13px] text-texto-2">{rotulo}</span>
      <span className="text-right text-[13.5px] font-semibold text-texto">{valor}</span>
    </div>
  );
}
