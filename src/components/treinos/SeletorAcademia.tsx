import { useState } from "react";
import { usePowerSync, useQuery } from "@powersync/react";
import { Plus, Save, MapPin, Pencil } from "lucide-react";
import { toast } from "sonner";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export interface Academia {
  id: string;
  nome: string;
}

interface Props {
  userId: string;
  academiaAtual: Academia | null;
  // Confirmado "Realmente quer trocar de academia?" → aplica os pesos salvos da nova
  onTrocar: (academia: Academia) => Promise<void>;
  // Confirmado "Certeza que quer salvar os pesos na academia X?" → grava os pesos do dia
  onSalvar: (academia: Academia) => Promise<void>;
  // Academia recém-criada vira a atual SEM aplicar pesos (ainda não tem referência)
  onCriada: (academia: Academia) => void;
  // Treino do dia já concluído → troca de academia bloqueada
  trocaBloqueada?: boolean;
}

const SeletorAcademia = ({ userId, academiaAtual, onTrocar, onSalvar, onCriada, trocaBloqueada }: Props) => {
  const db = usePowerSync();
  const { data: academias } = useQuery<Academia>(
    "SELECT id, nome FROM tb_academias WHERE user_id = ? ORDER BY nome",
    [userId]
  );

  const [menuAberto, setMenuAberto] = useState(false);
  const [adicionando, setAdicionando] = useState(false);
  const [novoNome, setNovoNome] = useState("");
  const [confirmTrocar, setConfirmTrocar] = useState<Academia | null>(null);
  const [confirmSalvar, setConfirmSalvar] = useState(false);
  const [salvando, setSalvando] = useState(false);

  const criarAcademia = async () => {
    const nome = novoNome.trim();
    if (!nome) return;
    if ((academias || []).some((a) => a.nome.toLowerCase() === nome.toLowerCase())) {
      toast.error("Essa academia já existe.");
      return;
    }
    await db.execute(
      "INSERT INTO tb_academias (id, user_id, nome, created_at) VALUES (uuid(), ?, ?, ?)",
      [userId, nome, new Date().toISOString()]
    );
    const created = await db.getAll<{ id: string }>(
      "SELECT id FROM tb_academias WHERE user_id = ? AND nome = ? ORDER BY created_at DESC LIMIT 1",
      [userId, nome]
    );
    const id = created[0].id;
    setNovoNome("");
    setAdicionando(false);
    toast.success(`Academia "${nome}" adicionada!`);
    onCriada({ id, nome });
  };

  const handleSelect = (id: string) => {
    if (!id || id === academiaAtual?.id) return;
    if (trocaBloqueada) {
      toast.error("Treino de hoje já está concluído — desfaça a conclusão pra trocar de academia.");
      return;
    }
    const academia = (academias || []).find((a) => a.id === id);
    if (academia) setConfirmTrocar(academia);
  };

  return (
    <div className="result-card border-muted-foreground/20 mb-6">
      <div className="flex items-center gap-2 flex-wrap">
        <MapPin size={14} className="text-primary shrink-0" />
        <select
          value={academiaAtual?.id || ""}
          onChange={(e) => handleSelect(e.target.value)}
          className="flex-1 min-w-[140px] bg-transparent border-b border-muted-foreground text-foreground font-body text-sm py-1.5 outline-none focus:border-primary"
        >
          <option value="">Selecionar academia...</option>
          {(academias || []).map((a) => (
            <option key={a.id} value={a.id}>{a.nome}</option>
          ))}
        </select>
        <button
          type="button"
          onClick={() => { setMenuAberto((v) => !v); setAdicionando(false); }}
          className={`p-1.5 transition-colors ${menuAberto ? "text-primary" : "text-muted-foreground hover:text-primary"}`}
          title="Opções da academia"
        >
          <Pencil size={14} />
        </button>
      </div>

      {menuAberto && (
        <div className="flex items-center gap-2 flex-wrap mt-3">
          {!adicionando && (
            <button
              type="button"
              onClick={() => setAdicionando(true)}
              className="px-3 py-1.5 border border-muted-foreground/20 rounded text-[10px] font-bold uppercase tracking-wider text-primary hover:border-primary transition-colors whitespace-nowrap"
            >
              <Plus size={11} className="inline mr-1" />Adicionar academia
            </button>
          )}
          <button
            type="button"
            onClick={() => {
              if (!academiaAtual) { toast.error("Selecione uma academia primeiro."); return; }
              setConfirmSalvar(true);
            }}
            className="px-3 py-1.5 bg-primary text-primary-foreground rounded text-[10px] font-bold uppercase tracking-wider whitespace-nowrap"
          >
            <Save size={11} className="inline mr-1" />Salvar treino
          </button>
        </div>
      )}

      {adicionando && (
        <div className="flex gap-2 items-end mt-3">
          <input
            autoFocus
            value={novoNome}
            onChange={(e) => setNovoNome(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && criarAcademia()}
            placeholder="ex: Smartfit"
            className="flex-1 bg-transparent border-b border-primary py-1.5 text-foreground text-sm outline-none"
          />
          <button
            type="button"
            onClick={criarAcademia}
            disabled={!novoNome.trim()}
            className="px-3 py-1.5 bg-primary text-primary-foreground text-[10px] font-bold uppercase rounded disabled:opacity-40"
          >
            Criar
          </button>
          <button
            type="button"
            onClick={() => { setAdicionando(false); setNovoNome(""); }}
            className="px-3 py-1.5 border border-muted-foreground/20 text-muted-foreground text-[10px] font-bold uppercase rounded"
          >
            ✕
          </button>
        </div>
      )}

      {/* Confirmação de troca de academia */}
      <AlertDialog open={!!confirmTrocar} onOpenChange={(o) => !o && setConfirmTrocar(null)}>
        <AlertDialogContent className="bg-background border-muted-foreground/30 max-w-sm">
          <AlertDialogHeader>
            <AlertDialogTitle>Realmente quer trocar de academia?</AlertDialogTitle>
            <AlertDialogDescription>
              Os pesos do treino de hoje vão mudar para os salvos em "{confirmTrocar?.nome}".
              Séries sem peso salvo lá ficam com 0kg.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                const alvo = confirmTrocar;
                setConfirmTrocar(null);
                if (alvo) await onTrocar(alvo);
              }}
            >
              Sim, trocar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Confirmação de salvar pesos */}
      <AlertDialog open={confirmSalvar} onOpenChange={setConfirmSalvar}>
        <AlertDialogContent className="bg-background border-muted-foreground/30 max-w-sm">
          <AlertDialogHeader>
            <AlertDialogTitle>
              Certeza que quer salvar os pesos na academia {academiaAtual?.nome}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Os pesos de todas as séries de hoje ficam guardados para quando você treinar nessa academia.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              disabled={salvando}
              onClick={async () => {
                if (!academiaAtual) return;
                setSalvando(true);
                try { await onSalvar(academiaAtual); } finally {
                  setSalvando(false);
                  setConfirmSalvar(false);
                }
              }}
            >
              Sim, salvar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default SeletorAcademia;
