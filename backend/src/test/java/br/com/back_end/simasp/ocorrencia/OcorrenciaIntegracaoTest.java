package br.com.back_end.simasp.ocorrencia;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.core.env.Environment;

import javax.imageio.ImageIO;
import java.awt.image.BufferedImage;
import java.io.ByteArrayOutputStream;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.util.Arrays;
import java.util.UUID;
import java.util.concurrent.ThreadLocalRandom;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import static org.assertj.core.api.Assertions.assertThat;

/** Relatos do cidadão (#15) contra o backend de verdade (MySQL do CI, segurança completa). */
@SpringBootTest(
        webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
        properties = {
                "admin.email=admin.ocorrencia@simasp.local",
                "admin.senha=senha-do-admin-123",
                "ocorrencia.pasta-fotos=${java.io.tmpdir}/sima-fotos-teste",
                "ocorrencia.limite-por-hora=3"
        })
class OcorrenciaIntegracaoTest {

    private static final Pattern TOKEN = Pattern.compile("\"token\"\\s*:\\s*\"([^\"]+)\"");
    private static final Pattern ID = Pattern.compile("\"id\"\\s*:\\s*(\\d+)");
    private static final String FRONTEIRA = "----sima" + UUID.randomUUID();

    @Autowired
    private Environment ambiente;

    private final HttpClient http = HttpClient.newHttpClient();

    // ---------- ajudantes ----------

    private String url(String caminho) {
        return "http://localhost:" + ambiente.getProperty("local.server.port") + caminho;
    }

    private HttpResponse<String> json(String metodo, String caminho, String token, String corpo) throws Exception {
        HttpRequest.Builder pedido = HttpRequest.newBuilder(URI.create(url(caminho)))
                .header("Content-Type", "application/json")
                .method(metodo, corpo == null ? HttpRequest.BodyPublishers.noBody() : HttpRequest.BodyPublishers.ofString(corpo));
        if (token != null) {
            pedido.header("Authorization", "Bearer " + token);
        }
        return http.send(pedido.build(), HttpResponse.BodyHandlers.ofString());
    }

    private HttpResponse<byte[]> baixar(String caminho, String token) throws Exception {
        HttpRequest.Builder pedido = HttpRequest.newBuilder(URI.create(url(caminho))).GET();
        if (token != null) {
            pedido.header("Authorization", "Bearer " + token);
        }
        return http.send(pedido.build(), HttpResponse.BodyHandlers.ofByteArray());
    }

    private static String token(HttpResponse<String> resposta) {
        Matcher m = TOKEN.matcher(resposta.body());
        assertThat(m.find()).as("token na resposta: %s", resposta.body()).isTrue();
        return m.group(1);
    }

    private static long id(HttpResponse<String> resposta) {
        Matcher m = ID.matcher(resposta.body());
        assertThat(m.find()).as("id na resposta: %s", resposta.body()).isTrue();
        return Long.parseLong(m.group(1));
    }

    private String cidadao() throws Exception {
        String email = "relato-" + UUID.randomUUID() + "@simasp.local";
        String telefone = "119" + String.format("%08d", ThreadLocalRandom.current().nextInt(100_000_000));
        HttpResponse<String> cadastro = json("POST", "/usuarios", null, """
                {"email": "%s", "telefone": "%s", "senha": "senha-segura-1",
                 "latitude": -23.5, "longitude": -46.6, "permissaoAlerta": true, "aceiteTermos": true}
                """.formatted(email, telefone));
        assertThat(cadastro.statusCode()).as(cadastro.body()).isEqualTo(201);
        return token(json("POST", "/auth/login", null,
                "{\"email\": \"" + email + "\", \"senha\": \"senha-segura-1\"}"));
    }

    private String admin() throws Exception {
        return token(json("POST", "/auth/login", null,
                "{\"email\": \"admin.ocorrencia@simasp.local\", \"senha\": \"senha-do-admin-123\"}"));
    }

