package br.com.back_end.simasp.sensor.controller;

import br.com.back_end.simasp.sensor.dto.SensorResponse;
import br.com.back_end.simasp.sensor.service.SensorService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.math.BigDecimal;
import java.util.List;

@RestController
@RequestMapping("/sensores")
//@CrossOrigin("*")

public class SensorController {

    @Autowired
    private SensorService service;

    /*
    @GetMapping
    public ResponseEntity<List<SensorResponse>> buscarSensores()
    {
        return ResponseEntity.ok(service.buscarSensores());
    }
    */

    @GetMapping("/sensores-proximos/ativo")
    public ResponseEntity<Page<SensorResponse>> buscarSensoresAtivosProximos(@RequestParam BigDecimal longitude, @RequestParam BigDecimal latitude, @RequestParam Integer distanciaMetros, Pageable pageable)
    {
        return ResponseEntity.ok(service.buscarSensoresAtivosProximos(longitude, latitude, distanciaMetros, pageable));
    }

    @GetMapping("/{id}")
    public ResponseEntity<SensorResponse> buscarSensorPorId(@PathVariable Long id)
    {
        return ResponseEntity.ok(service.buscarSensorPorId(id));
    }

    @GetMapping("/{vizinhanca}")
    public ResponseEntity<SensorResponse> buscarSensorPorVizinhanca(@PathVariable String vizinhanca)
    {
        return ResponseEntity.ok(service.buscarSensorPorVizinhanca(vizinhanca));
    }

}
