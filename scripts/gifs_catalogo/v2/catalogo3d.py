# -*- coding: utf-8 -*-
"""Cenas 3D dos exercícios (motor v2). Cada cena: câmera, músculos, poses A/B, equipamento.
Nomes/ids/dicas vêm de catalogo.py (E). Pose = dict numérico interpolado A→B (ease)."""
import math
from rig3d_lib import (FLOOR, MACH, MACH_D, MACH_L, MUTED, ACCENT, PAD, PAD_T, BENCH, BENCH_T,
                       addv, sub, mul, norm, cross, lerp, tower, bench, seat, incline_pad, lever, handle,
                       barbell, dumbbell, cable, pad_bar, frame_posts)

SCENES = {}

def cena(nome, cam, musc, A, B, equip=None, contract="B", hide=(), arrow="hand_R", fit_extra=None):
    SCENES[nome] = dict(cam=cam, musc=musc, A=A, B=B, equip=equip, contract=contract, hide=hide, arrow=arrow, fit_extra=fit_extra)

# ── poses base ────────────────────────────────────────────────────────────────
def STAND(**o):
    p = dict(stance="stand", P=(0, 36, 0), pitch=0, arm=dict(elev=8, az=0), leg=dict(elev=0, az=6, elev2=0, az2=6))
    p.update(o); return p
def SEAT(**o):
    p = dict(stance="seat", P=(0, 0, 0), pitch=0, arm=dict(elev=8, az=0), leg=dict(elev=80, az=12, elev2=0, az2=12))
    p.update(o); return p
def SUPINE(**o):  # deitado no banco (topo y=-2), cabeça em -z, pés no chão
    p = dict(stance="supine", P=(0, 5, 0), pitch=0, arm=dict(elev=90, az=20), leg=dict(elev=20, az=180, elev2=70, az2=180, foot_dir=(0, -0.3, 1)))
    p.update(o); return p
def PRONE(**o):
    p = dict(stance="prone", P=(0, 4, 0), pitch=0, arm=dict(elev=60, az=200, elev2=100, az2=200), leg=dict(elev=0, az=180, elev2=0, az2=180, foot_dir=(0, -0.4, 1)))
    p.update(o); return p
def BENT(**o):  # em pé, tronco inclinado (hinge)
    p = dict(stance="stand", P=(0, 30, -10), pitch=70, head_pitch=-30, arm=dict(elev=90, az=0), leg=dict(elev=-12, az=6, elev2=8, az2=6))
    p.update(o); return p

def LR(elev, az, elev2=None, az2=None):
    d = dict(elev=elev, az=az)
    if elev2 is not None: d["elev2"] = elev2
    if az2 is not None: d["az2"] = az2
    return d

# ── equipamentos reutilizáveis (recebem sc, body, k) ─────────────────────────
def eq_seat_back(angle=90):
    return lambda sc, b, k: seat(sc, back_angle=angle)
def eq_seat():
    return lambda sc, b, k: seat(sc)
def eq_bench():
    return lambda sc, b, k: bench(sc, cz=-22, length=100)

def eq_chest_press(sc, b, k):
    seat(sc, back_angle=95)
    tower(sc, k, x=-96, z=44, cable_to=[(0, 100, 40)])
    frame_posts(sc, xs=(-46, 46), z=40, h=98)
    for s in (-1, 1):
        lever(sc, (s*14, 96, 40), addv(b.hand[s], (0, 0, 2)))
        handle(sc, b.hand[s])

def eq_bench_machine(sc, b, k):  # supino deitado na máquina: alavancas laterais pivotadas perto da cabeça
    bench(sc, cz=-22, length=100)
    tower(sc, k, x=-96, z=-90, h=70, cable_to=[(0, 66, -90)])
    sc.box(-44, 44, 62, 68, -94, -86, MACH, top=MACH_L)
    for s in (-1, 1):
        sc.box(s*42 - 3, s*42 + 3, FLOOR, 66, -94, -86, MACH, top=MACH_L)
        lever(sc, (s*42, 64, -90), addv(b.hand[s], (0, 0, 0)))
        handle(sc, b.hand[s], axis=(1, 0, 0))

def eq_peck_deck(sc, b, k, rear=False):
    seat(sc, back_angle=None if rear else 92)
    if rear:
        incline_pad(sc, (0, 40, 27), (0, 1, 0), w=15, h=18, t=3.5)   # apoio de peito
        sc.box(-3, 3, FLOOR, 22, 24, 30, MACH, top=MACH_L)
    tower(sc, k, x=-96, z=44, cable_to=[(0, 100, 33)])
    frame_posts(sc, xs=(-48, 48), z=33, h=100)
    for s in (-1, 1):
        lever(sc, (s*14, 98, 33), addv(b.hand[s], (0, 8, 2)))
        handle(sc, b.hand[s])

def eq_lat_pulldown(sc, b, k):
    seat(sc)
    pad_bar(sc, addv(b.knee[1], (-13, 10, 0)), axis=(1, 0, 0), length=44, r=4)   # apoio de joelhos
    tower(sc, k, x=-96, z=60, h=118, cable_to=[(0, 118, 60), (0, 118, 6), addv(lerpv3(b.hand[-1], b.hand[1], 0.5), (0, 2, 0))])
    sc.box(-100, 6, 116, 121, 56, 64, MACH, top=MACH_L)
    barbar(sc, b)

def lerpv3(a, b, k): return tuple(lerp(x, y, k) for x, y in zip(a, b))
def barbar(sc, b):  # barra reta entre as mãos
    sc.capsule(addv(b.hand[-1], (-8, 0, 0)), addv(b.hand[1], (8, 0, 0)), 2.2, ACCENT, outline=(120, 90, 0), depth_bias=-0.4)

def eq_row_machine(sc, b, k):
    seat(sc)
    incline_pad(sc, (0, 38, 24), (0, 1, 0), w=15, h=17, t=3.5)
    sc.box(-3, 3, FLOOR, 22, 21, 27, MACH, top=MACH_L)
    tower(sc, k, x=-96, z=70, cable_to=[(0, 100, 66)])
    frame_posts(sc, xs=(-46, 46), z=66, h=98)
    for s in (-1, 1):
        lever(sc, (s*30, 96, 66), addv(b.hand[s], (0, 0, 2)))
        handle(sc, b.hand[s])

