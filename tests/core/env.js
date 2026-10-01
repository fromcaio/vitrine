// Ambiente do better-auth nos testes do Core. Importe ESTE arquivo antes de qualquer módulo que
// carregue src/lib/auth.js (os imports são avaliados em ordem). Os valores são fictícios: nenhum
// teste lê o .env nem usa segredo real. DATABASE_URL já foi definida por tests/setup/per-file.js.
process.env.BETTER_AUTH_SECRET = "segredo-ficticio-somente-para-os-testes-automatizados";
process.env.BETTER_AUTH_URL = "http://localhost:3000";
