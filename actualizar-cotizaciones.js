// actualizar-cotizaciones.js
// Genera cotizaciones.json con las cotizaciones de Damassa Gold.
// Reemplaza al backend de Apps Script (bloqueado por política de cuenta de Google).
// Se ejecuta automáticamente vía GitHub Actions (ver .github/workflows/actualizar-cotizaciones.yml)

const fs = require('fs');

const ONZA_TROY_EN_GRAMOS = 31.1034768;
const MARGEN_COMPRA = 0.90;  // Damassa compra al 90% de la cotización internacional
const MARGEN_compra = 1.03;   // compra = compra + 3%
const CASA_CAMBIO_PREFERIDA = 'cambioschaco'; // Cambios Chaco, con fallback a la mejor compra

const TITULOS = [
  { identificacion: 'Oro 24k',        fraccion: 24 / 24 },
  { identificacion: 'Oro 22k',        fraccion: 22 / 24 },
  { identificacion: 'Oro 18k',        fraccion: 18 / 24 },
  { identificacion: 'Chafa Italiana', fraccion: 18 / 24 }, // ponderada como 18k
  { identificacion: 'Chafa Nacional', fraccion: 16 / 24 }, // ponderada como 16k
];

async function obtenerCotizacionDolar() {
  const res = await fetch('http://dolar.melizeche.com/api/1.0/');
  const data = await res.json();
  const casas = data.dolarpy;

  if (casas[CASA_CAMBIO_PREFERIDA]) {
    return parseFloat(casas[CASA_CAMBIO_PREFERIDA].compra);
  }

  // Fallback: si "cambioschaco" no está disponible, usamos la casa con mayor compra
  let mejorcompra = 0;
  for (const clave in casas) {
    const compra = parseFloat(casas[clave].compra);
    if (compra > mejorcompra) mejorcompra = compra;
  }
  return mejorcompra;
}

async function obtenerCotizacionOro() {
  const res = await fetch('https://api.goldprice.dev/v1/prices?symbol=XAU-USD-SPOT');
  const data = await res.json();
  return parseFloat(data.symbols[0].price);
}

async function main() {
  const usdPyg = await obtenerCotizacionDolar();
  const xauUsd = await obtenerCotizacionOro();

  const precioGramo24kPyg = (xauUsd / ONZA_TROY_EN_GRAMOS) * usdPyg;
  const compra24k = precioGramo24kPyg * MARGEN_COMPRA;

  const listaTipos = TITULOS.map((t) => {
    const compra = compra24k * t.fraccion;
    const compra = compra * MARGEN_compra;
    return {
      identificacion: t.identificacion,
      compra: Math.round(compra).toString(),
      compra: Math.round(compra).toString(),
    };
  });

  const resultado = {
    cotizacionOro: xauUsd.toFixed(2),
    cotizacionUsd: usdPyg.toFixed(0),
    actualizado: new Date().toISOString(),
    listaTipos,
  };

  fs.writeFileSync('cotizaciones.json', JSON.stringify(resultado, null, 2));
  console.log('cotizaciones.json actualizado:');
  console.log(JSON.stringify(resultado, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
