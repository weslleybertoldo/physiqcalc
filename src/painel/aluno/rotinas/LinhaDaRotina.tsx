// Physiq W-A P6 — a linha de UMA rotina no painel (o card "Rotinas" do Resumo e o "Ver tudo"): hora, nome, detalhe (ou a linha de baixo que
// quem usa passa), o selo de quem criou e — quando pedido — o ✓ que o ALUNO deu (só leitura: o profissional não marca). A de profissional
// desta matrícula (pode_editar) vira um botão que abre a folha da P3; as outras são só texto.
import type { ReactNode } from "react";
import { BellRing, Circle, CircleCheck } from "lucide-react";
import type { RotinaDoProfissional } from "@/aluno-dia/tipos";
import { cn } from "@/lib/utils";
import { Chip } from "@/ui/premium/Chip";
import { TEXTOS, seloDaRotina } from "./regras";

export function LinhaDaRotina({
  rotina: r,
  feita,
  sub,
  aoAbrir,
  extra,
}: {
  rotina: RotinaDoProfissional;
  /** o ✓ do dia (undefined = não mostra) */
  feita?: boolean;
  /** a linha de baixo (o detalhe, os dias…) */
  sub?: string | null;
  /** só nas que este profissional muda (pode_editar) */
  aoAbrir?: () => void;
  extra?: ReactNode;
}) {
  const corpo = (
    <>
      {feita !== undefined &&
        (feita ? (
          <CircleCheck aria-label={TEXTOS.feitaPeloAluno} className="h-[18px] w-[18px] flex-none text-verde-2" strokeWidth={1.9} />
        ) : (
          <Circle aria-label={TEXTOS.naoFeita} className="h-[18px] w-[18px] flex-none text-texto-4" strokeWidth={1.9} />
        ))}
      <span className="w-[42px] flex-none text-[12px] font-semibold tabular-nums text-texto-2">{r.horario ?? "—"}</span>
      <span className="min-w-0 flex-1">
        <span className={cn("flex min-w-0 items-center gap-1.5 text-[13px] font-medium", feita ? "text-texto-3" : "text-texto")}>
          <span className="truncate" data-rotina-painel-nome>{r.nome}</span>
          {r.lembrete && <BellRing aria-label="com lembrete" className="h-3 w-3 flex-none text-texto-3" strokeWidth={1.75} />}
        </span>
        {sub && <span className="block truncate text-[11.5px] text-texto-3">{sub}</span>}
      </span>
      {extra}
      <Chip tom={r.origem === "aluno" ? "c" : "t"} className="flex-none" data-rotina-painel-selo>{seloDaRotina(r)}</Chip>
    </>
  );
  const atributos = {
    "data-rotina-painel": r.id,
    "data-rotina-origem": r.origem,
    "data-rotina-editavel": aoAbrir ? "1" : "0",
    ...(feita !== undefined ? { "data-rotina-feita": feita ? "1" : "0" } : {}),
  };
  return (
    <li className="min-w-0" {...atributos}>
      {aoAbrir ? (
        <button type="button" onClick={aoAbrir} className="flex w-full min-w-0 items-center gap-2.5 rounded-xl py-1 text-left hover:bg-superficie"
          data-rotina-painel-abrir={r.id}>
          {corpo}
        </button>
      ) : (
        <div className="flex min-w-0 items-center gap-2.5 py-1">{corpo}</div>
      )}
    </li>
  );
}
