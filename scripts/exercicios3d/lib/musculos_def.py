# Desenho dos músculos (anatomia v2.1, 03/10/2026): cada músculo é uma CURVA FECHADA (Catmull-Rom pelos pontos
# de controle) num "mapa" 2D da superfície do corpo, só do lado esquerdo (o direito é espelhado).
# Mapas:
#   "frente" / "costas": (xs, z) em metros — xs = |x| (distância do meio do corpo), z = altura (chão = 0).
#   "lado": (teta, z) — teta em graus em volta do tronco (0 = frente, 90 = lado, 180 = costas).
#   "braco" (Arm→ForeArm), "antebraco" (ForeArm→Hand), "coxa" (UpLeg→Leg), "perna" (Leg→Foot):
#       (ang, u) — ang em graus em volta do osso (0 frente, +90 fora, -90/270 dentro, 180 atrás),
#       u = fração do comprimento do osso (0 = articulação de cima, 1 = de baixo).
# camada: músculo por cima (1) ganha do de baixo (0) onde os dois cobrem; na mesma camada ganha o mais "fundo".
# fibra: ("par", graus) = fibras paralelas nessa direção do mapa (0 = horizontal/“u”, 90 = vertical);
#        ("leque", (a, b)) = fibras convergindo pro ponto (a, b) do mapa.
# Medidas do boneco atual (MACRO muscle 1.0 / weight 0.25, 1,72 m): quadril z=0,926 · umbigo ~1,06 ·
# xifoide ~1,25 · ombro (0,201; 1,37) · clavícula (0,064; 1,438) · pescoço 1,47 · joelho 0,505 · tornozelo 0,071.