def eq_cable_row(sc, b, k):
    bench(sc, cz=-6, length=70, y=-8, post=False)
    sc.box(-20, 20, FLOOR, -16, -36, 30, MACH_D)
    sc.box(-16, 16, FLOOR, 12, 52, 56, MACH, top=MACH_L)   # apoio de pés
    tower(sc, k, x=-96, z=80, h=90, cable_to=[(0, 8, 58), lerpv3(b.hand[-1], b.hand[1], 0.5)])
    handle(sc, lerpv3(b.hand[-1], b.hand[1], 0.5), axis=(1, 0, 0), length=26)

def eq_tbar(sc, b, k):
    incline_pad(sc, (0, 30, 26), (0, 0.85, 0.53), w=15, h=30, t=4)
    sc.box(-4, 4, FLOOR, 14, 30, 36, MACH, top=MACH_L)
    pivot = (0, FLOOR + 3, 60)
    mid = lerpv3(b.hand[-1], b.hand[1], 0.5)
    lever(sc, pivot, mid, width=6)
    sc.sphere(addv(mid, (0, -6, 4)), 9, MACH_D, depth_bias=-0.4)
    handle(sc, mid, axis=(1, 0, 0), length=34)

def eq_high_row(sc, b, k):
    seat(sc, back_angle=92)
    tower(sc, k, x=-96, z=60, h=112, cable_to=[(0, 110, 56)])
    frame_posts(sc, xs=(-46, 46), z=56, h=110)
    for s in (-1, 1):
        lever(sc, (s*20, 108, 56), addv(b.hand[s], (0, 0, 2)))
        handle(sc, b.hand[s])

def eq_pullup(sc, b, k):
    y = b.hand[1][1]
    sc.box(-70, 70, y - 1, y + 3, -3, 3, MACH_L)
    for x in (-66, 66):
        sc.box(x-3, x+3, FLOOR, y + 3, -3, 3, MACH, top=MACH_L)

def eq_dip(sc, b, k):
    y = b.hand[1][1] - 4
    for s in (-1, 1):
        sc.box(s*24 - 2, s*24 + 2, y, y + 4, -30, 30, MACH_L)
        sc.box(s*24 - 3, s*24 + 3, FLOOR, y, -4, 4, MACH, top=MACH_L)

def eq_barbell(plate=12):
    return lambda sc, b, k: barbell(sc, b.hand[-1], b.hand[1], plate_r=plate)
def eq_dumbbells(axis=(1, 0, 0)):
    return lambda sc, b, k: [dumbbell(sc, b.hand[s], axis=axis) for s in (-1, 1)]
def eq_dumbbell_R(axis=(1, 0, 0)):
    return lambda sc, b, k: dumbbell(sc, b.hand[1], axis=axis)

def eq_cable_low(x=-96, z=-40, hands=("R",), rope=False):
    def f(sc, b, k):
        top = tower(sc, k, x=x, z=z, h=100)
        for hnd in hands:
            s = 1 if hnd == "R" else -1
            cable(sc, [(x, FLOOR + 6, z), b.hand[s]])
            if rope:
                sc.capsule(b.hand[s], addv(b.hand[s], (0, -14, 4)), 2.4, ACCENT, outline=None, depth_bias=-0.4)
            else:
                handle(sc, b.hand[s], axis=(1, 0, 0), length=14)
    return f

def eq_cable_high(x=-96, z=60, y=100, hands=("L", "R"), rope=False, bar=False):
    def f(sc, b, k):
        tower(sc, k, x=x, z=z, h=y)
        for hnd in hands:
            s = 1 if hnd == "R" else -1
            cable(sc, [(x, y, z), (0, y, z), b.hand[s]])
        if bar:
            barbar(sc, b)
        elif rope:
            for hnd in hands:
                s = 1 if hnd == "R" else -1
                sc.capsule(b.hand[s], addv(b.hand[s], (s*5, -14, 0)), 2.4, ACCENT, outline=None, depth_bias=-0.4)
        else:
            for hnd in hands:
                s = 1 if hnd == "R" else -1
                handle(sc, b.hand[s], axis=(1, 0, 0), length=14)
    return f

def eq_leg_ext(sc, b, k):
    seat(sc, back_angle=95)
    tower(sc, k, x=-96, z=50, cable_to=[(0, 40, 50)])
    for s in (-1, 1):
        lever(sc, b.knee[s], addv(b.ankle[s], (0, 0, 0)), width=4)
    pad_bar(sc, lerpv3(b.ankle[-1], b.ankle[1], 0.5), axis=(1, 0, 0), length=40, r=5.5)

def eq_leg_curl_seat(sc, b, k):
    seat(sc, back_angle=100)
    pad_bar(sc, addv(lerpv3(b.knee[-1], b.knee[1], 0.5), (0, 10, 0)), axis=(1, 0, 0), length=40, r=4.5)
    tower(sc, k, x=-96, z=50, cable_to=[(0, 40, 50)])
    for s in (-1, 1):
        lever(sc, b.knee[s], b.ankle[s], width=4)
    pad_bar(sc, lerpv3(b.ankle[-1], b.ankle[1], 0.5), axis=(1, 0, 0), length=40, r=5.5)

def eq_leg_curl_prone(sc, b, k):
    bench(sc, cz=-14, length=110, y=-2)
    tower(sc, k, x=-96, z=90, h=60, cable_to=[(0, 40, 90)])
    for s in (-1, 1):
        lever(sc, b.knee[s], b.ankle[s], width=4)
    pad_bar(sc, lerpv3(b.ankle[-1], b.ankle[1], 0.5), axis=(1, 0, 0), length=40, r=5.5)

