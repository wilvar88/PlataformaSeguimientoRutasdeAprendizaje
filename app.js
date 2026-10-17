// =========================================================================
// CONFIGURACIÓN
// =========================================================================
const URL_GAS = 'https://script.google.com/macros/s/AKfycbw3Gqy9YrngSntwUt85sLmrS4woIPM6OehZezX199scsNLKikHMn60zChiXz3JZvAwHcA/exec';

let currentUser = null;
let cacheAdminMallas = null;
let currentModalPersonas = [];

// =========================================================================
// COMUNICACIÓN CON BACKEND (JSONP)
// =========================================================================
function callBackend(action, params) {
    return new Promise((resolve, reject) => {
        const callbackName = 'jsonp_cb_' + Math.round(100000 * Math.random());
        window[callbackName] = function(data) {
            delete window[callbackName];
            document.body.removeChild(script);
            resolve(data);
        };
        let url = URL_GAS + '?action=' + encodeURIComponent(action) + '&callback=' + callbackName;
        for (let key in params) {
            url += '&' + encodeURIComponent(key) + '=' + encodeURIComponent(params[key]);
        }
        const script = document.createElement('script');
        script.src = url;
        script.onerror = function() {
            delete window[callbackName];
            document.body.removeChild(script);
            reject(new Error('Error de red'));
        };
        document.body.appendChild(script);
    });
}

// =========================================================================
// LOGIN Y NAVEGACIÓN
// =========================================================================
function handleEnter(e) { if (e.key === 'Enter') iniciarSesion(); }

function iniciarSesion() {
    const docInput = document.getElementById('doc-input').value.trim();
    const errorMsg = document.getElementById('login-error');
    const loader   = document.getElementById('login-loader');
    const btn      = document.querySelector('.login-box .btn-primary');

    if (!docInput) {
        showError(errorMsg, 'Por favor ingresa tu documento.');
        return;
    }

    errorMsg.style.display = 'none';
    loader.style.display = 'block';
    btn.style.display = 'none';

    callBackend('validarUsuario', { documento: docInput })
        .then(res => {
            loader.style.display = 'none';
            btn.style.display = 'block';
            if (res.success) {
                currentUser = res.usuario;
                // DEBUG: Mostrar info de columnas detectadas (quitar después)
                if (res.usuario._debug) {
                    console.log('=== DEBUG PERFIL ===');
                    console.log('Columna Perfil idx:', res.usuario._debug.perfilIdx, '- Header:', res.usuario._debug.headerPerfilCol, '- Valor:', res.usuario._debug.perfilVal);
                    console.log('Columna Rol idx:', res.usuario._debug.rolIdx, '- Header:', res.usuario._debug.headerRolCol, '- Valor:', res.usuario._debug.rolVal);
                    console.log('Perfil detectado:', res.usuario.perfil);
                    console.log('====================');
                }
                mostrarApp();
            } else {
                showError(errorMsg, res.error || 'Error al validar.');
            }
        }).catch(() => {
            loader.style.display = 'none';
            btn.style.display = 'block';
            showError(errorMsg, 'Error de conexión con el servidor.');
        });
}

function showError(el, msg) {
    el.innerText = msg;
    el.style.display = 'block';
}

function cerrarSesion() {
    currentUser = null;
    cacheAdminMallas = null;
    document.getElementById('doc-input').value = '';
    document.getElementById('login-view').classList.add('active');
    document.getElementById('app-view').classList.remove('active');
    document.getElementById('student-content').innerHTML = '';
    document.getElementById('admin-content').innerHTML = '';
}

function switchTab(tabName) {
    document.querySelectorAll('.nav-tab').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));

    if (tabName === 'mis-rutas') {
        document.getElementById('tab-btn-mis-rutas').classList.add('active');
        document.getElementById('tab-mis-rutas').classList.add('active');
    } else if (tabName === 'vision-general') {
        document.getElementById('tab-btn-vision-general').classList.add('active');
        document.getElementById('tab-vision-general').classList.add('active');
    }
}

function mostrarApp() {
    document.getElementById('login-view').classList.remove('active');
    document.getElementById('app-view').classList.add('active');
    document.getElementById('user-name').innerText = currentUser.nombre;
    document.getElementById('user-profile').innerText = currentUser.perfil;

    const btnAdmin = document.getElementById('tab-btn-vision-general');
    if (currentUser.perfil === 'Administrador') {
        btnAdmin.style.display = 'inline-block';
        switchTab('vision-general');
    } else {
        btnAdmin.style.display = 'none';
        switchTab('mis-rutas');
    }

    cargarDatos();
}

