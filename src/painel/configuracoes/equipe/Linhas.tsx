import { Crown, Dumbbell, Mail, RotateCw, Salad, UserCog, UserMinus, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Avatar } from "@/ui/premium/Avatar";
import { Botao } from "@/ui/premium/Botao";
import { Chip } from "@/ui/premium/Chip";
import { acoesDoMembro, textoDosPapeis, type ConvitePendente, type Equipe, type MembroEquipe, type PapelModulo } from "./regras";

function dataCurta(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function dataHora(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

export function ChipsPapeis({ papeis, className }: { papeis: readonly string[]; className?: string }) {
  return (
    <span className={cn("flex flex-wrap items-center gap-1.5", className)}>
      {papeis.includes("personal") && <Chip tom="t" icone={Dumbbell}>TREINO</Chip>}
      {papeis.includes("nutricionista") && <Chip tom="n" icone={Salad}>NUTRIÇÃO</Chip>}
    </span>
  );
}

function alunosDoMembro(m: MembroEquipe): string {
  const total = m.alunos_treino + m.alunos_nutricao;
  if (!total) return "Nenhum aluno";
  return total === 1 ? "1 aluno" : `${total} alunos`;
}

/** Linha de um profissional (padrão das listas da tela 7: foto, nome, linha fina embaixo, chips e a ação à direita). */
export function LinhaMembro({
  m,
  equipe,
  aoPapeis,
  aoRemover,
}: {
  m: MembroEquipe;
  equipe: Pick<Equipe, "bloqueio">;
  aoPapeis: (m: MembroEquipe) => void;
  aoRemover: (m: MembroEquipe) => void;
}) {
  const pode = acoesDoMembro(m, equipe);
  return (
    <div data-membro={m.id} data-membro-email={m.email ?? ""} className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-linha-3 py-3.5 first:border-t-0">
      <div className="flex min-w-0 flex-1 basis-[260px] items-center gap-3">
        <Avatar src={m.foto_url} nome={m.nome} tamanho={40} />
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <b className="truncate text-[14px] font-semibold text-texto">{m.nome}</b>
            {m.dono && <Chip tom="a" icone={Crown}>DONO</Chip>}
            {m.eu && <Chip tom="g">VOCÊ</Chip>}
          </div>
          <div className="truncate text-[12px] text-texto-3">
            {textoDosPapeis(m.papeis)} · {m.email}
            {m.desde ? ` · desde ${dataCurta(m.desde)}` : ""}
          </div>
        </div>
      </div>
      <ChipsPapeis papeis={m.papeis} className="sm:w-[196px] sm:flex-none" />
      <span className="text-[12.5px] font-medium text-texto-2 tabular-nums sm:w-[96px] sm:text-right" data-membro-alunos>{alunosDoMembro(m)}</span>
      <div className="flex items-center justify-end gap-1.5 sm:w-[236px] sm:flex-none">
        {pode.papeis && (
          <Botao tamanho="sm" icone={UserCog} onClick={() => aoPapeis(m)} data-membro-papeis={m.id}>Papéis</Botao>
        )}
        {pode.remover && (
          <Botao tamanho="sm" icone={UserMinus} onClick={() => aoRemover(m)} data-membro-remover={m.id}>Remover</Botao>
        )}
      </div>
    </div>
  );
}

/** Convite pendente (aguardando o 1º login com aquele e-mail). */
export function LinhaConvite({
  c,
  ocupado,
  aoReenviar,
  aoCancelar,
  podeMexer,
}: {
  c: ConvitePendente;
  ocupado: boolean;
  aoReenviar: (c: ConvitePendente) => void;
  aoCancelar: (c: ConvitePendente) => void;
  podeMexer: boolean;
}) {
  return (
    <div data-convite={c.id} data-convite-email={c.email} className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-linha-3 py-3.5 first:border-t-0">
      <div className="flex min-w-0 flex-1 basis-[260px] items-center gap-3">
        <span className="flex h-10 w-10 flex-none items-center justify-center rounded-full border border-linha-2 bg-superficie text-texto-2">
          <Mail aria-hidden className="h-[18px] w-[18px]" strokeWidth={1.75} />
        </span>
        <div className="min-w-0">
          <b className="block truncate text-[14px] font-semibold text-texto">{c.email}</b>
          <div className="truncate text-[12px] text-texto-3">
            Enviado {dataHora(c.enviado_em)}
            {c.criado_por_nome ? ` por ${c.criado_por_nome}` : ""} · aceita no 1º login com este e-mail
          </div>
        </div>
      </div>
      <ChipsPapeis papeis={c.papeis as PapelModulo[]} className="sm:w-[196px] sm:flex-none" />
      <span className="sm:flex sm:w-[96px] sm:justify-end"><Chip tom="a">PENDENTE</Chip></span>
      {podeMexer && (
        <div className={cn("flex items-center justify-end gap-1.5 sm:w-[236px] sm:flex-none", ocupado && "pointer-events-none opacity-60")}>
          <Botao tamanho="sm" icone={RotateCw} onClick={() => aoReenviar(c)} data-convite-reenviar={c.id}>Reenviar</Botao>
          <Botao tamanho="sm" icone={X} onClick={() => aoCancelar(c)} data-convite-cancelar={c.id}>Cancelar</Botao>
        </div>
      )}
    </div>
  );
}
