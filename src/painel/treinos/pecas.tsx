import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { MESES } from "@/treino/editor/relatorio";
import { Botao } from "@/ui/premium/Botao";
import { PainelDeslizante } from "@/ui/premium/Sheet";
import { CLASSE_CAMPO } from "./estilo";
import { erroDoNome, nomeLimpo } from "./regras";

export function SeletorMes({ ano, mes, mover, noMesAtual }: { ano: number; mes: number; mover: (d: number) => void; noMesAtual: boolean }) {
  return (
    <div className="flex items-center gap-1" data-seletor-mes={`${ano}-${String(mes).padStart(2, "0")}`}>
      <button type="button" aria-label="Mês anterior" onClick={() => mover(-1)} className="pq-ibtn" style={{ width: 32, height: 32, borderRadius: 10 }} data-mes-anterior>
        <ChevronLeft aria-hidden />
      </button>
      <span className="min-w-[118px] text-center text-[13px] font-semibold text-texto">{MESES[mes - 1]} {ano}</span>
      <button type="button" aria-label="Próximo mês" disabled={noMesAtual} onClick={() => mover(1)} className="pq-ibtn disabled:opacity-30" style={{ width: 32, height: 32, borderRadius: 10 }} data-mes-proximo>
        <ChevronRight aria-hidden />
      </button>
    </div>
  );
}

/** Seletor de aluno (Histórico e Relatório) no visual premium. */
export function SeletorAluno({
  alunos,
  valor,
  aoMudar,
  todos,
  className,
}: {
  alunos: { id: string; nome: string; email?: string }[];
  valor: string;
  aoMudar: (id: string) => void;
  /** texto da opção vazia ("Todos os alunos" ou "Escolha o aluno") */
  todos: string;
  className?: string;
}) {
  return (
    <select value={valor} onChange={(e) => aoMudar(e.target.value)} className={cn(CLASSE_CAMPO, "h-9 w-auto min-w-[200px] max-w-[280px] [color-scheme:dark]", className)} data-seletor-aluno>
      <option value="" className="bg-tela text-texto">{todos}</option>
      {alunos.map((a) => (
        <option key={a.id} value={a.id} className="bg-tela text-texto">{a.nome}</option>
      ))}
    </select>
  );
}

/** Folha para dar (ou trocar) o nome de um treino ou de uma pasta. */
export function FolhaNome({
  aberto,
  aoMudar,
  titulo,
  descricao,
  inicial = "",
  rotuloBotao,
  placeholder,
  aoSalvar,
  extra,
}: {
  aberto: boolean;
  aoMudar: (a: boolean) => void;
  titulo: string;
  descricao?: string;
  inicial?: string;
  rotuloBotao: string;
  placeholder: string;
  aoSalvar: (nome: string) => Promise<void> | void;
  extra?: React.ReactNode;
}) {
  const [nome, setNome] = useState(inicial);
  const [salvando, setSalvando] = useState(false);
  const [tentou, setTentou] = useState(false);
  useEffect(() => {
    if (aberto) {
      setNome(inicial);
      setTentou(false);
    }
  }, [aberto, inicial]);
  const erro = erroDoNome(nome);
  const salvar = async () => {
    setTentou(true);
    if (erro) return;
    setSalvando(true);
    try {
      await aoSalvar(nomeLimpo(nome));
    } finally {
      setSalvando(false);
    }
  };
  return (
    <PainelDeslizante aberto={aberto} aoMudar={aoMudar} lado="direita" titulo={titulo} descricao={descricao}
      rodape={
        <Botao variante="w" onClick={() => void salvar()} disabled={salvando} data-folha-nome-salvar>
          {salvando ? "Salvando…" : rotuloBotao}
        </Botao>
      }>
      <div className="flex flex-col gap-2" data-folha-nome>
        <input
          autoFocus
          value={nome}
          maxLength={80}
          onChange={(e) => setNome(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && void salvar()}
          placeholder={placeholder}
          className={cn(CLASSE_CAMPO, tentou && erro && "border-rosa")}
          data-folha-nome-campo
        />
        {tentou && erro && <span className="text-[12px] text-rosa-3" data-folha-nome-erro>{erro}</span>}
        {extra}
      </div>
    </PainelDeslizante>
  );
}
