import type { Informe, InformeBloque } from "@/lib/informe";

// Agrupa viñetas consecutivas en una sola lista, respetando el orden en que
// vienen: dentro de una sección los párrafos y las viñetas se intercalan.
const agrupar = (bloques: InformeBloque[]): InformeBloque[][] =>
  bloques.reduce<InformeBloque[][]>((grupos, bloque) => {
    const ultimo = grupos.at(-1);
    if (ultimo && ultimo[0].tipo === "vineta" && bloque.tipo === "vineta") ultimo.push(bloque);
    else grupos.push([bloque]);
    return grupos;
  }, []);

/**
 * Pinta el informe mensual en pantalla a partir de la misma estructura `Informe`
 * que alimenta el PDF, así que ambos muestran lo mismo. Antes se volcaba el
 * markdown crudo de la IA en un `<p>` y se veían los `##` y los `**`.
 */
const InformeMensualTexto = ({ informe }: { informe: Informe }) => (
  <div className="space-y-3 text-sm text-foreground/90">
    {informe.campos.length > 0 && (
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
        {informe.campos.map((c) => (
          <span key={c.label}>
            {c.label}: <span className="font-semibold text-foreground">{c.valor}</span>
          </span>
        ))}
      </div>
    )}

    {(informe.secciones ?? []).map((sec, i) => (
      <section key={i} className="space-y-1.5">
        {sec.titulo && (
          <h3 className="text-xs font-semibold uppercase tracking-wide text-primary">
            {sec.titulo}
          </h3>
        )}
        {agrupar(sec.bloques).map((grupo, j) =>
          grupo[0].tipo === "vineta" ? (
            <ul key={j} className="list-disc space-y-1 pl-5 marker:text-primary">
              {grupo.map((b, k) => (
                <li key={k} className="leading-relaxed">
                  {b.texto}
                </li>
              ))}
            </ul>
          ) : (
            <p key={j} className="leading-relaxed">
              {grupo[0].texto}
            </p>
          )
        )}
      </section>
    ))}
  </div>
);

export default InformeMensualTexto;
