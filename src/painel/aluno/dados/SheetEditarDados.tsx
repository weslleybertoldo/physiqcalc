import { useEffect, useMemo, useState } from "react";
import { Check, X } from "lucide-react";
import { toast } from "sonner";
import { useIsMobile } from "@/hooks/use-mobile";
import { Campo, MensagemForm } from "@/entrada/pecas/Campo";
import { Botao } from "@/ui/premium/Botao";
import { Segmentado } from "@/ui/premium/Segmentado";
import { PainelDeslizante } from "@/ui/premium/Sheet";
import { ErroPerfil, salvarDadosAluno, salvarNoTreino } from "./api";
import { cadastroParaTreino, formDoPerfil, formatarCPF, formatarTelefone, GENEROS, hojeSP, mensagemErroPerfil, mudancas, validarForm } from "./regras";
import type { FormDadosAluno, Genero, PerfilAluno, PerfilTreinoAluno } from "./tipos";
import { useAtualizarAluno, useTreinoPronto } from "./usePerfilAluno";

/**
 * "Editar dados" do aluno (C33 + N-27): o cadastro fica no banco principal e vai para o Banco do Treino pelo espelho (nome, sexo
 * e nascimento); altura e peso de quem tem treino gravam lá (o mesmo que o "Dados Gerais" do Configurar aluno antigo) — quem não
 * tem treino tem a altura e o peso da antropometria (aba Avaliação). A folha abre pelo card "Dados do aluno" e pelo ⋯ do cabeçalho.
 */
export function SheetEditarDados({ aberto, aoFechar, perfil, treino, alunoId }: {
  aberto: boolean;
  aoFechar: () => void;
  perfil: PerfilAluno;
  treino: PerfilTreinoAluno | null;
  /** o id da rota (matrícula ou Treino) */
  alunoId: string;
}) {
  const celular = useIsMobile();
  const treinoPronto = useTreinoPronto();
  const atualizar = useAtualizarAluno(alunoId);
  const comTreino = !!perfil.treino_user_id && treinoPronto && !!treino;
  const inicial = useMemo(() => formDoPerfil(perfil, comTreino ? treino : null), [perfil, treino, comTreino]);
  const [f, setF] = useState<FormDadosAluno>(inicial);
  const [erro, setErro] = useState("");
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    if (aberto) {
      setF(inicial);
      setErro("");
    }
  }, [aberto, inicial]);

  const muda = <K extends keyof FormDadosAluno>(k: K, v: FormDadosAluno[K]) => setF((x) => ({ ...x, [k]: v }));

  const salvar = async () => {
    const msg = validarForm(f);
    if (msg) return setErro(msg);
    const { principal: p, treino: t } = mudancas(f, inicial);
    const cadastroMudou = ["nome", "genero", "nascimento"].some((k) => k in p);
    if (!Object.keys(p).length && !Object.keys(t).length) {
      aoFechar();
      return;
    }
    setSalvando(true);
    setErro("");
    try {
      const novo = Object.keys(p).length ? await salvarDadosAluno(alunoId, p) : undefined;
      // Banco do Treino: altura/peso e o cadastro já (o espelho também leva, mas só para quem já entrou no Physiq)
      if (comTreino && (cadastroMudou || Object.keys(t).length)) {
        try {
          await salvarNoTreino(perfil.treino_user_id!, cadastroParaTreino(f, hojeSP()));
        } catch {
          toast.error("O cadastro foi salvo, mas a altura e o peso não chegaram ao treino. Tente de novo.");
        }
      }
      await atualizar(novo);
      toast.success("Dados salvos.");
      aoFechar();
    } catch (e) {
      setErro(mensagemErroPerfil(e instanceof ErroPerfil ? e.codigo : e instanceof Error ? e.message : ""));
    } finally {
      setSalvando(false);
    }
  };

  const generos = [{ valor: "" as const, rotulo: "Não informar" }, ...GENEROS];

  return (
    <PainelDeslizante aberto={aberto} aoMudar={(a) => !a && aoFechar()} lado={celular ? "baixo" : "direita"} titulo="Editar dados"
      descricao={`${perfil.nome} · o cadastro vale no app do aluno e nos PDFs.`}
      rodape={
        <div className="flex gap-2">
          <Botao variante="w" icone={Check} onClick={() => void salvar()} disabled={salvando} data-editar-salvar>
            {salvando ? "Salvando…" : "Salvar"}
          </Botao>
          <Botao icone={X} onClick={aoFechar}>Cancelar</Botao>
        </div>
      }
    >
      <form className="flex flex-col gap-3.5 pt-1" data-editar-dados onSubmit={(e) => { e.preventDefault(); void salvar(); }}>
        <Campo rotulo="Nome" value={f.nome} onChange={(e) => muda("nome", e.target.value)} maxLength={120} autoComplete="off" data-editar-nome />
        <Campo rotulo="Apelido (opcional)" value={f.apelido} onChange={(e) => muda("apelido", e.target.value)} maxLength={40} autoComplete="off" data-editar-apelido />
        <div className="grid grid-cols-2 gap-3">
          <Campo rotulo="Nascimento" type="date" value={f.nascimento} max={hojeSP()} onChange={(e) => muda("nascimento", e.target.value)} data-editar-nascimento />
          <Campo rotulo="CPF (opcional)" inputMode="numeric" value={f.cpf} onChange={(e) => muda("cpf", formatarCPF(e.target.value))} placeholder="000.000.000-00" data-editar-cpf />
        </div>
        <div className="flex flex-col gap-1.5">
          <span className="text-[12.5px] font-semibold text-texto-2">Sexo</span>
          <Segmentado rotulo="Sexo" opcoes={generos} valor={f.genero} aoMudar={(v) => muda("genero", v as "" | Genero)} className="self-start" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Campo rotulo="Telefone (WhatsApp)" inputMode="tel" value={f.telefone} onChange={(e) => muda("telefone", formatarTelefone(e.target.value))} placeholder="(00) 00000-0000" data-editar-telefone />
          <Campo rotulo="E-mail" type="email" value={f.email} onChange={(e) => muda("email", e.target.value)} autoComplete="off" data-editar-email />
        </div>
        <Campo rotulo="Objetivo" value={f.objetivo} onChange={(e) => muda("objetivo", e.target.value)} maxLength={60} placeholder="Ex.: definição, hipertrofia, emagrecer" data-editar-objetivo />
        {comTreino ? (
          <div className="grid grid-cols-2 gap-3">
            <Campo rotulo="Altura (cm)" inputMode="decimal" value={f.altura} onChange={(e) => muda("altura", e.target.value)} placeholder="178" data-editar-altura />
            <Campo rotulo="Peso (kg)" inputMode="decimal" value={f.peso} onChange={(e) => muda("peso", e.target.value)} placeholder="84,2" data-editar-peso />
          </div>
        ) : (
          <p className="text-[12px] leading-relaxed text-texto-3" data-editar-corpo-aviso>
            Altura e peso vêm da última avaliação (aba Avaliação).
          </p>
        )}
        <p className="text-[12px] leading-relaxed text-texto-3">
          O e-mail daqui é o do cadastro. O e-mail do login fica no card Acesso do aluno.
        </p>
        {erro && <MensagemForm data-editar-erro>{erro}</MensagemForm>}
      </form>
    </PainelDeslizante>
  );
}
