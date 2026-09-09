# -*- coding: utf-8 -*-
"""Cenas v3 (08/09/2026) — refeitas após a validação GIF a GIF (posição dos pesos, máquina e movimento).
Sobrescreve entradas de SCENES definidas em catalogo3d.py (mesmo dict). Convenções em rig3d_lib.py:
   elev: 0 = membro ao longo de -U (pendurado), 90 = horizontal, 180 = acima da cabeça
   az:   0 = para a frente (Fw), 90 = para o lado do próprio membro, 180 = para trás
   pernas usam o referencial da PELVE (U0/Fw0); braços usam o do TRONCO (U/Fw após pitch)
"""
import math
from rig3d_lib import (FLOOR, MACH, MACH_D, MACH_L, MUTED, ACCENT, PAD, PAD_T, BENCH, BENCH_T,
                       addv, sub, mul, norm, cross, lerp, tower, bench, seat, incline_pad, lever, handle,
                       barbell, dumbbell, cable, pad_bar, frame_posts)
from catalogo3d import SCENES, cena, STAND, SEAT, SUPINE, PRONE, BENT, LR, lerpv3, barbar, eq_mat, eq_treadmill

# ── helpers ───────────────────────────────────────────────────────────────────
def stack_top(k, x, z, lift=26):
    return (x, FLOOR + 4 + 8 * 6.5 + lift * k, z + 20)

def pulley(sc, p, r=3.4):
    sc.sphere(p, r, MACH_L, outline=(40, 40, 40), depth_bias=-0.2)

def tower_low(sc, k, x, z, h, to, lift=26):
    """torre com polia BAIXA: cabo pilha→topo→desce a coluna→polia na base→`to` (lista de pontos)."""
    tower(sc, k, x=x, z=z, h=h, lift=lift)
    base = (x, FLOOR + 7, z)
    cable(sc, [stack_top(k, x, z, lift), (x, h, z + 20), (x, h, z), base])
    pulley(sc, base)
    cable(sc, [base] + list(to))

def tower_high(sc, k, x, z, h, to, y=None, lift=26):
    """torre com polia ALTA em (x, y|h, z): cabo pilha→topo→polia→`to`."""
    tower(sc, k, x=x, z=z, h=h, lift=lift)
    y = h if y is None else y
    pul = (x, y, z)
    cable(sc, [stack_top(k, x, z, lift), (x, h, z + 20), (x, h, z), pul])
    pulley(sc, pul)
    cable(sc, [pul] + list(to))

def rope(sc, b, mid=None):
    """corda: duas pontas amarelas do ponto `mid` até cada mão."""
    m = mid or addv(lerpv3(b.hand[-1], b.hand[1], 0.5), (0, 4, -4))
    for s in (-1, 1):
        sc.capsule(m, b.hand[s], 2.4, ACCENT, outline=None, depth_bias=-0.4)

def dumbbell_grip(sc, b, s, r=6.5):
    """halter perpendicular ao antebraço no plano sagital (gira junto com o antebraço — pegada neutra)."""
    d = norm(sub(b.hand[s], b.elbow[s]))
    axis = norm(cross(d, b.R))
    dumbbell(sc, b.hand[s], axis=axis, r=r)

def bench_along(sc, b, off=-11, half_len=48, w=17, t=4.5, post=True):
    """banco/encosto alinhado ao TRONCO (segue o pitch): centro em P + U*28 + Fw*off."""
    c = addv(b.P, mul(b.U, 28), mul(b.Fw, off))
    incline_pad(sc, c, b.U, w=w, h=half_len, t=t)
    if post:
        for e in (-1, 1):
            p = addv(c, mul(b.U, e * (half_len - 10)))
            sc.box(p[0] - 4, p[0] + 4, FLOOR, p[1] - t, p[2] - 4, p[2] + 4, MACH, top=MACH_L)

def hand_bar(sc, b, extra=8):
    barbar(sc, b)

def side_handles(sc, b):
    for s in (-1, 1):
        handle(sc, b.hand[s], axis=(0, 0, 1), length=14)

def post(sc, p, y0=FLOOR, r=3):
    sc.box(p[0] - r, p[0] + r, y0, p[1], p[2] - r, p[2] + r, MACH, top=MACH_L)

def beam(sc, a, b_, w=5):
    sc.line3([a, b_], MACH, w, depth_bias=0.2)

# ═════════════════════════════════════════════════════════════════════════════
# PEITORAL
def eq_bench_press_machine(sc, b, k):
    bench(sc, cz=-22, length=100)
    tower(sc, k, x=-100, z=-96, h=72)
    cable(sc, [stack_top(k, -100, -96), (-100, 72, -76), (-100, 72, -96), (0, 68, -96)])
    sc.box(-44, 44, 64, 70, -100, -92, MACH, top=MACH_L)
    for s in (-1, 1):
        post(sc, (s * 42, 66, -96))
        lever(sc, (s * 42, 64, -94), addv(b.hand[s], (0, 0, 1)))
        handle(sc, b.hand[s], axis=(1, 0, 0))

cena("Supino Reto na Máquina Deitado", "supino", ["peitoral", "triceps", "deltoide_ant"],
     SUPINE(arm=LR(60, 110, 90, -35)), SUPINE(arm=LR(84, 6, 84, 6)), eq_bench_press_machine)

def eq_chest_press(sc, b, k):
    seat(sc, back_angle=95)
    tower(sc, k, x=-100, z=-34, h=100)
    cable(sc, [stack_top(k, -100, -34), (-100, 100, -14), (-100, 100, -34), (0, 92, -30)])
    frame_posts(sc, xs=(-36, 36), z=-30, h=92)
    for s in (-1, 1):
        lever(sc, (s * 36, 88, -30), addv(b.hand[s], (0, 0, 1)))
        handle(sc, b.hand[s], axis=(0, 1, 0), length=16)

cena("Supino Reto na Máquina Sentado", "frente34", ["peitoral", "triceps"],
     SEAT(arm=LR(62, 104, 85, 18)), SEAT(arm=LR(76, 14, 78, 8)), eq_chest_press)

def eq_decline_machine(sc, b, k):
    bench_along(sc, b, off=-11, half_len=46)
    # rolo p/ travar as pernas (na ponta alta, junto aos joelhos) + torre/alavancas na cabeceira
    pad_bar(sc, addv(lerpv3(b.ankle[-1], b.ankle[1], 0.5), (0, 8, -4)), axis=(1, 0, 0), length=40, r=4.5)
    tower(sc, k, x=-100, z=-100, h=46, lift=18)
    cable(sc, [stack_top(k, -100, -100, 18), (-100, 46, -80), (-100, 46, -100), (0, 40, -100)])
    sc.box(-44, 44, 36, 42, -104, -96, MACH, top=MACH_L)
    for s in (-1, 1):
        post(sc, (s * 42, 38, -100))
        lever(sc, (s * 42, 36, -98), addv(b.hand[s], (0, 0, 1)))
        handle(sc, b.hand[s], axis=(1, 0, 0))

cena("Supino Declinado na Máquina", "supino", ["peitoral", "triceps"],
     SUPINE(P=(0, 16, 0), pitch=-18, arm=LR(60, 110, 90, -35), leg=dict(elev=45, az=0, elev2=100, az2=180, foot_dir=(0, -0.4, 1))),
     SUPINE(P=(0, 16, 0), pitch=-18, arm=LR(84, 6, 84, 6), leg=dict(elev=45, az=0, elev2=100, az2=180, foot_dir=(0, -0.4, 1))),
     eq_decline_machine)

INC_LEG = dict(elev=20, az=180, elev2=90, az2=180, foot_dir=(0, -0.2, 1))
cena("Supino Inclinado", "supino", ["peitoral", "deltoide_ant"],
     SUPINE(P=(0, 6, 0), pitch=35, arm=LR(48, 112, 92, -35), leg=INC_LEG), SUPINE(P=(0, 6, 0), pitch=35, arm=LR(80, 8, 84, 8), leg=INC_LEG),
     lambda sc, b, k: (seat(sc, y=-2, back_angle=125, cz=-4), barbell(sc, b.hand[-1], b.hand[1], plate_r=10)))
cena("Supino Reto com Halteres", "supino", ["peitoral", "triceps"],
     SUPINE(arm=LR(60, 110, 90, -35)), SUPINE(arm=LR(86, 8, 86, 6)),
     lambda sc, b, k: (bench(sc, cz=-22, length=100), [dumbbell(sc, b.hand[s]) for s in (-1, 1)]))
cena("Supino Reto com Barra", "supino", ["peitoral", "triceps"],
     SUPINE(arm=LR(60, 110, 90, -35)), SUPINE(arm=LR(86, 8, 86, 8)),
     lambda sc, b, k: (bench(sc, cz=-22, length=100), barbell(sc, b.hand[-1], b.hand[1], plate_r=12)))
cena("Crucifixo com Halteres", "supino", ["peitoral"],
     SUPINE(arm=LR(72, 100, 80, 80)), SUPINE(arm=LR(88, 12, 88, 8)),
     lambda sc, b, k: (bench(sc, cz=-22, length=100), [dumbbell(sc, b.hand[s], axis=(0, 0, 1)) for s in (-1, 1)]))

def eq_peck_deck(sc, b, k):
    seat(sc, back_angle=92)
    tower(sc, k, x=-100, z=-40, h=106)
    cable(sc, [stack_top(k, -100, -40), (-100, 106, -20), (-100, 106, -40), (0, 102, -12)])
    frame_posts(sc, xs=(-50, 50), z=-12, h=102)
    for s in (-1, 1):
        lever(sc, (s * 34, 100, -12), addv(b.hand[s], (0, 2, 0)))
        handle(sc, b.hand[s], axis=(0, 1, 0), length=16)

cena("Crucifixo na Máquina", "frente34", ["peitoral"],
     SEAT(arm=LR(88, 100, 88, 60)), SEAT(arm=LR(88, 14, 88, 8)), eq_peck_deck)

def eq_crossover(sc, b, k):
    for s in (-1, 1):
        tower_high(sc, k, x=s * 100, z=-70, h=124, to=[b.hand[s]])
        handle(sc, b.hand[s], axis=(0, 1, 0), length=14)

