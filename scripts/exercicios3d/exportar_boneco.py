# Boneco único do app (1 arquivo pra todos os exercícios): malha leve com esqueleto, cor e relevo assados em
# textura, SEM músculo vermelho (o app pinta alvo/auxiliares na hora com o mapa musculos-<v>.png).
#   $BLENDER -b -P exportar_boneco.py -- [textura=2048]
# Sai em build/boneco/: boneco-raw.glb (sem compressão; a compressão é o comprimir.sh) + as texturas em PNG.
import bpy, os, sys, time
import numpy as np
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "lib"))
import config
import personagem
import poses3d as p3

args = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
TEXR = int(args[0]) if args else 2048
DESTINO = os.path.join(config.AQUI, "build", "boneco")
os.makedirs(DESTINO, exist_ok=True)
T0 = time.time()

bon = personagem.criar()                      # sem alvo: pele cinza com sombra/oclusão
cena = bpy.context.scene
corpo, rig = bon.corpo, bon.rig
print("BONECO pronto em %.0fs | modificadores: %s" % (time.time() - T0, [(m.name, m.type) for m in corpo.modifiers]),
      flush=True)

# ── assar cor + relevo da malha alta (Suave 3 + Relevo) na malha leve (Suave 1), em repouso ───────────────
rig.data.pose_position = "REST"
p3.atualizar()
alta = corpo.copy()
alta.data = corpo.data.copy()
alta.name = "corpo_alta"
cena.collection.objects.link(alta)
alta.modifiers["Suave"].levels = alta.modifiers["Suave"].render_levels = 3
alta.modifiers["Relevo"].show_viewport = alta.modifiers["Relevo"].show_render = True
sub, rel = corpo.modifiers["Suave"], corpo.modifiers["Relevo"]
sub.levels = sub.render_levels = 1            # malha que vai pro celular
rel.show_viewport = rel.show_render = False

mat = corpo.data.materials[0]
alvo_img = mat.node_tree.nodes.new("ShaderNodeTexImage")
mat.node_tree.nodes.active = alvo_img


def assar(nome, tipo, nao_cor=False, **kw):
    img = bpy.data.images.new(nome, TEXR, TEXR, alpha=False)
    if nao_cor:
        img.colorspace_settings.name = "Non-Color"
    alvo_img.image = img
    t = time.time()
    bpy.ops.object.bake(type=tipo, use_selected_to_active=True, cage_extrusion=0.015, max_ray_distance=0.03,
                        margin=16, **kw)
    img.filepath_raw = os.path.join(DESTINO, nome + ".png")
    img.file_format = "PNG"
    img.save()
    print("ASSADO %s em %.0fs" % (nome, time.time() - t), flush=True)
    return img


cena.render.engine = "CYCLES"
cena.cycles.device = "CPU"
bpy.ops.object.select_all(action="DESELECT")
alta.select_set(True)
corpo.select_set(True)
bpy.context.view_layer.objects.active = corpo
cena.cycles.samples = 16
img_cor = assar("boneco_cor", "DIFFUSE", pass_filter={"COLOR"})
cena.cycles.samples = 4
img_nor = assar("boneco_normal", "NORMAL", nao_cor=True, normal_space="TANGENT")
bpy.data.objects.remove(alta, do_unlink=True)


def material_exportavel(nome, cor_img, normal_img=None, rug=0.55, alfa=False):
    m = bpy.data.materials.new(nome)
    m.use_nodes = True
    Nn, Ll = m.node_tree.nodes, m.node_tree.links
    b = Nn["Principled BSDF"]
    b.inputs["Roughness"].default_value = rug
    tc = Nn.new("ShaderNodeTexImage")
    tc.image = cor_img
    Ll.new(tc.outputs["Color"], b.inputs["Base Color"])
    if alfa:
        Ll.new(tc.outputs["Alpha"], b.inputs["Alpha"])
    if normal_img is not None:
        tn = Nn.new("ShaderNodeTexImage")
        tn.image = normal_img
        tn.image.colorspace_settings.name = "Non-Color"
        nm = Nn.new("ShaderNodeNormalMap")
        Ll.new(tn.outputs["Color"], nm.inputs["Color"])
        Ll.new(nm.outputs["Normal"], b.inputs["Normal"])
    return m


