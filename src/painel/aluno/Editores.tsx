import { useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Apple, Bookmark, Dumbbell, Eye, FileText, KeyRound, MessageCircle, Plus, Send, UserRoundX, Users } from "lucide-react";
import { toast } from "sonner";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { PRINCIPAL_SCHEMA } from "@/integrations/principal/client";
import { planoAtivo } from "@/nutricao/app/dia";
import type { PlanoAlimentar } from "@/nutricao/app/tipos";
import { listarCalculos } from "@/nutricao/editor/lib/calculosEnergeticos";
import { nomeDaNutricionista } from "@/nutricao/editor/lib/profissional";
import { usePlanosDoAluno } from "@/nutricao/editor/lib/consultas";
import { EditorDieta } from "@/nutricao/editor/ui/EditorDieta";
import PlanoDialog from "@/nutricao/editor/ui/PlanoDialog";
import { useAuth } from "@/nutricao/editor/ui/contexto";
import { EditorTreino } from "@/treino/editor/EditorTreino";
import { useTreinoDoAlunoPainel } from "@/treino/editor/useTreinoDoAlunoPainel";
import { mensagemDoErro } from "@/treino/editor/useEditorTreino";
import { SemConexaoTreino } from "@/ui/casca/SemConexaoTreino";
import { TopoPagina } from "@/ui/casca/topo";
import { Botao } from "@/ui/premium/Botao";
import { Esqueleto, EstadoErro, EstadoVazio } from "@/ui/premium/Estados";
import { acessoDaDieta } from "@/nutricao/editor/lib/acesso";
import { gerarPdfTreino } from "./dados/pdf";
import { usePerfilAluno } from "./dados/usePerfilAluno";
import { enviarAoAluno } from "./envio/api";
import { SEM_TELEFONE, atalhoWhatsApp, mensagemWhatsApp, textoDoResultado, type ModuloEnvio } from "./envio/regras";

type ModuloAviso = ModuloEnvio;

const TEXTO_ERRO_AVISO: Record<string, string> = {
  sem_acesso: "Você não pode avisar este aluno.",
  sem_modulo: "Nada para enviar: você não muda o treino nem a dieta deste aluno.",
};

/** O lado esquerdo (tela 8): o editor de treino da W15, ou só para ler (nutricionista e dono sem papel de personal). */
function LadoTreino({ alunoId, aoMudar }: { alunoId: string; aoMudar: () => void }) {
  const est = useTreinoDoAlunoPainel(alunoId);
  if (est.tipo === "carregando") return <Esqueleto className="h-[520px] w-full rounded-[22px]" />;
  if (est.tipo === "sem-sessao") return <SemConexaoTreino estado={est.estado} />;
  if (est.tipo === "erro") return <EstadoErro titulo="Não deu para abrir o treino" texto={mensagemDoErro(est.erro)} aoTentar={est.tentar} />;
  if (est.tipo === "sem-modulo") return null;
  if (est.tipo === "sem-acesso") return <EstadoVazio icone={UserRoundX} titulo="Treino de outro personal" texto="Só o personal responsável por este aluno e o dono da conta veem o treino dele." />;
  if (est.tipo === "sem-login") {
    return <EstadoVazio icone={KeyRound} titulo="O treino nasce no 1º acesso do aluno" texto="Assim que o aluno entrar no app pela primeira vez, o treino dele aparece aqui." />;
  }
  if (est.tipo === "leitura") {
    return (
      <div className="flex min-w-0 flex-col gap-2" data-editores-treino="leitura">
        <EditorTreino treinoUserId="" leituraAluno={est.alunoId} somenteLeitura nomeAluno={est.perfil.nome} />
        <p className="flex items-center gap-1.5 px-1 text-[12px] text-texto-3" data-treino-so-ver>
          <Eye aria-hidden className="h-3.5 w-3.5 text-violeta-3" /> Só para ver: quem muda o treino é o personal responsável.
        </p>
      </div>
    );
  }
  return (
    <div className="flex min-w-0 flex-col gap-2" data-editores-treino={est.somenteLeitura ? "leitura" : "editar"}>
      <EditorTreino treinoUserId={est.treinoUserId} somenteLeitura={est.somenteLeitura} nomeAluno={est.perfil.nome} onMudou={aoMudar} />
      {est.somenteLeitura && (
        <p className="flex items-center gap-1.5 px-1 text-[12px] text-texto-3" data-treino-so-ver>
          <Eye aria-hidden className="h-3.5 w-3.5 text-violeta-3" /> Só para ver: quem muda o treino é o personal responsável.
        </p>
      )}
    </div>
  );
}