def eq_leg_press(sc, b, k):
    seat(sc, y=-10, back_angle=125, cz=-10)
    a = lerpv3(b.ankle[-1], b.ankle[1], 0.5)
    u = norm((0, 0.8, 0.6))
    sc.obox(addv(a, mul(u, 4)), (1, 0, 0), norm(cross(u, (1, 0, 0))), u, 30, 26, 3, MACH, top=MACH_L)
    sc.line3([(0, FLOOR, 30), addv(a, mul(u, 30))], MACH_D, 6, depth_bias=0.5)
    sc.sphere(addv(a, mul(u, 6), (34, 0, 0)), 14, MACH_D, depth_bias=-0.4)

def eq_hack(sc, b, k):
    incline_pad(sc, addv(b.P, (0, 40, -12)), (0, 0.9, -0.44), w=20, h=44, t=4)
    sc.box(-40, 40, FLOOR, FLOOR + 6, 10, 60, MACH_D)
    sc.box(-40, 40, FLOOR + 6, FLOOR + 10, 30, 62, MACH, top=MACH_L)
    for s in (-1, 1):
        pad_bar(sc, addv(b.sh[s], (0, 10, -2)), axis=(0, 0, 1), length=18, r=5)

def eq_calf_seat(sc, b, k):
    seat(sc)
    pad_bar(sc, addv(lerpv3(b.knee[-1], b.knee[1], 0.5), (0, 11, -4)), axis=(1, 0, 0), length=44, r=5.5)
    sc.box(-24, 24, FLOOR, FLOOR + 8, 36, 52, MACH, top=MACH_L)   # step nas pontas dos pés
    tower(sc, k, x=-96, z=60, h=70)

def eq_step(sc, b, k):
    sc.box(-24, 24, FLOOR, FLOOR + 8, 4, 22, MACH, top=MACH_L)

def eq_calf_stand(sc, b, k):
    sc.box(-24, 24, FLOOR, FLOOR + 8, 4, 22, MACH, top=MACH_L)
    tower(sc, k, x=-96, z=-30, h=120)
    for s in (-1, 1):
        pad_bar(sc, addv(b.sh[s], (0, 10, -2)), axis=(0, 0, 1), length=18, r=5)
    frame_posts(sc, xs=(-46, 46), z=-26, h=124)

def eq_preacher(sc, b, k, machine=False):
    seat(sc)
    c = addv(lerpv3(b.sh[-1], b.sh[1], 0.5), (0, -8, 20))
    incline_pad(sc, c, (0, 0.72, 0.7), w=22, h=16, t=4)
    sc.box(-3, 3, FLOOR, c[1] - 10, 18, 24, MACH, top=MACH_L)
    if machine:
        tower(sc, k, x=-96, z=60, h=90)
        for s in (-1, 1):
            lever(sc, (s*22, 10, 54), b.hand[s], width=4)
            handle(sc, b.hand[s], axis=(1, 0, 0), length=14)

def eq_abs_machine(sc, b, k):
    seat(sc, back_angle=95)
    tower(sc, k, x=-96, z=-40, h=110, cable_to=[(0, 108, -36)])
    for s in (-1, 1):
        lever(sc, (s*14, 106, -36), addv(b.hand[s], (0, 6, 0)), width=5)
    pad_bar(sc, lerpv3(b.hand[-1], b.hand[1], 0.5), axis=(1, 0, 0), length=46, r=5)

def eq_mat(sc, b, k):
    sc.box(-30, 30, FLOOR, FLOOR + 2, -60, 60, (36, 36, 36), top=(44, 44, 44))

def eq_roman(sc, b, k):
    incline_pad(sc, (0, -2, -6), (0, 0.6, 0.8), w=16, h=20, t=5)
    sc.box(-4, 4, FLOOR, -12, -8, -2, MACH, top=MACH_L)
    pad_bar(sc, lerpv3(b.ankle[-1], b.ankle[1], 0.5), axis=(1, 0, 0), length=40, r=5)
    sc.box(-20, 20, FLOOR, FLOOR + 6, -66, -46, MACH, top=MACH_L)

def eq_nordic(sc, b, k):
    sc.box(-30, 30, FLOOR, FLOOR + 3, -50, 30, (36, 36, 36), top=(44, 44, 44))
    pad_bar(sc, addv(lerpv3(b.ankle[-1], b.ankle[1], 0.5), (0, 6, 0)), axis=(1, 0, 0), length=40, r=4.5)

def eq_treadmill(sc, b, k):
    sc.box(-24, 24, FLOOR, FLOOR + 5, -70, 70, (36, 36, 36), top=(50, 50, 50))
    sc.box(-24, 24, FLOOR + 5, 64, 66, 72, MACH, top=MACH_L)
    sc.box(-26, 26, 60, 70, 60, 74, MACH_D)

def eq_hand_rest(sc, b, k):
    p = lerpv3(b.hand[-1], b.hand[1], 0.5)
    sc.box(p[0]-20, p[0]+20, p[1]-2, p[1]+2, p[2]-2, p[2]+2, MACH_L)
    sc.box(-3, 3, FLOOR, p[1]-2, p[2]-3, p[2]+3, MACH, top=MACH_L)

def eq_shrug(sc, b, k):
    for s in (-1, 1):
        dumbbell(sc, b.hand[s], axis=(0, 0, 1))

def eq_bulgarian(sc, b, k):
    bench(sc, cz=-46, length=60, y=-4)
    for s in (-1, 1):
        dumbbell(sc, b.hand[s], axis=(0, 0, 1))

def eq_hip_thrust(sc, b, k):
    bench(sc, cz=-52, length=56, y=-2)
    barbell(sc, addv(b.P, (-24, 12, 2)), addv(b.P, (24, 12, 2)), plate_r=16, extra=20)

def eq_bench_row(sc, b, k):
    bench(sc, cx=34, cz=0, length=90, y=-2)
    dumbbell(sc, b.hand[1], axis=(1, 0, 0))

def eq_kickback(sc, b, k):
    tower(sc, k, x=-96, z=-60, h=100)
    cable(sc, [(-96, FLOOR + 6, -60), b.ankle[1]])
    pad_bar(sc, b.ankle[1], axis=(1, 0, 0), length=14, r=3.5)
    eq_hand_rest(sc, b, k)

