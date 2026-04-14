"""
Validação funcional das correções da auditoria PhysiqCalc.
Testa contra o Supabase real + verifica DB + simula fluxos.
"""
import requests, json, psycopg2, sys

SUPABASE_URL = "https://uxwpwdbbnlticxgtzcsb.supabase.co"
ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV4d3B3ZGJibmx0aWN4Z3R6Y3NiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM5NzE3OTcsImV4cCI6MjA4OTU0Nzc5N30.AFEAJgrzbirf_kgkO9Yt7LtVzFqpWkvOjdwxbm8fs2Q"
SERVICE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV4d3B3ZGJibmx0aWN4Z3R6Y3NiIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3Mzk3MTc5NywiZXhwIjoyMDg5NTQ3Nzk3fQ.sWo9hYCgaju6UNK3IgZvEpadRzxvuMd1J_rYg89_rws"
DB_HOST = "db.uxwpwdbbnlticxgtzcsb.supabase.co"
DB_PASS = "Bt8751bt,!1"

passed = 0
failed = 0
errors = []

def test(name, condition, detail=""):
    global passed, failed
    if condition:
        passed += 1
        print(f"  ✓ {name}")
    else:
        failed += 1
        errors.append(f"{name}: {detail}")
        print(f"  ✗ {name} — {detail}")

def headers_auth(token):
    return {"apikey": ANON_KEY, "Authorization": f"Bearer {token}", "Content-Type": "application/json"}

def headers_service():
    return {"apikey": SERVICE_KEY, "Authorization": f"Bearer {SERVICE_KEY}", "Content-Type": "application/json"}

# ──────────────────────────────────────────────────────────
print("\n=== 1. AUTH: Login funciona ===")
r = requests.post(f"{SUPABASE_URL}/auth/v1/token?grant_type=password",
    headers={"apikey": ANON_KEY, "Content-Type": "application/json"},
    json={"email": "teste@teste.com", "password": "teste123"})
test("Login retorna 200", r.status_code == 200, f"status={r.status_code}")
data = r.json()
token = data.get("access_token", "")
user_id = data.get("user", {}).get("id", "")
test("Token recebido", len(token) > 50, f"len={len(token)}")
test("User ID recebido", len(user_id) > 10, f"id={user_id}")

# ──────────────────────────────────────────────────────────
print("\n=== 2. PERFIL: Leitura funciona com RLS ===")
r = requests.get(f"{SUPABASE_URL}/rest/v1/physiq_profiles?id=eq.{user_id}&select=id,nome,foto_url",
    headers=headers_auth(token))
test("Profile GET retorna 200", r.status_code == 200, f"status={r.status_code}")
profiles = r.json()
test("Profile retorna dados", len(profiles) > 0, "vazio")

# ──────────────────────────────────────────────────────────
print("\n=== 3. HISTÓRICO: Dados não estão double-encoded ===")
conn = psycopg2.connect(host=DB_HOST, port=5432, dbname="postgres", user="postgres", password=DB_PASS, sslmode="require")
cur = conn.cursor()

cur.execute("SELECT count(*) FROM treino_historico WHERE jsonb_typeof(exercicios_concluidos) = 'string'")
double_encoded = cur.fetchone()[0]
test("Zero registros double-encoded em produção", double_encoded == 0, f"encontrados={double_encoded}")

cur.execute("SELECT count(*) FROM treino_historico WHERE jsonb_typeof(exercicios_concluidos) = 'array'")
arrays = cur.fetchone()[0]
test("Registros com array correto existem", arrays > 0, f"count={arrays}")

# ──────────────────────────────────────────────────────────
print("\n=== 4. HISTÓRICO: Write + Read roundtrip (simula connector fix) ===")
import uuid
test_id = str(uuid.uuid4())
test_data = [{"exercicio_id": "test-ex-1", "nome": "Supino Teste", "series_concluidas": 3}]

# Simula o que o connector CORRIGIDO faz: envia JSON nativo (não string)
r = requests.post(f"{SUPABASE_URL}/rest/v1/treino_historico",
    headers={**headers_auth(token), "Prefer": "return=representation"},
    json={
        "id": test_id,
        "user_id": user_id,
        "nome_treino": "TESTE_VALIDACAO",
        "iniciado_em": "2026-04-14T00:00:00Z",
        "concluido_em": "2026-04-14T01:00:00Z",
        "duracao_segundos": 3600,
        "exercicios_concluidos": test_data  # JSON nativo, não string
    })
test("INSERT histórico retorna 201", r.status_code == 201, f"status={r.status_code} body={r.text[:200]}")

# Lê de volta
r2 = requests.get(f"{SUPABASE_URL}/rest/v1/treino_historico?id=eq.{test_id}&select=exercicios_concluidos",
    headers=headers_auth(token))
test("READ retorna 200", r2.status_code == 200, f"status={r2.status_code}")
if r2.status_code == 200 and r2.json():
    ex = r2.json()[0].get("exercicios_concluidos")
    test("exercicios_concluidos é lista (não string)", isinstance(ex, list), f"type={type(ex).__name__}")
    if isinstance(ex, list) and len(ex) > 0:
        test("Primeiro item tem 'nome'", "nome" in ex[0], f"keys={list(ex[0].keys()) if ex else 'vazio'}")

