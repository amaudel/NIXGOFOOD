export default function NegocioNoEncontradoPage() {
  return (
    <div className="flex-1 flex items-center justify-center px-4">
      <div className="text-center space-y-3">
        <h1 className="text-2xl font-extrabold">Negocio no encontrado</h1>
        <p className="text-zinc-400 max-w-md">
          Este enlace no corresponde a ningún negocio activo. Verifica la
          dirección o contacta a quien te la compartió.
        </p>
      </div>
    </div>
  );
}