# ═════════════════════════════════════════════════════════════════════════════
# PEITORAL (câmera frente 3/4 pra ver o peito; supino: alto lateral)
cena("Supino Reto na Máquina Deitado", "supino", ["peitoral", "triceps", "deltoide_ant"],
     SUPINE(arm=LR(90, 78, 90, 0)), SUPINE(arm=LR(90, 22, 90, 10)), eq_bench_machine)
cena("Supino Reto na Máquina Sentado", "frente34", ["peitoral", "triceps"],
     SEAT(arm=LR(90, 70, 90, 0)), SEAT(arm=LR(90, 8, 90, 4)), eq_chest_press)
cena("Supino Declinado na Máquina", "supino", ["peitoral", "triceps"],
     SUPINE(P=(0, 5, 0), pitch=-15, arm=LR(90, 78, 90, 0)), SUPINE(P=(0, 5, 0), pitch=-15, arm=LR(90, 22, 90, 10)), eq_bench_machine)
cena("Supino Inclinado", "supino", ["peitoral", "deltoide_ant"],
     SUPINE(P=(0, 8, 0), pitch=35, arm=LR(90, 78, 90, 0)), SUPINE(P=(0, 8, 0), pitch=35, arm=LR(90, 22, 90, 10)),
     lambda sc, b, k: (seat(sc, y=-2, back_angle=125, cz=-4), barbell(sc, b.hand[-1], b.hand[1], plate_r=13)))
cena("Supino Reto com Halteres", "supino", ["peitoral", "triceps"],
     SUPINE(arm=LR(90, 80, 90, 0)), SUPINE(arm=LR(90, 16, 90, 6)),
     lambda sc, b, k: (bench(sc, cz=-22, length=100), [dumbbell(sc, b.hand[s]) for s in (-1, 1)]))
cena("Supino Reto com Barra", "supino", ["peitoral", "triceps"],
     SUPINE(arm=LR(90, 76, 90, 0)), SUPINE(arm=LR(90, 20, 90, 6)),
     lambda sc, b, k: (bench(sc, cz=-22, length=100), barbell(sc, b.hand[-1], b.hand[1], plate_r=13)))
cena("Crucifixo com Halteres", "supino", ["peitoral"],
     SUPINE(arm=LR(90, 95, 90, 60)), SUPINE(arm=LR(90, 12, 90, 4)),
     lambda sc, b, k: (bench(sc, cz=-22, length=100), [dumbbell(sc, b.hand[s], axis=(0, 0, 1)) for s in (-1, 1)]))
cena("Crucifixo na Máquina", "frente34", ["peitoral"],
     SEAT(arm=LR(90, 100, 90, 60)), SEAT(arm=LR(90, 12, 90, 8)), lambda sc, b, k: eq_peck_deck(sc, b, k, rear=False))
cena("Cross-over na Polia", "frente34", ["peitoral"],
     STAND(pitch=15, arm=LR(120, 95, 110, 70)), STAND(pitch=15, arm=LR(60, 10, 55, 5)),
     lambda sc, b, k: (tower(sc, k, x=-100, z=-70, h=120), tower(sc, k, x=100, z=-70, h=120),
                       cable(sc, [(-100, 120, -70), b.hand[-1]]), cable(sc, [(100, 120, -70), b.hand[1]]),
                       handle(sc, b.hand[-1]), handle(sc, b.hand[1])))
cena("Flexão de Braço", "lado_frente", ["peitoral", "triceps"],
     dict(stance="prone", P=(0, -12, 0), pitch=-8, arm=LR(80, 30, 5, 0), leg=dict(elev=0, az=6, elev2=0, az2=6, foot_dir=(0, -1, 0.2))),
     dict(stance="prone", P=(0, 4, 0), pitch=-8, arm=LR(92, 6, 92, 4), leg=dict(elev=0, az=6, elev2=0, az2=6, foot_dir=(0, -1, 0.2))),
     eq_mat, contract="B")

# COSTAS (câmera costas 3/4 aprovada)
cena("Remada Fechada na Máquina", "costas34", ["dorsal", "romboides"],
     SEAT(arm=LR(88, 2, 88, 2)), SEAT(arm=LR(30, 175, 88, 2)), eq_row_machine)
cena("Remada Aberta na Máquina", "costas34", ["trapezio_medio", "romboides", "deltoide_post"],
     SEAT(arm=LR(90, 8, 90, 8)), SEAT(arm=LR(90, 120, 90, 60)), eq_row_machine)
cena("Remada na Polia Sentado", "costas34", ["dorsal", "romboides"],
     dict(stance="seat", P=(0, -6, -6), pitch=12, arm=LR(85, 2, 85, 2), leg=dict(elev=70, az=8, elev2=60, az2=8)),
     dict(stance="seat", P=(0, -6, -6), pitch=0, arm=LR(25, 178, 86, 2), leg=dict(elev=70, az=8, elev2=60, az2=8)), eq_cable_row)
cena("Remada Cavalinho na Máquina", "costas34", ["dorsal", "trapezio_medio"],
     BENT(pitch=48, head_pitch=-20, arm=LR(60, 0, 60, 0)), BENT(pitch=48, head_pitch=-20, arm=LR(20, 160, 70, 20)), eq_tbar)
cena("High Row", "costas34", ["dorsal", "trapezio_medio"],
     SEAT(arm=LR(140, 10, 140, 10)), SEAT(arm=LR(40, 170, 90, 30)), eq_high_row)
cena("Puxada Fechada Frontal", "costas34", ["dorsal"],
     SEAT(arm=LR(170, 30, 170, 30)), SEAT(arm=LR(60, 150, 120, 50)), eq_lat_pulldown)
cena("Puxada Fechada Supinada", "costas34", ["dorsal", "biceps"],
     SEAT(arm=LR(170, 15, 170, 15)), SEAT(arm=LR(45, 160, 115, 30)), eq_lat_pulldown)