cena("Cross-over na Polia", "frente34", ["peitoral"],
     STAND(pitch=15, arm=LR(120, 95, 110, 70)), STAND(pitch=15, arm=LR(60, 10, 55, 5)), eq_crossover)

PUSH_LEG = dict(elev=16, az=0, elev2=16, az2=0, foot_dir=(0, -1, 0.35))
cena("Flexão de Braço", "lado_frente", ["peitoral", "triceps"],
     dict(stance="prone", P=(0, -6, 0), pitch=-14, arm=LR(90, 4, 90, 4), leg=PUSH_LEG),
     dict(stance="prone", P=(0, -26, 0), pitch=-14, arm=LR(88, 68, 90, 2), leg=PUSH_LEG),
     eq_mat, contract="B")

# ═════════════════════════════════════════════════════════════════════════════
# COSTAS
def eq_cable_row(sc, b, k):
    bench(sc, cz=-8, length=60, y=-6, post=False)
    sc.box(-16, 16, FLOOR, -14, -36, 24, MACH_D)
    sc.box(-18, 18, FLOOR, 14, 66, 72, MACH, top=MACH_L)       # apoio de pés
    mid = lerpv3(b.hand[-1], b.hand[1], 0.5)
    tower(sc, k, x=0, z=106, h=96)
    cable(sc, [stack_top(k, 0, 106), (0, 96, 126), (0, 96, 106), (0, -24, 106)])
    pulley(sc, (0, -24, 106))
    cable(sc, [(0, -24, 106), mid])
    handle(sc, mid, axis=(1, 0, 0), length=24)

ROW_LEG = dict(elev=65, az=8, elev2=45, az2=8, foot_dir=(0, 1, 0.25))
cena("Remada na Polia Sentado", "costas34", ["dorsal", "romboides"],
     dict(stance="seat", P=(0, -2, -10), pitch=14, arm=LR(86, 2, 86, 2), leg=ROW_LEG),
     dict(stance="seat", P=(0, -2, -10), pitch=0, arm=LR(25, 178, 88, 2), leg=ROW_LEG), eq_cable_row)

def eq_tbar(sc, b, k):
    # apoio de peito alinhado ao tronco (à frente), plataforma dos pés, barra T pivotando no chão à frente
    c = addv(b.P, mul(b.U, 44), mul(b.Fw, 13))
    incline_pad(sc, c, b.U, w=15, h=22, t=4)
    post(sc, addv(c, mul(b.Fw, 2)), r=4)
    a = lerpv3(b.ankle[-1], b.ankle[1], 0.5)
    sc.box(-28, 28, FLOOR, FLOOR + 4, a[2] - 16, a[2] + 20, MACH, top=MACH_L)
    pivot = (0, FLOOR + 4, 92)
    mid = lerpv3(b.hand[-1], b.hand[1], 0.5)
    lever(sc, pivot, mid, width=6)
    axis = norm(sub(mid, pivot))
    for d in (8, 15):
        sc.sphere(addv(mid, mul(axis, -d)), 11 if d == 8 else 10, MACH_D, depth_bias=-0.4)
    handle(sc, mid, axis=(1, 0, 0), length=34)

cena("Remada Cavalinho na Máquina", "lado_costas", ["dorsal", "trapezio_medio"],
     dict(stance="stand", P=(0, 34, -10), pitch=48, head_pitch=-20, arm=LR(58, 0, 58, 0), leg=dict(elev=-12, az=6, elev2=8, az2=6)),
     dict(stance="stand", P=(0, 34, -10), pitch=48, head_pitch=-20, arm=LR(18, 165, 70, 15), leg=dict(elev=-12, az=6, elev2=8, az2=6)), eq_tbar)

def eq_high_row(sc, b, k):
    seat(sc)
    incline_pad(sc, (0, 40, 26), (0, 1, 0), w=15, h=18, t=3.5)   # apoio de PEITO à frente
    post(sc, (0, 22, 26), r=3)
    tower(sc, k, x=-100, z=64, h=116)
    cable(sc, [stack_top(k, -100, 64), (-100, 116, 84), (-100, 116, 64), (0, 112, 60)])
    frame_posts(sc, xs=(-46, 46), z=60, h=112)
    for s in (-1, 1):
        lever(sc, (s * 22, 110, 60), addv(b.hand[s], (0, 0, 2)))
        handle(sc, b.hand[s], axis=(0, 1, 0), length=14)

cena("High Row", "costas34", ["dorsal", "trapezio_medio"],
     SEAT(arm=LR(140, 10, 140, 10)), SEAT(arm=LR(40, 170, 90, 30)), eq_high_row)

cena("Remada Curvada com Barra", "lado_costas", ["dorsal", "romboides", "trapezio_medio"],
     BENT(pitch=50, arm=LR(52, 0, 52, 0)), BENT(pitch=50, arm=LR(20, 180, 90, 0)),
     lambda sc, b, k: barbell(sc, b.hand[-1], b.hand[1], plate_r=13))

def eq_bench_row(sc, b, k):
    bench(sc, cx=34, cz=8, length=90, y=-2)
    dumbbell(sc, b.hand[-1], axis=(1, 0, 0))

ARM_SUPPORT_R = dict(elev=0, az=0, hand=(34, 3, 24), bend=(0, -1, 0.4))
cena("Remada Unilateral com Halter", "lado_costas", ["dorsal", "romboides"],
     BENT(pitch=65, arm_L=LR(65, 0, 65, 0), arm_R=ARM_SUPPORT_R), BENT(pitch=65, arm_L=LR(20, 180, 90, 0), arm_R=ARM_SUPPORT_R),
     eq_bench_row, arrow="hand_L")

def eq_straight_pulldown(sc, b, k):
    tower_high(sc, k, x=0, z=104, h=134, to=[lerpv3(b.hand[-1], b.hand[1], 0.5)])
    barbar(sc, b)

cena("Pulldown com Braços Estendidos", "lado_costas", ["dorsal"],
     STAND(pitch=15, arm=LR(128, 10)), STAND(pitch=15, arm=LR(22, 10)), eq_straight_pulldown, contract="B")

def eq_roman(sc, b, k):
    # cadeira romana 45°: pad sob as coxas/quadril, rolos nos tornozelos, plataforma dos pés
    incline_pad(sc, (0, 2, -8), norm((0, 0.72, -0.7)), w=16, h=20, t=5)
    post(sc, (0, -6, -2), r=4)
    a = lerpv3(b.ankle[-1], b.ankle[1], 0.5)
    pad_bar(sc, addv(a, (0, 9, -5)), axis=(1, 0, 0), length=40, r=4.5)
    sc.box(-20, 20, FLOOR, FLOOR + 5, a[2] - 14, a[2] + 12, MACH, top=MACH_L)
    for x in (-18, 18):
        sc.line3([(x, FLOOR + 5, a[2] - 2), (x, -2, -6)], MACH, 4, depth_bias=0.3)

ROMAN_LEG = dict(elev=45, az=180, elev2=45, az2=180, foot_dir=(0, -0.6, -0.8))
cena("Hiperextensão Lombar", "lado_costas", ["lombar", "gluteo"],
     dict(stance="stand", P=(0, 14, 0), pitch=105, head_pitch=-25, arm=LR(85, 10, 60, -110), leg=ROMAN_LEG),
     dict(stance="stand", P=(0, 14, 0), pitch=45, head_pitch=-20, arm=LR(85, 10, 60, -110), leg=ROMAN_LEG),
     eq_roman, contract="B", arrow="head")

cena("Levantamento Terra", "lado_frente", ["posterior", "gluteo", "lombar", "quadriceps"],
     dict(stance="stand", P=(0, 5, -28), pitch=70, head_pitch=-35, arm=LR(70, 0, 70, 0), leg=dict(elev=70, az=8, elev2=6, az2=8)),
     STAND(arm=LR(4, 0)), lambda sc, b, k: barbell(sc, b.hand[-1], b.hand[1], plate_r=14, extra=24), contract="B")

cena("Encolhimento com Halteres", "costas34", ["trapezio_sup"],
     STAND(arm=LR(6, 30), shrug=0), STAND(arm=LR(6, 30), shrug=14),
     lambda sc, b, k: [dumbbell(sc, b.hand[s], axis=(0, 0, 1)) for s in (-1, 1)])

# ═════════════════════════════════════════════════════════════════════════════
# OMBRO
def eq_shoulder_press(sc, b, k):
    seat(sc, back_angle=92)
    tower(sc, k, x=-100, z=-60, h=110)
    cable(sc, [stack_top(k, -100, -60), (-100, 110, -40), (-100, 110, -60), (0, 40, -75)])
    sc.box(-40, 40, 36, 44, -79, -71, MACH, top=MACH_L)
    for s in (-1, 1):
        post(sc, (s * 36, 40, -75))
        lever(sc, (s * 36, 40, -75), b.hand[s], width=5)
        handle(sc, b.hand[s], axis=(0, 0, 1), length=14)

def PRESS_ARMS(y, z):
    return dict(arm_L=dict(elev=0, az=0, hand=(-30, y, z), bend=(-0.7, -1, 0)), arm_R=dict(elev=0, az=0, hand=(30, y, z), bend=(0.7, -1, 0)))

cena("Desenvolvimento na Máquina", "frente34", ["deltoide_ant", "deltoide_lat", "triceps"],
     SEAT(**PRESS_ARMS(56, 14)), SEAT(**PRESS_ARMS(104, -4)), eq_shoulder_press, fit_top=86)

def eq_front_raise_cable(sc, b, k):
    mid = lerpv3(b.hand[-1], b.hand[1], 0.5)
    tower(sc, k, x=0, z=-84, h=100)
    cable(sc, [stack_top(k, 0, -84), (0, 100, -64), (0, 100, -84), (0, FLOOR + 7, -84)])
    pulley(sc, (0, FLOOR + 7, -84))
    knee_mid = addv(lerpv3(b.knee[-1], b.knee[1], 0.5), (0, 6, -2))
    sc.line3([(0, FLOOR + 7, -84), knee_mid], MUTED, 1.5, depth_bias=30)     # trecho atrás (entre as pernas)
    cable(sc, [knee_mid, mid])
    barbar(sc, b)

cena("Elevação Frontal na Polia", "lado_frente", ["deltoide_ant"],
     STAND(arm=LR(14, -12)), STAND(arm=LR(95, -12)), eq_front_raise_cable)

