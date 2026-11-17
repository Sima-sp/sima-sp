package br.com.back_end.simasp.usuario.dto;

import jakarta.validation.constraints.*;

import java.math.BigDecimal;

public record CriarUsuarioRequest(
        @NotNull(message = "O e-mail deve ser inserido.")
        @Email(message = "O e-mail deve ser válido.")
        String email,

        @NotNull(message = "O telefone deve ser inserido.")
        @Pattern(
                regexp = "\\d{10,11}",
                message = "O telefone deve possuir 10 ou 11 números."
        )
        String telefone,

        @NotNull(message = "A senha deve ser inserida.")
        @Size(min = 8, max = 72, message = "A senha deve ter entre 8 e 72 caracteres.")
        String senha,

        @NotNull(message = "A latitude deve ser inserida.")
        @Digits(integer = 3, fraction = 6, message = "Latitude deve possuir até 3 dígitos inteiros e 6 decimais.")
        @DecimalMin(value = "-90.000000", message = "Latitude não pode ser menor que -90.")
        @DecimalMax(value = "90.000000", message = "Latitude não pode ser maior que -90.")
        BigDecimal latitude,

        @NotNull(message = "A longitude deve ser inserida.")
        @Digits(integer = 3, fraction = 6, message = "Longitude deve possuir até 3 dígitos inteiros e 6 decimais.")
        @DecimalMin(value = "-180.000000", message = "Longitude não pode ser menor que -180.")
        @DecimalMax(value = "180.000000", message = "Longitude não pode ser maior que 180.")
        BigDecimal longitude,

        @NotNull(message = "A permissão de alerta deve ser inserida.")
        Boolean permissaoAlerta,

        /** A pessoa leu para que cada dado serve (a página fica no app). Obrigatório (#19). */
        @NotNull(message = "Confirme que leu como os seus dados são usados.")
        @AssertTrue(message = "Confirme que leu como os seus dados são usados.")
        Boolean aceiteTermos
) {
}
