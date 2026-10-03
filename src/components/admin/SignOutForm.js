"use client";

// Botão "Sair" do painel (RF20): encerra a sessão pela Server Function e apaga os rascunhos
// locais do editor, para que o texto de um usuário não fique em um navegador compartilhado (A-010,
// nota 10). A ação continua sendo a Server Function (a `action` do formulário), de modo que o
// botão funciona mesmo se o JavaScript não carregar; o `onSubmit` só acrescenta a limpeza.
import { clearAllDrafts } from "@/components/editor/draft";
import { Button } from "@/components/ui/Button";
import { SignOutIcon } from "@/components/ui/icons";

/** @param {{ action: () => Promise<void> }} props `action` é a Server Function que encerra a sessão */
export function SignOutForm({ action }) {
  return (
    <form action={action} onSubmit={() => clearAllDrafts()}>
      <Button type="submit" variant="inverse">
        <SignOutIcon className="size-4 shrink-0" />
        Sair
      </Button>
    </form>
  );
}
