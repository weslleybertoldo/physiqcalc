# -*- coding: utf-8 -*-
"""Motor v2 (aprovado 26/08): boneco 3D por ângulos, câmera 3/4 ortográfica com auto-enquadramento,
membros com volume/contorno, tronco em V, capa de deltoide, músculo alvo em vermelho, equipamentos.

Referencial do CORPO: P = pelve; U = cima do tronco; Fw = frente; R = lado s=+1.
Ângulos dos membros: elev (0 = ao longo de -U, 90 = horizontal, 180 = acima da cabeça) e
az (0 = para a frente Fw, 90 = para o lado do próprio membro, 180 = para trás).
"""
import math
from PIL import Image, ImageDraw, ImageFont

W, H, S = 600, 400, 2
BG = (13, 13, 13)
ACCENT = (255, 191, 0)
SKIN = (222, 222, 222); SKIN_SH = (170, 170, 170); OUTLINE = (40, 40, 40); LINE = (150, 150, 150)
SHORTS = (70, 70, 74); SHORTS_T = (88, 88, 92); SHORTS_S = (60, 60, 64); SHOE = (50, 50, 50); HAIR = (60, 50, 45)
MACH = (128, 128, 128); MACH_D = (78, 78, 78); MACH_L = (165, 165, 165); MUTED = (156, 163, 175)
BENCH = (48, 48, 48); BENCH_T = (60, 60, 60); PAD = (52, 52, 52); PAD_T = (66, 66, 66)
MUSC = (225, 60, 40)
FLOOR = -52

_FONTS = {}
def F(size, bold=False):
    key = (size, bold)
    if key not in _FONTS:
        p = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf" if bold else "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"
        _FONTS[key] = ImageFont.truetype(p, size * S)
    return _FONTS[key]

# ── álgebra ──────────────────────────────────────────────────────────────────
def sub(a, b): return (a[0]-b[0], a[1]-b[1], a[2]-b[2])
def addv(*vs):
    x = y = z = 0.0
    for v in vs: x += v[0]; y += v[1]; z += v[2]
    return (x, y, z)
def mul(a, k): return (a[0]*k, a[1]*k, a[2]*k)
def dot(a, b): return a[0]*b[0]+a[1]*b[1]+a[2]*b[2]
def cross(a, b): return (a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0])
def norm(a):
    l = math.sqrt(dot(a, a)) or 1e-9
    return (a[0]/l, a[1]/l, a[2]/l)
def lerp(a, b, k): return a + (b - a) * k
def lerpv(a, b, k): return tuple(lerp(x, y, k) for x, y in zip(a, b))
def ease(t): return 0.5 - 0.5 * math.cos(2 * math.pi * t)
def rot(v, axis, deg):
    """Rodrigues: gira v em torno de axis (unitário) por deg graus."""
    a = math.radians(deg); c, s_ = math.cos(a), math.sin(a)
    return addv(mul(v, c), mul(cross(axis, v), s_), mul(axis, dot(axis, v) * (1 - c)))


class Camera:
    def __init__(self, eye, target=(0, 20, 0), scale=1.85, cx=290, cy=236):
        self.eye = eye
        self.f = norm(sub(target, eye))
        self.r = norm(cross(self.f, (0, 1, 0)))
        self.u = cross(self.r, self.f)
        self.scale, self.cx, self.cy = scale, cx, cy
    def proj(self, p):
        d = sub(p, self.eye)
        return (self.cx + dot(d, self.r) * self.scale, self.cy - dot(d, self.u) * self.scale)
    def raw(self, p):  # sem escala/centro (pra auto-enquadrar)
        d = sub(p, self.eye)
        return (dot(d, self.r), dot(d, self.u))
    def depth(self, p):
        return dot(sub(p, self.eye), self.f)


CAMS = {
    "costas34": (-150, 105, -230),   # aprovado (crucifixo invertido)
    "costas34r": (150, 105, -230),
    "frente34": (-150, 105, 230),
    "frente34r": (150, 105, 230),
    "lado": (-250, 80, 30),
    "lado_r": (250, 80, 30),
    "lado_frente": (-230, 110, 140),
    "lado_costas": (-230, 110, -140),
    "alto_frente": (-140, 200, 200),
    "alto_lado": (-230, 190, 60),
    "supino": (-170, 170, 200),
}


