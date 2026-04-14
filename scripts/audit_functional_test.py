"""
PhysiqCalc - End-to-End Functional Test via Supabase REST API
=============================================================
Tests auth, profile reads, workout data, JSON encoding, RLS enforcement.
Run: python scripts/audit_functional_test.py
"""

import json
import sys
import uuid
import traceback
from datetime import datetime, timezone

import requests

# ── Config ────────────────────────────────────────────────────────────────────
SUPABASE_URL = "https://uxwpwdbbnlticxgtzcsb.supabase.co"
ANON_KEY = (
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9."
    "eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV4d3B3ZGJibmx0aWN4Z3R6Y3NiIiwi"
    "cm9sZSI6ImFub24iLCJpYXQiOjE3NzM5NzE3OTcsImV4cCI6MjA4OTU0Nzc5N30."
    "AFEAJgrzbirf_kgkO9Yt7LtVzFqpWkvOjdwxbm8fs2Q"
)
SERVICE_ROLE_KEY = (
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9."
    "eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV4d3B3ZGJibmx0aWN4Z3R6Y3NiIiwi"
    "cm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3Mzk3MTc5NywiZXhwIjoyMDg5"
    "NTQ3Nzk3fQ.sWo9hYCgaju6UNK3IgZvEpadRzxvuMd1J_rYg89_rws"
)
TEST_EMAIL = "teste@teste.com"
TEST_PASSWORD = "teste123"

REST_URL = f"{SUPABASE_URL}/rest/v1"
AUTH_URL = f"{SUPABASE_URL}/auth/v1"

# ── Helpers ───────────────────────────────────────────────────────────────────
passed = 0
failed = 0
errors = []

# Track test record IDs for cleanup
cleanup_ids: list[str] = []


def header_anon():
    return {"apikey": ANON_KEY, "Content-Type": "application/json"}


def header_auth(token: str):
    return {
        "apikey": ANON_KEY,
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json",
    }


def header_service():
    return {
        "apikey": SERVICE_ROLE_KEY,
        "Authorization": f"Bearer {SERVICE_ROLE_KEY}",
        "Content-Type": "application/json",
    }


def report(test_name: str, ok: bool, detail: str = ""):
    global passed, failed
    status = "PASS" if ok else "FAIL"
    icon = "[OK]" if ok else "[FAIL]"
    print(f"  {icon} {test_name}")
    if detail:
        for line in detail.strip().split("\n"):
            print(f"       {line}")
    if ok:
        passed += 1
    else:
        failed += 1
        errors.append(f"{test_name}: {detail}")


def cleanup_test_records():
    """Delete any test records we created, using service_role key."""
    if not cleanup_ids:
        return
    print(f"\n--- Cleanup: deleting {len(cleanup_ids)} test record(s) ---")
    for rec_id in cleanup_ids:
        r = requests.delete(
            f"{REST_URL}/treino_historico?id=eq.{rec_id}",
            headers=header_service(),
        )
        status = "OK" if r.status_code in (200, 204) else f"WARN {r.status_code}"
        print(f"  DELETE {rec_id[:8]}... -> {status}")


# ==============================================================================
# TEST 1: Auth flow
# ==============================================================================
def test_auth() -> tuple[str, str]:
    """Login and return (access_token, user_id)."""
    print("\n=== TEST 1: Auth Flow ===")
    r = requests.post(
        f"{AUTH_URL}/token?grant_type=password",
        headers=header_anon(),
        json={"email": TEST_EMAIL, "password": TEST_PASSWORD},
    )
    ok = r.status_code == 200
    data = r.json() if ok else {}

    token = data.get("access_token", "")
    user_id = data.get("user", {}).get("id", "")
    email = data.get("user", {}).get("email", "")

    report(
        "Login with test user",
        ok and bool(token),
        f"Status: {r.status_code}, email: {email}, user_id: {user_id[:8]}..."
        if ok
        else f"Status: {r.status_code} - {r.text[:200]}",
    )
    report(
        "Token returned",
        bool(token),
        f"Token length: {len(token)}" if token else "No token",
    )
    report(
        "User ID returned",
        bool(user_id),
        f"user_id: {user_id}" if user_id else "No user_id",
    )
    return token, user_id


