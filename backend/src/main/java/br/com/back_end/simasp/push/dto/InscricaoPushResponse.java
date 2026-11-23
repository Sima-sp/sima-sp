package br.com.back_end.simasp.push.dto;

/** Id da inscrição, para o app poder removê-la depois ({@code DELETE /usuarios/me/push/{id}}). */
public record InscricaoPushResponse(Long id) {
}
