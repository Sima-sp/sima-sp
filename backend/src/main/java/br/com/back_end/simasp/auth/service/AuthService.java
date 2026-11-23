package br.com.back_end.simasp.auth.service;

import br.com.back_end.simasp.auth.dto.LoginRequest;
import br.com.back_end.simasp.auth.dto.LoginResponse;
import br.com.back_end.simasp.exception.CredenciaisInvalidasException;
import br.com.back_end.simasp.security.LimiteDeTentativas;
import br.com.back_end.simasp.security.TokenService;
import br.com.back_end.simasp.security.TokensCancelados;
import br.com.back_end.simasp.usuario.entity.Usuario;
import br.com.back_end.simasp.usuario.repository.UsuarioRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.Locale;

@Service
public class AuthService {

    @Autowired
    private UsuarioRepository repository;

    @Autowired
    private PasswordEncoder passwordEncoder;

    @Autowired
    private TokenService tokenService;

    @Autowired
    private LimiteDeTentativas limite;

    @Autowired
    private TokensCancelados tokensCancelados;

    @Transactional(readOnly = true)
    public LoginResponse login(LoginRequest request, String ip)
    {
        String emailFormatado = request.email().trim().toLowerCase(Locale.ROOT);

        // Bloqueado por excesso de erros: 429 antes de olhar a senha (#19).
        limite.verificar(emailFormatado, ip);

        Usuario usuario = repository.findByEmailIgnoreCase(emailFormatado).orElse(null);

        boolean valido = usuario != null
                && Boolean.TRUE.equals(usuario.getAtivo())
                && passwordEncoder.matches(request.senha(), usuario.getSenhaHash());

        if(!valido)
        {
            limite.registrarFalha(emailFormatado, ip);
            throw credenciaisInvalidas();
        }

        limite.registrarSucesso(emailFormatado);

        String token = tokenService.gerarToken(usuario);

        return new LoginResponse(token, "Bearer", tokenService.getExpiracaoSegundos());


    }

    /** O token deixa de valer na hora, até o horário em que venceria (#6). */
    public void logout(Jwt jwt)
    {
        tokensCancelados.cancelar(jwt.getId(), jwt.getExpiresAt());
    }

    private CredenciaisInvalidasException credenciaisInvalidas()
    {
        return new CredenciaisInvalidasException("E-mail ou senha inválidos");
    }
}
