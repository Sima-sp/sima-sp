package br.com.back_end.simasp.usuario.controller;

import br.com.back_end.simasp.usuario.dto.*;
import br.com.back_end.simasp.usuario.service.UsuarioService;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.*;

/**
 * Conta do usuário. Nomes das rotas (#20): substantivo no caminho, verbo HTTP dizendo a ação.
 */
@RestController
@RequestMapping("/usuarios")
public class UsuarioController {

    private final UsuarioService service;

    public UsuarioController(UsuarioService service) {
        this.service = service;
    }

    /** Criar conta (sempre CIDADAO). Público. */
    @PostMapping
    public ResponseEntity<UsuarioResponse> cadastrarUsuario(@Valid @RequestBody CriarUsuarioRequest request)
    {
        UsuarioResponse response = service.cadastrarUsuario(request);
        return ResponseEntity.status(HttpStatus.CREATED).body(response);
    }

    @GetMapping("/me")
    public ResponseEntity<UsuarioResponse> buscarMeuPerfil(@AuthenticationPrincipal Jwt jwt)
    {
        return ResponseEntity.ok(service.buscarMeuPerfil(usuarioId(jwt)));
    }

    /** Telefone, localização (latitude e longitude juntas) e permissão de alerta: só o que vier. */
    @PatchMapping("/me")
    public ResponseEntity<UsuarioResponse> atualizarPerfil(@AuthenticationPrincipal Jwt jwt, @Valid @RequestBody AtualizarPerfilRequest request)
    {
        return ResponseEntity.ok(service.atualizarPerfil(request, usuarioId(jwt)));
    }

    @PutMapping("/me/senha")
    public ResponseEntity<Void> atualizarSenha(@AuthenticationPrincipal Jwt jwt, @Valid @RequestBody AlterarSenhaUsuarioRequest request)
    {
        service.atualizarSenha(request, usuarioId(jwt));
        return ResponseEntity.noContent().build();
    }

    private static Long usuarioId(Jwt jwt)
    {
        return Long.valueOf(jwt.getClaimAsString("usuarioId"));
    }
}
