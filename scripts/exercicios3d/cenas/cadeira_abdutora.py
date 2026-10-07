# Cadeira Abdutora — cena da fábrica 3D (lote 4, 06/10/2026). Máquina nova: equip3d.cadeira_quadril (a mesma peça da Cadeira
# Adutora, com a almofada do lado de dentro).
# t = 0 pernas fechadas (coxas quase paralelas, joelhos perto, as almofadas encostadas por fora dos joelhos) · t = 1 pernas abertas
# ~40° cada uma. Técnica (ExRx, Lever Seated Hip Abduction): "Sit on machine with legs inside of side pads. If available, place
# heels on foot bars. Release and pull lever brace to position legs together." / "Lie back and grasp bars to sides." / "Move legs
# apart as far as possible. Return and repeat." Fabricante (eGym M10 Abductor): "Sit with your glutes against the backrest and
# your back straight." / "Place your feet on the footrests and position the outside of your thighs or knees against the pads." /
# "Hold the side handles for stability." / "Start with your legs close together." / "Press your legs outward against the
# resistance until a comfortable stretch is felt in your hips." / "Return to the starting position in a controlled motion."
# Postura da condição de 90° do estudo de EMG na própria máquina (Farias et al., preprint Research Square 2026): "participants
# sat upright with their trunks vertically, and their hips and knees flexed at approximately right angles. The pelvis was
# pressed against the backrest, and the torso stayed in contact throughout the entire exercise."
# Como o rig faz: o corpo inclina pra trás em volta do quadril até o glúteo e a parte de cima das costas encostarem juntos num
# encosto quase em pé (5° atrás da vertical); as coxas ficam deitadas (na horizontal), abertas ABRE0 graus (juntas e paralelas,
# as coxas musculosas entram uma na outra perto da virilha), as canelas em pé (joelho a 90°) e os pés chapados nos apoios, com
# a ponta pra onde a coxa aponta; o corpo desce até a pele afundar 2 mm no assento. A máquina é montada EM VOLTA do corpo: o
# eixo de cada braço é a vertical que passa pela articulação do quadril do mesmo lado, a almofada encosta por fora do joelho,
# o apoio do pé fica embaixo da sola e os pegadores do lado do assento, um pouco atrás do quadril (as coxas abrindo não chegam
# nas mãos). No movimento só o quadril mexe: cada perna inteira (coxa, canela e pé, o joelho parado a 90°) gira em volta da
# vertical do seu quadril e o braço da máquina gira o MESMO ângulo em volta do mesmo eixo — almofada e apoio do pé ficam
# encostados o tempo todo; pelve, tronco, cabeça, braços e mãos não mexem.
import math
import numpy as np
from mathutils import Matrix, Vector
import poses3d as p3
import equip3d as e3
import pegada3d as pg
import checagem3d as ck
import tecnica3d as tc
from maos3d import Maos
from cena import Cena

LADOS = (("Left", 1), ("Right", -1))      # s = +1 no esquerdo (+X)
ASSENTO = 0.54            # topo do assento (escolha da fábrica: com o joelho a 90° e o pé no apoio, o apoio fica ~10 cm
                          # acima do chão)
ESP_ASSENTO = 0.05        # estofado de 5 cm (escolha da fábrica, o mesmo da cadeira extensora)
LARGURA, PROF = 0.356, 0.33   # assento de 14" × 13" (Titan Selectorized Hip Abductor Adductor: "Seat Pad Dimensions: 13-in. x
                              # 14-in.")
ENCOSTO = 5.0             # encosto 5° atrás da vertical: tronco "upright" / "trunks vertically" (eGym; Farias et al.)
ALT_ENCOSTO, LARG_ENCOSTO, ESP_ENCOSTO = 0.445, 0.305, 0.06   # 17,5" × 12" (Titan: "Back Pad Dimensions: 12-in. x 17.5-in.")
AFUNDA = 0.002            # pele afundando no estofado do assento
AFUNDA_ENC = 0.006        # glúteo e costas afundando no encosto ("The pelvis was pressed against the backrest", Farias et al.):
                          # com a coxa aberta a pele do glúteo (presa em parte no osso da coxa) vem ~5 mm pra frente
