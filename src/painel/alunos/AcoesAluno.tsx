import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { DropdownMenu } from "radix-ui";
import { Ban, FileDown, LockOpen, MoreVertical, PauseCircle, RotateCcw, TriangleAlert, UserRound, UserX, X } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { generateAdminPDF, type AdminProfile } from "@/lib/generateAdminPDF";
import { useIsMobile } from "@/hooks/use-mobile";
import { MensagemForm } from "@/entrada/pecas/Campo";
import { Botao } from "@/ui/premium/Botao";
import { PainelDeslizante } from "@/ui/premium/Sheet";
import { acaoNoAluno, ErroAlunos, type AcaoAluno } from "./api";
import { acoesDoAluno, mensagemErroAlunos, rotaDoAluno, type AlunoLinha, type ListaAlunos } from "./regras";

type Confirmar = "bloquear" | "desativar" | "remover";

function ItemMenu({ icone: Icone, rotulo, aoEscolher, perigo, marca }: { icone: LucideIcon; rotulo: string; aoEscolher: () => void; perigo?: boolean; marca: string }) {
  return (
    <DropdownMenu.Item
      onSelect={aoEscolher}
      data-acao-aluno={marca}
      className={`flex h-10 cursor-pointer items-center gap-2.5 rounded-[10px] px-2.5 text-[13px] font-medium outline-none data-[highlighted]:bg-superficie-2 ${perigo ? "text-rosa-3" : "text-texto"}`}
    >
      <Icone aria-hidden className="h-4 w-4 flex-none" strokeWidth={1.8} />
      {rotulo}
    </DropdownMenu.Item>
  );
}

/**
 * Menu ⋮ de um aluno na lista (C31 + N-10): Abrir, Gerar PDF, Bloquear acesso (F5: o app fecha de verdade), Desativar/Reativar e
 * Remover da lista. As ações que mudam o acesso pedem confirmação; o servidor confere a regra (dono, responsável ou master) e o
 * limite da faixa (desbloquear e reativar voltam a ocupar vaga).
 */
export function AcoesAluno({ aluno, eu, aoMudar }: { aluno: AlunoLinha; eu: ListaAlunos["eu"]; aoMudar: () => void }) {
  const navigate = useNavigate();
  const pode = acoesDoAluno(aluno, eu);
  const [confirmar, setConfirmar] = useState<Confirmar | null>(null);

  const direta = async (acao: AcaoAluno, ok: string) => {
    try {
      await acaoNoAluno(acao, aluno.id);
      toast.success(ok);
      aoMudar();
    } catch (e) {
      toast.error(mensagemErroAlunos(e instanceof ErroAlunos ? e.codigo : null, e instanceof ErroAlunos ? e.extra : {}));
    }
  };

  const gerarPdf = async () => {
    if (!aluno.treino_user_id) return;
    const { data, error } = await supabase.functions.invoke("admin-get-user", { body: { userId: aluno.treino_user_id } });
    const d = data as { profile?: AdminProfile; avaliacoes?: Parameters<typeof generateAdminPDF>[1] } | null;
    if (error || !d?.profile) {
      toast.error("Não deu para carregar os dados do aluno para o PDF.");
      return;
    }
    generateAdminPDF(d.profile, d.avaliacoes ?? []);
  };

  return (
    <>
      <DropdownMenu.Root>
        <DropdownMenu.Trigger asChild>
          <button type="button" className="pq-ibtn flex-none" style={{ width: 36, height: 36, borderRadius: 12 }} aria-label={`Ações de ${aluno.nome}`} data-menu-aluno={aluno.id}>
            <MoreVertical aria-hidden />
          </button>
        </DropdownMenu.Trigger>
        <DropdownMenu.Portal>
          <DropdownMenu.Content
            align="end"
            sideOffset={6}
            className="z-50 w-[230px] rounded-2xl border border-linha-2 bg-tela p-1.5 text-texto shadow-[0_24px_60px_-20px_rgba(0,0,0,.85)]"
            data-menu-aluno-aberto={aluno.id}
          >
            <ItemMenu icone={UserRound} rotulo="Abrir" marca="abrir" aoEscolher={() => navigate(rotaDoAluno(aluno))} />
            {pode.pdf && <ItemMenu icone={FileDown} rotulo="Gerar PDF" marca="pdf" aoEscolher={() => void gerarPdf()} />}
            {(pode.bloquear || pode.desbloquear || pode.desativar || pode.reativar || pode.remover) && (
              <DropdownMenu.Separator className="my-1 h-px bg-linha" />
            )}
            {pode.bloquear && <ItemMenu icone={Ban} rotulo="Bloquear acesso" marca="bloquear" aoEscolher={() => setConfirmar("bloquear")} />}
            {pode.desbloquear && <ItemMenu icone={LockOpen} rotulo="Desbloquear acesso" marca="desbloquear" aoEscolher={() => void direta("desbloquear", `${aluno.nome} voltou a usar o app.`)} />}
            {pode.desativar && <ItemMenu icone={PauseCircle} rotulo="Desativar" marca="desativar" aoEscolher={() => setConfirmar("desativar")} />}
            {pode.reativar && <ItemMenu icone={RotateCcw} rotulo="Reativar" marca="reativar" aoEscolher={() => void direta("reativar", `${aluno.nome} voltou para os ativos.`)} />}
            {pode.remover && <ItemMenu icone={UserX} rotulo="Remover da lista" marca="remover" perigo aoEscolher={() => setConfirmar("remover")} />}
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>
      <ConfirmarAcao aluno={aluno} eu={eu} acao={confirmar} aoFechar={() => setConfirmar(null)} aoFeito={aoMudar} />
    </>
  );
}

