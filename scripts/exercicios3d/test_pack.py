# Manifesto do 3D: só entra exercício com movimento + foto; músculo sem id falha; caminhos sempre em /exercicios3d/.
# .venv/bin/python -m pytest -q test_pack.py
import json

import pytest

import pack

UUID = "11111111-2222-3333-4444-555555555555"


def _montar(tmp_path, arquivos, alvos=("quadriceps",), extra=None):
    pub, fichas = tmp_path / "pub", tmp_path / "fichas"
    pub.mkdir()
    fichas.mkdir()
    for nome in arquivos:
        (pub / nome).write_bytes(b"x" * 10)
    (fichas / (UUID + ".json")).write_text(json.dumps({
        "uuid": UUID, "nome": "Teste", "alvos": list(alvos), "auxiliares": ["gluteo"],
        "camera": {"az": 0, "el": 8}, **(extra or {})}))
    ids = tmp_path / "ids.json"
    ids.write_text(json.dumps({"quadriceps": 15, "gluteo": 8}))
    return dict(pub=str(pub), fichas_dir=str(fichas), ids_json=str(ids))


def test_exercicio_com_movimento_e_foto_entra(tmp_path):
    man = pack.gerar(**_montar(tmp_path, ["boneco-1.glb", "musculos-1.png", UUID + "-7.glb", UUID + "-7.webp"]))
    e = man["exercicios"][UUID]
    assert e["alvos"] == [15] and e["auxiliares"] == [8] and e["bytes"] == 20
    assert e["movimento"] == "/exercicios3d/%s-7.glb" % UUID
    assert all(v.startswith("/exercicios3d/") for v in (e["foto"], man["boneco"]["glb"], man["boneco"]["mapa"]))


def test_ficha_sem_foto_fica_fora(tmp_path):
    man = pack.gerar(**_montar(tmp_path, ["boneco-1.glb", "musculos-1.png", UUID + "-7.glb"]))
    assert man["exercicios"] == {}


def test_musculo_sem_id_falha(tmp_path):
    with pytest.raises(SystemExit):
        pack.gerar(**_montar(tmp_path, ["boneco-1.glb", "musculos-1.png", UUID + "-7.glb", UUID + "-7.webp"],
                             alvos=("nao_existe",)))


def test_dois_bonecos_falha(tmp_path):
    with pytest.raises(SystemExit):
        pack.gerar(**_montar(tmp_path, ["boneco-1.glb", "boneco-2.glb", "musculos-1.png"]))


ARQUIVOS = ["boneco-1.glb", "musculos-1.png", UUID + "-7.glb", UUID + "-7.webp"]


def test_movimento_ciclico_vai_pro_manifesto(tmp_path):
    # corrida na esteira: o app repete o ciclo (t=1 = t=0) em vez de ir e voltar
    man = pack.gerar(**_montar(tmp_path, ARQUIVOS, extra={"ciclo": True}))
    assert man["exercicios"][UUID]["ciclo"] is True


def test_movimento_de_ida_e_volta_nao_ganha_ciclo(tmp_path):
    man = pack.gerar(**_montar(tmp_path, ARQUIVOS))
    assert "ciclo" not in man["exercicios"][UUID]
