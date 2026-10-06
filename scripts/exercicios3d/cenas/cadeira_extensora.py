# Cadeira Extensora — cena da fábrica 3D (lote 4, 06/10/2026). A PRIMEIRA máquina da fábrica (equip3d.cadeira_joelho, a mesma
# peça da Cadeira Flexora sentada).
# t = 0 joelho dobrado a ~90° (canela em pé, o rolo na frente dela logo acima do tornozelo) · t = 1 joelho quase esticado (~7°, sem
# travar). Técnica (ExRx, Lever Leg Extension): "Sit on apparatus with back against padded back support. Place front of lower legs
# under padded lever. Position knee articulation at same axis as lever fulcrum. Grasp handles to sides for support." / "Move lever
# forward and upward by extending knees until legs are straight." Regulagem do fabricante (eGym M1 Leg Extension): "Sit with your
# glutes fully against the backrest. Adjust the backrest so your knee joint aligns with the machine’s rotational axis." / "Position
# the roller pad just above your ankle." Sem travar o joelho em cima (The Wellness Network: "stopping just before you maintain a
# straight leg position. You do not want to hyper-extend or lock out the knees").
# Como o rig faz: o corpo inclina pra trás em volta do quadril até o glúteo e a parte de cima das costas encostarem juntos num
# encosto a 100° do assento (Steelflex PLLE); as coxas ficam na horizontal, quase paralelas (abertas 3°), e as canelas em pé, com
# as pontas dos pés pra frente; o corpo desce até a pele afundar 2 mm no assento. A máquina é montada EM VOLTA do corpo: o eixo
# passa pelos 2 joelhos, o encosto encosta nas costas, a borda do assento fica logo atrás da batata da perna, o rolo encosta na
# frente da canela logo acima do tornozelo e os pegadores ficam do lado do assento, onde as mãos chegam com os braços quase
# esticados. No movimento só o joelho mexe: as 2 canelas (com os pés, tornozelo parado) giram em volta do eixo do joelho e a
# alavanca e o rolo giram o MESMO ângulo em volta do eixo da máquina — o rolo fica encostado na canela o tempo todo; coxas,
# quadril, tronco, cabeça, braços e mãos não mexem.
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
ASSENTO = 0.61            # topo do assento: 24" (Titan Leg Extension & Hamstring Curl Machine: "Adjustable Seat Height:
                          # 24-in. – 26.5-in.")
ESP_ASSENTO = 0.05        # estofado de 2" (Titan: "Seat Pad Dimensions: 22-in. x 17-in. x 2-in."; Steelflex PLLE: "50 mm CGPC
                          # high density foam upholstery")
LARGURA = 0.43            # assento de 17" (Titan, idem)
ENCOSTO = 10.0            # encosto 10° atrás da vertical = 100° com o assento (Steelflex PLLE: "exact 100° angle between the seat
                          # and back rest pad")
ALT_ENCOSTO, LARG_ENCOSTO, ESP_ENCOSTO = 0.62, 0.36, 0.06   # do assento até a altura das escápulas (escolha da fábrica)
AFUNDA = 0.002            # pele afundando no estofado do assento e do encosto
ABRE = 3.0                # coxas abertas 3° pra fora (joelhos ~2 cm mais afastados que o quadril de cada lado): juntas e
                          # paralelas, as coxas musculosas entravam uma na outra perto da virilha (14 mm)
