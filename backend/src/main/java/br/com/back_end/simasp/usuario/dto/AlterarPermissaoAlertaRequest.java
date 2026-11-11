package br.com.back_end.simasp.usuario.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

public record AlterarPermissaoAlertaRequest(
        @NotNull(message = "A permissão de alerta deve ser inserida.")
        @Size(max = 3, message = "Tamanho da permissão de alerta excedida.")
        Boolean permissaoAlerta
) {
}
