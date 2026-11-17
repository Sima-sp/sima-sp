package br.com.back_end.simasp.usuario.controller;

import br.com.back_end.simasp.usuario.dto.AtualizarUsuarioAdminRequest;
import br.com.back_end.simasp.usuario.dto.UsuarioResponse;
import br.com.back_end.simasp.usuario.service.UsuarioService;
import jakarta.validation.Valid;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.math.BigDecimal;

@RestController
@RequestMapping("/admin/usuarios")
public class UsuarioAdminController {

    private final UsuarioService service;

    public UsuarioAdminController(UsuarioService service) {
        this.service = service;
    }

    /** Usuários ativos a até {@code raio} metros de um ponto (padrão 5 km). */
    @GetMapping
    public ResponseEntity<Page<UsuarioResponse>> buscarUsuariosProximos(@RequestParam BigDecimal latitude, @RequestParam BigDecimal longitude,
                                                                        @RequestParam(defaultValue = "5000") Integer raio, Pageable pageable)
    {
        return ResponseEntity.ok(service.buscarUsuariosProximos(longitude, latitude, raio, pageable));
    }

    /** Ativar ou desativar a conta: {@code { "ativo": false }}. */
    @PatchMapping("/{email}")
    public ResponseEntity<UsuarioResponse> atualizarUsuario(@PathVariable String email, @Valid @RequestBody AtualizarUsuarioAdminRequest request)
    {
        return ResponseEntity.ok(service.definirAtivoPorEmail(email, request.ativo()));
    }
}