class Scene:
    def __init__(self, cam):
        self.cam = cam
        self.img = Image.new("RGBA", (W * S, H * S), BG + (255,))
        self.items = []
        self.fit = []
    def P(self, p):
        x, y = self.cam.proj(p)
        return (x * S, y * S)
    def add(self, depth, fn, pts=()):
        self.items.append((depth, fn))
        self.fit.extend(pts)
    def capsule(self, a, b, radius, fill, outline=OUTLINE, shade=None, depth_bias=0.0, depth=None, fit=True):
        d = ((self.cam.depth(a) + self.cam.depth(b)) / 2 + depth_bias) if depth is None else depth
        def fn(draw):
            pa, pb = self.P(a), self.P(b)
            if outline:
                draw.line([pa, pb], fill=outline, width=int((radius + 2.2) * 2 * S))
            draw.line([pa, pb], fill=fill, width=int(radius * 2 * S))
            if shade:
                off = (-radius * 0.45 * S, radius * 0.35 * S)
                draw.line([(pa[0]+off[0], pa[1]+off[1]), (pb[0]+off[0], pb[1]+off[1])], fill=shade, width=int(radius * 0.7 * S))
        self.add(d, fn, (a, b) if fit else ())
    def sphere(self, c, radius, fill, outline=OUTLINE, depth_bias=0.0, depth=None, fit=True):
        d = (self.cam.depth(c) + depth_bias) if depth is None else depth
        def fn(draw):
            x, y = self.P(c); r = radius * self.cam.scale * S
            if outline:
                draw.ellipse([x-r-2*S, y-r-2*S, x+r+2*S, y+r+2*S], fill=outline)
            draw.ellipse([x-r, y-r, x+r, y+r], fill=fill)
        self.add(d, fn, (c,) if fit else ())
    def polygon(self, pts, fill, outline=None, depth_bias=0.0, width=2, depth=None, fit=True):
        d = (sum(self.cam.depth(p) for p in pts) / len(pts) + depth_bias) if depth is None else depth
        def fn(draw):
            draw.polygon([self.P(p) for p in pts], fill=fill, outline=outline, width=int(width * S) if outline else 0)
        self.add(d, fn, tuple(pts) if fit else ())
    def line3(self, pts, fill, width, depth_bias=0.0, depth=None, fit=True):
        d = (sum(self.cam.depth(p) for p in pts) / len(pts) + depth_bias) if depth is None else depth
        def fn(draw):
            draw.line([self.P(p) for p in pts], fill=fill, width=int(width * S), joint="curve")
        self.add(d, fn, tuple(pts) if fit else ())
    def box(self, x0, x1, y0, y1, z0, z1, fill, top=None, side=None, outline=OUTLINE, fit=True):
        faces = [
            ([(x0,y0,z0),(x1,y0,z0),(x1,y1,z0),(x0,y1,z0)], (0,0,-1), fill),
            ([(x0,y0,z1),(x1,y0,z1),(x1,y1,z1),(x0,y1,z1)], (0,0,1), fill),
            ([(x0,y1,z0),(x1,y1,z0),(x1,y1,z1),(x0,y1,z1)], (0,1,0), top or fill),
            ([(x0,y0,z0),(x1,y0,z0),(x1,y0,z1),(x0,y0,z1)], (0,-1,0), MACH_D),
            ([(x0,y0,z0),(x0,y1,z0),(x0,y1,z1),(x0,y0,z1)], (-1,0,0), side or fill),
            ([(x1,y0,z0),(x1,y1,z0),(x1,y1,z1),(x1,y0,z1)], (1,0,0), side or fill),
        ]
        for pts, n, col in faces:
            if dot(n, mul(self.cam.f, -1)) > 0:
                self.polygon(pts, col, outline=outline, depth_bias=-0.01, fit=fit)
    def obox(self, c, u, v, w, su, sv, sw, fill, top=None, side=None, outline=OUTLINE):
        """caixa orientada: centro c, eixos u/v/w (unitários), meios-tamanhos su/sv/sw."""
        def corner(a, b, d): return addv(c, mul(u, a*su), mul(v, b*sv), mul(w, d*sw))
        faces = [
            ((-1,-1,-1),(1,-1,-1),(1,1,-1),(-1,1,-1), mul(w,-1), fill),
            ((-1,-1,1),(1,-1,1),(1,1,1),(-1,1,1), w, fill),
            ((-1,1,-1),(1,1,-1),(1,1,1),(-1,1,1), v, top or fill),
            ((-1,-1,-1),(1,-1,-1),(1,-1,1),(-1,-1,1), mul(v,-1), MACH_D),
            ((-1,-1,-1),(-1,1,-1),(-1,1,1),(-1,-1,1), mul(u,-1), side or fill),
            ((1,-1,-1),(1,1,-1),(1,1,1),(1,-1,1), u, side or fill),
        ]
        for a, b, cc, d, n, col in faces:
            if dot(n, mul(self.cam.f, -1)) > 0:
                self.polygon([corner(*a), corner(*b), corner(*cc), corner(*d)], col, outline=outline, depth_bias=-0.01)
    def autofit(self, top=72, bottom=372, left=40, right=560):
        if not self.fit:
            return
        xs, ys = zip(*[self.cam.raw(p) for p in self.fit])
        w, h = (max(xs) - min(xs)) or 1, (max(ys) - min(ys)) or 1
        sc = min((right - left) / w, (bottom - top) / h, 2.1)
        self.cam.scale = sc
        self.cam.cx = (left + right) / 2 - (min(xs) + max(xs)) / 2 * sc
        self.cam.cy = (top + bottom) / 2 + (min(ys) + max(ys)) / 2 * sc
    def render(self):
        draw = ImageDraw.Draw(self.img)
        for _, fn in sorted(self.items, key=lambda it: -it[0]):
            fn(draw)
        return self.img


