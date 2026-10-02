// Physiq W2 — a pílula da TAG da consulta na cor dela (o lugar do chip T/N / TREINO · NUTRI de antes). `inicial` = só a 1ª letra
// (a visão mês, onde não cabe o nome); `adaptavel` = o nome quando o chip tem largura e a inicial quando é estreito (a visão semana
// numa tela menor: o nome do aluno continua cabendo — o chip é o container da consulta de largura). Só o painel do profissional
// mostra: o aluno não vê a tag (D4).
import { cn } from "@/lib/utils";
import { estiloDaTag, inicialDaTag } from "@/agenda/regras";

interface Props {
  tag: { id?: string | null; nome: string; cor: string };
  inicial?: boolean;
  /** o nome só quando o container (o chip, `@container`) tem pelo menos 9rem; senão a inicial */
  adaptavel?: boolean;
  /** "chip" = a pílula das listas (altura do Chip premium); "mini" = a de dentro do evento (calendário) */
  tamanho?: "chip" | "mini";
  className?: string;
}

export default function PilulaTag({ tag, inicial, adaptavel, tamanho = "mini", className }: Props) {
  const nome = tag?.nome ?? "";
  return (
    <span
      className={cn(
        "inline-flex max-w-full items-center truncate border align-middle font-bold leading-none",
        tamanho === "chip" ? "h-[22px] rounded-full px-2 text-[10.5px] font-semibold uppercase tracking-[0.04em]" : "rounded-[4px] px-[3px] py-[1px] text-[9px]",
        className,
      )}
      style={estiloDaTag(tag?.cor ?? "")}
      title={nome}
      data-tag-pilula={tag?.id ?? ""}
      data-tag-nome={nome}
    >
      {inicial ? (
        inicialDaTag(nome)
      ) : adaptavel ? (
        <>
          <span className="@min-[9rem]:hidden" data-tag-inicial>{inicialDaTag(nome)}</span>
          <span className="hidden truncate @min-[9rem]:inline" data-tag-nome-completo>{nome}</span>
        </>
      ) : (
        nome
      )}
    </span>
  );
}
