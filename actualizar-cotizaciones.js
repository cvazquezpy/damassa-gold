// actualizar-cotizaciones.js
// Genera cotizaciones.json con las cotizaciones de Damassa Gold.
// Reemplaza al backend de Apps Script (bloqueado por política de cuenta de Google).
// Se ejecuta automáticamente vía GitHub Actions (ver .github/workflows/actualizar-cotizaciones.yml)

const fs = require('fs');

const TIMEOUT_MS = 15000; // si una API no responde en 15 s, se aborta sin tocar el JSON

async function obtenerJson(url) {
  const res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!res.ok) throw new Error(`HTTP ${res.status} en ${url}`);
  return res.json();
}

function validar(nombre, valor, min, max) {
  if (!Number.isFinite(valor) || valor < min || valor > max) {
    throw new Error(`${nombre} fuera de rango o inválido: ${valor}`);
  }
  return valor;
}

const ONZA_TROY_EN_GRAMOS = 32.15;
const MARGEN_COMPRA = 0.90;  // Damassa compra al 90% de la cotización internacional
const MARGEN_VENTA = 1.03;   // Venta = compra + 3%
const CASA_CAMBIO_PREFERIDA = 'cambioschaco'; // Cambios Chaco, con fallback a la mejor compra

const TITULOS = [
  { identificacion: 'Oro 24k',        fraccion: 24 / 24 },
  { identificacion: 'Oro 22k',        fraccion: 22 / 24 },
  { identificacion: 'Oro 18k',        fraccion: 18 / 24 },
  { identificacion: 'Chafa Italiana', fraccion: 18 / 24 }, // ponderada como 18k
  { identificacion: 'Chafa Nacional', fraccion: 16 / 24 }, // ponderada como 16k
];

async function obtenerCotizacionDolar() {
  const data = await obtenerJson('http://dolar.melizeche.com/api/1.0/');
  const casas = data.dolarpy;

  if (casas[CASA_CAMBIO_PREFERIDA]) {
    return parseFloat(casas[CASA_CAMBIO_PREFERIDA].compra);
  }

  // Fallback: si "cambioschaco" no está disponible, usamos la casa con mayor valor de compra
  let mejorCompra = 0;
  for (const clave in casas) {
    const compra = parseFloat(casas[clave].compra);
    if (compra > mejorCompra) mejorCompra = compra;
  }
  return mejorCompra;
}

async function obtenerCotizacionOro() {
  const data = await obtenerJson('https://api.goldprice.dev/v1/prices?symbol=XAU-USD-SPOT');
  return parseFloat(data.symbols[0].price);
}

async function main() {
  // Rangos amplios de sanidad: si una API devuelve basura, NO se publica un JSON roto
  const usdPyg = validar('USD/PYG', await obtenerCotizacionDolar(), 3000, 20000);
  const xauUsd = validar('XAU/USD', await obtenerCotizacionOro(), 1000, 20000);

  const precioGramo24kPyg = (xauUsd / ONZA_TROY_EN_GRAMOS) * usdPyg;
  const compra24k = precioGramo24kPyg * MARGEN_COMPRA;

  const listaTipos = TITULOS.map((t) => {
    const compra = compra24k * t.fraccion;
    const venta = compra * MARGEN_VENTA;
    return {
      identificacion: t.identificacion,
      compra: Math.round(compra).toString(),
      venta: Math.round(venta).toString(),
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
