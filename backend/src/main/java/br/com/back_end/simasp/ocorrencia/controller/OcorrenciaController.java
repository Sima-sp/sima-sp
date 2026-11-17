package br.com.back_end.simasp.ocorrencia.controller;

import br.com.back_end.simasp.ocorrencia.dto.MinhaOcorrenciaResponse;
import br.com.back_end.simasp.ocorrencia.dto.NovaOcorrenciaRequest;
import br.com.back_end.simasp.ocorrencia.dto.OcorrenciaPublicaResponse;
import br.com.back_end.simasp.ocorrencia.service.FotoService;
import br.com.back_end.simasp.ocorrencia.service.OcorrenciaService;
import jakarta.validation.Valid;
import org.springframework.core.io.FileSystemResource;
import org.springframework.core.io.Resource;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.nio.file.Path;
import java.time.Duration;
import java.util.List;

/** Relatos do cidadão (#15). */
@RestController
public class OcorrenciaController {

    private final OcorrenciaService service;

    public OcorrenciaController(OcorrenciaService service)
    {
        this.service = service;
    }

    /** Enviar um relato (multipart): tipo, descricao, latitude, longitude e, opcional, foto (JPEG/PNG, até 5 MB). */
    @PostMapping(value = "/ocorrencias", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public ResponseEntity<MinhaOcorrenciaResponse> registrar(@AuthenticationPrincipal Jwt jwt,
                                                             @Valid @ModelAttribute NovaOcorrenciaRequest request,
                                                             @RequestPart(value = "foto", required = false) MultipartFile foto)
    {
        return ResponseEntity.status(HttpStatus.CREATED).body(service.registrar(usuarioId(jwt), request, foto));
    }

    /** Mapa: só as aprovadas e ainda válidas, sem dados de quem relatou. */
    @GetMapping("/ocorrencias")
    public ResponseEntity<List<OcorrenciaPublicaResponse>> publicas()
    {
        return ResponseEntity.ok(service.publicas());
    }

    @GetMapping("/ocorrencias/{id}/foto")
    public ResponseEntity<Resource> fotoPublica(@PathVariable Long id)
    {
        return foto(service.fotoPublica(id).orElse(null));
    }

    @GetMapping("/usuarios/me/ocorrencias")
    public ResponseEntity<List<MinhaOcorrenciaResponse>> minhas(@AuthenticationPrincipal Jwt jwt)
    {
        return ResponseEntity.ok(service.minhas(usuarioId(jwt)));
    }

    static ResponseEntity<Resource> foto(Path arquivo)
    {
        if(arquivo == null)
        {
            return ResponseEntity.notFound().build();
        }

        String nome = arquivo.getFileName().toString();
        return ResponseEntity.ok()
                .contentType(MediaType.parseMediaType(FotoService.tipoDeConteudo(nome)))
                .cacheControl(CacheControl.maxAge(Duration.ofHours(1)))
                .header("X-Content-Type-Options", "nosniff")
                .body(new FileSystemResource(arquivo));
    }

    static Long usuarioId(Jwt jwt)
    {
        return Long.valueOf(jwt.getClaimAsString("usuarioId"));
    }
}