cena("Puxada Aberta Frontal", "costas34", ["dorsal", "trapezio_medio"],
     SEAT(arm=LR(165, 70, 165, 70)), SEAT(arm=LR(80, 100, 130, 80)), eq_lat_pulldown)
cena("Barra Fixa", "costas34", ["dorsal", "biceps"],
     dict(stance="stand", P=(0, 20, 0), arm=dict(elev=178, az=60, hand=None), leg=dict(elev=-10, az=6, elev2=30, az2=186)),
     dict(stance="stand", P=(0, 70, 0), arm=dict(elev=178, az=60, hand=None), leg=dict(elev=-10, az=6, elev2=30, az2=186)),
     eq_pullup, contract="B")
cena("Remada Curvada com Barra", "costas34", ["dorsal", "romboides", "trapezio_medio"],
     BENT(pitch=55, arm=LR(70, 2, 70, 2)), BENT(pitch=55, arm=LR(20, 165, 80, 20)), eq_barbell(14))
cena("Remada Unilateral com Halter", "costas34", ["dorsal", "romboides"],
     BENT(pitch=65, arm_R=LR(70, 4, 70, 4), arm_L=LR(88, 20, 88, 20)), BENT(pitch=65, arm_R=LR(15, 170, 80, 30), arm_L=LR(88, 20, 88, 20)),
     eq_bench_row)
cena("Pulldown com Braços Estendidos", "lado_costas", ["dorsal"],
     STAND(pitch=15, arm=LR(150, 10)), STAND(pitch=15, arm=LR(20, 10)), eq_cable_high(x=-96, z=90, y=118, bar=True), contract="B")
cena("Hiperextensão Lombar", "lado_costas", ["lombar", "gluteo"],
     dict(stance="stand", P=(0, 0, 0), pitch=95, head_pitch=-20, arm=LR(120, 0, 30, 40), leg=dict(elev=-45, az=6, elev2=-40, az2=6)),
     dict(stance="stand", P=(0, 0, 0), pitch=42, head_pitch=-20, arm=LR(120, 0, 30, 40), leg=dict(elev=-45, az=6, elev2=-40, az2=6)),
     eq_roman, contract="B")
cena("Levantamento Terra", "lado_frente", ["posterior", "gluteo", "lombar", "quadriceps"],
     dict(stance="stand", P=(0, 12, -30), pitch=55, head_pitch=-25, arm=LR(85, 0, 85, 0), leg=dict(elev=50, az=8, elev2=15, az2=8)),
     STAND(arm=LR(4, 0)), eq_barbell(18), contract="B")
cena("Encolhimento com Halteres", "frente34", ["trapezio_sup"],
     STAND(arm=LR(6, 30), shrug=0), STAND(arm=LR(6, 30), shrug=9), eq_shrug)

# OMBRO
cena("Crucifixo Invertido Sentado", "costas34", ["deltoide_post", "trapezio_medio", "romboides"],
     SEAT(arm=LR(90, 42, 90, -14)), SEAT(arm=LR(90, 96, 90, 96)), lambda sc, b, k: eq_peck_deck(sc, b, k, rear=True))
cena("Desenvolvimento na Máquina", "frente34", ["deltoide_ant", "deltoide_lat", "triceps"],
     SEAT(arm=LR(90, 80, 175, 80)), SEAT(arm=LR(165, 60, 175, 60)),
     lambda sc, b, k: (seat(sc, back_angle=92), tower(sc, k, x=-96, z=-40, h=120, cable_to=[(0, 118, -36)]),
                       [lever(sc, (s*30, 116, -36), addv(b.hand[s], (0, 0, -2))) for s in (-1, 1)],
                       [handle(sc, b.hand[s]) for s in (-1, 1)]))
cena("Elevação Frontal na Polia", "lado_frente", ["deltoide_ant"],
     STAND(arm=LR(10, 0)), STAND(arm=LR(95, 0)), eq_cable_low(x=-96, z=-70, hands=("R", "L")))
cena("Elevação Lateral com Halteres", "frente34", ["deltoide_lat"],
     STAND(arm=LR(8, 60)), STAND(arm=LR(92, 80)), eq_dumbbells(axis=(0, 0, 1)))
cena("Elevação Lateral na Polia", "frente34", ["deltoide_lat"],
     STAND(arm_R=LR(8, 60), arm_L=LR(6, 0)), STAND(arm_R=LR(92, 82), arm_L=LR(6, 0)), eq_cable_low(x=-96, z=-30, hands=("R",)))
cena("Elevação Lateral na Máquina", "frente34", ["deltoide_lat"],
     SEAT(arm=LR(8, 60, 90, 20)), SEAT(arm=LR(90, 85, 90, 20)),
     lambda sc, b, k: (seat(sc, back_angle=92), tower(sc, k, x=-96, z=-40, h=110),
                       [lever(sc, (0, 60, -10), addv(b.elbow[s], (0, 0, 0)), width=4) for s in (-1, 1)],
                       [pad_bar(sc, addv(b.elbow[s], (0, 0, 6)), axis=(0, 0, 1), length=16, r=4.5) for s in (-1, 1)]))
cena("Crucifixo Invertido", "costas34", ["deltoide_post", "trapezio_medio"],
     BENT(pitch=70, arm=LR(75, 8, 75, 8)), BENT(pitch=70, arm=LR(90, 95, 90, 95)), eq_dumbbells(axis=(0, 0, 1)))
cena("Desenvolvimento Arnold", "frente34", ["deltoide_ant", "deltoide_lat"],
     SEAT(arm=LR(80, 20, 160, 20)), SEAT(arm=LR(165, 60, 175, 60)), lambda sc, b, k: (seat(sc, back_angle=92), [dumbbell(sc, b.hand[s]) for s in (-1, 1)]))
cena("Desenvolvimento com Halteres", "frente34", ["deltoide_ant", "deltoide_lat", "triceps"],
     SEAT(arm=LR(90, 80, 175, 80)), SEAT(arm=LR(165, 60, 175, 60)), lambda sc, b, k: (seat(sc, back_angle=92), [dumbbell(sc, b.hand[s]) for s in (-1, 1)]))
