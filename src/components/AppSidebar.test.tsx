import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({ user: { id: "m1", email: "master@x.com", user_metadata: { full_name: "Weslley" } }, papel: "master", signOut: vi.fn() }),
}));

import { ADMIN_ITEMS, MASTER_ITEMS, MobileNavBar } from "./AppSidebar";

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
