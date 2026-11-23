// Tela de entrada no padrão dos sistemas do CAFN (Catequese, Preceptoria):
// fundo azul-marinho com os círculos dourados, brasão e cartão branco com borda dourada.
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative flex min-h-dvh flex-col overflow-x-hidden bg-navy">
      <div
        aria-hidden
        className="pointer-events-none fixed -right-40 -top-44 h-[520px] w-[520px] rounded-full border border-ocre/25 shadow-[0_0_0_50px_rgba(214,165,66,0.04),0_0_0_100px_rgba(214,165,66,0.025)]"
      />
      {children}
    </div>
  )
}
