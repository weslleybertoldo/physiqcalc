import { useEffect } from "react";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({ user: { id: "m1", email: "master@x.com", user_metadata: { full_name: "Weslley" } }, papel: "master", signOut: vi.fn() }),
}));
// o mesmo hook alimenta o SidebarProvider (drawer × sidebar fixa) — alternado por teste
let celular = false;
vi.mock("@/hooks/use-mobile", () => ({ useIsMobile: () => celular }));

import { ADMIN_ITEMS, MASTER_ITEMS, MobileNavBar, AppSidebar } from "./AppSidebar";
import { SidebarProvider, useSidebar } from "@/components/ui/sidebar";

describe("navegação Admin ↔ Master sem atalhos (pedido 13/09/2026)", () => {
  it("itens do Admin só apontam pro Admin e os do Master só pro Master", () => {
    expect(ADMIN_ITEMS.every((i) => i.url.startsWith("/admin"))).toBe(true);
    expect(MASTER_ITEMS.every((i) => i.url.startsWith("/master"))).toBe(true);
  });

  it("trilho mobile do Admin, logado como master: só os itens do Admin (sem 'Master')", () => {
    render(
      <MemoryRouter initialEntries={["/admin/alunos"]}>
        <MobileNavBar items={ADMIN_ITEMS} modo="admin" />
      </MemoryRouter>,
    );
    expect(screen.queryByText("Master")).toBeNull();
    expect(document.querySelector('[data-nav="switch"]')).toBeNull();
    expect(screen.getAllByRole("button")).toHaveLength(ADMIN_ITEMS.length);
  });

  it("trilho mobile do Master: só os itens do Master (sem 'Admin')", () => {
    render(
      <MemoryRouter initialEntries={["/master"]}>
        <MobileNavBar items={MASTER_ITEMS} modo="master" />
      </MemoryRouter>,
    );
    expect(screen.queryByText("Admin")).toBeNull();
    expect(document.querySelector('[data-nav="switch"]')).toBeNull();
    expect(screen.getAllByRole("button")).toHaveLength(MASTER_ITEMS.length);
  });
});

// abre o drawer do celular (no app é o hambúrguer do header)
function AbrirDrawer() {
  const { setOpenMobile } = useSidebar();
  useEffect(() => { setOpenMobile(true); }, [setOpenMobile]);
  return null;
}

describe("sidebar do celular mostra os nomes (pedido 18/09/2026)", () => {
  it("drawer no celular, mesmo com o provider 'collapsed' (defaultOpen=false), mostra títulos e 'Professor · nome'", async () => {
    celular = true;
    render(
      <MemoryRouter initialEntries={["/admin/alunos"]}>
        <SidebarProvider defaultOpen={false}>
          <AppSidebar items={ADMIN_ITEMS} modo="admin" />
          <AbrirDrawer />
        </SidebarProvider>
      </MemoryRouter>,
    );
    // o drawer (Sheet) abre num portal e o tooltip do item focado repete o título (inline, oculto) → ler os BOTÕES do menu
    const drawer = await waitFor(() => {
      const el = document.querySelector('[data-sidebar="sidebar"][data-mobile="true"]');
      expect(el).not.toBeNull();
      return el as HTMLElement;
    });
    const rotulos = Array.from(drawer.querySelectorAll('[data-sidebar="menu-button"]')).map((b) => b.textContent?.trim());
    for (const it of ADMIN_ITEMS) expect(rotulos).toContain(it.title);
    expect(rotulos).toContain("Sair");
    expect(drawer.textContent).toMatch(/Professor · Weslley/);
    expect(drawer.textContent).toMatch(/PHYSIQCALC/);
    celular = false;
  });

  it("no desktop recolhida continua só com ícones (sem títulos, sem o rótulo)", () => {
    celular = false;
    render(
      <MemoryRouter initialEntries={["/admin/alunos"]}>
        <SidebarProvider defaultOpen={false}>
          <AppSidebar items={ADMIN_ITEMS} modo="admin" />
        </SidebarProvider>
      </MemoryRouter>,
    );
    expect(screen.queryByText("Cobrança")).toBeNull();
    expect(screen.queryByText(/Professor · Weslley/)).toBeNull();
  });
});
