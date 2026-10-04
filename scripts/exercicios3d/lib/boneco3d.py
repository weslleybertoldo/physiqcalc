# Base dos GIFs 3D do Physiq: boneco MakeHuman (MPFB) com o esqueleto do Mixamo,
# cinza liso, músculo alvo em vermelho, fundo branco (sombra no chão por shadow catcher).
# Roda DENTRO do Blender (blender -b -P ...). Coordenadas: chão z=0, boneco olha pra -Y, esquerda dele = +X.
import bpy, math
from mathutils import Vector, Matrix

from bl_ext.user_default.mpfb.services.humanservice import HumanService

CINZA = (0.20, 0.205, 0.215, 1)
VERMELHO = (0.72, 0.025, 0.02, 1)

MACRO = {
    "gender": 1.0, "age": 0.45, "muscle": 0.9, "weight": 0.5, "proportions": 1.0,
    "height": 0.55, "cupsize": 0.5, "firmness": 0.5,
    "race": {"asian": 0.33, "caucasian": 0.34, "african": 0.33},
}


def limpar_cena():
    for o in list(bpy.data.objects):
        bpy.data.objects.remove(o, do_unlink=True)


def smooth(e0, e1, x):
    if e0 == e1:
        return 1.0 if x >= e1 else 0.0
    t = max(0.0, min(1.0, (x - e0) / (e1 - e0)))
    return t * t * (3 - 2 * t)


def faixa(x, a, b, borda):
    """1 dentro de [a, b], cai suave numa borda de largura `borda` dos dois lados."""
    return smooth(a - borda, a, x) * (1 - smooth(b, b + borda, x))


