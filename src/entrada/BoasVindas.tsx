import { Suspense } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Briefcase, LogOut } from "lucide-react";
import { listar } from "@/rotas/registro";
import { useSessao } from "@/nucleo/sessao";
import { Cartao } from "@/ui/premium/Cartao";
import { Chip } from "@/ui/premium/Chip";
import { Esqueleto } from "@/ui/premium/Estados";
import { LimiteDeErro } from "@/ui/casca/LimiteDeErro";
import { MolduraEntrada, TituloEntrada } from "./pecas/Moldura";

/** Ordem das opções (spec 4.2): primeiro o código do profissional, depois "Sou profissional" (W4). */
const ORDEM = ["TenhoCodigo", "CriarConta"];

/** Enquanto a W4 não traz o "Sou profissional", o cartão avisa que o cadastro abre em breve. */
function SouProfissionalEmBreve() {
  return (
    <Cartao data-onboarding="CriarConta-em-breve" className="flex items-start gap-3 p-4">
      <span className="flex h-11 w-11 flex-none items-center justify-center rounded-[14px] border border-linha bg-superficie text-verde-3">
        <Briefcase aria-hidden className="h-5 w-5" strokeWidth={1.8} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-2">
          <span className="text-[15px] font-semibold tracking-[-0.01em] text-texto">Sou profissional</span>
          <Chip tom="a">EM BREVE</Chip>
        </span>
        <span className="mt-0.5 block text-[13px] leading-relaxed text-texto-2">
          O cadastro de profissional abre em breve. Até lá, o Physiq convida os profissionais.
        </span>
      </span>
    </Cartao>
  );
}

/**
 * Boas-vindas (W3, spec 4.2): quem entrou sem convite, sem conta e sem matrícula escolhe "Tenho um código do meu
 * profissional" ou "Sou profissional". Quem não escolhe fica "sem conta" (o master vê no painel master).
 */
export default function BoasVindas() {
  const { situacao, usuario, sair } = useSessao();
  const opcoes = listar("onboarding", ORDEM);
  const temCriarConta = opcoes.some((o) => o.nome === "CriarConta");
  const primeiroNome = (situacao?.nome || usuario?.email?.split("@")[0] || "").split(" ")[0];
  const jaTemAlgo = !!situacao && !situacao.sem_nada;

  return (
    <MolduraEntrada
      voltar={
        <button type="button" onClick={() => void sair()} className="pq-botao pq-botao-g pq-botao-sm" data-boas-vindas-sair>
          <LogOut aria-hidden /> Sair
        </button>
      }
    >
      <TituloEntrada sobre="Boas-vindas," titulo={primeiroNome || "ao Physiq"} texto="Como você vai usar o Physiq?" />
      <div className="flex flex-col gap-3" data-boas-vindas-opcoes>
        {opcoes.map(({ nome, Componente }) => (
          <LimiteDeErro key={nome} nome={`onboarding ${nome}`}>
            <Suspense fallback={<Esqueleto className="h-40 w-full rounded-[22px]" />}>
              <Componente />
            </Suspense>
          </LimiteDeErro>
        ))}
        {!temCriarConta && <SouProfissionalEmBreve />}
      </div>
      {jaTemAlgo ? (
        <Link to="/" className="pq-botao pq-botao-g w-full" data-boas-vindas-continuar>
          Continuar para o app <ArrowRight aria-hidden />
        </Link>
      ) : (
        <p className="px-1 text-center text-[12.5px] leading-relaxed text-texto-3">
          Ainda sem o código? Pode sair e voltar depois — a sua conta fica guardada.
        </p>
      )}
    </MolduraEntrada>
  );
}
