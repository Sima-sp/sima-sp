package br.com.back_end.simasp.usuario.controller;

import br.com.back_end.simasp.usuario.dto.*;
import br.com.back_end.simasp.usuario.service.UsuarioService;
import jakarta.validation.Valid;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.*;

import java.math.BigDecimal;

@RestController
@RequestMapping("/usuarios")
//@CrossOrigin("*")

public class UsuarioController {

    @Autowired
    private UsuarioService service;


    @PostMapping("/cadastro")
    public ResponseEntity<UsuarioResponse> cadastrarUsuario(@Valid @RequestBody CriarUsuarioRequest request)
    {
        UsuarioResponse response = service.cadastrarUsuario(request);
        return ResponseEntity.status(HttpStatus.CREATED).body(response);
    }

    @GetMapping("/me")
    public ResponseEntity<UsuarioResponse> buscarMeuPerfil(@AuthenticationPrincipal Jwt jwt)
    {
        Long usuarioId = Long.valueOf(jwt.getClaimAsString("usuarioId"));
        UsuarioResponse response = service.buscarMeuPerfil(usuarioId);
        return ResponseEntity.ok(response);
    }

    @PatchMapping("/me/novo-telefone")
    public ResponseEntity<Void> atualizarTelefone(@AuthenticationPrincipal Jwt jwt, @Valid @RequestBody AlterarTelefoneUsuarioRequest request)
    {
        Long usuarioId = Long.valueOf(jwt.getClaimAsString("usuarioId"));

        service.atualizarTelefone(request, usuarioId);

        return ResponseEntity.noContent().build();
    }

    @PatchMapping("/me/nova-senha")
    public ResponseEntity<Void> atualizarSenha(@AuthenticationPrincipal Jwt jwt, @Valid @RequestBody AlterarSenhaUsuarioRequest request)
    {
        Long usuarioId = Long.valueOf(jwt.getClaimAsString("usuarioId"));

        service.atualizarSenha(request, usuarioId);

        return ResponseEntity.noContent().build();
    }


    @PatchMapping("/me/nova-localizacao")
    public ResponseEntity<Void> atualizarSenha(@AuthenticationPrincipal Jwt jwt, @Valid @RequestBody AlterarLocalizacaoUsuarioRequest request)
    {
        Long usuarioId = Long.valueOf(jwt.getClaimAsString("usuarioId"));

        service.atualizarLocalizacao(request, usuarioId);

        return ResponseEntity.noContent().build();
    }


    @PatchMapping("/me/alterar-permissao-alerta")
    public ResponseEntity<Void> atualizarSenha(@AuthenticationPrincipal Jwt jwt, @Valid @RequestBody AlterarPermissaoAlertaRequest request)
    {
        Long usuarioId = Long.valueOf(jwt.getClaimAsString("usuarioId"));

        service.atualizarPermissaoAlerta(request, usuarioId);

        return ResponseEntity.noContent().build();
    }



}
