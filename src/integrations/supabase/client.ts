// Mock Supabase client for offline/local usage (no cloud database)
// All data is stored in localStorage

type MockData = Record<string, any[]>;

function getStore(): MockData {
  try {
    const raw = localStorage.getItem("physiq_mock_db");
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveStore(store: MockData) {
  localStorage.setItem("physiq_mock_db", JSON.stringify(store));
}

function getTable(table: string): any[] {
  return getStore()[table] || [];
}

function setTable(table: string, rows: any[]) {
  const store = getStore();
  store[table] = rows;
  saveStore(store);
}

// Simple query builder that mimics Supabase's API
class MockQueryBuilder {
  private _table: string;
  private _filters: Array<{ col: string; op: string; val: any }> = [];
  private _select: string = "*";
  private _orderBy: { col: string; asc: boolean }[] = [];
  private _limit: number | null = null;
  private _single = false;
  private _insertData: any = null;
  private _updateData: any = null;
  private _deleteMode = false;
  private _upsertData: any = null;

  constructor(table: string) {
    this._table = table;
  }

  select(cols: string = "*") {
    this._select = cols;
    return this;
  }

  eq(col: string, val: any) {
    this._filters.push({ col, op: "eq", val });
    return this;
  }

  neq(col: string, val: any) {
    this._filters.push({ col, op: "neq", val });
    return this;
  }

  gt(col: string, val: any) {
    this._filters.push({ col, op: "gt", val });
    return this;
  }

  gte(col: string, val: any) {
    this._filters.push({ col, op: "gte", val });
    return this;
  }

  lt(col: string, val: any) {
    this._filters.push({ col, op: "lt", val });
    return this;
  }

  lte(col: string, val: any) {
    this._filters.push({ col, op: "lte", val });
    return this;
  }

  in(col: string, vals: any[]) {
    this._filters.push({ col, op: "in", val: vals });
    return this;
  }

  order(col: string, opts?: { ascending?: boolean }) {
    this._orderBy.push({ col, asc: opts?.ascending ?? true });
    return this;
  }

  limit(n: number) {
    this._limit = n;
    return this;
  }

  single() {
    this._single = true;
    return this;
  }

  maybeSingle() {
    this._single = true;
    return this;
  }

  insert(data: any) {
    this._insertData = Array.isArray(data) ? data : [data];
    return this;
  }

  upsert(data: any) {
    this._upsertData = Array.isArray(data) ? data : [data];
    return this;
  }

  update(data: any) {
    this._updateData = data;
    return this;
  }

  delete() {
    this._deleteMode = true;
    return this;
  }

  private applyFilters(rows: any[]): any[] {
    return rows.filter((row) =>
      this._filters.every((f) => {
        const val = row[f.col];
        switch (f.op) {
          case "eq": return val === f.val;
          case "neq": return val !== f.val;
          case "gt": return val > f.val;
          case "gte": return val >= f.val;
          case "lt": return val < f.val;
          case "lte": return val <= f.val;
          case "in": return (f.val as any[]).includes(val);
          default: return true;
        }
      })
    );
  }

  async then(resolve: (result: { data: any; error: any }) => void) {
    try {
      if (this._insertData) {
        const rows = getTable(this._table);
        const newRows = this._insertData.map((d: any) => ({
          id: d.id || crypto.randomUUID(),
          created_at: new Date().toISOString(),
          ...d,
        }));
        setTable(this._table, [...rows, ...newRows]);
        resolve({ data: this._single ? newRows[0] : newRows, error: null });
        return;
      }

      if (this._upsertData) {
        let rows = getTable(this._table);
        for (const item of this._upsertData) {
          const idx = rows.findIndex((r) => r.id === item.id);
          if (idx >= 0) {
            rows[idx] = { ...rows[idx], ...item };
          } else {
            rows.push({ id: crypto.randomUUID(), created_at: new Date().toISOString(), ...item });
          }
        }
        setTable(this._table, rows);
        resolve({ data: this._upsertData, error: null });
        return;
      }

      if (this._updateData) {
        let rows = getTable(this._table);
        const filtered = this.applyFilters(rows);
        const ids = new Set(filtered.map((r) => r.id));
        rows = rows.map((r) => (ids.has(r.id) ? { ...r, ...this._updateData } : r));
        setTable(this._table, rows);
        resolve({ data: filtered, error: null });
        return;
      }

      if (this._deleteMode) {
        let rows = getTable(this._table);
        const before = rows.length;
        rows = rows.filter((row) =>
          !this._filters.every((f) => {
            const val = row[f.col];
            switch (f.op) {
              case "eq": return val === f.val;
              case "lt": return val < f.val;
              case "lte": return val <= f.val;
              case "gt": return val > f.val;
              case "gte": return val >= f.val;
              default: return true;
            }
          })
        );
        setTable(this._table, rows);
        resolve({ data: null, error: null });
        return;
      }

      // SELECT
      let rows = getTable(this._table);
      rows = this.applyFilters(rows);

      for (const o of this._orderBy) {
        rows.sort((a, b) => {
          if (a[o.col] < b[o.col]) return o.asc ? -1 : 1;
          if (a[o.col] > b[o.col]) return o.asc ? 1 : -1;
          return 0;
        });
      }

      if (this._limit) rows = rows.slice(0, this._limit);

      if (this._single) {
        resolve({ data: rows[0] || null, error: rows.length === 0 ? { message: "Not found" } : null });
      } else {
        resolve({ data: rows, error: null });
      }
    } catch (err: any) {
      resolve({ data: null, error: { message: err.message } });
    }
  }
}

// Mock auth
const AUTH_KEY = "physiq_auth_user";

function getStoredUser() {
  try {
    const raw = localStorage.getItem(AUTH_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

type AuthCallback = (event: string, session: any) => void;
let authListeners: AuthCallback[] = [];

function notifyAuthListeners(event: string, user: any) {
  const session = user ? { user, access_token: "mock-token" } : null;
  authListeners.forEach((cb) => cb(event, session));
}

export const supabase = {
  from: (table: string) => new MockQueryBuilder(table),
  auth: {
    getSession: async () => {
      const user = getStoredUser();
      return {
        data: {
          session: user ? { user, access_token: "mock-token" } : null,
        },
      };
    },
    onAuthStateChange: (callback: AuthCallback) => {
      authListeners.push(callback);
      // Initial call
      const user = getStoredUser();
      setTimeout(() => {
        callback("INITIAL_SESSION", user ? { user, access_token: "mock-token" } : null);
      }, 0);
      return {
        data: {
          subscription: {
            unsubscribe: () => {
              authListeners = authListeners.filter((cb) => cb !== callback);
            },
          },
        },
      };
    },
    signUp: async ({ email, password }: { email: string; password: string; options?: any }) => {
      const user = {
        id: crypto.randomUUID(),
        email,
        user_metadata: { full_name: email.split("@")[0] },
        created_at: new Date().toISOString(),
      };
      localStorage.setItem(AUTH_KEY, JSON.stringify(user));
      
      // Create default profile
      const profiles = getTable("physiq_profiles");
      profiles.push({
        id: user.id,
        nome: email.split("@")[0],
        email,
        foto_url: null,
        user_code: Math.floor(1000 + Math.random() * 9000),
        created_at: new Date().toISOString(),
      });
      setTable("physiq_profiles", profiles);
      
      notifyAuthListeners("SIGNED_IN", user);
      return { data: { user }, error: null };
    },
    signInWithPassword: async ({ email, password }: { email: string; password: string }) => {
      // Simple check: accept any password for existing users or create new
      const profiles = getTable("physiq_profiles");
      let profile = profiles.find((p: any) => p.email === email);
      
      if (!profile) {
        return { data: { user: null }, error: { message: "Email ou senha incorretos." } };
      }
      
      const user = {
        id: profile.id,
        email,
        user_metadata: { full_name: profile.nome || email.split("@")[0] },
        created_at: profile.created_at,
      };
      localStorage.setItem(AUTH_KEY, JSON.stringify(user));
      notifyAuthListeners("SIGNED_IN", user);
      return { data: { user }, error: null };
    },
    signOut: async () => {
      localStorage.removeItem(AUTH_KEY);
      notifyAuthListeners("SIGNED_OUT", null);
      return { error: null };
    },
  },
  functions: {
    invoke: async (name: string, options?: { body?: any }) => {
      const body = options?.body || {};
      
      switch (name) {
        case "verify-password": {
          // Accept "admin123" as default admin password
          return { data: { success: body.password === "admin123" }, error: null };
        }
        case "admin-list-users": {
          const profiles = getTable("physiq_profiles");
          return { data: { users: profiles.map((p: any) => ({ ...p, status: p.status || "ativo" })) }, error: null };
        }
        case "admin-get-user": {
          const profiles = getTable("physiq_profiles");
          const profile = profiles.find((p: any) => p.id === body.userId);
          const avaliacoes = getTable("physiq_avaliacoes").filter((a: any) => a.user_id === body.userId);
          return { data: { profile, avaliacoes }, error: null };
        }
        case "admin-update-user": {
          const profiles = getTable("physiq_profiles");
          const idx = profiles.findIndex((p: any) => p.id === body.userId);
          if (idx >= 0) {
            profiles[idx] = { ...profiles[idx], ...body.data };
            setTable("physiq_profiles", profiles);
          }
          return { data: { success: true }, error: null };
        }
        case "admin-delete-user": {
          let profiles = getTable("physiq_profiles");
          profiles = profiles.filter((p: any) => p.id !== body.userId);
          setTable("physiq_profiles", profiles);
          return { data: { success: true }, error: null };
        }
        case "admin-tags": {
          const tags = getTable("physiq_tags");
          const userTags = getTable("physiq_user_tags");
          
          switch (body.action) {
            case "list":
              return { data: { tags }, error: null };
            case "getAllUserTags":
              return { data: { userTags }, error: null };
            case "create": {
              const newTag = { id: crypto.randomUUID(), nome: body.nome, cor: body.cor || "#888888" };
              const t = getTable("physiq_tags");
              t.push(newTag);
              setTable("physiq_tags", t);
              return { data: { tag: newTag }, error: null };
            }
            case "delete": {
              let t = getTable("physiq_tags");
              t = t.filter((tag: any) => tag.id !== body.tagId);
              setTable("physiq_tags", t);
              return { data: { success: true }, error: null };
            }
            case "addUserTag": {
              const ut = getTable("physiq_user_tags");
              ut.push({ user_id: body.userId, tag_id: body.tagId });
              setTable("physiq_user_tags", ut);
              return { data: { success: true }, error: null };
            }
            case "removeUserTag": {
              let ut = getTable("physiq_user_tags");
              ut = ut.filter((r: any) => !(r.user_id === body.userId && r.tag_id === body.tagId));
              setTable("physiq_user_tags", ut);
              return { data: { success: true }, error: null };
            }
            default:
              return { data: null, error: null };
          }
        }
        case "admin-avaliacoes": {
          switch (body.action) {
            case "list": {
              const all = getTable("physiq_avaliacoes").filter((a: any) => a.user_id === body.userId);
              all.sort((a: any, b: any) => a.data_avaliacao.localeCompare(b.data_avaliacao));
              return { data: { avaliacoes: all }, error: null };
            }
            case "create": {
              const avs = getTable("physiq_avaliacoes");
              const newAv = {
                id: crypto.randomUUID(),
                user_id: body.userId,
                created_by: "admin",
                ...body.avaliacao,
              };
              // Auto-calculate composition
              if (newAv.peso && newAv.dobra_1 && newAv.dobra_2 && newAv.dobra_3) {
                const soma = newAv.dobra_1 + newAv.dobra_2 + newAv.dobra_3;
                const profiles = getTable("physiq_profiles");
                const profile = profiles.find((p: any) => p.id === body.userId);
                const sexo = profile?.sexo || "male";
                const idade = profile?.idade || 25;
                let density: number;
                if (sexo === "male") {
                  density = 1.10938 - 0.0008267 * soma + 0.0000016 * soma * soma - 0.0002574 * idade;
                } else {
                  density = 1.0994921 - 0.0009929 * soma + 0.0000023 * soma * soma - 0.0001392 * idade;
                }
                const bf = ((4.95 / density) - 4.5) * 100;
                if (bf > 0 && bf < 100) {
                  newAv.percentual_gordura = parseFloat(bf.toFixed(1));
                  newAv.massa_gorda = parseFloat((newAv.peso * bf / 100).toFixed(1));
                  newAv.massa_magra = parseFloat((newAv.peso - newAv.massa_gorda).toFixed(1));
                }
              }
              avs.push(newAv);
              setTable("physiq_avaliacoes", avs);
              return { data: { avaliacao: newAv }, error: null };
            }
            case "delete": {
              let avs = getTable("physiq_avaliacoes");
              avs = avs.filter((a: any) => a.id !== body.avaliacaoId);
              setTable("physiq_avaliacoes", avs);
              return { data: { success: true }, error: null };
            }
            default:
              return { data: null, error: null };
          }
        }
        case "admin-get-overrides": {
          const overrides = getTable("tb_treino_dia_override").filter((o: any) => o.user_id === body.userId);
          return { data: { overrides }, error: null };
        }
        default:
          return { data: null, error: { message: `Unknown function: ${name}` } };
      }
    },
  },
};
