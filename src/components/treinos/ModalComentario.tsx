import React, { useState, useEffect } from "react";
import { usePowerSync } from "@powersync/react";
import { toast } from "sonner";
import { MessageSquare, Trash2 } from "lucide-react";

interface ModalComentarioProps {
  exercicioNome: string;
  exercicioId: string;
  ehPessoal: boolean;
  userId: string;
  onFechar: () => void;
}

async function carregarComentario(
  userId: string,
  exercicioId: string,
  ehPessoal: boolean,
  db?: any
): Promise<string> {
  if (!db) return "";
  const campo = ehPessoal ? "exercicio_usuario_id" : "exercicio_id";
  const rows = await db.getAll(
    `SELECT comentario FROM tb_exercicio_comentarios WHERE user_id = ? AND ${campo} = ?`,
    [userId, exercicioId]
  );
  return (rows[0] as any)?.comentario ?? "";
}

async function salvarComentario(
  userId: string,
  exercicioId: string,
  ehPessoal: boolean,
  comentario: string,
  db: any
) {
  const campo = ehPessoal ? "exercicio_usuario_id" : "exercicio_id";

  try {
    if (!comentario.trim()) {
      await db.execute(
        `DELETE FROM tb_exercicio_comentarios WHERE user_id = ? AND ${campo} = ?`,
        [userId, exercicioId]
      );
      return;
    }

    // Find existing or create new id
    const existing = await db.getAll(
      `SELECT id FROM tb_exercicio_comentarios WHERE user_id = ? AND ${campo} = ?`,
      [userId, exercicioId]
    );
    const id = (existing && existing.length > 0) ? (existing[0] as any).id : crypto.randomUUID();

    const exId = ehPessoal ? null : exercicioId;
    const exUsuarioId = ehPessoal ? exercicioId : null;

    await db.execute(
      `INSERT OR REPLACE INTO tb_exercicio_comentarios (id, user_id, exercicio_id, exercicio_usuario_id, comentario, updated_at, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [id, userId, exId, exUsuarioId, comentario.trim(), new Date().toISOString(), new Date().toISOString()]
    );
  } catch (e) {
    toast.error("Erro ao salvar comentário. Tente novamente.");
    throw e;
  }
}

export { carregarComentario };

const ModalComentario: React.FC<ModalComentarioProps> = ({
  exercicioNome,
  exercicioId,
  ehPessoal,
  userId,
  onFechar,
}) => {
  const db = usePowerSync();
  const [texto, setTexto] = useState("");
  const [textoOriginal, setTextoOriginal] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [salvo, setSalvo] = useState(false);
  const [carregando, setCarregando] = useState(true);

  useEffect(() => {
    carregarComentario(userId, exercicioId, ehPessoal, db).then((c) => {
      setTexto(c);
      setTextoOriginal(c);
      setCarregando(false);
    });
  }, [exercicioId, userId, ehPessoal]);

  async function handleSalvar() {
    if (texto === textoOriginal) {
      onFechar();
      return;
    }
    setSalvando(true);
    await salvarComentario(userId, exercicioId, ehPessoal, texto, db);
    setTextoOriginal(texto);
    setSalvando(false);
    setSalvo(true);
    setTimeout(() => {
      setSalvo(false);
      onFechar();
    }, 1000);
  }

  const temAlteracao = texto !== textoOriginal;

  return (
    <div
      className="fixed inset-0 z-[200] flex items-end justify-center p-4"
      style={{ background: "rgba(0,0,0,.75)" }}
      onClick={(e) => {
        if (e.target === e.currentTarget) handleSalvar();
      }}
    >
      <div className="bg-background border border-border rounded-t-2xl rounded-b-xl p-6 w-full max-w-[480px]">
        {/* Header */}
        <div className="flex justify-between items-center mb-4">
          <div>
            <div className="font-heading font-extrabold text-base text-foreground flex items-center gap-2">
              <MessageSquare size={16} /> Anotações
            </div>
            <div className="text-xs text-primary font-body mt-0.5">
              {exercicioNome}
            </div>
          </div>
          <button
            onClick={handleSalvar}
            className="text-muted-foreground hover:text-foreground text-lg p-1 transition-colors"
          >
            ✕
          </button>
        </div>

        {/* Textarea */}
        {carregando ? (
          <div className="text-muted-foreground font-body py-5 text-center">
            Carregando...
          </div>
        ) : (
          <textarea
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            placeholder="Ex: Manter cotovelos fechados, aumentar peso na próxima semana, sentiu dor no ombro..."
            autoFocus
            rows={5}
            className="w-full bg-card border border-border rounded-[10px] px-3.5 py-3 text-foreground font-body text-sm leading-relaxed resize-y outline-none focus:border-primary transition-colors"
          />
        )}

        {/* Footer */}
        <div className="flex justify-between items-center mt-3">
          <div className="text-[0.7rem] text-muted-foreground font-body">
            {texto.length > 0
              ? `${texto.length} caracteres`
              : "Nenhuma anotação ainda"}
          </div>
          <div className="flex gap-2">
            {texto.length > 0 && texto === textoOriginal && (
              <button
                onClick={async () => {
                  setTexto("");
                  await salvarComentario(userId, exercicioId, ehPessoal, "", db);
                  setTextoOriginal("");
                }}
                className="bg-destructive/10 border border-destructive/20 text-destructive rounded-lg px-3.5 py-2 font-heading font-bold text-xs flex items-center gap-1 hover:bg-destructive/20 transition-colors"
              >
                <Trash2 size={12} /> Apagar
              </button>
            )}
            <button
              onClick={handleSalvar}
              disabled={salvando || !temAlteracao}
              className={`rounded-lg px-5 py-2 font-heading font-extrabold text-sm transition-all ${
                salvo
                  ? "bg-classify-green/20 border border-classify-green text-classify-green"
                  : temAlteracao
                  ? "bg-primary border border-primary text-primary-foreground"
                  : "bg-card border border-border text-muted-foreground cursor-default"
              }`}
            >
              {salvo ? "✓ Salvo!" : salvando ? "Salvando..." : "Salvar"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ModalComentario;
