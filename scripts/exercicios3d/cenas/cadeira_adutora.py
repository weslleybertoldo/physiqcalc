# Cadeira Adutora — cena da fábrica 3D (lote 4, 06/10/2026). Máquina: equip3d.cadeira_quadril no modo adutora (almofada="dentro"),
# a MESMA peça da Cadeira Abdutora — as almofadas giram pro lado de dentro das pernas (Titan Selectorized Hip Abductor Adductor:
# "Swiveling thigh pads keep transitions between moves simple—position the pads between your legs and push inward to engage the
# inner thighs, or position outside your legs and push outward to target the outer thighs and glute medius.").
# t = 0 pernas abertas ~40° cada uma (as almofadas encostadas por DENTRO dos joelhos) · t = 1 pernas fechadas até as 2 almofadas
# quase se encontrarem no meio (FOLGA_ALM uma da outra). Técnica (ExRx, Lever Seated Hip Adduction): "Sit in machine with legs
# outside of vertical center pads. If available, place heels on foot bars. Disengage and pull lever brace to position legs apart
# until slight stretch is felt. Engage lever into locked position. Lie back and grasp bars to sides." / "Move legs together. Return
# and repeat." Fabricante (eGym M11 Adductor): "Sit with your glutes against the backrest." / "Place your feet on the footrests and
# position your inner thighs or knees against the pads." / "Hold the side handles for stability." / "Start with your legs open until
# a comfortable stretch is felt in your inner thighs." / "Press the knee pads inward against the resistance until your legs are
# close together. Keep your upper body stable throughout the movement." / "Return to the starting position in a controlled motion."
# Estudo de EMG na cadeira adutora (Brandt et al. 2013): "The participant was seated in upright position in an adductor machine,
# with an 80° hip flexion and the legs placed in bilateral hip abduction of 45°." / "The participant was instructed to use the
# handles on the machine for balance and performance optimization. The participant started adducting the hip to a 0° hip joint
# angle, and then eccentrically abducted the hips to the stating position (45° hip joint angle)."
# Como o rig faz: sentado igual à Cadeira Abdutora (o corpo inclina pra trás em volta do quadril até o glúteo e a parte de cima das
# costas encostarem juntos num encosto quase em pé, 5° atrás da vertical; coxas deitadas, canelas em pé — joelho a 90° — e os pés
# chapados nos apoios, com a ponta pra onde a coxa aponta; o corpo desce até a pele afundar 2 mm no assento), mas a BASE das pernas
# é o COMEÇO da adução: as coxas abertas ABRE0 graus. A máquina é montada EM VOLTA do corpo: o eixo de cada braço é a vertical que
# passa pela articulação do quadril do mesmo lado, a almofada encosta por DENTRO do joelho (o suporte em U sai do poste, do lado de
# fora da perna, passa na frente do joelho e entra na ponta da frente da almofada: nada fica atrás dela, entre as pernas), o apoio
# do pé fica embaixo da sola e os pegadores do lado do assento, um pouco atrás do quadril. O FIM do movimento sai da peça: as pernas
# fecham até as 2 almofadas (espuma + chapa de trás, entre os joelhos) ficarem a FOLGA_ALM uma da outra. No movimento só o quadril
# mexe: cada perna inteira (coxa, canela e pé, o joelho parado a 90°) gira em volta da vertical do seu quadril e o braço da máquina
# gira o MESMO ângulo em volta do mesmo eixo — almofada e apoio do pé ficam encostados o tempo todo; pelve, tronco, cabeça, braços e
# mãos não mexem.
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
ASSENTO = 0.54            # topo do assento (= Cadeira Abdutora, a mesma máquina: com o joelho a 90° e o pé no apoio, o apoio fica
                          # ~10 cm acima do chão)
ESP_ASSENTO = 0.05        # estofado de 5 cm (= Cadeira Abdutora)
LARGURA, PROF = 0.356, 0.33   # assento de 14" × 13" (Titan Selectorized Hip Abductor Adductor: "Seat Pad Dimensions: 13-in. x
                              # 14-in.")
ENCOSTO = 5.0             # encosto 5° atrás da vertical: "seated in upright position" (Brandt et al. 2013); "Lie back" (ExRx)
ALT_ENCOSTO, LARG_ENCOSTO, ESP_ENCOSTO = 0.445, 0.305, 0.06   # 17,5" × 12" (Titan: "Back Pad Dimensions: 12-in. x 17.5-in.")
AFUNDA = 0.002            # pele afundando no estofado do assento
AFUNDA_ENC = 0.006        # glúteo e costas afundando no encosto ("Sit with your glutes against the backrest", eGym M11)
ABRE0 = 40.0              # abertura de cada coxa no começo: "position legs apart until slight stretch is felt" (ExRx); "Start with
                          # your legs open until a comfortable stretch is felt in your inner thighs" (eGym M11); Brandt et al. 2013
                          # começavam a 45°; 40° = o fim da Cadeira Abdutora (a mesma máquina, o mesmo corpo)
