package br.com.back_end.simasp.auth.controller;

import br.com.back_end.simasp.auth.dto.LoginRequest;
import br.com.back_end.simasp.auth.dto.LoginResponse;
import br.com.back_end.simasp.auth.service.AuthService;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/auth")
public class AuthController {

    @Autowired
    private AuthService service;


    @PostMapping("/login")
    public ResponseEntity<LoginResponse> login(@Valid @RequestBody LoginRequest request, HttpServletRequest http)
    {
        LoginResponse response = service.login(request, http.getRemoteAddr());

        return ResponseEntity.ok(response);
    }
}
