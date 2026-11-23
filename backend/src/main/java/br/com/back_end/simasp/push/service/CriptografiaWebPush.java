package br.com.back_end.simasp.push.service;

import javax.crypto.Cipher;
import javax.crypto.KeyAgreement;
import javax.crypto.Mac;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.SecretKeySpec;
import java.math.BigInteger;
import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import java.security.*;
import java.security.interfaces.ECPublicKey;
import java.security.spec.*;
import java.util.Arrays;

/**
 * Cifra a mensagem do Web Push (RFC 8291, {@code Content-Encoding: aes128gcm}) e monta as chaves
 * P-256 a partir do formato que o navegador e o VAPID usam (base64url sem padding).
 *
 * <p>Só JDK, sem biblioteca: ECDH, HKDF (HMAC-SHA256) e AES-128-GCM. O teste confere a derivação
 * com os valores do exemplo do Apêndice A da RFC 8291.
 */
public final class CriptografiaWebPush {

    private static final int TAMANHO_REGISTRO = 4096;
    private static final ECParameterSpec P256 = parametrosP256();
    private static final SecureRandom ALEATORIO = new SecureRandom();

    private CriptografiaWebPush() {
    }

    /** Valores derivados de um envio (expostos para o teste). */
    record Chaves(byte[] ikm, byte[] cek, byte[] nonce) {
    }

    /**
     * Cifra {@code mensagem} para a inscrição (chave {@code p256dh} e segredo {@code auth} do
     * navegador). Cada envio usa um par de chaves e um sal novos.
     */
    public static byte[] cifrar(byte[] mensagem, byte[] p256dh, byte[] auth)
    {
        try
        {
            KeyPairGenerator gerador = KeyPairGenerator.getInstance("EC");
            gerador.initialize(new ECGenParameterSpec("secp256r1"), ALEATORIO);
            KeyPair remetente = gerador.generateKeyPair();

            byte[] sal = new byte[16];
            ALEATORIO.nextBytes(sal);

            return cifrar(mensagem, p256dh, auth, remetente, sal);
        }
        catch(GeneralSecurityException e)
        {
            throw new IllegalStateException("Falha ao cifrar a notificação", e);
        }
    }

    static byte[] cifrar(byte[] mensagem, byte[] p256dh, byte[] auth, KeyPair remetente, byte[] sal) throws GeneralSecurityException
    {
        byte[] publicaRemetente = codificar((ECPublicKey) remetente.getPublic());
        byte[] segredo = ecdh(remetente.getPrivate(), chavePublica(p256dh));
        Chaves chaves = derivar(segredo, p256dh, publicaRemetente, auth, sal);

        // Um registro só: mensagem || 0x02 (último registro, sem preenchimento).
        byte[] claro = Arrays.copyOf(mensagem, mensagem.length + 1);
        claro[mensagem.length] = 0x02;

        Cipher aes = Cipher.getInstance("AES/GCM/NoPadding");
        aes.init(Cipher.ENCRYPT_MODE, new SecretKeySpec(chaves.cek(), "AES"), new GCMParameterSpec(128, chaves.nonce()));
        byte[] cifrado = aes.doFinal(claro);

        return ByteBuffer.allocate(16 + 4 + 1 + publicaRemetente.length + cifrado.length)
                .put(sal)
                .putInt(TAMANHO_REGISTRO)
                .put((byte) publicaRemetente.length)
                .put(publicaRemetente)
                .put(cifrado)
                .array();
    }

