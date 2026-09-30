import { Link } from "react-router-dom";
import { Check, Dumbbell, Receipt, Salad, Tag, UserMinus } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Avatar } from "@/ui/premium/Avatar";
import { Chip } from "@/ui/premium/Chip";
import { AcoesAluno } from "./AcoesAluno";
import { chipsDosModulos, linhaFina, rotaDoAluno, selosDoAluno, type AlunoLinha, type ListaAlunos } from "./regras";

const ICONE_CHIP: Record<string, LucideIcon> = { treino: Dumbbell, nutricao: Salad, "sem-responsavel": UserMinus, comprovante: Receipt };

/**
 * Linha de um aluno no padrão das listas das telas 6/7 ("Agenda de hoje", "Precisam de atenção"): foto, nome, linha fina
 * embaixo, chips dos módulos com o responsável (TREINO · LUCAS / NUTRIÇÃO · CAMILA), tags e os selos (bloqueado, pago,
 * pendente, comprovante); à direita o menu ⋮. Tocar na linha abre o perfil do aluno (tela 7).
 */
export function LinhaAluno({
  aluno,
  eu,
  aoMudar,
  selecionavel,
  selecionado,
  aoSelecionar,
}: {
  aluno: AlunoLinha;
  eu: ListaAlunos["eu"];
  aoMudar: () => void;
  selecionavel?: boolean;
  selecionado?: boolean;
  aoSelecionar?: (sim: boolean) => void;
}) {
  const chips = chipsDosModulos(aluno);
  const selos = selosDoAluno(aluno);
  const tags = aluno.tags.slice(0, 3);
  const maisTags = aluno.tags.length - tags.length;
  const apagado = !aluno.ativo || aluno.conta_excluida;
  return (
    <div
      data-aluno-linha={aluno.id}
      data-aluno-nome={aluno.nome}
      data-aluno-bloqueado={aluno.bloqueado || undefined}
      className="flex items-center gap-3 border-t border-linha-3 py-3 first:border-t-0"
    >
      {selecionavel && (
        <button
          type="button"
          role="checkbox"
          aria-checked={!!selecionado}
          aria-label={`Selecionar ${aluno.nome}`}
          onClick={() => aoSelecionar?.(!selecionado)}
          data-selecionar-aluno={aluno.id}
          className={cn(
            "flex h-5 w-5 flex-none items-center justify-center rounded-[7px] border",
            selecionado ? "border-transparent bg-[var(--p-botao-w-fundo)] text-[var(--p-botao-w-texto)]" : "border-linha-2",
          )}
        >
          {selecionado && <Check className="h-3.5 w-3.5" strokeWidth={3} />}
        </button>
      )}
      <Link to={rotaDoAluno(aluno)} className="flex min-w-0 flex-1 items-center gap-3" data-abrir-aluno={aluno.id}>
        <Avatar src={aluno.foto_url} nome={aluno.nome} tamanho={40} className={apagado ? "opacity-60" : undefined} />
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-2">
            <b className={cn("truncate text-[14.5px] font-semibold", apagado ? "text-texto-2" : "text-texto")}>{aluno.nome}</b>
            {aluno.sou_eu && <Chip tom="g">VOCÊ</Chip>}
          </div>
          <div className="truncate text-[12.5px] text-texto-3">{linhaFina(aluno)}</div>
          {/* celular: os chips vão embaixo do nome */}
          <div className="mt-1.5 flex flex-wrap gap-1 md:hidden">
            {[...chips, ...selos].map((c) => (
              <Chip key={`m-${c.marca}`} tom={c.tom}>{c.rotulo}</Chip>
            ))}
          </div>
        </div>
      </Link>
      <div className="hidden min-w-0 max-w-[58%] flex-wrap items-center justify-end gap-1.5 md:flex" data-chips-aluno>
        {chips.map((c) => (
          <Chip key={c.marca} tom={c.tom} icone={ICONE_CHIP[c.marca]} data-chip-aluno={c.marca}>{c.rotulo}</Chip>
        ))}
        {tags.map((t) => (
          <Chip key={`tag-${t}`} tom="g" icone={Tag} data-tag-aluno={t}>{t}</Chip>
        ))}
        {maisTags > 0 && <span className="text-[11.5px] text-texto-3">+{maisTags}</span>}
        {selos.map((s) => (
          <Chip key={s.marca} tom={s.tom} icone={ICONE_CHIP[s.marca]} data-selo-aluno={s.marca}>{s.rotulo}</Chip>
        ))}
      </div>
      <AcoesAluno aluno={aluno} eu={eu} aoMudar={aoMudar} />
    </div>
  );
}
