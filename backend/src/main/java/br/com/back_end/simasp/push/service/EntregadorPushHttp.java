package br.com.back_end.simasp.push.service;

import org.springframework.stereotype.Component;

import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.Map;

/** O de verdade: um POST para o endereço da inscrição. Erro de rede conta como falha (status 0). */
@Component
public class EntregadorPushHttp implements EntregadorPush {

    private final HttpClient http = HttpClient.newBuilder()
            .connectTimeout(Duration.ofSeconds(5))
            .followRedirects(HttpClient.Redirect.NEVER)
            .build();

    @Override
    public int entregar(String endpoint, Map<String, String> cabecalhos, byte[] corpo)
    {
        HttpRequest.Builder pedido = HttpRequest.newBuilder(URI.create(endpoint))
                .timeout(Duration.ofSeconds(10))
                .POST(HttpRequest.BodyPublishers.ofByteArray(corpo));
        cabecalhos.forEach(pedido::header);

        try
        {
            return http.send(pedido.build(), HttpResponse.BodyHandlers.discarding()).statusCode();
        }
        catch(IOException e)
        {
            return 0;
        }
        catch(InterruptedException e)
        {
            Thread.currentThread().interrupt();
            return 0;
        }
    }
}