# ── corpo ────────────────────────────────────────────────────────────────────
L = dict(sh_y=47, top_y=56, neck_y=61, head_y=73, head_r=11.5, sh_x=21, ua=29, fa=27, thigh=44, shin=46, foot=18)


def limb_dir(U, Fw, R, s, elev, az):
    h = addv(mul(Fw, math.cos(math.radians(az))), mul(R, s * math.sin(math.radians(az))))
    return norm(addv(mul(U, -math.cos(math.radians(elev))), mul(h, math.sin(math.radians(elev)))))


class Body:
    """Calcula juntas a partir da pose. pose:
       P (pelve), stance ('stand'|'seat'|'supine'|'prone'|'kneel'), pitch (inclinação do tronco à frente, graus),
       arms: dict por lado {'elev','az','elev2','az2'} ou comum ('arm'), legs idem ('leg'),
       foot_plantar (graus), head_pitch."""
    def __init__(self, pose):
        self.pose = pose
        st = pose.get("stance", "stand")
        if st in ("stand", "seat", "kneel"):
            U0, Fw0 = (0, 1, 0), (0, 0, 1)
        elif st == "supine":   # deitado de costas, cabeça em -z, frente do corpo para cima
            U0, Fw0 = (0, 0, -1), (0, 1, 0)
        elif st == "prone":    # de bruços, cabeça em -z, frente para baixo
            U0, Fw0 = (0, 0, -1), (0, -1, 0)
        else:
            U0, Fw0 = (0, 1, 0), (0, 0, 1)
        R = norm(cross(Fw0, U0)) if st not in ("supine", "prone") else (1, 0, 0)
        if st in ("stand", "seat", "kneel"):
            R = (1, 0, 0)
        pitch = pose.get("pitch", 0)
        U = norm(addv(mul(U0, math.cos(math.radians(pitch))), mul(Fw0, math.sin(math.radians(pitch)))))
        Fw = norm(addv(mul(Fw0, math.cos(math.radians(pitch))), mul(U0, -math.sin(math.radians(pitch)))))
        self.U, self.Fw, self.R = U, Fw, R
        self.U0, self.Fw0 = U0, Fw0
        self.P = tuple(pose.get("P", (0, 0, 0)))
        P = self.P
        shrug = pose.get("shrug", 0)
        self.sh = {s: addv(P, mul(U, L["sh_y"] + shrug), mul(R, s * L["sh_x"])) for s in (-1, 1)}
        self.neck = addv(P, mul(U, L["neck_y"]))
        hp = pose.get("head_pitch", 0)
        Uh = norm(addv(mul(U, math.cos(math.radians(hp))), mul(Fw, math.sin(math.radians(hp)))))
        self.head = addv(self.neck, mul(Uh, L["head_y"] - L["neck_y"]))
        self.Uh = Uh
        self.hip = {s: addv(P, mul(R, s * 13), mul(U0, 1), mul(Fw0, 4)) for s in (-1, 1)}
        # braços
        self.elbow, self.hand = {}, {}
        for s in (-1, 1):
            a = pose.get("arm_%s" % ("L" if s < 0 else "R"), pose.get("arm", {}))
            e1, z1 = a.get("elev", 0), a.get("az", 0)
            e2, z2 = a.get("elev2", e1), a.get("az2", z1)
            d1 = limb_dir(U, Fw, R, s, e1, z1); d2 = limb_dir(U, Fw, R, s, e2, z2)
            self.elbow[s] = addv(self.sh[s], mul(d1, L["ua"]))
            if a.get("hand") is not None:   # alvo absoluto da mão (IK 2 segmentos, dobra para 'bend')
                tgt = tuple(a["hand"]); self.hand[s] = tgt
                self.elbow[s] = ik(self.sh[s], tgt, L["ua"], L["fa"], a.get("bend", Fw))
            else:
                self.hand[s] = addv(self.elbow[s], mul(d2, L["fa"]))
        # pernas
        self.knee, self.ankle, self.toe = {}, {}, {}
        for s in (-1, 1):
            lg = pose.get("leg_%s" % ("L" if s < 0 else "R"), pose.get("leg", {}))
            e1, z1 = lg.get("elev", 0), lg.get("az", 8)
            e2, z2 = lg.get("elev2", 0), lg.get("az2", z1)
            d1 = limb_dir(U0, Fw0, R, s, e1, z1); d2 = limb_dir(U0, Fw0, R, s, e2, z2)
            self.knee[s] = addv(self.hip[s], mul(d1, L["thigh"]))
            self.ankle[s] = addv(self.knee[s], mul(d2, L["shin"]))
            pf = lg.get("foot", 0)  # 0 = dedos pra frente (Fw0); 90 = dedos pra baixo
            fd = norm(addv(mul(Fw0, math.cos(math.radians(pf))), mul(U0, -math.sin(math.radians(pf)))))
            if lg.get("foot_dir"):
                fd = norm(tuple(lg["foot_dir"]))
            self.toe[s] = addv(self.ankle[s], mul(fd, L["foot"]))

    def all_points(self):
        pts = [self.P, self.neck, self.head]
        for s in (-1, 1):
            pts += [self.sh[s], self.elbow[s], self.hand[s], self.hip[s], self.knee[s], self.ankle[s], self.toe[s]]
        return pts


