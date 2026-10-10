import { useState } from "react";
import { CalendarOff, Dumbbell, ListChecks, Pencil, Plus, Sparkles, Trash2 } from "lucide-react";
import { usePowerSync } from "@powersync/react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { PainelDeslizante } from "@/ui/premium/Sheet";
import { useConfirmar } from "@/ui/premium/useConfirmar";
import type { GrupoTreino } from "../tipos";
import { SheetMeuTreino } from "./SheetMeuTreino";

/**
 * Trocar o treino do dia (a troca que já existe em `tb_treino_dia_override` — vale só para o dia, a semana não muda):
 * dia de descanso, um treino do profissional ou um dos seus; editar/apagar os seus e criar um novo ("Montar o meu").
 * Para quem treina sem profissional, também "Usar um treino pronto" (W7b).
 */
export function SheetAlterarTreino({
  aberto,
  aoMudar,
  userId,
  titulo,
  gruposProfissional,
  gruposPessoais,
  permiteDescanso,
  aoEscolher,
  aoTreinoPronto,
}: {
  aberto: boolean;
  aoMudar: (v: boolean) => void;
  userId: string;
  titulo: string;
  gruposProfissional: GrupoTreino[];
  gruposPessoais: GrupoTreino[];
  permiteDescanso: boolean;
  /** grupo escolhido (null = descanso); `pessoal` = treino do aluno */
  aoEscolher: (grupoId: string | null, pessoal: boolean) => void;
  aoTreinoPronto?: () => void;
}) {
  const db = usePowerSync();
  const confirmar = useConfirmar();
  const [editor, setEditor] = useState<{ id: string; nome: string } | "novo" | null>(null);

  const apagar = async (g: GrupoTreino) => {
    if (!(await confirmar({ titulo: `Apagar o treino "${g.nome}"?`, descricao: "Não dá para desfazer.", rotuloConfirmar: "Apagar", perigo: true }))) return;
    try {
      await db.execute("DELETE FROM tb_grupos_exercicios_usuario WHERE grupo_usuario_id = ? AND user_id = ?", [g.id, userId]);
      await db.execute("DELETE FROM tb_grupos_treino_usuario WHERE id = ? AND user_id = ?", [g.id, userId]);
      toast.success("Treino apagado.");
    } catch (e) {
      console.error("[Treino] apagar treino próprio:", e);
      toast.error("Não deu para apagar o treino. Tente de novo.");
    }
  };

  const escolher = (id: string | null, pessoal: boolean) => {
    aoEscolher(id, pessoal);
    aoMudar(false);
  };

  return (
    <>
      <PainelDeslizante aberto={aberto && !editor} aoMudar={aoMudar} titulo={titulo} descricao="Vale só para este dia — a sua semana não muda.">
        <div className="flex flex-col gap-4 pt-1" data-alterar-treino>
          {permiteDescanso && (
            <button type="button" onClick={() => escolher(null, false)} data-alterar-descanso
              className="flex min-h-[50px] items-center gap-3 rounded-2xl border border-dashed border-rosa/35 px-3.5 text-left hover:bg-rosa/5">
              <CalendarOff aria-hidden className="h-[18px] w-[18px] text-rosa-3" strokeWidth={1.8} />
              <span className="text-[13.5px] font-semibold text-texto">Sem treino neste dia (descanso)</span>
            </button>
          )}

          {gruposProfissional.length > 0 && (
            <Grupo titulo="Treinos do seu profissional">
              {gruposProfissional.map((g) => (
                <Item key={g.id} nome={g.nome} icone={Dumbbell} aoTocar={() => escolher(g.id, false)} marca={g.id} />
              ))}
            </Grupo>
          )}

          <Grupo titulo="Meus treinos">
            {gruposPessoais.length === 0 && <p className="px-1 text-[12.5px] text-texto-3">Você ainda não montou nenhum treino.</p>}
            {gruposPessoais.map((g) => (
              <div key={g.id} className="flex items-center gap-1.5">
                <Item nome={g.nome} icone={ListChecks} aoTocar={() => escolher(g.id, true)} marca={g.id} className="flex-1" />
                <button type="button" onClick={() => setEditor({ id: g.id, nome: g.nome })} aria-label={`Editar ${g.nome}`} className="pq-ibtn" data-editar-meu-treino={g.id}>
                  <Pencil aria-hidden />
                </button>
                <button type="button" onClick={() => void apagar(g)} aria-label={`Apagar ${g.nome}`} className="pq-ibtn text-rosa-3" data-apagar-meu-treino={g.id}>
                  <Trash2 aria-hidden />
                </button>
              </div>
            ))}
            <button type="button" onClick={() => setEditor("novo")} data-montar-o-meu
              className="flex min-h-[48px] items-center justify-center gap-2 rounded-2xl border border-dashed border-violeta/45 text-[13px] font-semibold text-violeta-3 hover:bg-violeta/10">
              <Plus aria-hidden className="h-4 w-4" /> Montar o meu
            </button>
          </Grupo>

          {aoTreinoPronto && (
            <button type="button" onClick={() => { aoMudar(false); aoTreinoPronto(); }} data-usar-treino-pronto
              className="flex min-h-[50px] items-center gap-3 rounded-2xl border border-linha bg-superficie px-3.5 text-left hover:border-linha-2">
              <Sparkles aria-hidden className="h-[18px] w-[18px] text-violeta-3" strokeWidth={1.8} />
              <span className="flex-1">
                <span className="block text-[13.5px] font-semibold text-texto">Usar um treino pronto</span>
                <span className="block text-[12px] text-texto-2">Pelo seu objetivo — ele vira a sua semana</span>
              </span>
            </button>
          )}
        </div>
      </PainelDeslizante>

      <SheetMeuTreino
        aberto={!!editor}
        userId={userId}
        editar={editor && editor !== "novo" ? editor : null}
        aoFechar={(criado) => {
          setEditor(null);
          // treino novo: já vira o treino deste dia
          if (criado) escolher(criado, true);
        }}
      />
    </>
  );
}

function Grupo({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-1.5">
      <div className="pq-eyebrow px-1">{titulo}</div>
      {children}
    </section>
  );
}

function Item({ nome, icone: Icone, aoTocar, marca, className }: { nome: string; icone: typeof Dumbbell; aoTocar: () => void; marca: string; className?: string }) {
  return (
    <button type="button" onClick={aoTocar} data-escolher-treino={marca}
      className={cn("flex min-h-[48px] items-center gap-3 rounded-2xl border border-linha bg-superficie px-3.5 text-left hover:border-violeta/50", className)}>
      <Icone aria-hidden className="h-[17px] w-[17px] flex-none text-violeta-3" strokeWidth={1.8} />
      <span className="min-w-0 flex-1 truncate text-[13.5px] font-semibold text-texto">{nome}</span>
    </button>
  );
}
