# Remada Cavalinho com Barra — cena da fábrica 3D (lote 13, 12/10/2026). Peça nova: equip3d.landmine (o suporte de canto no chão com a
# barra olímpica presa: a luva gira no eixo do garfo e a barra sobe e desce num arco em volta do pivô, com 1 anilha de 25 lb na ponta de
# fora) + o triângulo da remada baixa (equip3d.triangulo_polia) PENDURADO NA BARRA, sem o cabo: a barra passa pelas 2 janelas do
# triângulo e fica encaixada no V das hastes, logo antes do colar das anilhas, e os 2 pegadores ficam embaixo dela, um de cada lado.
# t = 0 em pé por cima da barra (a barra entre as pernas, o suporte atrás), tronco inclinado à frente com a coluna neutra, joelhos
# levemente dobrados, braços pendurados quase esticados embaixo dos ombros segurando o triângulo, escápulas soltas · t = 1 o triângulo
# embaixo do alto do abdômen e a anilha perto do peito, cotovelos dobrados e pra trás, rentes ao corpo, escápulas juntas.
# Técnica (as frases nas referências da ficha): free-exercise-db, Bent Over Two-Arm Long Bar Row (o fonte_en do catálogo): "Bend forward
# until your torso is as close to parallel with the floor as you can and keep your knees slightly bent." / "Pull the bar straight up
# with your elbows in (to maximize back stimulation) until the plates touch your lower chest." / "Tip: Use a stirrup or double handle
# cable attachment by hooking it under the end of the bar." / "Tip: Do not let the plates touch the floor. ... I recommend using small
# plates (25-lb ones)"; free-exercise-db, T-Bar Row with Handle: "position a Double D row handle around the bar next to the collar" /
# "Assume a wide stance with your hips back and your chest up. Your arms should be extended." / "Pull the weight to your upper abdomen
# by retracting the shoulder blades and flexing the elbows."; Cissik 2022 (Landmine Row with a Seated Row Handle): "place the handle
# just under the inside collar, around the bar" / "Keep your elbows in against your body"; ExRx (Lever T-bar Row): "Keep low back
# straight. Lighten load if torso raises beyond 45 degrees"; NSCA (bent-over row, Achievable CSCS): "Keep a neutral spine and look
# ahead" / "Keep your torso rigid and your knees flexed".
# Como o rig faz: os tornozelos ficam presos no chão a ±X_TORNOZELO (base um pouco mais aberta que os ombros), os pés chapados e
# virados PONTA° pra fora; o quadril vai pra onde a canela fica CANELA° à frente da vertical e o joelho dobrado JOELHO°, e a pelve e o
# tronco giram juntos INCLINA° pra frente em volta das articulações do quadril (coluna neutra); cada joelho fica em cima do pé (no plano
# vertical dele, a conta do Levantamento Terra); a cabeça volta PESCOCO da inclinação (olhar à frente e pra baixo). Tronco, quadril,
# pernas, pés e cabeça não mexem. As escápulas giram (clavícula em volta do eixo do tronco) de soltas (t=0) a juntas (t=1).
# A barra: o suporte fica atrás da pessoa, no chão, a luva apontando pra ela; a barra gira em volta do pivô (a ponta presa na luva) e a
# subida dela vai de TH0 a TH1 (linear em t). O triângulo fica sempre no mesmo ponto da barra (a chapa de cima a FOLGA_COLAR do colar
# de dentro das anilhas), encaixado no V das hastes (a barra a FOLGA_TRI delas) e pendurado no plano do meio (simétrico: a puxada das
# 2 mãos passa pelo eixo da barra), então os pegadores ficam paralelos à barra. TH0 e o lugar do suporte saem do começo: os vãos das
# mãos AVANCO0 à frente dos ombros, com os braços pendurados e o cotovelo dobrado COTOVELO0° (busca no montar()); TH1 sai do fim: a
# barra sobe até a anilha chegar a FOLGA_ANILHA do peito ("until the plates touch your lower chest": encosta de leve, no máximo) ou até
# outra peça (o triângulo, a barra entre as coxas, a ponta da barra perto da cabeça) chegar a FOLGA_PECA do corpo — o que vier antes.
# As mãos vão nos pegadores pelo IK do braço, com o polo do cotovelo andando de POLO0 (embaixo: o cotovelo dobra pra fora e pra trás)
# a POLO1 (em cima: os cotovelos pra trás, rentes ao corpo, ~13° abertos); a cada pegada o braço e o antebraço partem do repouso e a
# mão volta pro repouso antes de cada volta do IK (sem isso o giro do antebraço passava de uma volta e de um quadro pro seguinte, e o
# úmero direito saía girado em relação ao esquerdo); os dedos e o polegar fecham uma vez, no começo, e ficam iguais em todos os quadros.
import math
import numpy as np
import bpy
from mathutils import Matrix, Vector
import poses3d as p3
import equip3d as e3
import pegada3d as pg
import checagem3d as ck
import tecnica3d as tc
from maos3d import Maos
from cena import Cena

LADOS = (("Left", 1), ("Right", -1))      # s = +1 no esquerdo (+X); a pessoa olha pra −Y

