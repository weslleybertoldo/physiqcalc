// Physiq W20 — o pacote de consultas do aluno (pedido dele: "ex.: 6 — o usuário terá liberado 6 consultas no modelo 1 por mês; se
// perder a daquele mês, perde aquela consulta e só terá 5"). É de um profissional responsável pelo aluno (personal ou nutri); quem
// define: o próprio profissional ou o dono da conta. 0 = sem pacote. O app do aluno mostra quantas restam e deixa marcar a do mês.
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { BTN_PRI, BTN_SEC, Campo, DESCRICAO_JANELA, INPUT, JANELA, SELECT, TITULO_JANELA } from "@/nutricao/editor/ui/estilos";
import { hojeSP, periodoDoPacote, somarMeses, type PacoteSituacao } from "@/agenda/regras";
import { definirPacote } from "./dados";

export interface ResponsavelPacote {
  id: string;
  nome: string;
  papel: "personal" | "nutricionista";
}

interface Props {
  open: boolean;
  onOpenChange: (aberto: boolean) => void;
  alunoId: string;
  aluno: string;
  responsaveis: ResponsavelPacote[];
  /** o responsável sugerido (você, quando é) */
  inicial: string | null;
  pacotes: PacoteSituacao[];
  onSalvo: () => void;
}

export default function PacoteDialog({ open, onOpenChange, alunoId, aluno, responsaveis, inicial, pacotes, onSalvo }: Props) {
  const [prof, setProf] = useState<string>("");
  const [total, setTotal] = useState<string>("6");
  const [mes, setMes] = useState<string>(hojeSP().slice(0, 7));
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    if (!open) return;
    const id = inicial && responsaveis.some((r) => r.id === inicial) ? inicial : responsaveis[0]?.id ?? "";
    setProf(id);
  }, [open, inicial, responsaveis]);

  useEffect(() => {
    if (!open) return;
    const atual = pacotes.find((p) => p.profissional_id === prof);
    setTotal(atual ? String(atual.total) : "6");
    setMes(atual ? atual.mes_inicio.slice(0, 7) : hojeSP().slice(0, 7));
  }, [open, prof, pacotes]);

  const atual = pacotes.find((p) => p.profissional_id === prof) ?? null;
  const n = Number(total);
  const valido = /^\d{4}-\d{2}$/.test(mes) && Number.isInteger(n) && n >= 0 && n <= 60;

  const salvar = async () => {
    if (!prof || !valido) return;
    setSalvando(true);
    try {
      await definirPacote(alunoId, prof, n, `${mes}-01`);
      toast.success(n === 0 ? "Pacote encerrado" : "Pacote salvo");
      onSalvo();
      onOpenChange(false);
    } catch (e) {
      const m = e instanceof Error ? e.message : "";
      toast.error(m === "sem_acesso" ? "Só o próprio profissional ou o dono da conta muda este pacote" : m === "nao_responsavel" ? "Esse profissional não é responsável pelo aluno" : "Não foi possível salvar o pacote");
    } finally {
      setSalvando(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={cn(JANELA, "sm:max-w-md")} data-modal-pacote>
        <DialogHeader>
          <DialogTitle className={TITULO_JANELA}>Pacote de consultas</DialogTitle>
          <DialogDescription className={DESCRICAO_JANELA}>
            {aluno}: 1 consulta por mês. A consulta do mês conta como usada se ele fizer, faltar, desistir ou se o mês acabar sem consulta.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4" data-form-pacote>
          {responsaveis.length > 1 && (
            <Campo rotulo="Com quem">
              <select className={SELECT} value={prof} onChange={(e) => setProf(e.target.value)} data-campo-pacote-prof>
                {responsaveis.map((r) => <option key={r.id} value={r.id}>{r.nome} · {r.papel === "personal" ? "personal" : "nutricionista"}</option>)}
              </select>
            </Campo>
          )}
          <div className="grid grid-cols-2 gap-3">
            <Campo rotulo="Consultas" dica="0 = sem pacote">
              <input type="number" min={0} max={60} className={INPUT} value={total} onChange={(e) => setTotal(e.target.value)} data-campo-pacote-total />
            </Campo>
            <Campo rotulo="A partir de">
              <input type="month" className={INPUT} value={mes} onChange={(e) => setMes(e.target.value)} data-campo-pacote-mes />
            </Campo>
          </div>
          {valido && n > 0 && (
            <p className="text-[12.5px] text-texto-2" data-previa-pacote>
              {n} {n === 1 ? "consulta" : "consultas"} · {periodoDoPacote({ mes_inicio: `${mes}-01`, mes_fim: somarMeses(`${mes}-01`, n - 1) })}
            </p>
          )}
          {atual && <p className="text-[12px] text-texto-3">Hoje: {atual.usados} usadas de {atual.total}. Mudar o total ou o início refaz a conta pelos meses.</p>}
          <div className="flex justify-end gap-2 pt-1">
            <button type="button" className={BTN_SEC} onClick={() => onOpenChange(false)}>Cancelar</button>
            <button type="button" className={BTN_PRI} disabled={salvando || !valido || !prof} onClick={() => void salvar()} data-btn-salvar-pacote>{salvando ? "Salvando…" : "Salvar"}</button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