def eq_lat_raise_cable(sc, b, k):
    tower_low(sc, k, x=-100, z=-16, h=104, to=[b.hand[1]])
    handle(sc, b.hand[1], axis=(1, 0, 0), length=14)

cena("Elevação Lateral na Polia", "frente34", ["deltoide_lat"],
     STAND(arm_R=LR(26, -46, 30, -50), arm_L=LR(24, 90, 96, 190)), STAND(arm_R=LR(92, 82, 92, 82), arm_L=LR(24, 90, 96, 190)), eq_lat_raise_cable)

def eq_lat_raise_machine(sc, b, k):
    seat(sc, back_angle=92)
    tower(sc, k, x=-100, z=-46, h=110)
    cable(sc, [stack_top(k, -100, -46), (-100, 110, -26), (-100, 110, -46), (0, 108, -40)])
    sc.box(-40, 40, 104, 110, -44, -36, MACH, top=MACH_L)          # viga atrás da cabeça
    for s in (-1, 1):
        post(sc, (s * 40, 106, -40))
        piv = (s * 24, 50, -12)                                      # eixo do braço da máquina (atrás do ombro)
        beam(sc, (s * 40, 106, -40), piv, w=4)
        u = norm(sub(b.elbow[s], b.sh[s]))
        pad_c = addv(lerpv3(b.sh[s], b.elbow[s], 0.72), (s * 8.5, 0, 0))   # bloco na face EXTERNA do braço, perto do cotovelo
        lever(sc, piv, pad_c, width=5)
        sc.obox(pad_c, (1, 0, 0), u, norm(cross((1, 0, 0), u)), 3.5, 9, 6.5, (72, 72, 76), top=(90, 90, 94))
        handle(sc, addv(b.hand[s], (0, 0, 2)), axis=(0, 1, 0), length=14)  # manopla vertical à frente da mão

cena("Elevação Lateral na Máquina", "frente34", ["deltoide_lat"],
     SEAT(arm=LR(14, 60, 90, 0)), SEAT(arm=LR(90, 88, 90, 0)), eq_lat_raise_machine)

cena("Crucifixo Invertido", "lado_costas", ["deltoide_post", "trapezio_medio"],
     BENT(pitch=70, arm=LR(70, 0, 70, 0)), BENT(pitch=70, arm=LR(90, 95, 90, 95)),
     lambda sc, b, k: [dumbbell(sc, b.hand[s], axis=(0, 0, 1)) for s in (-1, 1)])

cena("Desenvolvimento Arnold", "frente34", ["deltoide_ant", "deltoide_lat"],
     SEAT(arm=LR(80, 20, 160, 20)), SEAT(arm=LR(165, 60, 175, 60)),
     lambda sc, b, k: (seat(sc, back_angle=92), [dumbbell(sc, b.hand[s]) for s in (-1, 1)]), fit_top=88)
cena("Desenvolvimento com Halteres", "frente34", ["deltoide_ant", "deltoide_lat", "triceps"],
     SEAT(arm=LR(90, 80, 175, 80)), SEAT(arm=LR(165, 60, 175, 60)),
     lambda sc, b, k: (seat(sc, back_angle=92), [dumbbell(sc, b.hand[s]) for s in (-1, 1)]), fit_top=88)

def eq_face_pull(sc, b, k):
    mid = addv(lerpv3(b.hand[-1], b.hand[1], 0.5), (0, 0, 10))
    tower_high(sc, k, x=0, z=116, h=100, y=74, to=[mid])
    rope(sc, b, mid)

cena("Face Pull na Polia", "lado_frente", ["deltoide_post", "trapezio_medio"],
     STAND(arm=LR(95, 0, 95, 0)), STAND(arm=LR(95, 80, 140, 200)), eq_face_pull)

# ═════════════════════════════════════════════════════════════════════════════
# BÍCEPS
def eq_preacher(sc, b, k, machine=False):
    seat(sc)
    # pad Scott: úmeros deitados sobre a face inclinada (borda alta junto ao peito, desce para a frente)
    u = norm((0, 0.7, -0.7))
    n = norm(cross((1, 0, 0), u))
    mid = lerpv3(addv(b.sh[-1], b.elbow[-1]), addv(b.sh[1], b.elbow[1]), 0.5)
    mid = mul(mid, 0.5)
    c = addv(mid, mul(n, -10.5))
    incline_pad(sc, c, u, w=28, h=16, t=4)
    low = addv(c, mul(u, -14))
    post(sc, (0, low[1] - 2, low[2]), r=4)
    if machine:
        tower(sc, k, x=-100, z=40, h=90)
        cable(sc, [stack_top(k, -100, 40), (-100, 90, 60), (-100, 90, 40), (-34, b.elbow[1][1], b.elbow[1][2])])
        axle_l, axle_r = (-34, b.elbow[-1][1], b.elbow[-1][2]), (34, b.elbow[1][1], b.elbow[1][2])
        sc.line3([axle_l, axle_r], MACH, 3.5, depth_bias=0.8)
        for s in (-1, 1):
            piv = (s * 34, b.elbow[s][1], b.elbow[s][2])
            lever(sc, piv, b.hand[s], width=4)
            handle(sc, b.hand[s], axis=(1, 0, 0), length=14)

cena("Rosca Scott com Halteres", "frente34", ["biceps"],
     SEAT(arm=LR(45, 0, 40, 0)), SEAT(arm=LR(45, 0, 160, 0)),
     lambda sc, b, k: (eq_preacher(sc, b, k), [dumbbell(sc, b.hand[s]) for s in (-1, 1)]))
cena("Rosca Scott na máquina", "frente34", ["biceps"],
     SEAT(arm=LR(45, 0, 40, 0)), SEAT(arm=LR(45, 0, 160, 0)), lambda sc, b, k: eq_preacher(sc, b, k, machine=True))

def eq_hammer_cable(sc, b, k):
    mid = addv(lerpv3(b.hand[-1], b.hand[1], 0.5), (0, -6, 6))
    tower_low(sc, k, x=0, z=112, h=104, to=[mid])
    rope(sc, b, mid)

cena("Rosca Martelo na Polia", "frente34", ["biceps", "antebraco"],
     STAND(arm=LR(14, -30, 18, -30)), STAND(arm=LR(14, -30, 142, -30)), eq_hammer_cable)

WRIST_REST_R = dict(elev=0, az=0, hand=(14, -2, 44), bend=(0.3, -1, 0))
cena("Rosca Punho com Halter Apoiado", "lado_frente", ["antebraco"],
     SEAT(pitch=25, arm_L=dict(elev=0, az=0, hand=(-15, -12, 58), bend=(0, -1, 0.3)), arm_R=WRIST_REST_R),
     SEAT(pitch=25, arm_L=dict(elev=0, az=0, hand=(-15, 2, 52), bend=(0, -1, 0.3)), arm_R=WRIST_REST_R),
     lambda sc, b, k: (seat(sc), dumbbell(sc, b.hand[-1], axis=(1, 0, 0))), arrow="hand_L")

cena("Rosca Martelo com Halteres", "frente34", ["biceps", "antebraco"],
     STAND(arm=LR(8, 0, 8, 0)), STAND(arm=LR(15, 0, 140, 12)), lambda sc, b, k: [dumbbell_grip(sc, b, s) for s in (-1, 1)])

CONC_LEG = dict(elev=80, az=32, elev2=0, az2=32)
cena("Rosca Concentrada", "lado_frente", ["biceps"],
     SEAT(pitch=30, arm_L=LR(32, -20, 32, -20), arm_R=dict(elev=0, az=0, hand=(30, -4, 40), bend=(0.4, -1, 0)), leg=CONC_LEG),
     SEAT(pitch=30, arm_L=LR(32, -20, 150, 180), arm_R=dict(elev=0, az=0, hand=(30, -4, 40), bend=(0.4, -1, 0)), leg=CONC_LEG),
     lambda sc, b, k: (seat(sc), dumbbell(sc, b.hand[-1], axis=(1, 0, 0))), arrow="hand_L")

# ═════════════════════════════════════════════════════════════════════════════
# TRÍCEPS
def eq_overhead_cable(sc, b, k):
    tower_low(sc, k, x=0, z=-96, h=104, to=[b.hand[-1]])
    handle(sc, b.hand[-1], axis=(1, 0, 0), length=12)

cena("Tríceps Francês Unilateral na Polia Baixa", "lado_frente", ["triceps"],
     STAND(arm_L=LR(172, 10, 60, 180), arm_R=LR(24, 90, 96, 190)), STAND(arm_L=LR(172, 10, 172, 10), arm_R=LR(24, 90, 96, 190)),
     eq_overhead_cable, arrow="hand_L", fit_top=86)

def eq_pushdown(sc, b, k, rope_=False):
    mid = lerpv3(b.hand[-1], b.hand[1], 0.5)
    tower_high(sc, k, x=0, z=104, h=120, to=[addv(mid, (0, 6, 0)) if rope_ else mid])
    if rope_:
        rope(sc, b, addv(mid, (0, 6, 0)))
    else:
        barbar(sc, b)

cena("Tríceps Pulley", "lado_frente", ["triceps"],
     STAND(pitch=12, arm=LR(12, 0, 92, 0)), STAND(pitch=12, arm=LR(12, 0, 12, 0)), lambda sc, b, k: eq_pushdown(sc, b, k))
cena("Tríceps Corda na Polia", "lado_frente", ["triceps"],
     STAND(pitch=12, arm=LR(12, 0, 92, 0)), STAND(pitch=12, arm=LR(12, 0, 14, 45)), lambda sc, b, k: eq_pushdown(sc, b, k, rope_=True))

cena("Tríceps Testa", "supino_pes", ["triceps"],
     SUPINE(arm=LR(95, 0, 150, 180)), SUPINE(arm=LR(95, 0, 95, 0)),
     lambda sc, b, k: (bench(sc, cz=-22, length=100), barbell(sc, b.hand[-1], b.hand[1], plate_r=8, extra=14)))

def eq_french_db(sc, b, k):
    seat(sc)
    mid = lerpv3(b.hand[-1], b.hand[1], 0.5)
    dumbbell(sc, addv(mid, (0, 3, 0)), axis=(0, 1, 0), r=8, depth_bias=0.0)

