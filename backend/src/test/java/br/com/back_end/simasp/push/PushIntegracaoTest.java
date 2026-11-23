package br.com.back_end.simasp.push;

import br.com.back_end.simasp.push.repository.InscricaoPushRepository;
import br.com.back_end.simasp.push.service.CriptografiaWebPush;
import br.com.back_end.simasp.push.service.EntregadorPush;
import br.com.back_end.simasp.push.service.PushService;
import br.com.back_end.simasp.push.service.Vapid;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Primary;
import org.springframework.core.env.Environment;

import javax.crypto.Cipher;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.SecretKeySpec;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import java.security.KeyPair;
import java.security.KeyPairGenerator;
import java.security.interfaces.ECPublicKey;
import java.security.spec.ECGenParameterSpec;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.ThreadLocalRandom;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Push a partir de um alerta (#14), com o backend de verdade e um serviço de push falso
 * (nada sai para a internet). As chaves VAPID abaixo são só deste teste.
 */
@SpringBootTest(
        webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
        properties = {
                "admin.email=admin.push@simasp.local",
                "admin.senha=senha-do-admin-123",
                "push.chave-publica=" + PushIntegracaoTest.VAPID_PUBLICA,
                "push.chave-privada=WLmNKpFk9jjNFH2PDQOweGNfbqMc4hkn-7MUFZwpvj4",
                "push.raio-metros=1000"
        })
class PushIntegracaoTest {

    static final String VAPID_PUBLICA =
            "BMXWIMYyYgaHilYkF_KK3QsThKafVKmjLyCRyn50o3bGa0vN5XAR0OdlPg_d7EWxXQLxWw1h86WzjstcS5Gt9Ag";

    /** Serviço de push falso: guarda o que recebeu; endereço com "morta" responde 410. */
    record Entrega(String endpoint, Map<String, String> cabecalhos, byte[] corpo) {
    }

    static final List<Entrega> ENTREGAS = new CopyOnWriteArrayList<>();

    @TestConfiguration
    static class ServicoFalso {
        @Bean
        @Primary
        EntregadorPush entregadorFalso() {
            return (endpoint, cabecalhos, corpo) -> {
                ENTREGAS.add(new Entrega(endpoint, cabecalhos, corpo));
                return endpoint.contains("morta") ? 410 : 201;
            };
        }
    }

    @Autowired
    private Environment ambiente;

    @Autowired
    private InscricaoPushRepository inscricoes;

    @Autowired
    private PushService push;

    private final HttpClient http = HttpClient.newHttpClient();

    // ---------- ajudantes ----------

    private HttpResponse<String> enviar(String metodo, String caminho, String token, String json, String chave) throws Exception {
        HttpRequest.Builder pedido = HttpRequest.newBuilder(
                URI.create("http://localhost:" + ambiente.getProperty("local.server.port") + caminho));
        if (token != null) {
            pedido.header("Authorization", "Bearer " + token);
        }
        if (chave != null) {
            pedido.header("X-Sensor-Chave", chave);
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

    private String token(String email, String senha) throws Exception {
        return campo(enviar("POST", "/auth/login", null,
                "{\"email\":\"" + email + "\",\"senha\":\"" + senha + "\"}", null), "\"token\"\\s*:\\s*\"([^\"]+)\"");
    }

    private String admin() throws Exception {
        return token("admin.push@simasp.local", "senha-do-admin-123");
    }

    private record Pessoa(String email, String token) {
    }

    private Pessoa pessoa(double latitude, double longitude, boolean permissao) throws Exception {
        String email = "push-" + UUID.randomUUID() + "@simasp.local";
        String telefone = "119" + String.format("%08d", ThreadLocalRandom.current().nextInt(100_000_000));
        HttpResponse<String> cadastro = enviar("POST", "/usuarios", null, String.format(Locale.ROOT, """
                {"email": "%s", "telefone": "%s", "senha": "senha-segura-1", "latitude": %.6f, "longitude": %.6f,
                 "permissaoAlerta": %s, "aceiteTermos": true}
                """, email, telefone, latitude, longitude, permissao), null);
        assertThat(cadastro.statusCode()).as(cadastro.body()).isEqualTo(201);
        return new Pessoa(email, token(email, "senha-segura-1"));
    }

    private record Aparelho(String endpoint, KeyPair chaves, byte[] p256dh, byte[] auth) {
    }

    private Aparelho aparelho(String marca) throws Exception {
        KeyPairGenerator gerador = KeyPairGenerator.getInstance("EC");
        gerador.initialize(new ECGenParameterSpec("secp256r1"));
        KeyPair chaves = gerador.generateKeyPair();
        byte[] auth = new byte[16];
        ThreadLocalRandom.current().nextBytes(auth);
        return new Aparelho("https://fcm.googleapis.com/fcm/send/" + marca + "-" + UUID.randomUUID(),
                chaves, CriptografiaWebPush.codificar((ECPublicKey) chaves.getPublic()), auth);
    }

    private HttpResponse<String> inscrever(Pessoa p, Aparelho a) throws Exception {
        return enviar("POST", "/usuarios/me/push", p.token(), """
                {"endpoint": "%s", "expirationTime": null, "keys": {"p256dh": "%s", "auth": "%s"}}
                """.formatted(a.endpoint(), Vapid.codificar(a.p256dh()), Vapid.codificar(a.auth())), null);
    }

    private static List<Entrega> para(Aparelho a) {
        return ENTREGAS.stream().filter(e -> e.endpoint().equals(a.endpoint())).toList();
    }

    private static void esperar(java.util.function.BooleanSupplier condicao) throws InterruptedException {
        for (int i = 0; i < 100 && !condicao.getAsBoolean(); i++) {
            Thread.sleep(100);
        }
    }

    private static byte[] decifrar(byte[] corpo, Aparelho a) throws Exception {
        ByteBuffer leitor = ByteBuffer.wrap(corpo);
        byte[] sal = new byte[16];
        leitor.get(sal);
        leitor.getInt();
        byte[] publicaServidor = new byte[leitor.get()];
        leitor.get(publicaServidor);
        byte[] cifrado = new byte[leitor.remaining()];
        leitor.get(cifrado);

        javax.crypto.KeyAgreement acordo = javax.crypto.KeyAgreement.getInstance("ECDH");
        acordo.init(a.chaves().getPrivate());
        acordo.doPhase(CriptografiaWebPush.chavePublica(publicaServidor), true);
        byte[] segredo = acordo.generateSecret();

        javax.crypto.Mac mac = javax.crypto.Mac.getInstance("HmacSHA256");
        mac.init(new SecretKeySpec(a.auth(), "HmacSHA256"));
        byte[] prkChave = mac.doFinal(segredo);
        mac.init(new SecretKeySpec(prkChave, "HmacSHA256"));
        mac.update("WebPush: info\0".getBytes(StandardCharsets.US_ASCII));
        mac.update(a.p256dh());
        mac.update(publicaServidor);
        mac.update((byte) 1);
        byte[] ikm = mac.doFinal();
        mac.init(new SecretKeySpec(sal, "HmacSHA256"));
        byte[] prk = mac.doFinal(ikm);
        mac.init(new SecretKeySpec(prk, "HmacSHA256"));
        mac.update("Content-Encoding: aes128gcm\0".getBytes(StandardCharsets.US_ASCII));
        mac.update((byte) 1);
        byte[] cek = java.util.Arrays.copyOf(mac.doFinal(), 16);
        mac.init(new SecretKeySpec(prk, "HmacSHA256"));
        mac.update("Content-Encoding: nonce\0".getBytes(StandardCharsets.US_ASCII));
        mac.update((byte) 1);
        byte[] nonce = java.util.Arrays.copyOf(mac.doFinal(), 12);

        Cipher aes = Cipher.getInstance("AES/GCM/NoPadding");
        aes.init(Cipher.DECRYPT_MODE, new SecretKeySpec(cek, "AES"), new GCMParameterSpec(128, nonce));
        byte[] claro = aes.doFinal(cifrado);
        return java.util.Arrays.copyOf(claro, claro.length - 1);
    }

    // ---------- testes ----------

    @Test
    void chavePublicaEPublica() throws Exception {
        HttpResponse<String> r = enviar("GET", "/push/chave-publica", null, null, null);
        assertThat(r.statusCode()).isEqualTo(200);
        assertThat(r.body()).contains(VAPID_PUBLICA);
    }

    @Test
    void inscricaoSoDeServicoDePushConhecido() throws Exception {
        Pessoa p = pessoa(-23.5, -46.6, true);
        Aparelho a = aparelho("ok");

        assertThat(enviar("POST", "/usuarios/me/push", p.token(), """
                {"endpoint": "http://localhost:8080/roubar", "keys": {"p256dh": "%s", "auth": "%s"}}
                """.formatted(Vapid.codificar(a.p256dh()), Vapid.codificar(a.auth())), null).statusCode()).isEqualTo(400);
        assertThat(enviar("POST", "/usuarios/me/push", p.token(), """
                {"endpoint": "%s", "keys": {"p256dh": "AAAA", "auth": "%s"}}
                """.formatted(a.endpoint(), Vapid.codificar(a.auth())), null).statusCode()).isEqualTo(400);
        assertThat(enviar("POST", "/usuarios/me/push", null, "{}", null).statusCode()).isEqualTo(401);
    }

    @Test
    void removerSoAPropria() throws Exception {
        Pessoa dona = pessoa(-23.5, -46.6, true);
        Pessoa outra = pessoa(-23.5, -46.6, true);
        HttpResponse<String> inscrita = inscrever(dona, aparelho("remover"));
        assertThat(inscrita.statusCode()).as(inscrita.body()).isEqualTo(201);
        String id = campo(inscrita, "\"id\"\\s*:\\s*(\\d+)");

        assertThat(enviar("DELETE", "/usuarios/me/push/" + id, outra.token(), null, null).statusCode()).isEqualTo(404);
        assertThat(enviar("DELETE", "/usuarios/me/push/" + id, dona.token(), null, null).statusCode()).isEqualTo(204);
    }

    @Test
    void alertaAvisaSoQuemDeve() throws Exception {
        String admin = admin();
        double lat = -23.4 - ThreadLocalRandom.current().nextDouble(0.4);
        double lon = -46.4 - ThreadLocalRandom.current().nextDouble(0.4);

        // Sensor de bancada.
        String codigo = "push_" + UUID.randomUUID().toString().substring(0, 8);
        HttpResponse<String> sensor = enviar("POST", "/admin/sensores", admin, String.format(Locale.ROOT, """
                {"latitude": %.6f, "longitude": %.6f, "vizinhanca": "Bancada", "dataInstalacao": "2026-11-01T10:00:00",
                 "codigo": "%s", "profundidadeCm": 60.0, "distanciaCheioCm": 20.0}
                """, lat, lon, codigo), null);
        assertThat(sensor.statusCode()).as(sensor.body()).isEqualTo(201);
        String sensorId = campo(sensor, "\"id\"\\s*:\\s*(\\d+)");
        String chave = campo(enviar("POST", "/admin/sensores/" + sensorId + "/chave", admin, null, null),
                "\"chave\"\\s*:\\s*\"([^\"]+)\"");

        Pessoa perto = pessoa(lat, lon, true);
        Pessoa longe = pessoa(lat + 0.05, lon, true);          // uns 5,5 km
        Pessoa semPermissao = pessoa(lat, lon, false);
        Pessoa desativada = pessoa(lat, lon, true);
        Pessoa aparelhoMorto = pessoa(lat, lon, true);

        Aparelho aPerto = aparelho("perto");
        Aparelho aLonge = aparelho("longe");
        Aparelho aSem = aparelho("sem");
        Aparelho aDesativada = aparelho("desativada");
        Aparelho aMorto = aparelho("morta");
        assertThat(inscrever(perto, aPerto).statusCode()).isEqualTo(201);
        assertThat(inscrever(longe, aLonge).statusCode()).isEqualTo(201);
        assertThat(inscrever(semPermissao, aSem).statusCode()).isEqualTo(201);
        assertThat(inscrever(desativada, aDesativada).statusCode()).isEqualTo(201);
        assertThat(inscrever(aparelhoMorto, aMorto).statusCode()).isEqualTo(201);
        enviar("PATCH", "/admin/usuarios/" + desativada.email(), admin, "{\"ativo\": false}", null);

        // Água no crítico → alerta → push.
        HttpResponse<String> leitura = enviar("POST", "/leituras", null,
                "{\"codigo\":\"" + codigo + "\",\"distanciaCm\":15}", chave);
        assertThat(leitura.statusCode()).as(leitura.body()).isEqualTo(201);

        esperar(() -> !para(aPerto).isEmpty() && !para(aMorto).isEmpty());
        assertThat(para(aPerto)).hasSize(1);
        Thread.sleep(300);
        assertThat(para(aLonge)).isEmpty();
        assertThat(para(aSem)).isEmpty();
        assertThat(para(aDesativada)).isEmpty();

        // O que chegou: VAPID, aes128gcm e a mensagem decifrável pelo aparelho.
        Entrega entrega = para(aPerto).getFirst();
        assertThat(entrega.cabecalhos().get("Authorization")).startsWith("vapid t=").endsWith("k=" + VAPID_PUBLICA);
        assertThat(entrega.cabecalhos().get("Content-Encoding")).isEqualTo("aes128gcm");
        String mensagem = new String(decifrar(entrega.corpo(), aPerto), StandardCharsets.UTF_8);
        assertThat(mensagem).contains("\"codigo\":\"" + codigo + "\"").contains("Alerta de alagamento");

        // 410: a inscrição fica inativa.
        esperar(() -> !inscricoes.findByEndpoint(aMorto.endpoint()).orElseThrow().getAtiva());
        assertThat(inscricoes.findByEndpoint(aMorto.endpoint()).orElseThrow().getAtiva()).isFalse();

        // O mesmo alerta não avisa a mesma pessoa duas vezes.
        HttpResponse<String> alertas = enviar("GET", "/admin/alertas?sensorId=" + sensorId, admin, null, null);
        long alertaId = Long.parseLong(campo(alertas, "\"id\"\\s*:\\s*(\\d+)"));
        push.avisar(alertaId);
        assertThat(para(aPerto)).hasSize(1);
    }
}