/**
 * "Editar treino e dieta" (W16 — tela 8 inteira, spec 4.5, rota /painel/alunos/:id/editar): o editor do treino da W15 à esquerda e
 * o do plano alimentar à direita, cada um conforme o papel (spec 4.1: a nutricionista vê o treino e o personal vê o plano, só para
 * ler). "Gerar PDF" baixa o do treino e/ou o do plano. Tudo grava na hora (o aluno vê como hoje nos 2 apps); "Salvar e enviar ao
 * aluno" cria o aviso "plano atualizado" no sino dele (NF9) e manda o e-mail (W17: função aluno-enviar, sem repetir em 10 min);
 * "Enviar pelo WhatsApp" abre o WhatsApp de quem salvou já na conversa com o aluno e a mensagem pronta (sem telefone, desligado).
 */
export default function Editores({ alunoId }: { alunoId: string }) {
  const perfilQ = usePerfilAluno(alunoId);
  const p = perfilQ.data;
  const { user } = useAuth();
  const temTreino = !!p && p.modulos.includes("treino");
  const temDieta = !!p && p.modulos.includes("nutricao") && p.conta_modulos.includes("nutricao");
  const acessoDieta = p ? acessoDaDieta(p) : "so-plano";
  const treinoEst = useTreinoDoAlunoPainel(temTreino ? alunoId : "");
  const podeTreino = treinoEst.tipo === "ok" && !treinoEst.somenteLeitura;
  const planosQ = usePlanosDoAluno(temDieta ? p!.paciente_id : null);
  const ativo = useMemo(() => planoAtivo(planosQ.data ?? []), [planosQ.data]);
  const nomeQ = useQuery({ queryKey: ["dieta-nome-nutri", user?.id], queryFn: () => nomeDaNutricionista(user?.id ?? ""), enabled: !!user?.id, staleTime: 10 * 60_000 });
  const calculosQ = useQuery({ queryKey: ["dieta-calculos", p?.paciente_id], queryFn: () => listarCalculos(p!.paciente_id), enabled: temDieta && acessoDieta === "editar", staleTime: 60_000 });
  const [novoPlano, setNovoPlano] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const mudou = useRef<Set<ModuloAviso>>(new Set());

  const base = `/painel/alunos/${encodeURIComponent(alunoId)}`;
  const nome = p?.nome ?? "…";
  const modulosQueMudo: ModuloAviso[] = [...(podeTreino ? (["treino"] as const) : []), ...(temDieta && acessoDieta === "editar" ? (["dieta"] as const) : [])];

  const pdfTreino = async () => {
    if (treinoEst.tipo !== "ok") {
      toast.message("O PDF do treino sai pelo personal responsável.");
      return;
    }
    try {
      await gerarPdfTreino(treinoEst.treinoUserId);
      toast.success("PDF do treino baixado.");
    } catch (e) {
      toast.error(mensagemDoErro(e));
    }
  };
  const pdfDieta = async () => {
    if (!ativo || !p) {
      toast.message("O aluno ainda não tem plano alimentar.");
      return;
    }
    try {
      const { baixarPDFDieta } = await import("@/nutricao/app/pdf/dietaPdf");
      const arq = await baixarPDFDieta({ aluno: p.nome, nutricionista: p.nutricionista?.nome ?? nomeQ.data ?? null, plano: ativo as unknown as PlanoAlimentar });
      toast.success(`PDF gerado: ${arq}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível gerar o PDF");
    }
  };

  const enviar = async () => {
    if (!p) return;
    // o campo que está sendo digitado (observação do treino, por exemplo) grava ao sair dele
    (document.activeElement as HTMLElement | null)?.blur?.();
    setEnviando(true);
    try {
      await new Promise((r) => setTimeout(r, 450));
      const r = await enviarAoAluno(p.paciente_id, modulosQueMudo);
      mudou.current.clear();
      const t = textoDoResultado(r);
      if (t.tipo === "aviso") toast.warning(t.texto);
      else toast.success(t.texto);
    } catch (e) {
      const m = e instanceof Error ? e.message : "";
      toast.error(TEXTO_ERRO_AVISO[m] ?? "Não deu para avisar o aluno agora. O que você mudou já está salvo.");
    } finally {
      setEnviando(false);
    }
  };

  const zap = p && modulosQueMudo.length > 0 ? atalhoWhatsApp(p.telefone, mensagemWhatsApp(p.nome, modulosQueMudo, PRINCIPAL_SCHEMA)) : null;
  const semTelefone = !!p && modulosQueMudo.length > 0 && !zap;

  const acoes = p ? (
    <div className="flex flex-wrap items-center justify-end gap-2">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Botao variante="g" icone={FileText} data-editores-pdf>Gerar PDF</Botao>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="border-linha-2 bg-tela font-body text-texto" data-editores-pdf-menu>
          {temTreino && (
            <DropdownMenuItem onSelect={() => void pdfTreino()} disabled={treinoEst.tipo !== "ok"} className="cursor-pointer" data-editores-pdf-treino>
              <Dumbbell size={14} className="mr-2" /> PDF do treino
            </DropdownMenuItem>
          )}
          {temDieta && (
            <DropdownMenuItem onSelect={() => void pdfDieta()} disabled={!ativo} className="cursor-pointer" data-editores-pdf-dieta>
              <Apple size={14} className="mr-2" /> PDF do plano alimentar
            </DropdownMenuItem>
          )}
          {temTreino && temDieta && treinoEst.tipo === "ok" && ativo && (
            <DropdownMenuItem onSelect={() => void (async () => { await pdfTreino(); await pdfDieta(); })()} className="cursor-pointer" data-editores-pdf-os-dois>
              <FileText size={14} className="mr-2" /> Os dois
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
      {modulosQueMudo.length > 0 &&
        (zap ? (
          <a href={zap} target="_blank" rel="noreferrer" className="pq-botao pq-botao-g" data-editores-whatsapp={zap}>
            <MessageCircle aria-hidden /> Enviar pelo WhatsApp
          </a>
        ) : (
          <button type="button" className="pq-botao pq-botao-g" disabled title={SEM_TELEFONE} aria-describedby="editores-whatsapp-motivo" data-editores-whatsapp="">
            <MessageCircle aria-hidden /> Enviar pelo WhatsApp
          </button>
        ))}
      {modulosQueMudo.length > 0 && (
        <Botao variante="w" icone={Send} disabled={enviando} onClick={() => void enviar()} data-editores-enviar>
          {enviando ? "Enviando…" : "Salvar e enviar ao aluno"}
        </Botao>
      )}
    </div>
  ) : undefined;

  return (
    <div className="flex flex-col gap-3.5" data-editores={alunoId}>
      {/* a trilha no topo da casca (a busca e o sino de lá ocupam o resto da linha); "Gerar PDF" e "Salvar e enviar ao aluno" logo abaixo */}
      <TopoPagina trilha={[{ rotulo: "Alunos", para: "/painel/alunos", icone: Users }, { rotulo: nome, para: base }, { rotulo: "Editar treino e dieta" }]} />
      {acoes && (
        <div className="-mt-1 flex flex-col items-end gap-1" data-editores-acoes>
          {acoes}
          {semTelefone && (
            <p id="editores-whatsapp-motivo" className="text-[12px] text-texto-3" data-editores-whatsapp-motivo>
              {SEM_TELEFONE}: cadastre o número em Dados do aluno para enviar pelo WhatsApp.
            </p>
          )}
        </div>
      )}
      {perfilQ.isLoading ? (
        <Esqueleto className="h-[520px] w-full rounded-[22px]" />
      ) : perfilQ.error || !p ? (
        <EstadoErro titulo="Não deu para abrir este aluno" aoTentar={() => void perfilQ.refetch()} />
      ) : !temTreino && !temDieta ? (
        <EstadoVazio titulo="Nada para editar" texto="Este aluno ainda não tem treino nem dieta no Physiq." acao={<Link to={base} className="text-[13px] font-semibold text-violeta-3">Voltar ao perfil</Link>} />
      ) : (
        <div className={temTreino && temDieta ? "grid grid-cols-1 items-start gap-3.5 xl:grid-cols-[minmax(0,1.08fr)_minmax(0,1fr)]" : "grid max-w-[900px] grid-cols-1 gap-3.5"} data-editores-lados={[temTreino && "treino", temDieta && "dieta"].filter(Boolean).join(",")}>
          {temTreino && <LadoTreino alunoId={alunoId} aoMudar={() => mudou.current.add("treino")} />}
          {temDieta && (
            <div className="min-w-0" data-editores-dieta={acessoDieta}>
              {planosQ.isLoading ? (
                <Esqueleto className="h-[520px] w-full rounded-[22px]" />
              ) : planosQ.error ? (
                <EstadoErro titulo="Não deu para abrir o plano" aoTentar={() => void planosQ.refetch()} />
              ) : ativo ? (
                <EditorDieta
                  key={ativo.id}
                  planoId={ativo.id}
                  paciente={{ id: p.paciente_id, nome: p.nome, objetivo: p.objetivo }}
                  nomeNutricionista={p.nutricionista?.nome ?? nomeQ.data ?? null}
                  somenteLeitura={acessoDieta !== "editar"}
                  noApp
                  onMudou={() => mudou.current.add("dieta")}
                  onTrocarPlano={() => void planosQ.refetch()}
                />
              ) : (
                <EstadoVazio
                  icone={Apple}
                  titulo="Nenhum plano alimentar"
                  texto={acessoDieta === "editar" ? "Crie o plano aqui: 6 refeições padrão e a meta pelo último cálculo energético." : "Quando a nutricionista montar o plano, ele aparece aqui."}
                  acao={
                    acessoDieta === "editar" ? (
                      <div className="flex flex-wrap justify-center gap-2">
                        <Botao variante="w" tamanho="sm" icone={Plus} onClick={() => setNovoPlano(true)} data-editores-novo-plano>Nova prescrição alimentar</Botao>
                        <Link to={`${base}/dieta`} className="pq-botao pq-botao-g pq-botao-sm"><Bookmark aria-hidden /> Usar um modelo ★</Link>
                      </div>
                    ) : undefined
                  }
                />
              )}
              {acessoDieta !== "editar" && ativo && (
                <p className="mt-2 flex items-center gap-1.5 px-1 text-[12px] text-texto-3" data-dieta-so-ver>
                  <Eye aria-hidden className="h-3.5 w-3.5 text-verde-3" /> Só para ver: quem muda a dieta é a nutricionista responsável.
                </p>
              )}
            </div>
          )}
        </div>
      )}
      {p && acessoDieta === "editar" && (
        <PlanoDialog open={novoPlano} onOpenChange={setNovoPlano} pacienteId={p.paciente_id} ultimoCalculo={calculosQ.data?.[0] ?? null} onCriado={() => void planosQ.refetch()} />
      )}
    </div>
  );
}
