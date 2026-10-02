import { Suspense, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { DropdownMenu } from "radix-ui";
import {
  Ban, ClipboardCheck, Dumbbell, Ellipsis, FileDown, KeyRound, Lock, LockOpen, MessageCircle, PauseCircle, Pencil, RotateCcw, Salad, Users, UserX,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { toast } from "sonner";
import { useIsMobile } from "@/hooks/use-mobile";
import { useFinanceiroDoAluno } from "@/financeiro/ui/useFinanceiroDoAluno";
import { acaoNoAluno, ErroAlunos } from "@/painel/alunos/api";
import { ConfirmarAcao, type Confirmar } from "@/painel/alunos/AcoesAluno";
import { acoesDoAluno, mensagemErroAlunos } from "@/painel/alunos/regras";
import { existe, listar } from "@/rotas/registro";
import { TopoPagina } from "@/ui/casca/topo";
import { LimiteDeErro } from "@/ui/casca/LimiteDeErro";
import { Avatar } from "@/ui/premium/Avatar";
import { BotaoIcone } from "@/ui/premium/Botao";
import { Cartao } from "@/ui/premium/Cartao";
import { Chip } from "@/ui/premium/Chip";
import { Esqueleto, EstadoErro } from "@/ui/premium/Estados";
import { ORDEM_KPIS } from "./catalogoAbas";
import { gerarPdfDadosEvolucao, gerarPdfTreino } from "./dados/pdf";
import { bloqueadoPorPagamento, linhaDoCabecalho, linhaDoPerfil, mensagemErroPerfil, primeiroNome, whatsappDoAluno } from "./dados/regras";
import { SheetEditarDados } from "./dados/SheetEditarDados";
import type { PerfilAluno } from "./dados/tipos";
import { useAtualizarAluno, usePerfilAluno, useTreinoDoAluno, useTreinoPronto } from "./dados/usePerfilAluno";

function ItemMenu({ icone: Icone, rotulo, aoEscolher, perigo, marca, desligado }: {
  icone: LucideIcon; rotulo: string; aoEscolher: () => void; perigo?: boolean; marca: string; desligado?: boolean;
}) {
  return (
    <DropdownMenu.Item
      onSelect={aoEscolher}
      disabled={desligado}
      data-acao-perfil={marca}
      className={`flex h-10 cursor-pointer items-center gap-2.5 rounded-[10px] px-2.5 text-[13px] font-medium outline-none data-[disabled]:cursor-default data-[disabled]:opacity-50 data-[highlighted]:bg-superficie-2 ${perigo ? "text-rosa-3" : "text-texto"}`}
    >
      <Icone aria-hidden className="h-4 w-4 flex-none" strokeWidth={1.8} />
      {rotulo}
    </DropdownMenu.Item>
  );
}

/** Para onde vai o "Nova avaliação": a aba Avaliação (W17 lê ?nova=1). W28: o formulário antigo do Calc e o site antigo do Nutri saíram. */
function destinoNovaAvaliacao(base: string): string | null {
  return existe("abasAluno", "Avaliacao") ? `${base}/avaliacao?nova=1` : null;
}

function AcoesDoCabecalho({ perfil, alunoId, aoEditar }: { perfil: PerfilAluno; alunoId: string; aoEditar: () => void }) {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const celular = useIsMobile();
  const treinoPronto = useTreinoPronto();
  const atualizar = useAtualizarAluno(alunoId);
  const [confirmar, setConfirmar] = useState<Confirmar | null>(null);
  const [gerando, setGerando] = useState<"dados" | "treino" | null>(null);
  const base = `/painel/alunos/${encodeURIComponent(alunoId)}`;
  const zap = whatsappDoAluno(perfil.telefone);
  const nova = destinoNovaAvaliacao(base);
  const linha = linhaDoPerfil(perfil);
  const pode = acoesDoAluno(linha, perfil.eu);
  const pdfTreino = !!perfil.treino_user_id && perfil.modulos.includes("treino") && treinoPronto;

  const pdf = async (qual: "dados" | "treino") => {
    setGerando(qual);
    try {
      if (qual === "dados") await gerarPdfDadosEvolucao(perfil, treinoPronto);
      else await gerarPdfTreino(perfil.treino_user_id!);
    } catch {
      toast.error(qual === "dados" ? "Não deu para gerar o PDF agora." : "Não deu para gerar o PDF do treino agora.");
    } finally {
      setGerando(null);
    }
  };

  const direta = async (acao: "desbloquear" | "reativar", ok: string) => {
    try {
      await acaoNoAluno(acao, perfil.paciente_id);
      toast.success(ok);
      await atualizar();
    } catch (e) {
      toast.error(mensagemErroAlunos(e instanceof ErroAlunos ? e.codigo : null, e instanceof ErroAlunos ? e.extra : {}));
    }
  };

  const irParaAcesso = () => {
    const rolar = () => document.querySelector("[data-card-acesso-aluno]")?.scrollIntoView({ behavior: "smooth", block: "center" });
    if (pathname.replace(/\/+$/, "") !== base) {
      navigate(base);
      window.setTimeout(rolar, 600);
    } else rolar();
  };

  const mensagem = zap ? (
    celular ? (
      <a href={zap} target="_blank" rel="noreferrer" className="pq-ibtn" aria-label="Mensagem no WhatsApp" title="Mensagem no WhatsApp" data-acao-mensagem={zap}>
        <MessageCircle aria-hidden />
      </a>
    ) : (
      <a href={zap} target="_blank" rel="noreferrer" className="pq-botao pq-botao-g" data-acao-mensagem={zap}>
        <MessageCircle aria-hidden /> Mensagem
      </a>
    )
  ) : celular ? (
    <BotaoIcone icone={MessageCircle} rotulo="Sem telefone no cadastro" disabled data-acao-mensagem="" />
  ) : (
    <button type="button" className="pq-botao pq-botao-g" disabled title="Sem telefone no cadastro" data-acao-mensagem="">
      <MessageCircle aria-hidden /> Mensagem
    </button>
  );

  const novaAvaliacao = nova ? (
    <button type="button" onClick={() => navigate(nova)} className={celular ? "pq-ibtn" : "pq-botao pq-botao-w"} aria-label="Nova avaliação"
      data-acao-nova-avaliacao={nova}>
      <ClipboardCheck aria-hidden /> {!celular && "Nova avaliação"}
    </button>
  ) : null;

  return (
    <>
      {mensagem}
      {novaAvaliacao}
      <DropdownMenu.Root>
        <DropdownMenu.Trigger asChild>
          <BotaoIcone icone={Ellipsis} rotulo={`Mais ações de ${perfil.nome}`} data-menu-perfil />
        </DropdownMenu.Trigger>
        <DropdownMenu.Portal>
          <DropdownMenu.Content align="end" sideOffset={6}
            className="z-50 w-[250px] rounded-2xl border border-linha-2 bg-tela p-1.5 text-texto shadow-[0_24px_60px_-20px_rgba(0,0,0,.85)]"
            data-menu-perfil-aberto>
            {perfil.pode_editar && <ItemMenu icone={Pencil} rotulo="Editar dados" marca="editar" aoEscolher={aoEditar} />}
            <ItemMenu icone={FileDown} rotulo={gerando === "dados" ? "Gerando o PDF…" : "Gerar PDF · Dados & Evolução"} marca="pdf-dados"
              desligado={gerando !== null} aoEscolher={() => void pdf("dados")} />
            {pdfTreino && (
              <ItemMenu icone={FileDown} rotulo={gerando === "treino" ? "Gerando o PDF…" : "Gerar PDF · Treino"} marca="pdf-treino"
                desligado={gerando !== null} aoEscolher={() => void pdf("treino")} />
            )}
            <ItemMenu icone={KeyRound} rotulo="Acesso do aluno" marca="acesso" aoEscolher={irParaAcesso} />
            {(pode.bloquear || pode.desbloquear || pode.desativar || pode.reativar || pode.remover) && <DropdownMenu.Separator className="my-1 h-px bg-linha" />}
            {pode.bloquear && <ItemMenu icone={Ban} rotulo="Bloquear acesso" marca="bloquear" aoEscolher={() => setConfirmar("bloquear")} />}
            {pode.desbloquear && (
              <ItemMenu icone={LockOpen} rotulo="Desbloquear acesso" marca="desbloquear" aoEscolher={() => void direta("desbloquear", `${perfil.nome} voltou a usar o app.`)} />
            )}
            {pode.desativar && <ItemMenu icone={PauseCircle} rotulo="Desativar" marca="desativar" aoEscolher={() => setConfirmar("desativar")} />}
            {pode.reativar && <ItemMenu icone={RotateCcw} rotulo="Reativar" marca="reativar" aoEscolher={() => void direta("reativar", `${perfil.nome} voltou para os ativos.`)} />}
            {pode.remover && <ItemMenu icone={UserX} rotulo="Remover da lista" marca="remover" perigo aoEscolher={() => setConfirmar("remover")} />}
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>
      <ConfirmarAcao
        aluno={linha}
        eu={perfil.eu}
        acao={confirmar}
        aoFechar={() => setConfirmar(null)}
        aoFeito={() => {
          if (confirmar === "remover") navigate("/painel/alunos");
          else void atualizar();
        }}
      />
    </>
  );
}

/**
 * Cabeçalho do perfil do aluno (tela 7 — W14, encaixe da W1 no lugar do CabecalhoPadrao): trilha "Alunos › nome"; à direita
 * Mensagem (WhatsApp do aluno — P24), Nova avaliação e ⋯ (editar dados, PDFs "Dados & Evolução" e "Treino", Acesso do aluno,
 * Bloquear, Desativar, Remover — as ações da W13, com a regra nova); no cartão, foto, nome, "28 anos · 1,78 m · objetivo:
 * definição · aluno desde mar/2026", os chips TREINO · <personal> e NUTRIÇÃO · <nutri> e os números de src/painel/aluno/kpis/.
 * Os dados são da matrícula no banco principal (vale para quem veio do Calc e do Nutri); altura e peso de quem tem treino vêm
 * do Banco do Treino.
 */
export default function Cabecalho({ alunoId }: { alunoId: string }) {
  const q = usePerfilAluno(alunoId);
  const p = q.data;
  const treinoQ = useTreinoDoAluno(p);
  const treino = treinoQ.data?.profile ?? null;
  const kpis = listar("kpisAluno", ORDEM_KPIS);
  // N-64: o app deste aluno está fechado pela mensalidade? (a MESMA consulta do número "Mensalidade" — só quem vê a mensalidade)
  const fin = useFinanceiroDoAluno(alunoId, !!p);
  const travadoPorPagamento = !!p && !p.conta_excluida && bloqueadoPorPagamento(fin.data, p.ativo);
  const [editar, setEditar] = useState(false);
  const nome = p?.nome || "Aluno";
  const linha = p ? linhaDoCabecalho(p, treino) : "";

  return (
    <>
      <TopoPagina
        trilha={[{ rotulo: "Alunos", para: "/painel/alunos", icone: Users }, { rotulo: q.isLoading ? "…" : nome }]}
        acoes={p ? <AcoesDoCabecalho perfil={p} alunoId={alunoId} aoEditar={() => setEditar(true)} /> : undefined}
      />
      {q.isError ? (
        <EstadoErro titulo="Não deu para abrir este aluno" texto={mensagemErroPerfil(q.error instanceof Error ? q.error.message : "")}
          aoTentar={() => void q.refetch()} />
      ) : (
        <Cartao brilho data-cabecalho-aluno data-cabecalho-w14 className="flex flex-col gap-4 px-5 py-[18px] md:flex-row md:items-center md:gap-[18px]">
          <div className="flex min-w-0 flex-1 items-center gap-[18px]">
            {q.isLoading || !p ? <Esqueleto className="h-[76px] w-[76px] flex-none rounded-full" /> : <Avatar src={p.foto_url} nome={nome} tamanho={76} />}
            <div className="min-w-0 flex-1">
              {q.isLoading || !p ? (
                <div className="flex flex-col gap-2">
                  <Esqueleto className="h-6 w-48" />
                  <Esqueleto className="h-4 w-64" />
                </div>
              ) : (
                <>
                  <h2 className="truncate font-body text-[24px] font-bold normal-case tracking-[-0.03em] text-texto" data-cabecalho-nome>{nome}</h2>
                  <div className="mb-2.5 mt-1 truncate text-[13px] text-texto-2" data-cabecalho-linha>{linha || p.email || " "}</div>
                  <div className="flex flex-wrap items-center gap-2" data-cabecalho-chips>
                    {p.modulos.includes("treino") && (
                      <Chip tom="t" icone={Dumbbell} data-chip-modulo="treino">
                        {p.personal ? `TREINO · ${primeiroNome(p.personal.nome).toUpperCase()}` : "TREINO"}
                      </Chip>
                    )}
                    {p.modulos.includes("nutricao") && (
                      <Chip tom="n" icone={Salad} data-chip-modulo="nutricao">
                        {p.nutricionista ? `NUTRIÇÃO · ${primeiroNome(p.nutricionista.nome).toUpperCase()}` : "NUTRIÇÃO"}
                      </Chip>
                    )}
                    {p.bloqueado && p.ativo && <Chip tom="r" icone={Lock} data-chip-situacao="bloqueado">BLOQUEADO</Chip>}
                    {travadoPorPagamento && (
                      <span title="O app do aluno está fechado: a mensalidade venceu e a conta bloqueia o app de quem não pagou (Configurações › Recebimento)">
                        <Chip tom="r" icone={Lock} data-chip-situacao="bloqueado-pagamento">BLOQUEADO (PAGAMENTO)</Chip>
                      </span>
                    )}
                    {!p.ativo && <Chip tom="g" data-chip-situacao={p.conta_excluida ? "excluida" : "desativado"}>{p.conta_excluida ? "CONTA EXCLUÍDA" : "DESATIVADO"}</Chip>}
                  </div>
                </>
              )}
            </div>
          </div>
          {kpis.length > 0 && (
            <div className="flex flex-wrap gap-2.5 md:ml-auto" data-kpis-aluno>
              {kpis.map(({ nome: n, Componente }) => (
                <LimiteDeErro key={n} silencioso nome={n}>
                  <Suspense fallback={<Esqueleto className="h-[76px] w-[138px] rounded-2xl" />}>
                    <Componente alunoId={alunoId} />
                  </Suspense>
                </LimiteDeErro>
              ))}
            </div>
          )}
        </Cartao>
      )}
      {p && <SheetEditarDados aberto={editar} aoFechar={() => setEditar(false)} perfil={p} treino={treino} alunoId={alunoId} />}
    </>
  );
}