cena("Tríceps Francês com Halter", "costas34", ["triceps"],
     SEAT(arm=LR(172, 10, 75, 225)), SEAT(arm=LR(172, 10, 176, 10)), eq_french_db, fit_top=86)

def eq_kickback(sc, b, k):
    bench(sc, cx=34, cz=8, length=90, y=-2)
    dumbbell(sc, b.hand[-1], axis=(1, 0, 0))

cena("Tríceps Coice com Halter", "lado_costas", ["triceps"],
     BENT(pitch=60, arm_L=LR(15, 180, 60, 0), arm_R=ARM_SUPPORT_R), BENT(pitch=60, arm_L=LR(15, 180, 15, 180), arm_R=ARM_SUPPORT_R),
     eq_kickback, arrow="hand_L")

# ═════════════════════════════════════════════════════════════════════════════
# QUADRÍCEPS / GLÚTEO
cena("Afundo com Halteres", "lado_frente", ["quadriceps", "gluteo"],
     STAND(arm=LR(6, 0), leg_R=dict(elev=0, az=6, elev2=0, az2=6), leg_L=dict(elev=0, az=6, elev2=0, az2=6)),
     dict(stance="stand", P=(0, -7, 14), pitch=4, arm=LR(6, 0),
          leg_R=dict(elev=85, az=6, elev2=0, az2=6), leg_L=dict(elev=35, az=180, elev2=80, az2=180, foot_dir=(0, -0.15, 1))),
     lambda sc, b, k: [dumbbell(sc, b.hand[s], axis=(0, 0, 1)) for s in (-1, 1)], contract="A")

SQUAT_ARM = LR(70, 120, 142, -48)
cena("Agachamento Livre", "lado_frente", ["quadriceps", "gluteo"],
     STAND(arm=SQUAT_ARM),
     dict(stance="stand", P=(0, 7, -33), pitch=35, head_pitch=-15, arm=SQUAT_ARM, leg=dict(elev=70, az=10, elev2=-10, az2=10)),
     lambda sc, b, k: barbell(sc, addv(b.sh[-1], (-13, 8, -4)), addv(b.sh[1], (13, 8, -4)), plate_r=14, extra=14), contract="A")

def eq_bulgarian(sc, b, k):
    bench(sc, cz=-56, length=60, y=-2)
    for s in (-1, 1):
        dumbbell(sc, b.hand[s], axis=(0, 0, 1))

cena("Agachamento Búlgaro", "lado_frente", ["quadriceps", "gluteo"],
     dict(stance="stand", P=(0, 34, 0), arm=LR(6, 0), leg_R=dict(elev=12, az=6, elev2=12, az2=6), leg_L=dict(elev=40, az=180, elev2=88, az2=180, foot_dir=(0, -0.3, -1))),
     dict(stance="stand", P=(0, -7, -8), pitch=12, arm=LR(6, 0), leg_R=dict(elev=88, az=6, elev2=0, az2=6), leg_L=dict(elev=47, az=180, elev2=140, az2=180, foot_dir=(0, -0.3, -1))),
     eq_bulgarian, contract="A")

def eq_hack(sc, b, k):
    c = addv(b.P, mul(b.U, 30), mul(b.Fw, -15))
    incline_pad(sc, c, b.U, w=20, h=42, t=4)
    d = norm((0, 0.68, -0.73))
    for x in (-30, 30):   # trilhos 45°
        sc.line3([(x, FLOOR, 46), addv((x, FLOOR, 46), mul(d, 190))], MACH_D, 6, depth_bias=1.0)
    sc.box(-40, 40, FLOOR, FLOOR + 6, 12, 62, MACH_D)
    sc.box(-40, 40, FLOOR + 6, FLOOR + 10, 30, 64, MACH, top=MACH_L)   # plataforma
    for s in (-1, 1):
        pad_bar(sc, addv(b.sh[s], (0, 10, -2)), axis=(0, 0, 1), length=18, r=5)
        handle(sc, b.hand[s], axis=(0, 0, 1), length=14)

cena("Agachamento no Hack", "lado_frente", ["quadriceps"],
     dict(stance="stand", P=(0, 34, 0), pitch=-16, arm=LR(60, 90, 150, -90), leg=dict(elev=-15, az=10, elev2=10, az2=10)),
     dict(stance="stand", P=(0, 8, -24), pitch=-16, arm=LR(60, 90, 150, -90), leg=dict(elev=68, az=10, elev2=-6, az2=10)),
     eq_hack, contract="A")

def eq_leg_ext(sc, b, k):
    seat(sc, back_angle=95)
    tower(sc, k, x=-100, z=-60, h=100)
    cable(sc, [stack_top(k, -100, -60), (-100, 100, -40), (-100, 100, -60), (-24, 0, 16)])
    for s in (-1, 1):
        lever(sc, addv(b.knee[s], (s * 8, 0, 0)), b.ankle[s], width=4)
        handle(sc, addv(b.hip[s], (s * 12, 4, 6)), axis=(0, 0, 1), length=14)
    pad_bar(sc, lerpv3(b.ankle[-1], b.ankle[1], 0.5), axis=(1, 0, 0), length=40, r=5.5)

EXT_ARM = dict(elev=0, az=0)
cena("Extensora", "lado_frente", ["quadriceps"],
     SEAT(arm_L=dict(hand=(-25, 5, 10), bend=(-0.4, -1, 0)), arm_R=dict(hand=(25, 5, 10), bend=(0.4, -1, 0)), leg=dict(elev=90, az=10, elev2=0, az2=10)),
     SEAT(arm_L=dict(hand=(-25, 5, 10), bend=(-0.4, -1, 0)), arm_R=dict(hand=(25, 5, 10), bend=(0.4, -1, 0)), leg=dict(elev=90, az=10, elev2=85, az2=10)), eq_leg_ext)

def eq_leg_press(sc, b, k):
    seat(sc, y=-10, back_angle=125, cz=-10)
    a = lerpv3(b.ankle[-1], b.ankle[1], 0.5)
    u = norm((0, 0.72, 0.7))                       # normal da plataforma (para o atleta)
    n = norm(cross(u, (1, 0, 0)))
    sc.obox(addv(a, mul(u, 5)), (1, 0, 0), n, u, 30, 24, 3, MACH, top=MACH_L)
    d = norm((0, 0.7, 0.72))                       # trilho 45°
    for x in (-34, 34):
        sc.line3([(x, FLOOR, -20), addv((x, FLOOR, -20), mul(d, 150))], MACH_D, 5, depth_bias=1.0)
        sc.sphere(addv(a, mul(u, 10), (x, 0, 0)), 13, MACH_D, depth_bias=0.6)   # anilhas no trenó
    for s in (-1, 1):
        handle(sc, addv(b.hip[s], (s * 12, 4, 4)), axis=(0, 0, 1), length=14)

LP_ARM = dict(arm_L=dict(hand=(-25, -5, -2), bend=(-0.4, -1, 0)), arm_R=dict(hand=(25, -5, -2), bend=(0.4, -1, 0)))
cena("Leg Press", "lado_frente", ["quadriceps", "gluteo"],
     dict(stance="seat", P=(0, -8, -10), pitch=-35, leg=dict(elev=125, az=10, elev2=35, az2=10, foot_dir=(0, 0.7, 0.7)), **LP_ARM),
     dict(stance="seat", P=(0, -8, -10), pitch=-35, leg=dict(elev=112, az=10, elev2=98, az2=10, foot_dir=(0, 0.7, 0.7)), **LP_ARM),
     eq_leg_press, contract="B", arrow="foot_R")

# ═════════════════════════════════════════════════════════════════════════════
# POSTERIOR / GLÚTEO / PANTURRILHA
def eq_leg_curl_seat(sc, b, k):
    seat(sc, back_angle=100)
    pad_bar(sc, addv(lerpv3(b.knee[-1], b.knee[1], 0.5), (0, 10, -6)), axis=(1, 0, 0), length=40, r=4.5)   # trava das coxas
    tower(sc, k, x=-100, z=-60, h=100)
    cable(sc, [stack_top(k, -100, -60), (-100, 100, -40), (-100, 100, -60), (-24, 0, 16)])
    roll = addv(lerpv3(b.ankle[-1], b.ankle[1], 0.5), (0, 5, -8))     # rolo ATRÁS dos tornozelos (parte de trás da perna)
    for s in (-1, 1):
        lever(sc, addv(b.knee[s], (s * 9, 0, 0)), addv(roll, (s * 27, 0, 0)), width=4)
        handle(sc, addv(b.hip[s], (s * 12, 4, 6)), axis=(0, 0, 1), length=14)
    pad_bar(sc, roll, axis=(1, 0, 0), length=56, r=6)

cena("Flexora de Perna Sentado", "lado_frente", ["posterior"],
     SEAT(arm_L=dict(hand=(-25, 5, 10), bend=(-0.4, -1, 0)), arm_R=dict(hand=(25, 5, 10), bend=(0.4, -1, 0)), leg=dict(elev=90, az=10, elev2=85, az2=10)),
     SEAT(arm_L=dict(hand=(-25, 5, 10), bend=(-0.4, -1, 0)), arm_R=dict(hand=(25, 5, 10), bend=(0.4, -1, 0)), leg=dict(elev=90, az=10, elev2=-5, az2=10)), eq_leg_curl_seat)

def eq_leg_curl_prone(sc, b, k):
    bench(sc, cz=-16, length=104, y=-2)
    for s in (-1, 1):
        handle(sc, b.hand[s], axis=(1, 0, 0), length=12)
    tower(sc, k, x=-100, z=70, h=60)
    cable(sc, [stack_top(k, -100, 70), (-100, 60, 90), (-100, 60, 70), (-24, b.knee[-1][1], b.knee[-1][2])])
    for s in (-1, 1):
        lever(sc, addv(b.knee[s], (s * 8, 0, 0)), b.ankle[s], width=4)
    pad_bar(sc, addv(lerpv3(b.ankle[-1], b.ankle[1], 0.5), (0, -3, 0)), axis=(1, 0, 0), length=40, r=5.5)

PRONE_ARM = dict(elev=120, az=0, elev2=155, az2=0)
cena("Flexora Deitado", "lado_costas", ["posterior"],
     PRONE(arm=PRONE_ARM, leg=dict(elev=0, az=180, elev2=0, az2=180, foot_dir=(0, -0.4, 1))),
     PRONE(arm=PRONE_ARM, leg=dict(elev=0, az=180, elev2=105, az2=180, foot_dir=(0, 0.6, 0.8))), eq_leg_curl_prone, arrow="foot_R")

