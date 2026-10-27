# Guía de estilo

Dirección visual de la web: **pergamino ilustrado**. Papel envejecido, tinta oscura, títulos en serif de inscripción, marcos de línea fina y botones de bronce. Es un mundo medieval que combina con el juego sin copiar su interfaz.

Referencia de inspiración (no se copian sus ilustraciones): un sitio con estética de grabado a tinta sobre papel, guardado localmente en `docs/design/referencias/` (fuera de git, es material de terceros).

> El mapa del visor **no** sigue este estilo: es la "ventana al juego" y apunta a parecerse lo más posible a una partida real (ver [`tasks/08-experiencia-de-juego.md`](../tasks/08-experiencia-de-juego.md)). El pergamino es todo lo que rodea al mapa.

## Principios
1. **Papel y tinta.** Fondo claro y cálido, texto casi negro con tinte marrón. Nada de blancos puros ni grises fríos.
2. **Ornamento con medida.** Marcos, filetes y bordes rasgados en los bordes de las secciones; nunca encima del contenido ni en tablas de datos.
3. **Los datos se leen primero.** Tablas, tiempos y números usan la fuente de texto con cifras tabulares, sin decoración.
4. **El color de jugador es identidad, no texto.** Se muestra en una muestra (cuadradito o punto) al lado del nombre; el nombre va en color de tinta. Colores como el amarillo no se leen sobre papel.
5. **Todo propio.** Texturas, ornamentos e íconos hechos con CSS o SVG propios. Sin imágenes del juego ni de la referencia.

## Tokens
Definidos como variables CSS en `apps/web/src/app/globals.css`.

### Color
| Token | Valor | Uso |
|---|---|---|
| `--paper` | `#efe2c8` | Fondo de página |
| `--paper-raised` | `#f6ecd8` | Tarjetas, paneles, zona de subida |
| `--paper-sunken` | `#e3d2b2` | Encabezados de tabla, campos, pestañas inactivas |
| `--ink` | `#2f2620` | Texto principal |
| `--ink-soft` | `#5c4f43` | Texto secundario |
| `--ink-faint` | `#6b5d4e` | Notas, metadatos, ejes (solo sobre `--paper` o `--paper-raised`) |
| `--rule` | `#b9a582` | Filetes, bordes de marco, separadores |
| `--charcoal` | `#2d2a27` | Barra superior, barra de controles, pie |
| `--charcoal-ink` | `#efe2c8` | Texto sobre carbón |
| `--bronze` | `#8c5226` | Botón principal (tono más claro que lleva texto), acento |
| `--bronze-dark` | `#5e3416` | Borde, sombra y parte baja del degradado |
| `--bronze-light` | `#d39a5f` | Brillo del borde y contorno de foco; nunca detrás de texto |
| `--danger` | `#9b2f22` | Errores, abandonos |

### Tipografía
| Rol | Fuente | Notas |
|---|---|---|
| Títulos, marca, encabezados de sección | **Cinzel** (Google Fonts, OFL) | Mayúsculas, `letter-spacing: 0.06em` |
| Texto, interfaz, datos | **Montserrat** (Google Fonts, OFL) | Cifras tabulares en tiempos y números |

Escala: 12 / 14 / 16 / 20 / 28 / 40 px. Texto base 14 px en el visor y 16 px en páginas de contenido.

### Forma y espacio
- Espaciado en múltiplos de 4 px (4, 8, 12, 16, 24, 32, 48).
- Radios: 4 px en campos y paneles; botones de bronce en píldora (`999px`).
- Marco ornamental: borde doble de 1 px en `--rule` con un rombo pequeño en cada esquina.

## Componentes
- **Barra superior y barra de controles**: carbón, con borde de papel rasgado hacia el contenido. La marca en Cinzel, en color papel.
- **Botón principal (bronce)**: degradado de `--bronze` a `--bronze-dark` (el texto nunca va sobre `--bronze-light`), borde de 2 px `--bronze-dark`, texto papel en Cinzel, dos remaches (puntos) a los costados. Se usa para la acción principal de cada pantalla.
- **Botón secundario**: fondo `--paper-raised`, borde `--rule`, texto `--ink`. Al pasar el mouse el borde pasa a bronce.
- **Zona de subida**: tarjeta con marco ornamental y borde interior punteado; al arrastrar un archivo el borde pasa a bronce.
- **Pestañas**: texto en Cinzel pequeño; la activa con filete de bronce abajo.
- **Tablas**: sin marcos ornamentales; filetes `--rule` entre filas; encabezado en `--paper-sunken`.
- **Gráficos**: barras con el color de cada jugador sobre papel, eje en `--rule`, etiquetas en `--ink-soft`.
- **Mapa y minimapa**: marco fino de carbón alrededor del canvas; el contenido del mapa se rige por la experiencia de juego, no por esta guía.
- **Mensajes de error**: `--danger` con ícono o texto explícito, nunca solo color.

## Accesibilidad
- Contraste mínimo 4.5:1 para texto. Medido: `--ink` 11.6, `--ink-soft` 6.2 y `--ink-faint` 5.0 sobre `--paper`; papel sobre carbón 11.1; papel sobre `--bronze` 4.9; `--danger` 5.8.
- Foco visible: contorno de 2 px `--bronze-light`.
- Ancho mínimo 360 px sin scroll horizontal.

## Pendiente
- [ ] Ilustraciones propias en estilo grabado (portada, estados vacíos, página 404)
- [ ] Logo propio
- [ ] Íconos de línea propios (subir, compartir, cámara, análisis)
- [ ] Revisar si se suma un modo oscuro ("pergamino de noche") o se mantiene solo claro
