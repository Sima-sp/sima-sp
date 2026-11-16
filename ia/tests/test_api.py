"""Contrato HTTP do serviço (schema, modos, fallback)."""

import math

import numpy as np
import pandas as pd
import pytest
from fastapi.testclient import TestClient

from app.fonte_chuva import ServicoChuva
from app.main import criar_app
from app.predictor import Preditor
from src.sensor_adjust import chance_com_fator, fator_da_agua
from src.tempo import agora_utc

CAMPOS_RESPOSTA = {
    "probabilidadeAlagamento", "probabilidadeModelo", "fatorSensor",
    "nivelRisco", "janelaHoras", "geradaEm", "validaAte",
    "medicaoTransbordando", "ajusteSensorAplicado", "fonteChuva", "modeloVersao",
    "nivelRiscoModelo", "origem", "horaReferencia", "semLeituraSensor", "avisos",
}


def _cliente(config, buscador):
    preditor = Preditor(config, servico_chuva=ServicoChuva(buscador=buscador))
    return TestClient(criar_app(preditor)), preditor


@pytest.fixture
def cliente_modelo(config_com_modelo, buscador_falso):
    cliente, preditor = _cliente(config_com_modelo, buscador_falso(valores_finais=[2.0, 8.0, 20.0]))
    with cliente:
        yield cliente, preditor


def _ponto(preditor):
    p = preditor.resolvedor.pontos.iloc[0]
    return float(p["lat"]), float(p["lon"])


def test_health_e_model_info(cliente_modelo):
    cliente, _ = cliente_modelo
    saude = cliente.get("/health").json()
    assert saude["status"] == "ok" and saude["modeloVersao"] == "teste" and saude["origem"] == "MODELO"
    info = cliente.get("/model-info").json()
    assert "features" in info and "limiares" in info


def test_payload_antigo_continua_valido(cliente_modelo):
    cliente, preditor = cliente_modelo
    lat, lon = _ponto(preditor)
    r = cliente.post("/predict", json={"nivelAgua": 50.0, "porcentagemLixo": 10.0, "chuvaMm": 3.0,
                                       "latitude": lat, "longitude": lon})
    assert r.status_code == 200, r.text
    corpo = r.json()
    assert CAMPOS_RESPOSTA <= corpo.keys()
    assert 0 <= corpo["probabilidadeAlagamento"] <= 1
    # água até a metade: o sensor não muda nada
    assert corpo["fatorSensor"] == 1
    assert corpo["probabilidadeAlagamento"] == corpo["probabilidadeModelo"]
    assert corpo["nivelRisco"] == corpo["nivelRiscoModelo"]
    assert corpo["nivelRisco"] in {"BAIXO", "MEDIO", "ALTO"}
    assert corpo["janelaHoras"] == 3
    assert corpo["fonteChuva"] == "OPEN_METEO"
    assert corpo["pontoId"] is not None
    assert pd.Timestamp(corpo["validaAte"]) - pd.Timestamp(corpo["geradaEm"]) == pd.Timedelta(minutes=30)
    assert corpo["chuvaRecente3hMm"] == 30.0


def test_payload_novo_do_briefing(cliente_modelo):
    cliente, preditor = cliente_modelo
    lat, lon = _ponto(preditor)
    r = cliente.post("/predict", json={
        "sensorId": 12, "latitude": lat, "longitude": lon,
        "timestamp": agora_utc().tz_convert("America/Sao_Paulo").isoformat(),
        "nivelAgua": 82.0,
        "chuva": {"chuva_1h": 12.4, "chuva_3h": 30.0, "chuva_24h": 41.2},
    })
    assert r.status_code == 200, r.text
    corpo = r.json()
    assert corpo["sensorId"] == 12
    assert corpo["fonteChuva"] == "INFORMADA"
    # água em 82 %: a chance do modelo é multiplicada pelo fator da tabela (na razão de chances)
    assert math.isclose(corpo["fatorSensor"], round(fator_da_agua(82), 4))
    # as duas chances vêm arredondadas a 4 casas e o fator amplia esse arredondamento
    esperada = chance_com_fator(corpo["probabilidadeModelo"], fator_da_agua(82))
    assert math.isclose(corpo["probabilidadeAlagamento"], esperada, rel_tol=0.02)
    assert corpo["probabilidadeAlagamento"] > corpo["probabilidadeModelo"]
    assert len(corpo["motivosAjuste"]) == 1 and "nivelAgua 82%" in corpo["motivosAjuste"][0]
    assert corpo["ajusteSensorAplicado"] is (corpo["nivelRisco"] != corpo["nivelRiscoModelo"])
    assert corpo["nivelRisco"] != "CRITICO" and corpo["medicaoTransbordando"] is False


