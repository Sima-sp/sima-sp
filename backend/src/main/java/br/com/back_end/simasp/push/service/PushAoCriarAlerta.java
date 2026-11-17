package br.com.back_end.simasp.push.service;

import br.com.back_end.simasp.alerta.evento.AlertaCriadoEvent;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Component;
import org.springframework.transaction.event.TransactionalEventListener;

/** Alerta criado (já gravado) → avisa no celular, fora da requisição do sensor (#14). */
@Component
public class PushAoCriarAlerta {

    private static final Logger LOG = LoggerFactory.getLogger(PushAoCriarAlerta.class);

    private final PushService push;

    public PushAoCriarAlerta(PushService push)
    {
        this.push = push;
    }

    @Async
    @TransactionalEventListener(fallbackExecution = true)
    public void aoCriarAlerta(AlertaCriadoEvent evento)
    {
        try
        {
            push.avisar(evento.alertaId());
        }
        catch(RuntimeException e)
        {
            LOG.error("Falha ao avisar o alerta {} no celular", evento.alertaId(), e);
        }
    }
}