const TEXTOS: Record<Confirmar, { titulo: (n: string) => string; botao: string; icone: LucideIcon; ok: (n: string) => string }> = {
  bloquear: { titulo: (n) => `Bloquear o acesso de ${n}?`, botao: "Bloquear acesso", icone: Ban, ok: (n) => `${n} está com o acesso pausado.` },
  desativar: { titulo: (n) => `Desativar ${n}?`, botao: "Desativar", icone: PauseCircle, ok: (n) => `${n} foi para os desativados.` },
  remover: { titulo: (n) => `Remover ${n} da lista?`, botao: "Remover da lista", icone: UserX, ok: (n) => `${n} saiu da lista.` },
};

function explicacao(acao: Confirmar, a: AlunoLinha, eu: ListaAlunos["eu"]): string {
  if (acao === "bloquear") {
    return a.tem_login
      ? "O app do aluno fecha com \"Acesso pausado pelo seu profissional\" — também sem internet, depois que o app sincronizar. O Perfil continua abrindo para sair, exportar ou excluir os dados. A vaga do plano fica livre; desbloquear devolve o acesso."
      : "O aluno ainda não tem login: quando entrar, o app abre fechado com \"Acesso pausado pelo seu profissional\". A vaga do plano fica livre; desbloquear devolve o acesso.";
  }
  if (acao === "desativar") {
    return "O aluno sai dos ativos e a vaga do plano fica livre. Nada é apagado: você reativa quando quiser (se couber no plano).";
  }
  const divide = !eu.dono && !!a.personal && !!a.nutricionista && a.personal.id !== a.nutricionista.id;
  return divide
    ? "Você deixa de acompanhar este aluno; o outro profissional da equipe continua com ele."
    : "A matrícula sai da lista e fica guardada na Lixeira. A conta e o treino do aluno continuam dele — ele pode voltar pelo seu link.";
}

function ConfirmarAcao({ aluno, eu, acao, aoFechar, aoFeito }: { aluno: AlunoLinha; eu: ListaAlunos["eu"]; acao: Confirmar | null; aoFechar: () => void; aoFeito: () => void }) {
  const celular = useIsMobile();
  const [mensagem, setMensagem] = useState("");
  const [erro, setErro] = useState("");
  const [indo, setIndo] = useState(false);
  useEffect(() => {
    setMensagem("");
    setErro("");
  }, [acao]);
  if (!acao) return null;
  const t = TEXTOS[acao];
  const Icone = t.icone;
  const ir = async () => {
    setIndo(true);
    setErro("");
    try {
      const r = await acaoNoAluno(acao, aluno.id, acao === "bloquear" ? mensagem.trim() || null : null);
      toast.success(r.so_responsavel ? `Você deixou de acompanhar ${aluno.nome}.` : t.ok(aluno.nome));
      aoFechar();
      aoFeito();
    } catch (e) {
      setErro(mensagemErroAlunos(e instanceof ErroAlunos ? e.codigo : null, e instanceof ErroAlunos ? e.extra : {}));
    } finally {
      setIndo(false);
    }
  };
  return (
    <PainelDeslizante aberto aoMudar={(a) => !a && aoFechar()} lado={celular ? "baixo" : "direita"} titulo={t.titulo(aluno.nome)}>
      <div className="flex flex-col gap-4 pt-2" data-confirmar-acao={acao}>
        <div className="flex items-start gap-2.5 rounded-2xl border border-ambar/30 px-3.5 py-3 text-[13px] leading-relaxed text-texto"
          style={{ background: "linear-gradient(90deg, var(--p-chip-a-fundo), transparent)" }}>
          <TriangleAlert aria-hidden className="mt-0.5 h-4 w-4 flex-none text-ambar-3" />
          <span>{explicacao(acao, aluno, eu)}</span>
        </div>
        {acao === "bloquear" && (
          <label className="flex flex-col gap-1.5">
            <span className="text-[12.5px] font-semibold text-texto-2">Mensagem para o aluno (opcional)</span>
            <textarea
              value={mensagem}
              maxLength={300}
              onChange={(e) => setMensagem(e.target.value)}
              placeholder="Ex.: Fale comigo para regularizar a mensalidade."
              className="min-h-[88px] w-full rounded-[14px] border border-linha-2 bg-superficie px-4 py-3 text-[14px] text-texto outline-none placeholder:text-texto-4 focus:border-violeta/60"
              data-bloquear-mensagem
            />
          </label>
        )}
        {erro && <MensagemForm data-acao-erro>{erro}</MensagemForm>}
        <div className="flex gap-2">
          <button type="button" className={`pq-botao ${acao === "remover" ? "pq-botao-g border-rosa/40 text-rosa-3" : "pq-botao-w"}`} onClick={() => void ir()} disabled={indo} data-confirmar-ok>
            <Icone aria-hidden /> {indo ? "Um instante…" : t.botao}
          </button>
          <Botao icone={X} onClick={aoFechar}>Cancelar</Botao>
        </div>
      </div>
    </PainelDeslizante>
  );
}