def eq_standing_curl(sc, b, k):
    kn = b.knee[-1]
    tower(sc, k, x=0, z=96, h=100)
    cable(sc, [stack_top(k, 0, 96), (0, 100, 116), (0, 100, 96), (0, kn[1], 96), (-22, kn[1], kn[2])])
    lever(sc, (-22, kn[1], kn[2]), b.ankle[-1], width=4)
    pad_bar(sc, addv(kn, (0, 6, 10)), axis=(1, 0, 0), length=16, r=4.5)    # apoio da coxa à frente
    pad_bar(sc, addv(b.ankle[-1], (0, 2, -2)), axis=(1, 0, 0), length=14, r=4)
    mid = lerpv3(b.hand[-1], b.hand[1], 0.5)
    sc.box(-16, 16, mid[1] - 2, mid[1] + 2, mid[2] - 2, mid[2] + 2, MACH_L)
    post(sc, (0, mid[1] - 2, mid[2]))

cena("Flexora em Pé", "lado_costas", ["posterior"],
     STAND(pitch=15, arm=LR(60, 0, 80, 0), leg_R=dict(elev=0, az=6, elev2=0, az2=6), leg_L=dict(elev=0, az=6, elev2=0, az2=6)),
     STAND(pitch=15, arm=LR(60, 0, 80, 0), leg_R=dict(elev=0, az=6, elev2=0, az2=6), leg_L=dict(elev=-8, az=6, elev2=-100, az2=6, foot=90)),
     eq_standing_curl, arrow="foot_L")

def eq_hip_thrust(sc, b, k):
    bench(sc, cz=-64, length=50, y=-2)
    barbell(sc, addv(b.P, (-22, 12, 4)), addv(b.P, (22, 12, 4)), plate_r=12, extra=16)

HT_ARM = dict(elev=0, az=0)
cena("Elevação Pélvica", "lado_frente", ["gluteo", "posterior"],
     dict(stance="supine", P=(0, -27, -13), pitch=35, arm=LR(12, 60, 12, 60), leg=dict(elev=15, az=0, elev2=95, az2=180, foot_dir=(0, -0.2, 1))),
     dict(stance="supine", P=(0, 0, -5), pitch=0, arm=LR(12, 60, 12, 60), leg=dict(elev=5, az=180, elev2=85, az2=180, foot_dir=(0, -0.2, 1))),
     eq_hip_thrust, contract="B", arrow="head")

def eq_kickback_cable(sc, b, k):
    tower_low(sc, k, x=0, z=70, h=100, to=[addv(b.ankle[-1], (0, 2, 0))])
    pad_bar(sc, addv(b.ankle[-1], (0, 3, 0)), axis=(1, 0, 0), length=14, r=3.5)
    sc.box(-16, 16, 44, 48, 34, 38, MACH_L)
    post(sc, (0, 44, 36))

cena("Coice na Polia Baixa", "lado_costas", ["gluteo"],
     STAND(pitch=15, arm=LR(70, 0, 80, 0), leg_L=dict(elev=0, az=6, elev2=0, az2=6)),
     STAND(pitch=15, arm=LR(70, 0, 80, 0), leg_L=dict(elev=40, az=180, elev2=30, az2=180, foot=60)),
     eq_kickback_cable, contract="B", arrow="foot_L")

def nordic_pose(theta):
    t = math.radians(theta)
    P = (0, -41 + 44 * math.cos(t), 44 * math.sin(t) - 4)
    return dict(stance="kneel", P=P, pitch=theta, head_pitch=-10, arm=LR(60, 0, 130, 0),
                leg=dict(elev=theta, az=180, elev2=90, az2=180, foot_dir=(0, -0.35, -1)))

def eq_nordic(sc, b, k):
    sc.box(-30, 30, FLOOR, FLOOR + 3, -60, 40, (36, 36, 36), top=(44, 44, 44))
    a = lerpv3(b.ankle[-1], b.ankle[1], 0.5)
    pad_bar(sc, addv(a, (0, 7, 0)), axis=(1, 0, 0), length=40, r=4.5)
    for x in (-18, 18):
        post(sc, (x, a[1] + 7, a[2]), y0=FLOOR + 3, r=2.5)

cena("Flexão Nórdica", "lado_costas", ["posterior"], nordic_pose(0), nordic_pose(60), eq_nordic, contract="B", arrow="head")

def eq_abd_add(sc, b, k, side):
    seat(sc, back_angle=95)
    tower(sc, k, x=-100, z=-30, h=90)
    cable(sc, [stack_top(k, -100, -30), (-100, 90, -10), (-100, 90, -30), (0, -18, -20)])
    sc.box(-100, 0, -22, -14, -24, -16, MACH, top=MACH_L)
    for s in (-1, 1):
        pad = addv(b.knee[s], (s * side * 11, 0, 0))
        lever(sc, (s * 6, -18, 30), pad, width=4)
        pad_bar(sc, pad, axis=(0, 1, 0), length=22, r=4.5)
        handle(sc, addv(b.hip[s], (s * 12, 4, 6)), axis=(0, 0, 1), length=14)

ABD_ARM = dict(arm_L=dict(hand=(-25, 5, 10), bend=(-0.4, -1, 0)), arm_R=dict(hand=(25, 5, 10), bend=(0.4, -1, 0)))
cena("Abdutora", "frente34", ["abdutores", "gluteo"],
     SEAT(leg=dict(elev=80, az=10, elev2=0, az2=10), **ABD_ARM), SEAT(leg=dict(elev=80, az=40, elev2=0, az2=40), **ABD_ARM),
     lambda sc, b, k: eq_abd_add(sc, b, k, +1))
cena("Adutora", "frente34", ["adutores"],
     SEAT(leg=dict(elev=80, az=40, elev2=0, az2=40), **ABD_ARM), SEAT(leg=dict(elev=80, az=10, elev2=0, az2=10), **ABD_ARM),
     lambda sc, b, k: eq_abd_add(sc, b, k, -1))

def eq_hip_abd_cable(sc, b, k):
    tower_low(sc, k, x=-100, z=0, h=104, to=[addv(b.ankle[1], (0, 2, 0))])
    pad_bar(sc, addv(b.ankle[1], (0, 3, 0)), axis=(0, 0, 1), length=14, r=3.5)

HAB_ARM_L = dict(elev=0, az=0, hand=(-96, 40, 4), bend=(0, -1, 0))
cena("Abdução de Quadril na Polia", "frente34", ["abdutores", "gluteo"],
     STAND(P=(-42, 36, 0), arm_L=HAB_ARM_L, arm_R=LR(24, 90, 96, 190), leg_R=dict(elev=0, az=6, elev2=0, az2=6)),
     STAND(P=(-42, 36, 0), arm_L=HAB_ARM_L, arm_R=LR(24, 90, 96, 190), leg_R=dict(elev=38, az=90, elev2=38, az2=90)),
     eq_hip_abd_cable, arrow="foot_R")

def eq_calf_seat(sc, b, k):
    seat(sc, y=7)
    kn = lerpv3(b.knee[-1], b.knee[1], 0.5)
    pad_bar(sc, addv(kn, (0, 11, -6)), axis=(1, 0, 0), length=44, r=5.5)
    lever(sc, (0, 30, 74), addv(kn, (0, 11, -6)), width=5)
    post(sc, (0, 30, 74), r=3)
    sc.box(-24, 24, FLOOR, FLOOR + 8, 52, 72, MACH, top=MACH_L)          # step sob as pontas dos pés
    tower(sc, k, x=-100, z=-60, h=70)
    cable(sc, [stack_top(k, -100, -60), (-100, 70, -40), (-100, 70, -60), (-100, 30, -60), (0, 30, 74)])

CALF_ARM = dict(arm_L=dict(hand=(-16, 20, 40), bend=(0, -1, 0.5)), arm_R=dict(hand=(16, 20, 40), bend=(0, -1, 0.5)))
cena("Panturrilha na Máquina", "lado_frente", ["panturrilha"],
     SEAT(P=(0, 9, 0), leg=dict(elev=74, az=10, elev2=0, az2=10, foot=-20), **CALF_ARM),
     SEAT(P=(0, 9, 0), leg=dict(elev=94, az=10, elev2=0, az2=10, foot=30), **CALF_ARM), eq_calf_seat, arrow="foot_R")

def eq_step(sc, b, k):
    sc.box(-24, 24, FLOOR, FLOOR + 8, 8, 26, MACH, top=MACH_L)
    mid = lerpv3(b.hand[-1], b.hand[1], 0.5)
    sc.box(-16, 16, mid[1] - 2, mid[1] + 2, mid[2] - 2, mid[2] + 2, MACH_L)
    post(sc, (0, mid[1] - 2, mid[2]))

STEP_LEG_A = dict(elev=0, az=6, elev2=0, az2=6, foot=-20)
STEP_LEG_B = dict(elev=0, az=6, elev2=0, az2=6, foot=30)
cena("Panturrilha no Step", "lado_frente", ["panturrilha"],
     STAND(P=(0, 41, 0), arm=LR(60, 0, 100, 0), leg=STEP_LEG_A), STAND(P=(0, 56, 0), arm=LR(60, 0, 100, 0), leg=STEP_LEG_B), eq_step, arrow="foot_R")

def eq_calf_stand(sc, b, k):
    sc.box(-24, 24, FLOOR, FLOOR + 8, 8, 26, MACH, top=MACH_L)
    frame_posts(sc, xs=(-40, 40), z=-26, h=134)
    tower(sc, k, x=-100, z=-60, h=134)
    cable(sc, [stack_top(k, -100, -60), (-100, 134, -40), (-100, 134, -60), (0, 130, -26)])
    for s in (-1, 1):
        pad = addv(b.sh[s], (s * 2, 10, -2))
        pad_bar(sc, pad, axis=(0, 0, 1), length=18, r=5)
        beam(sc, (s * 40, 130, -26), addv(pad, (0, 4, -6)), w=4)
        handle(sc, b.hand[s], axis=(0, 0, 1), length=14)

