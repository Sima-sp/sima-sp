package br.com.back_end.simasp.push.dto;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

/**
 * {@code POST /usuarios/me/push}: o mesmo formato de {@code PushSubscription.toJSON()} do navegador,
 * então o app pode mandar o objeto como vem ({@code expirationTime} é ignorado).
 */
public record InscricaoPushRequest(
        @NotBlank(message = "O endpoint da inscrição deve ser enviado.")
        @Size(max = 500, message = "Endpoint longo demais.")
        String endpoint,

        @NotNull(message = "As chaves da inscrição devem ser enviadas.")
        @Valid
        Chaves keys
) {

    public record Chaves(
            @NotBlank(message = "Falta a chave p256dh.")
            @Size(max = 100)
            String p256dh,

            @NotBlank(message = "Falta a chave auth.")
            @Size(max = 50)
            String auth
    ) {
    }
}