# Verifica no DB direto
cur.execute("SELECT jsonb_typeof(exercicios_concluidos) FROM treino_historico WHERE id = %s", (test_id,))
row = cur.fetchone()
test("DB: jsonb_typeof = 'array'", row and row[0] == "array", f"tipo={row[0] if row else 'N/A'}")

# Cleanup
requests.delete(f"{SUPABASE_URL}/rest/v1/treino_historico?id=eq.{test_id}", headers=headers_service())

# ──────────────────────────────────────────────────────────
print("\n=== 5. RLS: Bloqueio de acesso cruzado ===")
other_user = "371769a8-a37d-4737-b52a-23611f5865a8"  # Weslley
r = requests.get(f"{SUPABASE_URL}/rest/v1/treino_historico?user_id=eq.{other_user}&select=id",
    headers=headers_auth(token))
test("Não pode ler histórico de outro user", len(r.json()) == 0, f"retornou {len(r.json())} registros")

r = requests.get(f"{SUPABASE_URL}/rest/v1/physiq_profiles?id=eq.{other_user}&select=id",
    headers=headers_auth(token))
test("Não pode ler perfil de outro user", len(r.json()) == 0, f"retornou {len(r.json())} registros")

# ──────────────────────────────────────────────────────────
print("\n=== 6. GRUPOS/EXERCÍCIOS: Leitura pública funciona ===")
r = requests.get(f"{SUPABASE_URL}/rest/v1/tb_grupos_treino?select=id,nome",
    headers=headers_auth(token))
test("Grupos de treino retornados", r.status_code == 200 and len(r.json()) > 0, f"count={len(r.json()) if r.status_code == 200 else 'err'}")

grupos = r.json()
if grupos:
    gid = grupos[0]["id"]
    r = requests.get(f"{SUPABASE_URL}/rest/v1/tb_grupos_exercicios?grupo_id=eq.{gid}&select=exercicio_id,tb_exercicios(nome)",
        headers=headers_auth(token))
    test("Exercícios do grupo retornados", r.status_code == 200 and len(r.json()) > 0, f"count={len(r.json()) if r.status_code == 200 else 'err'}")

# ──────────────────────────────────────────────────────────
print("\n=== 7. SÉRIES: Write + Read ===")
serie_id = str(uuid.uuid4())
r = requests.post(f"{SUPABASE_URL}/rest/v1/tb_treino_series",
    headers={**headers_auth(token), "Prefer": "return=representation"},
    json={
        "id": serie_id,
        "user_id": user_id,
        "exercicio_id": grupos[0]["id"] if grupos else "test",
        "data_treino": "2026-04-14",
        "numero_serie": 99,
        "peso": 50.0,
        "reps": 10,
        "concluida": 1,
        "updated_at": "2026-04-14T00:00:00Z"
    })
test("INSERT série retorna 201", r.status_code == 201, f"status={r.status_code} body={r.text[:200]}")

# Cleanup
requests.delete(f"{SUPABASE_URL}/rest/v1/tb_treino_series?id=eq.{serie_id}", headers=headers_service())

# ──────────────────────────────────────────────────────────
print("\n=== 8. ADMIN FUNCTIONS: Edge functions acessíveis ===")
r = requests.post(f"{SUPABASE_URL}/functions/v1/verify-password",
    headers={"apikey": ANON_KEY, "Authorization": f"Bearer {ANON_KEY}", "Content-Type": "application/json"},
    json={"password": "wrong-password"})
test("verify-password responde (não 500)", r.status_code != 500, f"status={r.status_code}")

# ──────────────────────────────────────────────────────────
print("\n=== 9. SCHEMA: Todas as tabelas do PowerSync existem ===")
expected_tables = [
    "tb_grupos_treino", "tb_exercicios", "tb_semana_treinos", "tb_grupos_exercicios",
    "grupos_musculares", "tb_treino_series", "tb_treino_concluido", "tb_treino_dia_override",
    "treino_historico", "physiq_profiles", "exercicio_ordem_usuario",
    "tb_grupos_treino_usuario", "tb_exercicios_usuario", "tb_grupos_exercicios_usuario",
    "tb_exercicio_comentarios"
]
cur.execute("SELECT table_name FROM information_schema.tables WHERE table_schema='public'")
db_tables = [r[0] for r in cur.fetchall()]
for t in expected_tables:
    test(f"Tabela {t} existe", t in db_tables, "AUSENTE")

# ──────────────────────────────────────────────────────────
print("\n=== 10. RLS: Ativado em todas as tabelas ===")
cur.execute("SELECT tablename, rowsecurity FROM pg_tables WHERE schemaname='public'")
for tname, rls in cur.fetchall():
    if tname in expected_tables:
        test(f"RLS ativo em {tname}", rls == True, f"rowsecurity={rls}")

conn.close()

# ──────────────────────────────────────────────────────────
print(f"\n{'='*50}")
print(f"RESULTADO: {passed} passed, {failed} failed")
if errors:
    print(f"\nFalhas:")
    for e in errors:
        print(f"  ✗ {e}")
sys.exit(0 if failed == 0 else 1)
