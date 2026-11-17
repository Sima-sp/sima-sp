package br.com.back_end.simasp.usuario.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;

public record AlterarTelefoneUsuarioRequest(
        @NotNull(message = "telefone deve ser inserido")
        @Pattern(
                regexp = "\\d{10,11}",
                message = "O telefone deve possuir 10 ou 11 números."
        )
        String telefone
) {

}
