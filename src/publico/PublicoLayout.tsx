import { Link, Outlet } from "react-router-dom";
import { Marca } from "@/ui/premium/Marca";

/**
 * Casca das páginas sem login (spec 4.8: /f, /d, /c, /p, /calculator, /privacidade, /termos): fundo
 * com o halo, a marca no topo e os links de privacidade e termos no rodapé.
 */
export default function PublicoLayout() {
  return (
    <div data-casca="publico" className="relative isolate flex min-h-screen flex-col text-texto">
      <div aria-hidden className="pq-halo-web pointer-events-none fixed inset-0 -z-10" />
      <header className="mx-auto flex w-full max-w-5xl items-center px-4 pt-[max(16px,env(safe-area-inset-top,0px))] sm:px-8">
        <Link to="/" aria-label="Physiq — início">
          <Marca tamanho={30} />
        </Link>
      </header>
      <main className="w-full flex-1">
        <Outlet />
      </main>
      <footer className="mx-auto flex w-full max-w-5xl flex-wrap items-center gap-x-5 gap-y-1 px-4 pb-[max(20px,env(safe-area-inset-bottom,0px))] pt-6 text-[12px] text-texto-3 sm:px-8">
        <span>Physiq</span>
        <Link to="/privacidade" className="transition-colors hover:text-texto-2">
          Privacidade
        </Link>
        <Link to="/termos" className="transition-colors hover:text-texto-2">
          Termos
        </Link>
      </footer>
    </div>
  );
}
