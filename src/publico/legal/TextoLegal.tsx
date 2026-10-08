import { Fragment } from "react";
import { Link } from "react-router-dom";
import { cn } from "@/lib/utils";
import { lerMarkdown, semQuebra, type Bloco, type ItemLista, type Trecho } from "./markdown";

/**
 * hml-11 (H-28, D3) — o texto legal montado em React a partir do Markdown simples (o leitor do Nativo OS, com o `Link` do
 * react-router no lugar do next/link). Letra de 16 px (o CDC, art. 54, § 3º, pede corpo 12 nos contratos de adesão), títulos com
 * âncora e tabela com rolagem própria para o lado no celular (a página não estoura). Na impressão, o CSS da PaginaLegal tira a
 * rolagem e as cores.
 */

/** Como os links internos (/privacidade, /termos, /assinatura) abrem: o `state` do app (o Voltar), trocando a página, ou em outra aba. */
export interface ComoAbrirLinks {
  state?: unknown;
  replace?: boolean;
  novaAba?: boolean;
}

const CLASSE_LINK = "font-semibold text-violeta-3 underline-offset-2 hover:underline";

export function TextoLegal({ markdown, links }: { markdown: string; links?: ComoAbrirLinks }) {
  return (
    <div className="flex flex-col gap-4 text-[16px] leading-[1.7] text-texto-2" data-texto-legal>
      {lerMarkdown(markdown).map((bloco, i) => (
        <BlocoLegal key={i} bloco={bloco} links={links} nivel={0} />
      ))}
    </div>
  );
}

function BlocoLegal({ bloco, links, nivel }: { bloco: Bloco; links?: ComoAbrirLinks; nivel: number }) {
  switch (bloco.tipo) {
    case "titulo":
      return bloco.nivel === 2 ? (
        <h2 id={bloco.id} className="mt-5 scroll-mt-4 font-body text-[19px] font-semibold normal-case leading-snug tracking-[-0.015em] text-texto first:mt-0">
          {bloco.texto}
        </h2>
      ) : (
        <h3 id={bloco.id} className="mt-2 scroll-mt-4 font-body text-[17px] font-semibold normal-case leading-snug tracking-[-0.01em] text-texto">
          {bloco.texto}
        </h3>
      );
    case "paragrafo":
      return (
        <p>
          <Trechos trechos={bloco.trechos} links={links} />
        </p>
      );
    case "lista":
      return <ListaLegal itens={bloco.itens} links={links} nivel={nivel} />;
    case "tabela":
      return <TabelaLegal bloco={bloco} links={links} />;
  }
}

/** Lista com os subitens (o resumo antes de pagar usa a mesma, com a letra dele). */
export function ListaLegal({ itens, links, nivel = 0 }: { itens: ItemLista[]; links?: ComoAbrirLinks; nivel?: number }) {
  return (
    <ul className={cn("flex flex-col gap-1.5 pl-5 marker:text-texto-3", nivel === 0 ? "list-disc" : "list-[circle]")}>
      {itens.map((item, i) => (
        <li key={i}>
          <Trechos trechos={item.trechos} links={links} />
          {item.dentro.length > 0 && (
            <div className="mt-1.5 flex flex-col gap-2">
              {item.dentro.map((bloco, j) => (
                <BlocoLegal key={j} bloco={bloco} links={links} nivel={nivel + 1} />
              ))}
            </div>
          )}
        </li>
      ))}
    </ul>
  );
}

function TabelaLegal({ bloco, links }: { bloco: Extract<Bloco, { tipo: "tabela" }>; links?: ComoAbrirLinks }) {
  const titulo = bloco.cabecalho.map((c) => c.map((t) => t.texto).join("")).join(", ");
  return (
    // a tabela rola sozinha para o lado no celular; o foco pelo teclado deixa rolar sem o mouse
    <div role="region" aria-label={`Tabela: ${titulo}`} tabIndex={0} className="overflow-x-auto rounded-[14px] border border-linha" data-tabela-legal>
      <table className="w-full min-w-[36rem] border-collapse text-left">
        <thead className="bg-superficie">
          <tr>
            {bloco.cabecalho.map((celula, i) => (
              <th key={i} scope="col" className="px-3 py-2 align-bottom font-semibold text-texto">
                <Trechos trechos={celula} links={links} />
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {bloco.linhas.map((linha, i) => (
            <tr key={i} className="border-t border-linha">
              {linha.map((celula, j) => (
                <td key={j} className="px-3 py-2 align-top">
                  <Trechos trechos={celula} links={links} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Os trechos de uma linha (negrito e link) — também no resumo antes de pagar. */
export function Trechos({ trechos, links }: { trechos: Trecho[]; links?: ComoAbrirLinks }) {
  return (
    <>
      {trechos.map((t, i) => {
        const texto = semQuebra(t.texto);
        if (t.link?.startsWith("/")) {
          return links?.novaAba ? (
            <Link key={i} to={t.link} target="_blank" rel="noopener" className={CLASSE_LINK}>
              {texto}
            </Link>
          ) : (
            <Link key={i} to={t.link} state={links?.state} replace={links?.replace} className={CLASSE_LINK}>
              {texto}
            </Link>
          );
        }
        if (t.link) {
          return (
            <a key={i} href={t.link} className={CLASSE_LINK}>
              {texto}
            </a>
          );
        }
        return t.negrito ? (
          <strong key={i} className="font-semibold text-texto">
            {texto}
          </strong>
        ) : (
          <Fragment key={i}>{texto}</Fragment>
        );
      })}
    </>
  );
}
