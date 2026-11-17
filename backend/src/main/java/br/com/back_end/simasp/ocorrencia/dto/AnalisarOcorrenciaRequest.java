package br.com.back_end.simasp.ocorrencia.dto;

import br.com.back_end.simasp.ocorrencia.enums.SituacaoOcorrenciaEnum;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

/** {@code PATCH /admin/ocorrencias/{id}}: aprovar, ou recusar com motivo. */
public record AnalisarOcorrenciaRequest(
        @NotNull(message = "Informe APROVADA ou RECUSADA.")
        SituacaoOcorrenciaEnum situacao,

        @Size(max = 300, message = "O motivo pode ter até 300 caracteres.")
        String motivo
) {
}
