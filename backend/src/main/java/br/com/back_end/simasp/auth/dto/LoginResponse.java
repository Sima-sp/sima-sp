package br.com.back_end.simasp.auth.dto;

public record LoginResponse(
        String token,
        String tipo,
        Long expiraEmSegundos
) {
}
