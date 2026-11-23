package br.com.back_end.simasp.push.service;

import java.util.Map;

/** Entrega uma notificação já cifrada ao serviço de push. Separado para o teste trocar por um falso. */
public interface EntregadorPush {

    /** Faz o POST e devolve o status HTTP do serviço de push (201 é entregue; 404 e 410, inscrição morta). */
    int entregar(String endpoint, Map<String, String> cabecalhos, byte[] corpo);
}