cena("Face Pull na Polia", "lado_frente", ["deltoide_post", "trapezio_medio"],
     STAND(arm=LR(95, 0, 95, 0)), STAND(arm=LR(95, 80, 140, 60)), eq_cable_high(x=-96, z=90, y=80, rope=True))
cena("Elevação Frontal com Halteres", "lado_frente", ["deltoide_ant"],
     STAND(arm=LR(8, 0)), STAND(arm=LR(95, 0)), eq_dumbbells())

# BÍCEPS
cena("Rosca Alternada na Máquina", "frente34", ["biceps"],
     SEAT(arm=LR(45, 0, 45, 0)), SEAT(arm=LR(45, 0, 165, 0)), lambda sc, b, k: eq_preacher(sc, b, k, machine=True))
cena("Rosca Alternada no Banco Inclinado", "lado_frente", ["biceps"],
     SEAT(pitch=-35, arm=LR(-15, 0, -15, 0)), SEAT(pitch=-35, arm=LR(-15, 0, 110, 0)),
     lambda sc, b, k: (seat(sc, back_angle=125), [dumbbell(sc, b.hand[s]) for s in (-1, 1)]))
cena("Rosca Scott com Halteres", "frente34", ["biceps"],
     SEAT(arm=LR(45, 0, 40, 0)), SEAT(arm=LR(45, 0, 160, 0)), lambda sc, b, k: (eq_preacher(sc, b, k), [dumbbell(sc, b.hand[s]) for s in (-1, 1)]))
cena("Rosca Scott na máquina", "frente34", ["biceps"],
     SEAT(arm=LR(45, 0, 40, 0)), SEAT(arm=LR(45, 0, 160, 0)), lambda sc, b, k: eq_preacher(sc, b, k, machine=True))
cena("Rosca Martelo na Polia", "lado_frente", ["biceps", "antebraco"],
     STAND(arm=LR(10, 0, 10, 0)), STAND(arm=LR(10, 0, 140, 0)), eq_cable_low(x=-96, z=70, hands=("R", "L"), rope=True))
cena("Rosca Punho com Halter Apoiado", "lado_frente", ["antebraco"],
     SEAT(pitch=25, arm_R=LR(70, 10, 88, 0), arm_L=LR(60, 20, 90, 10)), SEAT(pitch=25, arm_R=LR(70, 10, 100, 0), arm_L=LR(60, 20, 90, 10)), eq_dumbbell_R())
cena("Rosca Direta com Barra", "frente34", ["biceps"],
     STAND(arm=LR(8, 0, 8, 0)), STAND(arm=LR(15, 0, 140, 0)), eq_barbell(9))
cena("Rosca Martelo com Halteres", "frente34", ["biceps", "antebraco"],
     STAND(arm=LR(8, 0, 8, 0)), STAND(arm=LR(15, 0, 140, 0)), eq_dumbbells(axis=(0, 0, 1)))
cena("Rosca Concentrada", "lado_frente", ["biceps"],
     SEAT(pitch=30, arm_R=LR(60, 0, 60, 0), arm_L=LR(55, 20, 90, 10)), SEAT(pitch=30, arm_R=LR(60, 0, 170, 0), arm_L=LR(55, 20, 90, 10)), eq_dumbbell_R())

# TRÍCEPS
cena("Mergulho (Tríceps)", "frente34", ["triceps", "peitoral"],
     dict(stance="stand", P=(0, 36, 0), pitch=8, arm=dict(elev=8, az=180, hand=None), leg=dict(elev=-15, az=6, elev2=70, az2=186)),
     dict(stance="stand", P=(0, 12, 6), pitch=12, arm=dict(elev=8, az=180, hand=None), leg=dict(elev=-15, az=6, elev2=70, az2=186)),
     eq_dip, contract="A")
cena("Tríceps Francês Unilateral na Polia Baixa", "lado_frente", ["triceps"],
     STAND(arm_R=LR(170, 20, 60, 190), arm_L=LR(6, 0)), STAND(arm_R=LR(170, 20, 175, 20), arm_L=LR(6, 0)), eq_cable_low(x=-96, z=-70, hands=("R",)))
cena("Tríceps Pulley", "lado_frente", ["triceps"],
     STAND(pitch=12, arm=LR(10, 0, 90, 0)), STAND(pitch=12, arm=LR(10, 0, 10, 0)), eq_cable_high(x=-96, z=90, y=118, bar=True))
cena("Tríceps Testa", "supino", ["triceps"],
     SUPINE(arm=LR(100, 0, 20, 190)), SUPINE(arm=LR(100, 0, 100, 0)), lambda sc, b, k: (bench(sc, cz=-22, length=100), barbell(sc, b.hand[-1], b.hand[1], plate_r=9, extra=18)))
cena("Tríceps Corda na Polia", "lado_frente", ["triceps"],
     STAND(pitch=12, arm=LR(10, 0, 90, 0)), STAND(pitch=12, arm=LR(10, 0, 5, 20)), eq_cable_high(x=-96, z=90, y=118, rope=True))
cena("Tríceps Francês com Halter", "lado_frente", ["triceps"],
     SEAT(arm=LR(170, 15, 60, 190)), SEAT(arm=LR(170, 15, 178, 15)),
     lambda sc, b, k: (seat(sc, back_angle=92), dumbbell(sc, lerpv3(b.hand[-1], b.hand[1], 0.5), axis=(1, 0, 0), r=8)))
cena("Tríceps Coice com Halter", "lado_frente", ["triceps"],
     BENT(pitch=60, arm_R=LR(15, 180, 90, 0), arm_L=LR(90, 20, 90, 20)), BENT(pitch=60, arm_R=LR(15, 180, 15, 180), arm_L=LR(90, 20, 90, 20)), eq_dumbbell_R())

