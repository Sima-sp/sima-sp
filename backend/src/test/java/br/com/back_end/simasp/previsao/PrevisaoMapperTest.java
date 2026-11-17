package br.com.back_end.simasp.previsao;

import br.com.back_end.simasp.leitura.enums.NivelRiscoEnum;
import br.com.back_end.simasp.previsao.client.dto.PrevisaoIaResponse;
import br.com.back_end.simasp.previsao.entity.Previsao;
import br.com.back_end.simasp.previsao.enums.OrigemPrevisaoEnum;
import br.com.back_end.simasp.previsao.enums.StatusPrevisaoEnum;
import br.com.back_end.simasp.previsao.mapper.PrevisaoMapper;
import br.com.back_end.simasp.sensor.entity.Sensor;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import br.com.back_end.simasp.config.FusoHorario;
import br.com.back_end.simasp.leitura.entity.Leitura;
import br.com.back_end.simasp.sensor.enums.StatusSensor;

import java.math.BigDecimal;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

class PrevisaoMapperTest {

    private final PrevisaoMapper mapper = new PrevisaoMapper(Clock.system(FusoHorario.FUSO));

    @Test
    @DisplayName("converte a resposta do serviço em entidade, com data no fuso de São Paulo")
    void converteResposta() {
        PrevisaoIaResponse resposta = new PrevisaoIaResponse(
                7L, 0.031, "ALTO", "MEDIO", 3,
                OffsetDateTime.of(2026, 9, 19, 13, 0, 0, 0, ZoneOffset.UTC),
                OffsetDateTime.of(2026, 9, 19, 13, 30, 0, 0, ZoneOffset.UTC),
                OffsetDateTime.of(2026, 9, 19, 12, 0, 0, 0, ZoneOffset.UTC),
                false, true, List.of("nivelAgua 85%", "lixo 70% com chuva"), false,
                "OPEN_METEO", 12.4, 3.1, "MODELO", "v1", "P0042", 87.5, List.of());

        Previsao previsao = mapper.paraEntidade(resposta, sensor(), Duration.ofMinutes(30));

        assertThat(previsao.getNivelRisco()).isEqualTo(NivelRiscoEnum.ALTO);
        assertThat(previsao.getNivelRiscoModelo()).isEqualTo(NivelRiscoEnum.MEDIO);
        assertThat(previsao.getOrigem()).isEqualTo(OrigemPrevisaoEnum.MODELO);
        assertThat(previsao.getGeradaEm()).isEqualTo(LocalDateTime.of(2026, 9, 19, 10, 0));
        assertThat(previsao.getValidaAte()).isEqualTo(LocalDateTime.of(2026, 9, 19, 10, 30));
        assertThat(previsao.getMotivosAjuste()).isEqualTo("nivelAgua 85%;lixo 70% com chuva");
        assertThat(mapper.paraResposta(previsao).motivosAjuste()).hasSize(2);
        assertThat(mapper.paraResposta(previsao).simulada()).isFalse();  // chuva real do Open-Meteo
    }

    @Test
    @DisplayName("previsão com chuva de cenário sai marcada como simulada")
    void marcaSimulada() {
        Previsao previsao = new Previsao();
        previsao.setSensor(sensor());
        previsao.setValidaAte(LocalDateTime.now(FusoHorario.FUSO).plusMinutes(30));
        previsao.setFonteChuva("INFORMADA");

        assertThat(mapper.paraResposta(previsao).simulada()).isTrue();
        // chuva real da leitura, usada quando o Open-Meteo cai: não é simulação
        assertThat(mapper.simulada("INFORMADA_LEGADO")).isFalse();
        assertThat(mapper.simulada(null)).isFalse();
    }

    @Test
    @DisplayName("sem validaAte, usa a validade configurada")
    void validadePadrao() {
        PrevisaoIaResponse resposta = new PrevisaoIaResponse(
                7L, null, "BAIXO", "BAIXO", null, null, null, null,
                null, null, null, null, "CACHE", null, null, "REGRAS", "regras-v0", null, null, List.of());

        Previsao previsao = mapper.paraEntidade(resposta, sensor(), Duration.ofMinutes(30));

        assertThat(previsao.getProbabilidadeAlagamento()).isNull();
        assertThat(previsao.getJanelaHoras()).isEqualTo(3);
        assertThat(previsao.getValidaAte()).isEqualTo(previsao.getGeradaEm().plusMinutes(30));
        assertThat(mapper.statusDe(previsao)).isEqualTo(StatusPrevisaoEnum.VALIDA);
    }

