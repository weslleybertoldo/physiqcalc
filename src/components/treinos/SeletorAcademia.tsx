import { useEffect, useMemo, useState } from "react";
import { usePowerSync, useQuery } from "@powersync/react";
import { Check, MapPin, Pencil, Plus, Save, X } from "lucide-react";
import { toast } from "sonner";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";
import { EQUIPAMENTOS, gravarEquipamentos, lerEquipamentos } from "@/treino/equivalencia";
import { Botao } from "@/ui/premium/Botao";

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

/**
 * Academia do treino (C17/C73 — cargas por academia) + os EQUIPAMENTOS dela (W9 — NF11): marcar o que a academia tem faz a
 * troca de exercício mostrar primeiro os equivalentes possíveis ali (o resto vai para o fim, apagado). Opcional: nada marcado =
 * sem filtro. Grava em `tb_academias.equipamentos` (text[] no Postgres; JSON no SQLite do PowerSync) — funciona sem internet.
 */
const SeletorAcademia = ({ userId, academiaAtual, onTrocar, onSalvar, onCriada, trocaBloqueada }: Props) => {
  const db = usePowerSync();
  const { data: academias } = useQuery<Academia & { equipamentos: string | null }>(
    "SELECT id, nome, equipamentos FROM tb_academias WHERE user_id = ? ORDER BY nome",
    [userId]
  );

  const [menuAberto, setMenuAberto] = useState(false);
  const [adicionando, setAdicionando] = useState(false);
  const [novoNome, setNovoNome] = useState("");
  const [confirmTrocar, setConfirmTrocar] = useState<Academia | null>(null);
  const [confirmSalvar, setConfirmSalvar] = useState(false);
  const [salvando, setSalvando] = useState(false);

  // equipamentos da academia atual: espelho local (toques seguidos não se perdem enquanto o SQLite responde)
  const doBanco = useMemo(
    () => lerEquipamentos((academias || []).find((a) => a.id === academiaAtual?.id)?.equipamentos),
    [academias, academiaAtual?.id]
  );
  const [marcados, setMarcados] = useState<string[]>(doBanco);
  const assinatura = doBanco.join(",");
  useEffect(() => {
    setMarcados(assinatura ? assinatura.split(",") : []);
  }, [academiaAtual?.id, assinatura]);

  const gravarMarcados = async (prox: string[]) => {
    if (!academiaAtual) return;
    setMarcados(prox);
    try {
      await db.execute("UPDATE tb_academias SET equipamentos = ? WHERE id = ? AND user_id = ?", [gravarEquipamentos(prox), academiaAtual.id, userId]);
    } catch (e) {
      console.error("[Treino] equipamentos da academia:", e);
      toast.error("Não deu para salvar os equipamentos. Tente de novo.");
    }
  };
  const alternar = (chave: string) => void gravarMarcados(marcados.includes(chave) ? marcados.filter((c) => c !== chave) : [...marcados, chave]);

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
    <div className="flex flex-col gap-4" data-seletor-academia>
      <div className="flex items-center gap-2">
        <span className="flex h-11 min-w-0 flex-1 items-center gap-2 rounded-[14px] border border-linha-2 bg-superficie px-3 focus-within:border-violeta/60">
          <MapPin aria-hidden className="h-4 w-4 flex-none text-violeta-3" />
          <select
            value={academiaAtual?.id || ""}
            onChange={(e) => handleSelect(e.target.value)}
            aria-label="Academia"
            data-academia-select
            className="min-w-0 flex-1 bg-transparent text-[14px] font-medium text-texto outline-none"
          >
            {/* cor explícita: o dropdown nativo não herda o tema e o texto ficava branco no fundo branco */}
            <option value="" className="bg-tela text-texto">Selecionar academia...</option>
            {(academias || []).map((a) => (
              <option key={a.id} value={a.id} className="bg-tela text-texto">{a.nome}</option>
            ))}
          </select>
        </span>
        <button
          type="button"
          onClick={() => { setMenuAberto((v) => !v); setAdicionando(false); }}
          className={cn("pq-ibtn", menuAberto && "border-violeta/50 text-violeta-3")}
          aria-label="Opções da academia"
          title="Opções da academia"
          data-academia-opcoes
        >
          <Pencil aria-hidden />
        </button>
      </div>

      {menuAberto && !adicionando && (
        <div className="flex flex-wrap items-center gap-2">
          <Botao variante="g" tamanho="sm" icone={Plus} onClick={() => setAdicionando(true)} data-academia-adicionar>Adicionar academia</Botao>
          <Botao
            variante="w"
            tamanho="sm"
            icone={Save}
            onClick={() => {
              if (!academiaAtual) { toast.error("Selecione uma academia primeiro."); return; }
              setConfirmSalvar(true);
            }}
            data-academia-salvar-treino
          >
            Salvar treino
          </Botao>
        </div>
      )}

      {adicionando && (
        <div className="flex items-center gap-2">
          <input
            autoFocus
            value={novoNome}
            onChange={(e) => setNovoNome(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && criarAcademia()}
            placeholder="ex: Smartfit"
            aria-label="Nome da academia nova"
            data-academia-nome
            className="h-10 min-w-0 flex-1 rounded-xl border border-linha-2 bg-superficie px-3 text-[14px] text-texto outline-none placeholder:text-texto-4 focus:border-violeta/60"
          />
          <Botao variante="w" tamanho="sm" onClick={() => void criarAcademia()} disabled={!novoNome.trim()} data-academia-criar>Criar</Botao>
          <button type="button" onClick={() => { setAdicionando(false); setNovoNome(""); }} className="pq-ibtn" aria-label="Cancelar">
            <X aria-hidden />
          </button>
        </div>
      )}

      <div className="flex flex-col gap-2.5" data-equipamentos-academia={academiaAtual ? academiaAtual.id : "sem-academia"}>
        <div className="flex items-baseline justify-between gap-2">
          <span className="pq-eyebrow">Equipamentos da academia</span>
          {academiaAtual && marcados.length > 0 && (
            <button type="button" onClick={() => void gravarMarcados([])} className="text-[12px] font-semibold text-texto-3 hover:text-texto" data-equipamentos-limpar>
              Limpar
            </button>
          )}
        </div>
        {academiaAtual ? (
          <>
            <p className="text-[12.5px] leading-snug text-texto-2">
              Marque o que a {academiaAtual.nome} tem: ao trocar um exercício, os equivalentes que dá para fazer nela aparecem primeiro. Sem marcar nada, a troca mostra tudo.
            </p>
            <div className="flex flex-wrap gap-1.5" role="group" aria-label={`Equipamentos da ${academiaAtual.nome}`}>
              {EQUIPAMENTOS.map((e) => {
                const ativo = marcados.includes(e.chave);
                return (
                  <button
                    key={e.chave}
                    type="button"
                    aria-pressed={ativo}
                    onClick={() => alternar(e.chave)}
                    data-equipamento={e.chave}
                    data-equipamento-marcado={ativo ? "1" : "0"}
                    className={cn(
                      "flex h-9 items-center gap-1.5 rounded-full border px-3 text-[12.5px] font-semibold transition-colors",
                      ativo ? "border-violeta/60 bg-violeta/15 text-violeta-3" : "border-linha-2 bg-superficie text-texto-2 hover:text-texto"
                    )}
                  >
                    {ativo && <Check aria-hidden className="h-3.5 w-3.5" strokeWidth={2.6} />}
                    {e.rotulo}
                  </button>
                );
              })}
            </div>
            <p className="text-[11.5px] text-texto-3" data-equipamentos-resumo>
              {marcados.length === 0 ? "Nenhum marcado · a troca mostra tudo" : `${marcados.length} de ${EQUIPAMENTOS.length} marcados`}
            </p>
          </>
        ) : (
          <p className="text-[12.5px] leading-snug text-texto-3">Escolha ou crie a academia para marcar os equipamentos dela.</p>
        )}
      </div>

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