# ==============================================================================
# TEST 2: Read profile (authenticated)
# ==============================================================================
def test_read_profile(token: str, user_id: str):
    print("\n=== TEST 2: Read Profile (authenticated) ===")
    r = requests.get(
        f"{REST_URL}/physiq_profiles?id=eq.{user_id}&select=*",
        headers=header_auth(token),
    )
    ok = r.status_code == 200
    data = r.json() if ok else []

    report(
        "GET physiq_profiles returns 200",
        ok,
        f"Status: {r.status_code}",
    )
    report(
        "Profile data returned",
        ok and len(data) == 1,
        f"Records: {len(data)}" if ok else "No data",
    )
    if ok and data:
        p = data[0]
        report(
            "Profile has expected fields",
            all(k in p for k in ("nome", "email", "peso", "altura")),
            f"nome={p.get('nome')}, email={p.get('email')}, peso={p.get('peso')}, altura={p.get('altura')}",
        )


# ==============================================================================
# TEST 3: Read workout groups (authenticated)
# ==============================================================================
def test_read_groups(token: str) -> list:
    print("\n=== TEST 3: Read Workout Groups (authenticated) ===")
    r = requests.get(
        f"{REST_URL}/tb_grupos_treino?select=*",
        headers=header_auth(token),
    )
    ok = r.status_code == 200
    data = r.json() if ok else []

    report(
        "GET tb_grupos_treino returns 200",
        ok,
        f"Status: {r.status_code}",
    )
    report(
        "Groups returned",
        ok and len(data) > 0,
        f"Count: {len(data)}" + (f" - names: {[g['nome'] for g in data[:5]]}" if data else ""),
    )
    return data


# ==============================================================================
# TEST 4: Read exercises for a group (authenticated)
# ==============================================================================
def test_read_exercises(token: str, groups: list):
    print("\n=== TEST 4: Read Exercises for a Group (authenticated) ===")
    if not groups:
        report("Skip - no groups available", False, "Cannot test without groups")
        return

    group = groups[0]
    group_id = group["id"]
    print(f"  Using group: {group['nome']} ({group_id[:8]}...)")

    r = requests.get(
        f"{REST_URL}/tb_grupos_exercicios?select=*,tb_exercicios(*)&grupo_id=eq.{group_id}",
        headers=header_auth(token),
    )
    ok = r.status_code == 200
    data = r.json() if ok else []

    report(
        "GET tb_grupos_exercicios with join returns 200",
        ok,
        f"Status: {r.status_code}",
    )
    report(
        "Exercises returned for group",
        ok and len(data) > 0,
        f"Count: {len(data)}" if ok else "No data",
    )
    if ok and data:
        first = data[0]
        has_join = "tb_exercicios" in first and first["tb_exercicios"] is not None
        report(
            "Join with tb_exercicios works",
            has_join,
            f"Exercise name: {first.get('tb_exercicios', {}).get('nome', 'N/A')}" if has_join else "Join missing",
        )


