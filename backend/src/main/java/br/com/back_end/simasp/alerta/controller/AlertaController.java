package br.com.back_end.simasp.alerta.controller;

import br.com.back_end.simasp.alerta.dto.AlertaResponse;
import br.com.back_end.simasp.alerta.enums.StatusAlertaEnum;
import br.com.back_end.simasp.alerta.service.AlertaService;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

/** Alertas para o app (#13). Público: só sensor, nível e hora, nenhum dado de usuário. */
@RestController
@RequestMapping("/alertas")
public class AlertaController {

    private final AlertaService service;

    public AlertaController(AlertaService service) {
        this.service = service;
    }

    /** {@code status} padrão ATIVO. */
    @GetMapping
    public ResponseEntity<List<AlertaResponse>> listar(
            @RequestParam(defaultValue = "ATIVO") StatusAlertaEnum status) {
        return ResponseEntity.ok(service.listar(status, null));
    }
}
