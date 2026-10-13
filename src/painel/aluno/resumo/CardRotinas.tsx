import { useState } from "react";
import { Link } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { KeyRound, Plus, RefreshCw, WifiOff } from "lucide-react";
import { ErroAlunoDia } from "@/aluno-dia/api";
import { hojeSP } from "@/aluno-dia/regras";
import type { Rotina, RotinaDoProfissional } from "@/aluno-dia/tipos";
import { FolhaRotina } from "@/rotinas/ui/FolhaRotina";
import { Botao } from "@/ui/premium/Botao";
import { CabecalhoCartao, Cartao } from "@/ui/premium/Cartao";
import { Chip } from "@/ui/premium/Chip";
import { Esqueleto } from "@/ui/premium/Estados";
import { useOnline } from "@/ui/premium/useOnline";
import { FolhaTodasAsRotinas } from "../rotinas/FolhaTodasAsRotinas";
import { LinhaDaRotina } from "../rotinas/LinhaDaRotina";
import { TEXTOS, estadoDoCard, proximasNoCard, rotinasDeHoje, vivasDoAluno, type EstadoDoCard } from "../rotinas/regras";
import { atualizarRotinasDoAluno, useRotinasDoAluno } from "../rotinas/useRotinasDoAluno";

/**
 * Card "Rotinas" do Resumo do aluno (W-A P6 — spec §4.5; P7, P8, P8b e o padrão 7/9 do desenho): para TODO aluno (o 7º do Resumo, o 1º de
 * baixo — ORDEM_RESUMO da P4). As de HOJE com o ✓ que o aluno deu no app (só leitura: só o aluno marca), o selo de quem criou, "Nova rotina"
 * (a folha da P3 no modo do profissional: cria na matrícula da rota e o aluno recebe o aviso no sino) e o "Ver tudo" (as vivas, as apagadas
 * — "apagada pelo aluno em 12/10" — e o histórico). Mudar/apagar só as de profissional DESTA matrícula (`pode_editar` do servidor); as do
 * aluno são dele. Sem login: "Ele precisa de login para receber rotinas — crie o acesso na aba Acessos." Tudo pela função aluno-dia.
 */
