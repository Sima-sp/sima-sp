package br.com.back_end.simasp.ocorrencia.service;

import br.com.back_end.simasp.exception.FotoInvalidaException;
import br.com.back_end.simasp.ocorrencia.config.OcorrenciaProperties;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

import javax.imageio.ImageIO;
import javax.imageio.ImageReader;
import javax.imageio.stream.ImageInputStream;
import java.awt.Graphics2D;
import java.awt.RenderingHints;
import java.awt.image.BufferedImage;
import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Arrays;
import java.util.Iterator;
import java.util.Optional;
import java.util.UUID;
import java.util.regex.Pattern;

/**
 * Fotos dos relatos (#15).
 *
 * <ul>
 *   <li>Só JPEG e PNG, conferidos pelos primeiros bytes do arquivo, não pela extensão nem pelo
 *       tipo que o celular declara.</li>
 *   <li>A imagem é aberta e gravada de novo. Isso joga fora os metadados (EXIF, que podem ter a
 *       posição exata de quem tirou), e o que não for uma imagem de verdade não passa.</li>
 *   <li>Imagens gigantes são recusadas antes de abrir (evita estourar a memória) e as grandes
 *       são reduzidas para no máximo {@value #LADO_MAXIMO} px no lado maior.</li>
 *   <li>O nome do arquivo é sorteado; o que o celular mandou não é usado.</li>
 * </ul>
 */
@Service
public class FotoService {

    static final int LADO_MAXIMO = 1600;
    private static final long PIXELS_MAXIMO = 50_000_000L;

    private static final byte[] JPEG = {(byte) 0xFF, (byte) 0xD8, (byte) 0xFF};
    private static final byte[] PNG = {(byte) 0x89, 'P', 'N', 'G', '\r', '\n', 0x1A, '\n'};
    private static final Pattern NOME = Pattern.compile("[0-9a-f-]{36}\\.(jpg|png)");

    private final Path pasta;

    public FotoService(OcorrenciaProperties propriedades)
    {
        this.pasta = propriedades.pastaFotos().toAbsolutePath().normalize();
    }

    /** Confere, limpa e grava a foto. Devolve o nome do arquivo guardado. */
    public String salvar(MultipartFile arquivo)
    {
        byte[] bytes;
        try
        {
            bytes = arquivo.getBytes();
        }
        catch(IOException e)
        {
            throw new FotoInvalidaException("Não foi possível ler a foto.");
        }

        String formato = comeca(bytes, JPEG) ? "jpg" : comeca(bytes, PNG) ? "png" : null;
        if(formato == null)
        {
            throw new FotoInvalidaException("A foto precisa ser JPEG ou PNG.");
        }

        BufferedImage imagem = ler(bytes);
        imagem = reduzir(imagem, formato.equals("jpg"));

        String nome = UUID.randomUUID() + "." + formato;
        try
        {
            Files.createDirectories(pasta);
            Path destino = pasta.resolve(nome);
            if(!ImageIO.write(imagem, formato, destino.toFile()))
            {
                throw new FotoInvalidaException("Não foi possível gravar a foto.");
            }
        }
        catch(IOException e)
        {
            throw new UncheckedIOException("Falha ao gravar a foto em " + pasta, e);
        }

        return nome;
    }

    /** Caminho da foto guardada, se o nome for um dos que este serviço gera e o arquivo existir. */
    public Optional<Path> abrir(String nome)
    {
        if(nome == null || !NOME.matcher(nome).matches())
        {
            return Optional.empty();
        }

        Path arquivo = pasta.resolve(nome);
        return Files.isRegularFile(arquivo) ? Optional.of(arquivo) : Optional.empty();
    }

    public static String tipoDeConteudo(String nome)
    {
        return nome.endsWith(".png") ? "image/png" : "image/jpeg";
    }

    private static BufferedImage ler(byte[] bytes)
    {
        try(ImageInputStream entrada = ImageIO.createImageInputStream(new ByteArrayInputStream(bytes)))
        {
            Iterator<ImageReader> leitores = ImageIO.getImageReaders(entrada);
            if(!leitores.hasNext())
            {
                throw new FotoInvalidaException("A foto precisa ser JPEG ou PNG.");
            }

            ImageReader leitor = leitores.next();
            try
            {
                leitor.setInput(entrada, true, true);
                long pixels = (long) leitor.getWidth(0) * leitor.getHeight(0);
                if(pixels <= 0 || pixels > PIXELS_MAXIMO)
                {
                    throw new FotoInvalidaException("A foto é grande demais.");
                }
                return leitor.read(0);
            }
            finally
            {
                leitor.dispose();
            }
        }
        catch(IOException | RuntimeException e)
        {
            if(e instanceof FotoInvalidaException invalida)
            {
                throw invalida;
            }
            throw new FotoInvalidaException("O arquivo não é uma imagem válida.");
        }
    }

    /** Reduz para o lado maior caber em LADO_MAXIMO; JPEG sai sempre em RGB (sem transparência). */
    private static BufferedImage reduzir(BufferedImage original, boolean jpeg)
    {
        int largura = original.getWidth();
        int altura = original.getHeight();
        double escala = Math.min(1.0, (double) LADO_MAXIMO / Math.max(largura, altura));
        int novaLargura = Math.max(1, (int) Math.round(largura * escala));
        int novaAltura = Math.max(1, (int) Math.round(altura * escala));

        int tipo = jpeg ? BufferedImage.TYPE_INT_RGB : BufferedImage.TYPE_INT_ARGB;
        BufferedImage copia = new BufferedImage(novaLargura, novaAltura, tipo);
        Graphics2D g = copia.createGraphics();
        try
        {
            g.setRenderingHint(RenderingHints.KEY_INTERPOLATION, RenderingHints.VALUE_INTERPOLATION_BILINEAR);
            if(jpeg)
            {
                g.setColor(java.awt.Color.WHITE);
                g.fillRect(0, 0, novaLargura, novaAltura);
            }
            g.drawImage(original, 0, 0, novaLargura, novaAltura, null);
        }
        finally
        {
            g.dispose();
        }
        return copia;
    }

    private static boolean comeca(byte[] bytes, byte[] assinatura)
    {
        return bytes.length >= assinatura.length
                && Arrays.equals(bytes, 0, assinatura.length, assinatura, 0, assinatura.length);
    }
}