    /** RFC 8291, seção 3.4 (IKM) e RFC 8188 (CEK e nonce). */
    static Chaves derivar(byte[] segredoEcdh, byte[] publicaNavegador, byte[] publicaRemetente, byte[] auth, byte[] sal) throws GeneralSecurityException
    {
        byte[] infoChave = concatenar("WebPush: info\0".getBytes(StandardCharsets.US_ASCII), publicaNavegador, publicaRemetente);
        byte[] ikm = hkdf(auth, segredoEcdh, infoChave, 32);

        byte[] cek = hkdf(sal, ikm, "Content-Encoding: aes128gcm\0".getBytes(StandardCharsets.US_ASCII), 16);
        byte[] nonce = hkdf(sal, ikm, "Content-Encoding: nonce\0".getBytes(StandardCharsets.US_ASCII), 12);
        return new Chaves(ikm, cek, nonce);
    }

    static byte[] ecdh(PrivateKey privada, PublicKey publica) throws GeneralSecurityException
    {
        KeyAgreement acordo = KeyAgreement.getInstance("ECDH");
        acordo.init(privada);
        acordo.doPhase(publica, true);
        return acordo.generateSecret();
    }

    /** HKDF com saída de até 32 bytes (um bloco do HMAC-SHA256). */
    private static byte[] hkdf(byte[] sal, byte[] ikm, byte[] info, int tamanho) throws GeneralSecurityException
    {
        Mac mac = Mac.getInstance("HmacSHA256");
        mac.init(new SecretKeySpec(sal, "HmacSHA256"));
        byte[] prk = mac.doFinal(ikm);

        mac.init(new SecretKeySpec(prk, "HmacSHA256"));
        mac.update(info);
        mac.update((byte) 0x01);
        return Arrays.copyOf(mac.doFinal(), tamanho);
    }

    /** Ponto não comprimido (65 bytes, começa com 0x04) → chave pública P-256. */
    public static ECPublicKey chavePublica(byte[] ponto) throws GeneralSecurityException
    {
        if(ponto.length != 65 || ponto[0] != 0x04)
        {
            throw new InvalidKeyException("Chave pública P-256 inválida");
        }
        ECPoint w = new ECPoint(new BigInteger(1, Arrays.copyOfRange(ponto, 1, 33)), new BigInteger(1, Arrays.copyOfRange(ponto, 33, 65)));
        return (ECPublicKey) KeyFactory.getInstance("EC").generatePublic(new ECPublicKeySpec(w, P256));
    }

    /** 32 bytes (o número d) → chave privada P-256. */
    public static PrivateKey chavePrivada(byte[] d) throws GeneralSecurityException
    {
        if(d.length != 32)
        {
            throw new InvalidKeyException("Chave privada P-256 inválida");
        }
        return KeyFactory.getInstance("EC").generatePrivate(new ECPrivateKeySpec(new BigInteger(1, d), P256));
    }

    /** Chave pública P-256 → ponto não comprimido (65 bytes). */
    public static byte[] codificar(ECPublicKey chave)
    {
        byte[] ponto = new byte[65];
        ponto[0] = 0x04;
        copiarAlinhado(chave.getW().getAffineX(), ponto, 1);
        copiarAlinhado(chave.getW().getAffineY(), ponto, 33);
        return ponto;
    }

    private static void copiarAlinhado(BigInteger numero, byte[] destino, int inicio)
    {
        byte[] bytes = numero.toByteArray();
        int origem = Math.max(0, bytes.length - 32);
        int tamanho = bytes.length - origem;
        System.arraycopy(bytes, origem, destino, inicio + 32 - tamanho, tamanho);
    }

    private static byte[] concatenar(byte[]... partes)
    {
        int total = 0;
        for(byte[] p : partes)
        {
            total += p.length;
        }
        ByteBuffer junto = ByteBuffer.allocate(total);
        for(byte[] p : partes)
        {
            junto.put(p);
        }
        return junto.array();
    }

    private static ECParameterSpec parametrosP256()
    {
        try
        {
            AlgorithmParameters parametros = AlgorithmParameters.getInstance("EC");
            parametros.init(new ECGenParameterSpec("secp256r1"));
            return parametros.getParameterSpec(ECParameterSpec.class);
        }
        catch(GeneralSecurityException e)
        {
            throw new IllegalStateException(e);
        }
    }
}
