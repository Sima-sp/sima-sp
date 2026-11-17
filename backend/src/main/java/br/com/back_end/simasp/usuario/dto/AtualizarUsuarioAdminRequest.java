package br.com.back_end.simasp.usuario.dto;

import jakarta.validation.constraints.NotNull;

/** {@code PATCH /admin/usuarios/{email}}: ativar ou desativar a conta. */
public record AtualizarUsuarioAdminRequest(
        @NotNull(message = "Informe se a conta fica ativa.")
        Boolean ativo
) {
}
