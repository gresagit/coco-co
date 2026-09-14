import { redirect } from "next/navigation";

export default function CodigosBarraPage() {
  redirect("/dashboard/insumos/codigos-barra");
}
                    Ver / descargar
                  </Link>
                </td>
              </tr>
            ))}
            {(generaciones || []).length === 0 && (
              <tr><td colSpan={6} className="text-brand-400 text-sm py-4">Aún no has generado códigos de barra.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
