import { useEffect, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { Building2, Crown, Dumbbell, Gem, Link2, Salad, Users } from "lucide-react";
import { toast } from "sonner";
import { principal } from "@/integrations/principal/client";
import { useConta } from "@/nucleo/conta";
import { useSessao } from "@/nucleo/sessao";
import { NOME_FAIXA, NOME_PLANO } from "@/nucleo/cobranca/regras";
import { Campo, MensagemForm } from "@/entrada/pecas/Campo";
import { TopoPagina } from "@/ui/casca/topo";
import { Botao } from "@/ui/premium/Botao";
import { Chip } from "@/ui/premium/Chip";
import { EstadoVazio } from "@/ui/premium/Estados";
import { KpiCompacto } from "@/ui/premium/Kpi";
import { LinhaInfo, SecaoForm } from "./pecas/Form";
import { ORIGEM_CONTA as ORIGEM, validarNomeConta } from "./pecas/regras";

/**
 * Configurações › Conta (W5, spec 4.6 — só o dono): o nome da conta (aparece no card do topo do menu e nos convites) e o
 * resumo dela. O convite de aluno usa o código de cada profissional, na aba Convite. Formulário no padrão da tela 8.
 */
export default function Conta() {
  const { conta } = useConta();
  const { recarregarSituacao } = useSessao();
  const navigate = useNavigate();
  const [nome, setNome] = useState(conta?.nome ?? "");
  const [erro, setErro] = useState("");
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    setNome(conta?.nome ?? "");
    setErro("");
  }, [conta?.id, conta?.nome]);

  if (!conta) {
    return <div data-config-aba="conta" data-estado-aba="vazio"><EstadoVazio titulo="Nenhuma conta ativa" texto="A conta aparece aqui quando você faz parte de uma conta de profissional." /></div>;
  }

  const salvar = async (e: FormEvent) => {
    e.preventDefault();
    const problema = validarNomeConta(nome);
    if (problema) return setErro(problema);
    if (nome.trim() === conta.nome) return;
    setSalvando(true);
    try {
      const { data, error } = await principal.from("contas").update({ nome: nome.trim() }).eq("id", conta.id).select("id, nome");
      if (error) throw error;
      if (!data?.length) throw new Error("sem permissão");
      await recarregarSituacao();
      toast.success("Nome da conta salvo.");
    } catch (err) {
      console.error("[Conta] salvar:", err);
      setErro("Não foi possível salvar agora. Confira a internet e tente de novo.");
    } finally {
      setSalvando(false);
    }
  };

  const limite = conta.limite_alunos;
  return (
    <div data-config-aba="conta" className="flex flex-col gap-3.5">
      <TopoPagina titulo="Conta" subtitulo={`${conta.nome} · ${ORIGEM[conta.origem] ?? ""}`} />
      <div className="grid gap-3.5 lg:grid-cols-[minmax(0,1.08fr)_minmax(0,1fr)]">
        <SecaoForm brilho titulo="Nome da conta" marca="conta-nome"
          descricao="É o nome que aparece no card do topo do menu, para a equipe e nos e-mails de convite.">
          <form onSubmit={salvar} className="flex flex-col gap-4" data-form-conta>
            <Campo rotulo="Nome" value={nome} onChange={(e) => { setNome(e.target.value); setErro(""); }} maxLength={80} placeholder="Ex.: Consultoria Ferreira" data-conta-nome />
            {erro && <MensagemForm data-conta-erro>{erro}</MensagemForm>}
            <div className="flex flex-wrap items-center gap-2 border-t border-linha pt-4">
              <Botao type="submit" variante="w" disabled={salvando || nome.trim() === conta.nome} data-conta-salvar>{salvando ? "Salvando…" : "Salvar nome"}</Botao>
              <Botao icone={Link2} onClick={() => navigate("/painel/configuracoes/convite")} data-conta-ir-convite>Convite de aluno</Botao>
            </div>
            <p className="text-[12px] text-texto-3">O convite de aluno usa o código de cada profissional, na aba Convite.</p>
          </form>
        </SecaoForm>
        <SecaoForm titulo="Resumo da conta" marca="conta-resumo"
          extra={
            <span className="flex gap-1.5">
              {conta.modulos.includes("treino") && <Chip tom="t" icone={Dumbbell}>TREINO</Chip>}
              {conta.modulos.includes("nutricao") && <Chip tom="n" icone={Salad}>NUTRIÇÃO</Chip>}
            </span>
          }
        >
          <div className="mb-3 flex flex-wrap gap-2.5">
            <KpiCompacto rotulo="Alunos ativos" valor={limite ? `${conta.alunos_ativos} de ${limite}` : conta.alunos_ativos} />
            <KpiCompacto rotulo="Profissionais" valor={conta.profissionais} />
          </div>
          <LinhaInfo icone={Gem} rotulo="Plano" valor={`${NOME_PLANO[conta.plano] ?? conta.plano} · ${NOME_FAIXA[conta.faixa as keyof typeof NOME_FAIXA] ?? conta.faixa}`} />
          <LinhaInfo icone={Building2} rotulo="Origem" valor={ORIGEM[conta.origem] ?? conta.origem} />
          <LinhaInfo icone={Crown} rotulo="Dono" valor={conta.dono_nome ?? "—"} />
          <div className="mt-3 flex flex-wrap gap-2 border-t border-linha pt-4">
            <Botao tamanho="sm" icone={Gem} onClick={() => navigate("/painel/configuracoes/plano")}>Ver o plano</Botao>
            <Botao tamanho="sm" icone={Users} onClick={() => navigate("/painel/configuracoes/equipe")}>Ver a equipe</Botao>
          </div>
        </SecaoForm>
      </div>
    </div>
  );
}
