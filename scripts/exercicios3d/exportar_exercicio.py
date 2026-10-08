# Exporta UM exercício pro app: monta a cena (cenas/<cena>.py da ficha), roda a checagem em todos os quadros
# (falhou = para, sem exportar), assa a pose de cada quadro em keyframes e grava em build/exercicios/:
#   <uuid>-raw.glb  — só o esqueleto animado + o equipamento (o corpo vem do boneco único);
#   <cena>.blend    — cena completa pronta pra render de vídeo (texturas embutidas), a cópia que vai pro Drive.
#   $BLENDER -b -P exportar_exercicio.py -- <uuid> [checar [quadros]]   (checar = só a checagem, sem gravar o GLB)
import bpy, importlib, json, os, sys, time
from mathutils import Matrix
AQUI = os.path.dirname(os.path.abspath(__file__))
sys.path[:0] = [os.path.join(AQUI, "lib"), os.path.join(AQUI, "cenas")]
import config
import personagem
import boneco3d as b3
import poses3d as p3
import checagem3d as ck

args = sys.argv[sys.argv.index("--") + 1:]
UUID = args[0]
SO_CHECAR = len(args) > 1 and args[1] == "checar"
T0 = time.time()

ficha = json.load(open(os.path.join(AQUI, "fichas", UUID + ".json")))
# 16 quadros/s: 25 quadros = 1,5 s descendo. Movimento rápido (corrida na esteira, lote 6: a ponta do pé que balança chega a
# ~4,7 m/s) pede mais quadros/s na ficha ("fps") pra nenhum osso passar de SALTO_MM entre 2 quadros; o clipe continua com ida_s s.
FPS = ficha.get("fps", 16)
# movimento cíclico (ficha "ciclo": true, t = 1 igual a t = 0; o app repete): tempo em passo constante — o ease seno das idas e
# voltas frearia o ciclo na emenda
CICLO = bool(ficha.get("ciclo"))
# quadros de ida (o app faz a volta): ida_s da ficha × FPS — 1,5 s = 24 (25 quadros); um movimento longo e rápido
# (pernas estendidas subindo 80°) pede mais tempo pra nenhum osso passar de SALTO_MM por quadro; menos só pra testar
NQ = int(args[2]) if len(args) > 2 else round(ficha.get("ida_s", 1.5) * FPS)
bon = personagem.criar(ficha["alvos"], ficha["auxiliares"])
cena = bpy.context.scene
rig = bon.rig
c = importlib.import_module(ficha["cena"]).montar(bon)
print("CENA %s pronta em %.0fs" % (ficha["cena"], time.time() - T0), flush=True)


def arvore(raiz):
    return [raiz] + list(raiz.children_recursive)


objs_eq = [o for raiz in c.equipamentos + c.apoios for o in arvore(raiz)]   # o banco vai junto (parado)

