import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Botao } from "@/ui/premium/Botao";
import { detalheConta, ErroMaster, moverAlunos } from "../api";
import { Campo, Janela, SELECT } from "../pecas/ui";
import { ROTULO_PLANO, textoErro } from "../regras";
import type { ListaAlunos } from "../tipos";

/**
 * Mover vários alunos para outra conta (C57 — o "mover alunos" do Calc, agora entre contas): escolhe a conta e quem acompanha cada
 * módulo (membro com o papel). Aluno de profissional leva os dados junto; aluno do app ou pessoa sem conta entra na conta (P7 e o
 * limite da faixa valem; a assinatura do app é cancelada). O Banco do Treino recebe o professor e a conta pelo espelho.
 */
export function MoverAlunosDialog({ aberta, aoMudar, pacientes, usuarios, contas, contaAtual, aoMovido }: {
  aberta: boolean;
  aoMudar: (a: boolean) => void;
  pacientes: string[];
  usuarios: string[];
  contas: ListaAlunos["contas"];
  contaAtual?: string | null;
  aoMovido: (n: number) => void;
}) {
  const destinos = useMemo(() => contas.filter((c) => c.origem !== "app" && c.id !== contaAtual), [contas, contaAtual]);
  const [conta, setConta] = useState("");
  const [personal, setPersonal] = useState("");
  const [nutri, setNutri] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const det = useQuery({ queryKey: ["master-conta", conta], queryFn: () => detalheConta(conta), enabled: aberta && Boolean(conta) });
  const membros = (det.data?.membros ?? []).filter((m) => m.status === "ativo" && m.user_id);
  const mods = det.data?.conta.modulos ?? [];
  const personais = membros.filter((m) => m.papeis.includes("personal"));
  const nutris = membros.filter((m) => m.papeis.includes("nutricionista"));

  useEffect(() => {
    if (aberta) { setConta(""); setPersonal(""); setNutri(""); setErro(null); }
  }, [aberta]);
  useEffect(() => {
    setPersonal(personais[0]?.user_id ?? "");
    setNutri(nutris[0]?.user_id ?? "");
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reinicia quando a conta de destino carrega
  }, [det.data?.conta.id]);

  const total = pacientes.length + usuarios.length;
  async function mover() {
    setErro(null);
    setOcupado(true);
    try {
      const r = await moverAlunos({ pacientes, usuarios, conta_id: conta, personal_id: mods.includes("treino") ? personal || null : null,
        nutricionista_id: mods.includes("nutricao") ? nutri || null : null });
      const falhas = r.erros?.length ?? 0;
      if (r.movidos > 0) toast.success(`${r.movidos} aluno(s) movido(s)${falhas ? ` · ${falhas} não deu (${textoErro(r.erros[0].erro)})` : ""}.`);
      else toast.error(textoErro(r.erros?.[0]?.erro));
      aoMovido(r.movidos);
      if (r.movidos > 0) aoMudar(false);
    } catch (e) {
      setErro(textoErro(e instanceof ErroMaster ? e.codigo : "erro_interno"));
    } finally {
      setOcupado(false);
    }
  }

  return (
    <Janela aberta={aberta} aoMudar={aoMudar} titulo={`Mover ${total} aluno(s)`} data-janela-mover
      descricao="O aluno sai da conta de hoje e entra na escolhida, com o responsável de cada módulo. Os dados dele vão junto."
      rodape={(
        <>
          <Botao tamanho="sm" onClick={() => aoMudar(false)}>Cancelar</Botao>
          <Botao tamanho="sm" variante="w" onClick={() => void mover()} data-mover-confirmar
            disabled={ocupado || !conta || det.isLoading || (!(mods.includes("treino") && personal) && !(mods.includes("nutricao") && nutri))}>
            {ocupado ? "Movendo…" : "Mover"}
          </Botao>
        </>
      )}>
      <Campo rotulo="Conta de destino">
        <select className={SELECT} value={conta} onChange={(e) => setConta(e.target.value)} data-mover-conta>
          <option value="">Escolha a conta</option>
          {destinos.map((c) => <option key={c.id} value={c.id}>{c.nome} · {ROTULO_PLANO[c.plano]}</option>)}
        </select>
      </Campo>
      {conta && mods.includes("treino") && (
        <Campo rotulo="Personal responsável (Treino)" erro={!det.isLoading && personais.length === 0 ? "A conta não tem personal." : undefined}>
          <select className={SELECT} value={personal} onChange={(e) => setPersonal(e.target.value)} data-mover-personal>
            <option value="">Sem personal</option>
            {personais.map((m) => <option key={m.id} value={m.user_id!}>{m.nome ?? m.email}</option>)}
          </select>
        </Campo>
      )}
      {conta && mods.includes("nutricao") && (
        <Campo rotulo="Nutricionista responsável (Nutrição)" erro={!det.isLoading && nutris.length === 0 ? "A conta não tem nutricionista." : undefined}>
          <select className={SELECT} value={nutri} onChange={(e) => setNutri(e.target.value)} data-mover-nutri>
            <option value="">Sem nutricionista</option>
            {nutris.map((m) => <option key={m.id} value={m.user_id!}>{m.nome ?? m.email}</option>)}
          </select>
        </Campo>
      )}
      {erro && <p role="alert" className="text-[13px] font-medium text-rosa-3" data-erro-mover>{erro}</p>}
    </Janela>
  );
}
