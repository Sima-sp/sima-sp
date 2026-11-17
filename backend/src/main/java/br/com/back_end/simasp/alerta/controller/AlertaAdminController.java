package br.com.back_end.simasp.alerta.controller;

import br.com.back_end.simasp.alerta.dto.AlertaResponse;
import br.com.back_end.simasp.alerta.enums.StatusAlertaEnum;
import br.com.back_end.simasp.alerta.service.AlertaService;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
@RequestMapping("/admin/alertas")
public class AlertaAdminController {

    private final AlertaService service;

    public AlertaAdminController(AlertaService service) {
        this.service = service;
    }

    /** Todos os alertas; filtros opcionais por situação e sensor. */
    @GetMapping
    public ResponseEntity<List<AlertaResponse>> listar(
            @RequestParam(required = false) StatusAlertaEnum status,
            @RequestParam(required = false) Long sensorId) {
        return ResponseEntity.ok(service.listar(status, sensorId));
    }

    @PatchMapping("/{id}/resolver")
    public ResponseEntity<AlertaResponse> resolver(@PathVariable Long id) {
        return ResponseEntity.ok(service.resolverPeloAdmin(id));
    }
}