class Boneco:
    def __init__(self):
        self.corpo = HumanService.create_human(macro_detail_dict=MACRO)
        self.rig = HumanService.add_builtin_rig(self.corpo, "mixamo")
        self.pb = self.rig.pose.bones
        sub = self.corpo.modifiers.new("Suave", "SUBSURF")
        sub.levels = 0
        sub.render_levels = 1
        self._olhos()

    # ── posições de repouso (mundo) ────────────────────────────────────────────
    def osso(self, nome):
        return self.rig.data.bones["mixamorig:" + nome]

    def cabeca_osso(self, nome):
        return self.rig.matrix_world @ self.osso(nome).head_local

    def ponta_osso(self, nome):
        return self.rig.matrix_world @ self.osso(nome).tail_local

    def _coords_repouso(self):
        """Coordenadas e normais do corpo em repouso (com as formas aplicadas, sem modificadores)."""
        estados = [(m, m.show_viewport) for m in self.corpo.modifiers]
        for m, _ in estados:
            m.show_viewport = False
        dg = bpy.context.evaluated_depsgraph_get()
        ev = self.corpo.evaluated_get(dg)
        me = ev.to_mesh()
        co = [self.corpo.matrix_world @ v.co for v in me.vertices]
        no = [(self.corpo.matrix_world.to_3x3() @ v.normal).normalized() for v in me.vertices]
        ev.to_mesh_clear()
        for m, s in estados:
            m.show_viewport = s
        return co, no

    def _olhos(self):
        """Esferas cinza nas órbitas (o corpo base vem sem olhos)."""
        co, _ = self._coords_repouso()
        vg = {g.name: g.index for g in self.corpo.vertex_groups}
        for lado in ("l", "r"):
            nome = "helper-%s-eye" % lado
            if nome not in vg:
                continue
            idx = vg[nome]
            pts = [co[v.index] for v in self.corpo.data.vertices if any(g.group == idx and g.weight > 0.5 for g in v.groups)]
            if not pts:
                continue
            c = sum(pts, Vector()) / len(pts)
            r = max((p - c).length for p in pts)
            bpy.ops.mesh.primitive_uv_sphere_add(radius=r * 0.95, location=c, segments=24, ring_count=12)
            olho = bpy.context.active_object
            olho.name = "olho_" + lado
            bpy.ops.object.shade_smooth()
            olho.parent = self.rig
            olho.parent_type = "BONE"
            olho.parent_bone = "mixamorig:Head"
            olho.matrix_world = Matrix.Translation(c)
            self.olhos = getattr(self, "olhos", []) + [olho]

    # ── músculos ───────────────────────────────────────────────────────────────
    def pintar_musculos(self, musculos):
        """Grava o atributo 'musculo' (0..1) por vértice: manchas elípticas na superfície de cada membro,
        medidas na pose de repouso (u = ao longo do osso, ângulo = 0 frente, +90 fora, -90 dentro)."""
        co, no = self._coords_repouso()
        val = [0.0] * len(co)
        frente = Vector((0, -1, 0))

        def mancha(p, a, b, lado, uc, ru, ac, ra, raio):
            eixo = b - a
            L = eixo.length
            ax = eixo / L
            u = (p - a).dot(ax) / L
            radial = (p - a) - ax * ((p - a).dot(ax))
            dist = radial.length
            if dist < 1e-6 or dist > raio * 1.3:
                return 0.0
            rad = radial / dist
            f = (frente - ax * frente.dot(ax)).normalized()
            fora = ax.cross(f)
            if fora.x * lado < 0:
                fora = -fora
            ang = math.degrees(math.atan2(rad.dot(fora), rad.dot(f)))
            d = math.sqrt(((u - uc) / ru) ** 2 + ((ang - ac) / ra) ** 2)
            return (1 - smooth(0.80, 1.0, d)) * (1 - smooth(raio, raio * 1.3, dist))

        MANCHAS = {
            "quadriceps": [("UpLeg", "Leg", 0.45, 0.42, 5, 38, 0.11),
                           ("UpLeg", "Leg", 0.55, 0.40, 70, 38, 0.11),
                           ("UpLeg", "Leg", 0.80, 0.17, -38, 34, 0.11)],
            "biceps": [("Arm", "ForeArm", 0.58, 0.34, -8, 44, 0.07)],
            "panturrilha": [("Leg", "Foot", 0.30, 0.22, 180, 55, 0.09)],
        }
        quadril = self.cabeca_osso("Hips")
        zq = self.cabeca_osso("LeftUpLeg").z
        for i, p in enumerate(co):
            w = 0.0
            for m in musculos:
                for (o1, o2, uc, ru, ac, ra, raio) in MANCHAS.get(m, []):
                    for lado, L in ((1, "Left"), (-1, "Right")):
                        w = max(w, mancha(p, self.cabeca_osso(L + o1), self.cabeca_osso(L + o2), lado, uc, ru, ac, ra, raio))
            if "gluteo" in musculos and p.y > quadril.y and no[i].y > 0.1:
                for lado in (1, -1):
                    d = math.sqrt(((p.x - lado * 0.072) / 0.088) ** 2 + ((p.z - (zq - 0.02)) / 0.115) ** 2)
                    w = max(w, (1 - smooth(0.80, 1.0, d)) * smooth(0.1, 0.3, no[i].y))
            val[i] = w

        at = self.corpo.data.attributes.get("musculo") or self.corpo.data.attributes.new("musculo", "FLOAT", "POINT")
        at.data.foreach_set("value", val)
        return sum(1 for v in val if v > 0.5)

    def materiais(self):
        mat = bpy.data.materials.new("Boneco")
        mat.use_nodes = True
        nt = mat.node_tree
        bsdf = nt.nodes["Principled BSDF"]
        bsdf.inputs["Roughness"].default_value = 0.5
        atrib = nt.nodes.new("ShaderNodeAttribute")
        atrib.attribute_name = "musculo"
        mix = nt.nodes.new("ShaderNodeMix")
        mix.data_type = "RGBA"
        mix.inputs["A"].default_value = CINZA
        mix.inputs["B"].default_value = VERMELHO
        nt.links.new(atrib.outputs["Fac"], mix.inputs["Factor"])
        nt.links.new(mix.outputs["Result"], bsdf.inputs["Base Color"])
        self.corpo.data.materials.clear()
        self.corpo.data.materials.append(mat)
        cinza = material_liso("Olho", CINZA)
        for o in getattr(self, "olhos", []):
            o.data.materials.append(cinza)


def material_liso(nome, cor, rug=0.45, metal=0.0):
    m = bpy.data.materials.get(nome)
    if m:
        return m
    m = bpy.data.materials.new(nome)
    m.use_nodes = True
    b = m.node_tree.nodes["Principled BSDF"]
    b.inputs["Base Color"].default_value = cor
    b.inputs["Roughness"].default_value = rug
    b.inputs["Metallic"].default_value = metal
    return m