function cargarDatos() {
    const appLoader = document.getElementById('app-loader');
    appLoader.style.display = 'block';

    const reqPersonal = callBackend('obtenerMallas', {
        documento: currentUser.documento,
        perfil: 'Estudiante',
        permisos: ''
    });

    let reqAdmin = Promise.resolve(null);
    if (currentUser.perfil === 'Administrador') {
        reqAdmin = callBackend('obtenerMallas', {
            documento: currentUser.documento,
            perfil: 'Administrador',
            permisos: currentUser.permisos
        });
    }

    Promise.all([reqPersonal, reqAdmin])
        .then(([resPersonal, resAdmin]) => {
            appLoader.style.display = 'none';

            if (resPersonal && resPersonal.success) {
                renderEstudiante(resPersonal.mallas, resPersonal);
            }

            if (resAdmin && resAdmin.success) {
                cacheAdminMallas = resAdmin.mallasAdmin;
                renderAdmin(resAdmin.mallasAdmin, resAdmin);
            }
        })
        .catch(err => {
            appLoader.style.display = 'none';
            alert('Error de conexión cargando mallas.');
        });
}

// =========================================================================
// HELPERS E IMÁGENES
// =========================================================================
function toggleAcordeon(id) {
    const el = document.getElementById(id);
    if (!el) return;
    const isOpen = el.classList.toggle('open');
    
    // Cambiar estado y texto/flecha del botón
    const btn = el.previousElementSibling ? el.previousElementSibling.querySelector('.btn-toggle-detalle') : null;
    if (btn) {
        btn.classList.toggle('open', isOpen);
        if (isOpen) {
            btn.innerHTML = btn.innerHTML.replace('▼', '▲').replace('Ver ', 'Ocultar ');
        } else {
            btn.innerHTML = btn.innerHTML.replace('▲', '▼').replace('Ocultar ', 'Ver ');
        }
    }
}

function toggleDivisionSection(cleanDivKey) {
    const el = document.getElementById(`div-section-${cleanDivKey}`);
    if (el) {
        el.classList.toggle('collapsed');
    }
}

function normalizarEnlaceImagen(url) {
    if (!url) return '';
    const match = url.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
    if (match && match[1]) {
        return `https://drive.google.com/thumbnail?id=${match[1]}&sz=w800`;
    }
    return url;
}

function handleImageError(imgEl) {
    imgEl.parentElement.innerHTML = `<div class="card-img-placeholder">📚</div>`;
}

function formatearFecha(fechaStr) {
    if (!fechaStr) return '';
    try {
        const d = new Date(fechaStr);
        if (isNaN(d.getTime())) return String(fechaStr).split('T')[0];
        return d.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' });
    } catch(e) {
        return fechaStr;
    }
}

function buildProgressRing(pct, size) {
    const r = (size - 8) / 2;
    const c = 2 * Math.PI * r;
    const offset = c - (pct / 100) * c;
    return `
        <svg width="${size}" height="${size}" class="progress-ring" viewBox="0 0 ${size} ${size}">
            <circle cx="${size/2}" cy="${size/2}" r="${r}" stroke="rgba(255,255,255,0.08)" stroke-width="6" fill="none"/>
            <circle cx="${size/2}" cy="${size/2}" r="${r}" stroke="url(#grad)" stroke-width="6" fill="none"
                stroke-dasharray="${c}" stroke-dashoffset="${offset}" stroke-linecap="round"
                style="transform: rotate(-90deg); transform-origin: center; transition: stroke-dashoffset 1s ease-out;"/>
            <defs><linearGradient id="grad" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stop-color="#CDD400"/><stop offset="100%" stop-color="#e8ef00"/>
            </linearGradient></defs>
            <text x="50%" y="50%" text-anchor="middle" dy=".35em" fill="#fff" font-size="${size*0.22}px" font-weight="700">${pct}%</text>
        </svg>`;
}

function getBadgeEstado(estado) {
    const s = String(estado || '').toLowerCase();
    if (s.indexOf('aprob') !== -1 || s.indexOf('complet') !== -1 || s.indexOf('certificad') !== -1) {
        return `<span class="badge-estado badge-aprobado">Aprobado</span>`;
    }
    if (s.indexOf('reprob') !== -1 || s.indexOf('no aprob') !== -1) {
        return `<span class="badge-estado badge-reprobado">No Aprobado</span>`;
    }
    if (s.indexOf('curso') !== -1 || s.indexOf('progreso') !== -1) {
        return `<span class="badge-estado badge-encurso">En Curso</span>`;
    }
    return `<span class="badge-estado badge-inscrito">Inscrito</span>`;
}