def test_lixo_e_chuva_mm_sao_aceitos_e_ignorados(cliente_modelo):
    """O backend ainda manda porcentagemLixo e chuvaMm (#18): a resposta é a mesma sem eles."""
    cliente, preditor = cliente_modelo
    lat, lon = _ponto(preditor)
    base = {"latitude": lat, "longitude": lon, "nivelAgua": 70.0,
            "chuva": {"chuva_1h": 12.4, "chuva_3h": 30.0, "chuva_24h": 41.2}}
    sem = cliente.post("/predict", json=base).json()
    com = cliente.post("/predict", json={**base, "porcentagemLixo": 120, "chuvaMm": 80.0}).json()
    for campo in ("probabilidadeAlagamento", "probabilidadeModelo", "fatorSensor", "nivelRisco",
                  "motivosAjuste", "fonteChuva", "chuvaRecente3hMm"):
        assert com[campo] == sem[campo], campo
    assert not any("lixo" in m.lower() for m in com["motivosAjuste"])


def test_transbordando_e_medicao(cliente_modelo):
    cliente, preditor = cliente_modelo
    lat, lon = _ponto(preditor)
    corpo = cliente.post("/predict", json={"latitude": lat, "longitude": lon, "nivelAgua": 100}).json()
    assert corpo["medicaoTransbordando"] is True and corpo["nivelRisco"] == "CRITICO"
    assert corpo["nivelRiscoModelo"] != "CRITICO" and corpo["ajusteSensorAplicado"] is True
    assert corpo["fatorSensor"] == 12


def test_sem_leitura_do_sensor(cliente_modelo):
    cliente, preditor = cliente_modelo
    lat, lon = _ponto(preditor)
    corpo = cliente.post("/predict", json={"latitude": lat, "longitude": lon}).json()
    assert corpo["semLeituraSensor"] is True and corpo["ajusteSensorAplicado"] is False
    assert corpo["fatorSensor"] == 1
    assert corpo["probabilidadeAlagamento"] == corpo["probabilidadeModelo"]
    assert corpo["nivelRisco"] == corpo["nivelRiscoModelo"]


def test_critico_so_com_medicao(cliente_modelo):
    """#23: em nenhuma combinação de chuva e água o serviço devolve CRITICO sem medição."""
    cliente, preditor = cliente_modelo
    lat, lon = _ponto(preditor)
    chuvas = [[0.0] * 72, [0.0] * 69 + [5.0, 20.0, 45.0], [30.0] * 72]
    lote = [{"latitude": lat, "longitude": lon, "chuvaHoraria": c, "nivelAgua": a}
            for c in chuvas for a in (None, 0, 50, 65, 80, 99, 99.9, 100, 150)]
    itens = cliente.post("/predict/batch", json=lote).json()
    assert all(i["sucesso"] for i in itens)
    for pedido, item in zip(lote, itens, strict=True):
        previsao = item["previsao"]
        transbordando = pedido["nivelAgua"] is not None and pedido["nivelAgua"] >= 100
        assert previsao["medicaoTransbordando"] is transbordando
        assert (previsao["nivelRisco"] == "CRITICO") is transbordando
        assert previsao["nivelRiscoModelo"] != "CRITICO"


def test_chuva_horaria_informada(cliente_modelo):
    cliente, preditor = cliente_modelo
    lat, lon = _ponto(preditor)
    serie = [0.0] * 69 + [5.0, 20.0, 45.0]
    corpo = cliente.post("/predict", json={"latitude": lat, "longitude": lon, "chuvaHoraria": serie}).json()
    assert corpo["fonteChuva"] == "INFORMADA" and corpo["chuvaRecente3hMm"] == 70.0


def test_chuva_horaria_curta_e_rejeitada(cliente_modelo):
    cliente, _ = cliente_modelo
    r = cliente.post("/predict", json={"latitude": -23.5, "longitude": -46.6, "chuvaHoraria": [1.0] * 10})
    assert r.status_code == 422