cena("Panturrilha em Pé na Máquina", "lado_frente", ["panturrilha"],
     STAND(P=(0, 41, 0), arm=LR(100, 90, 120, -90), leg=STEP_LEG_A), STAND(P=(0, 56, 0), arm=LR(100, 90, 120, -90), leg=STEP_LEG_B), eq_calf_stand, arrow="foot_R")

# ═════════════════════════════════════════════════════════════════════════════
# ABDÔMEN
# Abdominais na Máquina: cena ANTIGA (catalogo3d) mantida — Weslley quer a mesma animação, só a pilha no lugar

cena("Elevação de Pernas", "alto_lado", ["abdomen"],
     dict(stance="supine", P=(0, -44, 0), arm=LR(8, 30), leg=dict(elev=4, az=6, elev2=0, az2=6, foot_dir=(0, 1, 0.2))),
     dict(stance="supine", P=(0, -44, 0), arm=LR(8, 30), leg=dict(elev=88, az=6, elev2=0, az2=6, foot_dir=(0, 0.2, -1))),
     eq_mat, contract="B", arrow="foot_R")

CRUNCH_LEG = dict(elev=40, az=8, elev2=110, az2=180, foot_dir=(0, -0.3, 1))
cena("Abdominal Supra no Solo", "alto_lado", ["abdomen"],
     dict(stance="supine", P=(0, -44, 0), pitch=0, arm=LR(160, 70, 110, 200), leg=CRUNCH_LEG),
     dict(stance="supine", P=(0, -44, 0), pitch=32, head_pitch=15, arm=LR(160, 70, 110, 200), leg=CRUNCH_LEG),
     eq_mat, contract="B", arrow="head")

# ── novos (exercícios pessoais do Weslley promovidos ao catálogo) ──────────────
def eq_low_row_machine(sc, b, k):
    seat(sc)
    incline_pad(sc, (0, 38, 24), (0, 1, 0), w=15, h=17, t=3.5)
    post(sc, (0, 21, 24), r=3)
    tower(sc, k, x=-100, z=70, h=96)
    cable(sc, [stack_top(k, -100, 70), (-100, 96, 90), (-100, 96, 70), (-100, 14, 70), (-30, 14, 66)])
    frame_posts(sc, xs=(-46, 46), z=66, h=96)
    for s in (-1, 1):
        lever(sc, (s * 30, 14, 66), addv(b.hand[s], (0, 0, 2)))
        handle(sc, b.hand[s], axis=(0, 1, 0), length=14)

cena("Remada Baixa na Máquina", "costas34", ["dorsal", "romboides"],
     SEAT(arm=LR(72, 2, 72, 2)), SEAT(arm=LR(20, 178, 72, 4)), eq_low_row_machine)

BIKE_ARM = LR(160, 70, 110, 200)
cena("Abdominal Bicicleta", "alto_lado", ["abdomen"],
     dict(stance="supine", P=(0, -44, 0), pitch=22, head_pitch=12, arm=BIKE_ARM,
          leg_R=dict(elev=100, az=6, elev2=25, az2=6, foot_dir=(0, 0.3, 1)), leg_L=dict(elev=18, az=6, elev2=12, az2=6, foot_dir=(0, 0.3, 1))),
     dict(stance="supine", P=(0, -44, 0), pitch=22, head_pitch=12, arm=BIKE_ARM,
          leg_R=dict(elev=18, az=6, elev2=12, az2=6, foot_dir=(0, 0.3, 1)), leg_L=dict(elev=100, az=6, elev2=25, az2=6, foot_dir=(0, 0.3, 1))),
     eq_mat, contract="B", arrow="foot_R")

def eq_mat_bench(sc, b, k):
    eq_mat(sc, b, k)
    bench(sc, cz=60, length=40, y=-2)

OBL_LEG_R = dict(elev=85, az=0, elev2=0, az2=0, foot_dir=(0, -0.2, 1))
OBL_LEG_L = dict(elev=75, az=-40, elev2=50, az2=-30, foot_dir=(0.6, -0.4, 0.6))
cena("Abdominal Oblíquo com Pé no Banco", "alto_lado", ["abdomen"],
     dict(stance="supine", P=(0, -44, 0), pitch=0, arm=LR(160, 70, 110, 200), leg_R=OBL_LEG_R, leg_L=OBL_LEG_L),
     dict(stance="supine", P=(0, -44, 0), pitch=30, head_pitch=15, arm=LR(160, 70, 110, 200), leg_R=OBL_LEG_R, leg_L=OBL_LEG_L),
     eq_mat_bench, contract="B", arrow="head")

# Rosca ALTERNADA na máquina: um braço flexiona enquanto o outro estende
def _k_maos(b, lo=8.0, hi=50.0):
    """pilha sobe com o braço mais flexionado (máquina alternada: qualquer braço puxa a carga)."""
    return max(0.0, min(1.0, (max(b.hand[-1][1], b.hand[1][1]) - lo) / (hi - lo)))

cena("Rosca Alternada na Máquina", "frente34", ["biceps"],
     SEAT(arm_R=LR(45, 0, 150, 25), arm_L=LR(45, 0, 45, 0)), SEAT(arm_R=LR(45, 0, 45, 0), arm_L=LR(45, 0, 150, 25)),
     lambda sc, b, k: eq_preacher(sc, b, _k_maos(b), machine=True), arrow="hand_L")
# Rosca ALTERNADA no banco inclinado: um braço sobe enquanto o outro desce (versão publicada subia os dois juntos)
cena("Rosca Alternada no Banco Inclinado", "lado_frente", ["biceps"],
     SEAT(pitch=-35, arm_R=LR(-15, 0, 110, 0), arm_L=LR(-15, 0, -15, 0)), SEAT(pitch=-35, arm_R=LR(-15, 0, -15, 0), arm_L=LR(-15, 0, 110, 0)),
     lambda sc, b, k: (seat(sc, back_angle=125), [dumbbell(sc, b.hand[s]) for s in (-1, 1)]), arrow="hand_L")
# Supino Inclinado: encosto um pouco mais largo/grosso pra aparecer atrás do tronco na vista dos pés


# ═════════════════════════════════════════════════════════════════════════════
# RODADA 4 (08/09 ~23:40) — feedback do Weslley: supino = empurrar em LINHA RETA com cotovelos ~45° (não arco),
# ferros rígidos (não cordas), só braços + pesos se mexem; hack completo; rolo da flexora atrás; francês mãos juntas.
def rigid(sc, a, b_, r=3.2):
    """barra rígida da máquina (grossa, clara, com contorno) — no lugar da alavanca fina que parecia corda."""
    sc.capsule(a, b_, r, MACH_L, outline=(60, 60, 60), depth_bias=0.15)

def perna_para_pe(P, ankle, s, az=6, foot=None, foot_dir=None):
    """ângulos da perna (elev/elev2, plano sagital) para o tornozelo cair em `ankle` (IK 2 segmentos, joelho à frente)."""
    hip = (P[0] + s * 13, P[1] + 1, P[2] + 4)
    dy, dz = ankle[1] - hip[1], ankle[2] - hip[2]
    d = min(math.hypot(dy, dz), 44 + 46 - 0.5)
    phi = math.degrees(math.atan2(dz, -dy))                       # direção quadril→tornozelo, 0 = reto pra baixo, + = frente
    ca = max(-1.0, min(1.0, (44 * 44 + d * d - 46 * 46) / (2 * 44 * d)))
    alpha = math.degrees(math.acos(ca))
    elev = phi + alpha
    kz, ky = math.sin(math.radians(elev)) * 44, -math.cos(math.radians(elev)) * 44
    elev2 = math.degrees(math.atan2(dz - kz, -(dy - ky)))
    leg = dict(elev=elev, az=az, elev2=elev2, az2=az)
    if foot is not None: leg["foot"] = foot
    if foot_dir is not None: leg["foot_dir"] = foot_dir
    return leg

def press_hands(y, z, x=30, bend=(0.9, -1, 0.25)):
    """mãos por IK (empurrar em linha reta); cotovelos pra fora/baixo (~45°)."""
    return dict(arm_L=dict(elev=0, az=0, hand=(-x, y, z), bend=(-bend[0], bend[1], bend[2])),
                arm_R=dict(elev=0, az=0, hand=(x, y, z), bend=bend))

# ── Supino Reto com Barra / Halteres (deitado, banco reto): barra no peito → estende reto pra cima
cena("Supino Reto com Barra", "supino", ["peitoral", "triceps"],
     SUPINE(**press_hands(16, -34)), SUPINE(**press_hands(60, -36)),
     lambda sc, b, k: (bench(sc, cz=-22, length=100), barbell(sc, b.hand[-1], b.hand[1], plate_r=11)))
cena("Supino Reto com Halteres", "supino", ["peitoral", "triceps"],
     SUPINE(**press_hands(16, -34, x=32)), SUPINE(**press_hands(60, -36, x=26)),
     lambda sc, b, k: (bench(sc, cz=-22, length=100), [dumbbell(sc, b.hand[s]) for s in (-1, 1)]))

# ── Supino Reto na Máquina Deitado = Smith: barra com anilhas correndo em trilhos verticais
def eq_smith(sc, b, k):
    bench(sc, cz=-22, length=100)
    for x in (-72, 72):
        sc.box(x - 3, x + 3, FLOOR, 112, -38, -30, MACH, top=MACH_L)
    sc.box(-75, 75, 110, 116, -38, -30, MACH, top=MACH_L)
    barbell(sc, b.hand[-1], b.hand[1], plate_r=11, extra=30)

cena("Supino Reto na Máquina Deitado", "supino", ["peitoral", "triceps", "deltoide_ant"],
     SUPINE(**press_hands(16, -34)), SUPINE(**press_hands(62, -34)), eq_smith)

# ── Supino Inclinado: perpendicular ao tronco inclinado (barra no peito alto, longe do rosto)
def inc_pose(y, z):
    return SUPINE(P=(0, 6, 0), pitch=35, leg=INC_LEG, **press_hands(y, z, bend=(0.9, -0.7, 0.7)))
cena("Supino Inclinado", "supino", ["peitoral", "deltoide_ant"],
     inc_pose(36, -8), inc_pose(74, 14),
     lambda sc, b, k: (seat(sc, y=-2, back_angle=125, cz=-4), barbell(sc, b.hand[-1], b.hand[1], plate_r=10)))