    /** Monta o multipart na mão; foto pode ser nula. */
    private HttpResponse<String> relatar(String token, String descricao, byte[] foto, String tipoDaFoto) throws Exception {
        ByteArrayOutputStream corpo = new ByteArrayOutputStream();
        campo(corpo, "tipo", "BUEIRO_ENTUPIDO");
        campo(corpo, "descricao", descricao);
        campo(corpo, "latitude", "-23.527245");
        campo(corpo, "longitude", "-46.596878");
        if (foto != null) {
            corpo.write(("--" + FRONTEIRA + "\r\nContent-Disposition: form-data; name=\"foto\"; filename=\"foto.jpg\"\r\n"
                    + "Content-Type: " + tipoDaFoto + "\r\n\r\n").getBytes(StandardCharsets.UTF_8));
            corpo.write(foto);
            corpo.write("\r\n".getBytes(StandardCharsets.UTF_8));
        }
        corpo.write(("--" + FRONTEIRA + "--\r\n").getBytes(StandardCharsets.UTF_8));

        HttpRequest.Builder pedido = HttpRequest.newBuilder(URI.create(url("/ocorrencias")))
                .header("Content-Type", "multipart/form-data; boundary=" + FRONTEIRA)
                .POST(HttpRequest.BodyPublishers.ofByteArray(corpo.toByteArray()));
        if (token != null) {
            pedido.header("Authorization", "Bearer " + token);
        }
        return http.send(pedido.build(), HttpResponse.BodyHandlers.ofString());
    }

    private static void campo(ByteArrayOutputStream corpo, String nome, String valor) throws Exception {
        corpo.write(("--" + FRONTEIRA + "\r\nContent-Disposition: form-data; name=\"" + nome + "\"\r\n\r\n"
                + valor + "\r\n").getBytes(StandardCharsets.UTF_8));
    }

    /** Um JPEG pequeno com um bloco EXIF (APP1) logo depois do início, como o de uma câmera. */
    private static byte[] jpegComExif() throws Exception {
        BufferedImage imagem = new BufferedImage(40, 30, BufferedImage.TYPE_INT_RGB);
        ByteArrayOutputStream saida = new ByteArrayOutputStream();
        ImageIO.write(imagem, "jpg", saida);
        byte[] jpeg = saida.toByteArray();

        byte[] conteudo = "Exif\0\0GPS-23.527245-46.596878".getBytes(StandardCharsets.ISO_8859_1);
        int tamanho = conteudo.length + 2;
        ByteArrayOutputStream comExif = new ByteArrayOutputStream();
        comExif.write(jpeg, 0, 2); // FF D8
        comExif.write(new byte[]{(byte) 0xFF, (byte) 0xE1, (byte) (tamanho >> 8), (byte) tamanho});
        comExif.write(conteudo);
        comExif.write(jpeg, 2, jpeg.length - 2);
        return comExif.toByteArray();
    }

    private static boolean contem(byte[] dados, String texto) {
        byte[] alvo = texto.getBytes(StandardCharsets.ISO_8859_1);
        for (int i = 0; i + alvo.length <= dados.length; i++) {
            if (Arrays.equals(dados, i, i + alvo.length, alvo, 0, alvo.length)) {
                return true;
            }
        }
        return false;
    }

    // ---------- testes ----------

    @Test
    void enviarSemLoginDa401() throws Exception {
        assertThat(relatar(null, "bueiro cheio", null, null).statusCode()).isEqualTo(401);
    }

    @Test
    void novoNasceePendenteESoApareceDepoisDeAprovado() throws Exception {
        String cidadao = cidadao();
        String descricao = "Bueiro entupido " + UUID.randomUUID();

        HttpResponse<String> enviado = relatar(cidadao, descricao, jpegComExif(), "image/jpeg");
        assertThat(enviado.statusCode()).as(enviado.body()).isEqualTo(201);
        assertThat(enviado.body()).contains("\"situacao\":\"PENDENTE\"").contains("\"temFoto\":true");
        long id = id(enviado);

        assertThat(json("GET", "/ocorrencias", null, null).body()).doesNotContain(descricao);
        assertThat(baixar("/ocorrencias/" + id + "/foto", null).statusCode()).isEqualTo(404);

        String admin = admin();
        HttpResponse<String> fila = json("GET", "/admin/ocorrencias?situacao=PENDENTE", admin, null);
        assertThat(fila.statusCode()).isEqualTo(200);
        assertThat(fila.body()).contains(descricao);

        HttpResponse<String> aprovada = json("PATCH", "/admin/ocorrencias/" + id, admin, "{\"situacao\": \"APROVADA\"}");
        assertThat(aprovada.statusCode()).as(aprovada.body()).isEqualTo(200);

        HttpResponse<String> mapa = json("GET", "/ocorrencias", null, null);
        assertThat(mapa.statusCode()).isEqualTo(200);
        assertThat(mapa.body()).contains(descricao).contains("/ocorrencias/" + id + "/foto");
        // Nada sobre quem relatou.
        assertThat(mapa.body()).doesNotContain("relato-").doesNotContain("email").doesNotContain("telefone")
                .doesNotContain("autor");

        HttpResponse<byte[]> foto = baixar("/ocorrencias/" + id + "/foto", null);
        assertThat(foto.statusCode()).isEqualTo(200);
        assertThat(foto.headers().firstValue("Content-Type")).hasValue("image/jpeg");

        HttpResponse<String> minhas = json("GET", "/usuarios/me/ocorrencias", cidadao, null);
        assertThat(minhas.body()).contains(descricao).contains("\"situacao\":\"APROVADA\"");
    }