// =========================================================================
// RENDER MIS RUTAS (ESTUDIANTE)
// =========================================================================
function renderEstudiante(mallasObj, stats) {
    const container = document.getElementById('student-content');
    container.innerHTML = '';

    if (!mallasObj || Object.keys(mallasObj).length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <div class="empty-state-icon">📚</div>
                <p>No tienes mallas asignadas actualmente con avance registrado.</p>
            </div>`;
        return;
    }

    const totalCursos = stats.totalCursos || 0;
    const progresoGral = stats.progresoGeneral || 0;

    let summaryHTML = `
        <div class="summary-banner glass-card">
            <div class="summary-left">
                ${buildProgressRing(progresoGral, 100)}
            </div>
            <div class="summary-right">
                <div class="summary-title">Avance General Personal</div>
                <div class="summary-detail">
                    <span>${totalCursos} curso${totalCursos !== 1 ? 's' : ''} registrado${totalCursos !== 1 ? 's' : ''} en tus mallas</span>
                </div>
                <div class="progress-container" style="margin-top:8px;">
                    <div class="progress-bar-bg" style="height:8px;">
                        <div class="progress-bar-fill" style="width:${progresoGral}%;"></div>
                    </div>
                </div>
            </div>
        </div>`;

    let grid = '<div class="grid-cards">';
    let count = 0;
    for (const key in mallasObj) {
        const malla = mallasObj[key];
        if (!malla.cursos || malla.cursos.length === 0) continue;

        const idAcordeon = 'acordeon-est-' + count++;
        let totalPct = 0;
        let completadosCount = 0;

        malla.cursos.forEach(c => {
            const p = parseFloat(c.porcentaje || 0);
            totalPct += p;
            if (p >= 100 || c.estado === 'Aprobado') completadosCount++;
        });

        const numCursos = malla.cursos.length;
        const promedio = numCursos > 0 ? Math.round(totalPct / numCursos) : 0;
        const imgUrl = normalizarEnlaceImagen(malla.fotoRuta);

        grid += `
        <div class="glass-card" style="animation-delay: ${count * 0.08}s">
            <div class="card-img-container">
                ${imgUrl ? `<img src="${imgUrl}" class="card-img" alt="${malla.nombreRuta}" onerror="handleImageError(this)">` : `<div class="card-img-placeholder">📚</div>`}
                <div class="card-img-overlay"></div>
            </div>
            <div class="card-content">
                <div class="card-top-badges">
                    <span class="proveedor-badge">${malla.proveedor || 'General'}</span>
                    ${malla.estado ? `<span class="estado-badge ${malla.estado.toLowerCase() === 'activo' ? 'activo' : ''}">${malla.estado}</span>` : ''}
                </div>
                <div class="ruta-titulo">${malla.nombreRuta}</div>
                
                ${(malla.fechaInicio || malla.fechaFin) ? `
                    <div class="ruta-fechas">
                        📅 ${formatearFecha(malla.fechaInicio) || 'N/A'} al ${formatearFecha(malla.fechaFin) || 'N/A'}
                    </div>
                ` : ''}
                
                <div class="ruta-subtitle">🎯 ${completadosCount}/${numCursos} completados (${promedio}%)</div>

                <div class="progress-container">
                    <div class="progress-label">
                        <span>Progreso de Ruta</span>
                        <span>${promedio}%</span>
                    </div>
                    <div class="progress-bar-bg">
                        <div class="progress-bar-fill" style="width: ${promedio}%"></div>
                    </div>
                </div>

                <button class="btn-toggle-detalle" onclick="toggleAcordeon('${idAcordeon}')">
                    Ver Cursos (${numCursos}) ▼
                </button>
            </div>

            <div id="${idAcordeon}" class="cursos-detalle">
                ${malla.cursos.map(c => `
                    <div class="curso-card-clickable" style="cursor:default;">
                        <div class="curso-card-header">
                            <span class="curso-card-title">${c.nombreCurso}</span>
                            ${getBadgeEstado(c.estado)}
                        </div>
                        <div class="progress-container" style="margin-top:6px;">
                            <div class="progress-label" style="font-size:0.75rem;">
                                <span>Avance: ${c.porcentaje}%</span>
                                ${c.nota !== null && c.nota !== undefined && c.nota !== '' ? `<span>Nota: ${c.nota}</span>` : ''}
                            </div>
                            <div class="progress-bar-bg" style="height:4px;">
                                <div class="progress-bar-fill" style="width: ${c.porcentaje || 0}%"></div>
                            </div>
                        </div>
                    </div>
                `).join('')}
            </div>
        </div>`;
    }
    grid += '</div>';

    container.innerHTML = summaryHTML + grid;
}

// =========================================================================
// RENDER VISIÓN GENERAL (ADMINISTRADOR DE ENCABEZADOS Y MODAL)
// =========================================================================
function renderAdmin(mallasAdminObj, stats) {
    const container = document.getElementById('admin-content');
    container.innerHTML = '';

    if (!mallasAdminObj || Object.keys(mallasAdminObj).length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <div class="empty-state-icon">📊</div>
                <p>No hay datos disponibles con tus permisos actuales.</p>
            </div>`;
        return;
    }

    const totalInscritos = stats.totalInscritos || 0;
    const totalCompletados = stats.totalCompletados || 0;
    const progresoGral = stats.progresoGeneral || 0;
    const pctCompletados = totalInscritos > 0 ? Math.round((totalCompletados / totalInscritos) * 100) : 0;
    const totalPersonas = stats.totalPersonasUnicas || 0;
    const totalColaboradores = stats.totalColaboradores || 0;
    const pctParticipacion = totalColaboradores > 0 ? Math.round((totalPersonas / totalColaboradores) * 100) : 0;

    let summaryHTML = `
        <div class="admin-kpi-grid">
            <div class="kpi-card kpi-inscripciones">
                <div class="kpi-icon-wrap"><span class="kpi-icon">📋</span></div>
                <div class="kpi-body">
                    <div class="kpi-percentage">${totalInscritos.toLocaleString()}</div>
                    <div class="kpi-label">Inscripciones Totales</div>
                    <div class="kpi-sub-detail">Registros en todas las rutas</div>
                </div>
            </div>
            <div class="kpi-card kpi-participacion">
                <div class="kpi-icon-wrap"><span class="kpi-icon">👥</span></div>
                <div class="kpi-body">
                    <div class="kpi-percentage">${pctParticipacion}<span class="kpi-pct-symbol">%</span></div>
                    <div class="kpi-label">Participación</div>
                    <div class="kpi-sub-detail">${totalPersonas.toLocaleString()} de ${totalColaboradores.toLocaleString()} inscripciones</div>
                    <div class="kpi-bar-track"><div class="kpi-bar-fill kpi-fill-participacion" style="width:${pctParticipacion}%"></div></div>
                </div>
            </div>
            <div class="kpi-card kpi-aprobacion">
                <div class="kpi-icon-wrap"><span class="kpi-icon">✅</span></div>
                <div class="kpi-body">
                    <div class="kpi-percentage">${pctCompletados}<span class="kpi-pct-symbol">%</span></div>
                    <div class="kpi-label">Aprobaciones Totales</div>
                    <div class="kpi-sub-detail">${totalCompletados.toLocaleString()} de ${totalInscritos.toLocaleString()} inscripciones</div>
                    <div class="kpi-bar-track"><div class="kpi-bar-fill kpi-fill-aprobacion" style="width:${pctCompletados}%"></div></div>
                </div>
            </div>
        </div>`;

    const tienePermisosTodos = currentUser.permisos && currentUser.permisos.toUpperCase() === 'TODOS';
    if (tienePermisosTodos) {
        summaryHTML += `
        <div class="glass-card admin-chart-card" style="margin-bottom: 28px; padding: 24px; animation: fadeInUp 0.7s ease-out; position: relative;">
            <div class="chart-header" style="margin-bottom: 16px;">
                <h3 style="color: var(--verde-limon); font-size: 1.1rem; font-weight: 700; display: flex; align-items: center; gap: 8px;">
                    📈 Desempeño Comparativo por Gerencia
                </h3>
                <p style="font-size: 0.76rem; color: var(--text-muted); margin-top: 3px;">
                    Gráfico comparativo del % de Participación (Barras) y Aprobación (Línea) de cada área.
                </p>
            </div>
            <div class="chart-wrapper" style="position: relative; height: 260px; width: 100%;">
                <canvas id="chart-areas"></canvas>
            </div>
        </div>`;
    }

    container.innerHTML = summaryHTML;

    if (tienePermisosTodos) {
        setTimeout(() => {
            const ctx = document.getElementById('chart-areas');
            if (!ctx) return;

            const labels = [];
            const participacionData = [];
            const aprobacionData = [];

            for (const divKey in mallasAdminObj) {
                const divData = mallasAdminObj[divKey];
                let divTotalInscritos = 0;
                let divTotalCompletados = 0;
                let divInscritosConAvance = 0;

                for (const rKey in divData.rutas) {
                    const ruta = divData.rutas[rKey];
                    for (const cKey in ruta.cursos) {
                        const curso = ruta.cursos[cKey];
                        curso.personas.forEach(p => {
                            divTotalInscritos++;
                            if (p.estado === 'Aprobado') divTotalCompletados++;
                            if (parseFloat(p.porcentaje || 0) > 0) divInscritosConAvance++;
                        });
                    }
                }

                const divParticipacionPct = divTotalInscritos > 0 ? Math.round((divInscritosConAvance / divTotalInscritos) * 100) : 0;
                const divAprobacionPct = divTotalInscritos > 0 ? Math.round((divTotalCompletados / divTotalInscritos) * 100) : 0;

                labels.push(divData.nombreDivision);
                participacionData.push(divParticipacionPct);
                aprobacionData.push(divAprobacionPct);
            }

            new Chart(ctx, {
                data: {
                    labels: labels,
                    datasets: [
                        {
                            type: 'line',
                            label: 'Aprobación (%)',
                            data: aprobacionData,
                            borderColor: '#CDD400',
                            backgroundColor: 'rgba(205, 212, 0, 0.2)',
                            borderWidth: 3,
                            pointBackgroundColor: '#CDD400',
                            pointBorderColor: '#ffffff',
                            pointHoverRadius: 7,
                            pointRadius: 5,
                            tension: 0.3,
                            yAxisID: 'y'
                        },
                        {
                            type: 'bar',
                            label: 'Participación (%)',
                            data: participacionData,
                            backgroundColor: 'rgba(167, 139, 250, 0.5)',
                            borderColor: '#a78bfa',
                            borderWidth: 1.5,
                            borderRadius: 6,
                            barPercentage: 0.45,
                            yAxisID: 'y'
                        }
                    ]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: {
                            labels: {
                                color: 'rgba(255, 255, 255, 0.8)',
                                font: { family: 'Inter', weight: '600', size: 11 }
                            }
                        },
                        tooltip: {
                            backgroundColor: 'rgba(0, 13, 31, 0.95)',
                            titleFont: { family: 'Inter', weight: '700' },
                            bodyFont: { family: 'Inter' },
                            borderColor: 'rgba(255,255,255,0.1)',
                            borderWidth: 1,
                            callbacks: {
                                label: function(context) {
                                    return ` ${context.dataset.label}: ${context.raw}%`;
                                }
                            }
                        }
                    },
                    scales: {
                        x: {
                            grid: { display: false },
                            ticks: {
                                color: 'rgba(255, 255, 255, 0.6)',
                                font: { family: 'Inter', size: 10 }
                            }
                        },
                        y: {
                            min: 0,
                            max: 100,
                            grid: {
                                color: 'rgba(255, 255, 255, 0.08)'
                            },
                            ticks: {
                                color: 'rgba(255, 255, 255, 0.6)',
                                font: { family: 'Inter', size: 10 },
                                callback: function(value) { return value + '%'; }
                            }
                        }
                    }
                }
            });
        }, 150);
    }

    let countRuta = 0;
    for (const divKey in mallasAdminObj) {
        const divData = mallasAdminObj[divKey];
        const cleanDivKey = divKey.replace(/[^a-zA-Z0-9]/g, '_');
        const divEl = document.createElement('div');
        divEl.id = `div-section-${cleanDivKey}`;
        divEl.className = 'division-section collapsed'; // Iniciamos colapsado por defecto

        // Calcular estadísticas de la División basándonos en inscripciones
        let divTotalInscritos = 0;
        let divTotalCompletados = 0;
        let divInscritosConAvance = 0;

        for (const rKey in divData.rutas) {
            const ruta = divData.rutas[rKey];
            for (const cKey in ruta.cursos) {
                const curso = ruta.cursos[cKey];
                curso.personas.forEach(p => {
                    divTotalInscritos++;
                    if (p.estado === 'Aprobado') divTotalCompletados++;
                    if (parseFloat(p.porcentaje || 0) > 0) divInscritosConAvance++;
                });
            }
        }

        const divParticipacionPct = divTotalInscritos > 0 ? Math.round((divInscritosConAvance / divTotalInscritos) * 100) : 0;
        const divAprobacionPct = divTotalInscritos > 0 ? Math.round((divTotalCompletados / divTotalInscritos) * 100) : 0;

        // Encabezado de la División con métricas en línea y toggle de colapso al hacer clic
        divEl.innerHTML = `
            <div class="division-header-banner" onclick="toggleDivisionSection('${cleanDivKey}')" style="cursor: pointer;">
                <div class="division-title-text">
                    📍 ${divData.nombreDivision}
                    <span class="collapse-icon">▼</span>
                </div>
                <div class="division-metrics-group">
                    <div class="division-metric-pill">
                        <span class="metric-pill-val text-verde">${divParticipacionPct}%</span>
                        <span class="metric-pill-lbl">Participación (${divInscritosConAvance}/${divTotalInscritos})</span>
                    </div>
                    <div class="division-metric-pill">
                        <span class="metric-pill-val">${divAprobacionPct}%</span>
                        <span class="metric-pill-lbl">Aprobación (${divTotalCompletados}/${divTotalInscritos})</span>
                    </div>
                </div>
            </div>`;

        let grid = '<div class="division-content"><div class="grid-cards">';
        const rutas = divData.rutas;

        for (const rKey in rutas) {
            const rutaInfo = rutas[rKey];
            const idAcordeon = `acordeon-adm-ruta-${countRuta++}`;
            const imgUrl = normalizarEnlaceImagen(rutaInfo.fotoRuta);

            let rutaInscritos = 0;
            let rutaCompletados = 0;
            let rutaSumaPct = 0;
            const listaCursos = [];

            for (const cKey in rutaInfo.cursos) {
                const cursoObj = rutaInfo.cursos[cKey];
                let cInscritos = cursoObj.personas.length;
                let cCompletados = 0;
                let cSumaPct = 0;

                cursoObj.personas.forEach(p => {
                    cSumaPct += parseFloat(p.porcentaje || 0);
                    if (p.estado === 'Aprobado') cCompletados++;
                });

                rutaInscritos += cInscritos;
                rutaCompletados += cCompletados;
                rutaSumaPct += cSumaPct;

                const cPromedioAvance = cInscritos > 0 ? Math.round(cSumaPct / cInscritos) : 0;
                const cTasaAprobacion = cInscritos > 0 ? Math.round((cCompletados / cInscritos) * 100) : 0;

                listaCursos.push({
                    nombreCurso: cursoObj.nombreCurso,
                    inscritos: cInscritos,
                    completados: cCompletados,
                    promedioAvance: cPromedioAvance,
                    tasaAprobacion: cTasaAprobacion,
                    personas: cursoObj.personas,
                    division: divKey,
                    ruta: rKey
                });
            }

            const rutaPromedio = rutaInscritos > 0 ? Math.round(rutaSumaPct / rutaInscritos) : 0;

            grid += `
            <div class="glass-card">
                <div class="card-img-container">
                    ${imgUrl ? `<img src="${imgUrl}" class="card-img" alt="${rutaInfo.nombreRuta}" onerror="handleImageError(this)">` : `<div class="card-img-placeholder">🏢</div>`}
                    <div class="card-img-overlay"></div>
                </div>
                <div class="card-content">
                    <div class="card-top-badges">
                        <span class="proveedor-badge">${rutaInfo.proveedor || 'General'}</span>
                        ${rutaInfo.estado ? `<span class="estado-badge ${rutaInfo.estado.toLowerCase() === 'activo' ? 'activo' : ''}">${rutaInfo.estado}</span>` : ''}
                    </div>
                    <div class="ruta-titulo">${rutaInfo.nombreRuta}</div>

                    ${(rutaInfo.fechaInicio || rutaInfo.fechaFin) ? `
                        <div class="ruta-fechas">
                            📅 ${formatearFecha(rutaInfo.fechaInicio) || 'N/A'} al ${formatearFecha(rutaInfo.fechaFin) || 'N/A'}
                        </div>
                    ` : ''}

                    <div class="ruta-subtitle">🎯 ${rutaCompletados}/${rutaInscritos} completados (${rutaPromedio}%)</div>

                    <div class="progress-container">
                        <div class="progress-label">
                            <span>Avance Promedio Ruta</span>
                            <span>${rutaPromedio}%</span>
                        </div>
                        <div class="progress-bar-bg">
                            <div class="progress-bar-fill" style="width: ${rutaPromedio}%"></div>
                        </div>
                    </div>

                    <button class="btn-toggle-detalle" onclick="toggleAcordeon('${idAcordeon}')">
                        Ver ${listaCursos.length} Curso${listaCursos.length !== 1 ? 's' : ''} ▼
                    </button>
                </div>

                <div id="${idAcordeon}" class="cursos-detalle">
                    ${listaCursos.map((c, idx) => `
                        <div class="curso-card-clickable" onclick="abrirModalCurso('${divKey}', '${rKey}', '${c.nombreCurso}')">
                            <div class="curso-card-header">
                                <span class="curso-card-title">📖 ${c.nombreCurso}</span>
                                <span class="badge-estado badge-encurso" style="font-size:0.68rem;">👤 ${c.inscritos} Registrados</span>
                            </div>
                            <div class="curso-card-stats">
                                <span>📊 Participación: <strong>${c.promedioAvance}%</strong></span>
                                <span>✅ Aprobación: <strong>${c.tasaAprobacion}% (${c.completados}/${c.inscritos})</strong></span>
                            </div>
                            <div class="progress-bar-bg" style="height:4px;">
                                <div class="progress-bar-fill" style="width: ${c.promedioAvance}%"></div>
                            </div>
                            <div style="font-size:0.7rem; color:var(--verde-limon); text-align:right; margin-top:6px; font-weight:600;">
                                Clic para ver personas ➔
                            </div>
                        </div>
                    `).join('')}
                </div>
            </div>`;
        }

        grid += '</div></div>';
        divEl.innerHTML += grid;
        container.appendChild(divEl);
    }
}