def ik(sh, hand, l1, l2, bend):
    d = sub(hand, sh); dist = min(math.sqrt(dot(d, d)) or 1e-9, l1 + l2 - 0.5)
    u = norm(d)
    a = (l1*l1 - l2*l2 + dist*dist) / (2*dist)
    h = math.sqrt(max(0.0, l1*l1 - a*a))
    b = norm(sub(bend, mul(u, dot(bend, u))))  # componente de 'bend' perpendicular a u
    return addv(sh, mul(u, a), mul(b, h))


# ── desenho do corpo ─────────────────────────────────────────────────────────
def draw_body(sc, body, k, muscles=(), cam_side=None, arms_front=True, hide=()):
    """k = 0..1 grau de contração (alpha do músculo). muscles = lista de regiões."""
    cam = sc.cam
    U, Fw, R, P = body.U, body.Fw, body.R, body.P
    a = int(110 + 120 * k)
    def bp(x, y, z):  # ponto em coordenadas do corpo (x lateral, y ao longo de U, z frente)
        return addv(P, mul(R, x), mul(U, y), mul(Fw, z))
    front_visible = dot(Fw, mul(cam.f, -1)) > 0   # frente do tronco virada pra câmera?
    ZB, ZF = -7, 6
    # ── pernas ──
    for s in (-1, 1):
        hipj, knee, ankle, toe = body.hip[s], body.knee[s], body.ankle[s], body.toe[s]
        sc.capsule(hipj, knee, 9, SKIN, shade=SKIN_SH)
        sc.capsule(hipj, addv(hipj, mul(sub(knee, hipj), 0.42)), 9.8, SHORTS, outline=OUTLINE)
        dth = (cam.depth(hipj) + cam.depth(knee)) / 2
        if "quadriceps" in muscles or ("adutores" in muscles) or ("posterior" in muscles and not front_visible):
            sc.capsule(addv(hipj, mul(sub(knee, hipj), 0.42)), addv(hipj, mul(sub(knee, hipj), 0.97)), 8.0, MUSC + (a,), outline=None, depth=dth - 0.02)
        sc.capsule(knee, ankle, 7, SKIN, shade=SKIN_SH)
        if "panturrilha" in muscles:
            dsh = (cam.depth(knee) + cam.depth(ankle)) / 2
            sc.capsule(addv(knee, mul(sub(ankle, knee), 0.12)), addv(knee, mul(sub(ankle, knee), 0.62)), 6.4, MUSC + (a,), outline=None, depth=dsh - 0.02)
        sc.capsule(ankle, toe, 5, SHOE)
    # ── pelve (bloco do short) ──
    sc.obox(bp(0, 4, 3), R, U, Fw, 16, 6, 11, SHORTS, top=SHORTS_T, side=SHORTS_S)
    if "gluteo" in muscles:
        sc.polygon([bp(-15, 9, -8.5), bp(15, 9, -8.5), bp(13, -1, -8.5), bp(-13, -1, -8.5)], MUSC + (a,), depth_bias=-0.3)
    # ── tronco ──
    top, sh_y = L["top_y"], L["sh_y"]
    outline_pts = [(-6, 61), (6, 61), (22, top), (21, 46), (14, 18), (15, 8), (-15, 8), (-14, 18), (-21, 46), (-22, top)]
    back = [bp(x, y, ZB) for x, y in outline_pts]
    front = [bp(x, y, ZF) for x, y in outline_pts]
    DB = sum(cam.depth(p) for p in back) / len(back) + 0.5
    DF = sum(cam.depth(p) for p in front) / len(front) + 0.5
    # lados
    for s, col in ((-1, SKIN_SH), (1, SKIN)):
        sc.polygon([bp(s*22, top, ZB), bp(s*22, top-2, ZF), bp(s*15, 8, ZF), bp(s*15, 8, ZB), bp(s*14, 18, ZB), bp(s*21, 46, ZB)], col, outline=OUTLINE, depth_bias=0.6)
    # plano visível (costas ou frente) com detalhes; o outro plano só como base
    sc.polygon(back, SKIN, outline=OUTLINE, depth=DB)
    sc.polygon(front, SKIN, outline=OUTLINE, depth=DF)
    if not front_visible:
        D = DB
        sc.polygon([bp(-6, 61, ZB), bp(0, 61, ZB), bp(0, 8, ZB), bp(-15, 8, ZB), bp(-14, 18, ZB), bp(-21, 46, ZB), bp(-22, top, ZB)], SKIN_SH, depth=D - 0.05)
        sc.line3([bp(0, 57, ZB-0.2), bp(0, 10, ZB-0.2)], LINE, 2.2, depth=D - 0.15)
        for s in (-1, 1):
            sc.line3([bp(s*6, 52, ZB-0.2), bp(s*17, 38, ZB-0.2)], LINE, 1.6, depth=D - 0.15)
            sc.line3([bp(s*20, 44, ZB-0.2), bp(s*13, 20, ZB-0.2)], LINE, 1.3, depth=D - 0.15)
        ZM = ZB - 0.4
        if "trapezio_medio" in muscles:
            for s in (-1, 1):
                sc.polygon([bp(0, 58, ZM), bp(s*19, 55, ZM), bp(s*17, 47, ZM), bp(0, 44, ZM)], MUSC + (a,), depth=D - 0.1)
        if "romboides" in muscles:
            for s in (-1, 1):
                sc.polygon([bp(s*2, 45, ZM), bp(s*13, 47, ZM), bp(s*10, 33, ZM), bp(s*2, 32, ZM)], MUSC + (a-20,), depth=D - 0.1)
        if "dorsal" in muscles:
            for s in (-1, 1):
                sc.polygon([bp(s*21, 46, ZM), bp(s*16, 30, ZM), bp(s*4, 14, ZM), bp(s*3, 34, ZM), bp(s*14, 44, ZM)], MUSC + (a,), depth=D - 0.1)
        if "lombar" in muscles:
            for s in (-1, 1):
                sc.polygon([bp(s*2, 30, ZM), bp(s*10, 28, ZM), bp(s*12, 10, ZM), bp(s*2, 9, ZM)], MUSC + (a,), depth=D - 0.1)
        if "trapezio_sup" in muscles:
            for s in (-1, 1):
                sc.polygon([bp(0, 61, ZM), bp(s*6, 61, ZM), bp(s*21, 55, ZM), bp(s*10, 49, ZM), bp(0, 50, ZM)], MUSC + (a,), depth=D - 0.1)
    else:
        D = DF
        sc.polygon([bp(-6, 61, ZF), bp(0, 61, ZF), bp(0, 8, ZF), bp(-15, 8, ZF), bp(-14, 18, ZF), bp(-21, 46, ZF), bp(-22, top, ZF)], SKIN_SH, depth=D - 0.05)
        sc.line3([bp(0, 50, ZF+0.2), bp(0, 12, ZF+0.2)], LINE, 1.8, depth=D - 0.15)       # linha média
        sc.line3([bp(-18, 50, ZF+0.2), bp(-4, 38, ZF+0.2)], LINE, 1.4, depth=D - 0.15)     # peitorais
        sc.line3([bp(18, 50, ZF+0.2), bp(4, 38, ZF+0.2)], LINE, 1.4, depth=D - 0.15)
        for yy in (30, 22):
            sc.line3([bp(-7, yy, ZF+0.2), bp(7, yy, ZF+0.2)], LINE, 1.2, depth=D - 0.15)     # abdômen
        ZM = ZF + 0.4
        if "peitoral" in muscles:
            for s in (-1, 1):
                sc.polygon([bp(s*3, 54, ZM), bp(s*21, 53, ZM), bp(s*19, 44, ZM), bp(s*10, 36, ZM), bp(s*3, 37, ZM)], MUSC + (a,), depth=D - 0.1)
        if "abdomen" in muscles:
            sc.polygon([bp(-8, 36, ZM), bp(8, 36, ZM), bp(9, 10, ZM), bp(-9, 10, ZM)], MUSC + (a,), depth=D - 0.1)
    # trapézio superior ligando pescoço aos ombros
    sc.polygon([bp(-6, 61, ZB), bp(6, 61, ZB), bp(6, 66, -2), bp(-6, 66, -2)], SKIN, depth_bias=0.45)
    # pescoço + cabeça
    sc.capsule(body.neck, addv(body.neck, mul(body.Uh, 6)), 4.5, SKIN)
    sc.sphere(body.head, L["head_r"], SKIN)
    hair_c = addv(body.head, mul(Fw, -4.5), mul(body.Uh, 3))
    sc.sphere(hair_c, 10.5, HAIR, outline=None, depth=cam.depth(body.head) - (0.6 if not front_visible else -0.6))
    if front_visible:   # rosto simples: olhos + nariz
        for s in (-1, 1):
            sc.sphere(addv(body.head, mul(R, s*4), mul(body.Uh, 1.5), mul(Fw, 10.5)), 1.4, OUTLINE, outline=None, depth=cam.depth(body.head) - 1.0)
        sc.sphere(addv(body.head, mul(body.Uh, -2), mul(Fw, 11.5)), 1.6, SKIN_SH, outline=None, depth=cam.depth(body.head) - 1.0)
    ear_side = -1 if dot(R, cam.r) < 0 else 1
    sc.sphere(addv(body.head, mul(R, ear_side * 11.5), mul(body.Uh, -1)), 2.6, SKIN_SH, outline=OUTLINE, depth=cam.depth(body.head) - 1.0)
    # ── braços ──
    for s in (-1, 1):
        if ("arm_%s" % ("L" if s < 0 else "R")) in hide:
            continue
        sh, elbow, hand = body.sh[s], body.elbow[s], body.hand[s]
        d_nat = (cam.depth(sh) + cam.depth(elbow)) / 2
        d_arm = min(d_nat, D - 0.2) if arms_front else d_nat
        d_fore = (cam.depth(elbow) + cam.depth(hand)) / 2
        sc.capsule(sh, elbow, 6.5, SKIN, shade=SKIN_SH, depth=d_arm)
        if "biceps" in muscles or "triceps" in muscles:
            sc.capsule(addv(sh, mul(sub(elbow, sh), 0.40)), addv(sh, mul(sub(elbow, sh), 0.95)), 6.0, MUSC + (a,), outline=None, depth=d_arm - 0.01)
        sc.capsule(elbow, hand, 5.5, SKIN, shade=SKIN_SH, depth=d_fore)
        if "antebraco" in muscles:
            sc.capsule(addv(elbow, mul(sub(hand, elbow), 0.1)), addv(elbow, mul(sub(hand, elbow), 0.8)), 5.0, MUSC + (a,), outline=None, depth=d_fore - 0.01)
        # capa do deltoide (ombro) — nasce na quina do tronco, cobre ~40% do úmero; sempre à frente do tronco
        cap_a = addv(sh, mul(R, s*1), mul(U, 2), mul(Fw, -4))
        cap_b = addv(sh, mul(sub(elbow, sh), 0.42))
        d_cap = d_arm - 0.03
        sc.capsule(cap_a, cap_b, 9.3, SKIN, shade=SKIN_SH, depth=d_cap)
        if any(m in muscles for m in ("deltoide_post", "deltoide_lat", "deltoide_ant", "deltoide")):
            sc.capsule(cap_a, cap_b, 9.4, MUSC + (a,), outline=None, depth=d_cap - 0.01)
        sc.sphere(hand, 5.2, SKIN, depth=d_fore - 0.02)
    return dict(DB=DB, DF=DF, front_visible=front_visible)


