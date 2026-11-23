"""Testes de bom senso do modelo em uso (#27).

Os outros testes conferem o código (features, rótulos, calibração, API) com um modelo treinado
na hora sobre dados sintéticos. Estes carregam o modelo de verdade, ``models/flood_lgbm_v1.joblib``,
e conferem o COMPORTAMENTO dele em casos óbvios. Se um retreino ou uma troca de biblioteca
produzir um modelo que, por exemplo, baixa o risco quando chove mais, é aqui que aparece.

Regra combinada na issue: se um caso falhar com o v1, o teste NÃO é ajustado para passar. Ele
fica marcado como falha esperada (``xfail`` estrito), com o achado descrito, e passa a avisar se
um modelo novo corrigir o problema.

As features saem do mesmo ``features_ao_vivo`` que o serviço usa. A chuva e o calendário são
calculados uma vez por cenário e horário; as características de cada ponto (as de
``models/pontos_v1.csv``) entram depois, como o próprio ``features_ao_vivo`` faz.
"""

from __future__ import annotations

from pathlib import Path

import numpy as np
import pandas as pd
import pytest

from src.features import COLUNAS_PONTO, features_ao_vivo
from src.niveis import NivelRisco, nivel_previsto

VERSAO = "v1"
DIR_MODELOS = Path(__file__).resolve().parents[1] / "models"

# Os cenários do modo de demonstração (backend: CenarioChuvaEnum; aqui: scripts/demo_cenarios.py),
# mais uma chuva fraca. Cada lista é o fim de uma série de 72 h, em mm por hora; o último valor é
# a hora de referência.
CENARIOS = {
    "seco": [],
    "fraca": [0.5, 1.0, 1.0],  # 2,5 mm em 3 h
    "moderada": [0.0, 0.5, 1.0, 3.0, 4.0, 2.0],  # CHUVA_MODERADA: 10,5 mm em 5 h
    "forte": [0.5, 2.0, 6.0, 15.0, 25.0, 20.0],  # CHUVA_FORTE: 68,5 mm em 6 h
}
EM_ORDEM = ["seco", "fraca", "moderada", "forte"]

# Horários conferidos: estação chuvosa e seca, madrugada e fim de tarde (hora de São Paulo).
MESES = [1, 4, 7, 10, 12]
HORAS = [0, 6, 12, 15, 18, 21]
INSTANTES = [
    pd.Timestamp(f"2026-{mes:02d}-15 {hora:02d}:00", tz="America/Sao_Paulo").tz_convert("UTC")
    for mes in MESES
    for hora in HORAS
]


@pytest.fixture(scope="module")
def pacote():
    if not (DIR_MODELOS / f"flood_lgbm_{VERSAO}.joblib").exists():
        pytest.skip(f"modelo {VERSAO} não está em {DIR_MODELOS}")
    from src.artefatos import carregar_pacote

    return carregar_pacote(VERSAO, DIR_MODELOS)


@pytest.fixture(scope="module")
def pontos():
    return pd.read_csv(DIR_MODELOS / f"pontos_{VERSAO}.csv")


def serie(ultimas: list[float], fim: pd.Timestamp) -> pd.Series:
    valores = [0.0] * (72 - len(ultimas)) + list(ultimas)
    return pd.Series(valores, index=pd.date_range(end=fim, periods=72, freq="h"), dtype="float64")


def matriz(cenario: str, instante: pd.Timestamp, pontos: pd.DataFrame) -> pd.DataFrame:
    """Uma linha de features por ponto, para a mesma chuva e o mesmo horário."""
    chuva = serie(CENARIOS[cenario], instante.floor("h"))
    linha, _, _ = features_ao_vivo(chuva, instante, {}, None)
    tabela = pd.concat([linha] * len(pontos), ignore_index=True)
    for coluna in COLUNAS_PONTO:
        tabela[coluna] = pontos[coluna].to_numpy()
    return tabela