# ── corpo ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
INCLINA = 52.0            # tronco 52° à frente da vertical = 38° do chão: o meio das fotos do free-exercise-db (~35–40°) e do Cissik (~35°),
                          # mais deitado que o limite do ExRx ("Lighten load if torso raises beyond 45 degrees") e na direção do "as close
                          # to parallel with the floor as you can" do fonte_en
CANELA = 8.0              # canela 8° à frente da vertical (o quadril vai pra trás: "with your hips back", free-exercise-db)
JOELHO = 25.0             # joelhos levemente dobrados ("keep your knees slightly bent", fonte_en; "Bend knees slightly", ExRx)
X_TORNOZELO = 0.22        # tornozelos a ±22 cm: 44 cm entre eles, um pouco mais que os ombros (0,40 m entre as articulações) — "a wide
                          # stance" (T-Bar Row with Handle) × "about shoulder-width" (GGR); a barra passa no meio
PONTA = 15.0              # pontas dos pés 15° pra fora (ACE, Barbell Jammers, a barra no canto: "toes pointed forward or slightly outward")
JOELHO_FORA = 0.005       # centro do joelho 5 mm pra fora do plano vertical do pé (joelho na direção do pé)
PESCOCO = 0.30            # a cabeça volta 30% da inclinação do tronco: na linha da coluna, olhando à frente e pra baixo ("Keep a
                          # neutral spine and look ahead", NSCA)
PROTRAI = 8.0             # escápulas soltas no começo (clavícula 8° pra frente em volta do eixo do tronco: "shoulders are stretched
                          # downward", ExRx; "concentrate on them coming apart as you lower the weight", Cissik)
RETRAI = 8.0              # escápulas juntas no fim ("by retracting the shoulder blades", free-exercise-db; "bringing your shoulder blades
                          # together", Cissik)

# ── braços ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
COTOVELO0 = 15.0          # começo: cotovelo dobrado 15°, quase esticado sem travar ("Your arms should be extended", free-exercise-db)
AVANCO0 = 0.06            # começo: o vão das mãos 6 cm à frente dos ombros — o braço pendurado na vertical e o antebraço um pouco à
                          # frente (com o vão embaixo do ombro o antebraço ficava em pé e o pegador, inclinado junto com a barra, dobrava
                          # o punho ~25° pro lado do polegar; assim fica ~15°)
POLO0 = (0.45, 0.45, 0.0)   # polo do cotovelo em relação ao ombro no começo e no fim (x pra fora, y pra trás, z pra cima; anda em linha
POLO1 = (0.40, 0.45, 0.55)  # reta entre os 2): embaixo o cotovelo dobra pra fora e pra trás; em cima os cotovelos ficam pra trás, rentes ao
                            # corpo (~13° abertos), sem o braço entrar na lateral do tronco ("with your elbows in", fonte_en; "Keep your
                            # elbows in against your body", Cissik)

# ── suporte, barra e triângulo ─────────────────────────────────────────────────────────────────────────────────────────────────────
ALTURA_PIVO = 0.095       # pivô do suporte a 9,5 cm do chão (ver o bloco do equip3d.landmine)
ANILHAS = 1               # 1 anilha de 25 lb (277 × 35,6 mm, Rogue Olympic Plates): "small plates (25-lb ones)", fonte_en
RAIO = 0.015              # pegadores do triângulo: 30 mm (Corength: "Handle diameter: 30 mm")
FOLGA_TRI = 0.001         # a barra encaixada no V das hastes do triângulo, a 1 mm delas
FOLGA_COLAR = 0.005       # a chapa de cima do triângulo a 5 mm do colar de dentro das anilhas ("next to the collar", free-exercise-db;
                          # "just under the inside collar", Cissik)
FOLGA_ANILHA = 0.006      # fim: a anilha a 6 mm do peito (chega perto; "until the plates touch your lower chest" = encosta de leve, no
                          # máximo; a checagem pede 3 mm entre peso e corpo)
FOLGA_PECA = 0.010        # fim: as outras peças (triângulo, barra entre as coxas, ponta da barra) param a 10 mm do corpo, no mínimo
TH_MAX = 45.0             # a busca do fim não passa disso (graus da barra acima do chão)

TRONCO = ("Hips", "Spine", "Spine1", "Spine2")
PERNAS = ("LeftUpLeg", "RightUpLeg", "LeftLeg", "RightLeg", "LeftFoot", "RightFoot", "LeftToeBase", "RightToeBase")
CABECA = ("Neck", "Head", "LeftShoulder", "RightShoulder")


def _malha(bon):
    return ck._avaliar(bon.corpo, 1)


def _grupo(nomes, dono, partes):
    return np.array([n in partes for n in nomes] + [False])[dono]


