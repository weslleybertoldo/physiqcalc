"""Boneco 2D (vista lateral) por ângulos + props de academia, no visual do PhysiqCalc.

Convenção: ângulo em graus, 0 = aponta para a direita (+x), 90 = para cima. O boneco
"olha" para a direita por padrão; `facing=-1` espelha tudo horizontalmente.
Pose = dict com hip (x,y) e ângulos torso/thigh/shin/ua (braço)/fa (antebraço) + lengths.
"""
import math
from PIL import Image, ImageDraw, ImageFont

W, H, S = 600, 400, 2
BG = (13, 13, 13)
ACCENT = (255, 191, 0)
ACCENT_DARK = (200, 150, 0)
BODY = (235, 235, 235)
BODY_DARK = (160, 160, 160)
MACHINE = (95, 95, 95)
MACHINE_DARK = (60, 60, 60)
MUTED = (156, 163, 175)
BENCH = (42, 42, 42)

LEN = {"torso": 70, "neck": 14, "head": 17, "thigh": 60, "shin": 60, "foot": 22, "ua": 40, "fa": 42}

_FONT_CACHE = {}


def font(size, bold=False):
    key = (size, bold)
    if key not in _FONT_CACHE:
        path = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf" if bold else "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"
        try:
            _FONT_CACHE[key] = ImageFont.truetype(path, size * S)
        except OSError:
            _FONT_CACHE[key] = ImageFont.load_default()
    return _FONT_CACHE[key]


def vec(angle, length):
    a = math.radians(angle)
    return (math.cos(a) * length, -math.sin(a) * length)


def add(p, v):
    return (p[0] + v[0], p[1] + v[1])


def lerp(a, b, k):
    return a + (b - a) * k


def lerp_pose(pa, pb, k):
    out = {}
    for key in pa:
        va, vb = pa[key], pb.get(key, pa[key])
        if isinstance(va, (int, float)):
            out[key] = lerp(va, vb, k)
        elif isinstance(va, (tuple, list)):
            out[key] = tuple(lerp(x, y, k) for x, y in zip(va, vb))
        elif isinstance(va, dict):
            out[key] = {kk: lerp(va[kk], vb.get(kk, va[kk]), k) for kk in va}
        else:
            out[key] = va
    return out


def joints(pose):
    """Calcula as juntas a partir da pose (no referencial 'olhando para a direita')."""
    L = dict(LEN)
    L.update(pose.get("len", {}))
    hip = tuple(pose["hip"])
    shoulder = add(hip, vec(pose["torso"], L["torso"]))
    neck_end = add(shoulder, vec(pose.get("neck", pose["torso"]), L["neck"]))
    head = add(neck_end, vec(pose.get("neck", pose["torso"]), L["head"]))
    knee = add(hip, vec(pose["thigh"], L["thigh"]))
    foot = add(knee, vec(pose["shin"], L["shin"]))
    foot_tip = add(foot, vec(pose.get("foot", 0), L["foot"]))
    elbow = add(shoulder, vec(pose["ua"], L["ua"]))
    hand = add(elbow, vec(pose["fa"], L["fa"]))
    j = dict(hip=hip, shoulder=shoulder, head=head, knee=knee, foot=foot, foot_tip=foot_tip, elbow=elbow, hand=hand)
    # braço de trás (opcional: ua2/fa2), senão copia
    if "ua2" in pose:
        e2 = add(shoulder, vec(pose["ua2"], L["ua"]))
        j["elbow2"], j["hand2"] = e2, add(e2, vec(pose.get("fa2", pose["fa"]), L["fa"]))
    else:
        j["elbow2"], j["hand2"] = elbow, hand
    if "thigh2" in pose:
        k2 = add(hip, vec(pose["thigh2"], L["thigh"]))
        f2 = add(k2, vec(pose.get("shin2", pose["shin"]), L["shin"]))
        j["knee2"], j["foot2"], j["foot_tip2"] = k2, f2, add(f2, vec(pose.get("foot2", pose.get("foot", 0)), L["foot"]))
    else:
        j["knee2"], j["foot2"], j["foot_tip2"] = knee, foot, foot_tip
    return j


class Canvas:
    def __init__(self, facing=1):
        self.img = Image.new("RGB", (W * S, H * S), BG)
        self.d = ImageDraw.Draw(self.img)
        self.facing = facing

    def P(self, p):
        x, y = p
        if self.facing < 0:
            x = W - x
        return (x * S, y * S)

    def line(self, pts, fill, width, joint="curve"):
        self.d.line([self.P(p) for p in pts], fill=fill, width=int(width * S), joint=joint)

    def circle(self, c, r, fill):
        x, y = self.P(c)
        self.d.ellipse([x - r * S, y - r * S, x + r * S, y + r * S], fill=fill)

    def rect(self, p1, p2, fill):
        a, b = self.P(p1), self.P(p2)
        self.d.rectangle([min(a[0], b[0]), min(a[1], b[1]), max(a[0], b[0]), max(a[1], b[1])], fill=fill)

    def poly(self, pts, fill):
        self.d.polygon([self.P(p) for p in pts], fill=fill)

    def text(self, p, s, size, fill, bold=False, anchor="la"):
        # texto não espelha
        self.d.text((p[0] * S, p[1] * S), s, font=font(size, bold), fill=fill, anchor=anchor)

    def final(self):
        return self.img.resize((W, H), Image.LANCZOS)


# ── props ─────────────────────────────────────────────────────────────────────

def draw_floor(c, y=340):
    c.line([(30, y), (570, y)], MACHINE_DARK, 3)


def draw_tower(c, x=450, top=90, floor=340):
    c.rect((x - 11, top), (x + 11, floor), MACHINE_DARK)
    c.rect((x - 32, top - 6), (x + 32, top + 6), MACHINE)


