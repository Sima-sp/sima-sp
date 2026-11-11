package br.com.back_end.simasp.sensor.dto;

import br.com.back_end.simasp.sensor.enums.StatusSensor;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

public record AlterarStatusSensor(
        @NotNull(message = "O status deve ser inserido.")
        @Size(max = 20, message = "Tamanho de caracteres do status excedido.")
        StatusSensor status
) {
}
