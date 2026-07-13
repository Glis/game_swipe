# Gameswipe: A Ver Qué Jugamos 🎲

App web para decidir qué juego de mesa jugar: cada jugador swipea el catálogo (like/nope) y al final se arma un podio con los juegos más votados.

## Estructura

```
.
├── index.html       # markup
├── css/
│   └── style.css    # estilos
├── js/
│   └── app.js        # lógica de la app (catálogo, sesión, swipe, resultados)
└── README.md
```

## Uso

No requiere build ni dependencias. Abrí `index.html` en el navegador (o serví la carpeta con cualquier servidor estático).

El catálogo se guarda en `localStorage`, así que persiste entre visitas en el mismo navegador.
