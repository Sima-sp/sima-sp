package br.com.back_end.simasp.push.service;

import org.junit.jupiter.api.Test;

import javax.crypto.Cipher;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.SecretKeySpec;
import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import java.security.KeyPair;
import java.security.KeyPairGenerator;
import java.security.interfaces.ECPublicKey;
import java.security.spec.ECGenParameterSpec;
import java.util.Arrays;

import static org.assertj.core.api.Assertions.assertThat;

/** Cifra do Web Push conferida com o exemplo da RFC 8291 (Apêndice A) e decifrando de volta. */
class CriptografiaWebPushTest {

    // RFC 8291, Apêndice A.
    private static final String AUTH = "BTBZMqHH6r4Tts7J_aSIgg";
    private static final String SAL = "DGv6ra1nlYgDCS1FRnbzlw";
    private static final String PRIVADA_SERVIDOR = "yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw";
    private static final String PUBLICA_SERVIDOR = "BP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A8";
    private static final String PUBLICA_NAVEGADOR = "BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4";
    private static final String SEGREDO_ECDH = "kyrL1jIIOHEzg3sM2ZWRHDRB62YACZhhSlknJ672kSs";
    private static final String IKM = "S4lYMb_L0FxCeq0WhDx813KgSYqU26kOyzWUdsXYyrg";
    private static final String CEK = "oIhVW04MRdy2XN9CiKLxTg";
    private static final String NONCE = "4h_95klXJ5E_qnoN";

    private static byte[] b64(String s) {
        return Vapid.decodificar(s);
    }

    @Test
    void derivacaoBateComARfc() throws Exception {
        byte[] segredo = CriptografiaWebPush.ecdh(
                CriptografiaWebPush.chavePrivada(b64(PRIVADA_SERVIDOR)),
                CriptografiaWebPush.chavePublica(b64(PUBLICA_NAVEGADOR)));
        assertThat(segredo).isEqualTo(b64(SEGREDO_ECDH));

        CriptografiaWebPush.Chaves chaves = CriptografiaWebPush.derivar(
                segredo, b64(PUBLICA_NAVEGADOR), b64(PUBLICA_SERVIDOR), b64(AUTH), b64(SAL));
        assertThat(chaves.ikm()).isEqualTo(b64(IKM));
        assertThat(chaves.cek()).isEqualTo(b64(CEK));
        assertThat(chaves.nonce()).isEqualTo(b64(NONCE));
    }

    @Test
    void chavePublicaVaiEVolta() throws Exception {
        ECPublicKey chave = CriptografiaWebPush.chavePublica(b64(PUBLICA_SERVIDOR));
        assertThat(CriptografiaWebPush.codificar(chave)).isEqualTo(b64(PUBLICA_SERVIDOR));
    }

    @Test
    void oNavegadorConsegueDecifrar() throws Exception {
        KeyPairGenerator gerador = KeyPairGenerator.getInstance("EC");
        gerador.initialize(new ECGenParameterSpec("secp256r1"));
        KeyPair navegador = gerador.generateKeyPair();
        byte[] p256dh = CriptografiaWebPush.codificar((ECPublicKey) navegador.getPublic());
        byte[] auth = new byte[16];
        Arrays.fill(auth, (byte) 7);

        byte[] mensagem = "{\"titulo\":\"Alerta de alagamento\"}".getBytes(StandardCharsets.UTF_8);
        byte[] corpo = CriptografiaWebPush.cifrar(mensagem, p256dh, auth);

        assertThat(decifrar(corpo, navegador, p256dh, auth)).isEqualTo(mensagem);
    }

    /** O que o navegador faz (RFC 8188 + 8291), para conferir o corpo montado. */
    static byte[] decifrar(byte[] corpo, KeyPair navegador, byte[] p256dh, byte[] auth) throws Exception {
        ByteBuffer leitor = ByteBuffer.wrap(corpo);
        byte[] sal = new byte[16];
        leitor.get(sal);
        assertThat(leitor.getInt()).isEqualTo(4096);
        byte[] publicaServidor = new byte[leitor.get()];
        leitor.get(publicaServidor);
        byte[] cifrado = new byte[leitor.remaining()];
        leitor.get(cifrado);

        byte[] segredo = CriptografiaWebPush.ecdh(navegador.getPrivate(), CriptografiaWebPush.chavePublica(publicaServidor));
        CriptografiaWebPush.Chaves chaves = CriptografiaWebPush.derivar(segredo, p256dh, publicaServidor, auth, sal);

        Cipher aes = Cipher.getInstance("AES/GCM/NoPadding");
        aes.init(Cipher.DECRYPT_MODE, new SecretKeySpec(chaves.cek(), "AES"), new GCMParameterSpec(128, chaves.nonce()));
        byte[] claro = aes.doFinal(cifrado);
        assertThat(claro[claro.length - 1]).isEqualTo((byte) 0x02);
        return Arrays.copyOf(claro, claro.length - 1);
    }
}
