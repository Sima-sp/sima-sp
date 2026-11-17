package br.com.back_end.simasp.auth;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.core.env.Environment;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.util.UUID;
import java.util.concurrent.ThreadLocalRandom;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Cadastro, login, rotas protegidas e o administrador inicial, contra o backend de verdade
 * (MySQL do CI, migrações V1 a V3, segurança completa). Usa só o HttpClient do Java.
 */
@SpringBootTest(
        webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
        properties = {
                "admin.email=admin.teste@simasp.local",
                "admin.senha=senha-do-admin-123"
        })
class AutenticacaoIntegracaoTest {

    private static final Pattern TOKEN = Pattern.compile("\"token\"\\s*:\\s*\"([^\"]+)\"");

    @Autowired
    private Environment ambiente;

    private final HttpClient http = HttpClient.newHttpClient();

    private String url(String caminho) {
        return "http://localhost:" + ambiente.getProperty("local.server.port") + caminho;
    }

    private HttpResponse<String> get(String caminho, String token) throws Exception {
        HttpRequest.Builder pedido = HttpRequest.newBuilder(URI.create(url(caminho))).GET();
        if (token != null) {
            pedido.header("Authorization", "Bearer " + token);
        }
        return http.send(pedido.build(), HttpResponse.BodyHandlers.ofString());
    }

    private HttpResponse<String> post(String caminho, String json) throws Exception {
        HttpRequest pedido = HttpRequest.newBuilder(URI.create(url(caminho)))
                .header("Content-Type", "application/json")
                .POST(HttpRequest.BodyPublishers.ofString(json))
                .build();
        return http.send(pedido, HttpResponse.BodyHandlers.ofString());
    }

    private static String emailNovo() {
        return "teste-" + UUID.randomUUID() + "@simasp.local";
    }

    private static String telefoneNovo() {
        return "119" + String.format("%08d", ThreadLocalRandom.current().nextInt(100_000_000));
    }

    private HttpResponse<String> cadastrar(String email, String telefone, String senha) throws Exception {
        return post("/usuarios", """
                {"email": "%s", "telefone": "%s", "senha": "%s",
                 "latitude": -23.515200, "longitude": -46.584100, "permissaoAlerta": true}
                """.formatted(email, telefone, senha));
    }

    private HttpResponse<String> login(String email, String senha) throws Exception {
        return post("/auth/login", """
                {"email": "%s", "senha": "%s"}
                """.formatted(email, senha));
    }

    private static String token(HttpResponse<String> resposta) {
        Matcher m = TOKEN.matcher(resposta.body());
        assertThat(m.find()).as("token na resposta: %s", resposta.body()).isTrue();
        return m.group(1);
    }

    @Test
    void cadastroLoginEPerfil() throws Exception {
        String email = emailNovo();

        HttpResponse<String> cadastro = cadastrar(email, telefoneNovo(), "senha-segura-1");
        assertThat(cadastro.statusCode()).as(cadastro.body()).isEqualTo(201);
        assertThat(cadastro.body()).doesNotContain("senha");

        HttpResponse<String> entrada = login(email, "senha-segura-1");
        assertThat(entrada.statusCode()).as(entrada.body()).isEqualTo(200);
        assertThat(entrada.body()).contains("\"tipo\":\"Bearer\"");

        HttpResponse<String> perfil = get("/usuarios/me", token(entrada));
        assertThat(perfil.statusCode()).as(perfil.body()).isEqualTo(200);
        assertThat(perfil.body()).contains(email).contains("CIDADAO").contains("\"permissaoAlerta\":true");
    }

    private HttpResponse<String> enviar(String metodo, String caminho, String token, String json) throws Exception {
        HttpRequest.Builder pedido = HttpRequest.newBuilder(URI.create(url(caminho)))
                .header("Content-Type", "application/json")
                .method(metodo, HttpRequest.BodyPublishers.ofString(json));
        if (token != null) {
            pedido.header("Authorization", "Bearer " + token);
        }
        return http.send(pedido.build(), HttpResponse.BodyHandlers.ofString());
    }

    @Test
    void atualizarPerfilMudaSoOQueVeio() throws Exception {
        String email = emailNovo();
        cadastrar(email, telefoneNovo(), "senha-segura-1");
        String token = token(login(email, "senha-segura-1"));
        String telefone = telefoneNovo();

        HttpResponse<String> alterado = enviar("PATCH", "/usuarios/me", token,
                "{\"telefone\": \"" + telefone + "\", \"permissaoAlerta\": false}");
        assertThat(alterado.statusCode()).as(alterado.body()).isEqualTo(200);
        assertThat(alterado.body()).contains(telefone).contains("\"permissaoAlerta\":false").contains("-23.5152");

        HttpResponse<String> soLatitude = enviar("PATCH", "/usuarios/me", token, "{\"latitude\": -23.5}");
        assertThat(soLatitude.statusCode()).isEqualTo(400);
    }