# ── equipamentos ─────────────────────────────────────────────────────────────
def floor_grid(sc, x0=-160, x1=200, z0=-140, z1=160, step=40):
    for gx in range(x0, x1 + 1, step):
        sc.line3([(gx, FLOOR, z0), (gx, FLOOR, z1)], (28, 28, 28), 1, depth_bias=80, fit=False)
    for gz in range(z0, z1 + 1, step):
        sc.line3([(x0, FLOOR, gz), (x1, FLOOR, gz)], (28, 28, 28), 1, depth_bias=80, fit=False)

def tower(sc, k, x=-96, z=44, h=106, stack_z=64, lift=26, cable_to=None, sel_from_top=True):
    sc.box(x-4, x+4, FLOOR, h, z-4, z+4, MACH, top=MACH_L)
    sc.box(x-10, x+10, h-6, h+2, z-4, z+4, MACH_L)
    sc.box(x-16, x+16, FLOOR, FLOOR+4, stack_z-8, stack_z+8, MACH_D)
    li = lift * k
    for i in range(8):
        y0 = FLOOR + 4 + i * 6.5
        sel = i >= 5
        yo = li if sel else 0
        sc.box(x-12, x+12, y0+yo, y0+5.5+yo, stack_z-6, stack_z+6, ACCENT if sel else (95, 95, 95), top=(255, 215, 90) if sel else (120, 120, 120))
    top_stack = (x, FLOOR + 4 + 8*6.5 + li, stack_z)
    if cable_to is not None:
        sc.line3([top_stack, (x, h, stack_z), (x, h, z)] + list(cable_to), MUTED, 1.5, depth_bias=-0.3)
    return (x, h, z)

