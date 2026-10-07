import { useEffect, type ReactNode } from "react";
import { Link, useLocation } from "react-router-dom";
import { ArrowLeft, Database, FileCheck2, Lock, Scale, ShieldCheck, Trash2, UserRound, type LucideIcon } from "lucide-react";
import { CONTATO_SUPORTE } from "@/nucleo/suporte";
import { Cartao } from "@/ui/premium/Cartao";
import { Chip } from "@/ui/premium/Chip";

const ATUALIZADA_EM = "2 de outubro de 2026";

function Secao({ id, icone: Icone, titulo, children }: { id: string; icone: LucideIcon; titulo: string; children: ReactNode }) {
  return (
    <Cartao className="p-5 sm:p-6" data-secao-privacidade={id}>
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

/**
 * /privacidade e /termos (W26 — C13): a Política de Privacidade e os Termos de uso do Physiq, sem login, na marca Physiq (o mesmo texto
 * nas 2 rotas; /termos abre já na parte dos termos). Fica FORA das App Links do APK (como as outras públicas — H2). Substitui a
 * src/pages/PrivacidadePage.tsx antiga, com o texto atualizado ao app único (treino + alimentação, os 2 bancos, quem vê o quê,
 * Exportar/Excluir no Perfil). W2 da loja: o parágrafo da Exclusão cobre o profissional e aponta a página /excluir-conta.
 */
export default function Privacidade() {
  const { pathname } = useLocation();
  const termos = pathname.startsWith("/termos");
  useEffect(() => {
    if (termos) document.getElementById("termos")?.scrollIntoView({ block: "start" });
  }, [termos]);
  return (
    <div className="mx-auto w-full max-w-3xl px-4 pb-6 pt-5 sm:px-8" data-pagina-privacidade data-rota={termos ? "termos" : "privacidade"}>
      <Link to="/" className="inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-texto-3 transition-colors hover:text-texto-2" data-voltar>
        <ArrowLeft aria-hidden className="h-4 w-4" /> Voltar
      </Link>
      <header className="mb-4 mt-3">
        <div className="flex flex-wrap items-center gap-2">
          <Chip tom="t">PRIVACIDADE</Chip>
          <Chip tom="n">TERMOS DE USO</Chip>
        </div>
        <h1 className="mt-3 font-body text-[26px] font-bold normal-case tracking-[-0.03em] text-texto sm:text-[32px]">Política de Privacidade e Termos</h1>
        <p className="mt-1 text-[13px] text-texto-3" data-atualizada-em>Última atualização: {ATUALIZADA_EM}</p>
      </header>

      <div className="flex flex-col gap-3.5">
        <Secao id="quem-somos" icone={UserRound} titulo="Quem somos">
          <p>
            O Physiq é um aplicativo de treino e alimentação: o aluno acompanha o treino, a dieta e a evolução, e o profissional (personal trainer e
            nutricionista) prescreve e acompanha pelo site. É operado por Weslley Bertoldo (Maceió-AL, Brasil). Contato: {CONTATO_SUPORTE}.
          </p>
        </Secao>

        <Secao id="dados" icone={Database} titulo="Dados coletados">
          <ul className="space-y-1">
            <li><strong>Conta</strong>: nome, e-mail e foto (do Google, quando você entra com ele) ou e-mail e senha.</li>
            <li><strong>Perfil e avaliações</strong>: dados que você ou o seu profissional inserirem (peso, altura, idade, sexo, dobras, medidas, fotos de avaliação, objetivo).</li>
            <li><strong>Treino</strong>: séries, exercícios, cargas, repetições, datas e comentários.</li>
            <li><strong>Alimentação</strong>: plano alimentar, refeições marcadas, metas, fotos do diário alimentar e o que o seu nutricionista registrar (anamnese, antropometria, prontuário).</li>
            <li><strong>Agenda e pagamentos</strong>: consultas, mensalidades, comprovantes de Pix e recibos (pagamentos com cartão passam pelo Mercado Pago).</li>
            <li><strong>Técnicos</strong>: identificador do usuário, datas e registros mínimos de erro para correção.</li>
          </ul>
        </Secao>

        <Secao id="uso" icone={FileCheck2} titulo="Como usamos">
          <p>
            Os dados são usados só para: (a) autenticar você; (b) calcular métricas (TMB, % de gordura, macros, adesão); (c) mostrar ao seu profissional
            o que ele acompanha; (d) sincronizar o seu histórico entre aparelhos. Não há venda de dados, anúncios, analytics de terceiros (Google Analytics,
            Facebook Pixel) nem cookies de rastreamento.
          </p>
        </Secao>

        <Secao id="armazenamento" icone={Lock} titulo="Onde ficam e quem vê">
          <p>
            Em dois bancos de dados Supabase (PostgreSQL): o do treino na região us-east-1 e o principal (conta, alimentação, agenda e pagamentos) na
            região sa-east-1 (São Paulo), com regras de acesso por linha (Row Level Security). Uma cópia do treino fica no aparelho (SQLite, PowerSync)
            para funcionar sem internet.
          </p>
          <p>
            Você vê os seus dados. O seu personal vê o treino e as avaliações; o seu nutricionista vê a alimentação e o prontuário. As anotações
            clínicas ficam só com o nutricionista. O dono da conta do profissional vê os alunos da conta.
          </p>
        </Secao>

        <Secao id="direitos" icone={ShieldCheck} titulo="Seus direitos (LGPD, art. 18)">
          <ul className="space-y-1">
            <li><strong>Acesso e portabilidade</strong>: no app, Perfil › Exportar meus dados baixa os seus dados em JSON.</li>
            <li>
              <strong>Exclusão</strong>: pelo app ou pela página{" "}
              <Link to="/excluir-conta" className="font-semibold text-violeta-3 underline-offset-2 hover:underline" data-link-excluir-conta>Excluir conta</Link>.
              Aluno: Perfil › Excluir minha conta apaga o seu login nos dois bancos, os seus dados de treino e o que você enviou pelo app (fotos do diário, marcações, foto do perfil); o que o profissional registrou no atendimento (avaliações, planos, prontuário, cobranças e recibos) fica com ele, desligado do seu login.
              Profissional: Configurações › Excluir minha conta apaga o login e os dados do perfil e encerra a conta (a equipe perde o acesso e a cobrança automática do plano é cancelada); antes, ele baixa os prontuários, e o histórico de cada aluno fica guardado na matrícula dele (Res. CFN 594/2017 e Lei 13.787/2018). Operação irreversível.
            </li>
            <li><strong>Correção</strong>: edite o seu perfil no app ou peça ao seu profissional.</li>
            <li><strong>Reclamação</strong>: você pode procurar a ANPD (gov.br/anpd).</li>
          </ul>
        </Secao>

        <Secao id="retencao" icone={Trash2} titulo="Retenção">
          <p>
            Séries de treino com mais de 12 meses saem do aparelho automaticamente. O que o profissional exclui fica 30 dias na lixeira e depois é
            apagado de vez. Backups operacionais do Supabase podem guardar cópias por até 7 dias.
          </p>
        </Secao>

        <Secao id="termos" icone={Scale} titulo="Termos de uso">
          <p>
            O Physiq é fornecido "como está", sem garantia médica. Os cálculos são estimativas baseadas em fórmulas reconhecidas (Mifflin-St Jeor,
            Katch-McArdle, Jackson & Pollock) e <strong>não substituem a avaliação de um profissional</strong>. Consulte nutricionista e médico antes de
            começar uma dieta ou um treino. O profissional é responsável pelo que prescreve aos seus alunos.
          </p>
        </Secao>
      </div>
    </div>
  );
}
