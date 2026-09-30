import { useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { MessageCircle, Pencil } from "lucide-react";
import { CabecalhoCartao, Cartao } from "@/ui/premium/Cartao";
import { Chip } from "@/ui/premium/Chip";
import { Esqueleto } from "@/ui/premium/Estados";
import {
  alturaEmMetros, corpoDoAluno, dataBR, dataHoraBR, formatarCPF, formatarTelefone, idadeDe, mensagemErroPerfil, objetivoDoAluno, pesoKg,
  rotuloGenero, generoDoTreino, whatsappDoAluno,
} from "../dados/regras";
import { SheetEditarDados } from "../dados/SheetEditarDados";
import { usePerfilAluno, useTreinoDoAluno } from "../dados/usePerfilAluno";

function Linha({ rotulo, children, marca }: { rotulo: string; children: ReactNode; marca: string }) {
  const vazio = children === null || children === undefined || children === "";
  return (
    <div className="flex min-w-0 items-center gap-3 border-b border-linha py-2.5 text-[13px]" data-dado={marca}>
      <span className="flex-none text-texto-3">{rotulo}</span>
      <span className="ml-auto min-w-0 truncate text-right font-medium text-texto">{vazio ? <span className="text-texto-4">—</span> : children}</span>
    </div>
  );
}

/**
 * Card "Dados do aluno" do Resumo (W14 — N-27 "Dados básicos" do Nutri + C33 grupo Perfil e C32 grupo Dados do Calc): o
 * cadastro da matrícula (nome, apelido, nascimento e idade, sexo, CPF, telefone com o WhatsApp, e-mail, objetivo, tags, datas)
 * e o corpo (altura e peso: os do Banco do Treino para quem tem treino, senão os da última antropometria). "Editar" abre a
 * folha do cadastro (a mesma do ⋯ do cabeçalho). Substitui o "Dados" do Configurar aluno antigo embaixo dos cards.
 */
export default function CardDadosAluno({ alunoId }: { alunoId: string }) {
  const q = usePerfilAluno(alunoId);
  const p = q.data;
  const t = useTreinoDoAluno(p);
  const treino = t.data?.profile ?? null;
  const [editar, setEditar] = useState(false);
  const base = `/painel/alunos/${encodeURIComponent(alunoId)}`;

  if (q.isLoading) {
    return (
      <Cartao className="flex min-h-[240px] flex-col px-[18px] py-4 xl:col-span-2" data-card-dados-aluno="carregando">
        <CabecalhoCartao titulo="Dados do aluno" />
        <Esqueleto className="h-[200px] w-full" />
      </Cartao>
    );
  }
  if (!p) {
    return (
      <Cartao className="flex min-h-[240px] flex-col px-[18px] py-4 xl:col-span-2" data-card-dados-aluno="erro">
        <CabecalhoCartao titulo="Dados do aluno" />
        <p className="text-[12.5px] text-texto-3">{mensagemErroPerfil(q.error instanceof Error ? q.error.message : "")}</p>
      </Cartao>
    );
  }

  const idade = idadeDe(p.nascimento ?? treino?.data_nascimento ?? null);
  const nascimento = p.nascimento ?? treino?.data_nascimento ?? null;
  const sexo = rotuloGenero(p.genero) || rotuloGenero(generoDoTreino(treino?.sexo));
  const corpo = corpoDoAluno(p, treino);
  const zap = whatsappDoAluno(p.telefone);
  const fonteCorpo = corpo.fonte === "antropometria" && p.ultima_antropometria ? `antropometria de ${dataBR(p.ultima_antropometria.data)}` : null;

  return (
    <Cartao className="flex min-h-[240px] flex-col px-[18px] py-4 xl:col-span-2" data-card-dados-aluno={p.paciente_id}>
      <CabecalhoCartao
        titulo="Dados do aluno"
        extra={p.tem_login ? <Chip tom="g">COM LOGIN</Chip> : <Chip tom="g">SEM LOGIN</Chip>}
        acao={p.pode_editar ? (
          <button type="button" onClick={() => setEditar(true)} className="flex items-center gap-1.5 text-[12.5px] font-semibold text-violeta-3" data-dados-editar>
            <Pencil aria-hidden className="h-3.5 w-3.5" /> Editar
          </button>
        ) : undefined}
      />
      <div className="grid grid-cols-1 gap-x-6 md:grid-cols-2" data-dados-grade>
        <div className="min-w-0">
          <Linha rotulo="Nome" marca="nome">{p.nome}</Linha>
          <Linha rotulo="Apelido" marca="apelido">{p.apelido}</Linha>
          <Linha rotulo="Nascimento" marca="nascimento">{nascimento ? `${dataBR(nascimento)}${idade !== null ? ` · ${idade} anos` : ""}` : ""}</Linha>
          <Linha rotulo="Sexo" marca="sexo">{sexo}</Linha>
          <Linha rotulo="CPF" marca="cpf">{formatarCPF(p.cpf)}</Linha>
          <Linha rotulo="Objetivo" marca="objetivo">{objetivoDoAluno(p)}</Linha>
        </div>
        <div className="min-w-0">
          <Linha rotulo="Telefone" marca="telefone">
            {p.telefone ? (
              <span className="inline-flex items-center gap-2">
                {formatarTelefone(p.telefone)}
                {zap && (
                  <a href={zap} target="_blank" rel="noreferrer" title="Abrir no WhatsApp" aria-label="Abrir no WhatsApp" className="text-verde-3" data-dados-whatsapp>
                    <MessageCircle aria-hidden className="h-3.5 w-3.5" />
                  </a>
                )}
              </span>
            ) : ""}
          </Linha>
          <Linha rotulo="E-mail" marca="email">{p.email}</Linha>
          <Linha rotulo="Altura" marca="altura">{alturaEmMetros(corpo.alturaCm)}</Linha>
          <Linha rotulo="Peso" marca="peso">{pesoKg(corpo.pesoKg)}</Linha>
          <Linha rotulo="Cadastrado em" marca="criado">{dataHoraBR(p.criado_em)}</Linha>
          <Linha rotulo="Modificado em" marca="modificado">{dataHoraBR(p.atualizado_em)}</Linha>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2" data-dados-tags>
        <span className="text-[12px] text-texto-3">Tags</span>
        {p.tags.length ? p.tags.map((tag) => <Chip key={tag} tom="t" data-dados-tag={tag}>{tag}</Chip>) : <span className="text-[12px] text-texto-4">nenhuma</span>}
        <Link to={`${base}/financeiro`} className="ml-auto text-[12px] font-semibold text-texto-3 hover:text-texto-2" data-dados-tags-editar>
          Editar tags
        </Link>
      </div>
      {fonteCorpo && <p className="mt-2 text-[11.5px] text-texto-3" data-dados-fonte-corpo>Altura e peso da {fonteCorpo}.</p>}
      <SheetEditarDados aberto={editar} aoFechar={() => setEditar(false)} perfil={p} treino={treino} alunoId={alunoId} />
    </Cartao>
  );
}
