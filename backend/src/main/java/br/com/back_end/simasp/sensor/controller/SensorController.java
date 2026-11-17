package br.com.back_end.simasp.sensor.controller;

import br.com.back_end.simasp.sensor.dto.SensorResponse;
import br.com.back_end.simasp.sensor.enums.StatusSensor;
import br.com.back_end.simasp.sensor.service.SensorService;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.math.BigDecimal;
import java.util.List;

/** Catálogo público de sensores. */
@RestController
@RequestMapping("/sensores")
public class SensorController {

    private final SensorService service;

    public SensorController(SensorService service) {
        this.service = service;
    }

    /** {@code GET /sensores?latitude=&longitude=&raio=&status=}: todos os filtros são opcionais. */
    @GetMapping
    public ResponseEntity<Page<SensorResponse>> buscar(@RequestParam(required = false) BigDecimal latitude,
                                                       @RequestParam(required = false) BigDecimal longitude,
                                                       @RequestParam(required = false) Integer raio,
                                                       @RequestParam(required = false) StatusSensor status,
                                                       Pageable pageable)
    {
        return ResponseEntity.ok(service.buscar(latitude, longitude, raio, status, pageable));
    }

    // Só números: assim "/sensores/vizinhanca/..." nunca cai aqui.
    @GetMapping("/{id:\\d+}")
    public ResponseEntity<SensorResponse> buscarSensorPorId(@PathVariable Long id)
    {
        return ResponseEntity.ok(service.buscarSensorPorId(id));
    }

    @GetMapping("/vizinhanca/{vizinhanca}")
    public ResponseEntity<List<SensorResponse>> buscarSensoresPorVizinhanca(@PathVariable String vizinhanca)
    {
        return ResponseEntity.ok(service.buscarSensoresPorVizinhanca(vizinhanca));
    }
}
