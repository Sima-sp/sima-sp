package br.com.back_end.simasp.push.controller;

import br.com.back_end.simasp.push.dto.ChavePublicaResponse;
import br.com.back_end.simasp.push.dto.InscricaoPushRequest;
import br.com.back_end.simasp.push.dto.InscricaoPushResponse;
import br.com.back_end.simasp.push.service.PushService;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.*;

/** Inscrição do aparelho para receber avisos (#14). */
@RestController
public class PushController {

    private final PushService service;

    public PushController(PushService service)
    {
        this.service = service;
    }

    /** Chave VAPID pública. 503 se o servidor está sem as chaves (push desligado). */
    @GetMapping("/push/chave-publica")
    public ResponseEntity<ChavePublicaResponse> chavePublica()
    {
        return service.chavePublica()
                .map(chave -> ResponseEntity.ok(new ChavePublicaResponse(chave)))
                .orElseGet(() -> ResponseEntity.status(HttpStatus.SERVICE_UNAVAILABLE).build());
    }

    /** Guarda a inscrição do aparelho (o objeto de {@code PushSubscription.toJSON()}). */
    @PostMapping("/usuarios/me/push")
    public ResponseEntity<InscricaoPushResponse> inscrever(@AuthenticationPrincipal Jwt jwt, @Valid @RequestBody InscricaoPushRequest request)
    {
        return ResponseEntity.status(HttpStatus.CREATED).body(service.inscrever(usuarioId(jwt), request));
    }

    @DeleteMapping("/usuarios/me/push/{id}")
    public ResponseEntity<Void> remover(@AuthenticationPrincipal Jwt jwt, @PathVariable Long id)
    {
        service.remover(usuarioId(jwt), id);
        return ResponseEntity.noContent().build();
    }

    private static Long usuarioId(Jwt jwt)
    {
        return Long.valueOf(jwt.getClaimAsString("usuarioId"));
    }
}
