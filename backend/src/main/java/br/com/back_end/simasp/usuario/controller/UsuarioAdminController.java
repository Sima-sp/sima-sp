package br.com.back_end.simasp.usuario.controller;

import br.com.back_end.simasp.usuario.dto.UsuarioResponse;
import br.com.back_end.simasp.usuario.service.UsuarioService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.math.BigDecimal;

@RestController
@RequestMapping("/admin/usuarios")
//@CrossOrigin("*")

public class UsuarioAdminController {

    @Autowired
    private UsuarioService service;

    @GetMapping("/proximos")
    public ResponseEntity<Page<UsuarioResponse>> buscarUsuariosProximos(@RequestParam BigDecimal longitude, @RequestParam BigDecimal latitude, @RequestParam Integer distanciaMetros, Pageable pageable)
    {
        return ResponseEntity.ok(service.buscarUsuariosProximos(longitude, latitude, distanciaMetros, pageable));
    }

    @PatchMapping("/{email}/ativar")
    public ResponseEntity<Void> ativarUsuario(@PathVariable String email)
    {
        service.ativarUsuarioPorEmail(email);

        return ResponseEntity.noContent().build();
    }

    @PatchMapping("/{email}/desativar")
    public ResponseEntity<Void> desativarUsuario(@PathVariable String email)
    {
        service.desativarUsuarioPorEmail(email);

        return ResponseEntity.noContent().build();
    }


}
