package br.com.back_end.simasp.sensor.dto;

import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.PositiveOrZero;
import jakarta.validation.constraints.Size;

/**
 * Dados que transformam a distância medida em nível (%) e ligam o sensor ao firmware (#10).
 * Campo nulo = não muda.
 */
public record AlterarBancadaSensor(
        @Size(max = 40, message = "O código tem no máximo 40 caracteres.")
        @Pattern(regexp = "[A-Za-z0-9_-]+", message = "O código só pode ter letras, números, _ e -.")
        String codigo,

        @Positive(message = "A profundidade deve ser maior que zero.")
        Double profundidadeCm,

        @PositiveOrZero(message = "A distância de cheio não pode ser negativa.")
        Double distanciaCheioCm
) {
}
