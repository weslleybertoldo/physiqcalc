import { useEffect, useState, type FormEvent } from "react";
import { CircleCheck, Copy, Dumbbell, Salad, Send, TriangleAlert, UserMinus } from "lucide-react";
import { toast } from "sonner";
import { useIsMobile } from "@/hooks/use-mobile";
import { Campo, MensagemForm } from "@/entrada/pecas/Campo";
import { Botao } from "@/ui/premium/Botao";
import { PainelDeslizante } from "@/ui/premium/Sheet";
import { useUltimoValor } from "@/ui/premium/useUltimoValor";
import { CampoSelect, OpcoesPilula, type OpcaoPilula } from "../pecas/Form";
import { alterarPapeisMembro, convidarMembro, ErroEquipe, removerMembro, type ResultadoConvite } from "./api";
import {
  mensagemErroEquipe,
  papeisOferecidos,
  sucessoresPossiveis,
  textoAlunosAfetados,
  validarEmailConvite,
  type Equipe,
  type MembroEquipe,
  type PapelModulo,
} from "./regras";

const ICONE: Record<PapelModulo, typeof Dumbbell> = { personal: Dumbbell, nutricionista: Salad };

function opcoesDoPlano(doPlano: readonly PapelModulo[]): OpcaoPilula<PapelModulo>[] {
  return papeisOferecidos(doPlano).map((o) => ({
    valor: o.papel,
    rotulo: o.rotulo,
    dica: o.modulo === "treino" ? "Módulo Treino · prescreve e acompanha" : "Módulo Nutrição · dieta e prontuário",
    icone: ICONE[o.papel],
    desligada: !o.disponivel,
    porque: o.porque,
  }));
}

async function copiar(texto: string, aviso: string) {
  try {
    await navigator.clipboard.writeText(texto);
    toast.success(aviso);
  } catch {
    toast.error("Não foi possível copiar. Selecione o texto e copie.");
  }
}

/** Convidar um profissional por e-mail, com os papéis que o plano permite (spec 4.6 e 6.4). */
export function DialogoConvidar({
  aberto,
  aoMudar,
  equipe,
  aoConvidar,
}: {
  aberto: boolean;
  aoMudar: (a: boolean) => void;
  equipe: Equipe;
  aoConvidar: () => void;
}) {
  const celular = useIsMobile();
  const [email, setEmail] = useState("");
  const [papeis, setPapeis] = useState<PapelModulo[]>([]);
  const [erro, setErro] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [feito, setFeito] = useState<ResultadoConvite | null>(null);

  useEffect(() => {
    if (!aberto) return;
    setEmail("");
    setPapeis(equipe.papeis_do_plano.length === 1 ? [...equipe.papeis_do_plano] : []);
    setErro("");
    setFeito(null);
  }, [aberto, equipe.papeis_do_plano]);

  const enviar = async (e: FormEvent) => {
    e.preventDefault();
    const problema = validarEmailConvite(email);
    if (problema) return setErro(problema);
    if (!papeis.length) return setErro(mensagemErroEquipe("papeis_invalidos"));
    setEnviando(true);
    setErro("");
    try {
      const r = await convidarMembro(equipe.conta.id, email, papeis);
      setFeito(r);
      aoConvidar();
    } catch (err) {
      setErro(mensagemErroEquipe(err instanceof ErroEquipe ? err.codigo : null));
    } finally {
      setEnviando(false);
    }
  };

  return (
    <PainelDeslizante aberto={aberto} aoMudar={aoMudar} lado={celular ? "baixo" : "direita"} titulo="Convidar profissional"
      descricao="A pessoa aceita entrando no Physiq com este e-mail (pelo Google). Ela vê só os alunos em que for responsável.">
      {feito ? (
        <div className="flex flex-col gap-4 pt-2" data-convite-feito={feito.email_enviado ? "enviado" : "sem-email"}>
          <div className="flex items-start gap-3 rounded-2xl border border-linha bg-superficie-3 px-3.5 py-3">
            <span className="flex h-9 w-9 flex-none items-center justify-center rounded-xl border border-linha bg-superficie text-verde-3">
              <CircleCheck aria-hidden className="h-[18px] w-[18px]" />
            </span>
            <div className="text-[13.5px] leading-relaxed text-texto">
              <b className="block">{feito.reenvio ? "Convite reenviado" : "Convite enviado"}</b>
              <span className="text-texto-2">
                {feito.email_enviado
                  ? `O e-mail foi para ${feito.email}. Assim que a pessoa entrar, ela aparece na equipe.`
                  : `O convite para ${feito.email} está valendo, mas o e-mail não saiu agora. Mande o endereço do Physiq para a pessoa e peça para ela entrar com esse e-mail.`}
              </span>
            </div>
          </div>
          {!feito.email_enviado && (
            <Botao icone={Copy} onClick={() => void copiar(feito.link, "Link copiado.")} data-convite-copiar-link>Copiar o link do Physiq</Botao>
          )}
          <div className="flex gap-2">
            <Botao variante="w" onClick={() => aoMudar(false)} data-convite-fechar>Pronto</Botao>
            <Botao onClick={() => { setFeito(null); setEmail(""); setPapeis(equipe.papeis_do_plano.length === 1 ? [...equipe.papeis_do_plano] : []); }} data-convite-outro>Convidar outro</Botao>
          </div>
        </div>
      ) : (
        <form onSubmit={enviar} className="flex flex-col gap-4 pt-2" data-form-convidar>
          <Campo rotulo="E-mail" type="email" autoComplete="off" value={email} onChange={(e) => { setEmail(e.target.value); setErro(""); }}
            placeholder="nome@gmail.com" data-convidar-email />
          <OpcoesPilula nome="papeis-convite" rotulo="Papéis" varias colunas={1} opcoes={opcoesDoPlano(equipe.papeis_do_plano)} valores={papeis} aoMudar={(v) => { setPapeis(v); setErro(""); }} />
          {erro && <MensagemForm data-convidar-erro>{erro}</MensagemForm>}
          <Botao type="submit" variante="w" icone={Send} disabled={enviando} data-convidar-enviar>{enviando ? "Enviando…" : "Enviar convite"}</Botao>
        </form>
      )}
    </PainelDeslizante>
  );
}