def draw_stack(c, k, x=495, top=200, bottom=330, selected=4, n=9):
    ph = (bottom - top) / n
    lift = 46 * k
    for i in range(n):
        y0 = top + i * ph
        sel = i < selected
        off = -lift if sel else 0
        c.rect((x - 27, y0 + 1 + off), (x + 27, y0 + ph - 1 + off), ACCENT if sel else MACHINE)
    c.line([(x - 17, top - 70), (x - 17, bottom + 5)], MACHINE_DARK, 2)
    c.line([(x + 17, top - 70), (x + 17, bottom + 5)], MACHINE_DARK, 2)
    return top - lift  # topo da pilha (pra ligar o cabo)


def draw_cable(c, a, b):
    c.line([a, b], MUTED, 2)


def draw_bench(c, x1, x2, y, floor=340, legs=True):
    c.rect((x1, y), (x2, y + 18), BENCH)
    c.line([(x1, y), (x2, y)], ACCENT, 2)
    if legs:
        c.rect((x1 + 24, y + 18), (x1 + 38, floor), MACHINE_DARK)
        c.rect((x2 - 38, y + 18), (x2 - 24, floor), MACHINE_DARK)


def draw_seat(c, hip, floor=340, back=True, back_angle=90, depth=44):
    x, y = hip
    c.rect((x - depth + 6, y + 8), (x + depth, y + 24), BENCH)
    c.line([(x - depth + 6, y + 8), (x + depth, y + 8)], ACCENT, 2)
    c.rect((x - 4, y + 24), (x + 10, floor), MACHINE_DARK)
    if back:
        top = add((x - depth + 4, y + 8), vec(back_angle, 92))
        c.line([(x - depth + 4, y + 8), top], BENCH, 16)


def draw_incline_bench(c, hip, torso_angle, floor=340):
    x, y = hip
    top = add((x - 4, y + 12), vec(torso_angle, 96))
    c.line([(x - 4, y + 12), top], BENCH, 18)
    c.rect((x - 44, y + 8), (x + 30, y + 24), BENCH)
    c.line([(x - 44, y + 8), (x + 30, y + 8)], ACCENT, 2)
    c.rect((x - 6, y + 24), (x + 8, floor), MACHINE_DARK)


def draw_barbell(c, hand, r=15):
    c.line([(hand[0], hand[1] - 3), (hand[0], hand[1] + 3)], MACHINE, 4)
    c.circle(hand, r, MACHINE)
    c.circle(hand, r - 5, MACHINE_DARK)
    c.circle(hand, 3, MUTED)


def draw_dumbbell(c, hand, vertical=False):
    if vertical:
        c.rect((hand[0] - 5, hand[1] - 14), (hand[0] + 5, hand[1] + 14), MACHINE)
        c.rect((hand[0] - 9, hand[1] - 14), (hand[0] + 9, hand[1] - 9), ACCENT_DARK)
        c.rect((hand[0] - 9, hand[1] + 9), (hand[0] + 9, hand[1] + 14), ACCENT_DARK)
    else:
        c.rect((hand[0] - 14, hand[1] - 5), (hand[0] + 14, hand[1] + 5), MACHINE)
        c.rect((hand[0] - 14, hand[1] - 9), (hand[0] - 9, hand[1] + 9), ACCENT_DARK)
        c.rect((hand[0] + 9, hand[1] - 9), (hand[0] + 14, hand[1] + 9), ACCENT_DARK)


def draw_handle(c, hand, vertical=True, color=ACCENT):
    if vertical:
        c.line([(hand[0], hand[1] - 13), (hand[0], hand[1] + 13)], color, 7)
    else:
        c.line([(hand[0] - 14, hand[1]), (hand[0] + 14, hand[1])], color, 7)


def draw_lever(c, pivot, hand, color=MACHINE, width=8):
    c.line([pivot, hand], color, width)
    c.circle(pivot, 7, MUTED)


def draw_pad(c, p, angle, length=30, color=ACCENT):
    a = add(p, vec(angle, length / 2))
    b = add(p, vec(angle + 180, length / 2))
    c.line([a, b], color, 12)


def draw_figure(c, j, far=True):
    # perna de trás
    if far:
        c.line([j["hip"], j["knee2"], j["foot2"]], BODY_DARK, 15)
        c.line([j["foot2"], j["foot_tip2"]], BODY_DARK, 7)
    # perna da frente
    c.line([j["hip"], j["knee"]], BODY, 18)
    c.line([j["knee"], j["foot"]], BODY, 14)
    c.line([j["foot"], j["foot_tip"]], BODY, 8)
    # tronco + cabeça
    c.line([j["hip"], j["shoulder"]], BODY, 22)
    c.line([j["shoulder"], j["head"]], BODY, 9)
    c.circle(j["head"], LEN["head"], BODY)
    # braço de trás
    if far:
        c.line([j["shoulder"], j["elbow2"], j["hand2"]], BODY_DARK, 12)
    # braço da frente
    c.line([j["shoulder"], j["elbow"], j["hand"]], BODY, 14)
    c.circle(j["shoulder"], 9, BODY)
    c.circle(j["hand"], 7, BODY)


def draw_labels(c, titulo, sub):
    c.text((40, 22), titulo.upper(), 20, ACCENT, bold=True)
    c.text((40, 50), sub, 13, MUTED)
    c.text((40, 358), "PHYSIQ", 13, BODY, bold=True)
    c.text((40 + 58, 358), "CALC", 13, ACCENT, bold=True)


def ease(t):
    return 0.5 - 0.5 * math.cos(2 * math.pi * t)
