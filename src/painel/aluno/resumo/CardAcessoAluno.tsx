import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, KeyRound, Lock, Mail, UserPlus } from "lucide-react";
import { Botao } from "@/ui/premium/Botao";
import { CabecalhoCartao, Cartao } from "@/ui/premium/Cartao";
import { Chip } from "@/ui/premium/Chip";
import { Esqueleto } from "@/ui/premium/Estados";
import { acessoDoAluno } from "./acesso/api";
import { SheetSenhaAluno } from "./acesso/SheetSenhaAluno";
import {
  ROTULO_ESTADO,
  TOM_ESTADO,
  estadoDoAcesso,
  horaDoBloqueio,
  textoErroAcesso,
  textoUltimoAcesso,
} from "./acesso/regras";

function Linha({ rotulo, children, marca }: { rotulo: string; children: React.ReactNode; marca: string }) {
  return (
    <div className="flex items-center gap-3 border-b border-linha py-2.5 text-[13px] last:border-b-0" data-acesso-linha={marca}>
      <span className="flex-none text-texto-3">{rotulo}</span>
      <span className="ml-auto min-w-0 truncate text-right font-medium text-texto">{children}</span>
    </div>
  );
}

/**
 * Card "Acesso do aluno" do Resumo (spec 4.5, padrão da tela 7 — W8b): como o aluno entra (e-mail do login, Google ou senha,
 * último acesso), a senha provisória e o bloqueio por tentativas. O profissional responsável (dono da conta, personal ou
 * nutricionista do aluno) e o master CRIAM O ACESSO ou uma SENHA NOVA — provisória: no 1º login o aluno cria a dele — e a
 * senha nova destrava a conta bloqueada. A W14 acrescenta aqui "Desativar" e "Remover acesso".
 */
export default function CardAcessoAluno({ alunoId }: { alunoId: string }) {
  const q = useQuery({
    queryKey: ["acesso-aluno", alunoId],
    queryFn: () => acessoDoAluno(alunoId),
    enabled: !!alunoId,
    staleTime: 20_000,
    retry: (n, e) => !/sem_acesso|aluno_inexistente/.test(e instanceof Error ? e.message : "") && n < 1,
    networkMode: "online",
  });
  const [folha, setFolha] = useState(false);
  const d = q.data;
  const a = d?.acesso ?? null;
  const estado = estadoDoAcesso(d);
  const criar = !a;

  return (
    <Cartao className="flex min-h-[240px] flex-col px-[18px] py-4" data-card-acesso-aluno data-acesso-estado={q.isLoading ? "carregando" : estado}>
      {/* título longo num card de 1/3 da largura (tela 7): o título não quebra e a ação fica no rodapé, como no card Financeiro */}
      <CabecalhoCartao
        titulo={<span className="whitespace-nowrap">Acesso do aluno</span>}
        extra={d ? <Chip tom={TOM_ESTADO[estado]} className="ml-auto" data-acesso-chip>{ROTULO_ESTADO[estado]}</Chip> : undefined}
      />
      {q.isLoading ? (
        <Esqueleto className="h-[132px] w-full" />
      ) : q.isError || !d ? (
        <p className="text-[12.5px] text-texto-3" data-acesso-erro>
          {textoErroAcesso(q.error instanceof Error ? q.error.message : "", "Não deu para carregar agora.")}
        </p>
      ) : !a ? (
        <div className="flex flex-1 flex-col gap-3" data-acesso-sem>
          <p className="text-[12.5px] leading-relaxed text-texto-2">
            {d.nome?.trim().split(/\s+/)[0] || "O aluno"} ainda não tem login no app. Crie o acesso com uma senha provisória e passe a ele —
            no primeiro acesso ele cria a senha dele. Quem usa Gmail também pode entrar com o Google.
          </p>
          {d.email && (
            <div className="flex items-center gap-2 text-[12.5px] text-texto-3">
              <Mail aria-hidden className="h-4 w-4 flex-none" /> <span className="truncate">{d.email}</span>
            </div>
          )}
          <Botao tamanho="sm" icone={UserPlus} onClick={() => setFolha(true)} className="mt-auto self-start" data-acesso-criar>
            Criar acesso
          </Botao>
        </div>
      ) : (
        <div className="flex flex-col" data-acesso-dados>
          <Linha rotulo="E-mail (login)" marca="email"><span data-acesso-email>{a.email}</span></Linha>
          <Linha rotulo="Entra com" marca="formas">
            <span className="inline-flex flex-wrap justify-end gap-1.5">
              {a.entra_com_google && <Chip tom="g">GOOGLE</Chip>}
              {a.tem_senha !== false && <Chip tom="g">E-MAIL E SENHA</Chip>}
            </span>
          </Linha>
          <Linha rotulo="Último acesso" marca="ultimo">{textoUltimoAcesso(a.ultimo_acesso)}</Linha>
          {a.senha_provisoria && (
            <Linha rotulo="Senha" marca="provisoria"><span className="text-ambar-3">Provisória · ele cria a dele ao entrar</span></Linha>
          )}
        </div>
      )}
      {a && (estado === "bloqueado" || estado === "bloqueado_de_vez") && (
        <div className="mt-3 flex items-start gap-2.5 rounded-2xl border border-rosa/30 px-3.5 py-2.5 text-[12.5px] leading-relaxed text-texto"
          style={{ background: "linear-gradient(90deg, var(--p-chip-r-fundo), transparent)" }} data-acesso-bloqueio={estado}>
          <Lock aria-hidden className="mt-0.5 h-4 w-4 flex-none text-rosa-3" />
          <span>
            {estado === "bloqueado_de_vez"
              ? "Bloqueado de vez por tentativas de senha. Crie uma senha nova para destravar."
              : `Bloqueado por tentativas de senha até ${horaDoBloqueio(a.bloqueio?.bloqueado_ate)}. Uma senha nova destrava na hora.`}
          </span>
        </div>
      )}
      {a && estado === "desativado" && (
        <div className="mt-3 flex items-start gap-2.5 text-[12.5px] text-texto-2" data-acesso-desativado>
          <AlertTriangle aria-hidden className="mt-0.5 h-4 w-4 flex-none text-ambar-3" /> O acesso deste aluno está desativado.
        </div>
      )}
      {d && !criar && (
        <div className="mt-auto flex flex-col gap-1 pt-3">
          <button type="button" onClick={() => setFolha(true)} className="flex items-center gap-1.5 self-start text-[12.5px] font-semibold text-violeta-3"
            data-acesso-acao="senha">
            <KeyRound aria-hidden className="h-3.5 w-3.5 flex-none" /> Criar senha nova
          </button>
          <p className="text-[11.5px] leading-relaxed text-texto-3" data-acesso-dica>
            Esqueceu a senha ou foi bloqueado? Gere uma provisória e passe a ele — no 1º acesso ele cria a dele.
          </p>
        </div>
      )}
      {d && (
        <SheetSenhaAluno
          aberto={folha}
          criar={criar}
          pacienteId={d.paciente_id}
          nome={d.nome}
          emailCadastro={d.email}
          emailLogin={a?.email ?? null}
          aoFechar={() => setFolha(false)}
          aoSalvar={() => q.refetch()}
        />
      )}
    </Cartao>
  );
}
