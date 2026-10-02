// Layout raiz ÚNICO e estático: não lê dado nenhum.
export default function RootLayout({ children }) {
  return (
    <html lang="pt-BR">
      <body>
        <p>[[root:{Date.now()}]]</p>
        {children}
      </body>
    </html>
  );
}