# QUADRÍCEPS / GLÚTEO
cena("Afundo com Halteres", "lado_frente", ["quadriceps", "gluteo"],
     STAND(arm=LR(6, 0)),
     dict(stance="stand", P=(0, 12, 0), pitch=5, arm=LR(6, 0), leg_R=dict(elev=62, az=6, elev2=-4, az2=6), leg_L=dict(elev=-40, az=6, elev2=-125, az2=6, foot=90)),
     eq_dumbbells(axis=(0, 0, 1)), contract="A")
cena("Agachamento Livre", "lado_frente", ["quadriceps", "gluteo"],
     STAND(arm=dict(elev=110, az=90, elev2=175, az2=120)),
     dict(stance="stand", P=(0, 7, -33), pitch=35, head_pitch=-15, arm=dict(elev=110, az=90, elev2=175, az2=120), leg=dict(elev=70, az=10, elev2=-10, az2=10)),
     lambda sc, b, k: barbell(sc, addv(b.sh[-1], (-4, 6, -4)), addv(b.sh[1], (4, 6, -4)), plate_r=15), contract="A")
cena("Agachamento Sumô", "frente34", ["adutores", "gluteo", "quadriceps"],
     STAND(arm=LR(20, 0), leg=dict(elev=0, az=30, elev2=0, az2=30)),
     dict(stance="stand", P=(0, 8, -30), pitch=25, arm=LR(60, 0), leg=dict(elev=68, az=40, elev2=-8, az2=40)),
     lambda sc, b, k: dumbbell(sc, lerpv3(b.hand[-1], b.hand[1], 0.5), axis=(0, 1, 0), r=8), contract="A")
cena("Extensora", "lado_frente", ["quadriceps"],
     SEAT(arm=LR(60, 0, 100, 0), leg=dict(elev=90, az=10, elev2=0, az2=10)), SEAT(arm=LR(60, 0, 100, 0), leg=dict(elev=90, az=10, elev2=85, az2=10)), eq_leg_ext)
cena("Leg Press", "lado_frente", ["quadriceps", "gluteo"],
     dict(stance="seat", P=(0, -8, -10), pitch=-35, arm=LR(50, 0, 100, 0), leg=dict(elev=130, az=10, elev2=40, az2=10, foot_dir=(0, 0.6, 0.8))),
     dict(stance="seat", P=(0, -8, -10), pitch=-35, arm=LR(50, 0, 100, 0), leg=dict(elev=110, az=10, elev2=95, az2=10, foot_dir=(0, 0.6, 0.8))),
     eq_leg_press, contract="B")
cena("Agachamento Búlgaro", "lado_frente", ["quadriceps", "gluteo"],
     dict(stance="stand", P=(0, 30, 6), arm=LR(6, 0), leg_R=dict(elev=-15, az=6, elev2=0, az2=6), leg_L=dict(elev=-60, az=6, elev2=-160, az2=6, foot=90)),
     dict(stance="stand", P=(0, 8, -8), pitch=15, arm=LR(6, 0), leg_R=dict(elev=68, az=6, elev2=-6, az2=6), leg_L=dict(elev=-70, az=6, elev2=-165, az2=6, foot=90)),
     eq_bulgarian, contract="A")
cena("Agachamento no Hack", "lado_frente", ["quadriceps"],
     dict(stance="stand", P=(0, 34, 0), pitch=-22, arm=LR(110, 20, 170, 40), leg=dict(elev=-15, az=10, elev2=10, az2=10)),
     dict(stance="stand", P=(0, 8, -28), pitch=-22, arm=LR(110, 20, 170, 40), leg=dict(elev=68, az=10, elev2=-6, az2=10)),
     eq_hack, contract="A")

# POSTERIOR / GLÚTEO / PANTURRILHA
cena("Flexora de Perna Sentado", "lado_frente", ["posterior"],
     SEAT(arm=LR(60, 0, 100, 0), leg=dict(elev=90, az=10, elev2=85, az2=10)), SEAT(arm=LR(60, 0, 100, 0), leg=dict(elev=90, az=10, elev2=-10, az2=10)), eq_leg_curl_seat)
cena("Flexora Deitado", "lado_costas", ["posterior"],
     PRONE(leg=dict(elev=0, az=180, elev2=0, az2=180, foot_dir=(0, -0.4, 1))), PRONE(leg=dict(elev=0, az=180, elev2=105, az2=180, foot_dir=(0, 0.6, 0.8))), eq_leg_curl_prone)
cena("Flexora em Pé", "lado_costas", ["posterior"],
     STAND(pitch=10, arm=LR(60, 0, 80, 0), leg_R=dict(elev=0, az=6, elev2=0, az2=6), leg_L=dict(elev=0, az=6, elev2=0, az2=6)),
     STAND(pitch=10, arm=LR(60, 0, 80, 0), leg_R=dict(elev=-10, az=6, elev2=-110, az2=6, foot=90), leg_L=dict(elev=0, az=6, elev2=0, az2=6)),
     lambda sc, b, k: (tower(sc, k, x=-96, z=60, h=100), lever(sc, (0, -6, 20), b.ankle[1], width=4), pad_bar(sc, b.ankle[1], axis=(1, 0, 0), length=14, r=4), eq_hand_rest(sc, b, k)))
cena("Levantamento Terra Romeno (Stiff)", "lado_frente", ["posterior", "gluteo"],
     STAND(arm=LR(6, 0)), dict(stance="stand", P=(0, 26, -16), pitch=65, head_pitch=-25, arm=LR(75, 0, 75, 0), leg=dict(elev=-15, az=6, elev2=10, az2=6)),
     eq_barbell(14), contract="A")
cena("Elevação Pélvica", "lado_frente", ["gluteo", "posterior"],
     dict(stance="supine", P=(0, -36, 6), pitch=-30, arm=dict(elev=10, az=0), leg=dict(elev=35, az=180, elev2=95, az2=180, foot_dir=(0, -0.2, 1))),
     dict(stance="supine", P=(0, -8, 6), pitch=-8, arm=dict(elev=10, az=0), leg=dict(elev=10, az=180, elev2=80, az2=180, foot_dir=(0, -0.2, 1))),
     eq_hip_thrust, contract="B")
