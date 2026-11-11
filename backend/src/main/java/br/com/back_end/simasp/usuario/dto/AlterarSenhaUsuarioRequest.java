package br.com.back_end.simasp.usuario.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

public record AlterarSenhaUsuarioRequest(
        @NotNull(message = "A senha atual deve ser informada.")
        String senhaAtual,

        @NotNull(message = "A nova senha deve ser informada.")
        @Size(
                min = 8,
                max = 72,
                message = "A nova senha deve possuir entre 8 e 72 caracteres."
        )
        String novaSenha,

        @NotNull(message = "A confirmação da senha deve ser informada.")
        String confirmacaoNovaSenha
) {
}