def estudio(foco=Vector((0, 0, 0.9))):
    """Mundo claro, luz principal + contraluz, chão que só recebe sombra."""
    cena = bpy.context.scene
    mundo = bpy.data.worlds.new("Estudio")
    cena.world = mundo
    mundo.use_nodes = True
    bg = mundo.node_tree.nodes["Background"]
    bg.inputs["Color"].default_value = (1, 1, 1, 1)
    bg.inputs["Strength"].default_value = 0.40

    bpy.ops.mesh.primitive_plane_add(size=30, location=(0, 0, 0))
    chao = bpy.context.active_object
    chao.name = "chao"
    chao.is_shadow_catcher = True

    def area(nome, loc, energia, tam):
        bpy.ops.object.light_add(type="AREA", location=loc)
        l = bpy.context.active_object
        l.name = nome
        l.data.energy = energia
        l.data.size = tam
        d = foco - Vector(loc)
        l.rotation_euler = d.to_track_quat("-Z", "Y").to_euler()
        return l

    area("luz_principal", (-1.2, -2.2, 4.6), 330, 3.0)
    area("contraluz", (1.8, 3.2, 3.0), 200, 2.0)


def camera(pos, alvo, lente=50):
    cena = bpy.context.scene
    bpy.ops.object.camera_add(location=pos)
    cam = bpy.context.active_object
    cam.data.lens = lente
    d = Vector(alvo) - Vector(pos)
    cam.rotation_euler = d.to_track_quat("-Z", "Y").to_euler()
    cena.camera = cam
    return cam


def render_cfg(amostras=16, larg=600, alt=400, pct=100):
    cena = bpy.context.scene
    cena.render.engine = "CYCLES"
    cena.cycles.device = "CPU"
    cena.cycles.samples = amostras
    cena.cycles.use_adaptive_sampling = True
    cena.cycles.use_denoising = True
    cena.cycles.max_bounces = 4
    cena.render.film_transparent = True
    cena.render.use_persistent_data = True
    cena.render.resolution_x = larg
    cena.render.resolution_y = alt
    cena.render.resolution_percentage = pct
    cena.view_settings.view_transform = "Standard"
    cena.render.image_settings.file_format = "PNG"
    cena.render.image_settings.color_mode = "RGBA"


def render(caminho):
    bpy.context.scene.render.filepath = caminho
    bpy.ops.render.render(write_still=True)


def estudio_forte(foco=Vector((0, 0, 0.9)), mundo=0.2, chave=200, recorte=130):
    """Luz com mais contraste (pra o relevo dos músculos aparecer): pouca luz ambiente, luz principal menor
    (sombra mais definida), preenchimento fraco e duas luzes de recorte por trás. Chão só recebe sombra."""
    cena = bpy.context.scene
    m = bpy.data.worlds.new("EstudioForte")
    cena.world = m
    m.use_nodes = True
    bg = m.node_tree.nodes["Background"]
    bg.inputs["Color"].default_value = (1, 1, 1, 1)
    bg.inputs["Strength"].default_value = mundo
    bpy.ops.mesh.primitive_plane_add(size=30, location=(0, 0, 0))
    chao = bpy.context.active_object
    chao.name = "chao"
    chao.is_shadow_catcher = True

    def area(nome, loc, energia, tam):
        bpy.ops.object.light_add(type="AREA", location=loc)
        l = bpy.context.active_object
        l.name = nome
        l.data.energy = energia
        l.data.size = tam
        l.rotation_euler = (foco - Vector(loc)).to_track_quat("-Z", "Y").to_euler()
        return l

    area("luz_principal", (-1.6, -2.4, 3.3), chave, 1.1)
    for l in (area("preenche", (2.6, -2.2, 1.4), 60, 3.0), area("recorte_d", (1.9, 2.6, 2.5), recorte, 0.9),
              area("recorte_e", (-2.2, 2.2, 2.2), recorte * 0.6, 0.9)):
        l.data.use_shadow = False            # só a luz principal faz sombra no chão