def bench(sc, cx=0, cz=0, length=90, width=17, y=-2, thick=8, post=True):
    sc.box(cx-width, cx+width, y-thick, y, cz-length/2, cz+length/2, BENCH, top=BENCH_T)
    sc.line3([(cx-width, y, cz-length/2), (cx+width, y, cz-length/2)], ACCENT, 2, depth_bias=-0.2)
    if post:
        for zz in (cz-length/2+12, cz+length/2-12):
            sc.box(cx-5, cx+5, FLOOR, y-thick, zz-4, zz+4, MACH, top=MACH_L)

def seat(sc, y=-2, back_angle=None, cz=0):
    sc.box(-5, 5, FLOOR, y-8, cz-4, cz+4, MACH, top=MACH_L)
    sc.box(-17, 17, y-8, y, cz-22, cz+20, BENCH, top=BENCH_T)
    sc.line3([(-17, y, cz-22), (17, y, cz-22)], ACCENT, 2, depth_bias=-0.2)
    if back_angle is not None:
        ang = math.radians(back_angle)   # 90 = vertical; 110 = reclinado para trás
        u = (0, math.sin(ang), -math.cos(ang))  # eixo do encosto (para cima, inclinando para -z)
        base = (0, y, cz-20)
        c = addv(base, mul(u, 34))
        sc.obox(c, (1, 0, 0), u, norm(cross((1, 0, 0), u)), 16, 34, 3, PAD, top=PAD_T)

