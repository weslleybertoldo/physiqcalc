import { blocosDoMarkdown, trechosInline } from "../orientacoesUtil";

// Renderiza o markdown simples das orientações — os MESMOS blocos que o PDF usa (porta do components/orientacoes/Blocos.tsx do
// PhysiqNutri, no visual premium).

function Inline({ texto }: { texto: string }) {
  return (
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
}

export function Blocos({ conteudo }: { conteudo: string | null | undefined }) {
  const blocos = blocosDoMarkdown(conteudo);
  if (!blocos.length) {
    return (
      <p className="text-[13px] italic text-texto-3" data-blocos="0">
        Sem conteúdo.
      </p>
    );
  }
  return (
    <div className="flex flex-col gap-2.5" data-blocos={blocos.length}>
      {blocos.map((b, i) => {
        if (b.tipo === "titulo") {
          return (
            <p key={i} className="pt-1 text-[14.5px] font-semibold tracking-[-0.01em] text-texto" data-bloco-tipo="titulo">
              <Inline texto={b.texto} />
            </p>
          );
        }
        if (b.tipo === "subtitulo") {
          return (
            <p key={i} className="pq-eyebrow pt-1 text-verde-3" data-bloco-tipo="subtitulo">
              <Inline texto={b.texto} />
            </p>
          );
        }
        if (b.tipo === "lista") {
          return (
            <ul key={i} className="flex flex-col gap-1 pl-4 text-[13px] leading-relaxed text-texto-2 marker:text-verde-2 [list-style:disc]" data-bloco-tipo="lista">
              {b.itens.map((item, j) => (
                <li key={j}>
                  <Inline texto={item} />
                </li>
              ))}
            </ul>
          );
        }
        return (
          <p key={i} className="text-[13px] leading-relaxed text-texto-2" data-bloco-tipo="paragrafo">
            <Inline texto={b.texto} />
          </p>
        );
      })}
    </div>
  );
}