JOELHO0, JOELHO1 = 90.0, 7.0   # flexão do joelho: ~90° embaixo (pedido) → quase esticado em cima, sem travar
RAIO_ROLO, COMPR_ROLO = 0.0635, 0.43    # rolo de 17" × 5" (Titan: "Roller Pad Dimensions: 17-in. x 5-in.")
ROLO_ACIMA = 0.08         # o rolo encosta 8 cm acima do centro do tornozelo, ao longo da canela ("just above your ankle", eGym)
AFUNDA_ROLO = 0.003       # a espuma do rolo afunda na pele da canela
FOLGA_PANTURRILHA = 0.012 # a borda da frente do assento fica 1,2 cm atrás da batata da perna (com o joelho a 90°)
X_ALAVANCA = 0.29         # braço da alavanca 29 cm do meio (fora da perna, com folga quando a canela estica pra fora)
RAIO = 0.0145             # pegador de 29 mm (o cilindro da mão de referência; escolha da fábrica)
COMP_PEGADOR = 0.14
X_PEG = 0.29              # pegadores 7,5 cm pra fora da borda do assento
PEG_FRENTE = 0.06         # pegador 6 cm à frente da articulação do quadril (do lado do quadril / começo da coxa)
COTOVELO = 15.0           # braços quase esticados, segurando os pegadores ("Grasp handles to sides for support", ExRx): a altura
                          # do pegador sai daí (o cotovelo dobra ~15° com a mão nele)


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
    eixo_joelho = {}                 # eixo de dobra de cada joelho: ⟂ à coxa e à canela (a canela estica na direção da coxa)
    repouso = {n: PB[p3.P + n].matrix_basis.copy() for n in PERNA}
    pivo0 = (p3.cabeca(rig, "LeftUpLeg") + p3.cabeca(rig, "RightUpLeg")) / 2
    a_enc = math.radians(ENCOSTO)
    n_enc = Vector((0, -math.cos(a_enc), math.sin(a_enc)))   # normal da face do encosto (pro corpo)

    def borda_assento():
        """y da borda da frente do assento: logo atrás da batata da perna, na altura do estofado."""
        P = pele(("LeftLeg", "RightLeg"))
        P = P[P[:, 2] > ASSENTO - ESP_ASSENTO - 0.03]
        return float(P[:, 1].max()) + FOLGA_PANTURRILHA

    def sentar(reclina):
        """Corpo inclinado `reclina` graus pra trás em volta do quadril, coxas na horizontal e abertas ABRE graus, canelas em
        pé e paralelas, com a ponta do pé pra frente, e a pele em cima do assento afundando AFUNDA."""
        for n, M in repouso.items():
            PB[p3.P + n].matrix_basis = M.copy()
        p3.atualizar()
        p3.girar_osso(rig, "Hips", p3.rot_x(-reclina), pivo=pivo0)
        for lado, _ in LADOS:
            h, k = p3.cabeca(rig, lado + "UpLeg"), p3.cabeca(rig, lado + "Leg")
            s_ = 1 if lado == "Left" else -1
            alvo_coxa = Vector((s_ * math.sin(math.radians(ABRE)), -math.cos(math.radians(ABRE)), 0))
            p3.girar_osso(rig, lado + "UpLeg", (k - h).rotation_difference(alvo_coxa).to_matrix())
            k, a = p3.cabeca(rig, lado + "Leg"), p3.cabeca(rig, lado + "Foot")
            p3.girar_osso(rig, lado + "Leg", (a - k).rotation_difference(Vector((0, 0, -1))).to_matrix())
            f = p3.cabeca(rig, lado + "ToeBase") - p3.cabeca(rig, lado + "Foot")     # ponta do pé pra frente: a canela gira
            p3.girar_osso(rig, lado + "Leg", Matrix.Rotation(-math.atan2(f.x, -f.y), 3, "Z"))   # em volta dela mesma
            k = p3.cabeca(rig, lado + "Leg")
            eixo_joelho[lado] = (k - p3.cabeca(rig, lado + "UpLeg")).cross(p3.cabeca(rig, lado + "Foot") - k).normalized()
        for _ in range(4):
            yf = borda_assento()
            v = pele(("Hips", "LeftUpLeg", "RightUpLeg"))
            v = v[(v[:, 1] > yf) & (np.abs(v[:, 0]) < LARGURA / 2)]
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
        c = c[np.abs(c[:, 0]) < LARG_ENCOSTO / 2]
        nn = np.array(n_enc)
        return float((g @ nn).min()), float((c @ nn).min())

    # o quanto o corpo inclina pra trás: o glúteo e as costas encostam JUNTOS no encosto a 100° do assento ("glutes fully
    # against the backrest", eGym; "back against padded back support", ExRx)
    lo, hi = 0.0, 25.0
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
    d_enc = min(dg, dc) + AFUNDA
    y_base = (math.sin(a_enc) * ASSENTO - d_enc) / math.cos(a_enc)
    y_frente = borda_assento()
    K = {L: p3.cabeca(rig, L + "Leg") for L, _ in LADOS}
    ye, ze = (K["Left"].y + K["Right"].y) / 2, (K["Left"].z + K["Right"].z) / 2
    jl = ck.posicoes(rig)
    print("EIXOS DOS JOELHOS | E (%.3f %.3f %.3f) D (%.3f %.3f %.3f) | %.1f°/%.1f° do X" % (
        *eixo_joelho["Left"], *eixo_joelho["Right"],
        *(math.degrees(eixo_joelho[L].angle(Vector((1, 0, 0)))) for L, _ in LADOS)))
    print("SENTADO | reclina %.2f° | glúteo × costas no encosto %.1f mm | joelhos E (%.4f %.4f %.4f) D (%.4f %.4f %.4f) | "
          "eixo y %.4f z %.4f | borda do assento y %.3f | encosto y_base %.3f | tronco %.1f° | quadril %s | joelho %s" % (
              reclina, (dg - dc) * 1000, *K["Left"], *K["Right"], ye, ze, y_frente, y_base,
              math.degrees(math.atan2(math.hypot(*(jl["Neck"][:2] - jl["Hips"][:2])), jl["Neck"][2] - jl["Hips"][2])),
              "/".join("%.1f" % v for v in tc.quadril_sinal(jl)),
              "/".join("%.1f" % ck.medir_juntas(rig)[k] for k in ("joelhoE", "joelhoD"))), flush=True)

    # ── rolo na frente da canela, ROLO_ACIMA acima do tornozelo: o mais perto dela sem a pele entrar mais que AFUNDA_ROLO ─────────
    centros = []
    for lado, _ in LADOS:
        A, Kl = p3.cabeca(rig, lado + "Foot"), p3.cabeca(rig, lado + "Leg")
        u = (A - Kl).normalized()                                  # ao longo da canela, pra baixo
        f = Vector((0, -1, 0))
        f = (f - u * f.dot(u)).normalized()                        # pra frente, ⟂ canela
        c = A - u * ROLO_ACIMA
        P = pele((lado + "Leg", lado + "Foot", lado + "ToeBase")) - np.array(c)
        al, fr = P @ np.array(u), P @ np.array(f)
        r = RAIO_ROLO - AFUNDA_ROLO
        m = np.abs(al) < r
        F = float((fr[m] + np.sqrt(r ** 2 - al[m] ** 2)).max())
        centros.append(c + f * F)
        print("ROLO %s | frente da canela %.1f mm à frente do eixo dela | centro (%.4f %.4f)" % (
            lado, float(fr[m & (np.abs(al) < 0.01)].max()) * 1000, (c + f * F).y, (c + f * F).z))
    y_r, z_r = (centros[0].y + centros[1].y) / 2, (centros[0].z + centros[1].z) / 2

    # ── braços: mãos nos pegadores do lado do assento (pegada neutra, palma pro assento), cotovelo pra trás ─────────────────────
    q = (p3.cabeca(rig, "LeftUpLeg") + p3.cabeca(rig, "RightUpLeg")) / 2
    maos = Maos(bon, RAIO, polo_inicial=(0, 0.5, 0), polegar_modo="volta")
    y_p = q.y - PEG_FRENTE

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
    y_tras = y_base + 0.06
    cad = e3.cadeira_joelho("cadeira", eixo=(ye, ze), assento=(y_frente, y_tras, ASSENTO, LARGURA, ESP_ASSENTO),
                            encosto=(y_base, ENCOSTO, ALT_ENCOSTO, LARG_ENCOSTO, ESP_ENCOSTO),
                            rolo=(y_r, z_r, RAIO_ROLO, COMPR_ROLO),
                            pegadores=(y_p, z_p, X_PEG, COMP_PEGADOR, RAIO), lado=-1, x_alavanca=X_ALAVANCA,
                            x_torre=X_ALAVANCA + 0.10)
    print("MÁQUINA | eixo (%.3f %.3f %.3f) | assento y %.3f → %.3f | rolo y %.4f z %.4f (braço da alavanca %.3f m)" % (
        *cad.eixo, y_frente, y_tras, y_r, z_r, math.hypot(y_r - ye, z_r - ze)), flush=True)

    base_pernas = {L: PB[p3.P + L + "Leg"].matrix_basis.copy() for L, _ in LADOS}

    def pose(t):
        """t=0 joelho a 90° (canela em pé), t=1 joelho quase esticado."""
        g = -(JOELHO0 - p3.lerp(JOELHO0, JOELHO1, t))            # extensão = giro negativo no +X
        for lado, _ in LADOS:
            PB[p3.P + lado + "Leg"].matrix_basis = base_pernas[lado].copy()
        p3.atualizar()
        for lado, _ in LADOS:              # cada canela no eixo de dobra do seu joelho (3° do X: a coxa abre um pouco)
            p3.girar_osso(rig, lado + "Leg", Matrix.Rotation(math.radians(g), 3, eixo_joelho[lado]))
        cad.girar(g)                       # a alavanca e o rolo, o mesmo ângulo em volta do eixo da máquina (o X, nos 2 joelhos)

    def info():
        jj = ck.posicoes(rig)
        juntas = ck.medir_juntas(rig)
        E = cad.raizes["alavanca"].matrix_world
        c0, ux = E.to_translation(), (E.to_3x3() @ Vector((1, 0, 0))).normalized()
        eixo_mm = []
        for L, _ in LADOS:
            v = p3.cabeca(rig, L + "Leg") - c0
            eixo_mm.append((v - ux * v.dot(ux)).length * 1000)
        return ("joelho %.1f/%.1f° | joelho × eixo da máquina %.1f/%.1f mm | alavanca %.1f° | quadril %.0f/%.0f° | "
                "tronco %.1f° | coxa %s° | tornozelo %s° | cotovelo %.0f/%.0f° | %s" % (
                    juntas["joelhoE"], juntas["joelhoD"], *eixo_mm, cad.angulo, juntas["quadrilE"], juntas["quadrilD"],
                    math.degrees(math.atan2(math.hypot(*(jj["Neck"][:2] - jj["Hips"][:2])), jj["Neck"][2] - jj["Hips"][2])),
                    "/".join("%.1f" % v for v in ck.angulo_chave(rig, {"medida": "inclinacao", "segmento": ["UpLeg", "Leg"]})),
                    "/".join("%.0f" % v for v in tc.tornozelo(jj)), juntas["cotoveloE"], juntas["cotoveloD"], maos.info()))

    for t in (0.0, 0.5, 1.0):
        pose(t)
        print("t=%.2f | %s" % (t, info()), flush=True)
    pose(0.0)

    pegs = [(L, ck.Barra(cad.pegadores[s], RAIO, COMP_PEGADOR / 2, eixo=(0, 0, 1))) for L, s in LADOS]
    return Cena(pose, cad.equipamentos, pegadas=pegs, apoio_mm=0.0, foco_luz=(0, ye + 0.1, 0.75),
                camera_video=((3.3, ye - 2.4, 1.35), (0, ye + 0.15, 0.72), 50), info=info, apoios=cad.apoios,
                afunda_apoio_mm=20)
