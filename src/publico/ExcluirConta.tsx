import { useEffect, useState, type ReactNode } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { ArrowLeft, Archive, CheckCircle2, LifeBuoy, LogIn, Smartphone, Trash2, UserRound, type LucideIcon } from "lucide-react";
import { ehLoja } from "@/lib/distribuicao";
import { esquecerPedidoExclusao, guardarPedidoExclusao, pedidoExclusaoPendente, ROTA_EXCLUIR_CONTA } from "@/lib/pedidoExclusao";
import { useSessao } from "@/nucleo/sessao";
import { CONTATO_SUPORTE, linkDoSuporte } from "@/nucleo/suporte";
import { lembrarArea } from "@/ui/casca/area";
import { Botao } from "@/ui/premium/Botao";
import { Cartao } from "@/ui/premium/Cartao";
import { Chip } from "@/ui/premium/Chip";
import type { ResultadoExclusao } from "@/painel/configuracoes/excluirConta/api";
import { destinoDaExclusao } from "@/painel/configuracoes/excluirConta/regras";
import { FRASE_BACKUPS } from "./privacidade/textos";

function Secao({ id, icone: Icone, titulo, children }: { id: string; icone: LucideIcon; titulo: string; children: ReactNode }) {
  return (
    <Cartao className="p-5 sm:p-6" data-secao-excluir={id}>
      <h2 id={id} className="flex items-center gap-2.5 font-body text-[16px] font-semibold normal-case tracking-[-0.01em] text-texto">
        <span className="flex h-9 w-9 flex-none items-center justify-center rounded-[12px] border border-linha bg-superficie text-violeta-3">
          <Icone aria-hidden className="h-[17px] w-[17px]" strokeWidth={1.75} />
        </span>
        {titulo}
      </h2>
      <div className="mt-3 space-y-2 text-[13.5px] leading-relaxed text-texto-2 [&_li]:ml-4 [&_li]:list-disc [&_strong]:font-semibold [&_strong]:text-texto">{children}</div>
    </Cartao>
  );
}

type Feito = ResultadoExclusao & { nome?: string | null };

function TelaExcluida({ feito }: { feito: Feito }) {
  const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;
  const linhas: string[] = [];
  if (feito.contas.length) linhas.push(`${feito.contas.length === 1 ? "A conta" : "As contas"} ${feito.contas.join(", ")} ${feito.contas.length === 1 ? "foi encerrada" : "foram encerradas"}.`);
  if (feito.alunos_para_o_app > 0) linhas.push(`${plural(feito.alunos_para_o_app, "aluno com login continua", "alunos com login continuam")} no app, sem profissional.`);
  if (feito.alunos_guardados > 0) linhas.push(`O histórico de ${plural(feito.alunos_guardados, "aluno ficou guardado", "alunos ficou guardado")} com as matrículas.`);
  if (feito.membros_removidos > 0) linhas.push(`${plural(feito.membros_removidos, "profissional da equipe perdeu", "profissionais da equipe perderam")} o acesso.`);
  if (feito.equipes_que_saiu > 0) linhas.push(`Você saiu de ${plural(feito.equipes_que_saiu, "equipe", "equipes")}; os seus alunos ficaram com o dono da conta.`);
  if (feito.cobrancas_canceladas > 0) linhas.push(`${plural(feito.cobrancas_canceladas, "cobrança automática foi cancelada", "cobranças automáticas foram canceladas")}.`);
  linhas.push("O seu login foi apagado: não dá mais para entrar com ele.");
  return (
    <Cartao brilho className="flex flex-col gap-4 p-5 sm:p-6" data-excluir-feito>
      <div className="flex items-start gap-3">
        <span className="flex h-11 w-11 flex-none items-center justify-center rounded-2xl border border-linha bg-superficie text-verde-2">
          <CheckCircle2 aria-hidden className="h-[22px] w-[22px]" strokeWidth={1.8} />
        </span>
        <div className="min-w-0">
          <h1 className="font-body text-[22px] font-bold normal-case leading-tight tracking-[-0.03em] text-texto">Sua conta foi excluída</h1>
          <p className="mt-1 text-[13px] text-texto-2">{feito.nome ? `${feito.nome}, o` : "O"} Physiq não guarda mais o seu acesso.</p>
        </div>
      </div>
      <ul className="list-disc space-y-1 pl-4 text-[13px] leading-relaxed text-texto-2" data-excluir-feito-resumo>
        {linhas.map((l) => <li key={l}>{l}</li>)}
      </ul>
      <p className="text-[12.5px] leading-relaxed text-texto-3">
        O que foi registrado no atendimento dos alunos fica guardado com a matrícula de cada um (a guarda que a lei pede para o prontuário).
        Dúvidas: {CONTATO_SUPORTE}.
      </p>
      <Link to="/entrar" replace className="pq-botao pq-botao-g self-start" data-excluir-feito-sair>
        <ArrowLeft aria-hidden /> Ir para a tela de entrada
      </Link>
    </Cartao>
  );
}

