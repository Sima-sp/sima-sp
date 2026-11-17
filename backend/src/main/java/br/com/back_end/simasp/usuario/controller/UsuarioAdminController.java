package br.com.back_end.simasp.usuario.controller;

import br.com.back_end.simasp.usuario.dto.AtualizarUsuarioAdminRequest;
import br.com.back_end.simasp.usuario.dto.UsuarioResponse;
import br.com.back_end.simasp.usuario.service.UsuarioService;
import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/admin/usuarios")
public class UsuarioAdminController {

    private final UsuarioService service;

    public UsuarioAdminController(UsuarioService service) {
        this.service = service;
    }

    // A busca de usuários por proximidade (e-mail, telefone e localização) saiu da API em #14:
    // agora ela é usada só por dentro, para escolher quem recebe o aviso.

    /** Ativar ou desativar a conta: {@code { "ativo": false }}. */
    @PatchMapping("/{email}")
    public ResponseEntity<UsuarioResponse> atualizarUsuario(@PathVariable String email, @Valid @RequestBody AtualizarUsuarioAdminRequest request)
    {
        return ResponseEntity.ok(service.definirAtivoPorEmail(email, request.ativo()));
    }
}