def incline_pad(sc, c, u, w=15, h=36, t=3.5):
    """pad plano (apoio de peito/encosto) centro c, eixo longitudinal u."""
    sc.obox(c, (1, 0, 0), norm(u), norm(cross((1, 0, 0), norm(u))), w, h, t, PAD, top=PAD_T)

def lever(sc, pivot, tip, width=5):
    sc.line3([pivot, tip], MACH, width, depth_bias=0.15)
    sc.sphere(pivot, 3, MUTED, outline=None)

def handle(sc, hand, axis=(0, 1, 0), length=18, depth=None):
    a = addv(hand, mul(norm(axis), length/2)); b = addv(hand, mul(norm(axis), -length/2))
    sc.capsule(a, b, 3.2, ACCENT, outline=(120, 90, 0), depth=depth, depth_bias=-0.35)

def barbell(sc, hand_l, hand_r, plate_r=12, extra=26):
    axis = norm(sub(hand_r, hand_l)) if hand_l != hand_r else (1, 0, 0)
    a = addv(hand_l, mul(axis, -extra)); b = addv(hand_r, mul(axis, extra))
    sc.capsule(a, b, 1.6, MACH_L, outline=None, depth_bias=-0.4)
    for e, sgn in ((a, 1), (b, -1)):
        c = addv(e, mul(axis, sgn * 6))
        sc.sphere(c, plate_r, MACH_D, depth_bias=-0.45)
        sc.sphere(c, plate_r * 0.55, MACH, outline=None, depth_bias=-0.5)