def test_validacao_de_entrada(cliente_modelo):
    cliente, _ = cliente_modelo
    assert cliente.post("/predict", json={"latitude": 200, "longitude": -46.6}).status_code == 422
    assert cliente.post("/predict", json={"latitude": -23.5, "longitude": -46.6,
                                          "nivelAgua": 250}).status_code == 422


def test_lote_mantem_ordem_e_isola_erros(config_com_modelo, buscador_falso):
    cliente, preditor = _cliente(config_com_modelo, buscador_falso(falhar=True))
    lat, lon = _ponto(preditor)
    with cliente:
        r = cliente.post("/predict/batch", json=[
            {"sensorId": 1, "latitude": lat, "longitude": lon},  # sem chuva -> erro
            {"sensorId": 2, "latitude": lat, "longitude": lon, "chuva": {"chuva_1h": 10}},
            {"sensorId": 3, "latitude": lat, "longitude": lon, "chuvaHoraria": [0.0] * 72},
        ])
    assert r.status_code == 200
    itens = r.json()
    assert [i["sensorId"] for i in itens] == [1, 2, 3]
    assert itens[0]["sucesso"] is False and itens[0]["codigoErro"] == "CHUVA_INDISPONIVEL"
    assert itens[1]["sucesso"] and itens[1]["previsao"]["fonteChuva"] == "INFORMADA"
    assert itens[2]["sucesso"]


def test_sem_chuva_devolve_503(config_com_modelo, buscador_falso):
    cliente, preditor = _cliente(config_com_modelo, buscador_falso(falhar=True))
    lat, lon = _ponto(preditor)
    with cliente:
        r = cliente.post("/predict", json={"latitude": lat, "longitude": lon})
    assert r.status_code == 503
    assert r.json()["codigo"] == "CHUVA_INDISPONIVEL"


def test_chuva_mm_nao_e_mais_fonte_de_chuva(config_com_modelo, buscador_falso):
    """Sem Open-Meteo e sem cache, chuvaMm não salva a previsão: 503 e o backend decide."""
    cliente, preditor = _cliente(config_com_modelo, buscador_falso(falhar=True))
    lat, lon = _ponto(preditor)
    with cliente:
        r = cliente.post("/predict", json={"latitude": lat, "longitude": lon, "chuvaMm": 12})
    assert r.status_code == 503 and r.json()["codigo"] == "CHUVA_INDISPONIVEL"


def test_timestamp_fora_da_janela(cliente_modelo):
    cliente, preditor = cliente_modelo
    lat, lon = _ponto(preditor)
    r = cliente.post("/predict", json={"latitude": lat, "longitude": lon, "timestamp": "2020-01-01T10:00:00-03:00"})
    assert r.status_code == 422 and r.json()["codigo"] == "CHUVA_FORA_DA_JANELA"


def test_modo_regras_sem_modelo(config_sem_modelo, buscador_falso):
    cliente, _ = _cliente(config_sem_modelo, buscador_falso(valores_finais=[10.0, 15.0, 20.0]))
    with cliente:
        assert cliente.get("/health").json()["origem"] == "REGRAS"
        corpo = cliente.post("/predict", json={"latitude": -23.5, "longitude": -46.6}).json()
    assert corpo["origem"] == "REGRAS"
    assert corpo["probabilidadeAlagamento"] is None
    assert corpo["modeloVersao"] == "regras-v0"
    assert corpo["nivelRisco"] == "ALTO"  # 20 mm/1h e 45 mm/3h -> ALTO pelas regras provisórias
    assert corpo["avisos"]


def test_modo_regras_vai_ate_alto_e_critico_so_quando_transborda(config_sem_modelo, buscador_falso):
    # 60 mm na última hora: pelas regras provisórias seria CRITICO; agora o teto é ALTO
    cliente, _ = _cliente(config_sem_modelo, buscador_falso(valores_finais=[10.0, 15.0, 60.0]))
    with cliente:
        sem_sensor = cliente.post("/predict", json={"latitude": -23.5, "longitude": -46.6}).json()
        agua_alta = cliente.post("/predict", json={"latitude": -23.5, "longitude": -46.6,
                                                   "nivelAgua": 85}).json()
        cheio = cliente.post("/predict", json={"latitude": -23.5, "longitude": -46.6,
                                               "nivelAgua": 100}).json()
        info = cliente.get("/model-info").json()
    assert sem_sensor["nivelRisco"] == "ALTO" and sem_sensor["fatorSensor"] is None
    assert agua_alta["nivelRisco"] == "ALTO" and agua_alta["fatorSensor"] is None
    assert agua_alta["ajusteSensorAplicado"] is False  # já estava no teto da previsão
    assert agua_alta["probabilidadeAlagamento"] is None and agua_alta["probabilidadeModelo"] is None
    assert any("modo regras" in a for a in agua_alta["avisos"])
    assert cheio["nivelRisco"] == "CRITICO" and cheio["medicaoTransbordando"] is True
    assert info["nivelMaximoPrevisao"] == "ALTO"
    assert info["ajusteSensor"]["modoRegras"]["nivelAguaAlerta"] == 80


