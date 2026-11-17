package br.com.back_end.simasp.leitura.dto;

import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.Size;

import java.time.OffsetDateTime;

/**
 * Corpo de {@code POST /leituras}, mandado pelo servidor do sensor (#10).
 *
 * @param codigo      o "device" do firmware, ex.: {@code bueiro_01}
 * @param distanciaCm distância do sensor até a água, em cm (o sensor mede de 20 a 2000)
 * @param medidaEm    quando a medida foi feita, com fuso; ausente = agora
 */
public record LeituraSensorRequest(
        @NotBlank(message = "O código do sensor deve ser informado.")
        @Size(max = 40, message = "O código do sensor tem no máximo 40 caracteres.")
        String codigo,

        @NotNull(message = "A distância deve ser informada.")
        @Positive(message = "A distância deve ser maior que zero.")
        @DecimalMax(value = "2000", message = "A distância não pode passar de 2000 cm.")
        Double distanciaCm,

        OffsetDateTime medidaEm
) {
}