    @Test
    void fotoGuardadaSemExif() throws Exception {
        HttpResponse<String> enviado = relatar(cidadao(), "Com EXIF", jpegComExif(), "image/jpeg");
        assertThat(enviado.statusCode()).as(enviado.body()).isEqualTo(201);

        HttpResponse<byte[]> foto = baixar("/admin/ocorrencias/" + id(enviado) + "/foto", admin());
        assertThat(foto.statusCode()).isEqualTo(200);
        assertThat(foto.body()[0]).isEqualTo((byte) 0xFF);
        assertThat(contem(foto.body(), "Exif")).isFalse();
        assertThat(contem(foto.body(), "GPS")).isFalse();
    }

    @Test
    void recusadoNaoApareceERecusarExigeMotivo() throws Exception {
        String descricao = "Recusar " + UUID.randomUUID();
        long id = id(relatar(cidadao(), descricao, null, null));
        String admin = admin();

        assertThat(json("PATCH", "/admin/ocorrencias/" + id, admin, "{\"situacao\": \"RECUSADA\"}").statusCode())
                .isEqualTo(400);

        HttpResponse<String> recusada = json("PATCH", "/admin/ocorrencias/" + id, admin,
                "{\"situacao\": \"RECUSADA\", \"motivo\": \"Foto não mostra o bueiro\"}");
        assertThat(recusada.statusCode()).as(recusada.body()).isEqualTo(200);
        assertThat(json("GET", "/ocorrencias", null, null).body()).doesNotContain(descricao);
    }

    @Test
    void arquivoQueNaoEImagemDa400() throws Exception {
        byte[] texto = "isto não é uma foto".getBytes(StandardCharsets.UTF_8);
        HttpResponse<String> resposta = relatar(cidadao(), "Arquivo errado", texto, "image/jpeg");
        assertThat(resposta.statusCode()).as(resposta.body()).isEqualTo(400);

        // Começa como JPEG mas não é uma imagem.
        byte[] falso = new byte[2048];
        falso[0] = (byte) 0xFF; falso[1] = (byte) 0xD8; falso[2] = (byte) 0xFF;
        assertThat(relatar(cidadao(), "Falso JPEG", falso, "image/jpeg").statusCode()).isEqualTo(400);
    }

    @Test
    void arquivoAcimaDoLimiteDa413() throws Exception {
        byte[] grande = new byte[5 * 1024 * 1024 + 100_000];
        grande[0] = (byte) 0xFF; grande[1] = (byte) 0xD8; grande[2] = (byte) 0xFF;
        HttpResponse<String> resposta = relatar(cidadao(), "Grande", grande, "image/jpeg");
        assertThat(resposta.statusCode()).as(resposta.body()).isEqualTo(413);
    }

    @Test
    void camposFaltandoDao400() throws Exception {
        ByteArrayOutputStream corpo = new ByteArrayOutputStream();
        campo(corpo, "tipo", "NAO_EXISTE");
        corpo.write(("--" + FRONTEIRA + "--\r\n").getBytes(StandardCharsets.UTF_8));
        HttpRequest pedido = HttpRequest.newBuilder(URI.create(url("/ocorrencias")))
                .header("Content-Type", "multipart/form-data; boundary=" + FRONTEIRA)
                .header("Authorization", "Bearer " + cidadao())
                .POST(HttpRequest.BodyPublishers.ofByteArray(corpo.toByteArray()))
                .build();
        HttpResponse<String> resposta = http.send(pedido, HttpResponse.BodyHandlers.ofString());
        assertThat(resposta.statusCode()).as(resposta.body()).isEqualTo(400);
    }

    @Test
    void limitePorHoraDa429() throws Exception {
        String cidadao = cidadao();
        for (int i = 0; i < 3; i++) {
            assertThat(relatar(cidadao, "Relato " + i, null, null).statusCode()).isEqualTo(201);
        }
        HttpResponse<String> quarto = relatar(cidadao, "Relato 4", null, null);
        assertThat(quarto.statusCode()).as(quarto.body()).isEqualTo(429);
    }

    @Test
    void cidadaoNaoAcessaAFilaDoAdmin() throws Exception {
        assertThat(json("GET", "/admin/ocorrencias", cidadao(), null).statusCode()).isEqualTo(403);
    }
}
