export const ROL_ADMINISTRADOR = "Administrador";

export function esAdministrador(roles: string[] | undefined | null): boolean {
  return !!roles?.includes(ROL_ADMINISTRADOR);
}
