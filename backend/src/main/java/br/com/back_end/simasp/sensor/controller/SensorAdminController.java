package br.com.back_end.simasp.sensor.controller;

import br.com.back_end.simasp.sensor.dto.AtualizarSensorRequest;
import br.com.back_end.simasp.sensor.dto.ChaveSensorResponse;
import br.com.back_end.simasp.sensor.dto.SensorRequest;
import br.com.back_end.simasp.sensor.dto.SensorResponse;
import br.com.back_end.simasp.sensor.service.SensorAdminService;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/admin/sensores")
public class SensorAdminController {

    private final SensorAdminService serviceAdmin;

    public SensorAdminController(SensorAdminService serviceAdmin) {
        this.serviceAdmin = serviceAdmin;
    }

    @PostMapping
    public ResponseEntity<SensorResponse> cadastrarSensor(@Valid @RequestBody SensorRequest sensor)
    {
        return ResponseEntity.status(HttpStatus.CREATED).body(serviceAdmin.cadastrarSensor(sensor));
    }

    /** Status, localização, vizinhança, código, profundidade e distância de cheio: só o que vier. */
    @PatchMapping("/{id}")
    public ResponseEntity<SensorResponse> atualizarSensor(@PathVariable Long id, @Valid @RequestBody AtualizarSensorRequest request)
    {
        return ResponseEntity.ok(serviceAdmin.atualizarSensor(id, request));
    }

    /** Gera (ou troca) a chave do sensor. A chave só aparece nesta resposta. */
    @PostMapping("/{id}/chave")
    public ResponseEntity<ChaveSensorResponse> gerarChave(@PathVariable Long id)
    {
        return ResponseEntity.ok(serviceAdmin.gerarChave(id));
    }
}
