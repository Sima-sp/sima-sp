package br.com.back_end.simasp.ocorrencia.controller;

import br.com.back_end.simasp.ocorrencia.dto.AnalisarOcorrenciaRequest;
import br.com.back_end.simasp.ocorrencia.dto.OcorrenciaAdminResponse;
import br.com.back_end.simasp.ocorrencia.enums.SituacaoOcorrenciaEnum;
import br.com.back_end.simasp.ocorrencia.service.OcorrenciaService;
import jakarta.validation.Valid;
import org.springframework.core.io.Resource;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.*;

import java.util.List;

/** Fila de análise dos relatos (#15). Na banca, usada pelo Swagger. */
@RestController
@RequestMapping("/admin/ocorrencias")
public class OcorrenciaAdminController {

    private final OcorrenciaService service;

    public OcorrenciaAdminController(OcorrenciaService service)
    {
        this.service = service;
    }

    /** Todas, ou só uma situação ({@code ?situacao=PENDENTE} é a fila). Mais novas primeiro. */
    @GetMapping
    public ResponseEntity<List<OcorrenciaAdminResponse>> listar(@RequestParam(required = false) SituacaoOcorrenciaEnum situacao)
    {
        return ResponseEntity.ok(service.paraAnalise(situacao));
    }

    /** Aprovar ({@code {"situacao":"APROVADA"}}) ou recusar com motivo. */
    @PatchMapping("/{id}")
    public ResponseEntity<OcorrenciaAdminResponse> analisar(@PathVariable Long id,
                                                            @AuthenticationPrincipal Jwt jwt,
                                                            @Valid @RequestBody AnalisarOcorrenciaRequest request)
    {
        return ResponseEntity.ok(service.analisar(id, OcorrenciaController.usuarioId(jwt), request));
    }

    @GetMapping("/{id}/foto")
    public ResponseEntity<Resource> foto(@PathVariable Long id)
    {
        return OcorrenciaController.foto(service.fotoParaAdmin(id).orElse(null));
    }
}
