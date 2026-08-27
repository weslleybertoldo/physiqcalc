import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { usePowerSync } from "@powersync/react";
import { toast } from "sonner";
import SeletorExerciciosPorGrupo, { type ExercicioSelecionavel } from "./SeletorExerciciosPorGrupo";
import { nomeDoBloco } from "@/lib/gruposMusculares";

export type EscopoTroca = "dia" | "definitiva";

interface Props {
  userId: string;
  /** Exercício que está saindo (o que aparece na tela) */
  exercicioAtual: { id: string; nome: string; emoji: string };
  /**
   * Id do exercício na programação do grupo. Difere de exercicioAtual.id quando o
   * item exibido já é fruto de uma substituição — a troca sempre parte do original.
   */
  origemId: string;
  /** Ids dos exercícios que já estão no treino do dia (bloqueiam a seleção) */
  idsNoTreino: string[];
  grupoId: string;
  grupoNome: string;
  /** Grupo pessoal: a troca definitiva edita o grupo de verdade */
  grupoPessoal: boolean;
  slotIdx: number;
  dateKey: string;
  dateLabel: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onTrocado: () => void;
}

const ModalTrocarExercicio = ({
  userId, exercicioAtual, origemId, idsNoTreino, grupoId, grupoNome, grupoPessoal, slotIdx, dateKey, dateLabel,
  open, onOpenChange, onTrocado,
}: Props) => {
  const db = usePowerSync();
  const [exercicios, setExercicios] = useState<ExercicioSelecionavel[]>([]);
  const [novoId, setNovoId] = useState<string | null>(null);
  const [escopo, setEscopo] = useState<EscopoTroca>("dia");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setNovoId(null);
    setEscopo("dia");
    (async () => {
      const [globais, pessoais] = await Promise.all([
        db.getAll("SELECT id, nome, grupo_muscular, emoji FROM tb_exercicios ORDER BY nome"),
        db.getAll(
          "SELECT id, nome, grupo_muscular, emoji FROM tb_exercicios_usuario WHERE user_id = ? ORDER BY nome",
          [userId]
        ),
      ]);
      const lista = [
        ...((globais as ExercicioSelecionavel[]) || []),
        ...((pessoais as ExercicioSelecionavel[]) || []).map((e) => ({ ...e, isPessoal: true })),
      ].sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
      setExercicios(lista);
    })();
  }, [open, userId, exercicioAtual.id, origemId, db]);

  const novo = useMemo(() => exercicios.find((e) => e.id === novoId) || null, [exercicios, novoId]);

  // Quem já está no treino não pode ser escolhido (inclusive o que está saindo)
  const noTreino = useMemo(() => new Set(idsNoTreino), [idsNoTreino]);
  const contarNoTreino = (exs: ExercicioSelecionavel[]) => exs.filter((e) => noTreino.has(e.id)).length;

  const renderItem = (ex: ExercicioSelecionavel, { mostrarGrupo }: { mostrarGrupo: boolean }) => {
    const jaNoTreino = noTreino.has(ex.id);
    const saindo = ex.id === exercicioAtual.id;
    return (
      <label
        key={ex.id}
        className={`flex items-center gap-2 py-1.5 ${jaNoTreino ? "cursor-not-allowed opacity-60" : "cursor-pointer"}`}
        data-trocar-opcao={ex.id}
        data-no-treino={jaNoTreino ? "1" : undefined}
        title={jaNoTreino ? (saindo ? "Exercício que está saindo" : "Já está neste treino") : undefined}
      >
        <input
          type={jaNoTreino ? "checkbox" : "radio"}
          name={jaNoTreino ? undefined : "novo-exercicio"}
          checked={jaNoTreino || novoId === ex.id}
          disabled={jaNoTreino}
          onChange={() => !jaNoTreino && setNovoId(ex.id)}
          className="accent-primary shrink-0"
        />
        <span className={`text-sm font-body truncate ${jaNoTreino ? "text-muted-foreground" : "text-foreground"}`}>
          {ex.emoji} {ex.nome}
        </span>
        {ex.isPessoal && (
          <span className="text-[9px] uppercase tracking-wider text-primary border border-primary/40 px-1 py-0.5 font-heading shrink-0">meu</span>
        )}
        {saindo && (
          <span className="text-[9px] uppercase tracking-wider text-muted-foreground border border-muted-foreground/40 px-1 py-0.5 font-heading shrink-0">sai</span>
        )}
        {jaNoTreino && !saindo && (
          <span className="text-[9px] uppercase tracking-wider text-muted-foreground border border-muted-foreground/40 px-1 py-0.5 font-heading shrink-0">no treino</span>
        )}
        {mostrarGrupo && (
          <span className="text-[10px] text-muted-foreground font-body ml-auto shrink-0">
            {nomeDoBloco(ex.grupo_muscular)}
          </span>
        )}
      </label>
    );
  };

  const handleSalvar = async () => {
    if (!novo) return;
    // Escolher o exercício original de volta = desfazer a troca
    const desfazendo = novo.id === origemId;
    const textoEscopo = escopo === "dia"
      ? `só em ${dateLabel}`
      : `de forma definitiva${grupoPessoal ? ` no grupo "${grupoNome}"` : ""}`;
    const pergunta = desfazendo
      ? `Voltar para "${novo.nome}" (desfazer a troca)?`
      : `Substituir "${exercicioAtual.nome}" por "${novo.nome}" ${textoEscopo}?`;
    if (!window.confirm(pergunta)) return;

    setSaving(true);
    try {
      const now = new Date().toISOString();
      const novoGlobalId = novo.isPessoal ? null : novo.id;
      const novoPessoalId = novo.isPessoal ? novo.id : null;

      if (desfazendo) {
        // Remove a substituição: do dia apaga só a da data; definitiva apaga todas do original
        if (escopo === "dia") {
          await db.execute(
            `DELETE FROM exercicio_substituicao_usuario
             WHERE user_id = ? AND grupo_id = ? AND slot_idx = ? AND exercicio_origem_id = ? AND data_treino = ?`,
            [userId, grupoId, slotIdx, origemId, dateKey]
          );
        } else {
          await db.execute(
            `DELETE FROM exercicio_substituicao_usuario
             WHERE user_id = ? AND grupo_id = ? AND exercicio_origem_id = ?`,
            [userId, grupoId, origemId]
          );
        }
        toast.success(`Troca desfeita: ${novo.nome}`);
        setSaving(false);
        onOpenChange(false);
        onTrocado();
        return;
      }

      if (escopo === "definitiva" && grupoPessoal) {
        // Grupo pessoal: troca de verdade no grupo (aparece no "Editar Grupo Pessoal")
        const linhas = await db.getAll(
          `SELECT id FROM tb_grupos_exercicios_usuario
           WHERE user_id = ? AND grupo_usuario_id = ?
             AND (exercicio_id = ? OR exercicio_usuario_id = ?)`,
          [userId, grupoId, origemId, origemId]
        );
        if (((linhas as { id: string }[]) || []).length === 0) {
          throw new Error("exercício não encontrado no grupo");
        }
        // evita o mesmo exercício duas vezes no grupo
        const jaNoGrupo = await db.getAll(
          `SELECT id FROM tb_grupos_exercicios_usuario
           WHERE user_id = ? AND grupo_usuario_id = ?
             AND (exercicio_id = ? OR exercicio_usuario_id = ?)`,
          [userId, grupoId, novo.id, novo.id]
        );
        if (((jaNoGrupo as { id: string }[]) || []).length > 0) {
          toast.error(`"${novo.nome}" já está no grupo ${grupoNome}.`);
          setSaving(false);
          return;
        }
        for (const linha of (linhas as { id: string }[])) {
          await db.execute(
            `UPDATE tb_grupos_exercicios_usuario
             SET exercicio_id = ?, exercicio_usuario_id = ?
             WHERE id = ? AND user_id = ?`,
            [novoGlobalId, novoPessoalId, linha.id, userId]
          );
        }
        // substituições pendentes do exercício antigo neste grupo perdem sentido
        await db.execute(
          `DELETE FROM exercicio_substituicao_usuario
           WHERE user_id = ? AND grupo_id = ? AND exercicio_origem_id = ?`,
          [userId, grupoId, origemId]
        );
      } else {
        // Troca do dia (qualquer grupo) ou definitiva em grupo do treinador:
        // registra a substituição por usuário (o catálogo do treinador não é editável)
        const dataTreino = escopo === "dia" ? dateKey : null;
        if (!dataTreino) {
          // Definitiva vale no grupo inteiro (qualquer slot) e "para os próximos treinos":
          // apaga a definitiva anterior E as trocas/remoções DO DIA de hoje em diante desse
          // exercício — a do dia tem prioridade na leitura e escondia a definitiva recém-feita
          // (o app seguia mostrando a troca de hoje). Dias passados ficam como foram treinados.
          // Espelha a remoção definitiva (ModalRemoverExercicio).
          await db.execute(
            `DELETE FROM exercicio_substituicao_usuario
             WHERE user_id = ? AND grupo_id = ? AND exercicio_origem_id = ?
               AND (data_treino IS NULL OR data_treino >= ?)`,
            [userId, grupoId, origemId, dateKey]
          );
        }
        const existentes = dataTreino
          ? await db.getAll(
              `SELECT id FROM exercicio_substituicao_usuario
               WHERE user_id = ? AND grupo_id = ? AND slot_idx = ? AND exercicio_origem_id = ?
                 AND data_treino = ?`,
              [userId, grupoId, slotIdx, origemId, dataTreino]
            )
          : [];
        const existente = ((existentes as { id: string }[]) || [])[0];
        if (existente) {
          await db.execute(
            `UPDATE exercicio_substituicao_usuario
             SET exercicio_novo_id = ?, exercicio_novo_usuario_id = ?, updated_at = ?
             WHERE id = ? AND user_id = ?`,
            [novoGlobalId, novoPessoalId, now, existente.id, userId]
          );
        } else {
          await db.execute(
            `INSERT INTO exercicio_substituicao_usuario
               (id, user_id, grupo_id, slot_idx, exercicio_origem_id, exercicio_novo_id, exercicio_novo_usuario_id, data_treino, created_at, updated_at)
             VALUES (uuid(), ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [userId, grupoId, slotIdx, origemId, novoGlobalId, novoPessoalId, dataTreino, now, now]
          );
        }
      }

      toast.success(
        escopo === "dia"
          ? `Trocado só hoje: ${novo.nome}`
          : `Trocado definitivamente: ${novo.nome}`
      );
      setSaving(false);
      onOpenChange(false);
      onTrocado();
    } catch (e) {
      console.error("[TrocarExercicio] Erro ao salvar troca:", e);
      toast.error("Erro ao trocar o exercício. Tente novamente.");
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-background border-muted-foreground/30 max-w-md max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-heading text-foreground">🔄 Trocar exercício</DialogTitle>
        </DialogHeader>

        <p className="text-xs font-body text-muted-foreground mb-3">
          Sai <span className="text-foreground">{exercicioAtual.emoji} {exercicioAtual.nome}</span>
          {novo && <> · entra <span className="text-primary">{novo.emoji} {novo.nome}</span></>}
        </p>


        {/* Escopo da troca */}
        <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-heading mb-1.5">
          Alteração do dia ou definitiva?
        </p>
        <div className="grid grid-cols-2 gap-2 mb-1">
          <button
            type="button"
            onClick={() => setEscopo("dia")}
            className={`border p-2 text-left transition-colors ${escopo === "dia" ? "border-primary bg-primary/10" : "border-muted-foreground/30 hover:border-primary/60"}`}
          >
            <span className="block text-xs font-heading text-foreground">Só neste dia</span>
            <span className="block text-[10px] font-body text-muted-foreground">{dateLabel}</span>
          </button>
          <button
            type="button"
            onClick={() => setEscopo("definitiva")}
            className={`border p-2 text-left transition-colors ${escopo === "definitiva" ? "border-primary bg-primary/10" : "border-muted-foreground/30 hover:border-primary/60"}`}
          >
            <span className="block text-xs font-heading text-foreground">Definitiva</span>
            <span className="block text-[10px] font-body text-muted-foreground">
              {grupoPessoal ? `altera o grupo ${grupoNome}` : "vale para os próximos treinos"}
            </span>
          </button>
        </div>
        <p className="text-[10px] font-body text-muted-foreground mb-3">
          {escopo === "dia"
            ? "Vale só para este dia — a programação do grupo fica como está."
            : grupoPessoal
              ? "O exercício sai do grupo e o novo entra no lugar (igual editar o grupo)."
              : "Grupo do treinador: a troca vira uma substituição sua, sem alterar o grupo dele."}
        </p>

        <SeletorExerciciosPorGrupo
          exercicios={exercicios}
          renderItem={renderItem}
          contarSelecionados={contarNoTreino}
          labelContagem={(sel, total) => `${sel} de ${total} já no treino`}
          labelBadge={(sel) => `· ${sel} no treino`}
          resetKey={`${open}-${exercicioAtual.id}`}
        />

        <button
          type="button"
          onClick={handleSalvar}
          disabled={saving || !novo}
          className="w-full py-3 bg-primary text-primary-foreground font-heading text-xs uppercase tracking-widest hover:bg-primary/90 disabled:opacity-50 transition-colors"
        >
          {saving
            ? "Salvando..."
            : novo
              ? novo.id === origemId
                ? `Salvar — voltar para ${novo.nome}`
                : `Salvar troca por ${novo.nome}`
              : "Escolha o novo exercício"}
        </button>
      </DialogContent>
    </Dialog>
  );
};

export default ModalTrocarExercicio;
