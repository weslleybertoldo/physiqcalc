// Physiq W16 — porta do PhysiqNutri (main ca9f66f, src/components/orientacoes/Blocos.tsx) para o banco principal. Só os imports mudaram; o resto é o do site antigo.
import { blocosDoMarkdown, trechosInline } from "@/nutricao/editor/lib/orientacoesUtil";

// Renderiza o markdown simples das orientações — os MESMOS blocos que o PDF usa (orientacoesUtil.blocosDoMarkdown).
// Usado no "Ver" da lista, na aba Visualizar do modal e na prévia dos modelos.

const Inline = ({ texto }: { texto: string }) => (
  <>
    {trechosInline(texto).map((t, i) =>
      t.negrito ? (
        <strong key={i} className="font-semibold text-texto" data-negrito>
          {t.texto}
        </strong>
      ) : (
        <span key={i}>{t.texto}</span>
      ),
    )}
  </>
);

interface Props {
  conteudo: string | null | undefined;
  /** espaçamento menor (prévia dentro de modal) */
  compacto?: boolean;
}

export default function Blocos({ conteudo, compacto = false }: Props) {
  const blocos = blocosDoMarkdown(conteudo);
  if (!blocos.length) {
    return (
      <p className="text-sm text-texto-3 font-body italic" data-blocos="0">
        Sem conteúdo.
      </p>
    );
  }
  return (
    <div className={compacto ? "space-y-1.5" : "space-y-2.5"} data-blocos={blocos.length}>
      {blocos.map((b, i) => {
        if (b.tipo === "titulo") {
          return (
            <p key={i} className="text-[16px] font-semibold tracking-[-0.015em] text-texto pt-1" data-bloco-tipo="titulo">
              <Inline texto={b.texto} />
            </p>
          );
        }
        if (b.tipo === "subtitulo") {
          return (
            <p key={i} className="font-semibold text-[11px] uppercase tracking-wider text-verde-3 pt-1" data-bloco-tipo="subtitulo">
              <Inline texto={b.texto} />
            </p>
          );
        }
        if (b.tipo === "lista") {
          return (
            <ul key={i} className="list-disc pl-5 space-y-1 text-sm text-texto-2 font-body marker:text-verde-3" data-bloco-tipo="lista">
              {b.itens.map((item, j) => (
                <li key={j}>
                  <Inline texto={item} />
                </li>
              ))}
            </ul>
          );
        }
        return (
          <p key={i} className="text-sm text-texto-2 font-body leading-relaxed" data-bloco-tipo="paragrafo">
            <Inline texto={b.texto} />
          </p>
        );
      })}
    </div>
  );
}
