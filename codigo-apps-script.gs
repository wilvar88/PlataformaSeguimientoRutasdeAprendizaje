// ============================================================
//  Plataforma de Capacitación y Seguimiento de Mallas
//  Backend - Google Apps Script (Code.gs)
//  Arquitectura: API JSON multi-proveedor jerárquica
// ============================================================

var SPREADSHEET_ID = 'PEGA_AQUI_TU_ID';

var SHEET_COLABORADORES = 'Colaboradores';
var SHEET_DATOS_MALLA   = 'Datos Malla';
var SHEET_DATOS_CURSOS  = 'Datos Cursos';

var PROVIDER_TABS = ['Buk', 'Ubits', 'SENA', 'Colsubsidio'];

// ============================================================
// UTILIDADES
// ============================================================

/**
 * Normaliza un string para comparaciones: minúsculas, sin tildes,
 * sin caracteres especiales, espacios simples.
 */
function _cleanStr(str) {
  if (!str) return '';
  return String(str)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Normaliza un número de documento: solo dígitos.
 * Elimina puntos, comas, ".0" de Google Sheets, espacios.
 */
function _normDoc(doc) {
  if (doc === null || doc === undefined || doc === '') return '';
  var s = String(doc).trim();
  // Si viene como número con decimal (ej: 1069432843.0)
  if (s.indexOf('.') !== -1) {
    var num = parseFloat(s);
    if (!isNaN(num)) s = String(Math.round(num));
  }
  return s.replace(/[^0-9]/g, '');
}

/**
 * Elimina el código numérico al final de un nombre de ruta.
 * Ejemplo: "Conexión Líder (60491)" => "Conexión Líder"
 */
function _stripCodeFromRuta(str) {
  if (!str) return '';
  return String(str).replace(/\s*\(\d+\)\s*$/g, '').trim();
}

/**
 * Busca el índice de una columna en los headers.
 * Pase 1: coincidencia exacta (tras normalizar).
 * Pase 2: coincidencia por substring, pero SOLO si el nombre buscado
 *          tiene al menos 5 caracteres (evita falsos positivos con "rol", "id", etc.)
 */
function _findCol(headers, names) {
  // Pase 1: Coincidencia exacta
  for (var j = 0; j < headers.length; j++) {
    var hClean = _cleanStr(headers[j]);
    for (var k = 0; k < names.length; k++) {
      if (hClean === _cleanStr(names[k])) return j;
    }
  }
  // Pase 2: Coincidencia por substring (solo para nombres largos >= 5 chars)
  for (var j = 0; j < headers.length; j++) {
    var hClean = _cleanStr(headers[j]);
    for (var k = 0; k < names.length; k++) {
      var nClean = _cleanStr(names[k]);
      if (nClean.length >= 5 && hClean.indexOf(nClean) !== -1) return j;
    }
  }
  return -1;
}

/**
 * Busca una columna específica por nombre exacto (sin substring).
 * Retorna -1 si no la encuentra.
 */
function _findColExact(headers, names) {
  for (var j = 0; j < headers.length; j++) {
    var hClean = _cleanStr(headers[j]);
    for (var k = 0; k < names.length; k++) {
      if (hClean === _cleanStr(names[k])) return j;
    }
  }
  return -1;
}

// ============================================================
// PUNTO DE ENTRADA
// ============================================================

function doGet(e) {
  var params = e.parameter || {};
  var action = params.action;
  var result;
  try {
    if (action === 'validarUsuario') {
      result = validarUsuario((params.documento || '').trim());
    } else if (action === 'obtenerMallas') {
      result = obtenerMallas(
        (params.documento || '').trim(),
        (params.perfil || '').trim(),
        (params.permisos || '').trim()
      );
    } else if (action === 'debug') {
      result = debugHeaders();
    } else {
      result = { success: false, error: 'Acción no reconocida: ' + (action || 'ninguna') };
    }
  } catch (err) {
    result = { success: false, error: 'Error interno: ' + err.message };
  }
  return _buildResponse(result, params.callback);
}

// ============================================================
// VALIDAR USUARIO (LOGIN)
// ============================================================

function validarUsuario(documento) {
  if (!documento) return { success: false, error: 'Documento vacío.' };
  try {
    var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    var sheet = ss.getSheetByName(SHEET_COLABORADORES);
    if (!sheet) return { success: false, error: "No existe la hoja 'Colaboradores'." };

    var data = sheet.getDataRange().getValues();
    if (data.length < 2) return { success: false, error: 'Hoja vacía.' };
    var h = data[0];

    // Buscar columnas con nombres exactos primero, luego con _findCol como respaldo
    var docIdx    = _findCol(h, ["Documento", "Identificacion", "Cedula", "DNI"]);
    var nameIdx   = _findCol(h, ["Empleado - Nombre Completo", "Nombre Completo"]);
    var divIdx    = _findCol(h, ["Trabajo - Nombre División", "Nombre División"]);
    var cargoIdx  = _findCol(h, ["Trabajo - Cargo", "Cargo"]);

    // CRÍTICO: Para "Perfil" y "Rol", buscar SOLO por coincidencia exacta
    // para evitar falsos positivos (ej: "Control" contiene "rol")
    var perfilIdx = _findColExact(h, ["Perfil", "Perfil Usuario", "Tipo Perfil"]);
    var rolIdx    = _findColExact(h, ["Rol", "Rol / Permisos", "Rol/Permisos", "Permisos"]);

    // Si Perfil y Rol se resolvieron a la MISMA columna, invalidar uno
    if (perfilIdx !== -1 && rolIdx !== -1 && perfilIdx === rolIdx) {
      rolIdx = -1; // Dar prioridad a Perfil
    }

    // Fallbacks por posición (basados en estructura típica)
    if (docIdx === -1)    docIdx = 1;
    if (nameIdx === -1)   nameIdx = 2;
    if (cargoIdx === -1)  cargoIdx = 4;
    if (divIdx === -1)    divIdx = 5;

    // Para perfil y rol, intentar búsqueda columna por columna
    // buscando headers que contengan EXACTAMENTE "Perfil" o "Rol"
    if (perfilIdx === -1) {
      for (var j = 0; j < h.length; j++) {
        var headerVal = String(h[j]).trim();
        if (headerVal === 'Perfil') { perfilIdx = j; break; }
      }
    }
    if (rolIdx === -1) {
      for (var j = 0; j < h.length; j++) {
        if (j === perfilIdx) continue; // No repetir la misma columna
        var headerVal = String(h[j]).trim();
        if (headerVal === 'Rol' || headerVal === 'Rol / Permisos') { rolIdx = j; break; }
      }
    }

    var cleanDocInput = _normDoc(documento);

    // Buscar colaborador por documento
    for (var i = 1; i < data.length; i++) {
      var row = data[i];
      var rawDoc = _normDoc(row[docIdx]);
      if (rawDoc !== cleanDocInput) continue;

      // Leer valores de Perfil y Rol
      var perfVal = (perfilIdx !== -1 && perfilIdx < row.length) ? String(row[perfilIdx]).trim() : '';
      var rolVal  = (rolIdx !== -1 && rolIdx < row.length) ? String(row[rolIdx]).trim() : '';

      // Determinar si es Administrador
      // SOLO basarse en la columna Perfil (valor exacto) o columna Rol (valor exacto)
      var perfLower = perfVal.toLowerCase().trim();
      var rolLower  = rolVal.toLowerCase().trim();

      var isAdmin = (
        perfLower === 'administrador' ||
        perfLower === 'admin' ||
        rolLower === 'administrador' ||
        rolLower === 'admin' ||
        rolLower === 'todos'
      );

      var perfilFinal = isAdmin ? 'Administrador' : 'Estudiante';
      var permisosFinal = rolVal || (isAdmin ? 'TODOS' : '');

      return {
        success: true,
        usuario: {
          documento: documento,
          nombre:    nameIdx < row.length ? String(row[nameIdx]).trim() : 'Colaborador',
          division:  divIdx < row.length ? String(row[divIdx]).trim() : 'General',
          cargo:     cargoIdx < row.length ? String(row[cargoIdx]).trim() : '',
          perfil:    perfilFinal,
          permisos:  permisosFinal,
          // DEBUG: incluir info de qué columnas se encontraron (quitar luego)
          _debug: {
            perfilIdx: perfilIdx,
            rolIdx: rolIdx,
            perfilVal: perfVal,
            rolVal: rolVal,
            headerPerfilCol: perfilIdx !== -1 ? String(h[perfilIdx]) : 'NO ENCONTRADA',
            headerRolCol: rolIdx !== -1 ? String(h[rolIdx]) : 'NO ENCONTRADA'
          }
        }
      };
    }
    return { success: false, error: 'Documento no encontrado en la base de datos.' };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

// ============================================================
// OBTENER MALLAS (DATOS PRINCIPALES)
// ============================================================

function obtenerMallas(documento, perfil, permisos_vista) {
  try {
    var ss = SpreadsheetApp.openById(SPREADSHEET_ID);

    // ── 1. Datos Malla ──────────────────────────────────────
    var mapRutas = {};
    var mapRutasClean = {};

    var sheetMalla = ss.getSheetByName(SHEET_DATOS_MALLA);
    if (sheetMalla) {
      var dm = sheetMalla.getDataRange().getValues();
      var hm = dm[0];
      var mFoto = _findCol(hm, ["Foto Ruta"]);
      var mProv = _findCol(hm, ["Proveedor"]);
      var mNom  = _findCol(hm, ["Nombre Ruta"]);
      var mIni  = _findCol(hm, ["Fecha de Inicio"]);
      var mFin  = _findCol(hm, ["Fecha Fin", "Fecha de Fin"]);
      var mEst  = _findCol(hm, ["Estado"]);

      for (var i = 1; i < dm.length; i++) {
        var rName = mNom !== -1 ? String(dm[i][mNom]).trim() : '';
        if (!rName) continue;

        var prov = mProv !== -1 ? String(dm[i][mProv]).trim() : '';
        var objRuta = {
          nombreRuta:  rName,
          fotoRuta:    mFoto !== -1 ? String(dm[i][mFoto]).trim() : '',
          proveedor:   prov,
          fechaInicio: mIni  !== -1 ? dm[i][mIni]  : '',
          fechaFin:    mFin  !== -1 ? dm[i][mFin]   : '',
          estado:      mEst  !== -1 ? String(dm[i][mEst]).trim() : ''
        };

        mapRutas[rName.toLowerCase()] = objRuta;
        mapRutasClean[_cleanStr(rName)] = objRuta;
      }
    }

    // ── 2. Datos Cursos ─────────────────────────────────────
    var mapCursos = {};
    var mapCursosClean = {};
    var sheetCursos = ss.getSheetByName(SHEET_DATOS_CURSOS);
    if (sheetCursos) {
      var dc = sheetCursos.getDataRange().getValues();
      var hc = dc[0];
      var cFoto = _findCol(hc, ["Foto Curso"]);
      var cProv = _findCol(hc, ["Proveedor"]);
      var cRuta = _findCol(hc, ["Nombre Ruta"]);
      var cNom  = _findCol(hc, ["Nombre Curso"]);

      for (var i = 1; i < dc.length; i++) {
        var cName = cNom !== -1 ? String(dc[i][cNom]).trim() : '';
        var rName = cRuta !== -1 ? String(dc[i][cRuta]).trim() : '';
        if (!cName) continue;

        var cObj = {
          nombreCurso: cName,
          nombreRuta:  rName,
          fotoCurso:   cFoto !== -1 ? String(dc[i][cFoto]).trim() : '',
          proveedor:   cProv !== -1 ? String(dc[i][cProv]).trim() : ''
        };

        mapCursos[cName.toLowerCase()] = cObj;
        mapCursosClean[_cleanStr(cName)] = cObj;
      }
    }

    // ── 3. Colaboradores ────────────────────────────────────
    var mapColab = {};
    var countColabPorDiv = {};
    var sheetColab = ss.getSheetByName(SHEET_COLABORADORES);
    if (sheetColab) {
      var dco = sheetColab.getDataRange().getValues();
      var hco = dco[0];
      var coDoc   = _findCol(hco, ["Documento"]);
      var coName  = _findCol(hco, ["Empleado - Nombre Completo", "Nombre Completo"]);
      var coDiv   = _findCol(hco, ["Trabajo - Nombre División"]);
      var coCargo = _findCol(hco, ["Trabajo - Cargo", "Cargo", "trabajo - cargo", "empleado - cargo"]);
      if (coDoc === -1)   coDoc = 1;
      if (coName === -1)  coName = 2;
      if (coCargo === -1) coCargo = 4;
      if (coDiv === -1)   coDiv = 5;

      for (var i = 1; i < dco.length; i++) {
        var d = _normDoc(dco[i][coDoc]);
        var divName = coDiv < dco[i].length ? String(dco[i][coDiv]).trim() : 'Sin División';
        if (d) {
          mapColab[d] = {
            nombre:   coName < dco[i].length ? String(dco[i][coName]).trim() : 'Colaborador',
            division: divName,
            cargo:    coCargo < dco[i].length ? String(dco[i][coCargo]).trim() : ''
          };
          countColabPorDiv[divName] = (countColabPorDiv[divName] || 0) + 1;
        }
      }
    }

    // ── 4. Escanear hojas de Proveedores ────────────────────
    var enrollments = [];
    var targetDocNorm = _normDoc(documento);

    for (var t = 0; t < PROVIDER_TABS.length; t++) {
      var tabName = PROVIDER_TABS[t];
      var provSheet = ss.getSheetByName(tabName);
      if (!provSheet) continue;

      var pd = provSheet.getDataRange().getValues();
      if (pd.length < 2) continue;
      var hp = pd[0];

      var pDoc    = _findCol(hp, ["Identificación", "Identificador", "DNI", "NUMERO DOCUMENTO", "Documento", "Cedula"]);
      var pCurso  = _findCol(hp, ["Nombre contenido", "Curso", "Nombre Curso", "Programa"]);
      var pRuta   = _findCol(hp, ["Nombre plan"]);
      var pAvance = _findCol(hp, ["% avance contenido", "Porcentaje de avance", "% de asistencia", "ASISTENCIA", "Progreso"]);
      var pEstado = _findCol(hp, ["Estado de Aprobación", "Estado", "Estado ou Aprobación", "CERTIFICADO", "Certificado"]);
      var pNota   = _findCol(hp, ["Nota examen final", "Nota", "NOTA"]);

      if (pDoc === -1) pDoc = 1;

      for (var i = 1; i < pd.length; i++) {
        var row = pd[i];
        if (pDoc >= row.length) continue;
        var rowDocNorm = _normDoc(row[pDoc]);
        if (!rowDocNorm) continue;

        // CRÍTICO: Si la persona NO pertenece al público objetivo de la hoja 'Colaboradores', ignorarla
        if (!mapColab[rowDocNorm]) continue;

        // Filtro por estudiante: solo sus filas
        if (perfil === 'Estudiante' && rowDocNorm !== targetDocNorm) continue;

        var cursoName     = pCurso !== -1 && pCurso < row.length ? String(row[pCurso]).trim() : '';
        var rutaDirectRaw = pRuta !== -1 && pRuta < row.length   ? String(row[pRuta]).trim()  : '';
        // Quitar código numérico: "Conexión Líder (60491)" => "Conexión Líder"
        var rutaDirect    = _stripCodeFromRuta(rutaDirectRaw);

        var avance = pAvance !== -1 && pAvance < row.length ? row[pAvance] : 0;
        var estado = pEstado !== -1 && pEstado < row.length ? String(row[pEstado]).trim() : '';
        var nota   = pNota !== -1 && pNota < row.length     ? row[pNota] : '';

        // Normalizar avance
        if (typeof avance === 'string') {
          avance = parseFloat(avance.replace('%', '').replace(',', '.')) || 0;
        }
        avance = Math.round(Number(avance) || 0);

        // Normalizar nota
        if (nota !== '' && nota !== null && nota !== undefined) {
          nota = String(nota).replace(',', '.');
          nota = isNaN(parseFloat(nota)) ? nota : Math.round(parseFloat(nota) * 10) / 10;
        } else {
          nota = null;
        }

        // Normalizar estado (CRÍTICO: Validar primero 'No Aprobado' / 'Reprobado' para evitar falsos positivos con 'aprob' o avance >= 100)
        var estadoLower = estado.toLowerCase();
        if (estadoLower.indexOf('reprob') !== -1 || estadoLower.indexOf('no aprob') !== -1) {
          estado = 'No Aprobado';
        } else if (estadoLower.indexOf('aprob') !== -1 || estadoLower.indexOf('complet') !== -1 || estadoLower.indexOf('certificad') !== -1 || avance >= 100) {
          estado = 'Aprobado';
        } else if (estadoLower.indexOf('curso') !== -1 || estadoLower.indexOf('progreso') !== -1 || avance > 0) {
          estado = 'En Curso';
        } else {
          estado = 'Inscrito';
        }

        // ════════════════════════════════════════════════════
        // MAPEO DE RUTA: La Columna U (Nombre plan) del proveedor
        // es la FUENTE AUTORITATIVA. Cada fila de la hoja dice
        // explícitamente a qué ruta pertenece ese curso para ese
        // colaborador. NO debemos sobrescribirla con Datos Cursos.
        // ════════════════════════════════════════════════════
        var rutaName = '';
        var cleanRutaDirect = _cleanStr(rutaDirect);

        // PASO 1: Si la Columna U tiene valor, USARLA SIEMPRE
        if (rutaDirect) {
          // Intentar mapear a una ruta oficial de Datos Malla
          if (cleanRutaDirect && mapRutasClean[cleanRutaDirect]) {
            rutaName = mapRutasClean[cleanRutaDirect].nombreRuta;
          }
          // Intentar match por subcadena con rutas oficiales
          if (!rutaName && cleanRutaDirect) {
            for (var rk in mapRutasClean) {
              if (rk.length >= 5 && (cleanRutaDirect.indexOf(rk) !== -1 || rk.indexOf(cleanRutaDirect) !== -1)) {
                rutaName = mapRutasClean[rk].nombreRuta;
                break;
              }
            }
          }
          // Si no coincide con ninguna ruta oficial, usar el valor directo
          if (!rutaName) {
            rutaName = rutaDirect;
          }
        }

        // PASO 2: SOLO si la Columna U estaba VACÍA, buscar en Datos Cursos
        if (!rutaName && cursoName) {
          var cleanCursoName = _cleanStr(cursoName);
          // Match exacto en Datos Cursos
          if (cleanCursoName && mapCursosClean[cleanCursoName] && mapCursosClean[cleanCursoName].nombreRuta) {
            rutaName = mapCursosClean[cleanCursoName].nombreRuta;
          }
        }

        // PASO 3: Fallback final al nombre del proveedor
        if (!rutaName) {
          rutaName = tabName;
        }

        // Obtener metadata
        var rutaMeta  = mapRutasClean[_cleanStr(rutaName)] || mapRutas[rutaName.toLowerCase()];
        var cursoMeta = mapCursosClean[_cleanStr(cursoName)] || (cursoName ? mapCursos[cursoName.toLowerCase()] : null);
        var colab     = mapColab[rowDocNorm] || { nombre: rowDocNorm, division: 'Sin División', cargo: '' };

        var enrollment = {
          documento:     rowDocNorm,
          colaborador:   colab,
          proveedor:     tabName,
          nombreRuta:    rutaName,
          nombreCurso:   cursoName || tabName,
          porcentaje:    avance,
          estado:        estado,
          nota:          nota,
          fotoCurso:     cursoMeta ? cursoMeta.fotoCurso : '',
          fotoRuta:      rutaMeta  ? rutaMeta.fotoRuta   : '',
          fechaInicio:   rutaMeta  ? rutaMeta.fechaInicio : '',
          fechaFin:      rutaMeta  ? rutaMeta.fechaFin    : '',
          rutaEstado:    rutaMeta  ? rutaMeta.estado      : '',
          rutaProveedor: rutaMeta  ? rutaMeta.proveedor   : tabName
        };

        // Filtro de permisos del administrador
        if (perfil === 'Administrador') {
          var perms = (permisos_vista || '').toUpperCase().trim();
          if (perms !== 'TODOS' && perms !== '' && perms !== 'ALL' && perms !== 'ADMINISTRADOR') {
            if (perms.indexOf(String(colab.division).toUpperCase()) === -1) {
              continue;
            }
          }
        }

        enrollments.push(enrollment);
      }
    }

    // ── 5. Compilar resultados ──────────────────────────────
    var totalAvance = 0;
    var countCursos = enrollments.length;
    enrollments.forEach(function(e) { totalAvance += e.porcentaje; });
    var progresoGeneral = countCursos > 0 ? Math.round(totalAvance / countCursos) : 0;

    if (perfil === 'Estudiante') {
      var mallas = {};
      enrollments.forEach(function(e) {
        var rKey = e.nombreRuta;
        if (!mallas[rKey]) {
          mallas[rKey] = {
            nombreRuta:  rKey,
            fotoRuta:    e.fotoRuta,
            proveedor:   e.rutaProveedor,
            fechaInicio: e.fechaInicio,
            fechaFin:    e.fechaFin,
            estado:      e.rutaEstado,
            cursos: []
          };
        }
        mallas[rKey].cursos.push({
          nombreCurso: e.nombreCurso,
          porcentaje:  e.porcentaje,
          estado:      e.estado,
          nota:        e.nota,
          fotoCurso:   e.fotoCurso
        });
      });

      return {
        success: true,
        mallas: mallas,
        progresoGeneral: progresoGeneral,
        totalCursos: countCursos
      };

    } else {
      // ADMINISTRADOR: Jerarquía División -> Ruta -> Cursos -> Personas
      var mallasAdmin = {};

      enrollments.forEach(function(e) {
        var div  = e.colaborador.division;
        var rKey = e.nombreRuta;
        var cKey = e.nombreCurso;

        if (!mallasAdmin[div]) {
          mallasAdmin[div] = {
            nombreDivision: div,
            totalPublico: countColabPorDiv[div] || 0,
            rutas: {}
          };
        }

        if (!mallasAdmin[div].rutas[rKey]) {
          mallasAdmin[div].rutas[rKey] = {
            nombreRuta:  rKey,
            fotoRuta:    e.fotoRuta,
            proveedor:   e.rutaProveedor,
            fechaInicio: e.fechaInicio,
            fechaFin:    e.fechaFin,
            estado:      e.rutaEstado,
            cursos: {}
          };
        }

        if (!mallasAdmin[div].rutas[rKey].cursos[cKey]) {
          mallasAdmin[div].rutas[rKey].cursos[cKey] = {
            nombreCurso: cKey,
            fotoCurso: e.fotoCurso,
            personas: []
          };
        }

        mallasAdmin[div].rutas[rKey].cursos[cKey].personas.push({
          documento: e.documento,
          nombre: e.colaborador.nombre,
          cargo: e.colaborador.cargo || '',
          area: div,
          proveedor: e.proveedor,
          nombreRuta: rKey,
          nombreCurso: cKey,
          porcentaje: e.porcentaje,
          estado: e.estado,
          nota: e.nota
        });
      });

      var totalInscritos = enrollments.length;
      var completados = enrollments.filter(function(e) {
        return e.estado === 'Aprobado';
      }).length;

      // Calcular inscripciones que tienen algún avance (> 0)
      var inscritosConAvance = enrollments.filter(function(e) {
        return e.porcentaje > 0;
      }).length;

      return {
        success: true,
        mallasAdmin: mallasAdmin,
        progresoGeneral: progresoGeneral,
        totalInscritos: totalInscritos,
        totalCompletados: completados,
        totalPersonasUnicas: inscritosConAvance, // Usamos las inscripciones con avance para el cálculo
        totalColaboradores: totalInscritos       // Base de inscripciones totales
      };
    }

  } catch (err) {
    return { success: false, error: err.message };
  }
}

// ============================================================
// DEBUG: Muestra las columnas de cada hoja
// ============================================================

function debugHeaders() {
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  var result = {};
  var sheets = [SHEET_COLABORADORES, SHEET_DATOS_MALLA, SHEET_DATOS_CURSOS].concat(PROVIDER_TABS);
  sheets.forEach(function(name) {
    var sheet = ss.getSheetByName(name);
    if (sheet) {
      var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
      result[name] = headers.map(function(h, idx) {
        var col = String.fromCharCode(65 + (idx % 26));
        if (idx >= 26) col = String.fromCharCode(64 + Math.floor(idx / 26)) + col;
        return col + ': ' + h;
      });
    } else {
      result[name] = 'NO ENCONTRADA';
    }
  });
  return { success: true, headers: result };
}

// ============================================================
// RESPUESTA JSON/JSONP
// ============================================================

function _buildResponse(data, callback) {
  var json = JSON.stringify(data);
  if (callback) {
    return ContentService.createTextOutput(callback + '(' + json + ')')
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }
  return ContentService.createTextOutput(json)
    .setMimeType(ContentService.MimeType.JSON);
}
