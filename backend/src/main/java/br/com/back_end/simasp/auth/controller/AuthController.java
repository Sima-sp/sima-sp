package br.com.back_end.simasp.auth.controller;

import br.com.back_end.simasp.auth.dto.LoginRequest;
import br.com.back_end.simasp.auth.dto.LoginResponse;
import br.com.back_end.simasp.auth.service.AuthService;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/auth")
public class AuthController {

    @Autowired
    private AuthService service;


    @PostMapping("/login")
    public ResponseEntity<LoginResponse> login(@Valid @RequestBody LoginRequest request, HttpServletRequest http)
    {
        LoginResponse response = service.login(request, http.getRemoteAddr());

        return ResponseEntity.ok(response);
    }

    /**
     * Encerra a sessão (#6): o token usado nesta chamada deixa de valer na hora, e não só quando
     * vencer. O app chama aqui e depois apaga o token guardado.
     */
    @PostMapping("/logout")
    public ResponseEntity<Void> logout(@AuthenticationPrincipal Jwt jwt)
    {
        service.logout(jwt);

        return ResponseEntity.noContent().build();
    }
}