corpo.data.materials.clear()
corpo.data.materials.append(material_exportavel("boneco_pele", img_cor, img_nor))   # o app acha o corpo por esse nome


def cinza_com_alfa(obj, alvo, nome):
    """Cabelo/sobrancelha: o material do Blender tira o cinza da textura (RGBToBW × ganho); aqui vira imagem."""
    m = obj.data.materials[0]
    tex = next(n for n in m.node_tree.nodes if n.type == "TEX_IMAGE" and n.image and n.image.colorspace_settings.name != "Non-Color")
    nor = next((n.image for n in m.node_tree.nodes if n.type == "TEX_IMAGE" and n.image
                and n.image.colorspace_settings.name == "Non-Color"), None)
    img = tex.image
    w, h = img.size
    px = np.empty(w * h * 4, dtype=np.float32)
    img.pixels.foreach_get(px)
    px = px.reshape(h, w, 4)
    lin = np.where(px[..., :3] <= 0.04045, px[..., :3] / 12.92, ((px[..., :3] + 0.055) / 1.055) ** 2.4)
    lum = lin @ np.array([0.2126, 0.7152, 0.0722], dtype=np.float32)
    opaco = px[..., 3] > 0.5
    media = float((px[..., :3] @ np.array([0.2126, 0.7152, 0.0722], dtype=np.float32))[opaco].mean())
    v = np.clip(lum * (alvo / max(media, 1e-4)), 0, 1)
    s = np.where(v <= 0.0031308, v * 12.92, 1.055 * v ** (1 / 2.4) - 0.055)
    out = np.dstack([s, s, s, px[..., 3]]).astype(np.float32)
    novo = bpy.data.images.new(nome, w, h, alpha=True)
    novo.pixels.foreach_set(out.ravel())
    novo.filepath_raw = os.path.join(DESTINO, nome + ".png")
    novo.file_format = "PNG"
    novo.save()
    obj.data.materials.clear()
    obj.data.materials.append(material_exportavel(nome, novo, nor, rug=0.6, alfa=True))


cinza_com_alfa(bon.cabelo, 0.045, "cabelo")
cinza_com_alfa(bon.sobrancelhas, 0.03, "sobrancelha")
rig.data.pose_position = "POSE"

# ── exportar (sem animação; cada exercício traz a sua) ─────────────────────────────────────────────────
for o in list(cena.objects):
    if o.type in ("LIGHT", "CAMERA", "EMPTY") or o.name == "chao":
        bpy.data.objects.remove(o, do_unlink=True)
sel = [rig, corpo, bon.cabelo, bon.sobrancelhas] + list(getattr(bon, "olhos", []))
bpy.ops.object.select_all(action="DESELECT")
for o in sel:
    o.select_set(True)
dg = bpy.context.evaluated_depsgraph_get()
tri_total = 0
for o in sel:
    if o.type == "MESH":
        me = o.evaluated_get(dg).to_mesh()
        tri = sum(len(p.vertices) - 2 for p in me.polygons)
        tri_total += tri
        print("MALHA %-28s %6d vértices %6d triângulos" % (o.name, len(me.vertices), tri))
        o.evaluated_get(dg).to_mesh_clear()
glb = os.path.join(DESTINO, "boneco-raw.glb")
opcoes = dict(filepath=glb, export_format="GLB", use_selection=True, export_apply=True, export_yup=True,
              export_texcoords=True, export_normals=True, export_tangents=True, export_materials="EXPORT",
              export_image_format="WEBP", export_image_quality=90, export_animations=False, export_skins=True,
              export_def_bones=False, export_lights=False, export_cameras=False)
validas = set(bpy.ops.export_scene.gltf.get_rna_type().properties.keys())
bpy.ops.export_scene.gltf(**{k: v for k, v in opcoes.items() if k in validas})
print("GLB %s %.1f MB | %d triângulos | total %.0fs" % (glb, os.path.getsize(glb) / 1e6, tri_total, time.time() - T0),
      flush=True)
