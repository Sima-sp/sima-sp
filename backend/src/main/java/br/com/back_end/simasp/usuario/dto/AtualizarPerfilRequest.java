package br.com.back_end.simasp.usuario.dto;

import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Digits;
import jakarta.validation.constraints.Pattern;

import java.math.BigDecimal;

/**
 * {@code PATCH /usuarios/me}: só os campos enviados mudam (#20). Latitude e longitude vão juntas.
 */
public record AtualizarPerfilRequest(
        @Pattern(regexp = "\\d{10,11}", message = "O telefone deve possuir 10 ou 11 números.")
        String telefone,

        @Digits(integer = 3, fraction = 6, message = "Latitude deve possuir até 3 dígitos inteiros e 6 decimais.")
        @DecimalMin(value = "-90.000000", message = "Latitude não pode ser menor que -90.")
        @DecimalMax(value = "90.000000", message = "Latitude não pode ser maior que 90.")
        BigDecimal latitude,

        @Digits(integer = 3, fraction = 6, message = "Longitude deve possuir até 3 dígitos inteiros e 6 decimais.")
        @DecimalMin(value = "-180.000000", message = "Longitude não pode ser menor que -180.")
        @DecimalMax(value = "180.000000", message = "Longitude não pode ser maior que 180.")
        BigDecimal longitude,

        Boolean permissaoAlerta
) {
}