# ==============================================================================
# TEST 5: Write and read treino_historico (JSON encoding tests)
# ==============================================================================
def test_write_read_historico(token: str, user_id: str):
    print("\n=== TEST 5: Write/Read treino_historico (JSON encoding) ===")
    now = datetime.now(timezone.utc).isoformat()

    # --- 5a: Write exercicios_concluidos as a proper JSON array (NOT stringified) ---
    print("\n  -- 5a: POST with native JSON array --")
    test_id_a = str(uuid.uuid4())
    cleanup_ids.append(test_id_a)
    payload_a = {
        "id": test_id_a,
        "user_id": user_id,
        "nome_treino": "TEST_ARRAY_NATIVE",
        "iniciado_em": now,
        "concluido_em": now,
        "duracao_segundos": 100,
        "exercicios_concluidos": [
            {"exercicio_id": "ex1", "nome": "Supino Reto", "series": 3},
            {"exercicio_id": "ex2", "nome": "Rosca Direta", "series": 4},
        ],
    }
    r_a = requests.post(
        f"{REST_URL}/treino_historico",
        headers={**header_auth(token), "Prefer": "return=representation"},
        json=payload_a,
    )
    ok_a = r_a.status_code in (200, 201)
    report(
        "POST with native JSON array",
        ok_a,
        f"Status: {r_a.status_code}" + (f" - {r_a.text[:150]}" if not ok_a else ""),
    )

    # Read back
    if ok_a:
        r_read_a = requests.get(
            f"{REST_URL}/treino_historico?id=eq.{test_id_a}&select=*",
            headers=header_auth(token),
        )
        data_a = r_read_a.json()[0] if r_read_a.status_code == 200 and r_read_a.json() else {}
        ec_a = data_a.get("exercicios_concluidos")
        is_array_a = isinstance(ec_a, list)
        report(
            "Read back: exercicios_concluidos is proper array",
            is_array_a,
            f"Type: {type(ec_a).__name__}, Value: {json.dumps(ec_a)[:120]}" if ec_a else "Empty",
        )
        if is_array_a:
            report(
                "Array items have correct structure",
                len(ec_a) == 2 and ec_a[0].get("nome") == "Supino Reto",
                f"Items: {len(ec_a)}, first.nome={ec_a[0].get('nome') if ec_a else 'N/A'}",
            )

    # --- 5b: Write exercicios_concluidos as a STRING (like the app does via PowerSync) ---
    print("\n  -- 5b: POST with stringified JSON (simulating app behavior) --")
    test_id_b = str(uuid.uuid4())
    cleanup_ids.append(test_id_b)
    stringified_array = json.dumps([
        {"exercicio_id": "ex1", "nome": "Supino Reto", "series": 3},
        {"exercicio_id": "ex2", "nome": "Rosca Direta", "series": 4},
    ])
    payload_b = {
        "id": test_id_b,
        "user_id": user_id,
        "nome_treino": "TEST_ARRAY_STRINGIFIED",
        "iniciado_em": now,
        "concluido_em": now,
        "duracao_segundos": 200,
        "exercicios_concluidos": stringified_array,  # STRING, not array
    }
    r_b = requests.post(
        f"{REST_URL}/treino_historico",
        headers={**header_auth(token), "Prefer": "return=representation"},
        json=payload_b,
    )
    ok_b = r_b.status_code in (200, 201)
    report(
        "POST with stringified JSON",
        ok_b,
        f"Status: {r_b.status_code}" + (f" - {r_b.text[:150]}" if not ok_b else ""),
    )

    # Read back
    if ok_b:
        r_read_b = requests.get(
            f"{REST_URL}/treino_historico?id=eq.{test_id_b}&select=*",
            headers=header_auth(token),
        )
        data_b = r_read_b.json()[0] if r_read_b.status_code == 200 and r_read_b.json() else {}
        ec_b = data_b.get("exercicios_concluidos")
        report(
            "Read back: check what type Supabase returns",
            ec_b is not None,
            f"Type: {type(ec_b).__name__}, Value: {json.dumps(ec_b)[:150]}" if ec_b is not None else "NULL",
        )

        # Diagnose: if ec_b is a string, it got double-encoded in the jsonb column
        if isinstance(ec_b, str):
            report(
                "DOUBLE-ENCODING DETECTED",
                False,
                "Supabase stored the string as a JSON string literal inside jsonb. "
                "When the app reads it, it gets a string instead of an array. "
                f"Raw value starts with: {ec_b[:80]}",
            )
            # Try to parse it
            try:
                parsed = json.loads(ec_b)
                report(
                    "String can be parsed to recover array",
                    isinstance(parsed, list),
                    f"After JSON.parse: type={type(parsed).__name__}, len={len(parsed) if isinstance(parsed, list) else 'N/A'}",
                )
            except json.JSONDecodeError:
                report("String is NOT valid JSON", False, f"Value: {ec_b[:100]}")
        elif isinstance(ec_b, list):
            report(
                "Stringified input was auto-parsed by Supabase",
                True,
                "Supabase jsonb column correctly parsed the string into an array on read. "
                "No double-encoding issue via REST API.",
            )
        else:
            report(
                "Unexpected type for exercicios_concluidos",
                False,
                f"Type: {type(ec_b).__name__}",
            )


