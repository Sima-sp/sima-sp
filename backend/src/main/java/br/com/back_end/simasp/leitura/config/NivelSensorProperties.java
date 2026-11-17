package br.com.back_end.simasp.leitura.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

import java.time.Duration;

/**
 * Limites do nível medido (em % do bueiro cheio) e o intervalo mínimo entre dois recálculos da
 * previsão do mesmo sensor. Ficam em {@code application.properties} ({@code sensor.*}).
 */
@ConfigurationProperties(prefix = "sensor")
public record NivelSensorProperties(Nivel nivel, Duration intervaloRecalculo) {

    public record Nivel(double medio, double alto, double critico) {
    }
}