def joelho_no_plano_do_pe(H, A, f, n, lt, ls, alvo_d=0.0):
    """Joelho da perna quadril H → tornozelo A (coxa lt, canela ls) no círculo de joelhos possíveis, a `alvo_d` m (com sinal, − = pra
    dentro) do plano vertical do pé (passa por A, direção f da ponta do pé, normal n pra fora) — o joelho à frente, em cima do pé, das 2
    soluções. A mesma conta do Levantamento Terra (cenas/levantamento_terra.py) e do agachamento sumô."""
    d = (A - H).length
    u = (A - H) / d
    x = (d * d + lt * lt - ls * ls) / (2 * d)
    r = math.sqrt(max(lt * lt - x * x, 0.0))
    C = H + u * x
    e1 = u.cross(Vector((0.0, 0.0, 1.0)))
    if e1.length < 1e-6:
        e1 = u.cross(Vector((0.0, 1.0, 0.0)))
    e1.normalize()
    e2 = u.cross(e1).normalized()
    d0 = n.dot(C - A)
    a1, a2 = n.dot(e1), n.dot(e2)
    m = math.hypot(a1, a2)
    psi0 = math.atan2(a2, a1)
    K = lambda ps: C + (e1 * math.cos(ps) + e2 * math.sin(ps)) * r
    q = None if (alvo_d is None or r * m < 1e-9) else (alvo_d - d0) / (r * m)
    if q is not None and abs(q) <= 1.0:
        da = math.acos(q)
        Kj = max([K(psi0 + da), K(psi0 - da)], key=lambda k: (k - A).dot(f))
    else:
        Kj = K(psi0 if (q is None or q > 1.0) else psi0 + math.pi)
    return Kj, C, n.dot(Kj - A)


def direcao(th):
    """Direção da barra (do pivô pras anilhas) com a subida `th` graus: o suporte atrás (+Y), as anilhas na frente (−Y)."""
    a = math.radians(th)
    return Vector((0.0, -math.cos(a), math.sin(a)))


def cima_da_barra(th):
    """Do meio dos pegadores pro eixo da barra: ⟂ a ela, no plano do meio, pra cima (o triângulo pendurado embaixo da barra)."""
    a = math.radians(th)
    return Vector((0.0, math.sin(a), math.cos(a)))