/**
 * Mudar os papéis de um membro (os papéis que o plano permite; o dono continua dono). hml-18a (H-40, D): a folha fica montada e
 * fecha pelo `aberto` (antes sumia seca com o `membro` null); enquanto sai, mostra o membro que fechou (`useUltimoValor`).
 */
export function DialogoPapeis({
  membro,
  equipe,
  aoMudar,
  aoSalvar,
}: {
  membro: MembroEquipe | null;
  equipe: Equipe;
  aoMudar: (a: boolean) => void;
  aoSalvar: (msg: string) => void;
}) {
  const celular = useIsMobile();
  const [papeis, setPapeis] = useState<PapelModulo[]>([]);
  const [erro, setErro] = useState("");
  const [salvando, setSalvando] = useState(false);

  const visto = useUltimoValor(membro);
  useEffect(() => {
    if (!membro) return;
    setPapeis(membro.papeis.filter((p): p is PapelModulo => p === "personal" || p === "nutricionista"));
    setErro("");
  }, [membro]);

  if (!visto) return null; // nunca abriu: nada a mostrar nem a animar
  const saiTreino = visto.papeis.includes("personal") && !papeis.includes("personal") && visto.alunos_treino > 0;
  const saiNutri = visto.papeis.includes("nutricionista") && !papeis.includes("nutricionista") && visto.alunos_nutricao > 0;
  const aviso = saiTreino || saiNutri
    ? textoAlunosAfetados({ alunos_treino: saiTreino ? visto.alunos_treino : 0, alunos_nutricao: saiNutri ? visto.alunos_nutricao : 0 })
    : null;

  const salvar = async (e: FormEvent) => {
    e.preventDefault();
    if (!visto.dono && !papeis.length) return setErro(mensagemErroEquipe("papeis_invalidos"));
    setSalvando(true);
    setErro("");
    try {
      const r = await alterarPapeisMembro(visto.id, visto.dono ? ["dono", ...papeis] : papeis);
      const soltos = (r.alunos_sem_treino || 0) + (r.alunos_sem_nutricao || 0);
      aoSalvar(soltos ? `Papéis salvos. ${soltos === 1 ? "1 aluno ficou" : `${soltos} alunos ficaram`} sem responsável.` : "Papéis salvos.");
    } catch (err) {
      setErro(mensagemErroEquipe(err instanceof ErroEquipe ? err.codigo : null));
    } finally {
      setSalvando(false);
    }
  };

  return (
    <PainelDeslizante aberto={Boolean(membro)} aoMudar={aoMudar} lado={celular ? "baixo" : "direita"} titulo={`Papéis de ${visto.nome}`}
      descricao={visto.dono ? "Você continua dono da conta. Os papéis de módulo decidem o que você atende." : "O papel decide o que a pessoa atende e o que ela vê."}>
      <form onSubmit={salvar} className="flex flex-col gap-4 pt-2" data-form-papeis={visto.id}>
        <OpcoesPilula nome="papeis-membro" rotulo="Papéis" varias colunas={1} opcoes={opcoesDoPlano(equipe.papeis_do_plano)} valores={papeis} aoMudar={(v) => { setPapeis(v); setErro(""); }} />
        {aviso && (
          <div className="flex items-start gap-2.5 rounded-2xl border border-ambar/30 px-3.5 py-3 text-[13px] text-texto" style={{ background: "linear-gradient(90deg, var(--p-chip-a-fundo), transparent)" }} data-papeis-aviso>
            <TriangleAlert aria-hidden className="mt-0.5 h-4 w-4 flex-none text-ambar-3" />
            <span>{aviso}</span>
          </div>
        )}
        {erro && <MensagemForm data-papeis-erro>{erro}</MensagemForm>}
        <Botao type="submit" variante="w" disabled={salvando} data-papeis-salvar>{salvando ? "Salvando…" : "Salvar papéis"}</Botao>
      </form>
    </PainelDeslizante>
  );
}