// =========================================================================
// POPUP / MODAL DE COLABORADORES POR CURSO
// =========================================================================
function abrirModalCurso(divisionKey, rutaKey, cursoKey) {
    if (!cacheAdminMallas || !cacheAdminMallas[divisionKey]) return;

    const ruta = cacheAdminMallas[divisionKey].rutas[rutaKey];
    if (!ruta || !ruta.cursos[cursoKey]) return;

    const curso = ruta.cursos[cursoKey];
    currentModalPersonas = curso.personas || [];

    document.getElementById('modal-ruta-nombre').innerText = `${rutaKey} · ${divisionKey}`;
    document.getElementById('modal-curso-nombre').innerText = cursoKey;

    // Métricas del Modal
    let nAprobados = 0, nEnCurso = 0, nInscritos = 0, nReprobados = 0;
    currentModalPersonas.forEach(p => {
        if (p.estado === 'Aprobado') nAprobados++;
        else if (p.estado === 'En Curso') nEnCurso++;
        else if (p.estado === 'No Aprobado') nReprobados++;
        else nInscritos++;
    });

    document.getElementById('modal-stat-total').innerText = currentModalPersonas.length;
    document.getElementById('modal-stat-aprobados').innerText = nAprobados;
    document.getElementById('modal-stat-encurso').innerText = nEnCurso;
    document.getElementById('modal-stat-inscritos').innerText = nInscritos;
    document.getElementById('modal-stat-reprobados').innerText = nReprobados;

    document.getElementById('modal-search-input').value = '';
    renderPersonasModal(currentModalPersonas);

    document.getElementById('modal-curso').classList.add('active');
}