# ── 1) checagem + captura da pose de cada quadro ───────────────────────────────────────────────────────
resultados, quadros, estado = [], [], {}
pontos = {"mao_esq": {}, "mao_dir": {}, "pe_esq": {}, "pe_dir": {}}   # alvos dos closes (foto.py)
for k in range(NQ + 1):
    t = k / NQ if CICLO else p3.suave(k / NQ)
    c.pose(t)
    p3.atualizar()
    r = ck.completa(bon, c, ficha.get("checagens", {}), t, "k%02d t=%.3f" % (k, t), estado)
    r["info"] = c.info()
    resultados.append(r)
    if k in (0, NQ // 2, NQ):
        chave = "%g" % round(t, 2)
        for nome, osso in (("mao_esq", "LeftHandMiddle1"), ("mao_dir", "RightHandMiddle1")):
            pontos[nome][chave] = list(p3.cabeca(rig, osso))
        for nome, L in (("pe_esq", "Left"), ("pe_dir", "Right")):
            meio = (p3.cabeca(rig, L + "Foot") + p3.cabeca(rig, L + "ToeBase")) / 2
            pontos[nome][chave] = [meio.x, meio.y, 0.05]
    locais = {pb.name: rig.convert_space(pose_bone=pb, matrix=pb.matrix, from_space="POSE", to_space="LOCAL").copy()
              for pb in rig.pose.bones}
    quadros.append((locais, {o.name: o.matrix_world.copy() for o in objs_eq}))
ok = ck.resumo(resultados)
os.makedirs(config.RELATORIOS, exist_ok=True)
with open(os.path.join(config.RELATORIOS, ficha["cena"] + ".json"), "w") as fh:
    json.dump({k: {t_: [round(x, 4) for x in p] for t_, p in v.items()} for k, v in pontos.items()}, fh, indent=1)
with open(os.path.join(config.RELATORIOS, ficha["cena"] + ".txt"), "w") as fh:
    fh.write("%s (%s) — checagem completa em %d quadros: %s\n" % (ficha["nome"], UUID, len(resultados), "OK" if ok else "FALHOU"))
    for r in resultados:
        peg = " | ".join("%s encosto %+.1f mm envolve %.0f°" % (l[0], g["encosto"], g["envolve"]) for l, g in r["pegadas"].items())
        it = r["itens"]
        fh.write("%s | %s | peso×corpo folga %.1f mm (%s) | %s\n" % (r["rotulo"], peg, r["folga"], r["onde"], r["info"]))
        fh.write("    juntas: %s\n" % " ".join("%s %.0f°" % kv for kv in it["juntas"].items()))
        fh.write("    pés (planta/calcanhar mm): %s | corpo×corpo (mm): %s\n" % (
            " ".join("%s %+.1f/%+.1f" % (k, *v) for k, v in it["pes"].items()),
            " ".join("%s %.1f" % kv for kv in it["corpo"].items())))
        fh.write("    zonas (mm): %s | ângulos-chave: %s | rigidez %.1f mm | salto %.0f mm\n" % (
            " ".join("%s %.1f" % kv for kv in it["zonas"].items()) or "-",
            " | ".join("%s %s" % kv for kv in it["angulos"].items()) or "-",
            it["rigidez"], it.get("salto", 0)))
        fh.write("    técnica (graus, mm, ×): %s\n" % ck.tc.texto(it["tecnica"]))
        if c.apoios:
            fh.write("    corpo no apoio: afunda %.1f mm (%s)\n" % it["apoio"])
        fh.write("    %s\n" % ("OK" if not r["falhas"] else "FALHA: " + "; ".join(r["falhas"])))
if not ok:
    sys.stdout.flush()
    os._exit(1)
if SO_CHECAR:
    os._exit(0)

# ── 2) keyframes: o que as restrições (IK, travas) fizeram vira animação simples ───────────────────────
for pb in rig.pose.bones:
    for cn in list(pb.constraints):
        pb.constraints.remove(cn)
    pb.rotation_mode = "QUATERNION"
rig.animation_data_create()
rig.animation_data.action = bpy.data.actions.new(ficha["cena"])
for o in objs_eq:
    for cn in list(o.constraints):
        o.constraints.remove(cn)
    o.rotation_mode = "QUATERNION"
    o.animation_data_create()
    o.animation_data.action = bpy.data.actions.new(ficha["cena"] + "_" + o.name)
anterior = {}


def continuo(chave, q):
    """Mesmo giro com sinal contínuo entre quadros (sem a volta longa na interpolação)."""
    if chave in anterior and q.dot(anterior[chave]) < 0:
        q.negate()
    anterior[chave] = q
    return q


def basis_eq(o, mundos):
    """Transformação local do objeto do equipamento no quadro (pai já no lugar)."""
    pai = (mundos[o.parent.name] @ o.matrix_parent_inverse) if o.parent else None
    return pai.inverted() @ mundos[o.name] if pai is not None else mundos[o.name]


def mexe(mats, tol=1e-5):
    """A matriz muda entre os quadros?"""
    plano = [[x for linha in m for x in linha] for m in mats]
    return any(max(abs(a - b) for a, b in zip(p, plano[0])) > tol for p in plano[1:])


# só vai pro arquivo o que muda (osso que só gira não leva posição; peça presa ao pai não leva nada; escala nunca, fora
# a peça marcada com a propriedade "anima_escala" — o cabo da polia, que estica e encolhe: equip3d.polia, lote 3)
move_osso = {pb.name: mexe([Matrix.Translation(q[0][pb.name].to_translation()) for q in quadros])
             for pb in rig.pose.bones}
eq_anima = [o for o in objs_eq if mexe([basis_eq(o, q[1]) for q in quadros])]
eq_escala = [o for o in eq_anima if o.get("anima_escala")]
for f, (locais, mundos) in enumerate(quadros):
    for pb in rig.pose.bones:
        pb.matrix_basis = locais[pb.name]
        pb.rotation_quaternion = continuo(pb.name, pb.rotation_quaternion.copy())
        pb.keyframe_insert("rotation_quaternion", frame=f)
        if move_osso[pb.name]:
            pb.keyframe_insert("location", frame=f)
    for o in objs_eq:                               # pai primeiro (ordem da árvore): basis = local já com o pai no lugar
        loc, rot, esc = basis_eq(o, mundos).decompose()
        o.location, o.rotation_quaternion, o.scale = loc, continuo(o.name, rot), esc
        if o in eq_anima:
            o.keyframe_insert("location", frame=f)
            o.keyframe_insert("rotation_quaternion", frame=f)
        if o in eq_escala:
            o.keyframe_insert("scale", frame=f)
print("ANIMAÇÃO: %d ossos, %d com posição, equipamento animado: %s%s" % (
    len(move_osso), sum(move_osso.values()), [o.name for o in eq_anima],
    " | com escala: %s" % [o.name for o in eq_escala] if eq_escala else ""), flush=True)
cena.frame_start, cena.frame_end = 0, NQ
cena.render.fps = FPS
cena.frame_set(0)

# ── 3) .blend pronto pra vídeo (Drive): luz, câmera do vídeo, render 1920×1280, texturas embutidas ────────
DESTINO = os.path.join(config.AQUI, "build", "exercicios")
os.makedirs(DESTINO, exist_ok=True)
b3.estudio_forte(foco=c.foco_luz)
pos, alvo, lente = c.camera_video
b3.camera(pos, alvo, lente)
b3.render_cfg(amostras=24, larg=1920, alt=1280)
bpy.ops.file.pack_all()
caminho_blend = os.path.join(DESTINO, ficha["cena"] + ".blend")
bpy.ops.wm.save_as_mainfile(filepath=caminho_blend, compress=True)
print("BLEND %s %.1f MB" % (caminho_blend, os.path.getsize(caminho_blend) / 1e6), flush=True)

# ── 4) GLB do app: só esqueleto + equipamento ──────────────────────────────────────────────────────────
for o in list(cena.objects):
    if o is not rig and o not in objs_eq:
        bpy.data.objects.remove(o, do_unlink=True)
bpy.ops.object.select_all(action="DESELECT")
for o in [rig] + objs_eq:
    o.select_set(True)
glb = os.path.join(DESTINO, UUID + "-raw.glb")
opcoes = dict(filepath=glb, export_format="GLB", use_selection=True, export_apply=True, export_yup=True,
              export_texcoords=True, export_normals=True, export_materials="EXPORT", export_animations=True,
              export_animation_mode="ACTIVE_ACTIONS", export_force_sampling=True, export_skins=True,
              export_def_bones=False, export_lights=False, export_cameras=False)
validas = set(bpy.ops.export_scene.gltf.get_rna_type().properties.keys())
bpy.ops.export_scene.gltf(**{k: v for k, v in opcoes.items() if k in validas})
print("GLB %s %.0f KB | total %.0fs" % (glb, os.path.getsize(glb) / 1024, time.time() - T0), flush=True)