def test_modo_regras_agua_alta_sobe_um_nivel(config_sem_modelo, buscador_falso):
    """Sem modelo a leitura de água continua contando: a partir de 80 % sobe um nível."""
    pedido = {"latitude": -23.5, "longitude": -46.6}

    def _niveis(valores_finais):
        cliente, _ = _cliente(config_sem_modelo, buscador_falso(valores_finais=valores_finais))
        with cliente:
            return {agua: cliente.post("/predict", json={**pedido, "nivelAgua": agua}).json()
                    for agua in (40, 79, 80, 99)}

    seco = _niveis([0.0, 0.0, 0.0])
    assert all(r["nivelRiscoModelo"] == "BAIXO" and r["fatorSensor"] is None for r in seco.values())
    assert seco[40]["nivelRisco"] == "BAIXO" and seco[79]["nivelRisco"] == "BAIXO"
    assert seco[40]["ajusteSensorAplicado"] is False and not seco[40]["motivosAjuste"]
    for agua in (80, 99):
        assert seco[agua]["nivelRisco"] == "MEDIO" and seco[agua]["ajusteSensorAplicado"] is True
        assert any("sobe um nível" in m for m in seco[agua]["motivosAjuste"])
        assert seco[agua]["medicaoTransbordando"] is False
        assert any("modo regras" in a for a in seco[agua]["avisos"])


class _PacoteFixo:
    """Modelo de mentira que devolve sempre a mesma chance (para testar os níveis)."""

    versao, nome_modelo, features, metadados = "fixo", "fixo", [], {}

    def __init__(self, probabilidade, limiares):
        self.probabilidade = probabilidade
        self.limiares = limiares

    def prever_probabilidade(self, df):
        return np.full(len(df), self.probabilidade)


def test_chance_do_modelo_acima_do_limiar_critico_sem_leitura_e_alto(config_com_modelo, buscador_falso):
    pacote = _PacoteFixo(0.6, {"MEDIO": 0.004, "ALTO": 0.012, "CRITICO": 0.25})
    preditor = Preditor(config_com_modelo, servico_chuva=ServicoChuva(buscador=buscador_falso([5.0])),
                        pacote=pacote)
    lat, lon = _ponto(preditor)
    with TestClient(criar_app(preditor)) as cliente:
        corpo = cliente.post("/predict", json={"latitude": lat, "longitude": lon}).json()
        info = cliente.get("/model-info").json()
    assert corpo["probabilidadeModelo"] == 0.6 and corpo["probabilidadeAlagamento"] == 0.6
    assert corpo["nivelRiscoModelo"] == "ALTO" and corpo["nivelRisco"] == "ALTO"
    assert corpo["medicaoTransbordando"] is False
    # o limiar CRITICO continua no arquivo (histórico), mas não está entre os usados
    assert info["limiares"]["CRITICO"] == 0.25
    assert info["limiaresEmUso"] == {"MEDIO": 0.004, "ALTO": 0.012}
    assert info["nivelMaximoPrevisao"] == "ALTO"


def test_sensor_longe_de_ponto_conhecido(cliente_modelo):
    cliente, _ = cliente_modelo
    corpo = cliente.post("/predict", json={"latitude": -23.70, "longitude": -46.40}).json()
    assert corpo["pontoId"] is None and any("ponto conhecido" in a for a in corpo["avisos"])


def test_nivel_com_acento_configuravel(config_com_modelo, buscador_falso):
    config = config_com_modelo.model_copy(update={"nivel_risco_com_acento": True})
    cliente, preditor = _cliente(config, buscador_falso())
    lat, lon = _ponto(preditor)
    with cliente:
        corpo = cliente.post("/predict", json={"latitude": lat, "longitude": lon, "nivelAgua": 100}).json()
    assert corpo["nivelRisco"] == "CRÍTICO"
