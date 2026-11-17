package br.com.back_end.simasp.push.service;

import br.com.back_end.simasp.push.config.PushProperties;
import com.nimbusds.jose.JOSEException;
import com.nimbusds.jose.JWSAlgorithm;
import com.nimbusds.jose.JWSHeader;
import com.nimbusds.jose.JOSEObjectType;
import com.nimbusds.jose.crypto.ECDSASigner;
import com.nimbusds.jwt.JWTClaimsSet;
import com.nimbusds.jwt.SignedJWT;

import java.net.URI;
import java.security.GeneralSecurityException;
import java.security.interfaces.ECPrivateKey;
import java.security.interfaces.ECPublicKey;
import java.time.Clock;
import java.time.Duration;
import java.util.Base64;
import java.util.Date;

/**
 * Identificação do servidor perante o serviço de push (VAPID, RFC 8292): um JWT ES256 assinado
 * com a chave privada, válido por 12 horas, para a origem do endereço da inscrição.
 */
public class Vapid {

    private static final Duration VALIDADE = Duration.ofHours(12);

    private final ECPrivateKey privada;
    private final String publicaBase64;
    private final String contato;
    private final Clock relogio;

    public Vapid(PushProperties propriedades, Clock relogio)
    {
        try
        {
            byte[] publica = decodificar(propriedades.chavePublica());
            this.privada = (ECPrivateKey) CriptografiaWebPush.chavePrivada(decodificar(propriedades.chavePrivada()));
            ECPublicKey conferida = CriptografiaWebPush.chavePublica(publica);
            this.publicaBase64 = codificar(CriptografiaWebPush.codificar(conferida));
        }
        catch(GeneralSecurityException | IllegalArgumentException e)
        {
            throw new IllegalStateException("VAPID_PUBLIC_KEY ou VAPID_PRIVATE_KEY inválida (P-256 em base64url).", e);
        }
        this.contato = propriedades.contato();
        this.relogio = relogio;
    }

    /** Valor do cabeçalho {@code Authorization} para este endereço. */
    public String cabecalho(String endpoint)
    {
        URI uri = URI.create(endpoint);
        String origem = uri.getScheme() + "://" + uri.getHost() + (uri.getPort() == -1 ? "" : ":" + uri.getPort());

        JWTClaimsSet reivindicacoes = new JWTClaimsSet.Builder()
                .audience(origem)
                .expirationTime(Date.from(relogio.instant().plus(VALIDADE)))
                .subject(contato)
                .build();

        SignedJWT jwt = new SignedJWT(new JWSHeader.Builder(JWSAlgorithm.ES256).type(JOSEObjectType.JWT).build(), reivindicacoes);
        try
        {
            jwt.sign(new ECDSASigner(privada));
        }
        catch(JOSEException e)
        {
            throw new IllegalStateException("Falha ao assinar o VAPID", e);
        }

        return "vapid t=" + jwt.serialize() + ", k=" + publicaBase64;
    }

    public static byte[] decodificar(String base64url)
    {
        return Base64.getUrlDecoder().decode(base64url.trim().replace('+', '-').replace('/', '_').replace("=", ""));
    }

    public static String codificar(byte[] bytes)
    {
        return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
    }
}
