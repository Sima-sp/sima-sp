package br.com.back_end.simasp.push.service;

import br.com.back_end.simasp.alerta.entity.Alerta;
import br.com.back_end.simasp.alerta.repository.AlertaRepository;
import br.com.back_end.simasp.exception.AlteracaoInvalidaException;
import br.com.back_end.simasp.exception.RecursoNaoEncontradoException;
import br.com.back_end.simasp.push.config.PushProperties;
import br.com.back_end.simasp.push.dto.InscricaoPushRequest;
import br.com.back_end.simasp.push.dto.InscricaoPushResponse;
import br.com.back_end.simasp.push.entity.EnvioPush;
import br.com.back_end.simasp.push.entity.InscricaoPush;
import br.com.back_end.simasp.push.repository.EnvioPushRepository;
import br.com.back_end.simasp.push.repository.InscricaoPushRepository;
import br.com.back_end.simasp.sensor.entity.Sensor;
import br.com.back_end.simasp.usuario.repository.UsuarioRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.security.GeneralSecurityException;
import java.time.Clock;
import java.time.LocalDateTime;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;

/**
 * Notificação no celular quando um bueiro entra em alerta (#14).
 *
 * <p>Quem recebe: conta ativa, permissão de alerta ligada e localização de referência a até
 * {@code push.raio-metros} do bueiro. Cada pessoa recebe no máximo um aviso por alerta (índice
 * único em TBL_ENVIO_PUSH). Inscrição que o serviço de push diz não existir mais (404/410) fica
 * inativa. Sem as chaves VAPID, nada é enviado (e o app não consegue se inscrever).
 */
@Service
public class PushService {

    private static final Logger LOG = LoggerFactory.getLogger(PushService.class);

    /** Serviços de push dos navegadores. O backend só manda para eles (evita usar o servidor para chamar outros endereços). */
    private static final List<String> SERVICOS = List.of(
            "fcm.googleapis.com", "android.googleapis.com",
            ".push.services.mozilla.com", "push.services.mozilla.com",
            ".push.apple.com", ".notify.windows.com");

    private final InscricaoPushRepository inscricoes;
    private final EnvioPushRepository envios;
    private final UsuarioRepository usuarios;
    private final AlertaRepository alertas;
    private final EntregadorPush entregador;
    private final PushProperties propriedades;
    private final Clock relogio;
    private final Vapid vapid;

    public PushService(InscricaoPushRepository inscricoes, EnvioPushRepository envios, UsuarioRepository usuarios,
                       AlertaRepository alertas, EntregadorPush entregador, PushProperties propriedades, Clock relogio)
    {
        this.inscricoes = inscricoes;
        this.envios = envios;
        this.usuarios = usuarios;
        this.alertas = alertas;
        this.entregador = entregador;
        this.propriedades = propriedades;
        this.relogio = relogio;
        this.vapid = propriedades.configurado() ? new Vapid(propriedades, relogio) : null;

        if(vapid == null)
        {
            LOG.warn("Push desligado: defina VAPID_PUBLIC_KEY e VAPID_PRIVATE_KEY para avisar no celular (#14).");
        }
    }

    public Optional<String> chavePublica()
    {
        return vapid == null ? Optional.empty() : Optional.of(propriedades.chavePublica().trim());
    }

    /** Guarda (ou atualiza) a inscrição do aparelho. O mesmo aparelho com outra conta passa para a nova conta. */
    @Transactional
    public InscricaoPushResponse inscrever(Long usuarioId, InscricaoPushRequest request)
    {
        String endpoint = request.endpoint().trim();
        validarEndpoint(endpoint);
        validarChaves(request.keys().p256dh(), request.keys().auth());

        InscricaoPush inscricao = inscricoes.findByEndpoint(endpoint).orElseGet(InscricaoPush::new);
        if(inscricao.getId() == null)
        {
            inscricao.setEndpoint(endpoint);
            inscricao.setDataCriacao(LocalDateTime.now(relogio));
        }
        inscricao.setUsuario(usuarios.getReferenceById(usuarioId));
        inscricao.setP256dh(request.keys().p256dh().trim());
        inscricao.setAuth(request.keys().auth().trim());
        inscricao.setAtiva(true);

        return new InscricaoPushResponse(inscricoes.save(inscricao).getId());
    }

    @Transactional
    public void remover(Long usuarioId, Long inscricaoId)
    {
        InscricaoPush inscricao = inscricoes.findByIdAndUsuarioId(inscricaoId, usuarioId)
                .orElseThrow(() -> new RecursoNaoEncontradoException("Inscrição não encontrada."));
        inscricoes.delete(inscricao);
    }

    /** Avisa quem está perto do bueiro do alerta. Chamado fora da requisição (assíncrono). */
    public void avisar(Long alertaId)
    {
        if(vapid == null)
        {
            return;
        }

        Alerta alerta = alertas.findById(alertaId).orElse(null);
        if(alerta == null || alerta.getSensor() == null)
        {
            return;
        }

        Sensor sensor = alerta.getSensor();
        List<Long> destinatarios = usuarios.buscarQuemAvisar(sensor.getLongitude(), sensor.getLatitude(), propriedades.raioMetros());
        byte[] mensagem = mensagem(alerta, sensor).getBytes(StandardCharsets.UTF_8);

        for(Long usuarioId : destinatarios)
        {
            EnvioPush envio = reservar(alertaId, usuarioId);
            if(envio == null)
            {
                continue; // essa pessoa já foi avisada deste alerta
            }

            envio.setResultado(entregarParaAparelhos(usuarioId, mensagem));
            envios.save(envio);
        }
    }