cena("Coice na Polia Baixa", "lado_costas", ["gluteo"],
     STAND(pitch=15, arm=LR(70, 0, 80, 0)), STAND(pitch=15, arm=LR(70, 0, 80, 0), leg_R=dict(elev=-45, az=6, elev2=-30, az2=6, foot=60)),
     eq_kickback, contract="B")
cena("Flexão Nórdica", "lado_frente", ["posterior"],
     dict(stance="kneel", P=(0, -6, -2), pitch=0, arm=LR(60, 0, 120, 0), leg=dict(elev=0, az=6, elev2=90, az2=186, foot=90)),
     dict(stance="kneel", P=(0, -24, 34), pitch=55, head_pitch=-10, arm=LR(60, 0, 120, 0), leg=dict(elev=-55, az=6, elev2=-35, az2=186, foot=90)),
     eq_nordic, contract="A")
cena("Abdutora", "frente34", ["abdutores", "gluteo"],
     SEAT(arm=LR(60, 0, 100, 10), leg=dict(elev=80, az=10, elev2=0, az2=10)), SEAT(arm=LR(60, 0, 100, 10), leg=dict(elev=80, az=40, elev2=0, az2=40)),
     lambda sc, b, k: (seat(sc, back_angle=95), tower(sc, k, x=-96, z=-40, h=90), [pad_bar(sc, addv(b.knee[s], (s*11, 0, 0)), axis=(0, 1, 0), length=22, r=4.5) for s in (-1, 1)]))
cena("Adutora", "frente34", ["adutores"],
     SEAT(arm=LR(60, 0, 100, 10), leg=dict(elev=80, az=40, elev2=0, az2=40)), SEAT(arm=LR(60, 0, 100, 10), leg=dict(elev=80, az=10, elev2=0, az2=10)),
     lambda sc, b, k: (seat(sc, back_angle=95), tower(sc, k, x=-96, z=-40, h=90), [pad_bar(sc, addv(b.knee[s], (-s*11, 0, 0)), axis=(0, 1, 0), length=22, r=4.5) for s in (-1, 1)]))
cena("Abdução de Quadril na Polia", "frente34", ["abdutores", "gluteo"],
     STAND(arm=LR(70, 0, 90, 0), leg_R=dict(elev=0, az=6, elev2=0, az2=6)), STAND(arm=LR(70, 0, 90, 0), leg_R=dict(elev=-40, az=90, elev2=-40, az2=90)),
     lambda sc, b, k: (tower(sc, k, x=-96, z=0, h=100), cable(sc, [(-96, FLOOR + 6, 0), b.ankle[1]]), pad_bar(sc, b.ankle[1], axis=(0, 0, 1), length=14, r=3.5), eq_hand_rest(sc, b, k)))
cena("Panturrilha na Máquina", "lado_frente", ["panturrilha"],
     SEAT(arm=LR(60, 0, 100, 0), leg=dict(elev=80, az=10, elev2=0, az2=10, foot=-20)), SEAT(P=(0, 4, 0), arm=LR(60, 0, 100, 0), leg=dict(elev=80, az=10, elev2=-8, az2=10, foot=35)), eq_calf_seat)
cena("Panturrilha no Step", "lado_frente", ["panturrilha"],
     STAND(P=(0, 40, 6), arm=LR(6, 0), leg=dict(elev=0, az=6, elev2=0, az2=6, foot=-25)), STAND(P=(0, 52, 6), arm=LR(6, 0), leg=dict(elev=0, az=6, elev2=0, az2=6, foot=35)), eq_step)
cena("Panturrilha em Pé na Máquina", "lado_frente", ["panturrilha"],
     STAND(P=(0, 40, 6), arm=LR(120, 20, 170, 40), leg=dict(elev=0, az=6, elev2=0, az2=6, foot=-25)), STAND(P=(0, 52, 6), arm=LR(120, 20, 170, 40), leg=dict(elev=0, az=6, elev2=0, az2=6, foot=35)), eq_calf_stand)

# ABDÔMEN / CARDIO
cena("Abdominais na Máquina", "lado_frente", ["abdomen"],
     SEAT(pitch=-5, arm=LR(120, 0, 175, 0)), SEAT(pitch=40, head_pitch=15, arm=LR(120, 0, 175, 0)), eq_abs_machine)
cena("Elevação de Pernas", "lado_frente", ["abdomen"],
     dict(stance="supine", P=(0, -44, 0), arm=LR(-6, 20), leg=dict(elev=0, az=6, elev2=0, az2=6, foot_dir=(0, 1, 0.2))),
     dict(stance="supine", P=(0, -44, 0), arm=LR(-6, 20), leg=dict(elev=88, az=6, elev2=0, az2=6, foot_dir=(0, 0.2, -1))),
     eq_mat, contract="B")
cena("Abdominal Supra no Solo", "lado_frente", ["abdomen"],
     dict(stance="supine", P=(0, -44, 0), arm=LR(150, 60, 160, 100), leg=dict(elev=35, az=8, elev2=-70, az2=8, foot_dir=(0, -0.3, 1))),
     dict(stance="supine", P=(0, -44, 0), pitch=-35, arm=LR(150, 60, 160, 100), leg=dict(elev=35, az=8, elev2=-70, az2=8, foot_dir=(0, -0.3, 1))),
     eq_mat, contract="B")
cena("Corrida", "lado_frente", ["quadriceps", "posterior", "panturrilha"],
     STAND(pitch=6, arm_R=LR(45, 0, 130, 0), arm_L=LR(35, 180, 100, 180), leg_R=dict(elev=40, az=6, elev2=-30, az2=6), leg_L=dict(elev=-35, az=6, elev2=-120, az2=6, foot=40)),
     STAND(pitch=6, arm_R=LR(35, 180, 100, 180), arm_L=LR(45, 0, 130, 0), leg_R=dict(elev=-35, az=6, elev2=-120, az2=6, foot=40), leg_L=dict(elev=40, az=6, elev2=-30, az2=6)),
     eq_treadmill, contract="B")
