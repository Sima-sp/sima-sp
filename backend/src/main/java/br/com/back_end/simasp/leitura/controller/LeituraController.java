package br.com.back_end.simasp.leitura.controller;

import br.com.back_end.simasp.leitura.dto.LeituraSensorRequest;
import br.com.back_end.simasp.leitura.dto.LeituraSensorResponse;
import br.com.back_end.simasp.leitura.service.LeituraService;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/leituras")
public class LeituraController {

    private final LeituraService service;

    public LeituraController(LeituraService service) {
        this.service = service;
    }

    /**
     * Leitura do servidor do sensor. Não usa login: a autenticação é a chave do sensor no
     * cabeçalho {@code X-Sensor-Chave} (gerada em {@code POST /admin/sensores/{id}/chave}).
     */
    @PostMapping
    public ResponseEntity<LeituraSensorResponse> registrar(
            @RequestHeader(value = "X-Sensor-Chave", required = false) String chave,
            @Valid @RequestBody LeituraSensorRequest request) {
        return ResponseEntity.status(HttpStatus.CREATED).body(service.registrar(chave, request));
    }
}
