import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Info, Lock, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { useConta } from "@/nucleo/conta";
import { useSessao } from "@/nucleo/sessao";
import { TopoPagina } from "@/ui/casca/topo";
import { Botao } from "@/ui/premium/Botao";
import { Chip } from "@/ui/premium/Chip";
import { EstadoCarregando, EstadoErro, EstadoVazio } from "@/ui/premium/Estados";
import { SecaoForm } from "./pecas/Form";
import { buscarEquipe, cancelarConviteMembro, convidarMembro, ErroEquipe } from "./equipe/api";
import { DialogoConvidar, DialogoPapeis, DialogoRemover } from "./equipe/Dialogos";
import { LinhaConvite, LinhaMembro } from "./equipe/Linhas";
import { mensagemErroEquipe, type ConvitePendente, type MembroEquipe } from "./equipe/regras";

function Faixa({ tom, icone: Icone, children, marca }: { tom: "a" | "g"; icone: typeof Info; children: React.ReactNode; marca: string }) {
  return (
    <div
      role="status"
      data-faixa-equipe={marca}
      className={`flex items-start gap-3 rounded-2xl border px-3.5 py-3 text-[13px] text-texto ${tom === "a" ? "border-ambar/30" : "border-linha"}`}
      style={{ background: tom === "a" ? "linear-gradient(90deg, var(--p-chip-a-fundo), transparent)" : "var(--p-superficie-3)" }}
    >
      <Icone aria-hidden className={`mt-0.5 h-[18px] w-[18px] flex-none ${tom === "a" ? "text-ambar-3" : "text-texto-2"}`} strokeWidth={1.9} />
      <span className="leading-relaxed">{children}</span>
    </div>
  );
}

/**
 * Configurações › Equipe (W5, spec 4.1 e 4.6 — só o dono): os profissionais da conta (nome, papéis, situação, quantos alunos
 * atende), convidar por e-mail com os papéis que o plano permite, mudar papéis, remover (os alunos dele ficam "sem
 * responsável" ou vão para outro membro) e os convites pendentes (reenviar/cancelar). Lista no padrão da tela 7.
 * W28: as contas legadas convidam igual à conta nova (o aviso "a equipe chega na mudança final" saiu).
 */