    /** Grava o envio antes de mandar; se já existe (índice único), devolve nulo. */
    private EnvioPush reservar(Long alertaId, Long usuarioId)
    {
        if(envios.existsByAlertaIdAndUsuarioId(alertaId, usuarioId))
        {
            return null;
        }

        EnvioPush envio = new EnvioPush();
        envio.setAlertaId(alertaId);
        envio.setUsuarioId(usuarioId);
        envio.setResultado(EnvioPush.ENVIANDO);
        envio.setDataEnvio(LocalDateTime.now(relogio));
        try
        {
            return envios.saveAndFlush(envio);
        }
        catch(DataIntegrityViolationException corrida)
        {
            return null;
        }
    }

    private String entregarParaAparelhos(Long usuarioId, byte[] mensagem)
    {
        List<InscricaoPush> aparelhos = inscricoes.findByUsuarioIdAndAtivaTrue(usuarioId);
        if(aparelhos.isEmpty())
        {
            return EnvioPush.SEM_APARELHO;
        }

        boolean algumChegou = false;
        for(InscricaoPush aparelho : aparelhos)
        {
            int status = entregar(aparelho, mensagem);
            if(status >= 200 && status < 300)
            {
                algumChegou = true;
            }
            else if(status == 404 || status == 410)
            {
                aparelho.setAtiva(false);
                inscricoes.save(aparelho);
            }
            else
            {
                LOG.warn("Push para a inscrição {} voltou {}", aparelho.getId(), status);
            }
        }
        return algumChegou ? EnvioPush.ENVIADO : EnvioPush.FALHOU;
    }

    private int entregar(InscricaoPush aparelho, byte[] mensagem)
    {
        byte[] corpo;
        try
        {
            corpo = CriptografiaWebPush.cifrar(mensagem, Vapid.decodificar(aparelho.getP256dh()), Vapid.decodificar(aparelho.getAuth()));
        }
        catch(RuntimeException e)
        {
            LOG.warn("Inscrição {} com chaves inválidas: desativada", aparelho.getId());
            aparelho.setAtiva(false);
            inscricoes.save(aparelho);
            return 0;
        }

        Map<String, String> cabecalhos = new LinkedHashMap<>();
        cabecalhos.put("Authorization", vapid.cabecalho(aparelho.getEndpoint()));
        cabecalhos.put("Content-Encoding", "aes128gcm");
        cabecalhos.put("Content-Type", "application/octet-stream");
        cabecalhos.put("TTL", "3600");
        cabecalhos.put("Urgency", "high");
        return entregador.entregar(aparelho.getEndpoint(), cabecalhos, corpo);
    }

    /** O que o service worker do app recebe (JSON). */
    static String mensagem(Alerta alerta, Sensor sensor)
    {
        String onde = sensor.getVizinhanca() == null || sensor.getVizinhanca().isBlank() ? "perto de você" : "em " + sensor.getVizinhanca();
        String corpo = alerta.getMensagem() != null && !alerta.getMensagem().isBlank()
                ? alerta.getMensagem()
                : "Bueiro " + onde + " em nível crítico.";

        return String.format(Locale.ROOT,
                "{\"titulo\":%s,\"corpo\":%s,\"alertaId\":%d,\"sensorId\":%d,\"codigo\":%s}",
                json("Alerta de alagamento " + onde), json(corpo), alerta.getId(), sensor.getId(), json(sensor.getCodigo()));
    }

    private static String json(String texto)
    {
        if(texto == null)
        {
            return "null";
        }
        StringBuilder saida = new StringBuilder("\"");
        for(char c : texto.toCharArray())
        {
            switch(c)
            {
                case '"' -> saida.append("\\\"");
                case '\\' -> saida.append("\\\\");
                case '\n' -> saida.append("\\n");
                case '\r' -> saida.append("\\r");
                case '\t' -> saida.append("\\t");
                default -> {
                    if(c < 0x20)
                    {
                        saida.append(String.format("\\u%04x", (int) c));
                    }
                    else
                    {
                        saida.append(c);
                    }
                }
            }
        }
        return saida.append('"').toString();
    }

    private static void validarEndpoint(String endpoint)
    {
        URI uri;
        try
        {
            uri = URI.create(endpoint);
        }
        catch(IllegalArgumentException e)
        {
            throw new AlteracaoInvalidaException("Endpoint de push inválido.");
        }

        String host = uri.getHost() == null ? "" : uri.getHost().toLowerCase(Locale.ROOT);
        boolean conhecido = SERVICOS.stream().anyMatch(s -> s.startsWith(".") ? host.endsWith(s) : host.equals(s));
        if(!"https".equalsIgnoreCase(uri.getScheme()) || uri.getUserInfo() != null || !conhecido)
        {
            throw new AlteracaoInvalidaException("Endpoint de push não é de um serviço de push conhecido.");
        }
    }

    private static void validarChaves(String p256dh, String auth)
    {
        try
        {
            CriptografiaWebPush.chavePublica(Vapid.decodificar(p256dh));
            if(Vapid.decodificar(auth).length != 16)
            {
                throw new AlteracaoInvalidaException("Chave auth inválida.");
            }
        }
        catch(GeneralSecurityException | IllegalArgumentException e)
        {
            throw new AlteracaoInvalidaException("Chave p256dh inválida.");
        }
    }
}
