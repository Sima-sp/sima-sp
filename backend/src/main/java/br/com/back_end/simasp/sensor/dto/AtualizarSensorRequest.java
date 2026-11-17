package br.com.back_end.simasp.sensor.dto;

import br.com.back_end.simasp.sensor.enums.StatusSensor;
import jakarta.validation.constraints.*;

import java.math.BigDecimal;

/**
 * {@code PATCH /admin/sensores/{id}} (#20): só os campos enviados mudam. Latitude e longitude vão
 * juntas. Código, profundidade e distância de cheio ligam o sensor ao firmware e transformam a
 * distância medida em nível (#10).
 */
public record AtualizarSensorRequest(
        StatusSensor status,

        @Digits(integer = 3, fraction = 6, message = "Latitude deve possuir até 3 dígitos inteiros e 6 decimais.")
        @DecimalMin(value = "-90.000000", message = "Latitude não pode ser menor que -90.")
        @DecimalMax(value = "90.000000", message = "Latitude não pode ser maior que 90.")
        BigDecimal latitude,

        @Digits(integer = 3, fraction = 6, message = "Longitude deve possuir até 3 dígitos inteiros e 6 decimais.")
        @DecimalMin(value = "-180.000000", message = "Longitude não pode ser menor que -180.")
        @DecimalMax(value = "180.000000", message = "Longitude não pode ser maior que 180.")
        BigDecimal longitude,

        @Size(max = 120, message = "O número de caracteres de vizinhança não pode passar de 120.")
        String vizinhanca,

        @Size(max = 40, message = "O código tem no máximo 40 caracteres.")
        @Pattern(regexp = "[A-Za-z0-9_-]+", message = "O código só pode ter letras, números, _ e -.")
        String codigo,

        @Positive(message = "A profundidade deve ser maior que zero.")
        Double profundidadeCm,

        @PositiveOrZero(message = "A distância de cheio não pode ser negativa.")
        Double distanciaCheioCm
) {
}