export default function Equipe() {
  const { conta } = useConta();
  const { recarregarSituacao } = useSessao();
  const qc = useQueryClient();
  const chave = ["equipe-conta", conta?.id];
  const q = useQuery({ queryKey: chave, queryFn: () => buscarEquipe(conta!.id), enabled: Boolean(conta?.id), staleTime: 15_000, retry: 1 });
  const [convidar, setConvidar] = useState(false);
  const [papeis, setPapeis] = useState<MembroEquipe | null>(null);
  const [remover, setRemover] = useState<MembroEquipe | null>(null);
  const [ocupado, setOcupado] = useState<string | null>(null);

  if (!conta) {
    return <div data-config-aba="equipe" data-estado-aba="vazio"><EstadoVazio titulo="Nenhuma conta ativa" texto="A equipe aparece aqui quando você faz parte de uma conta de profissional." /></div>;
  }
  if (q.isLoading) return <div data-config-aba="equipe" data-estado-aba="carregando"><EstadoCarregando linhas={3} rotulo="Carregando a equipe" /></div>;
  if (q.isError || !q.data) {
    const codigo = q.error instanceof ErroEquipe ? q.error.codigo : null;
    return (
      <div data-config-aba="equipe" data-estado-aba="erro">
        <EstadoErro titulo="Não deu para carregar a equipe" texto={mensagemErroEquipe(codigo)} aoTentar={() => void q.refetch()} />
      </div>
    );
  }
  const equipe = q.data;
  const ativos = equipe.membros.filter((m) => m.status === "ativo");
  const podeConvidar = equipe.bloqueio === null;

  const atualizar = async () => {
    await qc.invalidateQueries({ queryKey: chave });
    await recarregarSituacao(); // "N profissionais" no card da conta
  };

  const reenviar = async (c: ConvitePendente) => {
    setOcupado(c.id);
    try {
      const r = await convidarMembro(equipe.conta.id, c.email, c.papeis);
      toast.success(r.email_enviado ? `Convite reenviado para ${c.email}.` : `Convite valendo, mas o e-mail não saiu agora.`);
      await atualizar();
    } catch (err) {
      toast.error(mensagemErroEquipe(err instanceof ErroEquipe ? err.codigo : null));
    } finally {
      setOcupado(null);
    }
  };

  const cancelar = async (c: ConvitePendente) => {
    setOcupado(c.id);
    try {
      await cancelarConviteMembro(c.id);
      toast.success(`Convite de ${c.email} cancelado.`);
      await atualizar();
    } catch (err) {
      toast.error(mensagemErroEquipe(err instanceof ErroEquipe ? err.codigo : null));
    } finally {
      setOcupado(null);
    }
  };

  return (
    <div data-config-aba="equipe" data-equipe-bloqueio={equipe.bloqueio ?? "nenhum"} className="flex flex-col gap-3.5">
      <TopoPagina
        titulo="Equipe"
        subtitulo={`${equipe.conta.nome} · ${ativos.length} ${ativos.length === 1 ? "profissional" : "profissionais"}`}
        acoes={
          podeConvidar ? (
            <Botao variante="w" icone={UserPlus} onClick={() => setConvidar(true)} data-equipe-convidar>Convidar profissional</Botao>
          ) : undefined
        }
      />
      {equipe.bloqueio === "conta_travada" && (
        <Faixa tom="a" icone={Lock} marca="travada">{mensagemErroEquipe("conta_travada")}</Faixa>
      )}
      {equipe.alunos_sem_responsavel > 0 && (
        <Faixa tom="a" icone={Info} marca="sem-responsavel">
          {equipe.alunos_sem_responsavel === 1
            ? "1 aluno está sem responsável na conta. Ele continua com os dados guardados e volta a ser atendido quando alguém da equipe for o responsável dele."
            : `${equipe.alunos_sem_responsavel} alunos estão sem responsável na conta. Eles continuam com os dados guardados e voltam a ser atendidos quando alguém da equipe for o responsável deles.`}
        </Faixa>
      )}

      <SecaoForm brilho titulo="Profissionais" marca="equipe-membros" extra={<Chip tom="g">{ativos.length}</Chip>}
        acao={podeConvidar ? <button type="button" className="text-[13px] font-semibold text-violeta-3 hover:text-violeta-2" onClick={() => setConvidar(true)} data-equipe-convidar-link>Convidar</button> : undefined}>
        <div data-lista-membros>
          {ativos.map((m) => (
            <LinhaMembro key={m.id} m={m} equipe={equipe} aoPapeis={setPapeis} aoRemover={setRemover} />
          ))}
        </div>
        {ativos.length === 1 && podeConvidar && (
          <p className="mt-2 border-t border-linha-3 pt-3 text-[12.5px] text-texto-3">
            Convide personal trainers e nutricionistas para atender os alunos da conta. Cada um vê só os alunos em que é responsável; você vê todos.
          </p>
        )}
      </SecaoForm>

      <SecaoForm titulo="Convites pendentes" marca="equipe-convites" extra={equipe.convites.length ? <Chip tom="a">{equipe.convites.length}</Chip> : undefined}
        descricao={equipe.convites.length ? undefined : "Nenhum convite esperando resposta."}>
        {equipe.convites.length > 0 && (
          <div data-lista-convites>
            {equipe.convites.map((c) => (
              <LinhaConvite key={c.id} c={c} ocupado={ocupado === c.id} podeMexer={podeConvidar} aoReenviar={(x) => void reenviar(x)} aoCancelar={(x) => void cancelar(x)} />
            ))}
          </div>
        )}
      </SecaoForm>

      <DialogoConvidar aberto={convidar} aoMudar={setConvidar} equipe={equipe} aoConvidar={() => void atualizar()} />
      <DialogoPapeis
        membro={papeis}
        equipe={equipe}
        aoMudar={(a) => !a && setPapeis(null)}
        aoSalvar={(msg) => {
          setPapeis(null);
          toast.success(msg);
          void atualizar();
        }}
      />
      <DialogoRemover
        membro={remover}
        equipe={equipe}
        aoMudar={(a) => !a && setRemover(null)}
        aoRemover={(msg) => {
          setRemover(null);
          toast.success(msg);
          void atualizar();
        }}
      />
    </div>
  );
}