def chances(pacote, cenario: str, instante: pd.Timestamp, pontos: pd.DataFrame) -> np.ndarray:
    return np.asarray(pacote.prever_probabilidade(matriz(cenario, instante, pontos)), dtype=float)


def niveis(pacote, probabilidades: np.ndarray) -> list[NivelRisco]:
    return [nivel_previsto(float(p), pacote.limiares) for p in probabilidades]


@pytest.fixture(scope="module")
def grade(pacote, pontos) -> dict:
    """Chance de cada ponto, em cada cenário e horário: {(cenario, instante): array}."""
    return {(c, t): chances(pacote, c, t, pontos) for c in CENARIOS for t in INSTANTES}


def test_o_modelo_carregado_e_o_v1(pacote, pontos):
    assert pacote.versao == VERSAO
    assert len(pontos) == 137
    assert set(COLUNAS_PONTO) <= set(pacote.features)


def _acima_de_baixo_no_seco(pacote, grade, instantes) -> list[str]:
    problemas = []
    for t in instantes:
        acima = sum(n != NivelRisco.BAIXO for n in niveis(pacote, grade[("seco", t)]))
        if acima:
            local = t.tz_convert("America/Sao_Paulo")
            problemas.append(f"{local:%d/%m %H}h: {acima} ponto(s) acima de BAIXO sem chuva")
    return problemas


def _tarde_de_janeiro(t: pd.Timestamp) -> bool:
    local = t.tz_convert("America/Sao_Paulo")
    return local.month == 1 and 13 <= local.hour <= 17


@pytest.mark.xfail(
    strict=True,
    reason=(
        "Achado do #27 sobre o v1: com 72 h sem chuva, 14 pontos (os mesmos, quase todos do "
        "centro) ficam em MEDIO nas tardes de janeiro, das 13 h às 17 h: chance de 0,65 % contra "
        "o limiar de 0,41 %. Em 288 horários conferidos (o dia 15 de cada mês, de hora em hora), "
        "são só esses 5. É o peso do calendário (mês e hora) no modelo, estudado no #30."
    ),
)
def test_tempo_seco_ha_72_h_da_baixo_em_todo_ponto_e_horario(pacote, grade):
    problemas = _acima_de_baixo_no_seco(pacote, grade, INSTANTES)
    assert not problemas, "; ".join(problemas)


def test_tempo_seco_da_baixo_fora_das_tardes_de_janeiro(pacote, grade):
    """Guarda do achado acima: avisa se o MEDIO sem chuva aparecer em outro mês ou horário."""
    fora = [t for t in INSTANTES if not _tarde_de_janeiro(t)]
    problemas = _acima_de_baixo_no_seco(pacote, grade, fora)
    assert not problemas, "; ".join(problemas)


def test_qualquer_chuva_da_chance_maior_que_tempo_seco(grade):
    for t in INSTANTES:
        seco = grade[("seco", t)]
        for cenario in ["fraca", "moderada", "forte"]:
            menores = int((grade[(cenario, t)] <= seco).sum())
            assert menores == 0, f"{cenario} em {t}: {menores} ponto(s) sem chance acima do seco"


def _chuva_que_baixa_a_chance(grade) -> tuple[list[str], int, int]:
    """Comparações (ponto e horário) em que o cenário com mais chuva dá chance menor."""
    problemas, ruins, total = [], 0, 0
    for t in INSTANTES:
        for menos, mais in zip(EM_ORDEM, EM_ORDEM[1:], strict=False):
            baixou = int((grade[(mais, t)] < grade[(menos, t)]).sum())
            total += len(grade[(mais, t)])
            ruins += baixou
            if baixou:
                local = t.tz_convert("America/Sao_Paulo")
                problemas.append(f"{local:%d/%m %H}h: {mais} < {menos} em {baixou} ponto(s)")
    return problemas, ruins, total