# ── Supino Declinado na Máquina (articulada): barras rígidas dos pivôs na cabeceira até as manoplas, empurra reto
def eq_decline_machine(sc, b, k):
    bench_along(sc, b, off=-11, half_len=46)
    pad_bar(sc, addv(lerpv3(b.ankle[-1], b.ankle[1], 0.5), (0, 8, -4)), axis=(1, 0, 0), length=40, r=4.5)
    tower(sc, k, x=-100, z=-100, h=46, lift=18)
    cable(sc, [stack_top(k, -100, -100, 18), (-100, 46, -80), (-100, 46, -100), (0, 40, -100)])
    sc.box(-44, 44, 36, 42, -104, -96, MACH, top=MACH_L)
    for s in (-1, 1):
        post(sc, (s * 42, 38, -100))
        rigid(sc, (s * 42, 36, -98), b.hand[s])
        handle(sc, b.hand[s], axis=(1, 0, 0), length=14)

def dec_pose(y, z):
    return SUPINE(P=(0, 16, 0), pitch=-18, leg=dict(elev=45, az=0, elev2=100, az2=180, foot_dir=(0, -0.4, 1)), **press_hands(y, z, bend=(0.9, -1, -0.3)))
cena("Supino Declinado na Máquina", "supino", ["peitoral", "triceps"], dec_pose(20, -39), dec_pose(62, -52), eq_decline_machine)

# ── Supino Reto na Máquina Sentado: braços empurram reto à frente; barras rígidas dos pivôs (acima/atrás) às manoplas verticais
def eq_chest_press(sc, b, k):
    seat(sc, back_angle=95)
    tower(sc, k, x=-100, z=-34, h=100)
    cable(sc, [stack_top(k, -100, -34), (-100, 100, -14), (-100, 100, -34), (0, 92, -30)])
    frame_posts(sc, xs=(-36, 36), z=-30, h=92)
    for s in (-1, 1):
        rigid(sc, (s * 36, 88, -30), addv(b.hand[s], (s * 4, 6, 0)))
        handle(sc, b.hand[s], axis=(0, 1, 0), length=16)

cena("Supino Reto na Máquina Sentado", "frente34", ["peitoral", "triceps"],
     SEAT(**press_hands(40, 10, x=24, bend=(0.9, -1, 0))), SEAT(**press_hands(40, 60, x=24, bend=(0.9, -1, 0))), eq_chest_press)

# ── Tríceps Francês com Halter: braços em V fechado, mãos juntas sob a anilha de cima
def eq_french_db(sc, b, k):
    seat(sc)
    mid = lerpv3(b.hand[-1], b.hand[1], 0.5)
    dumbbell(sc, addv(mid, (0, -6, 0)), axis=(0, 1, 0), r=8, depth_bias=0.0)
cena("Tríceps Francês com Halter", "costas34", ["triceps"],
     SEAT(arm=LR(165, -90, 75, 200)), SEAT(arm=LR(165, -90, 165, -90)), eq_french_db, fit_top=86)

# ── Flexora Sentado: rolo e alavancas ATRÁS das canelas (profundidade forçada pra trás)
def eq_leg_curl_seat(sc, b, k):
    seat(sc, back_angle=100)
    pad_bar(sc, addv(lerpv3(b.knee[-1], b.knee[1], 0.5), (0, 10, -6)), axis=(1, 0, 0), length=40, r=4.5)
    tower(sc, k, x=-100, z=-60, h=100)
    cable(sc, [stack_top(k, -100, -60), (-100, 100, -40), (-100, 100, -60), (-24, 0, 16)])
    roll = addv(lerpv3(b.ankle[-1], b.ankle[1], 0.5), (0, 5, -9))
    for s in (-1, 1):
        sc.line3([addv(b.knee[s], (s * 9, 0, 0)), addv(roll, (s * 28, 0, 0))], MACH, 4, depth_bias=2.5)
        handle(sc, addv(b.hip[s], (s * 12, 4, 6)), axis=(0, 0, 1), length=14)
    sc.capsule(addv(roll, (-28, 0, 0)), addv(roll, (28, 0, 0)), 6, ACCENT, outline=(120, 90, 0), depth_bias=2.5)
cena("Flexora de Perna Sentado", "lado_frente", ["posterior"],
     SEAT(arm_L=dict(hand=(-25, 5, 10), bend=(-0.4, -1, 0)), arm_R=dict(hand=(25, 5, 10), bend=(0.4, -1, 0)), leg=dict(elev=90, az=10, elev2=85, az2=10)),
     SEAT(arm_L=dict(hand=(-25, 5, 10), bend=(-0.4, -1, 0)), arm_R=dict(hand=(25, 5, 10), bend=(0.4, -1, 0)), leg=dict(elev=90, az=10, elev2=-5, az2=10)), eq_leg_curl_seat)

# ── Agachamento no Hack: pés FIXOS na plataforma, corpo desliza no trilho 45°, agacha até a coxa paralela
HACK_ANKLE = (-37, 56)   # (y, z) do tornozelo na plataforma
def hack_pose(P):
    return dict(stance="stand", P=P, pitch=-42, head_pitch=10, arm=LR(60, 90, 150, -90),   # mais deitado (encosto ~45°, ref. Mundo Boa Forma)
                leg_L=perna_para_pe(P, (-13, HACK_ANKLE[0], HACK_ANKLE[1]), -1, az=8, foot_dir=(0, 0.25, 1)),
                leg_R=perna_para_pe(P, (13, HACK_ANKLE[0], HACK_ANKLE[1]), 1, az=8, foot_dir=(0, 0.25, 1)))
def eq_hack(sc, b, k):
    c = addv(b.P, mul(b.U, 30), mul(b.Fw, -15))
    incline_pad(sc, c, b.U, w=20, h=42, t=4)
    d = norm((0, 0.68, -0.73))
    for x in (-30, 30):
        sc.line3([(x, FLOOR, 60), addv((x, FLOOR, 60), mul(d, 200))], MACH_D, 6, depth_bias=1.0)
    sc.box(-40, 40, FLOOR, FLOOR + 6, 20, 72, MACH_D)
    sc.box(-40, 40, FLOOR + 6, FLOOR + 10, 34, 74, MACH, top=MACH_L)   # plataforma
    for s in (-1, 1):
        pad_bar(sc, addv(b.sh[s], (0, 10, -2)), axis=(0, 0, 1), length=18, r=5)
        handle(sc, b.hand[s], axis=(0, 0, 1), length=14)
    sc.sphere(addv(c, (40, -8, 0)), 13, MACH_D, depth_bias=1.2)      # anilha no lado de fora (longe da câmera)
cena("Agachamento no Hack", "lado_frente", ["quadriceps"], hack_pose((0, 34, 0)), hack_pose((0, 8, 26)), eq_hack, contract="A", arrow=None,
     leg_ik={"L": (-13, HACK_ANKLE[0], HACK_ANKLE[1]), "R": (13, HACK_ANKLE[0], HACK_ANKLE[1])})


# ── RODADA 5 (física): barra da máquina com comprimento CONSTANTE — mão anda num arco em volta do pivô fixo
def arc_hand(pivot, hand_a, dz):
    """ponto B no mesmo raio do pivô que hand_a, deslocado dz pra frente (sobe/desce o que a geometria mandar)."""
    Rr = math.dist(pivot, hand_a)
    dx = hand_a[0] - pivot[0]; z = hand_a[2] + dz; dzp = z - pivot[2]
    dy = -math.sqrt(max(0.0, Rr * Rr - dx * dx - dzp * dzp))     # mão abaixo do pivô
    return (hand_a[0], pivot[1] + dy, z)

# Supino Reto na Máquina Sentado (articulado): braços da máquina pendurados de uma viga alta à frente, manoplas verticais
CP_PIV = {"L": (-38, 112, 24), "R": (38, 112, 24)}
CP_A = {"L": (-24, 40, 10), "R": (24, 40, 10)}
CP_B = {sd: arc_hand(CP_PIV[sd], CP_A[sd], 44) for sd in ("L", "R")}
def eq_chest_press(sc, b, k):
    seat(sc, back_angle=95)
    tower(sc, k, x=-100, z=-34, h=118)
    cable(sc, [stack_top(k, -100, -34), (-100, 118, -14), (-100, 118, -34), (0, 116, 24)])
    frame_posts(sc, xs=(-46, 46), z=24, h=116)                       # colunas + viga à frente/acima
    for s, sd in ((-1, "L"), (1, "R")):
        rigid(sc, CP_PIV[sd], addv(b.hand[s], (s * 3, 5, 0)))
        handle(sc, b.hand[s], axis=(0, 1, 0), length=16)
def cp_pose(hands):
    return SEAT(arm_L=dict(elev=0, az=0, hand=hands["L"], bend=(-0.9, -1, 0)), arm_R=dict(elev=0, az=0, hand=hands["R"], bend=(0.9, -1, 0)))
cena("Supino Reto na Máquina Sentado", "frente34", ["peitoral", "triceps"], cp_pose(CP_A), cp_pose(CP_B), eq_chest_press, arc=CP_PIV)

# Supino Declinado na Máquina (articulado): pivôs na cabeceira, mão no arco
DP_PIV = {"L": (-42, 36, -98), "R": (42, 36, -98)}
DP_A = {"L": (-30, 20, -39), "R": (30, 20, -39)}
def dec_arc_hand(pivot, hand_a, dy):
    Rr = math.dist(pivot, hand_a); dx = hand_a[0] - pivot[0]; y = hand_a[1] + dy; dyp = y - pivot[1]
    dz = math.sqrt(max(0.0, Rr * Rr - dx * dx - dyp * dyp))       # mão à frente (z maior) do pivô
    return (hand_a[0], y, pivot[2] + dz)
DP_B = {sd: dec_arc_hand(DP_PIV[sd], DP_A[sd], 40) for sd in ("L", "R")}
def eq_decline_machine(sc, b, k):
    bench_along(sc, b, off=-11, half_len=46)
    pad_bar(sc, addv(lerpv3(b.ankle[-1], b.ankle[1], 0.5), (0, 8, -4)), axis=(1, 0, 0), length=40, r=4.5)
    tower(sc, k, x=-100, z=-100, h=46, lift=18)
    cable(sc, [stack_top(k, -100, -100, 18), (-100, 46, -80), (-100, 46, -100), (0, 40, -100)])
    sc.box(-44, 44, 36, 42, -104, -96, MACH, top=MACH_L)
    for s, sd in ((-1, "L"), (1, "R")):
        post(sc, (s * 42, 38, -100))
        rigid(sc, DP_PIV[sd], b.hand[s])
        handle(sc, b.hand[s], axis=(1, 0, 0), length=14)