# ==============================================================================
# TEST 6: RLS Enforcement (negative tests)
# ==============================================================================
def test_rls_enforcement(token: str, user_id: str):
    print("\n=== TEST 6: RLS Enforcement (negative tests) ===")

    # 6a: Try reading another user's profile
    fake_user_id = "00000000-0000-0000-0000-000000000000"
    print(f"\n  -- 6a: Read another user's profile (fake_id={fake_user_id[:12]}...) --")
    r = requests.get(
        f"{REST_URL}/physiq_profiles?id=eq.{fake_user_id}&select=*",
        headers=header_auth(token),
    )
    data = r.json() if r.status_code == 200 else []
    report(
        "Cannot read another user's profile via RLS",
        r.status_code == 200 and len(data) == 0,
        f"Status: {r.status_code}, records: {len(data)} (expected 0)",
    )

    # 6b: Try reading another user's treino_historico
    print(f"\n  -- 6b: Read another user's treino_historico --")
    r2 = requests.get(
        f"{REST_URL}/treino_historico?user_id=eq.{fake_user_id}&select=*",
        headers=header_auth(token),
    )
    data2 = r2.json() if r2.status_code == 200 else []
    report(
        "Cannot read another user's treino_historico via RLS",
        r2.status_code == 200 and len(data2) == 0,
        f"Status: {r2.status_code}, records: {len(data2)} (expected 0)",
    )

    # 6c: Try inserting data for another user_id
    print(f"\n  -- 6c: Insert treino_historico for another user --")
    now = datetime.now(timezone.utc).isoformat()
    test_id_rls = str(uuid.uuid4())
    payload_rls = {
        "id": test_id_rls,
        "user_id": fake_user_id,  # NOT our user
        "nome_treino": "RLS_BYPASS_ATTEMPT",
        "iniciado_em": now,
        "concluido_em": now,
        "duracao_segundos": 1,
        "exercicios_concluidos": [],
    }
    r3 = requests.post(
        f"{REST_URL}/treino_historico",
        headers={**header_auth(token), "Prefer": "return=representation"},
        json=payload_rls,
    )
    # RLS should block this - expect 403 or empty 201 (depending on policy)
    blocked = r3.status_code in (403, 401) or (
        r3.status_code == 201 and len(r3.json()) == 0
    )
    # Also check: some RLS policies return 200 with empty or return a Postgres error
    if r3.status_code == 409 or (r3.status_code >= 400):
        blocked = True
    report(
        "RLS blocks INSERT for another user_id",
        blocked,
        f"Status: {r3.status_code}, response: {r3.text[:200]}",
    )
    # If it somehow got inserted, clean it up
    if r3.status_code in (200, 201) and r3.json():
        cleanup_ids.append(test_id_rls)

    # 6d: Try reading all profiles without filter (should only return own data)
    print(f"\n  -- 6d: Read all profiles (should return only own) --")
    r4 = requests.get(
        f"{REST_URL}/physiq_profiles?select=id,nome,email",
        headers=header_auth(token),
    )
    data4 = r4.json() if r4.status_code == 200 else []
    all_own = all(d.get("id") == user_id for d in data4)
    report(
        "Unfiltered profile query returns only own data",
        r4.status_code == 200 and len(data4) <= 1 and all_own,
        f"Status: {r4.status_code}, records: {len(data4)}, all_own: {all_own}",
    )

    # 6e: Try reading all treino_historico without filter
    print(f"\n  -- 6e: Read all treino_historico (should return only own) --")
    r5 = requests.get(
        f"{REST_URL}/treino_historico?select=id,user_id&limit=50",
        headers=header_auth(token),
    )
    data5 = r5.json() if r5.status_code == 200 else []
    all_own5 = all(d.get("user_id") == user_id for d in data5)
    report(
        "Unfiltered treino_historico returns only own data",
        r5.status_code == 200 and all_own5,
        f"Status: {r5.status_code}, records: {len(data5)}, all_own: {all_own5}",
    )