function cerrarModal() {
    document.getElementById('modal-curso').classList.remove('active');
}

function cerrarModalAfuera(e) {
    if (e.target.id === 'modal-curso') cerrarModal();
}

function renderPersonasModal(lista) {
    const listEl = document.getElementById('modal-person-list');
    listEl.innerHTML = '';

    if (!lista || lista.length === 0) {
        listEl.innerHTML = `<div class="empty-state" style="padding:30px;"><p>No se encontraron personas con este criterio.</p></div>`;
        return;
    }

    listEl.innerHTML = lista.map(p => {
        const inicial = p.nombre ? p.nombre.charAt(0).toUpperCase() : '👤';
        return `
        <div class="person-row">
            <div class="person-info">
                <div class="person-avatar">${inicial}</div>
                <div>
                    <div class="person-name">${p.nombre}</div>
                    <div class="person-doc">Cédula: ${p.documento}</div>
                </div>
            </div>
            <div class="person-status-box">
                <div class="person-progress-text">${p.porcentaje || 0}%</div>
                ${getBadgeEstado(p.estado)}
            </div>
        </div>`;
    }).join('');
}

function filtrarPersonasModal() {
    const q = document.getElementById('modal-search-input').value.toLowerCase().trim();
    if (!q) {
        renderPersonasModal(currentModalPersonas);
        return;
    }
    const filtrados = currentModalPersonas.filter(p =>
        (p.nombre && p.nombre.toLowerCase().includes(q)) ||
        (p.documento && String(p.documento).includes(q))
    );
    renderPersonasModal(filtrados);
}