    @Test
    void trocarSenha() throws Exception {
        String email = emailNovo();
        cadastrar(email, telefoneNovo(), "senha-segura-1");
        String token = token(login(email, "senha-segura-1"));

        HttpResponse<String> trocada = enviar("PUT", "/usuarios/me/senha", token,
                "{\"senhaAtual\": \"senha-segura-1\", \"novaSenha\": \"senha-nova-22\", \"confirmacaoNovaSenha\": \"senha-nova-22\"}");
        assertThat(trocada.statusCode()).as(trocada.body()).isEqualTo(204);
        assertThat(login(email, "senha-segura-1").statusCode()).isEqualTo(401);
        assertThat(login(email, "senha-nova-22").statusCode()).isEqualTo(200);
    }

    @Test
    void adminDesativaContaEElaNaoEntraMais() throws Exception {
        String email = emailNovo();
        cadastrar(email, telefoneNovo(), "senha-segura-1");
        String admin = token(login("admin.teste@simasp.local", "senha-do-admin-123"));

        HttpResponse<String> desativada = enviar("PATCH", "/admin/usuarios/" + email, admin, "{\"ativo\": false}");
        assertThat(desativada.statusCode()).as(desativada.body()).isEqualTo(200);
        assertThat(login(email, "senha-segura-1").statusCode()).isEqualTo(401);
    }

    @Test
    void swaggerAbreSemLoginEListaAsRotas() throws Exception {
        HttpResponse<String> api = get("/v3/api-docs", null);
        assertThat(api.statusCode()).as(api.body()).isEqualTo(200);
        assertThat(api.body()).contains("/leituras").contains("/admin/sensores/{id}").contains("bearer");
        assertThat(get("/swagger-ui/index.html", null).statusCode()).isEqualTo(200);
    }

    @Test
    void emailRepetidoNaoCadastra() throws Exception {
        String email = emailNovo();
        assertThat(cadastrar(email, telefoneNovo(), "senha-segura-1").statusCode()).isEqualTo(201);
        assertThat(cadastrar(email, telefoneNovo(), "senha-segura-1").statusCode()).isEqualTo(409);
    }

    @Test
    void cadastroInvalidoDa400ENao500() throws Exception {
        HttpResponse<String> resposta = post("/usuarios", """
                {"email": "nao-e-email", "telefone": "12", "senha": "curta",
                 "latitude": -23.5, "longitude": -46.6, "permissaoAlerta": false}
                """);
        assertThat(resposta.statusCode()).as(resposta.body()).isEqualTo(400);
    }

    @Test
    void senhaErradaDa401() throws Exception {
        String email = emailNovo();
        cadastrar(email, telefoneNovo(), "senha-segura-1");
        assertThat(login(email, "outra-senha-9").statusCode()).isEqualTo(401);
        assertThat(login(emailNovo(), "outra-senha-9").statusCode()).isEqualTo(401);
    }

    @Test
    void perfilSemTokenDa401() throws Exception {
        assertThat(get("/usuarios/me", null).statusCode()).isEqualTo(401);
        assertThat(get("/usuarios/me", "token-falso").statusCode()).isEqualTo(401);
    }

    @Test
    void mapaContinuaPublico() throws Exception {
        int status = get("/previsoes", null).statusCode();
        assertThat(status).isNotIn(401, 403);
        HttpResponse<String> sensores = get("/sensores?status=ATIVO&size=5", null);
        assertThat(sensores.statusCode()).as(sensores.body()).isEqualTo(200);
        assertThat(sensores.body()).contains("\"content\"").contains("\"page\"");
        assertThat(get("/sensores?latitude=-23.5", null).statusCode()).isEqualTo(400);
    }

    @Test
    void rotasDeSensorNaoSaoAmbiguas() throws Exception {
        assertThat(get("/sensores/999999999", null).statusCode()).isEqualTo(404);
        assertThat(get("/sensores/vizinhanca/Bairro Que Nao Existe".replace(" ", "%20"), null).statusCode()).isEqualTo(404);
    }

    @Test
    void administradorInicialEntraNoAdminECidadaoNao() throws Exception {
        String caminho = "/admin/usuarios?longitude=-46.633308&latitude=-23.550520&raio=50000";

        HttpResponse<String> admin = login("admin.teste@simasp.local", "senha-do-admin-123");
        assertThat(admin.statusCode()).as(admin.body()).isEqualTo(200);
        HttpResponse<String> comoAdmin = get(caminho, token(admin));
        assertThat(comoAdmin.statusCode()).as(comoAdmin.body()).isEqualTo(200);

        String email = emailNovo();
        cadastrar(email, telefoneNovo(), "senha-segura-1");
        HttpResponse<String> comoCidadao = get(caminho, token(login(email, "senha-segura-1")));
        assertThat(comoCidadao.statusCode()).isEqualTo(403);

        assertThat(get(caminho, null).statusCode()).isEqualTo(401);
    }
}