def dp_pose(hands):
    return SUPINE(P=(0, 16, 0), pitch=-18, leg=dict(elev=45, az=0, elev2=100, az2=180, foot_dir=(0, -0.4, 1)),
                  arm_L=dict(elev=0, az=0, hand=hands["L"], bend=(-0.9, -1, -0.3)), arm_R=dict(elev=0, az=0, hand=hands["R"], bend=(0.9, -1, -0.3)))
cena("Supino Declinado na Máquina", "supino", ["peitoral", "triceps"], dp_pose(DP_A), dp_pose(DP_B), eq_decline_machine, arc=DP_PIV)


# ── RODADA 6: Supino Inclinado — o encosto estava 20° mais em pé que o tronco e ENGOLIA a cabeça ("negócio preto na cara").
# Banco alinhado ao tronco (bench_along) + assento curto sob o quadril.
def eq_incline_bench(sc, b, k):
    bench_along(sc, b, off=-11, half_len=44, w=16)
    sc.box(-16, 16, -8, -2, -6, 26, BENCH, top=BENCH_T)      # assento
    post(sc, (0, -8, 10), r=4)
    barbell(sc, b.hand[-1], b.hand[1], plate_r=10)
cena("Supino Inclinado", "supino", ["peitoral", "deltoide_ant"], inc_pose(36, -8), inc_pose(74, 14), eq_incline_bench)

# ── Tríceps Francês com Halter: vista LATERAL (pedido dele) — braços verticais ao lado da cabeça, antebraço dobra pra trás
cena("Tríceps Francês com Halter", "lado_tf", ["triceps"],
     SEAT(arm=LR(168, -90, 72, 200)), SEAT(arm=LR(168, -90, 168, -90)), eq_french_db, fit_top=86)


# ── RODADA 7 (09/09 ~02:00)
# Supino Inclinado: barra no PEITO ALTO (linha da clavícula), não na barriga — mãos em P+U*50+Fw*9 e empurra ao longo de Fw
def inc_pose2(dfw):
    P = (0, 6, 0); U = (0, 0.5736, -0.8192); Fw = (0, 0.8192, 0.5736)
    c = tuple(P[i] + U[i] * 50 + Fw[i] * (9 + dfw) for i in range(3))
    return SUPINE(P=P, pitch=35, leg=INC_LEG,
                  arm_L=dict(elev=0, az=0, hand=(-30, c[1], c[2]), bend=(-0.9, -0.55, 0.75)),
                  arm_R=dict(elev=0, az=0, hand=(30, c[1], c[2]), bend=(0.9, -0.55, 0.75)))
cena("Supino Inclinado", "supino", ["peitoral", "deltoide_ant"], inc_pose2(0), inc_pose2(44), eq_incline_bench)

# Tríceps Francês: az2 contínuo (200 → 270) — antes dava a volta por -90 e os braços "abriam" no meio do movimento
cena("Tríceps Francês com Halter", "lado_tf", ["triceps"],
     SEAT(arm=LR(163, 270, 72, 200)), SEAT(arm=LR(163, 270, 163, 270)), eq_french_db, fit_top=86)   # mãos ~8 un. juntas do início ao fim

# Hack: plataforma INCLINADA (perpendicular ao trilho/encosto), pés apoiados nela
HACK_D = norm((0, 0.68, -0.73))            # direção do trilho (normal da plataforma)
HACK_E = norm((0, 0.73, 0.68))             # ao longo da plataforma (pra cima/frente)
HACK_ANK = (-30, 52)                       # (y, z) do tornozelo
def hack_pose2(P):
    fd = HACK_E
    return dict(stance="stand", P=P, pitch=-42, head_pitch=10, arm=LR(60, 90, 150, -90),
                leg_L=perna_para_pe(P, (-13, HACK_ANK[0], HACK_ANK[1]), -1, az=8, foot_dir=fd),
                leg_R=perna_para_pe(P, (13, HACK_ANK[0], HACK_ANK[1]), 1, az=8, foot_dir=fd))
def eq_hack2(sc, b, k):
    c = addv(b.P, mul(b.U, 30), mul(b.Fw, -15))
    incline_pad(sc, c, b.U, w=20, h=42, t=4)
    for x in (-30, 30):
        sc.line3([(x, FLOOR, 66), addv((x, FLOOR, 66), mul(HACK_D, 200))], MACH_D, 6, depth_bias=1.0)
    a = (0, HACK_ANK[0], HACK_ANK[1])
    pc = addv(a, mul(HACK_D, -5.5))                                      # plataforma logo abaixo das solas
    sc.obox(pc, (1, 0, 0), HACK_E, HACK_D, 38, 22, 3, MACH, top=MACH_L)
    lo = addv(pc, mul(HACK_E, -22))
    sc.box(-36, 36, FLOOR, FLOOR + 5, lo[2] - 6, lo[2] + 40, MACH_D)       # base no chão
    sc.box(-4, 4, FLOOR + 5, pc[1] - 4, pc[2] - 4, pc[2] + 4, MACH, top=MACH_L)   # apoio da plataforma
    for s in (-1, 1):
        pad_bar(sc, addv(b.sh[s], (0, 10, -2)), axis=(0, 0, 1), length=18, r=5)
        handle(sc, b.hand[s], axis=(0, 0, 1), length=14)
    sc.sphere(addv(c, (40, -8, 0)), 13, MACH_D, depth_bias=1.2)
cena("Agachamento no Hack", "lado_frente", ["quadriceps"], hack_pose2((0, 34, 0)), hack_pose2((0, 8, 26)), eq_hack2, contract="A", arrow=None,
     leg_ik={"L": (-13, HACK_ANK[0], HACK_ANK[1]), "R": (13, HACK_ANK[0], HACK_ANK[1])})


# Tríceps Francês por IK: mãos SEMPRE juntas (~8 un.) — atrás da cabeça → acima da cabeça; cotovelos pra cima/frente
def tf_pose(y, z):
    return SEAT(arm_L=dict(elev=0, az=0, hand=(-4.2, y, z), bend=(-0.15, 1, 0.55)), arm_R=dict(elev=0, az=0, hand=(4.2, y, z), bend=(0.15, 1, 0.55)))
cena("Tríceps Francês com Halter", "lado_tf", ["triceps"], tf_pose(66, -22), tf_pose(103, -2), eq_french_db, fit_top=86)


# ── RODADA 8: Hack — pés mais PRA FRENTE na plataforma (+10 ao longo dela); plataforma fixa onde estava
HACK_PC = tuple(a - 5.5 * d for a, d in zip((0, -30, 52), HACK_D))          # centro da plataforma (fixo)
_ank = tuple(a + 10 * e for a, e in zip((0, -30, 52), HACK_E))
HACK_ANK2 = (_ank[1], _ank[2])
def hack_pose3(P):
    return dict(stance="stand", P=P, pitch=-42, head_pitch=10, arm=LR(60, 90, 150, -90),
                leg_L=perna_para_pe(P, (-13, HACK_ANK2[0], HACK_ANK2[1]), -1, az=8, foot_dir=HACK_E),
                leg_R=perna_para_pe(P, (13, HACK_ANK2[0], HACK_ANK2[1]), 1, az=8, foot_dir=HACK_E))
def eq_hack3(sc, b, k):
    c = addv(b.P, mul(b.U, 30), mul(b.Fw, -15))
    incline_pad(sc, c, b.U, w=20, h=42, t=4)
    for x in (-30, 30):
        sc.line3([(x, FLOOR, 66), addv((x, FLOOR, 66), mul(HACK_D, 200))], MACH_D, 6, depth_bias=1.0)
    sc.obox(HACK_PC, (1, 0, 0), HACK_E, HACK_D, 38, 26, 3, MACH, top=MACH_L)
    lo = addv(HACK_PC, mul(HACK_E, -26))
    sc.box(-36, 36, FLOOR, FLOOR + 5, lo[2] - 6, lo[2] + 44, MACH_D)
    sc.box(-4, 4, FLOOR + 5, HACK_PC[1] - 4, HACK_PC[2] - 4, HACK_PC[2] + 4, MACH, top=MACH_L)
    for s in (-1, 1):
        pad_bar(sc, addv(b.sh[s], (0, 10, -2)), axis=(0, 0, 1), length=18, r=5)
        handle(sc, b.hand[s], axis=(0, 0, 1), length=14)
    sc.sphere(addv(c, (40, -8, 0)), 13, MACH_D, depth_bias=1.2)
cena("Agachamento no Hack", "lado_frente", ["quadriceps"], hack_pose3((0, 34, 0)), hack_pose3((0, 8, 26)), eq_hack3, contract="A", arrow=None,
     leg_ik={"L": (-13, HACK_ANK2[0], HACK_ANK2[1]), "R": (13, HACK_ANK2[0], HACK_ANK2[1])})


# ── Puxada Alta na Polia (linha criada por ele no admin, sem GIF): puxada frontal pegada média pronada
from catalogo3d import eq_lat_pulldown
cena("Puxada Alta na Polia", "costas34", ["dorsal", "trapezio_medio", "biceps"],
     SEAT(arm=LR(168, 50, 168, 50)), SEAT(arm=LR(70, 130, 125, 60)), eq_lat_pulldown)


# Puxada Alta na Polia: mãos por IK com largura FIXA (barra de comprimento constante); barra desce até o peito alto,
# visível acima dos ombros por trás (ref. Mundo Boa Forma); cotovelos pra baixo/fora
def pux_pose(y, z):
    return SEAT(arm_L=dict(elev=0, az=0, hand=(-28, y, z), bend=(-1, -1, -0.3)), arm_R=dict(elev=0, az=0, hand=(28, y, z), bend=(1, -1, -0.3)))
cena("Puxada Alta na Polia", "costas34", ["dorsal", "trapezio_medio", "biceps"], pux_pose(106, 4), pux_pose(57, 12), eq_lat_pulldown)
