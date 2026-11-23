package br.com.back_end.simasp.security;

import org.springframework.security.oauth2.core.OAuth2Error;
import org.springframework.security.oauth2.core.OAuth2ErrorCodes;
import org.springframework.security.oauth2.core.OAuth2TokenValidator;
import org.springframework.security.oauth2.core.OAuth2TokenValidatorResult;
import org.springframework.security.oauth2.jwt.Jwt;

/**
 * Recusa (401) o token que saiu pelo logout (#6), na mesma conferência que já olha a
 * assinatura, a validade e a conta ativa: nenhuma rota esquece.
 */
public class TokenNaoCanceladoValidator implements OAuth2TokenValidator<Jwt> {

    private static final OAuth2Error CANCELADO = new OAuth2Error(
            OAuth2ErrorCodes.INVALID_TOKEN, "A sessão foi encerrada. Entre de novo.", null);

    private final TokensCancelados cancelados;

    public TokenNaoCanceladoValidator(TokensCancelados cancelados)
    {
        this.cancelados = cancelados;
    }

    @Override
    public OAuth2TokenValidatorResult validate(Jwt jwt)
    {
        return cancelados.estaCancelado(jwt.getId())
                ? OAuth2TokenValidatorResult.failure(CANCELADO)
                : OAuth2TokenValidatorResult.success();
    }
}
