package br.com.back_end.simasp.sensor.dto;

import br.com.back_end.simasp.sensor.enums.StatusSensor;
import jakarta.validation.constraints.NotNull;

public record AlterarStatusSensor(
        @NotNull(message = "O status deve ser inserido.")
        StatusSensor status
) {
}