/**
 * /excluir-conta (W2 da loja — a URL do formulário "Segurança dos dados" da Google Play): como excluir a conta pelo app (aluno: Perfil ›
 * Excluir minha conta; profissional: Configurações › Excluir minha conta) e pelo site — "Entrar para excluir" → login → a tela de
 * exclusão certa (o mesmo fluxo do app). Diz o que é apagado e o que fica guardado (e por quê) e o contato do suporte. Funciona sem
 * login e na versão da loja (sem nada de pagamento). Depois de excluir, o fluxo do painel cai aqui com o resumo ("Conta excluída").
 * W3 da loja: a frase das cópias de segurança é a MESMA da política (src/publico/privacidade/textos.ts), sem o "até 7 dias".
 * W4 da loja: a mesma frase, agora com o prazo — as cópias são apagadas em até 30 dias.
 */
export default function ExcluirConta() {
  const { pronto, usuario, situacao, erroSituacao } = useSessao();
  const location = useLocation();
  const navigate = useNavigate();
  const feito = (location.state as { excluida?: Feito } | null)?.excluida ?? null;
  // lido uma vez (o StrictMode do dev renderiza 2×; o pedido só é apagado no efeito, junto com a ida)
  const [veioPedir] = useState(() => pedidoExclusaoPendente());
  const logado = Boolean(usuario) && !feito;
  const destino = logado && situacao ? destinoDaExclusao(situacao) : null;
  const indo = logado && veioPedir && Boolean(destino);

  useEffect(() => {
    if (feito) esquecerPedidoExclusao();
  }, [feito]);

  // voltou do login pedido aqui ("Entrar para excluir"): direto para a tela de exclusão certa
  useEffect(() => {
    if (!indo || !destino) return;
    esquecerPedidoExclusao();
    lembrarArea(destino.startsWith("/painel") ? "painel" : "aluno");
    navigate(destino, { replace: true });
  }, [indo, destino, navigate]);
  if (indo) return <div className="mx-auto w-full max-w-3xl px-4 pt-8 text-[13px] text-texto-3 sm:px-8" data-pagina-excluir-conta data-estado="indo">Abrindo a exclusão…</div>;

  const entrar = () => {
    guardarPedidoExclusao();
    navigate("/entrar", { state: { de: ROTA_EXCLUIR_CONTA } });
  };
  const continuar = () => {
    if (!destino) return;
    lembrarArea(destino.startsWith("/painel") ? "painel" : "aluno");
    navigate(destino);
  };

  return (
    <div className="mx-auto w-full max-w-3xl px-4 pb-6 pt-5 sm:px-8" data-pagina-excluir-conta data-estado={feito ? "excluida" : logado ? "logado" : "sem-login"}>
      <Link to="/" className="inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-texto-3 transition-colors hover:text-texto-2" data-voltar>
        <ArrowLeft aria-hidden className="h-4 w-4" /> Voltar
      </Link>
      {feito ? (
        <div className="mt-4"><TelaExcluida feito={feito} /></div>
      ) : (
        <>
          <header className="mb-4 mt-3">
            <div className="flex flex-wrap items-center gap-2">
              <Chip tom="r">EXCLUIR CONTA</Chip>
              <Chip tom="n">LGPD</Chip>
            </div>
            <h1 className="mt-3 font-body text-[26px] font-bold normal-case tracking-[-0.03em] text-texto sm:text-[32px]">Excluir a sua conta do Physiq</h1>
            <p className="mt-1 text-[13.5px] leading-relaxed text-texto-2">
              Você pode excluir a sua conta quando quiser, pelo app ou por esta página. A exclusão é imediata e não dá para desfazer.
            </p>
          </header>

          <div className="flex flex-col gap-3.5">
            <Cartao brilho className="flex flex-col gap-3 p-5 sm:p-6" data-excluir-acao>
              {logado ? (
                <>
                  <p className="text-[13.5px] leading-relaxed text-texto" data-excluir-logado>
                    Você está conectado como <strong className="font-semibold">{usuario?.email ?? "a sua conta"}</strong>.
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <Botao variante="w" icone={Trash2} onClick={continuar} disabled={!destino && !erroSituacao} data-excluir-continuar>
                      {destino || erroSituacao ? "Continuar para excluir" : "Abrindo…"}
                    </Botao>
                  </div>
                </>
              ) : (
                <>
                  <p className="text-[13.5px] leading-relaxed text-texto">
                    <strong className="font-semibold">Pelo site, sem o app:</strong> entre com a mesma conta e você cai direto na tela de exclusão, com os mesmos passos do app.
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <Botao variante="w" icone={LogIn} onClick={entrar} disabled={!pronto} data-excluir-entrar>Entrar para excluir</Botao>
                  </div>
                </>
              )}
            </Cartao>

            <Secao id="pelo-app" icone={Smartphone} titulo="Pelo app">
              <ul className="space-y-1">
                <li><strong>Aluno</strong>: Perfil › Excluir minha conta.</li>
                <li><strong>Profissional</strong> (personal, nutricionista, dono de conta ou membro de equipe): Configurações › Excluir minha conta.</li>
              </ul>
              <p>Antes de confirmar, o app mostra o que vai acontecer — nada muda até você digitar EXCLUIR.</p>
            </Secao>

            <Secao id="apagado" icone={Trash2} titulo="O que é apagado">
              <ul className="space-y-1">
                <li><strong>O seu login</strong> (e-mail, senha e o acesso pelo Google): não dá mais para entrar com ele.</li>
                <li><strong>Aluno</strong>: os seus dados de treino (séries, cargas, histórico), o que você enviou pelo app (fotos do diário, refeições e metas marcadas), a foto do perfil e os avisos.</li>
                <li><strong>Profissional</strong>: a foto, os contatos e o carimbo do perfil e o código de convite. A sua conta é encerrada e a equipe perde o acesso; a cobrança automática do plano é cancelada ({/* hml-11 (D5): a frase nova só no staging até a virada */}
                  {import.meta.env.VITE_DB_SCHEMA === "staging" ? (
                    <span data-frase-desistencia>o que já foi pago não volta, salvo a desistência em até 7 dias depois do pagamento</span>
                  ) : (
                    "sem reembolso do que já foi pago"
                  )}
                  ).</li>
              </ul>
            </Secao>

            <Secao id="guardado" icone={Archive} titulo="O que fica guardado, e por quê">
              <ul className="space-y-1">
                <li>O que o profissional registrou no atendimento do aluno — <strong>prontuário, avaliações, planos de treino e de dieta, cobranças e recibos</strong> — fica guardado na matrícula do aluno, desligado do login de quem excluiu. É a guarda que a lei pede para o prontuário (Res. CFN 594/2017 e Lei 13.787/2018: 20 anos).</li>
                <li>Quando o <strong>profissional</strong> exclui: antes ele baixa os prontuários dos pacientes; {ehLoja
                  ? "os alunos com login continuam usando o app, sem profissional;"
                  : "os alunos com login continuam no app, sem profissional, com 7 dias grátis;"} o histórico fica com cada aluno.</li>
                <li>Quando um <strong>membro de equipe</strong> exclui: ele sai da equipe e os alunos dele ficam com o dono da conta.</li>
                <li data-frase-backups>{FRASE_BACKUPS}</li>
              </ul>
            </Secao>

            <Secao id="ajuda" icone={LifeBuoy} titulo="Ajuda">
              <p>
                Não consegue entrar ou tem dúvida? Fale com o suporte do Physiq:{" "}
                <a href={linkDoSuporte("Excluir minha conta")} className="font-semibold text-violeta-3 underline-offset-2 hover:underline" data-excluir-suporte={CONTATO_SUPORTE}>
                  {CONTATO_SUPORTE}
                </a>.
              </p>
              <p className="flex items-center gap-1.5 text-[12.5px] text-texto-3">
                <UserRound aria-hidden className="h-3.5 w-3.5" />
                <span>Veja também a <Link to="/privacidade" className="font-semibold text-violeta-3 underline-offset-2 hover:underline">Política de Privacidade</Link>.</span>
              </p>
            </Secao>
          </div>
        </>
      )}
    </div>
  );
}
