package br.com.back_end.simasp.leitura;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.core.env.Environment;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.util.Locale;
import java.util.UUID;
import java.util.concurrent.ThreadLocalRandom;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * {@code POST /leituras} de ponta a ponta (#10) e os campos do sensor em {@code /previsoes} (#11),
 * com o backend de verdade e o MySQL do CI.
 */
@SpringBootTest(
        webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
        properties = {
                "admin.email=admin.teste@simasp.local",
                "admin.senha=senha-do-admin-123"
        })
class LeituraIntegracaoTest {

    @Autowired
    private Environment ambiente;

    private final HttpClient http = HttpClient.newHttpClient();

    // ---------------------------------------------------------------- ajudantes HTTP

    private HttpResponse<String> enviar(String metodo, String caminho, String token, String json,
                                        String chaveSensor) throws Exception {
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
            pedido.method(metodo, HttpRequest.BodyPublishers.ofString(json));
        } else {
            pedido.method(metodo, HttpRequest.BodyPublishers.noBody());
        }
        return http.send(pedido.build(), HttpResponse.BodyHandlers.ofString());
    }

    private static String campo(HttpResponse<String> resposta, String regex) {
        Matcher m = Pattern.compile(regex).matcher(resposta.body());
        assertThat(m.find()).as("%s em %s", regex, resposta.body()).isTrue();
        return m.group(1);
    }

    private String tokenAdmin() throws Exception {
        HttpResponse<String> login = enviar("POST", "/auth/login", null,
                "{\"email\":\"admin.teste@simasp.local\",\"senha\":\"senha-do-admin-123\"}", null);
        assertThat(login.statusCode()).as(login.body()).isEqualTo(200);
        return campo(login, "\"token\"\\s*:\\s*\"([^\"]+)\"");
    }

    private record SensorDeTeste(long id, String codigo, String chave) {
    }

    /** Cadastra um sensor num ponto único e, se pedido, gera a chave. */
    private SensorDeTeste sensor(String admin, Double profundidade, Double cheio, boolean comChave) throws Exception {
        String codigo = "teste_" + UUID.randomUUID().toString().substring(0, 8);
        double lat = -23.4 - ThreadLocalRandom.current().nextDouble(0.4);
        double lon = -46.4 - ThreadLocalRandom.current().nextDouble(0.4);
        String json = String.format(Locale.ROOT, """
                {"latitude": %.6f, "longitude": %.6f, "vizinhanca": "Bancada", "dataInstalacao": "2026-11-01T10:00:00",
                 "codigo": "%s", "profundidadeCm": %s, "distanciaCheioCm": %s}
                """, lat, lon, codigo, profundidade, cheio);
        HttpResponse<String> criado = enviar("POST", "/admin/sensores", admin, json, null);
        assertThat(criado.statusCode()).as(criado.body()).isEqualTo(201);
        long id = Long.parseLong(campo(criado, "\"id\"\\s*:\\s*(\\d+)"));

        String chave = null;
        if (comChave) {
            HttpResponse<String> gerada = enviar("POST", "/admin/sensores/" + id + "/chave", admin, null, null);
            assertThat(gerada.statusCode()).as(gerada.body()).isEqualTo(200);
            chave = campo(gerada, "\"chave\"\\s*:\\s*\"([^\"]+)\"");
        }
        return new SensorDeTeste(id, codigo, chave);
    }

    private HttpResponse<String> leitura(String chave, String codigo, String distancia) throws Exception {
        return enviar("POST", "/leituras", null,
                "{\"codigo\":\"" + codigo + "\",\"distanciaCm\":" + distancia + "}", chave);
    }

    // ---------------------------------------------------------------- testes

    @Test
    void leituraValidaGravaDistanciaENivelEApareceNasPrevisoes() throws Exception {
        String admin = tokenAdmin();
        SensorDeTeste s = sensor(admin, 60.0, 20.0, true);

        HttpResponse<String> gravada = leitura(s.chave(), s.codigo(), "30");
        assertThat(gravada.statusCode()).as(gravada.body()).isEqualTo(201);
        assertThat(gravada.body()).contains("\"nivelAgua\":75.0").contains("\"nivelRisco\":\"MEDIO\"")
                .contains("\"transbordando\":false");

        HttpResponse<String> doSensor = enviar("GET", "/previsoes/sensores/" + s.id(), null, null, null);
        assertThat(doSensor.statusCode()).as(doSensor.body()).isEqualTo(200);
        assertThat(doSensor.body())
                .contains("\"nivelAgua\":75.0")
                .contains("\"distanciaCm\":30.0")
                .contains("\"statusSensor\":\"ATIVO\"")
                .contains("\"codigo\":\"" + s.codigo() + "\"")
                .containsPattern("\"dataLeitura\":\"[^\"]+-03:00\"");

        HttpResponse<String> mapa = enviar("GET", "/previsoes", null, null, null);
        assertThat(mapa.statusCode()).isEqualTo(200);
        assertThat(mapa.body()).contains("\"codigo\":\"" + s.codigo() + "\"");
    }

    @Test
    void medidaComFusoVoltaNoHorarioDeSaoPaulo() throws Exception {
        String admin = tokenAdmin();
        SensorDeTeste s = sensor(admin, 60.0, 20.0, true);

        HttpResponse<String> gravada = enviar("POST", "/leituras", null,
                "{\"codigo\":\"" + s.codigo() + "\",\"distanciaCm\":50,\"medidaEm\":\"2026-11-16T17:20:00Z\"}", s.chave());
        assertThat(gravada.statusCode()).as(gravada.body()).isEqualTo(201);
        assertThat(gravada.body()).contains("\"medidaEm\":\"2026-11-16T14:20:00-03:00\"");
    }

    @Test
    void maisPertoQueOCheioEhTransbordando() throws Exception {
        SensorDeTeste s = sensor(tokenAdmin(), 60.0, 20.0, true);

        HttpResponse<String> gravada = leitura(s.chave(), s.codigo(), "12");
        assertThat(gravada.statusCode()).as(gravada.body()).isEqualTo(201);
        assertThat(gravada.body()).contains("\"nivelAgua\":100.0").contains("\"nivelRisco\":\"CRITICO\"")
                .contains("\"transbordando\":true");
    }

    @Test
    void semProfundidadeGravaSoADistancia() throws Exception {
        SensorDeTeste s = sensor(tokenAdmin(), null, null, true);

        HttpResponse<String> gravada = leitura(s.chave(), s.codigo(), "45.5");
        assertThat(gravada.statusCode()).as(gravada.body()).isEqualTo(201);
        assertThat(gravada.body()).contains("\"distanciaCm\":45.5").contains("\"nivelAgua\":null")
                .contains("\"nivelRisco\":null");
    }

    @Test
    void chaveAusenteOuErradaDa401() throws Exception {
        SensorDeTeste s = sensor(tokenAdmin(), 60.0, 20.0, true);

        assertThat(leitura(null, s.codigo(), "30").statusCode()).isEqualTo(401);
        assertThat(leitura("chave-errada", s.codigo(), "30").statusCode()).isEqualTo(401);
    }

    @Test
    void codigoDesconhecidoDa404() throws Exception {
        assertThat(leitura("qualquer", "nao_existe_" + UUID.randomUUID().toString().substring(0, 8), "30").statusCode()).isEqualTo(404);
    }

    @Test
    void distanciaInvalidaOuFaltandoDa400() throws Exception {
        SensorDeTeste s = sensor(tokenAdmin(), 60.0, 20.0, true);

        assertThat(leitura(s.chave(), s.codigo(), "0").statusCode()).isEqualTo(400);
        assertThat(leitura(s.chave(), s.codigo(), "-5").statusCode()).isEqualTo(400);
        assertThat(leitura(s.chave(), s.codigo(), "2500").statusCode()).isEqualTo(400);
        assertThat(enviar("POST", "/leituras", null, "{\"codigo\":\"" + s.codigo() + "\"}", s.chave()).statusCode())
                .isEqualTo(400);
    }

    @Test
    void sensorInativoDa409() throws Exception {
        String admin = tokenAdmin();
        SensorDeTeste s = sensor(admin, 60.0, 20.0, true);

        HttpResponse<String> inativado = enviar("PATCH", "/admin/sensores/" + s.id(), admin, "{\"status\":\"INATIVO\"}", null);
        assertThat(inativado.statusCode()).as(inativado.body()).isEqualTo(200);
        assertThat(leitura(s.chave(), s.codigo(), "30").statusCode()).isEqualTo(409);
    }

    @Test
    void gerarDeNovoTrocaAChave() throws Exception {
        String admin = tokenAdmin();
        SensorDeTeste s = sensor(admin, 60.0, 20.0, true);

        HttpResponse<String> nova = enviar("POST", "/admin/sensores/" + s.id() + "/chave", admin, null, null);
        String chaveNova = campo(nova, "\"chave\"\\s*:\\s*\"([^\"]+)\"");

        assertThat(leitura(s.chave(), s.codigo(), "30").statusCode()).isEqualTo(401);
        assertThat(leitura(chaveNova, s.codigo(), "30").statusCode()).isEqualTo(201);
    }

    @Test
    void sensorSemLeituraTemStatusEOsCamposDaLeituraNulos() throws Exception {
        SensorDeTeste s = sensor(tokenAdmin(), 60.0, 20.0, false);

        HttpResponse<String> doSensor = enviar("GET", "/previsoes/sensores/" + s.id(), null, null, null);
        assertThat(doSensor.statusCode()).as(doSensor.body()).isEqualTo(200);
        assertThat(doSensor.body()).contains("\"statusSensor\":\"ATIVO\"").contains("\"nivelAgua\":null")
                .contains("\"distanciaCm\":null").contains("\"dataLeitura\":null");
    }

    @Test
    void semLoginNaoGeraChave() throws Exception {
        SensorDeTeste s = sensor(tokenAdmin(), 60.0, 20.0, false);
        assertThat(enviar("POST", "/admin/sensores/" + s.id() + "/chave", null, null, null).statusCode()).isEqualTo(401);
    }
}