// =========================================================================
// EXPORTACIÓN A EXCEL (DESCARGA DE ÁREAS PARA ADMINISTRADORES)
// =========================================================================
function descargarExcelAdmin() {
    if (!cacheAdminMallas || Object.keys(cacheAdminMallas).length === 0) {
        alert('No hay datos disponibles de áreas para exportar.');
        return;
    }

    const filasExcel = [];

    for (const divKey in cacheAdminMallas) {
        const div = cacheAdminMallas[divKey];
        if (!div.rutas) continue;
        for (const rKey in div.rutas) {
            const ruta = div.rutas[rKey];
            if (!ruta.cursos) continue;
            for (const cKey in ruta.cursos) {
                const curso = ruta.cursos[cKey];
                if (!curso.personas) continue;
                curso.personas.forEach(p => {
                    filasExcel.push({
                        "Cédula": p.documento || '',
                        "Nombre": p.nombre || '',
                        "Cargo": p.cargo || '',
                        "Área": p.area || divKey || '',
                        "Proveedor": p.proveedor || ruta.proveedor || '',
                        "Nombre de Ruta de Aprendizaje": p.nombreRuta || rKey || '',
                        "Nombre del curso": p.nombreCurso || cKey || '',
                        "Avance": (p.porcentaje !== undefined && p.porcentaje !== null) ? (p.porcentaje + '%') : '0%',
                        "Nota": (p.nota !== null && p.nota !== undefined && p.nota !== '') ? p.nota : '',
                        "Estado de aprobación": p.estado || ''
                    });
                });
            }
        }
    }

    if (filasExcel.length === 0) {
        alert('No se encontraron registros de colaboradores para las áreas visibles.');
        return;
    }

    const fechaHoy = new Date().toISOString().split('T')[0];
    const nombreArchivo = `Reporte_Capacitacion_Areas_${fechaHoy}.xlsx`;

    // 1. Exportación preferida usando SheetJS (.xlsx)
    if (typeof XLSX !== 'undefined') {
        const ws = XLSX.utils.json_to_sheet(filasExcel);
        
        // Configurar ancho inteligente para cada columna
        ws['!cols'] = [
            { wch: 14 }, // Cédula
            { wch: 30 }, // Nombre
            { wch: 25 }, // Cargo
            { wch: 25 }, // Área
            { wch: 15 }, // Proveedor
            { wch: 35 }, // Nombre de Ruta de Aprendizaje
            { wch: 35 }, // Nombre del curso
            { wch: 10 }, // Avance
            { wch: 10 }, // Nota
            { wch: 22 }  // Estado de aprobación
        ];

        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Reporte Capacitación");
        XLSX.writeFile(wb, nombreArchivo);
    } else {
        // 2. Respaldo a CSV con codificación UTF-8 BOM
        const headers = ["Cédula", "Nombre", "Cargo", "Área", "Proveedor", "Nombre de Ruta de Aprendizaje", "Nombre del curso", "Avance", "Nota", "Estado de aprobación"];
        let csvContent = "\uFEFF" + headers.join(";") + "\n";

        filasExcel.forEach(row => {
            const line = [
                `"${row["Cédula"]}"`,
                `"${row["Nombre"]}"`,
                `"${row["Cargo"]}"`,
                `"${row["Área"]}"`,
                `"${row["Proveedor"]}"`,
                `"${row["Nombre de Ruta de Aprendizaje"]}"`,
                `"${row["Nombre del curso"]}"`,
                `"${row["Avance"]}"`,
                `"${row["Nota"]}"`,
                `"${row["Estado de aprobación"]}"`
            ].join(";");
            csvContent += line + "\n";
        });

        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement("a");
        link.href = URL.createObjectURL(blob);
        link.setAttribute("download", `Reporte_Capacitacion_Areas_${fechaHoy}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }
}

