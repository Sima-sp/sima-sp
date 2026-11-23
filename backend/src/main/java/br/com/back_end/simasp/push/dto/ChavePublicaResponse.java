package br.com.back_end.simasp.push.dto;

/** A chave VAPID pública que o app passa em {@code pushManager.subscribe({ applicationServerKey })}. */
public record ChavePublicaResponse(String chavePublica) {
}