ABRE0, ABRE1 = 3.0, 40.0  # abertura de cada coxa: pernas juntas (3°: juntas e paralelas as coxas entravam uma na outra perto
                          # da virilha, como na extensora) → abertas 40° ("as far as possible", ExRx; "until a comfortable
                          # stretch is felt in your hips", eGym)
ALMOFADA = (0.20, 0.14, 0.06)  # almofada do joelho: 20 cm ao longo da coxa × 14 cm de altura × 6 cm de espuma (escolha da fábrica)
ALM_ATRAS = 0.05          # o centro da almofada fica 5 cm atrás do centro do joelho: pega o lado de fora do joelho e o fim da coxa
AFUNDA_ALM = 0.002        # a espuma da almofada afunda na pele
PE = (0.30, 0.13, 0.02)   # apoio do pé: 30 × 13 cm, chapa de 2 cm com borracha (escolha da fábrica)
AFUNDA_PE = 0.0015        # a sola afunda na borracha do apoio
RAIO = 0.0145             # pegador de 29 mm (o cilindro da mão de referência; escolha da fábrica)
COMP_PEGADOR = 0.14
X_PEG = 0.30              # pegadores 12 cm pra fora da borda do assento
PEG_TRAS = 0.06           # pegador 6 cm atrás da articulação do quadril (do lado do glúteo): as coxas abrindo não chegam nele
COTOVELO = 20.0           # braços quase esticados, segurando os pegadores ("Hold the side handles for stability", eGym): a
                          # altura do pegador sai daí (o cotovelo dobra ~20° com a mão nele)


def _malha(bon):
    return ck._avaliar(bon.corpo, 1)


def _grupo(nomes, dono, partes):
    return np.array([n in partes for n in nomes] + [False])[dono]