/**
 * Remover da equipe: perde o acesso na hora; os alunos dele ficam sem responsável ou vão para quem o dono escolher. hml-18a (H-40,
 * D): a folha fica montada e fecha pelo `aberto`; enquanto sai, mostra o membro que fechou (`useUltimoValor`).
 */
export function DialogoRemover({
  membro,
  equipe,
  aoMudar,
  aoRemover,
}: {
  membro: MembroEquipe | null;
  equipe: Equipe;
  aoMudar: (a: boolean) => void;
  aoRemover: (msg: string) => void;
}) {
  const celular = useIsMobile();
  const [novoPersonal, setNovoPersonal] = useState("");
  const [novoNutri, setNovoNutri] = useState("");
  const [erro, setErro] = useState("");
  const [removendo, setRemovendo] = useState(false);

  const visto = useUltimoValor(membro);
  useEffect(() => {
    if (!membro) return; // abriu (de novo): começa limpo; fechando, as escolhas ficam até a folha sair
    setNovoPersonal("");
    setNovoNutri("");
    setErro("");
  }, [membro]);

  if (!visto) return null; // nunca abriu: nada a mostrar nem a animar
  const afetados = textoAlunosAfetados(visto);
  const paraTreino = visto.alunos_treino > 0 ? sucessoresPossiveis(equipe.membros, visto, "personal") : [];
  const paraNutri = visto.alunos_nutricao > 0 ? sucessoresPossiveis(equipe.membros, visto, "nutricionista") : [];

  const remover = async () => {
    setRemovendo(true);
    setErro("");
    try {
      const r = await removerMembro(visto.id, novoPersonal || null, novoNutri || null);
      const total = (r.alunos_treino || 0) + (r.alunos_nutricao || 0);
      const destino = novoPersonal || novoNutri ? "passaram para quem você escolheu" : "ficaram sem responsável";
      aoRemover(total ? `${visto.nome} saiu da equipe. ${total === 1 ? "1 aluno" : `${total} alunos`} ${destino}.` : `${visto.nome} saiu da equipe.`);
    } catch (err) {
      setErro(mensagemErroEquipe(err instanceof ErroEquipe ? err.codigo : null));
    } finally {
      setRemovendo(false);
    }
  };

  return (
    <PainelDeslizante aberto={Boolean(membro)} aoMudar={aoMudar} lado={celular ? "baixo" : "direita"} titulo={`Remover ${visto.nome}?`}
      descricao="A pessoa perde o acesso à conta na hora — no painel e no Treino. Nada é apagado: alunos, treinos e dietas ficam na conta.">
      <div className="flex flex-col gap-4 pt-2" data-dialogo-remover={visto.id}>
        {afetados ? (
          <div className="flex items-start gap-2.5 rounded-2xl border border-ambar/30 px-3.5 py-3 text-[13px] text-texto" style={{ background: "linear-gradient(90deg, var(--p-chip-a-fundo), transparent)" }} data-remover-afetados>
            <TriangleAlert aria-hidden className="mt-0.5 h-4 w-4 flex-none text-ambar-3" />
            <span>{afetados}</span>
          </div>
        ) : (
          <p className="text-[13px] text-texto-2">Ela não atende nenhum aluno agora.</p>
        )}
        {paraTreino.length > 0 && (
          <CampoSelect rotulo="Passar os alunos de treino para" value={novoPersonal} onChange={(e) => setNovoPersonal(e.target.value)} data-remover-novo-personal>
            <option value="">Ninguém (ficam sem responsável)</option>
            {paraTreino.map((m) => <option key={m.id} value={m.user_id ?? ""}>{m.nome}</option>)}
          </CampoSelect>
        )}
        {paraNutri.length > 0 && (
          <CampoSelect rotulo="Passar os alunos de nutrição para" value={novoNutri} onChange={(e) => setNovoNutri(e.target.value)} data-remover-novo-nutri>
            <option value="">Ninguém (ficam sem responsável)</option>
            {paraNutri.map((m) => <option key={m.id} value={m.user_id ?? ""}>{m.nome}</option>)}
          </CampoSelect>
        )}
        {erro && <MensagemForm data-remover-erro>{erro}</MensagemForm>}
        <div className="flex gap-2">
          <button type="button" className="pq-botao pq-botao-g border-rosa/40 text-rosa-3" onClick={() => void remover()} disabled={removendo} data-remover-confirmar>
            <UserMinus aria-hidden /> {removendo ? "Removendo…" : "Remover da equipe"}
          </button>
          <Botao onClick={() => aoMudar(false)}>Cancelar</Botao>
        </div>
      </div>
    </PainelDeslizante>
  );
}