def montar(bon):
    pg.usar_cilindro(RAIO * 2000)     # mão de referência do pegador de 30 mm (antes do Maos)
    pg.usar_polegar("volta")          # polegar dando a volta no pegador (padrão dos exercícios novos)
    rig = bon.rig
    PB = rig.pose.bones

    def cab(n):
        return p3.cabeca(rig, n)

    # ── 1) pés no chão (tornozelos presos, sola chapada, ponta PONTA° pra fora) e pernas por IK ─────────────────────────────────────
    lt_ = (cab("LeftLeg") - cab("LeftUpLeg")).length
    ls_ = (cab("LeftFoot") - cab("LeftLeg")).length
    meio0 = (cab("LeftUpLeg") + cab("RightUpLeg")) / 2
    meia_quadril = (cab("LeftUpLeg") - cab("RightUpLeg")).length / 2
    tz0 = cab("LeftFoot")
    pes, pernas, polos_j = {}, {}, {}
    for L, s in LADOS:
        th = math.radians(PONTA)
        f = Vector((s * math.sin(th), -math.cos(th), 0.0))
        n = Vector((s * math.cos(th), math.sin(th), 0.0))
        A = Vector((s * X_TORNOZELO, tz0.y, tz0.z))
        pes[L] = dict(A=A, f=f, n=n)
        alvo = p3.vazio("tornozelo_" + L, p3.ponta(rig, L + "Leg"))       # nasce no tornozelo (alvo ≠ polo)
        polos_j[L] = p3.vazio("polo_joelho_" + L, A + f * 1.2 + Vector((0.0, 0.0, 0.45)))
        pernas[L] = p3.ik(rig, L + "Leg", alvo, polos_j[L])
        b = rig.data.bones[p3.P + L + "Foot"]
        rot = p3.vazio("rot_" + L + "Foot")
        rot.matrix_world = Matrix.Rotation(s * th, 4, "Z") @ (rig.matrix_world @ b.matrix_local)
        cn = PB[p3.P + L + "Foot"].constraints.new("COPY_ROTATION")
        cn.target = rot
        alvo.location = A
    p3.atualizar()
    ya, za = tz0.y, tz0.z
    dx = X_TORNOZELO - meia_quadril

    # ── 2) quadril pra trás e pra baixo, pelve e tronco girando juntos (coluna neutra), joelhos em cima dos pés, cabeça ────────────
    a_c, k_j = math.radians(CANELA), math.radians(JOELHO)
    y_q = ya - ls_ * math.sin(a_c) + lt_ * math.sin(k_j - a_c)
    d_q = math.sqrt(ls_ * ls_ + lt_ * lt_ + 2 * ls_ * lt_ * math.cos(k_j))
    z_q = za + math.sqrt(max(d_q * d_q - dx * dx - (y_q - ya) ** 2, 1e-6))
    alvo_joelho = {}

    def corpo():
        for nome in ("Hips", "Neck", "Head", "LeftShoulder", "RightShoulder"):
            PB[p3.P + nome].matrix_basis = Matrix()
        p3.atualizar()
        p3.girar_osso(rig, "Hips", p3.rot_x(INCLINA), pivo=meio0, mover=Vector((0.0, y_q - meio0.y, z_q - meio0.z)))
        for L, s in LADOS:
            H = Vector((s * meia_quadril, y_q, z_q))
            Kj, C, _ = joelho_no_plano_do_pe(H, pes[L]["A"], pes[L]["f"], pes[L]["n"], lt_, ls_, JOELHO_FORA)
            v = Kj - C
            polos_j[L].location = Kj + (v.normalized() if v.length > 1e-6 else pes[L]["f"]) * 0.6
            alvo_joelho[L] = Kj
        p3.atualizar()
        p3.girar_osso(rig, "Neck", p3.rot_x(-INCLINA * PESCOCO))

    corpo()
    for L, _ in LADOS:                      # pole_angle de cada perna: o joelho no alvo (em cima do pé), em 0,5°
        e_ = p3.acertar_polo(rig, pernas[L], L + "Leg", L + "UpLeg", L + "Foot")
        melhor = (1e9, None)
        for k in range(-10, 11):
            ang = e_[1] + k * 0.5
            pernas[L].pole_angle = math.radians(ang)
            p3.atualizar()
            melhor = min(melhor, ((cab(L + "Leg") - alvo_joelho[L]).length, ang))
        pernas[L].pole_angle = math.radians(melhor[1])
        p3.atualizar()
        print("polo joelho %s %.1f° | joelho a %.1f mm do alvo" % (L, melhor[1], melhor[0] * 1000), flush=True)
    jt = ck.medir_juntas(rig)
    jj = ck.posicoes(rig)
    H = (cab("LeftUpLeg") + cab("RightUpLeg")) / 2
    print("CORPO | quadril (%.4f %.4f %.4f) | tornozelos y %.4f | joelho %.1f/%.1f° | quadril %.1f/%.1f° | tronco %.1f° | coluna %.1f° | "
          "cabeça %.1f° | pés %.2f × | ponta %s°" % (
              *H, ya, jt["joelhoE"], jt["joelhoD"], jt["quadrilE"], jt["quadrilD"],
              math.degrees(math.atan2(math.hypot(*(jj["Neck"][:2] - jj["Hips"][:2])), jj["Neck"][2] - jj["Hips"][2])),
              tc.coluna(jj)[0], tc.cabeca_tronco(jj)[0], tc.pes_largura(jj)[0], "/".join("%.0f" % v for v in tc.ponta_pe(jj))),
          flush=True)

    # ── 3) escápulas: clavícula girando em volta do eixo do tronco (pra frente = soltas, pra trás = juntas) ─────────────────────────
    base_ombro = {L: PB[p3.P + L + "Shoulder"].matrix_basis.copy() for L, _ in LADOS}
    cima0 = (cab("Neck") - cab("Hips")).normalized()

    def escapulas(t):
        for L, _ in LADOS:
            PB[p3.P + L + "Shoulder"].matrix_basis = base_ombro[L].copy()
        p3.atualizar()
        ret = p3.lerp(-PROTRAI, RETRAI, t)
        for L, s in LADOS:
            if ret:
                p3.girar_osso(rig, L + "Shoulder", Matrix.Rotation(math.radians(s * ret), 3, cima0))

    # ── 4) mãos, triângulo (sem o engate: não há cabo) e o suporte com a barra ───────────────────────────────────────────────────────
    maos = Maos(bon, RAIO, polo_inicial=(0, 0.5, 0), polegar_modo="volta")
    tri = e3.triangulo_polia("triangulo", raio=RAIO)
    for o in [tri.engate] + list(tri.engate.children_recursive):      # mosquetão, ponteira e bola do cabo ficam fora da cena
        bpy.data.objects.remove(o, do_unlink=True)
    tri.engate = None
    lm = e3.landmine("landmine", pivo=(0.0, 1.5), frente=(0.0, -1.0, 0.0), altura=ALTURA_PIVO, anilhas=ANILHAS)
    md = lm.medidas
    # onde a barra encaixa no triângulo: a altura (Y local, a partir do meio dos pegadores) do eixo da barra encostada (FOLGA_TRI) nas 2
    # hastes de cada janela, medida nas malhas (X local ao longo dos pegadores, as hastes no plano x = ±x_h)
    hastes = []
    for o in tri.raiz.children:
        if o.name.startswith("triangulo_haste"):
            M = o.matrix_local
            ax = (M.to_3x3() @ Vector((0.0, 0.0, 1.0))).normalized()
            c = M.to_translation()
            meia = max(abs(v.co.z) for v in o.data.vertices)
            r_h = max(math.hypot(v.co.x, v.co.y) for v in o.data.vertices)
            hastes.append((c - ax * meia, c + ax * meia, r_h))
    chapa = [o for o in tri.raiz.children if o.name == "triangulo_chapa"][0]
    y_chapa = min((chapa.matrix_local @ v.co).y for v in chapa.data.vertices)
    x_chapa = max(abs((chapa.matrix_local @ v.co).x) for v in chapa.data.vertices)
    x_hastes = max(max(abs(a.x), abs(b.x)) + r for a, b, r in hastes)
    r_b = md["raio_eixo"]

    def folga_hastes(y):
        menor = 1e9
        for a, b, r in hastes:
            A2, B2, P2 = Vector((a.y, a.z)), Vector((b.y, b.z)), Vector((y, 0.0))
            ab = B2 - A2
            k = max(0.0, min(1.0, (P2 - A2).dot(ab) / ab.length_squared))
            menor = min(menor, (P2 - (A2 + ab * k)).length - r - r_b)
        return menor

    lo, hi = 0.0, y_chapa - r_b - FOLGA_TRI
    if folga_hastes(hi) >= FOLGA_TRI:
        raise ValueError("triângulo: a barra encostaria na chapa antes das hastes")
    for _ in range(50):
        m_ = (lo + hi) / 2
        if folga_hastes(m_) > FOLGA_TRI:
            lo = m_
        else:
            hi = m_
    Y_B = (lo + hi) / 2
    S_TRI = md["colar2"][0] - FOLGA_COLAR - max(x_chapa, x_hastes)     # meio do triângulo ao longo da barra, a partir do pivô
    print("TRIÂNGULO NA BARRA | eixo da barra %.1f mm acima do meio dos pegadores (chapa a %.1f mm da barra; hastes a %.2f mm dela) | "
          "a %.4f m do pivô (chapa até ±%.1f mm, colar de dentro a %.4f m) | barra: %s" % (
              Y_B * 1000, (y_chapa - Y_B - r_b) * 1000, folga_hastes(Y_B) * 1000, S_TRI, x_chapa * 1000, md["colar2"][0],
              {k: v for k, v in md.items() if not k.startswith("raio")}), flush=True)

    def no_triangulo(th):
        """Barra na subida th: o meio dos pegadores e a direção dela (o triângulo pendurado embaixo, no plano do meio)."""
        d = direcao(th)
        return lm.pivo + d * S_TRI - cima_da_barra(th) * Y_B, d

    def por_barra(th):
        lm.apontar(direcao(th))
        c, d = no_triangulo(th)
        e3.por_acessorio(tri.raiz, c, -d, cima_da_barra(th))            # X local pro pivô, Y local pra barra, Z local = +X do mundo
        bpy.context.view_layer.update()
        return c, d

    # ── 5) a mão no pegador: dedos ⟂ ao pegador (o mais perto do antebraço), palma pro meio (pegada neutra) ─────────────────────────
    def mao(s, w, f_):
        w = Vector(w).normalized()
        dq = (f_ - w * f_.dot(w)).normalized()
        m = Vector((-s, 0.0, 0.0))
        pq = (m - dq * m.dot(dq) - w * m.dot(w)).normalized()
        return dq, pq

    # braço e antebraço de partida do IK em toda pegada: o REPOUSO (simétrico). Partindo da postura dobrada do fim (como a Remada Cavalinho
    # na Máquina), o IK do braço direito saía com o úmero girado ~65° em volta do próprio eixo em relação ao espelho do esquerdo (o
    # antebraço compensava pro lado contrário): a pele do ombro e do bíceps torcia. Do repouso os 2 lados saem espelhados.
    PARTIDA = {L: {p3.P + L + n_: Matrix.Identity(4) for n_ in ("Arm", "ForeArm")} for L, _ in LADOS}
    DEDOS = {}

    def pegar(L, s, g, w, polo, f_):
        """Mão L com o vão em g no pegador de eixo w; 3 voltas mão ↔ antebraço (os dedos seguem o antebraço que o IK acha). Em cada uma
        o braço e o antebraço partem do repouso (PARTIDA) e o Maos.segurar roda 1 volta por vez com a MÃO SOLTA antes de cada volta —
        a correção do vão (o alvo do punho) fica aqui fora: assim o giro do antebraço não depende da mão da volta anterior nem do quadro
        anterior (o conserto do giro do antebraço de 12/10, sem precisar do parâmetro novo do segurar, que ainda não está no git)."""
        e = Vector()
        for _ in range(3):
            for n_, M in PARTIDA.get(L, {}).items():
                PB[n_].matrix_basis = M.copy()
            dq, pq = mao(s, w, f_)
            soma = Vector()
            for _v in range(6):
                PB[p3.P + L + "Hand"].matrix_basis = Matrix.Identity(4)
                p3.atualizar()
                maos.segurar(L, g + soma, dq, pq, polo=polo, voltas=1)
                e = g - p3.mundo_osso(rig, L + "Hand") @ maos.furo[L]
                if e.length < 0.0005:
                    break
                soma += e
            f_ = (cab(L + "Hand") - cab(L + "ForeArm")).normalized()
        maos.erro[L] = e.length
        return f_

    def polo_de(L, s, t):
        p_ = Vector(POLO0).lerp(Vector(POLO1), t)
        return cab(L + "Arm") + Vector((s * p_.x, p_.y, p_.z))

    F = {}                                  # antebraço (cotovelo → punho) no começo e no fim: o palpite de cada quadro

    def maos_no_triangulo(t):
        for L, s in LADOS:
            g = tri.pegadores[s].matrix_world.to_translation()
            w = (tri.pegadores[s].matrix_world.to_3x3() @ Vector((1.0, 0.0, 0.0))).normalized()
            f0 = F[L][0].lerp(F[L][1], t).normalized() if L in F else Vector((0.0, 0.0, -1.0))
            pegar(L, s, g, w, polo_de(L, s, t), f0)
            if L in DEDOS:
                for n_, M in DEDOS[L].items():
                    PB[n_].matrix_basis = M.copy()
        p3.atualizar()

    # ── 6) começo: o vão das mãos embaixo dos ombros (no plano do meio de cada pegador), braços pendurados com o cotovelo COTOVELO0°;
    #    a busca acha a altura do triângulo e, com ela, a subida da barra e o lugar do suporte (a barra tem o comprimento dela) ────────
    escapulas(0.0)
    y_S = (cab("LeftArm").y + cab("RightArm").y) / 2 - AVANCO0

    def comeco(z0):
        escapulas(0.0)
        c0 = Vector((0.0, y_S, z0))
        th = 15.0
        for _ in range(30):                 # o eixo da barra fica Y_B acima do meio dos pegadores, ⟂ a ela (depende da subida)
            B = c0 + cima_da_barra(th) * Y_B
            th = math.degrees(math.asin((B.z - ALTURA_PIVO) / S_TRI))
        y_p = B.y + S_TRI * math.cos(math.radians(th))
        lm.levar((0.0, y_p))
        por_barra(th)
        for L, s in LADOS:
            g = tri.pegadores[s].matrix_world.to_translation()
            w = (tri.pegadores[s].matrix_world.to_3x3() @ Vector((1.0, 0.0, 0.0))).normalized()
            pegar(L, s, g, w, polo_de(L, s, 0.0), Vector((0.0, 0.0, -1.0)))
        jt_ = ck.medir_juntas(rig)
        return th, y_p, (jt_["cotoveloE"] + jt_["cotoveloD"]) / 2, max(maos.erro.values())

    S0 = cab("LeftArm")

    def busca_comeco():
        """Secante na altura do meio dos pegadores até o cotovelo (média dos 2) dar COTOVELO0° (mais baixo = braço mais esticado; a mão
        que não chega conta como braço esticado demais)."""
        def f(z):
            th0, y_p, cot, err = comeco(z)
            return (cot - COTOVELO0) if err < 0.002 else -20.0 - err * 1000

        za, zb = S0.z - 0.55, S0.z - 0.57
        fa, fb = f(za), f(zb)
        for _ in range(10):
            if abs(fb) < 0.2 or abs(fb - fa) < 1e-9:
                break
            zc = max(S0.z - 0.80, min(S0.z - 0.45, zb - fb * (zb - za) / (fb - fa)))
            za, fa = zb, fb
            zb, fb = zc, f(zc)
        z0 = zb
        th0, y_p, cot, err = comeco(z0)
        jt_ = ck.medir_juntas(rig)
        print("COMEÇO | meio dos pegadores (0, %.4f, %.4f) | barra a %.2f° do chão | pivô (0, %.4f, %.3f) = %.3f m atrás dos tornozelos | "
              "cotovelo %.1f/%.1f° | vão da mão a %.1f mm" % (y_S, z0, th0, y_p, ALTURA_PIVO, y_p - ya, jt_["cotoveloE"], jt_["cotoveloD"],
                                                              err * 1000), flush=True)
        return z0, th0, y_p

    Z0, TH0, Y_PIVO = busca_comeco()
    for L, _ in LADOS:                      # palpite do antebraço: o do começo (o fim entra depois do 1º pose(1))
        f_ = (cab(L + "Hand") - cab(L + "ForeArm")).normalized()
        F[L] = [f_, f_.copy()]

    # ── 7) fim: a barra sobe até a anilha chegar perto do peito (ou outra peça chegar perto do corpo) ────────────────────────────────
    nomes_obj = {o.name: o for o in lm.barra.children_recursive if o.type == "MESH"}
    ANILHA_OBJS = [o for n_, o in nomes_obj.items() if n_.startswith(("landmine_anilha", "landmine_presilha"))]
    BARRA_OBJS = [o for n_, o in nomes_obj.items() if n_.startswith("landmine_barra_")]
    PONTA_OBJS = [nomes_obj["landmine_barra_luva2"]]
    TRI_OBJS = [o for o in tri.raiz.children_recursive if o.type == "MESH"]

    def amostras(objs, passo, lo=None, hi=None):
        """Pontos na superfície das peças (a cada `passo` m) e o nome da peça de cada um; com lo/hi, só os de dentro da caixa."""
        pts, donos = [], []
        for ob in objs:
            P_ = ck._amostras(*ck._avaliar_simples(ob), passo)
            if lo is not None:
                P_ = P_[((P_ >= lo) & (P_ <= hi)).all(axis=1)]
            pts.append(P_)
            donos += [ob.name] * len(P_)
        return (np.concatenate(pts) if pts else np.zeros((0, 3))), donos

    def alvo_corpo(partes, co_tri=None):
        """BVH da pele das partes do corpo e a caixa delas (6 cm a mais em volta)."""
        co, tri_, (nomes, dono) = co_tri or _malha(bon)
        m = _grupo(nomes, dono, partes)
        return ck._bvh(co, tri_[m[tri_].all(axis=1)]), co[m].min(axis=0) - 0.06, co[m].max(axis=0) + 0.06

    def folga(objs, alvo, passo=0.006):
        """Menor distância (m, − = dentro) da superfície das peças até a pele do alvo (alvo_corpo), e a peça (só os pontos dentro da
        caixa do alvo)."""
        bvh, lo, hi = alvo
        pts, donos = amostras(objs, passo, lo, hi)
        menor, onde = 1.0, ""
        for p, dn in zip(pts, donos):
            v = Vector(p)
            loc, nor, idx, dist = bvh.find_nearest(v)
            if loc is None:
                continue
            d_ = -dist if (dist < 0.03 and (v - loc).dot(nor) < 0) else dist
            if d_ < menor:
                menor, onde = d_, dn
        return menor, onde

    ALVOS = {}

    def folgas_fim(th, passo=0.006):
        """As peças × o corpo com a barra na subida th (o corpo fica parado na busca: as pontas dos braços não contam)."""
        por_barra(th)
        return dict(anilha=folga(ANILHA_OBJS, ALVOS["peito"], passo), triangulo=folga(TRI_OBJS, ALVOS["baixo"], passo),
                    barra=folga(BARRA_OBJS, ALVOS["baixo"], passo), ponta=folga(PONTA_OBJS, ALVOS["cabeca"], passo))

    def para(fs):
        """Quanto falta (m) pra a 1ª peça chegar no limite dela (< 0 = passou)."""
        return min(fs["anilha"][0] - FOLGA_ANILHA, fs["triangulo"][0] - FOLGA_PECA, fs["barra"][0] - FOLGA_PECA,
                   fs["ponta"][0] - FOLGA_PECA)

    def busca_fim():
        escapulas(1.0)
        ct = _malha(bon)
        ALVOS.update(peito=alvo_corpo(TRONCO + CABECA, ct), baixo=alvo_corpo(TRONCO + PERNAS, ct), cabeca=alvo_corpo(CABECA, ct))
        th_a = TH0                          # de grau em grau com os pontos a cada 1 cm (rápido), parando 4 mm antes do limite
        while th_a + 1.0 <= TH_MAX and para(folgas_fim(th_a + 1.0, 0.010)) > 0.004:
            th_a += 1.0
        hi = th_a + 1.0                     # o limite de verdade fica entre th_a e hi (pontos a cada 6 mm)
        while hi < TH_MAX and para(folgas_fim(hi)) > 0:
            th_a, hi = hi, hi + 1.0
        lo = th_a
        for _ in range(9):
            m_ = (lo + hi) / 2
            if para(folgas_fim(m_)) > 0:
                lo = m_
            else:
                hi = m_
        fs = folgas_fim(lo)
        print("FIM | barra a %.2f° do chão (subiu %.2f°) | anilha × tronco %.1f mm (%s) | triângulo × corpo %.1f mm (%s) | barra × corpo "
              "%.1f mm (%s) | ponta da barra × cabeça %.1f mm" % (
                  lo, lo - TH0, fs["anilha"][0] * 1000, fs["anilha"][1], fs["triangulo"][0] * 1000, fs["triangulo"][1],
                  fs["barra"][0] * 1000, fs["barra"][1], fs["ponta"][0] * 1000), flush=True)
        return lo

    TH1 = busca_fim()

    # ── 8) pose: a barra gira no arco (subida linear em t), o triângulo vai junto e as mãos ficam nos pegadores ──────────────────────
    def pose(t):
        """t=0 braços pendurados, escápulas soltas; t=1 anilha perto do peito, cotovelos dobrados pra trás, escápulas juntas."""
        escapulas(t)
        por_barra(p3.lerp(TH0, TH1, t))
        maos_no_triangulo(t)

    pose(1.0)                               # polo certo do cotovelo com ele bem dobrado (fim), com o IK partindo do repouso
    for L, _ in LADOS:
        for n_, M in PARTIDA[L].items():
            PB[n_].matrix_basis = M.copy()
        maos.iks[L].mute = False
        e_ = p3.acertar_polo(rig, maos.iks[L], L + "ForeArm", L + "Arm", L + "Hand")
        print("polo cotovelo %s erro %.3f ang %d" % (L, *e_), flush=True)
    pose(1.0)
    for L, _ in LADOS:
        F[L][1] = (cab(L + "Hand") - cab(L + "ForeArm")).normalized()
    # de novo, com o polo acertado e a postura de partida: o começo (o cotovelo perto de esticado muda muito com 1–2 mm de alcance) e o
    # lugar do suporte; o fim só se o suporte andou
    y_antes = Y_PIVO
    Z0, TH0, Y_PIVO = busca_comeco()
    if abs(Y_PIVO - y_antes) > 0.001:
        TH1 = busca_fim()
    pose(1.0)
    for L, _ in LADOS:
        F[L][1] = (cab(L + "Hand") - cab(L + "ForeArm")).normalized()
    pose(0.0)
    for L, _ in LADOS:
        F[L][0] = (cab(L + "Hand") - cab(L + "ForeArm")).normalized()
    pose(0.0)
    pose.dedos = {}
    for L, s in LADOS:                      # os dedos e o polegar fecham uma vez, no começo, e ficam assim
        g = tri.pegadores[s].matrix_world.to_translation()
        u = (tri.pegadores[s].matrix_world.to_3x3() @ Vector((1.0, 0.0, 0.0))).normalized()
        pose.dedos[L] = pg.fechar_em_volta(bon, L, g, u, RAIO)
        DEDOS[L] = {pb.name: pb.matrix_basis.copy() for pb in PB
                    if pb.name[len(p3.P):].startswith(L + "Hand") and pb.name[len(p3.P):] != L + "Hand"}
        print("DEDOS %s | %s" % (L, pose.dedos[L]), flush=True)

    # ── 9) medidas do quadro (info): técnica, peças × corpo, mão × peças fora da pegada ──────────────────────────────────────────────
    PEGA = ("triangulo_pegada+1", "triangulo_pegada-1")

    def mao_x(objs, co_tri, pular=()):
        """Menor distância (mm, − = dentro) da superfície das peças até a pele da MÃO (o que a checagem ignora)."""
        co, tri_, (nomes, dono) = co_tri
        bvh = ck._bvh(co, tri_)
        mao_ = _grupo(nomes, dono, tuple(n for n in nomes if n.startswith(("LeftHand", "RightHand"))))
        pts, donos = amostras([o for o in objs if o.name not in pular], 0.004, co[mao_].min(axis=0) - 0.05,
                              co[mao_].max(axis=0) + 0.05)
        menor, onde = 1.0, ""
        for p, dn in zip(pts, donos):
            v = Vector(p)
            loc, nor, idx, dist = bvh.find_nearest(v)
            if loc is None or not mao_[tri_[idx][0]]:
                continue
            d_ = -dist if (v - loc).dot(nor) < 0 else dist
            if d_ < menor:
                menor, onde = d_, dn
        return menor * 1000, onde

    def info():
        jj = ck.posicoes(rig)
        jt_ = ck.medir_juntas(rig)
        ct = _malha(bon)
        baixo = alvo_corpo(TRONCO + PERNAS, ct)
        fa = folga(ANILHA_OBJS, alvo_corpo(TRONCO + CABECA, ct))
        ft = folga(TRI_OBJS, baixo)
        fb = folga(BARRA_OBJS, baixo)
        fp = folga(PONTA_OBJS, alvo_corpo(CABECA, ct))
        mt = mao_x(TRI_OBJS, ct, pular=PEGA)
        mb = mao_x(BARRA_OBJS + ANILHA_OBJS, ct)
        z_an = min(min((o.matrix_world @ v.co).z for v in o.data.vertices) for o in ANILHA_OBJS)
        c = tri.raiz.matrix_world.to_translation()
        return ("barra %.2f° | triângulo (%.3f %.3f %.3f) | anilha mais baixa z %.3f | cotovelo %.0f/%.0f° | abertura %s° | braço × "
                "tronco %s° | antebraço × vertical %s° | punho %.0f/%.0f° (flexão %s, desvio %s) | palma pro meio %s° | pegada %.2f | "
                "escápula %s mm | tronco %.1f° | coluna %.1f° | cabeça %.0f° | anilha × tronco %.1f mm (%s) | triângulo × corpo %.1f mm "
                "(%s) | barra × corpo %.1f mm (%s) | ponta da barra × cabeça %.1f mm | mão × triângulo fora da pegada %.1f mm (%s) | "
                "mão × barra/anilha %.1f mm (%s) | %s" % (
                    lm.subida, *c, z_an, jt_["cotoveloE"], jt_["cotoveloD"], "/".join("%.0f" % v for v in tc.cotovelo_tronco(jj)),
                    "/".join("%.0f" % v for v in tc.braco_frente(jj)), "/".join("%.0f" % v for v in tc.antebraco_vertical(jj)),
                    jt_["punhoE"], jt_["punhoD"], "/".join("%.0f" % v for v in tc.punho_flexao(jj)),
                    "/".join("%+.0f" % v for v in tc.punho_desvio(jj)), "/".join("%.0f" % v for v in tc.palma_dentro(jj)),
                    tc.pegada_largura(jj)[0], "/".join("%.0f" % v for v in tc.escapula_frente(jj)),
                    math.degrees(math.atan2(math.hypot(*(jj["Neck"][:2] - jj["Hips"][:2])), jj["Neck"][2] - jj["Hips"][2])),
                    tc.coluna(jj)[0], tc.cabeca_tronco(jj)[0], fa[0] * 1000, fa[1], ft[0] * 1000, ft[1], fb[0] * 1000, fb[1],
                    fp[0] * 1000, mt[0], mt[1], mb[0], mb[1], maos.info()))

    for t in (0.0, 0.5, 1.0):
        pose(t)
        print("t=%.2f | %s" % (t, info()), flush=True)
    pose(0.0)

    pegs = [(L, ck.Barra(tri.pegadores[s], tri.raio, tri.meia)) for L, s in LADOS]
    yq = float(H.y)
    return Cena(pose, lm.equipamentos + [tri.raiz], pegadas=pegs, apoio_mm=0.0, foco_luz=(0, yq - 0.2, 0.7),
                camera_video=((3.6, yq - 1.6, 1.4), (0, yq + 0.2, 0.6), 50), info=info)
