// Fontes auto-hospedadas (pacotes @fontsource): funcionam offline e sem depender do Google Fonts no build.
import "@fontsource-variable/big-shoulders";
import "@fontsource-variable/atkinson-hyperlegible-next";
import "@fontsource-variable/atkinson-hyperlegible-mono";
import "./globals.css";
import { CONFIG } from "@/lib/config";

const TITULO = "SIMA · O bueiro avisa antes que a rua alague";
const DESCRICAO =
  "Sistema Inteligente de Monitoramento de Alagamentos em São Paulo: a água medida nos bueiros, a chance de alagar nas próximas 3 horas e a rota de carro que desvia dos pontos em risco.";
/** A imagem que aparece quando o link é colado numa conversa (fonte em ferramentas/compartilhar.html). */
const IMAGEM = { url: `${CONFIG.urlSite}compartilhar.png`, width: 1200, height: 630, alt: "SIMA: o bueiro avisa antes que a rua alague. As quatro tampas de nível: baixo, médio, alto e crítico." };

export const metadata = {
  title: TITULO,
  description: DESCRICAO,
  // O Next não acrescenta a subpasta de publicação ao ícone sozinho. É o mesmo ícone do app.
  icons: { icon: `${CONFIG.caminhoBase}/icone-192.png`, apple: `${CONFIG.caminhoBase}/icone-apple.png` },
  openGraph: { type: "website", locale: "pt_BR", siteName: "SIMA", url: CONFIG.urlSite, title: TITULO, description: DESCRICAO, images: [IMAGEM] },
  twitter: { card: "summary_large_image", title: TITULO, description: DESCRICAO, images: [IMAGEM] },
};

export const viewport = { themeColor: "#0f1113" };

export default function RootLayout({ children }) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