# ==============================================================================
# TEST 7: Read existing treino_historico data and check encoding
# ==============================================================================
def test_existing_historico(token: str, user_id: str):
    print("\n=== TEST 7: Read Existing treino_historico Data ===")
    r = requests.get(
        f"{REST_URL}/treino_historico?user_id=eq.{user_id}&select=*&order=concluido_em.desc&limit=10",
        headers=header_auth(token),
    )
    ok = r.status_code == 200
    data = r.json() if ok else []

    report(
        "GET existing treino_historico",
        ok,
        f"Status: {r.status_code}, records: {len(data)}",
    )

    if not data:
        report(
            "No existing records to analyze",
            True,
            "Test user has no treino_historico records yet (only test-created ones may exist)",
        )
        return

    # Analyze each record's exercicios_concluidos format
    print("\n  -- Analyzing exercicios_concluidos format in existing records --")
    format_stats = {"array": 0, "string_single": 0, "string_double": 0, "null": 0, "other": 0}

    for i, rec in enumerate(data):
        rec_id = rec.get("id", "?")[:8]
        nome = rec.get("nome_treino", "?")
        ec = rec.get("exercicios_concluidos")

        if ec is None:
            format_stats["null"] += 1
            fmt = "NULL"
        elif isinstance(ec, list):
            format_stats["array"] += 1
            fmt = f"array (len={len(ec)})"
        elif isinstance(ec, str):
            # It's a string - try parsing
            try:
                parsed = json.loads(ec)
                if isinstance(parsed, list):
                    format_stats["string_single"] += 1
                    fmt = f"string->array (single-encoded, len={len(parsed)})"
                elif isinstance(parsed, str):
                    # Double-encoded
                    try:
                        parsed2 = json.loads(parsed)
                        format_stats["string_double"] += 1
                        fmt = f"string->string->array (DOUBLE-encoded, len={len(parsed2) if isinstance(parsed2, list) else '?'})"
                    except Exception:
                        format_stats["string_single"] += 1
                        fmt = "string->string (not valid JSON inside)"
                else:
                    format_stats["other"] += 1
                    fmt = f"string->other ({type(parsed).__name__})"
            except json.JSONDecodeError:
                format_stats["other"] += 1
                fmt = "string (not valid JSON)"
        else:
            format_stats["other"] += 1
            fmt = f"unexpected ({type(ec).__name__})"

        # Skip printing test records we just created
        if "TEST_ARRAY" not in nome:
            print(f"    Record {i+1}: id={rec_id}... nome='{nome}' -> {fmt}")

    print(f"\n  -- Format Summary --")
    print(f"    Proper arrays:       {format_stats['array']}")
    print(f"    Single-encoded str:  {format_stats['string_single']}")
    print(f"    Double-encoded str:  {format_stats['string_double']}")
    print(f"    NULL:                {format_stats['null']}")
    print(f"    Other:               {format_stats['other']}")

    has_encoding_issue = format_stats["string_single"] > 0 or format_stats["string_double"] > 0
    report(
        "Existing data encoding analysis",
        not has_encoding_issue,
        "All existing data is properly stored as JSON arrays"
        if not has_encoding_issue
        else f"ENCODING ISSUES FOUND: {format_stats['string_single']} single-encoded, "
        f"{format_stats['string_double']} double-encoded",
    )


# ==============================================================================
# MAIN
# ==============================================================================
def main():
    print("=" * 70)
    print("PhysiqCalc - End-to-End Functional Test")
    print(f"Target: {SUPABASE_URL}")
    print(f"Date: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print("=" * 70)

    try:
        # Test 1: Auth
        token, user_id = test_auth()
        if not token or not user_id:
            print("\n[ABORT] Cannot proceed without auth token. Stopping.")
            sys.exit(1)

        # Test 2: Profile
        test_read_profile(token, user_id)

        # Test 3: Groups
        groups = test_read_groups(token)

        # Test 4: Exercises
        test_read_exercises(token, groups)

        # Test 5: Write/Read historico (JSON encoding)
        test_write_read_historico(token, user_id)

        # Test 6: RLS enforcement
        test_rls_enforcement(token, user_id)

        # Test 7: Existing data analysis
        test_existing_historico(token, user_id)

    except Exception as e:
        print(f"\n[FATAL ERROR] {e}")
        traceback.print_exc()
    finally:
        # Always cleanup
        cleanup_test_records()

    # Summary
    print("\n" + "=" * 70)
    print(f"RESULTS: {passed} passed, {failed} failed, {passed + failed} total")
    print("=" * 70)
    if errors:
        print("\nFailed tests:")
        for err in errors:
            print(f"  - {err}")
    print()
    return 0 if failed == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