def montar(bon):
    pg.usar_polegar("volta")          # polegar dando a volta no pegador (padrão dos exercícios novos)
    rig = bon.rig
    PB = rig.pose.bones

    def pele(partes):
        co, _, (nomes, dono) = _malha(bon)
        return co[_grupo(nomes, dono, partes)]

    PERNA = ("Hips",) + tuple(L + o for L, _ in LADOS for o in ("UpLeg", "Leg", "Foot"))
    repouso = {n: PB[p3.P + n].matrix_basis.copy() for n in PERNA}
    pe_rep = {L: p3.mundo_osso(rig, L + "Foot").to_3x3().normalized() for L, _ in LADOS}   # sola chapada no chão (repouso)
    pivo0 = (p3.cabeca(rig, "LeftUpLeg") + p3.cabeca(rig, "RightUpLeg")) / 2
    a_enc = math.radians(ENCOSTO)
    n_enc = Vector((0, -math.cos(a_enc), math.sin(a_enc)))   # normal da face do encosto (pro corpo)
    cima = Vector((0, 0, 1))

    def coxa_dir(s, graus):
        a = math.radians(graus)
        return Vector((s * math.sin(a), -math.cos(a), 0))

    def sentar(reclina):
        """Corpo inclinado `reclina` graus pra trás em volta do quadril, coxas deitadas e abertas ABRE0 graus, canelas em pé,
        pés chapados (sola na horizontal) com a ponta pra onde a coxa aponta, e a pele em cima do assento afundando AFUNDA."""
        for n, M in repouso.items():
            PB[p3.P + n].matrix_basis = M.copy()
        p3.atualizar()
        p3.girar_osso(rig, "Hips", p3.rot_x(-reclina), pivo=pivo0)
        for lado, s in LADOS:
            u = coxa_dir(s, ABRE0)
            h, k = p3.cabeca(rig, lado + "UpLeg"), p3.cabeca(rig, lado + "Leg")
            p3.girar_osso(rig, lado + "UpLeg", (k - h).rotation_difference(u).to_matrix())
            k, a = p3.cabeca(rig, lado + "Leg"), p3.cabeca(rig, lado + "Foot")
            p3.girar_osso(rig, lado + "Leg", (a - k).rotation_difference(Vector((0, 0, -1))).to_matrix())
            for _ in range(3):
                f = p3.cabeca(rig, lado + "ToeBase") - p3.cabeca(rig, lado + "Foot")   # ponta do pé pra onde a coxa aponta:
                giro = math.atan2(f.x, -f.y) - math.atan2(u.x, -u.y)                 # a canela gira em volta dela mesma
                p3.girar_osso(rig, lado + "Leg", Matrix.Rotation(-giro, 3, "Z"))
                R = p3.mundo_osso(rig, lado + "Foot").to_3x3().normalized() @ pe_rep[lado].inverted()
                p3.girar_osso(rig, lado + "Foot", (R @ cima).rotation_difference(cima).to_matrix())   # sola na horizontal
        for _ in range(4):
            v = pele(("Hips", "LeftUpLeg", "RightUpLeg"))
            v = v[(v[:, 1] > float(pivo0.y) - 0.20) & (np.abs(v[:, 0]) < LARGURA / 2)]
            dz = ASSENTO - AFUNDA - float(v[:, 2].min())
            p3.girar_osso(rig, "Hips", Matrix.Identity(3), mover=Vector((0, 0, dz)))
            if abs(dz) < 0.0002:
                break

    def costas():
        """Quanto o glúteo e a parte de cima das costas chegam no encosto (n·p, m; menor = mais pra trás)."""
        co, _, (nomes, dono) = _malha(bon)
        g = co[_grupo(nomes, dono, ("Hips",))]
        g = g[g[:, 2] > ASSENTO + 0.03]
        c = co[_grupo(nomes, dono, ("Spine1", "Spine2", "LeftShoulder", "RightShoulder"))]
        c = c[(np.abs(c[:, 0]) < LARG_ENCOSTO / 2) & (c[:, 2] < ASSENTO + ALT_ENCOSTO * math.cos(a_enc) - 0.01)]
        nn = np.array(n_enc)
        return float((g @ nn).min()), float((c @ nn).min())

    # o quanto o corpo inclina pra trás: o glúteo e as costas encostam JUNTOS no encosto ("Sit with your glutes against the
    # backrest and your back straight", eGym; "The pelvis was pressed against the backrest, and the torso stayed in contact",
    # Farias et al.)
    lo, hi = -5.0, 20.0
    for _ in range(10):
        meio = (lo + hi) / 2
        sentar(meio)
        dg, dc = costas()
        if dg < dc:            # o glúteo chega antes: as costas estão longe → inclina mais
            lo = meio
        else:
            hi = meio
    reclina = (lo + hi) / 2
    sentar(reclina)
    dg, dc = costas()
    d_enc = min(dg, dc) + AFUNDA_ENC
    y_base = (math.sin(a_enc) * ASSENTO - d_enc) / math.cos(a_enc)
    y_tras = y_base + 0.04
    y_frente = y_tras - PROF
    H = {L: p3.cabeca(rig, L + "UpLeg") for L, _ in LADOS}       # articulações do quadril: os eixos dos braços
    K = {L: p3.cabeca(rig, L + "Leg") for L, _ in LADOS}
    jl = ck.posicoes(rig)
    print("SENTADO | reclina %.2f° | glúteo × costas no encosto %.1f mm | quadris E (%.4f %.4f %.4f) D (%.4f %.4f %.4f) | "
          "joelhos E (%.4f %.4f %.4f) | assento y %.3f → %.3f | encosto y_base %.3f | tronco %.1f° | quadril %s | joelho %s | "
          "coxa %s" % (
              reclina, (dg - dc) * 1000, *H["Left"], *H["Right"], *K["Left"], y_frente, y_tras, y_base,
              math.degrees(math.atan2(math.hypot(*(jl["Neck"][:2] - jl["Hips"][:2])), jl["Neck"][2] - jl["Hips"][2])),
              "/".join("%.1f" % v for v in tc.quadril_sinal(jl)),
              "/".join("%.1f" % ck.medir_juntas(rig)[k] for k in ("joelhoE", "joelhoD")),
              "/".join("%.1f" % v for v in tc.coxa_abertura(jl))), flush=True)

    # ── almofada por fora do joelho, apoio do pé embaixo da sola e o poste do braço do lado de fora da perna ──────────────────
    almofadas, pes, postes = {}, {}, {}
    comp_a, alt_a, esp_a = ALMOFADA
    for lado, s in LADOS:
        u = coxa_dir(s, ABRE0)
        fora = s * cima.cross(u)                                   # de lado, pra fora da perna
        Kl = K[lado]
        P = pele((lado + "UpLeg", lado + "Leg")) - np.array(Kl)
        al, lat, z = P @ np.array(u), P @ np.array(fora), P[:, 2]
        m = (al > -ALM_ATRAS - comp_a / 2) & (al < -ALM_ATRAS + comp_a / 2) & (np.abs(z) < alt_a / 2)
        L_max = float(lat[m].max())
        face = Kl - u * ALM_ATRAS + fora * (L_max - AFUNDA_ALM)
        almofadas[s] = (face, u, -fora, ALMOFADA)
        Q = face + fora * (esp_a + 0.012 + 0.025 + 0.004)
        postes[s] = (Q.x, Q.y)
        S = pele((lado + "Foot", lado + "ToeBase"))
        z_sola = float(S[:, 2].min())
        A = np.array(p3.cabeca(rig, lado + "Foot"))
        sa, sl = (S - A) @ np.array(u), (S - A) @ np.array(fora)
        c_pe = Vector(A) + u * float((sa.min() + sa.max()) / 2) + fora * float((sl.min() + sl.max()) / 2)
        c_pe.z = z_sola + AFUNDA_PE
        pes[s] = (c_pe, u, PE)
        print("PERNA %s | lado de fora do joelho %.1f mm do centro dele | almofada face (%.4f %.4f %.4f) | poste (%.3f %.3f) | "
              "sola z %.4f | pé %.0f mm de comprimento, %.0f de largura" % (
                  lado, L_max * 1000, *face, Q.x, Q.y, z_sola, (sa.max() - sa.min()) * 1000, (sl.max() - sl.min()) * 1000),
              flush=True)

    # ── braços: mãos nos pegadores do lado do assento (pegada neutra, palma pro assento), cotovelo pra trás ─────────────────────
    q = (H["Left"] + H["Right"]) / 2
    maos = Maos(bon, RAIO, polo_inicial=(0, 0.5, 0), polegar_modo="volta")
    y_p = q.y + PEG_TRAS

    def mao_no_pegador(lado, s, z, acertar=False):
        """Mão `lado` no pegador a altura z (IK + mão na pegada, sem fechar os dedos): palma pro assento, dedos pra baixo no
        plano ⟂ ao pegador, cotovelo pra trás e um pouco pra fora. acertar: escolhe o ângulo do polo do IK (com o cotovelo
        dobrado; esticado, o plano do cotovelo não existe). Devolve a flexão do cotovelo."""
        S = p3.cabeca(rig, lado + "Arm")
        g = Vector((s * X_PEG, y_p, z))
        d = g - S
        dq = Vector((d.x, 0, d.z)).normalized()
        pq = Vector((-s, 0, 0))
        pq = (pq - dq * pq.dot(dq)).normalized()
        polo = S + Vector((s * 0.35, 0.55, -0.25))
        maos.segurar(lado, g, dq, pq, polo=polo)
        if acertar:
            maos.iks[lado].mute = False
            p3.acertar_polo(rig, maos.iks[lado], lado + "ForeArm", lado + "Arm", lado + "Hand")
            maos.segurar(lado, g, dq, pq, polo=polo)
        return ck.medir_juntas(rig)["cotovelo" + ("E" if s > 0 else "D")]

    for lado, s in LADOS:                            # polo certo com o cotovelo bem dobrado (pegador alto)
        mao_no_pegador(lado, s, ASSENTO + 0.12, acertar=True)
    lo, hi = ASSENTO - 0.20, ASSENTO + 0.10          # mais baixo = braço mais esticado
    for _ in range(7):
        z_p = (lo + hi) / 2
        if mao_no_pegador("Left", 1, z_p) > COTOVELO:
            hi = z_p
        else:
            lo = z_p
    z_p = (lo + hi) / 2
    eixo_peg = Vector((0, 1, 0))                     # o pegador fica ao longo do Y
    for lado, s in LADOS:                            # as mãos não mexem: dedos e polegar fecham uma vez só
        mao_no_pegador(lado, s, z_p)
        pg.fechar_em_volta(bon, lado, Vector((s * X_PEG, y_p, z_p)), eixo_peg, RAIO)
    print("MÃOS | pegadores em x ±%.3f y %.3f z %.3f (%.0f mm abaixo do topo do assento) | %s | cotovelo %s | punho %s" % (
        X_PEG, y_p, z_p, (ASSENTO - z_p) * 1000, maos.info(),
        "/".join("%.0f" % ck.medir_juntas(rig)[k] for k in ("cotoveloE", "cotoveloD")),
        "/".join("%.0f" % ck.medir_juntas(rig)[k] for k in ("punhoE", "punhoD"))), flush=True)

    # ── a máquina em volta do corpo ──────────────────────────────────────────────────────────────────────────────────────────
    eixos = {s: (H[L].x, H[L].y) for L, s in LADOS}
    cad = e3.cadeira_quadril("abdutora", eixos=eixos, assento=(y_frente, y_tras, ASSENTO, LARGURA, ESP_ASSENTO),
                             encosto=(y_base, ENCOSTO, ALT_ENCOSTO, LARG_ENCOSTO, ESP_ENCOSTO), almofadas=almofadas, pes=pes,
                             postes=postes, pegadores=(y_p, z_p, X_PEG, COMP_PEGADOR, RAIO), almofada="fora")
    print("MÁQUINA | eixos E (%.4f %.4f) D (%.4f %.4f) z %.3f | assento y %.3f → %.3f" % (
        *eixos[1], *eixos[-1], cad.eixos[1].z, y_frente, y_tras), flush=True)

    base_coxa = {L: PB[p3.P + L + "UpLeg"].matrix_basis.copy() for L, _ in LADOS}

    def pose(t):
        """t=0 pernas fechadas (coxas abertas ABRE0), t=1 abertas ABRE1 (cada perna gira em volta da vertical do quadril)."""
        g = p3.lerp(0.0, ABRE1 - ABRE0, t)
        for lado, _ in LADOS:
            PB[p3.P + lado + "UpLeg"].matrix_basis = base_coxa[lado].copy()
        p3.atualizar()
        for lado, s in LADOS:              # a perna inteira (coxa, canela e pé) gira junto, em volta do eixo do braço
            p3.girar_osso(rig, lado + "UpLeg", Matrix.Rotation(math.radians(s * g), 3, "Z"))
        cad.girar(g)                       # os braços, o mesmo ângulo, em volta da mesma vertical

    def info():
        jj = ck.posicoes(rig)
        juntas = ck.medir_juntas(rig)
        eixo_mm = []
        for L, s in LADOS:
            E = cad.raizes["braco_" + ("esq" if s > 0 else "dir")].matrix_world
            c0, ux = E.to_translation(), (E.to_3x3() @ Vector((1, 0, 0))).normalized()
            v = p3.cabeca(rig, L + "UpLeg") - c0
            eixo_mm.append((v - ux * v.dot(ux)).length * 1000)
        return ("coxa aberta %s° | quadril × eixo do braço %.1f/%.1f mm | braços %.1f° | joelho %.0f/%.0f° | quadril %.0f/%.0f° | "
                "tronco %.1f° | coxa × horizontal %s° | tornozelo %s° | cotovelo %.0f/%.0f° | %s" % (
                    "/".join("%.1f" % v for v in tc.coxa_abertura(jj)), *eixo_mm, cad.angulo,
                    juntas["joelhoE"], juntas["joelhoD"], juntas["quadrilE"], juntas["quadrilD"],
                    math.degrees(math.atan2(math.hypot(*(jj["Neck"][:2] - jj["Hips"][:2])), jj["Neck"][2] - jj["Hips"][2])),
                    "/".join("%.1f" % v for v in ck.angulo_chave(rig, {"medida": "inclinacao", "segmento": ["UpLeg", "Leg"]})),
                    "/".join("%.0f" % v for v in tc.tornozelo(jj)), juntas["cotoveloE"], juntas["cotoveloD"], maos.info()))

    for t in (0.0, 0.5, 1.0):
        pose(t)
        print("t=%.2f | %s" % (t, info()), flush=True)
    pose(0.0)

    pegs = [(L, ck.Barra(cad.pegadores[s], RAIO, COMP_PEGADOR / 2, eixo=(0, 0, 1))) for L, s in LADOS]
    yq = float(q.y)
    return Cena(pose, cad.equipamentos, pegadas=pegs, apoio_mm=0.0, foco_luz=(0, yq - 0.15, 0.7),
                camera_video=((2.0, yq - 3.2, 1.75), (0, yq - 0.2, 0.62), 50), info=info, apoios=cad.apoios,
                afunda_apoio_mm=20)
