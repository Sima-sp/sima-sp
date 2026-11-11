package br.com.back_end.simasp.sensor.controller;

import br.com.back_end.simasp.sensor.dto.AlterarLocalizacaoSensor;
import br.com.back_end.simasp.sensor.dto.AlterarStatusSensor;
import br.com.back_end.simasp.sensor.dto.SensorRequest;
import br.com.back_end.simasp.sensor.dto.SensorResponse;
import br.com.back_end.simasp.sensor.enums.StatusSensor;
import br.com.back_end.simasp.sensor.service.SensorAdminService;
import jakarta.validation.Valid;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.math.BigDecimal;

@RestController
@RequestMapping("/admin/sensores")
//@CrossOrigin("*")

public class SensorAdminController {

    @Autowired
    private SensorAdminService serviceAdmin;

    @GetMapping("/sensores-proximos/manutencao")
    public ResponseEntity<Page<SensorResponse>> buscarSensoresEmManutencaoProximos(@RequestParam BigDecimal longitude, @RequestParam BigDecimal latitude, @RequestParam Integer distanciaMetros, Pageable pageable)
    {
        return ResponseEntity.ok(serviceAdmin.buscarSensoresEmManutencaoProximos(longitude, latitude, distanciaMetros, pageable));
    }

    @GetMapping("/sensores-proximos/inativo")
    public ResponseEntity<Page<SensorResponse>> buscarSensoresInativosProximos(@RequestParam BigDecimal longitude, @RequestParam BigDecimal latitude, @RequestParam Integer distanciaMetros, Pageable pageable)
    {
        return ResponseEntity.ok(serviceAdmin.buscarSensoresInativosProximos(longitude, latitude, distanciaMetros, pageable));
    }

    @PostMapping("/cadastro-sensor")
    public ResponseEntity<SensorResponse> cadastrarSensor(@Valid @RequestBody SensorRequest sensor) {

        SensorResponse sensorCriado = serviceAdmin.cadastrarSensor(sensor);

        return ResponseEntity.status(HttpStatus.CREATED).body(sensorCriado);
    }

    @PatchMapping("/modificar-sensor/{id}/inativar")
    public ResponseEntity<Void> inativarSensor(@PathVariable Long id)
    {
        AlterarStatusSensor request = new AlterarStatusSensor(StatusSensor.INATIVO);
        serviceAdmin.atualizarStatusSensor(id, request);
        return ResponseEntity.noContent().build();
    }


    @PatchMapping("/modificar-sensor/{id}/ativar")
    public ResponseEntity<Void> ativarSensor(@PathVariable Long id)
    {
        AlterarStatusSensor request = new AlterarStatusSensor(StatusSensor.ATIVO);
        serviceAdmin.atualizarStatusSensor(id, request);
        return ResponseEntity.noContent().build();
    }


    @PatchMapping("/modificar-sensor/{id}/manter")
    public ResponseEntity<Void> manterSensor(@PathVariable Long id)
    {
        AlterarStatusSensor request = new AlterarStatusSensor(StatusSensor.MANUTENCAO);
        serviceAdmin.atualizarStatusSensor(id, request);
        return ResponseEntity.noContent().build();
    }

    @PatchMapping("/modificar-localizacao-sensor/{id}")
    public ResponseEntity<Void> atualizarLocalizacaoSensor(@PathVariable Long id, @RequestBody AlterarLocalizacaoSensor request)
    {
        serviceAdmin.atualizarLocalizacaoSensor(id, request);
        return ResponseEntity.noContent().build();
    }

}