export default function CardRotinas({ alunoId }: { alunoId: string }) {
  const q = useRotinasDoAluno(alunoId);
  const qc = useQueryClient();
  const online = useOnline();
  const [folha, setFolha] = useState<{ aberta: boolean; rotina: Rotina | null }>({ aberta: false, rotina: null });
  const [tudo, setTudo] = useState(false);
  const hoje = hojeSP();
  const estado: EstadoDoCard = estadoDoCard(q, hoje);
  const d = q.data;
  const podeCriar = !!d?.tem_login && !!d.pode_criar;
  const atualizar = () => atualizarRotinasDoAluno(qc, alunoId);
  const abrirFolha = (rotina: Rotina | null) => {
    setTudo(false);
    setFolha({ aberta: true, rotina });
  };

  const verTudo = d?.tem_login ? (
    <button type="button" onClick={() => setTudo(true)} className="text-[12.5px] font-semibold text-violeta-3" data-rotinas-ver-tudo>
      {TEXTOS.verTudo}
    </button>
  ) : undefined;

  const corpo = () => {
    if (estado === "carregando") return <Esqueleto className="h-[160px] w-full" />;
    if (estado === "sem-internet") {
      return (
        <p className="flex items-start gap-2 text-[12.5px] leading-relaxed text-texto-2" data-rotinas-sem-rede>
          <WifiOff aria-hidden className="mt-0.5 h-3.5 w-3.5 flex-none text-ambar-3" /> {TEXTOS.semInternetLer}
        </p>
      );
    }
    if (estado === "erro") {
      const codigo = q.error instanceof ErroAlunoDia ? q.error.codigo : null;
      return (
        <div className="flex flex-col items-start gap-2.5">
          <p className="text-[12.5px] text-texto-2" data-rotinas-erro={codigo ?? ""}>
            {q.error instanceof ErroAlunoDia && codigo !== "erro_interno" ? q.error.message : TEXTOS.erroLer}
          </p>
          {codigo !== "sem_acesso" && codigo !== "aluno_inexistente" && (
            <Botao tamanho="sm" icone={RefreshCw} onClick={() => void q.refetch()} data-rotinas-tentar>Tentar de novo</Botao>
          )}
        </div>
      );
    }
    if (!d) return null;
    if (estado === "sem-login") {
      return (
        <div className="flex flex-col items-start gap-2.5">
          <p className="text-[12.5px] leading-relaxed text-texto-2" data-rotinas-sem-login>{TEXTOS.semLogin}</p>
          <Link to={`/painel/alunos/${encodeURIComponent(alunoId)}/acessos`} className="pq-botao pq-botao-g pq-botao-sm" data-rotinas-acessos>
            <KeyRound aria-hidden /> {TEXTOS.abrirAcessos}
          </Link>
        </div>
      );
    }
    if (estado === "vazio") {
      return (
        <div className="flex flex-col gap-1">
          <b className="text-[13.5px] font-semibold text-texto">{TEXTOS.vazio}</b>
          {podeCriar && <span className="text-[12.5px] leading-relaxed text-texto-2">{TEXTOS.vazioTexto}</span>}
        </div>
      );
    }
    const doDia = rotinasDeHoje(d, hoje);
    if (doDia.length === 0) {
      const n = vivasDoAluno(d.rotinas).length;
      return (
        <p className="text-[12.5px] text-texto-2" data-rotinas-nenhuma-hoje>
          {TEXTOS.nenhumaHoje} {n === 1 ? "1 rotina em outros dias." : `${n} rotinas em outros dias.`}
        </p>
      );
    }
    const { visiveis, resto } = proximasNoCard(doDia);
    return (
      <>
        <p className="mb-1.5 text-[11.5px] text-texto-3">{TEXTOS.hoje}</p>
        <ul className="flex min-w-0 flex-col gap-1" data-rotinas-hoje={doDia.length} data-rotinas-hoje-feitas={doDia.filter((r) => r.feita).length}>
          {visiveis.map((r) => (
            <LinhaDaRotina key={r.id} rotina={r} feita={r.feita} sub={r.detalhe}
              aoAbrir={r.pode_editar && online ? () => abrirFolha(r as RotinaDoProfissional) : undefined} />
          ))}
        </ul>
        {resto > 0 && (
          <button type="button" onClick={() => setTudo(true)} className="mt-1 self-start text-[12px] font-semibold text-violeta-3" data-rotinas-mais={resto}>
            +{resto} {resto === 1 ? "rotina" : "rotinas"}
          </button>
        )}
      </>
    );
  };

  return (
    <Cartao className="flex min-h-[240px] min-w-0 flex-col px-[18px] py-4" data-card-rotinas={estado} data-rotinas-pode-criar={podeCriar ? "1" : "0"}>
      <CabecalhoCartao
        titulo={TEXTOS.titulo}
        extra={d?.tem_login && vivasDoAluno(d.rotinas).length > 0 ? <Chip tom="c">{vivasDoAluno(d.rotinas).length} VIVAS</Chip> : undefined}
        acao={verTudo}
      />
      <div className="flex min-w-0 flex-1 flex-col">{corpo()}</div>
      {(estado === "lista" || estado === "vazio" || estado === "nenhuma-hoje") && (
        <div className="mt-3 flex flex-col items-start gap-2 border-t border-linha pt-3">
          {!online && (
            <p className="flex items-start gap-2 text-[12px] leading-relaxed text-ambar-3" data-rotinas-sem-internet>
              <WifiOff aria-hidden className="mt-0.5 h-3.5 w-3.5 flex-none" /> {TEXTOS.semInternet}
            </p>
          )}
          {podeCriar ? (
            <Botao tamanho="sm" variante="w" icone={Plus} onClick={() => abrirFolha(null)} disabled={!online} data-rotinas-nova>{TEXTOS.nova}</Botao>
          ) : null}
        </div>
      )}
      <FolhaRotina
        aberta={folha.aberta}
        aoMudar={(aberta) => setFolha((f) => ({ ...f, aberta }))}
        modo={{ tipo: "profissional", aluno: alunoId }}
        rotina={folha.rotina}
        aoSalvo={atualizar}
        aoApagado={atualizar}
      />
      {d?.tem_login && (
        <FolhaTodasAsRotinas aberta={tudo} aoMudar={setTudo} dados={d} aoEditar={online ? (r) => abrirFolha(r) : undefined} />
      )}
    </Cartao>
  );
}