def dumbbell(sc, hand, axis=(1, 0, 0), r=6.5, depth_bias=-0.45):
    a = addv(hand, mul(norm(axis), 9)); b = addv(hand, mul(norm(axis), -9))
    sc.capsule(a, b, 1.6, MACH_L, outline=None, depth_bias=depth_bias)
    sc.sphere(a, r, MACH_D, depth_bias=depth_bias-0.02); sc.sphere(b, r, MACH_D, depth_bias=depth_bias-0.02)

def cable(sc, pts):
    sc.line3(list(pts), MUTED, 1.5, depth_bias=-0.3)

def pad_bar(sc, c, axis=(1, 0, 0), length=30, r=5):
    a = addv(c, mul(norm(axis), length/2)); b = addv(c, mul(norm(axis), -length/2))
    sc.capsule(a, b, r, ACCENT, outline=(120, 90, 0), depth_bias=-0.4)

def frame_posts(sc, xs=(-48, 48), z=33, h=100):
    for x in xs:
        sc.box(x-3, x+3, FLOOR, h, z-3, z+3, MACH, top=MACH_L)
    sc.box(xs[0]-3, xs[1]+3, h-4, h+2, z-3, z+3, MACH, top=MACH_L)


# ── rótulos / setas ──────────────────────────────────────────────────────────
def labels(img, titulo, sub):
    d = ImageDraw.Draw(img)
    d.text((40*S, 20*S), titulo.upper(), font=F(20 if len(titulo) < 30 else 17, True), fill=ACCENT)
    d.text((40*S, 48*S), sub, font=F(13), fill=MUTED)
    d.rectangle([456*S, 50*S, 468*S, 60*S], fill=MUSC); d.text((474*S, 48*S), "músculo alvo", font=F(13), fill=MUTED)
    d.text((40*S, 364*S), "PHYSIQ", font=F(13, True), fill=SKIN); d.text((98*S, 364*S), "CALC", font=F(13, True), fill=ACCENT)

def arrow(img, cam, p_from, p_to, forward=True):
    """seta 2D do ponto A para B (projetados), acima do efetuador; inverte na volta."""
    d = ImageDraw.Draw(img)
    a, b = cam.proj(p_from), cam.proj(p_to)
    if not forward:
        a, b = b, a
    vx, vy = b[0]-a[0], b[1]-a[1]; n = math.hypot(vx, vy) or 1
    if n < 8:
        return
    vx, vy = vx/n, vy/n
    L_ = min(38, n); ax, ay = a[0] + vx*(n-L_)/2, a[1] + vy*(n-L_)/2 - 26
    bx, by = ax + vx*L_, ay + vy*L_
    d.line([(ax*S, ay*S), (bx*S, by*S)], fill=ACCENT, width=3*S)
    px, py = -vy, vx
    d.polygon([((bx+vx*8)*S, (by+vy*8)*S), ((bx+px*6)*S, (by+py*6)*S), ((bx-px*6)*S, (by-py*6)*S)], fill=ACCENT)