    @Test
    @DisplayName("previsão vencida aparece como DESATUALIZADA, e o sensor não some do mapa")
    void vencida() {
        Previsao previsao = new Previsao();
        previsao.setSensor(sensor());
        previsao.setValidaAte(LocalDateTime.now(FusoHorario.FUSO).minusHours(2));

        assertThat(mapper.statusDe(previsao)).isEqualTo(StatusPrevisaoEnum.DESATUALIZADA);
        assertThat(mapper.semPrevisao(sensor()).status()).isEqualTo(StatusPrevisaoEnum.SEM_PREVISAO);
    }

    @Test
    @DisplayName("servidor em UTC: previsão recém-gravada continua VALIDA, e vence depois de 30 min (#9)")
    void servidorEmUtc() {
        Instant agora = Instant.parse("2026-11-16T17:20:00Z");  // 14:20 em São Paulo
        PrevisaoIaResponse resposta = new PrevisaoIaResponse(
                7L, 0.01, "MEDIO", "MEDIO", 3,
                agora.atOffset(ZoneOffset.UTC), agora.plusSeconds(1800).atOffset(ZoneOffset.UTC), null,
                false, false, List.of(), false, "OPEN_METEO", 1.0, 0.0, "MODELO", "v1", "P1", 10.0, List.of());

        PrevisaoMapper agoraMesmo = new PrevisaoMapper(Clock.fixed(agora, FusoHorario.FUSO));
        Previsao previsao = agoraMesmo.paraEntidade(resposta, sensor(), Duration.ofMinutes(30));
        assertThat(previsao.getGeradaEm()).isEqualTo(LocalDateTime.of(2026, 11, 16, 14, 20));
        assertThat(agoraMesmo.statusDe(previsao)).isEqualTo(StatusPrevisaoEnum.VALIDA);

        PrevisaoMapper depois = new PrevisaoMapper(Clock.fixed(agora.plusSeconds(2400), FusoHorario.FUSO));
        assertThat(depois.statusDe(previsao)).isEqualTo(StatusPrevisaoEnum.DESATUALIZADA);
    }

    @Test
    @DisplayName("a resposta leva as datas com fuso e os dados do sensor e da última leitura (#9, #11)")
    void datasComFusoESensor() {
        Previsao previsao = new Previsao();
        Sensor sensor = sensor();
        sensor.setCodigo("bueiro_01");
        sensor.setStatus(StatusSensor.ATIVO);
        previsao.setSensor(sensor);
        previsao.setGeradaEm(LocalDateTime.of(2026, 11, 16, 14, 20));
        previsao.setValidaAte(LocalDateTime.of(2026, 11, 16, 14, 50));

        Leitura leitura = new Leitura();
        leitura.setSensor(sensor);
        leitura.setDistanciaCm(32.4);
        leitura.setNivelAgua(68.0);
        leitura.setDataLeitura(LocalDateTime.of(2026, 11, 16, 14, 18));

        var resposta = mapper.paraResposta(previsao, leitura);
        assertThat(resposta.geradaEm()).isEqualTo(OffsetDateTime.parse("2026-11-16T14:20:00-03:00"));
        assertThat(resposta.dataLeitura()).isEqualTo(OffsetDateTime.parse("2026-11-16T14:18:00-03:00"));
        assertThat(resposta.nivelAgua()).isEqualTo(68.0);
        assertThat(resposta.distanciaCm()).isEqualTo(32.4);
        assertThat(resposta.statusSensor()).isEqualTo(StatusSensor.ATIVO);
        assertThat(resposta.codigo()).isEqualTo("bueiro_01");

        var semLeitura = mapper.semPrevisao(sensor, null);
        assertThat(semLeitura.nivelAgua()).isNull();
        assertThat(semLeitura.distanciaCm()).isNull();
        assertThat(semLeitura.dataLeitura()).isNull();
        assertThat(semLeitura.statusSensor()).isEqualTo(StatusSensor.ATIVO);
    }

    @Test
    @DisplayName("nível desconhecido não quebra: vira nulo e fica registrado no log")
    void nivelDesconhecido() {
        assertThat(mapper.paraNivel("MÉDIO?")).isNull();
        assertThat(mapper.paraNivel("critico")).isEqualTo(NivelRiscoEnum.CRITICO);
    }

    private Sensor sensor() {
        Sensor sensor = new Sensor();
        sensor.setId(7L);
        sensor.setLatitude(new BigDecimal("-23.515200"));
        sensor.setLongitude(new BigDecimal("-46.584100"));
        sensor.setVizinhanca("Santana");
        return sensor;
    }
}
