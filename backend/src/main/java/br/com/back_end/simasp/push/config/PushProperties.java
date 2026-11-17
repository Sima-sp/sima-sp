package br.com.back_end.simasp.push.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * Web Push (#14).
 *
 * @param chavePublica  VAPID pública (ponto P-256 não comprimido em base64url); o app usa para se inscrever
 * @param chavePrivada  VAPID privada (32 bytes em base64url); só em variável de ambiente
 * @param contato       {@code mailto:} ou {@code https:} que o serviço de push usa se precisar falar com a gente
 * @param raioMetros    distância máxima entre o bueiro e a localização de referência de quem recebe
 */
@ConfigurationProperties(prefix = "push")
public record PushProperties(String chavePublica, String chavePrivada, String contato, int raioMetros) {

    public boolean configurado()
    {
        return chavePublica != null && !chavePublica.isBlank() && chavePrivada != null && !chavePrivada.isBlank();
    }
}