FOLGA_ALM = 0.010         # no fim as 2 almofadas ficam a 1 cm uma da outra ("até as almofadas quase se encontrarem", pedido;
                          # "until your legs are close together", eGym M11; "Move legs together", ExRx)
ALMOFADA = (0.14, 0.14, 0.06)  # almofada do joelho: 14 cm ao longo da coxa × 14 cm de altura × 6 cm de espuma (a altura e a espuma
                               # da Cadeira Abdutora; escolha da fábrica). Mais curta que a de fora da abdutora (20 cm): por dentro a
                               # coxa musculosa alarga logo acima do joelho (o vasto medial passa de ~5 cm do centro do joelho, na
                               # linha dele, pra ~10 cm, 10 cm acima) e a almofada reta encosta só nesse volume — com 20 cm ela ia até
                               # ele e as 2 almofadas se encontravam com as coxas ainda a 11–15°; com 14 cm, no joelho, a ~8°
ALM_ATRAS = 0.0           # a almofada fica no joelho, centrada no centro dele ("position your inner thighs or knees against the
                          # pads", eGym M11)
AFUNDA_ALM = 0.002        # a espuma da almofada afunda na pele
VOLTA_FRENTE = 0.13       # o suporte em U cruza 13 cm à frente do centro da almofada (do joelho): ~5 cm na frente da patela
FOLGA_POSTE = 0.045       # o eixo do poste fica 4,5 cm pra fora do ponto mais de fora da perna (o poste tem 5 cm: 2 cm de folga)
PE = (0.30, 0.13, 0.02)   # apoio do pé: 30 × 13 cm, chapa de 2 cm com borracha (= Cadeira Abdutora)
AFUNDA_PE = 0.0015        # a sola afunda na borracha do apoio
RAIO = 0.0145             # pegador de 29 mm (o cilindro da mão de referência; = Cadeira Abdutora)
COMP_PEGADOR = 0.14
X_PEG = 0.30              # pegadores 12 cm pra fora da borda do assento
PEG_TRAS = 0.06           # pegador 6 cm atrás da articulação do quadril (do lado do glúteo): as coxas abertas não chegam nele
COTOVELO = 20.0           # braços quase esticados, segurando os pegadores ("grasp bars to sides", ExRx; "Hold the side handles for
                          # stability", eGym M11): a altura do pegador sai daí (o cotovelo dobra ~20° com a mão nele)


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
    # backrest", eGym M11; "Lie back", ExRx)
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

    # ── almofada por DENTRO do joelho, apoio do pé embaixo da sola e o poste do braço do lado de fora da perna ─────────────────
    almofadas, pes, postes, pe_meio = {}, {}, {}, {}
    comp_a, alt_a, esp_a = ALMOFADA
    for lado, s in LADOS:
        u = coxa_dir(s, ABRE0)
        fora = s * cima.cross(u)                                   # de lado, pra fora da perna
        Kl = K[lado]
        P = pele((lado + "UpLeg", lado + "Leg")) - np.array(Kl)
        al, lat, z = P @ np.array(u), P @ np.array(fora), P[:, 2]
        m = (al > -ALM_ATRAS - comp_a / 2) & (al < -ALM_ATRAS + comp_a / 2) & (np.abs(z) < alt_a / 2)
        L_min = float(lat[m].min())                                # o ponto mais de dentro da perna onde a almofada encosta
        face = Kl - u * ALM_ATRAS + fora * (L_min + AFUNDA_ALM)
        almofadas[s] = (face, u, fora, ALMOFADA)                   # a face encosta por dentro: a normal aponta pra fora (pra perna)
        # poste: do apoio do pé até a almofada, pra fora do ponto mais de fora da perna (coxa, canela e pé) na faixa dele
        Pt = pele((lado + "UpLeg", lado + "Leg", lado + "Foot", lado + "ToeBase")) - np.array(Kl)
        mt = np.abs(Pt @ np.array(u) + ALM_ATRAS) < 0.06
        L_max = float((Pt @ np.array(fora))[mt].max())
        Q = Kl - u * ALM_ATRAS + fora * (L_max + FOLGA_POSTE)
        postes[s] = (Q.x, Q.y)
        S = pele((lado + "Foot", lado + "ToeBase"))
        z_sola = float(S[:, 2].min())
        A = np.array(p3.cabeca(rig, lado + "Foot"))
        sa, sl = (S - A) @ np.array(u), (S - A) @ np.array(fora)
        c_pe = Vector(A) + u * float((sa.min() + sa.max()) / 2) + fora * float((sl.min() + sl.max()) / 2)
        c_pe.z = z_sola + AFUNDA_PE
        pes[s] = (c_pe, u, PE)
        pe_meio[lado] = (p3.cabeca(rig, lado + "Foot") + p3.cabeca(rig, lado + "ToeBase")) / 2
        print("PERNA %s | lado de dentro do joelho %.1f mm do centro dele | lado de fora da perna %.1f mm | almofada face (%.4f %.4f "
              "%.4f) | poste (%.3f %.3f) | sola z %.4f | meio do pé z %.4f | pé %.0f mm de comprimento, %.0f de largura" % (
                  lado, -L_min * 1000, L_max * 1000, *face, Q.x, Q.y, z_sola, pe_meio[lado].z, (sa.max() - sa.min()) * 1000,
                  (sl.max() - sl.min()) * 1000), flush=True)

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

    # ── a máquina em volta do corpo (modo adutora: almofada por dentro, presa pelo suporte em U) ───────────────────────────────
    eixos = {s: (H[L].x, H[L].y) for L, s in LADOS}
    cad = e3.cadeira_quadril("adutora", eixos=eixos, assento=(y_frente, y_tras, ASSENTO, LARGURA, ESP_ASSENTO),
                             encosto=(y_base, ENCOSTO, ALT_ENCOSTO, LARG_ENCOSTO, ESP_ENCOSTO), almofadas=almofadas, pes=pes,
                             postes=postes, pegadores=(y_p, z_p, X_PEG, COMP_PEGADOR, RAIO), almofada="dentro",
                             volta_frente=VOLTA_FRENTE, poste_alinhado=True)   # o poste vira junto com a coxa aberta
    print("MÁQUINA | eixos E (%.4f %.4f) D (%.4f %.4f) z %.3f | assento y %.3f → %.3f" % (
        *eixos[1], *eixos[-1], cad.eixos[1].z, y_frente, y_tras), flush=True)

    # ── fim do movimento: as pernas fecham até as 2 almofadas (com o suporte em U) ficarem a FOLGA_ALM uma da outra ─────────────
    def pecas_entre_pernas(lado):
        return [ob for ob in ck._malhas(cad.raizes["almofada_" + lado]) + ck._malhas(cad.raizes["braco_" + lado])
                if "_almofada" in ob.name]                 # espuma, chapa e o suporte em U ("_suporte_almofada…")

    def folga_almofadas():
        """Menor distância (m) entre as peças entre as pernas dos 2 lados, agora; − = uma entrou na outra."""
        A = [ck._avaliar_simples(o) for o in pecas_entre_pernas("esq")]
        B = [ck._avaliar_simples(o) for o in pecas_entre_pernas("dir")]
        menor = 1e9
        for X, Y in ((A, B), (B, A)):
            for co, tri in X:
                pts = ck._amostras(co, tri, 0.01)
                for co2, tri2 in Y:
                    bvh = ck._bvh(co2, tri2)
                    if bvh.overlap(ck._bvh(co, tri)):
                        return -1.0
                    for p in pts:
                        loc, nor, idx, dist = bvh.find_nearest(Vector(p))
                        if loc is not None:
                            menor = min(menor, dist)
        return menor

    lo, hi = -ABRE0, 0.0                                 # giro do braço (< 0 fecha): lo = coxas paralelas
    for _ in range(14):
        meio = (lo + hi) / 2
        cad.girar(meio)
        if folga_almofadas() < FOLGA_ALM:
            lo = meio                                    # já passou: fecha menos
        else:
            hi = meio
    fecha = hi
    cad.girar(fecha)
    abre1 = ABRE0 + fecha
    print("FIM | as pernas fecham %.2f° (de %.1f° pra %.2f° cada coxa) | almofadas a %.1f mm uma da outra" % (
        -fecha, ABRE0, abre1, folga_almofadas() * 1000), flush=True)
    cad.girar(0.0)

    base_coxa = {L: PB[p3.P + L + "UpLeg"].matrix_basis.copy() for L, _ in LADOS}

    def pose(t):
        """t=0 pernas abertas (coxas abertas ABRE0), t=1 fechadas até as almofadas quase se encontrarem (cada perna gira em volta
        da vertical do quadril)."""
        g = p3.lerp(0.0, fecha, t)
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
        return ("coxa aberta %s° | almofadas a %.1f mm | quadril × eixo do braço %.1f/%.1f mm | braços %.1f° | joelho %.0f/%.0f° | "
                "quadril %.0f/%.0f° | tronco %.1f° | coxa × horizontal %s° | tornozelo %s° | cotovelo %.0f/%.0f° | %s" % (
                    "/".join("%.1f" % v for v in tc.coxa_abertura(jj)), folga_almofadas() * 1000, *eixo_mm, cad.angulo,
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
