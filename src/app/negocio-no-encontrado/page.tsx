export default function NegocioNoEncontradoPage() {
  return (
    <html lang="es" className="dark">
      <body className="bg-zinc-950 text-zinc-100 min-h-screen flex items-center justify-center antialiased">
        <div className="text-center px-4 space-y-3">
          <h1 className="text-2xl font-extrabold">Negocio no encontrado</h1>
          <p className="text-zinc-400 max-w-md">
            Este enlace no corresponde a ningún negocio activo. Verifica la
            dirección o contacta a quien te la compartió.
          </p>
        </div>
      </body>
    </html>
  );
}