@pytest.mark.xfail(
    strict=True,
    reason=(
        "Achado do #27 sobre o v1: às vezes, mais chuva dá chance MENOR no mesmo ponto e "
        "horário. Em 30.688 comparações (7 meses, de 3 em 3 horas), 327 (1,1 %), e o nível muda em "
        "169. Concentra-se nas tardes de verão (dez. e jan., 15 h e 18 h): chuva moderada abaixo "
        "da fraca e forte abaixo da moderada; em dezembro às 15 h, até a mediana dos pontos com "
        "chuva moderada fica abaixo da fraca. O LightGBM não tem restrição monotônica nas "
        "variáveis de chuva; ela está prevista no retreino (#32)."
    ),
)
def test_mais_chuva_nunca_baixa_a_chance_no_mesmo_ponto_e_horario(grade):
    problemas, _, _ = _chuva_que_baixa_a_chance(grade)
    assert not problemas, "; ".join(problemas)


def test_mais_chuva_raramente_baixa_a_chance(grade):
    """Guarda do achado acima: hoje são 2,1 % das comparações desta grade (ela pesa mais as
    tardes de verão); avisa se passar de 3 %."""
    _, ruins, total = _chuva_que_baixa_a_chance(grade)
    fracao = ruins / total
    assert fracao <= 0.03, f"{ruins} de {total} ({fracao:.1%}): mais chuva, chance menor"


def test_mesma_chuva_ponto_que_alaga_mais_fica_acima(pacote, pontos):
    """Só a frequência histórica muda (a menor e a maior da base); todo o resto do ponto igual."""
    menor = pontos["freq_hist_alagamento"].min()
    maior = pontos["freq_hist_alagamento"].max()
    for t in INSTANTES:
        for cenario in ["moderada", "forte"]:
            pouco = chances(pacote, cenario, t, pontos.assign(freq_hist_alagamento=menor))
            muito = chances(pacote, cenario, t, pontos.assign(freq_hist_alagamento=maior))
            ruins = int((muito <= pouco).sum())
            assert ruins == 0, f"{cenario} em {t}: {ruins} ponto(s) não sobem com a frequência"


def test_pontos_reais_que_mais_alagam_ficam_acima_dos_que_quase_nunca_alagam(pontos, grade):
    ordem = pontos.sort_values("freq_hist_alagamento").index.to_numpy()
    raros, frequentes = ordem[:10], ordem[-10:]
    for t in INSTANTES:
        for cenario in ["fraca", "moderada", "forte"]:
            p = grade[(cenario, t)]
            assert np.median(p[frequentes]) > np.median(p[raros]), f"{cenario} em {t}"


def test_chance_fica_entre_0_e_1_e_nunca_e_nan(grade):
    for (cenario, t), p in grade.items():
        assert np.isfinite(p).all(), f"NaN ou infinito em {cenario}, {t}"
        assert ((p >= 0) & (p <= 1)).all(), f"chance fora de [0, 1] em {cenario}, {t}"


def test_sem_caracteristicas_do_ponto_a_chance_continua_valida(pacote, pontos):
    """Sensor a mais de 500 m de um ponto conhecido: elevação, córrego, zona e frequência vazios."""
    vazios = pontos.assign(elevacao=np.nan, dist_corrego_m=np.nan, freq_hist_alagamento=np.nan,
                           zona=None)
    for t in INSTANTES:
        for cenario in CENARIOS:
            p = chances(pacote, cenario, t, vazios)
            assert np.isfinite(p).all() and ((p >= 0) & (p <= 1)).all(), f"{cenario} em {t}"


def test_chuva_forte_da_demonstracao_leva_parte_dos_pontos_a_alto(pacote, grade):
    """O cenário CHUVA_FORTE do modo de demonstração precisa mostrar alguma coisa no mapa."""
    for t in INSTANTES:
        altos = sum(n == NivelRisco.ALTO for n in niveis(pacote, grade[("forte", t)]))
        assert altos > 0, f"nenhum ponto em ALTO com chuva forte em {t}"