# (nome, grupo, mapa, camada, ossos_do_portao, fibra, pontos)
PARTES = [
    # ── tronco: frente ────────────────────────────────────────────────────────────────────────────
    ("peitoral", "peitoral", "frente", 0, ("Spine1", "Spine2", "Shoulder", "Neck"), ("leque", (0.215, 1.35)),
     [(0.013, 1.418), (0.060, 1.430), (0.115, 1.430), (0.160, 1.415), (0.188, 1.390), (0.198, 1.355),
      (0.188, 1.318), (0.165, 1.285), (0.128, 1.262), (0.082, 1.250), (0.040, 1.252), (0.013, 1.262)]),
    ("reto_abd_3", "abdomen", "frente", 0, ("Spine", "Spine1", "Spine2"), ("par", 90),
     [(0.010, 1.192), (0.078, 1.190), (0.086, 1.222), (0.080, 1.246), (0.040, 1.250), (0.010, 1.252)]),
    ("reto_abd_2", "abdomen", "frente", 0, ("Spine", "Spine1", "Spine2"), ("par", 90),
     [(0.010, 1.126), (0.077, 1.124), (0.082, 1.155), (0.078, 1.186), (0.010, 1.188)]),
    ("reto_abd_1", "abdomen", "frente", 0, ("Hips", "Spine", "Spine1"), ("par", 90),
     [(0.010, 1.062), (0.074, 1.060), (0.079, 1.090), (0.076, 1.121), (0.010, 1.123)]),
    ("reto_abd_0", "abdomen", "frente", 0, ("Hips", "Spine", "Spine1"), ("par", 90),
     [(0.010, 0.915), (0.040, 0.912), (0.062, 0.950), (0.072, 1.010), (0.074, 1.056), (0.010, 1.058)]),
    ("esternocleido", "pescoco", "lado", 1, ("Neck", "Spine2"), ("par", 25),
     [(3, 1.448), (22, 1.440), (60, 1.478), (100, 1.532), (114, 1.562), (102, 1.574), (70, 1.530),
      (30, 1.482), (8, 1.464)]),
    # ── tronco: lado (teta, z) ──────────────────────────────────────────────────────────────────────
    ("obliquo", "obliquos", "lado", 0, ("Hips", "Spine", "Spine1", "Spine2"), ("par", 45),
     [(37, 1.232), (58, 1.238), (82, 1.212), (104, 1.170), (110, 1.060), (100, 1.000), (80, 0.985),
      (56, 0.955), (37, 0.925)]),
    # serrátil: tirado em 03/10 21:15 (com o relevo real virava riscos tortos do lado do tronco)
    # ── tronco: costas (xs, z) ─────────────────────────────────────────────────────────────────────
    ("trapezio_sup", "trapezio", "costas", 0, ("Neck", "Spine2", "Shoulder"), ("leque", (0.19, 1.43)),
     [(0.006, 1.600), (0.040, 1.586), (0.070, 1.505), (0.125, 1.462), (0.188, 1.440), (0.182, 1.418),
      (0.120, 1.412), (0.060, 1.424), (0.006, 1.432)]),
    ("trapezio_med", "trapezio", "costas", 0, ("Spine1", "Spine2", "Shoulder", "Neck"), ("leque", (0.17, 1.40)),
     [(0.006, 1.432), (0.060, 1.424), (0.120, 1.412), (0.150, 1.395), (0.115, 1.345), (0.075, 1.285),
      (0.040, 1.222), (0.006, 1.205)]),
    ("infraespinhal", "costas", "costas", 0, ("Spine2", "Shoulder", "Arm"), ("leque", (0.20, 1.37)),
     [(0.078, 1.382), (0.130, 1.398), (0.172, 1.402), (0.188, 1.365), (0.170, 1.318), (0.120, 1.292),
      (0.085, 1.300), (0.072, 1.345)]),
    ("redondo_maior", "costas", "costas", 0, ("Spine2", "Shoulder", "Arm"), ("leque", (0.21, 1.33)),
     [(0.120, 1.292), (0.170, 1.318), (0.198, 1.302), (0.186, 1.270), (0.135, 1.258)]),
    ("grande_dorsal", "dorsal", "costas", 0, ("Spine", "Spine1", "Spine2", "Shoulder"), ("leque", (0.21, 1.31)),
     [(0.075, 1.282), (0.135, 1.258), (0.186, 1.270), (0.205, 1.240), (0.180, 1.150), (0.152, 1.060),
      (0.125, 1.010), (0.062, 1.000), (0.038, 1.060), (0.038, 1.150), (0.052, 1.225)]),
    ("lombar", "lombar", "costas", 0, ("Hips", "Spine", "Spine1"), ("par", 90),
     [(0.010, 0.995), (0.050, 0.998), (0.056, 1.100), (0.046, 1.200), (0.030, 1.235), (0.010, 1.240)]),
    ("gluteo_max", "gluteo", "costas", 0, ("Hips", "UpLeg"), ("par", -38),
     [(0.012, 0.965), (0.050, 0.990), (0.100, 0.990), (0.145, 0.965), (0.168, 0.915), (0.165, 0.860),
      (0.140, 0.815), (0.095, 0.795), (0.045, 0.798), (0.014, 0.820)]),
    ("gluteo_med", "gluteo", "lado", 0, ("Hips", "UpLeg"), ("par", 70),
     [(108, 1.000), (125, 1.012), (150, 1.000), (148, 0.955), (128, 0.940), (110, 0.950)]),
    # ── braço (Arm→ForeArm) ────────────────────────────────────────────────────────────────────────
    ("deltoide_ant", "deltoide", "braco", 0, ("Arm", "Shoulder"), ("leque", (68, 0.47)),
     [(-40, -0.08), (-20, -0.20), (10, -0.25), (28, 0.05), (62, 0.44), (50, 0.47), (0, 0.30), (-35, 0.15),
      (-45, 0.04)]),
    ("deltoide_lat", "deltoide", "braco", 0, ("Arm", "Shoulder"), ("leque", (68, 0.47)),
     [(10, -0.25), (70, -0.27), (125, -0.22), (110, 0.10), (76, 0.47), (62, 0.44), (28, 0.05)]),
    ("deltoide_post", "deltoide", "braco", 0, ("Arm", "Shoulder"), ("leque", (68, 0.47)),
     [(125, -0.22), (175, -0.18), (210, -0.05), (185, 0.12), (95, 0.43), (76, 0.47), (110, 0.10)]),
    ("biceps", "biceps", "braco", 0, ("Arm",), ("par", 90),
     [(-55, 0.42), (-20, 0.34), (20, 0.38), (35, 0.60), (26, 0.85), (5, 0.95), (-25, 0.93), (-50, 0.78),
      (-62, 0.58)]),
    ("braquial", "biceps", "braco", 0, ("Arm", "ForeArm"), ("par", 90),
     [(35, 0.55), (62, 0.50), (80, 0.64), (74, 0.88), (46, 0.97), (26, 0.88)]),
    ("triceps_lat", "triceps", "braco", 0, ("Arm",), ("par", 90),
     [(95, 0.36), (130, 0.28), (165, 0.34), (165, 0.62), (140, 0.78), (110, 0.72), (88, 0.55)]),
    ("triceps_longo", "triceps", "braco", 0, ("Arm",), ("par", 90),
     [(165, 0.34), (200, 0.30), (235, 0.40), (240, 0.62), (215, 0.80), (175, 0.84), (165, 0.62)]),
    # ── antebraço (ForeArm→Hand) ───────────────────────────────────────────────────────────────────
    ("braquiorradial", "antebraco", "antebraco", 1, ("ForeArm", "Arm"), ("par", 90),
     [(0, -0.14), (40, -0.18), (82, -0.02), (78, 0.40), (55, 0.60), (25, 0.58), (2, 0.40), (-8, 0.05)]),
    ("extensores", "antebraco", "antebraco", 0, ("ForeArm",), ("par", 90),
     [(78, 0.00), (140, -0.04), (200, 0.02), (205, 0.45), (170, 0.66), (120, 0.68), (80, 0.55)]),
    ("flexores", "antebraco", "antebraco", 0, ("ForeArm",), ("par", 90),
     [(200, 0.02), (260, -0.06), (330, -0.04), (352, 0.10), (350, 0.50), (310, 0.66), (250, 0.68),
      (205, 0.45)]),
    # ── coxa (UpLeg→Leg) ──────────────────────────────────────────────────────────────────────────
    ("reto_femoral", "quadriceps", "coxa", 0, ("UpLeg",), ("par", 90),
     [(-5, 0.07), (8, 0.07), (24, 0.28), (22, 0.62), (8, 0.86), (-6, 0.86), (-20, 0.62), (-20, 0.28)]),
    ("vasto_lateral", "quadriceps", "coxa", 0, ("UpLeg",), ("par", 90),
     [(30, 0.24), (70, 0.16), (125, 0.20), (130, 0.55), (95, 0.85), (40, 0.94), (15, 0.88), (22, 0.62),
      (28, 0.36)]),
    ("vasto_medial", "quadriceps", "coxa", 0, ("UpLeg", "Leg"), ("par", 90),
     [(-20, 0.62), (-8, 0.88), (-25, 0.97), (-58, 0.94), (-78, 0.82), (-66, 0.66), (-42, 0.58)]),
    ("sartorio", "adutores", "coxa", 1, ("UpLeg",), ("par", 80),
     [(42, 0.02), (28, 0.02), (-6, 0.18), (-46, 0.42), (-82, 0.70), (-108, 0.95), (-94, 0.97), (-68, 0.70),
      (-32, 0.42), (6, 0.18)]),
    ("adutores", "adutores", "coxa", 0, ("UpLeg",), ("par", 80),
     [(-30, 0.05), (-60, 0.00), (-118, 0.05), (-128, 0.35), (-98, 0.64), (-70, 0.60), (-45, 0.35)]),
    ("tensor_fascia", "tensor", "coxa", 0, ("UpLeg", "Hips"), ("par", 90),
     [(40, -0.03), (75, -0.05), (98, 0.04), (84, 0.22), (58, 0.20)]),
    ("biceps_femoral", "posterior", "coxa", 0, ("UpLeg",), ("par", 90),
     [(118, 0.16), (160, 0.12), (182, 0.20), (180, 0.60), (160, 0.88), (130, 0.80), (115, 0.50)]),
    ("semitendinoso", "posterior", "coxa", 0, ("UpLeg",), ("par", 90),
     [(182, 0.20), (215, 0.14), (240, 0.24), (246, 0.55), (226, 0.88), (196, 0.86), (180, 0.60)]),
    # ── perna (Leg→Foot) ──────────────────────────────────────────────────────────────────────────
    ("gastro_lateral", "panturrilha", "perna", 1, ("Leg",), ("par", 90),
     [(116, 0.04), (150, 0.00), (186, 0.02), (192, 0.30), (186, 0.52), (160, 0.58), (134, 0.48), (116, 0.24)]),
    ("gastro_medial", "panturrilha", "perna", 1, ("Leg",), ("par", 90),
     [(174, 0.02), (215, 0.00), (246, 0.05), (256, 0.30), (240, 0.60), (212, 0.66), (182, 0.56), (172, 0.30)]),
    ("soleo_lat", "panturrilha", "perna", 0, ("Leg",), ("par", 90),
     [(100, 0.30), (124, 0.40), (146, 0.62), (140, 0.80), (112, 0.78), (98, 0.60)]),
    ("soleo_med", "panturrilha", "perna", 0, ("Leg",), ("par", 90),
     [(218, 0.66), (246, 0.48), (262, 0.40), (266, 0.62), (252, 0.82), (224, 0.82)]),
    ("tibial_ant", "tibial", "perna", 0, ("Leg",), ("par", 90),
     [(4, 0.06), (40, 0.04), (56, 0.30), (42, 0.70), (26, 0.80), (10, 0.56), (2, 0.25)]),
    ("fibulares", "tibial", "perna", 0, ("Leg",), ("par", 90),
     [(56, 0.06), (100, 0.08), (112, 0.40), (96, 0.70), (70, 0.76), (56, 0.30)]),
]

# mapas de membro: (osso de cima, osso de baixo, raio máximo do eixo)
MAPAS_MEMBRO = {   # raio máximo folgado: a panturrilha mais grossa passava de 0,11 m do eixo e virava "pele" (mancha)
    "braco": ("Arm", "ForeArm", 0.14),
    "antebraco": ("ForeArm", "Hand", 0.10),
    "coxa": ("UpLeg", "Leg", 0.18),
    "perna": ("Leg", "Foot", 0.16),
}
R_TRONCO = 0.14   # raio típico do tronco, só pra converter teta (graus) em metros no mapa "lado"
