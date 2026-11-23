package br.com.back_end.simasp.previsao;

import br.com.back_end.simasp.config.FusoHorario;
import br.com.back_end.simasp.leitura.config.NivelSensorProperties;
import br.com.back_end.simasp.previsao.service.RecalculoAposLeitura;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneId;

import static org.assertj.core.api.Assertions.assertThat;

class RecalculoAposLeituraTest {

    /** Relógio que o teste adianta. */
    private static final class RelogioDeTeste extends Clock {
        private Instant agora = Instant.parse("2026-11-19T17:20:00Z");

        void adiantar(Duration tempo) {
            agora = agora.plus(tempo);
        }

        @Override
        public ZoneId getZone() {
            return FusoHorario.FUSO;
        }

        @Override
        public Clock withZone(ZoneId zone) {
            return this;
        }

        @Override
        public Instant instant() {
            return agora;
        }
    }

    @Test
    @DisplayName("duas leituras no mesmo minuto → um recálculo só; outro sensor não espera")
    void umRecalculoPorMinuto() {
        RelogioDeTeste relogio = new RelogioDeTeste();
        RecalculoAposLeitura recalculo = new RecalculoAposLeitura(null, relogio,
                new NivelSensorProperties(new NivelSensorProperties.Nivel(50, 80, 100), Duration.ofMinutes(1)));

        assertThat(recalculo.deveRecalcular(1L)).isTrue();
        relogio.adiantar(Duration.ofSeconds(30));
        assertThat(recalculo.deveRecalcular(1L)).isFalse();
        assertThat(recalculo.deveRecalcular(2L)).isTrue();
        relogio.adiantar(Duration.ofSeconds(30));
        assertThat(recalculo.deveRecalcular(1L)).isTrue();
    }
}
