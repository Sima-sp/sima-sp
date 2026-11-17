package br.com.back_end.simasp.security;

import br.com.back_end.simasp.usuario.repository.UsuarioRepository;
import org.springframework.security.oauth2.core.OAuth2Error;
import org.springframework.security.oauth2.core.OAuth2ErrorCodes;
import org.springframework.security.oauth2.core.OAuth2TokenValidator;
import org.springframework.security.oauth2.core.OAuth2TokenValidatorResult;
import org.springframework.security.oauth2.jwt.Jwt;

/**
 * Confere, em toda requisição com token, se a conta ainda existe e está ativa (#19).
 *
 * <p>O token vale por horas. Sem esta conferência, uma conta desativada pelo administrador
 * ou apagada pela própria pessoa continuaria entrando até o token vencer. Fica num lugar só
 * (a validação do JWT) para nenhuma rota esquecer. Conta inativa ou inexistente dá 401.
 */
public class ContaAtivaValidator implements OAuth2TokenValidator<Jwt> {

    private static final OAuth2Error CONTA_INDISPONIVEL = new OAuth2Error(
            OAuth2ErrorCodes.INVALID_TOKEN, "A conta foi desativada ou excluída.", null);

    private final UsuarioRepository repository;

    public ContaAtivaValidator(UsuarioRepository repository)
    {
        this.repository = repository;
    }

    @Override
    public OAuth2TokenValidatorResult validate(Jwt jwt)
    {
        String id = jwt.getClaimAsString("usuarioId");

        try
        {
            if(id != null && repository.existsByIdAndAtivoTrue(Long.valueOf(id)))
            {
                return OAuth2TokenValidatorResult.success();
            }
        }
        catch(NumberFormatException ignorado)
        {
            // usuarioId que não é número: token inválido.
        }

        return OAuth2TokenValidatorResult.failure(CONTA_INDISPONIVEL);
    }
}
