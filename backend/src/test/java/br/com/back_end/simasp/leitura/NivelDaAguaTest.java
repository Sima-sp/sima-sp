package br.com.back_end.simasp.leitura;

import br.com.back_end.simasp.leitura.config.NivelSensorProperties;
import br.com.back_end.simasp.leitura.enums.NivelRiscoEnum;
import br.com.back_end.simasp.leitura.service.NivelDaAgua;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.time.Duration;

import static org.assertj.core.api.Assertions.assertThat;

class NivelDaAguaTest {

    private final NivelDaAgua nivel = new NivelDaAgua(
            new NivelSensorProperties(new NivelSensorProperties.Nivel(50, 80, 100), Duration.ofMinutes(1)));

    @Test
    @DisplayName("da distância ao %: profundidade 60 cm, cheio 20 cm")
    void percentual() {
        assertThat(nivel.percentual(60, 60.0, 20.0)).isEqualTo(0.0);
        assertThat(nivel.percentual(40, 60.0, 20.0)).isEqualTo(50.0);
        assertThat(nivel.percentual(30, 60.0, 20.0)).isEqualTo(75.0);
        assertThat(nivel.percentual(20, 60.0, 20.0)).isEqualTo(100.0);
    }

    @Test
    @DisplayName("fora da faixa fica entre 0 e 100: mais perto que o cheio é 100 %")
    void limitado() {
        assertThat(nivel.percentual(10, 60.0, 20.0)).isEqualTo(100.0);
        assertThat(nivel.percentual(90, 60.0, 20.0)).isEqualTo(0.0);
        assertThat(nivel.transbordando(nivel.percentual(10, 60.0, 20.0))).isTrue();
        assertThat(nivel.transbordando(99.9)).isFalse();
    }

    @Test
    @DisplayName("sem profundidade ou distância de cheio, não há %")
    void semBancada() {
        assertThat(nivel.percentual(30, null, 20.0)).isNull();
        assertThat(nivel.percentual(30, 60.0, null)).isNull();
        assertThat(nivel.percentual(30, 20.0, 60.0)).isNull();
        assertThat(nivel.nivelRisco(null)).isNull();
        assertThat(nivel.transbordando(null)).isFalse();
    }

    @Test
    @DisplayName("limites em %: médio a partir de 50, alto a partir de 80, crítico só cheio")
    void niveis() {
        assertThat(nivel.nivelRisco(49.9)).isEqualTo(NivelRiscoEnum.BAIXO);
        assertThat(nivel.nivelRisco(50.0)).isEqualTo(NivelRiscoEnum.MEDIO);
        assertThat(nivel.nivelRisco(79.9)).isEqualTo(NivelRiscoEnum.MEDIO);
        assertThat(nivel.nivelRisco(80.0)).isEqualTo(NivelRiscoEnum.ALTO);
        assertThat(nivel.nivelRisco(99.9)).isEqualTo(NivelRiscoEnum.ALTO);
        assertThat(nivel.nivelRisco(100.0)).isEqualTo(NivelRiscoEnum.CRITICO);
    }
}
