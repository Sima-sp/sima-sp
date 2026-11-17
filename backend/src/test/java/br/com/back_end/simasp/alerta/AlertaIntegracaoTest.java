package br.com.back_end.simasp.alerta;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.core.env.Environment;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.util.List;
import java.util.Locale;
import java.util.UUID;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ThreadLocalRandom;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Alertas a partir da leitura (#13), com o backend de verdade. {@code alerta.resolver-apos=PT0S}:
 * a primeira leitura abaixo do crítico já resolve o alerta.
 */
@SpringBootTest(
        webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
        properties = {
                "admin.email=admin.teste@simasp.local",
                "admin.senha=senha-do-admin-123",
                "alerta.resolver-apos=PT0S"
        })
class AlertaIntegracaoTest {

    @Autowired
    private Environment ambiente;

    private final HttpClient http = HttpClient.newHttpClient();

    private HttpRequest pedido(String metodo, String caminho, String token, String json, String chaveSensor) {
        HttpRequest.Builder pedido = HttpRequest.newBuilder(
                URI.create("http://localhost:" + ambiente.getProperty("local.server.port") + caminho));
        if (token != null) {
            pedido.header("Authorization", "Bearer " + token);
        }
        if (chaveSensor != null) {
            pedido.header("X-Sensor-Chave", chaveSensor);
        }
        if (json != null) {
            pedido.header("Content-Type", "application/json");
            return pedido.method(metodo, HttpRequest.BodyPublishers.ofString(json)).build();
        }
        return pedido.method(metodo, HttpRequest.BodyPublishers.noBody()).build();
    }

    private HttpResponse<String> enviar(String metodo, String caminho, String token, String json, String chave) throws Exception {
        return http.send(pedido(metodo, caminho, token, json, chave), HttpResponse.BodyHandlers.ofString());
    }

    private static String campo(HttpResponse<String> resposta, String regex) {
        Matcher m = Pattern.compile(regex).matcher(resposta.body());
        assertThat(m.find()).as("%s em %s", regex, resposta.body()).isTrue();
        return m.group(1);
    }

    private static int quantos(String texto, String trecho) {
        return texto.split(Pattern.quote(trecho), -1).length - 1;
    }

    private String admin() throws Exception {
        HttpResponse<String> login = enviar("POST", "/auth/login", null,
                "{\"email\":\"admin.teste@simasp.local\",\"senha\":\"senha-do-admin-123\"}", null);
        return campo(login, "\"token\"\\s*:\\s*\"([^\"]+)\"");
    }

    private record SensorDeTeste(long id, String codigo, String chave) {
    }

    private SensorDeTeste sensor(String admin) throws Exception {
        String codigo = "alerta_" + UUID.randomUUID().toString().substring(0, 8);
        String json = String.format(Locale.ROOT, """
                {"latitude": %.6f, "longitude": %.6f, "vizinhanca": "Bancada", "dataInstalacao": "2026-11-01T10:00:00",
                 "codigo": "%s", "profundidadeCm": 60.0, "distanciaCheioCm": 20.0}
                """, -23.4 - ThreadLocalRandom.current().nextDouble(0.4), -46.4 - ThreadLocalRandom.current().nextDouble(0.4), codigo);
        HttpResponse<String> criado = enviar("POST", "/admin/sensores/cadastro-sensor", admin, json, null);
        assertThat(criado.statusCode()).as(criado.body()).isEqualTo(201);
        long id = Long.parseLong(campo(criado, "\"id\"\\s*:\\s*(\\d+)"));
        String chave = campo(enviar("POST", "/admin/sensores/" + id + "/chave", admin, null, null), "\"chave\"\\s*:\\s*\"([^\"]+)\"");
        return new SensorDeTeste(id, codigo, chave);
    }

    private HttpResponse<String> leitura(SensorDeTeste s, String distancia) throws Exception {
        HttpResponse<String> r = enviar("POST", "/leituras", null,
                "{\"codigo\":\"" + s.codigo() + "\",\"distanciaCm\":" + distancia + "}", s.chave());
        assertThat(r.statusCode()).as(r.body()).isEqualTo(201);
        return r;
    }

    private String alertasDoSensor(String admin, SensorDeTeste s) throws Exception {
        HttpResponse<String> r = enviar("GET", "/admin/alertas?sensorId=" + s.id(), admin, null, null);
        assertThat(r.statusCode()).as(r.body()).isEqualTo(200);
        return r.body();
    }

    private String ativosPublicos() throws Exception {
        HttpResponse<String> r = enviar("GET", "/alertas?status=ATIVO", null, null, null);
        assertThat(r.statusCode()).as(r.body()).isEqualTo(200);
        return r.body();
    }

    @Test
    void leituraCriticaCriaUmAlertaEASegundaNaoDuplica() throws Exception {
        String admin = admin();
        SensorDeTeste s = sensor(admin);

        leitura(s, "15");  // mais perto que o cheio: 100 %, crítico
        assertThat(quantos(ativosPublicos(), "\"codigo\":\"" + s.codigo() + "\"")).isEqualTo(1);

        leitura(s, "18");
        String doSensor = alertasDoSensor(admin, s);
        assertThat(quantos(doSensor, "\"id\":")).isEqualTo(1);
        assertThat(doSensor).contains("\"status\":\"ATIVO\"").contains("\"nivelRisco\":\"CRITICO\"")
                .contains("transbordando").doesNotContain("email");
    }

    @Test
    void leituraNormalNaoCriaAlerta() throws Exception {
        String admin = admin();
        SensorDeTeste s = sensor(admin);

        leitura(s, "45");
        assertThat(quantos(alertasDoSensor(admin, s), "\"id\":")).isZero();
    }

    @Test
    void aguaBaixandoResolveSozinho() throws Exception {
        String admin = admin();
        SensorDeTeste s = sensor(admin);

        leitura(s, "15");
        leitura(s, "50");
        String doSensor = alertasDoSensor(admin, s);
        assertThat(doSensor).contains("\"status\":\"RESOLVIDO\"").containsPattern("\"resolvidoEm\":\"[^\"]+-03:00\"");
        assertThat(ativosPublicos()).doesNotContain("\"codigo\":\"" + s.codigo() + "\"");
    }

    @Test
    void depoisDeResolvidoPeloAdminOSensorPodeTerOutroAlerta() throws Exception {
        String admin = admin();
        SensorDeTeste s = sensor(admin);

        leitura(s, "15");
        String id = campo(enviar("GET", "/admin/alertas?sensorId=" + s.id(), admin, null, null), "\"id\":(\\d+)");
        HttpResponse<String> resolvido = enviar("PATCH", "/admin/alertas/" + id + "/resolver", admin, null, null);
        assertThat(resolvido.statusCode()).as(resolvido.body()).isEqualTo(200);
        assertThat(resolvido.body()).contains("\"status\":\"RESOLVIDO\"");

        leitura(s, "15");
        String doSensor = alertasDoSensor(admin, s);
        assertThat(quantos(doSensor, "\"id\":")).isEqualTo(2);
        assertThat(quantos(doSensor, "\"status\":\"ATIVO\"")).isEqualTo(1);
    }

    @Test
    void duasLeiturasCriticasAoMesmoTempoDaoUmAlertaSo() throws Exception {
        String admin = admin();
        SensorDeTeste s = sensor(admin);

        String json = "{\"codigo\":\"" + s.codigo() + "\",\"distanciaCm\":15}";
        List<CompletableFuture<HttpResponse<String>>> juntas = List.of(
                http.sendAsync(pedido("POST", "/leituras", null, json, s.chave()), HttpResponse.BodyHandlers.ofString()),
                http.sendAsync(pedido("POST", "/leituras", null, json, s.chave()), HttpResponse.BodyHandlers.ofString()),
                http.sendAsync(pedido("POST", "/leituras", null, json, s.chave()), HttpResponse.BodyHandlers.ofString()));
        for (CompletableFuture<HttpResponse<String>> r : juntas) {
            assertThat(r.get().statusCode()).isEqualTo(201);
        }
        assertThat(quantos(alertasDoSensor(admin, s), "\"status\":\"ATIVO\"")).isEqualTo(1);
    }

    @Test
    void resolverExigeAdmin() throws Exception {
        assertThat(enviar("PATCH", "/admin/alertas/1/resolver", null, null, null).statusCode()).isEqualTo(401);
        assertThat(enviar("GET", "/admin/alertas", null, null, null).statusCode()).isEqualTo(401);
        assertThat(enviar("PATCH", "/admin/alertas/999999999/resolver", admin(), null, null).statusCode()).isEqualTo(404);
    }
}
