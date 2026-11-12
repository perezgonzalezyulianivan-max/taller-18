"use strict";

/* ==========================================================================
   TALLER 18 · SISTEMA DE RESERVAS Y CITAS
   Universidad de Caldas · Programación Web Creativa II

   Regla de oro para las fechas:
   las fechas se guardan como texto "AAAA-MM-DD" y se construyen siempre con
   new Date(anio, mes, dia), que usa la zona horaria local. Nunca se usa
   new Date("AAAA-MM-DD") ni toISOString() para fechas de calendario, porque
   interpretan el texto como UTC y pueden mostrar el día anterior.
   ========================================================================== */

/* 1. CONSTANTES DE CONFIGURACIÓN ------------------------------------------ */
const CLAVE_CLIENTES = "taller18_clientes";
const CLAVE_RESERVAS = "taller18_reservas";

const HORA_INICIO_MIN = 8 * 60;      // 8:00 a. m. expresado en minutos
const HORA_FIN_MIN = 17 * 60;        // 5:00 p. m. expresado en minutos
const INTERVALO_MIN = 30;            // duración de cada cita en minutos
const BLOQUEAR_HORAS_PASADAS = true; // en el día actual, bloquea horas ya vencidas
const MAX_OBSERVACIONES = 250;

const SERVICIOS = [
    "Consulta general",
    "Odontología",
    "Fisioterapia",
    "Psicología",
    "Nutrición",
    "Exámenes de laboratorio"
];

const ESTADOS = {
    pendiente: "Pendiente",
    confirmada: "Confirmada",
    cancelada: "Cancelada"
};

const ORDEN_ESTADOS = { pendiente: 0, confirmada: 1, cancelada: 2 };
const NOMBRES_DIAS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];

/* 2. ESTADO GLOBAL DE LA APLICACIÓN --------------------------------------- */
const app = {
    clientes: [],
    reservas: [],
    vista: { anio: 0, mes: 0 },   // mes visible en el calendario (mes de 0 a 11)
    fechaSeleccionada: "",        // fecha en formato AAAA-MM-DD
    editandoReservaId: null,
    editandoClienteId: null
};

let temporizadorMensaje = null;

/* 3. UTILIDADES GENERALES ------------------------------------------------- */
function $(id) {
    return document.getElementById(id);
}

function crearElemento(etiqueta, clase, texto) {
    const elemento = document.createElement(etiqueta);
    if (clase) {
        elemento.className = clase;
    }
    if (texto !== undefined) {
        elemento.textContent = texto;
    }
    return elemento;
}

function agregarOpcion(select, valor, texto) {
    const opcion = document.createElement("option");
    opcion.value = valor;
    opcion.textContent = texto;
    select.appendChild(opcion);
}

function generarId(prefijo) {
    return prefijo + "_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

function normalizarTexto(texto) {
    return String(texto || "")
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .trim();
}

function capitalizar(texto) {
    return texto.charAt(0).toUpperCase() + texto.slice(1);
}

function pluralizar(cantidad, singular, plural) {
    return cantidad + " " + (cantidad === 1 ? singular : plural);
}

/* 4. UTILIDADES DE FECHA Y HORA ------------------------------------------- */
function rellenar(numero) {
    return String(numero).padStart(2, "0");
}

// Convierte un objeto Date local en texto AAAA-MM-DD.
function formatearFechaISO(fecha) {
    return fecha.getFullYear() + "-" + rellenar(fecha.getMonth() + 1) + "-" + rellenar(fecha.getDate());
}

// Construye el texto AAAA-MM-DD a partir de año, mes (0 a 11) y día.
function construirFechaISO(anio, mes, dia) {
    return anio + "-" + rellenar(mes + 1) + "-" + rellenar(dia);
}

// Convierte AAAA-MM-DD en un Date local (a las 00:00 de la zona del usuario).
function parsearFechaISO(texto) {
    const partes = texto.split("-").map(Number);
    return new Date(partes[0], partes[1] - 1, partes[2]);
}

// Verifica el formato y que la fecha exista realmente (ej.: rechaza 2026-02-30).
function esFechaISOValida(texto) {
    if (typeof texto !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(texto)) {
        return false;
    }
    return formatearFechaISO(parsearFechaISO(texto)) === texto;
}

function obtenerHoyISO() {
    return formatearFechaISO(new Date());
}

function sumarDiasISO(fechaISO, dias) {
    const base = parsearFechaISO(fechaISO);
    return formatearFechaISO(new Date(base.getFullYear(), base.getMonth(), base.getDate() + dias));
}

function formatearFechaLarga(fechaISO) {
    const texto = parsearFechaISO(fechaISO).toLocaleDateString("es-CO", {
        weekday: "long",
        day: "numeric",
        month: "long",
        year: "numeric"
    });
    return capitalizar(texto);
}

function formatearFechaCorta(fechaISO) {
    const partes = fechaISO.split("-");
    return partes[2] + "/" + partes[1] + "/" + partes[0];
}

function nombreMes(anio, mes) {
    const texto = new Date(anio, mes, 1).toLocaleDateString("es-CO", {
        month: "long",
        year: "numeric"
    });
    return capitalizar(texto);
}

// Convierte "14:30" en "2:30 p. m.".
function formatearHora(hora) {
    const partes = hora.split(":").map(Number);
    const sufijo = partes[0] >= 12 ? "p. m." : "a. m.";
    const hora12 = partes[0] % 12 === 0 ? 12 : partes[0] % 12;
    return hora12 + ":" + rellenar(partes[1]) + " " + sufijo;
}

/* 5. PERSISTENCIA CON LOCALSTORAGE ---------------------------------------- */
function leerLocalStorage(clave) {
    try {
        const texto = localStorage.getItem(clave);
        if (!texto) {
            return [];
        }
        const datos = JSON.parse(texto);
        return Array.isArray(datos) ? datos : [];
    } catch (error) {
        console.error("No fue posible leer " + clave + ":", error);
        return [];
    }
}

function escribirLocalStorage(clave, datos) {
    try {
        localStorage.setItem(clave, JSON.stringify(datos));
        return true;
    } catch (error) {
        console.error("No fue posible guardar " + clave + ":", error);
        mostrarMensaje("No fue posible guardar los datos en el navegador.", "error");
        return false;
    }
}

function cargarDatos() {
    app.clientes = leerLocalStorage(CLAVE_CLIENTES).filter(function (cliente) {
        return cliente && typeof cliente.id === "string" && typeof cliente.nombre === "string";
    });
    app.reservas = leerLocalStorage(CLAVE_RESERVAS).filter(function (reserva) {
        return reserva
            && typeof reserva.id === "string"
            && esFechaISOValida(reserva.fecha)
            && typeof reserva.hora === "string"
            && ESTADOS[reserva.estado] !== undefined;
    });
}

function guardarDatos() {
    escribirLocalStorage(CLAVE_CLIENTES, app.clientes);
    escribirLocalStorage(CLAVE_RESERVAS, app.reservas);
}

/* 6. MENSAJES Y ERRORES DE FORMULARIO ------------------------------------- */
function mostrarMensaje(texto, tipo) {
    const contenedor = $("mensaje");
    contenedor.textContent = texto;
    contenedor.className = "mensaje mensaje--" + (tipo || "exito") + " mensaje--visible";
    clearTimeout(temporizadorMensaje);
    temporizadorMensaje = setTimeout(function () {
        contenedor.classList.remove("mensaje--visible");
    }, 3500);
}

function limpiarErrorCampo(campo) {
    if (!campo || !campo.id) {
        return;
    }
    const error = $("error-" + campo.id);
    if (error) {
        error.textContent = "";
    }
    campo.classList.remove("es-invalido");
    campo.removeAttribute("aria-invalid");
}

function limpiarErrores(formulario) {
    formulario.querySelectorAll(".error-campo").forEach(function (error) {
        error.textContent = "";
    });
    formulario.querySelectorAll(".es-invalido").forEach(function (campo) {
        campo.classList.remove("es-invalido");
        campo.removeAttribute("aria-invalid");
    });
}

function mostrarErrores(errores) {
    const claves = Object.keys(errores);
    claves.forEach(function (clave) {
        const campo = $(clave);
        const error = $("error-" + clave);
        if (error) {
            error.textContent = errores[clave];
        }
        if (campo) {
            campo.classList.add("es-invalido");
            campo.setAttribute("aria-invalid", "true");
        }
    });
    const primero = $(claves[0]);
    if (primero && !primero.disabled) {
        primero.focus();
    }
}

/* 7. BÚSQUEDAS EN LOS DATOS ----------------------------------------------- */
function buscarCliente(id) {
    return app.clientes.find(function (cliente) {
        return cliente.id === id;
    });
}

function buscarReserva(id) {
    return app.reservas.find(function (reserva) {
        return reserva.id === id;
    });
}

function nombreDelCliente(reserva) {
    const cliente = buscarCliente(reserva.clienteId);
    return cliente ? cliente.nombre : "Cliente eliminado";
}

function contarReservasDeCliente(clienteId) {
    return app.reservas.filter(function (reserva) {
        return reserva.clienteId === clienteId;
    }).length;
}

function agruparReservasPorFecha() {
    const grupos = {};
    app.reservas.forEach(function (reserva) {
        if (!grupos[reserva.fecha]) {
            grupos[reserva.fecha] = [];
        }
        grupos[reserva.fecha].push(reserva);
    });
    return grupos;
}

/* 8. CONTROL DE DISPONIBILIDAD -------------------------------------------- */
// Genera ["08:00", "08:30", ..., "16:30"]. La última cita termina a las 5:00 p. m.
function generarHorarios() {
    const horarios = [];
    for (let minutos = HORA_INICIO_MIN; minutos < HORA_FIN_MIN; minutos += INTERVALO_MIN) {
        horarios.push(rellenar(Math.floor(minutos / 60)) + ":" + rellenar(minutos % 60));
    }
    return horarios;
}

// Una hora está ocupada si existe otra reserva NO cancelada en la misma fecha y hora.
function horaOcupada(fecha, hora, excluirId) {
    return app.reservas.some(function (reserva) {
        return reserva.fecha === fecha
            && reserva.hora === hora
            && reserva.estado !== "cancelada"
            && reserva.id !== excluirId;
    });
}

// En el día actual, una hora ya iniciada no se puede reservar.
function horaPasada(fecha, hora) {
    if (!BLOQUEAR_HORAS_PASADAS || fecha !== obtenerHoyISO()) {
        return false;
    }
    const ahora = new Date();
    const partes = hora.split(":").map(Number);
    return partes[0] * 60 + partes[1] <= ahora.getHours() * 60 + ahora.getMinutes();
}

// Devuelve [{ hora: "08:00", situacion: "libre" | "ocupado" | "pasado" }, ...]
function calcularHorarios(fecha, excluirId) {
    const original = excluirId ? buscarReserva(excluirId) : null;
    return generarHorarios().map(function (hora) {
        const esLaOriginal = original !== null && original.fecha === fecha && original.hora === hora;
        let situacion = "libre";
        if (horaOcupada(fecha, hora, excluirId)) {
            situacion = "ocupado";
        } else if (horaPasada(fecha, hora) && !esLaOriginal) {
            situacion = "pasado";
        }
        return { hora: hora, situacion: situacion };
    });
}

/* 9. VALIDACIONES --------------------------------------------------------- */
function validarReserva(datos, excluirId) {
    const errores = {};

    if (!datos.clienteId || !buscarCliente(datos.clienteId)) {
        errores.reservaCliente = "Seleccione un cliente registrado.";
    }

    if (!datos.fecha) {
        errores.reservaFecha = "Seleccione una fecha.";
    } else if (!esFechaISOValida(datos.fecha)) {
        errores.reservaFecha = "La fecha ingresada no es válida.";
    } else if (datos.fecha < obtenerHoyISO()) {
        errores.reservaFecha = "No se permiten fechas anteriores al día actual.";
    }

    if (!datos.hora) {
        errores.reservaHora = "Seleccione una hora disponible.";
    } else if (generarHorarios().indexOf(datos.hora) === -1) {
        errores.reservaHora = "La hora está fuera del horario de atención.";
    } else if (!errores.reservaFecha && datos.estado !== "cancelada") {
        const situacion = calcularHorarios(datos.fecha, excluirId).find(function (item) {
            return item.hora === datos.hora;
        }).situacion;
        if (situacion === "ocupado") {
            errores.reservaHora = "Ese horario ya está reservado. Elija otra hora.";
        } else if (situacion === "pasado") {
            errores.reservaHora = "No se puede reservar una hora que ya pasó.";
        }
    }

    if (!datos.servicio || SERVICIOS.indexOf(datos.servicio) === -1) {
        errores.reservaServicio = "Seleccione un servicio.";
    }

    if (datos.observaciones.length > MAX_OBSERVACIONES) {
        errores.reservaObservaciones = "Máximo " + MAX_OBSERVACIONES + " caracteres.";
    }

    if (ESTADOS[datos.estado] === undefined) {
        errores.reservaEstado = "Seleccione un estado válido.";
    } else if (!excluirId && datos.estado === "cancelada") {
        errores.reservaEstado = "Una reserva nueva no puede registrarse como cancelada.";
    }

    return errores;
}

function validarCliente(datos, excluirId) {
    const errores = {};

    if (datos.nombre.length < 5 || datos.nombre.split(" ").length < 2) {
        errores.clienteNombre = "Escriba el nombre completo (nombre y apellido).";
    } else if (!/^[\p{L}][\p{L}\s'.-]{3,59}$/u.test(datos.nombre)) {
        errores.clienteNombre = "El nombre solo puede contener letras y espacios.";
    }

    if (!/^\d{6,12}$/.test(datos.documento)) {
        errores.clienteDocumento = "El documento debe tener entre 6 y 12 dígitos.";
    } else if (app.clientes.some(function (cliente) {
        return cliente.documento === datos.documento && cliente.id !== excluirId;
    })) {
        errores.clienteDocumento = "Ya existe un cliente con ese documento.";
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(datos.correo)) {
        errores.clienteCorreo = "Ingrese un correo electrónico válido.";
    }

    if (!/^\d{7,10}$/.test(datos.telefono)) {
        errores.clienteTelefono = "El teléfono debe tener entre 7 y 10 dígitos.";
    }

    if (!datos.servicio || SERVICIOS.indexOf(datos.servicio) === -1) {
        errores.clienteServicio = "Seleccione el servicio solicitado.";
    }

    return errores;
}

/* 10. DASHBOARD ----------------------------------------------------------- */
function renderizarDashboard() {
    const hoy = obtenerHoyISO();
    const contar = function (estado) {
        return app.reservas.filter(function (reserva) {
            return reserva.estado === estado;
        }).length;
    };
    const citasHoy = app.reservas.filter(function (reserva) {
        return reserva.fecha === hoy && reserva.estado !== "cancelada";
    }).length;

    $("totalCitas").textContent = app.reservas.length;
    $("citasHoy").textContent = citasHoy;
    $("citasPendientes").textContent = contar("pendiente");
    $("citasConfirmadas").textContent = contar("confirmada");
    $("citasCanceladas").textContent = contar("cancelada");
}

/* 11. CALENDARIO ---------------------------------------------------------- */
function renderizarCalendario() {
    const anio = app.vista.anio;
    const mes = app.vista.mes;
    const hoy = obtenerHoyISO();
    const rejilla = $("rejillaCalendario");
    const reservasPorFecha = agruparReservasPorFecha();

    $("tituloMes").textContent = nombreMes(anio, mes);
    rejilla.innerHTML = "";

    NOMBRES_DIAS.forEach(function (nombre) {
        rejilla.appendChild(crearElemento("div", "calendario__dia-semana", nombre));
    });

    // La semana inicia en lunes: getDay() devuelve 0 para domingo.
    const desplazamiento = (new Date(anio, mes, 1).getDay() + 6) % 7;
    const diasEnMes = new Date(anio, mes + 1, 0).getDate();

    for (let i = 0; i < desplazamiento; i++) {
        rejilla.appendChild(crearElemento("div", "calendario__vacio"));
    }

    for (let dia = 1; dia <= diasEnMes; dia++) {
        const fechaISO = construirFechaISO(anio, mes, dia);
        const delDia = reservasPorFecha[fechaISO] || [];
        const activas = delDia.filter(function (reserva) {
            return reserva.estado !== "cancelada";
        });

        const boton = crearElemento("button", "calendario__dia");
        boton.type = "button";
        boton.dataset.fecha = fechaISO;

        if (fechaISO === hoy) {
            boton.classList.add("es-hoy");
            boton.setAttribute("aria-current", "date");
        }
        if (fechaISO < hoy) {
            boton.classList.add("es-pasado");
        }
        if (fechaISO === app.fechaSeleccionada) {
            boton.classList.add("es-seleccionado");
        }
        if (delDia.length > 0) {
            boton.classList.add("con-reservas");
        }
        boton.setAttribute("aria-pressed", fechaISO === app.fechaSeleccionada ? "true" : "false");
        boton.setAttribute(
            "aria-label",
            formatearFechaLarga(fechaISO) + ", " +
            (activas.length > 0 ? pluralizar(activas.length, "cita activa", "citas activas") : "sin citas")
        );

        boton.appendChild(crearElemento("span", "calendario__numero", String(dia)));

        const puntos = crearElemento("span", "calendario__puntos");
        delDia.slice(0, 4).forEach(function (reserva) {
            puntos.appendChild(crearElemento("span", "punto punto--" + reserva.estado));
        });
        boton.appendChild(puntos);

        if (activas.length > 0) {
            boton.appendChild(crearElemento("span", "calendario__contador", String(activas.length)));
        }

        rejilla.appendChild(boton);
    }
}

function cambiarMes(cambio) {
    const nueva = new Date(app.vista.anio, app.vista.mes + cambio, 1);
    app.vista = { anio: nueva.getFullYear(), mes: nueva.getMonth() };
    renderizarCalendario();
}

function seleccionarFecha(fechaISO, desdeFormulario) {
    const fecha = parsearFechaISO(fechaISO);
    app.fechaSeleccionada = fechaISO;
    app.vista = { anio: fecha.getFullYear(), mes: fecha.getMonth() };

    if (!desdeFormulario && fechaISO >= obtenerHoyISO()) {
        $("reservaFecha").value = fechaISO;
        limpiarErrorCampo($("reservaFecha"));
    }

    renderizarCalendario();
    renderizarPanelDia();
    actualizarHorarios();
}

/* 12. TARJETAS Y PANEL DEL DÍA -------------------------------------------- */
function crearEtiquetaEstado(estado) {
    return crearElemento("span", "etiqueta etiqueta--" + estado, ESTADOS[estado]);
}

function crearBoton(texto, clase, accion, id) {
    const boton = crearElemento("button", "boton boton--pequeno " + clase, texto);
    boton.type = "button";
    boton.dataset.accion = accion;
    boton.dataset.id = id;
    return boton;
}

function crearTarjetaReserva(reserva, mostrarFecha) {
    const cliente = buscarCliente(reserva.clienteId);
    const tarjeta = crearElemento("article", "tarjeta-reserva tarjeta-reserva--" + reserva.estado);

    const cabecera = crearElemento("div", "tarjeta-reserva__cabecera");
    const horario = (mostrarFecha ? formatearFechaCorta(reserva.fecha) + " · " : "") +
        formatearHora(reserva.hora);
    cabecera.appendChild(crearElemento("span", "tarjeta-reserva__hora", horario));
    cabecera.appendChild(crearEtiquetaEstado(reserva.estado));
    tarjeta.appendChild(cabecera);

    tarjeta.appendChild(crearElemento("h4", "tarjeta-reserva__cliente", nombreDelCliente(reserva)));
    tarjeta.appendChild(crearElemento("p", "tarjeta-reserva__servicio", reserva.servicio));

    if (cliente) {
        tarjeta.appendChild(crearElemento(
            "p",
            "tarjeta-reserva__detalle",
            "Doc. " + cliente.documento + " · Tel. " + cliente.telefono
        ));
    }
    if (reserva.observaciones) {
        tarjeta.appendChild(crearElemento(
            "p",
            "tarjeta-reserva__detalle",
            "Obs.: " + reserva.observaciones
        ));
    }

    const acciones = crearElemento("div", "tarjeta-reserva__acciones");
    if (reserva.fecha < obtenerHoyISO()) {
        acciones.appendChild(crearElemento("span", "tarjeta-reserva__nota", "Cita pasada (solo consulta)"));
    } else {
        if (reserva.estado === "pendiente") {
            acciones.appendChild(crearBoton("Confirmar", "boton--exito", "confirmar", reserva.id));
        }
        acciones.appendChild(crearBoton("Editar", "boton--secundario", "editar", reserva.id));
        if (reserva.estado !== "cancelada") {
            acciones.appendChild(crearBoton("Cancelar", "boton--peligro", "cancelar", reserva.id));
        }
    }
    tarjeta.appendChild(acciones);

    return tarjeta;
}

function crearMensajeVacio(texto) {
    return crearElemento("p", "mensaje-vacio", texto);
}

function renderizarPanelDia() {
    const fecha = app.fechaSeleccionada;
    const hoy = obtenerHoyISO();
    const contenedor = $("listaDia");
    const delDia = app.reservas
        .filter(function (reserva) {
            return reserva.fecha === fecha;
        })
        .sort(function (a, b) {
            return a.hora.localeCompare(b.hora);
        });
    const activas = delDia.filter(function (reserva) {
        return reserva.estado !== "cancelada";
    }).length;

    $("tituloDia").textContent = formatearFechaLarga(fecha);

    let resumen = pluralizar(activas, "cita activa", "citas activas");
    if (fecha >= hoy) {
        const libres = calcularHorarios(fecha).filter(function (item) {
            return item.situacion === "libre";
        }).length;
        resumen += " · " + pluralizar(libres, "horario libre", "horarios libres");
    } else {
        resumen += " · Fecha pasada (solo consulta)";
    }
    $("resumenDia").textContent = resumen;
    $("botonReservarDia").disabled = fecha < hoy;

    contenedor.innerHTML = "";
    if (delDia.length === 0) {
        contenedor.appendChild(crearMensajeVacio("No hay reservas registradas para este día."));
        return;
    }
    delDia.forEach(function (reserva) {
        contenedor.appendChild(crearTarjetaReserva(reserva, false));
    });
}

/* 13. FORMULARIO DE RESERVAS ---------------------------------------------- */
function poblarServicios() {
    ["reservaServicio", "clienteServicio"].forEach(function (id) {
        SERVICIOS.forEach(function (servicio) {
            agregarOpcion($(id), servicio, servicio);
        });
    });
    SERVICIOS.forEach(function (servicio) {
        agregarOpcion($("filtroServicio"), servicio, servicio);
    });
}

function poblarSelectClientes(valorPreferido) {
    const select = $("reservaCliente");
    const actual = valorPreferido !== undefined ? valorPreferido : select.value;
    const ordenados = app.clientes.slice().sort(function (a, b) {
        return a.nombre.localeCompare(b.nombre, "es");
    });

    select.innerHTML = "";
    agregarOpcion(
        select,
        "",
        ordenados.length > 0 ? "Seleccione un cliente" : "Primero registre un cliente"
    );
    ordenados.forEach(function (cliente) {
        agregarOpcion(select, cliente.id, cliente.nombre + " — " + cliente.documento);
    });
    select.value = app.clientes.some(function (cliente) {
        return cliente.id === actual;
    }) ? actual : "";
}

function resaltarHoraElegida() {
    const elegida = $("reservaHora").value;
    $("rejillaHorarios").querySelectorAll(".horario").forEach(function (chip) {
        chip.classList.toggle("horario--elegido", chip.dataset.hora === elegida);
    });
}

// Reconstruye la lista de horas y la rejilla según la fecha del formulario.
function actualizarHorarios(horaPreferida) {
    const fecha = $("reservaFecha").value;
    const select = $("reservaHora");
    const aviso = $("avisoDisponibilidad");
    const rejilla = $("rejillaHorarios");
    const horaActual = horaPreferida !== undefined ? horaPreferida : select.value;

    select.innerHTML = "";
    rejilla.innerHTML = "";
    aviso.className = "aviso";

    if (!fecha || !esFechaISOValida(fecha)) {
        agregarOpcion(select, "", "Primero seleccione una fecha");
        select.disabled = true;
        aviso.textContent = "Seleccione una fecha para consultar la disponibilidad.";
        aviso.classList.add("aviso--info");
        return;
    }

    if (fecha < obtenerHoyISO()) {
        agregarOpcion(select, "", "Fecha no permitida");
        select.disabled = true;
        aviso.textContent = "No se permiten fechas anteriores al día actual.";
        aviso.classList.add("aviso--error");
        return;
    }

    const horarios = calcularHorarios(fecha, app.editandoReservaId);
    const libres = horarios.filter(function (item) {
        return item.situacion === "libre";
    });

    if (libres.length === 0) {
        agregarOpcion(select, "", "Sin disponibilidad");
        select.disabled = true;
        aviso.textContent = "No hay horarios disponibles para el " + formatearFechaCorta(fecha) +
            ". Seleccione otra fecha.";
        aviso.classList.add("aviso--error");
    } else {
        select.disabled = false;
        agregarOpcion(select, "", "Seleccione una hora");
        libres.forEach(function (item) {
            agregarOpcion(select, item.hora, formatearHora(item.hora));
        });
        const sigueLibre = libres.some(function (item) {
            return item.hora === horaActual;
        });
        select.value = sigueLibre ? horaActual : "";
        aviso.textContent = "Hay " + libres.length + " de " + horarios.length +
            " horarios disponibles el " + formatearFechaCorta(fecha) + ".";
        aviso.classList.add("aviso--exito");
    }

    horarios.forEach(function (item) {
        const chip = crearElemento(
            "button",
            "horario horario--" + item.situacion,
            formatearHora(item.hora)
        );
        chip.type = "button";
        chip.dataset.hora = item.hora;
        chip.disabled = item.situacion !== "libre";
        chip.setAttribute("aria-label", formatearHora(item.hora) + ", " + item.situacion);
        rejilla.appendChild(chip);
    });
    resaltarHoraElegida();
}

function leerFormularioReserva() {
    return {
        clienteId: $("reservaCliente").value,
        fecha: $("reservaFecha").value,
        hora: $("reservaHora").value,
        servicio: $("reservaServicio").value,
        observaciones: $("reservaObservaciones").value.trim(),
        estado: $("reservaEstado").value
    };
}

function actualizarModoEdicion() {
    const banner = $("bannerEdicion");
    const boton = $("botonGuardarReserva");
    const limpiar = $("botonLimpiarReserva");

    if (app.editandoReservaId) {
        const reserva = buscarReserva(app.editandoReservaId);
        banner.hidden = false;
        $("textoEdicion").textContent = "reserva de " + nombreDelCliente(reserva) + " el " +
            formatearFechaCorta(reserva.fecha) + " a las " + formatearHora(reserva.hora) + ".";
        boton.textContent = "Guardar cambios";
        limpiar.textContent = "Descartar edición";
    } else {
        banner.hidden = true;
        $("textoEdicion").textContent = "";
        boton.textContent = "Guardar reserva";
        limpiar.textContent = "Limpiar formulario";
    }
}

function reiniciarFormularioReserva() {
    const formulario = $("formReserva");
    formulario.reset();
    limpiarErrores(formulario);
    app.editandoReservaId = null;
    $("reservaFecha").min = obtenerHoyISO();
    $("reservaFecha").value = app.fechaSeleccionada >= obtenerHoyISO()
        ? app.fechaSeleccionada
        : obtenerHoyISO();
    poblarSelectClientes("");
    actualizarModoEdicion();
    actualizarHorarios("");
}

function manejarEnvioReserva(evento) {
    evento.preventDefault();
    const formulario = $("formReserva");
    limpiarErrores(formulario);

    const datos = leerFormularioReserva();
    const errores = validarReserva(datos, app.editandoReservaId);

    if (Object.keys(errores).length > 0) {
        mostrarErrores(errores);
        mostrarMensaje("Revise los campos marcados en el formulario.", "error");
        return;
    }

    const ahora = new Date().toISOString();
    if (app.editandoReservaId) {
        const reserva = buscarReserva(app.editandoReservaId);
        Object.assign(reserva, datos, { actualizadaEn: ahora });
        mostrarMensaje("Reserva actualizada correctamente.");
    } else {
        app.reservas.push(Object.assign({ id: generarId("res") }, datos, {
            creadaEn: ahora,
            actualizadaEn: ahora
        }));
        mostrarMensaje("Reserva registrada correctamente.");
    }

    guardarDatos();
    app.editandoReservaId = null;
    app.fechaSeleccionada = datos.fecha;
    reiniciarFormularioReserva();
    seleccionarFecha(datos.fecha);
    renderizarTodo();
}

/* 14. ACCIONES SOBRE LAS RESERVAS ----------------------------------------- */
function iniciarEdicionReserva(id) {
    const reserva = buscarReserva(id);
    if (!reserva) {
        return;
    }
    if (reserva.fecha < obtenerHoyISO()) {
        mostrarMensaje("No se pueden modificar reservas de fechas pasadas.", "error");
        return;
    }

    limpiarErrores($("formReserva"));
    app.editandoReservaId = id;
    $("reservaFecha").min = obtenerHoyISO();
    poblarSelectClientes(reserva.clienteId);
    $("reservaFecha").value = reserva.fecha;
    $("reservaServicio").value = reserva.servicio;
    $("reservaObservaciones").value = reserva.observaciones || "";
    $("reservaEstado").value = reserva.estado;

    seleccionarFecha(reserva.fecha, true);
    actualizarHorarios(reserva.hora);
    actualizarModoEdicion();
    $("nueva-reserva").scrollIntoView({ behavior: "smooth", block: "start" });
}

function confirmarReserva(id) {
    const reserva = buscarReserva(id);
    if (!reserva || reserva.estado === "cancelada") {
        return;
    }
    reserva.estado = "confirmada";
    reserva.actualizadaEn = new Date().toISOString();
    guardarDatos();
    renderizarTodo();
    mostrarMensaje("Reserva confirmada.");
}

function cancelarReserva(id) {
    const reserva = buscarReserva(id);
    if (!reserva) {
        return;
    }
    const mensaje = "¿Desea cancelar la reserva de " + nombreDelCliente(reserva) + " el " +
        formatearFechaCorta(reserva.fecha) + " a las " + formatearHora(reserva.hora) + "?";
    if (!window.confirm(mensaje)) {
        return;
    }
    reserva.estado = "cancelada";
    reserva.actualizadaEn = new Date().toISOString();
    guardarDatos();
    if (app.editandoReservaId === id) {
        reiniciarFormularioReserva();
    }
    renderizarTodo();
    mostrarMensaje("Reserva cancelada. El horario quedó libre.", "info");
}

function manejarAccionesReserva(evento) {
    const boton = evento.target.closest("[data-accion]");
    if (!boton) {
        return;
    }
    const id = boton.dataset.id;
    switch (boton.dataset.accion) {
        case "confirmar":
            confirmarReserva(id);
            break;
        case "editar":
            iniciarEdicionReserva(id);
            break;
        case "cancelar":
            cancelarReserva(id);
            break;
    }
}

/* 15. LISTADO CON FILTROS Y ORDENAMIENTO ---------------------------------- */
function obtenerReservasFiltradas() {
    const estado = $("filtroEstado").value;
    const servicio = $("filtroServicio").value;
    const fecha = $("filtroFecha").value;
    const texto = normalizarTexto($("filtroTexto").value);

    const filtradas = app.reservas.filter(function (reserva) {
        if (estado !== "todos" && reserva.estado !== estado) {
            return false;
        }
        if (servicio !== "todos" && reserva.servicio !== servicio) {
            return false;
        }
        if (fecha && reserva.fecha !== fecha) {
            return false;
        }
        if (texto) {
            const cliente = buscarCliente(reserva.clienteId);
            const contenido = normalizarTexto([
                cliente ? cliente.nombre : "",
                cliente ? cliente.documento : "",
                reserva.servicio,
                reserva.observaciones || ""
            ].join(" "));
            if (contenido.indexOf(texto) === -1) {
                return false;
            }
        }
        return true;
    });

    const porFecha = function (a, b) {
        return a.fecha.localeCompare(b.fecha) || a.hora.localeCompare(b.hora);
    };
    const comparadores = {
        "fecha-asc": porFecha,
        "fecha-desc": function (a, b) {
            return porFecha(b, a);
        },
        "cliente": function (a, b) {
            return nombreDelCliente(a).localeCompare(nombreDelCliente(b), "es") || porFecha(a, b);
        },
        "estado": function (a, b) {
            return ORDEN_ESTADOS[a.estado] - ORDEN_ESTADOS[b.estado] || porFecha(a, b);
        }
    };

    return filtradas.sort(comparadores[$("ordenarPor").value] || porFecha);
}

function renderizarListado() {
    const contenedor = $("listaReservas");
    const filtradas = obtenerReservasFiltradas();

    contenedor.innerHTML = "";
    $("contadorListado").textContent = "Mostrando " + filtradas.length + " de " +
        pluralizar(app.reservas.length, "reserva", "reservas");

    if (app.reservas.length === 0) {
        contenedor.appendChild(crearMensajeVacio(
            "Aún no hay reservas. Registre un cliente y cree una reserva, o cargue los datos de ejemplo."
        ));
        return;
    }
    if (filtradas.length === 0) {
        contenedor.appendChild(crearMensajeVacio("Ninguna reserva coincide con los filtros aplicados."));
        return;
    }
    filtradas.forEach(function (reserva) {
        contenedor.appendChild(crearTarjetaReserva(reserva, true));
    });
}

function limpiarFiltros() {
    $("filtroTexto").value = "";
    $("filtroEstado").value = "todos";
    $("filtroServicio").value = "todos";
    $("filtroFecha").value = "";
    $("ordenarPor").value = "fecha-asc";
    renderizarListado();
}

/* 16. REGISTRO DE CLIENTES ------------------------------------------------ */
function leerFormularioCliente() {
    return {
        nombre: $("clienteNombre").value.trim().replace(/\s+/g, " "),
        documento: $("clienteDocumento").value.trim(),
        correo: $("clienteCorreo").value.trim().toLowerCase(),
        telefono: $("clienteTelefono").value.replace(/[\s-]/g, ""),
        servicio: $("clienteServicio").value
    };
}

function reiniciarFormularioCliente() {
    $("formCliente").reset();
    limpiarErrores($("formCliente"));
    app.editandoClienteId = null;
    $("tituloFormCliente").textContent = "Nuevo cliente";
    $("botonGuardarCliente").textContent = "Registrar cliente";
    $("botonLimpiarCliente").textContent = "Limpiar";
}

function manejarEnvioCliente(evento) {
    evento.preventDefault();
    limpiarErrores($("formCliente"));

    const datos = leerFormularioCliente();
    const errores = validarCliente(datos, app.editandoClienteId);

    if (Object.keys(errores).length > 0) {
        mostrarErrores(errores);
        mostrarMensaje("Revise los campos marcados en el formulario de clientes.", "error");
        return;
    }

    let idGuardado;
    if (app.editandoClienteId) {
        Object.assign(buscarCliente(app.editandoClienteId), datos);
        idGuardado = app.editandoClienteId;
        mostrarMensaje("Cliente actualizado correctamente.");
    } else {
        idGuardado = generarId("cli");
        app.clientes.push(Object.assign({ id: idGuardado }, datos));
        mostrarMensaje("Cliente registrado correctamente.");
    }

    guardarDatos();
    reiniciarFormularioCliente();
    poblarSelectClientes(app.editandoReservaId ? undefined : idGuardado);
    if (!app.editandoReservaId) {
        $("reservaServicio").value = datos.servicio;
    }
    renderizarTodo();
}

function iniciarEdicionCliente(id) {
    const cliente = buscarCliente(id);
    if (!cliente) {
        return;
    }
    limpiarErrores($("formCliente"));
    app.editandoClienteId = id;
    $("clienteNombre").value = cliente.nombre;
    $("clienteDocumento").value = cliente.documento;
    $("clienteCorreo").value = cliente.correo;
    $("clienteTelefono").value = cliente.telefono;
    $("clienteServicio").value = cliente.servicio;
    $("tituloFormCliente").textContent = "Editar cliente";
    $("botonGuardarCliente").textContent = "Guardar cambios";
    $("botonLimpiarCliente").textContent = "Descartar edición";
    $("clientes").scrollIntoView({ behavior: "smooth", block: "start" });
    $("clienteNombre").focus();
}

function eliminarCliente(id) {
    const cliente = buscarCliente(id);
    if (!cliente) {
        return;
    }
    const cantidad = contarReservasDeCliente(id);
    if (cantidad > 0) {
        mostrarMensaje(
            "No se puede eliminar: el cliente tiene " + pluralizar(cantidad, "reserva", "reservas") + ".",
            "error"
        );
        return;
    }
    if (!window.confirm("¿Desea eliminar a " + cliente.nombre + "?")) {
        return;
    }
    app.clientes = app.clientes.filter(function (item) {
        return item.id !== id;
    });
    if (app.editandoClienteId === id) {
        reiniciarFormularioCliente();
    }
    guardarDatos();
    renderizarTodo();
    mostrarMensaje("Cliente eliminado.", "info");
}

function crearTarjetaCliente(cliente) {
    const tarjeta = crearElemento("article", "tarjeta-reserva tarjeta-cliente");
    const cantidad = contarReservasDeCliente(cliente.id);

    tarjeta.appendChild(crearElemento("h4", "tarjeta-reserva__cliente", cliente.nombre));
    tarjeta.appendChild(crearElemento("p", "tarjeta-reserva__servicio", cliente.servicio));
    tarjeta.appendChild(crearElemento("p", "tarjeta-reserva__detalle", "Documento: " + cliente.documento));
    tarjeta.appendChild(crearElemento("p", "tarjeta-reserva__detalle", cliente.correo));
    tarjeta.appendChild(crearElemento("p", "tarjeta-reserva__detalle", "Teléfono: " + cliente.telefono));
    tarjeta.appendChild(crearElemento(
        "p",
        "tarjeta-reserva__detalle",
        pluralizar(cantidad, "reserva asociada", "reservas asociadas")
    ));

    const acciones = crearElemento("div", "tarjeta-reserva__acciones");
    acciones.appendChild(crearBoton("Editar", "boton--secundario", "editar-cliente", cliente.id));
    acciones.appendChild(crearBoton("Eliminar", "boton--peligro", "eliminar-cliente", cliente.id));
    tarjeta.appendChild(acciones);

    return tarjeta;
}

function renderizarClientes() {
    const contenedor = $("listaClientes");
    const ordenados = app.clientes.slice().sort(function (a, b) {
        return a.nombre.localeCompare(b.nombre, "es");
    });

    contenedor.innerHTML = "";
    $("contadorClientes").textContent = pluralizar(
        ordenados.length,
        "cliente registrado",
        "clientes registrados"
    );

    if (ordenados.length === 0) {
        contenedor.appendChild(crearMensajeVacio(
            "Todavía no hay clientes. Complete el formulario para registrar el primero."
        ));
        return;
    }
    ordenados.forEach(function (cliente) {
        contenedor.appendChild(crearTarjetaCliente(cliente));
    });
}

function manejarAccionesCliente(evento) {
    const boton = evento.target.closest("[data-accion]");
    if (!boton) {
        return;
    }
    if (boton.dataset.accion === "editar-cliente") {
        iniciarEdicionCliente(boton.dataset.id);
    } else if (boton.dataset.accion === "eliminar-cliente") {
        eliminarCliente(boton.dataset.id);
    }
}

/* 17. DATOS DE EJEMPLO Y REINICIO ----------------------------------------- */
function cargarDatosEjemplo() {
    const hayDatos = app.clientes.length > 0 || app.reservas.length > 0;
    const aviso = "Se reemplazarán los datos actuales por los datos de ejemplo. ¿Desea continuar?";
    if (hayDatos && !window.confirm(aviso)) {
        return;
    }

    const hoy = obtenerHoyISO();
    const ahora = new Date().toISOString();

    app.clientes = [
        { id: "cli_demo_1", nombre: "María Fernanda Gómez", documento: "1053824501",
          correo: "maria.gomez@ejemplo.com", telefono: "3105551234", servicio: "Consulta general" },
        { id: "cli_demo_2", nombre: "Carlos Andrés Ríos", documento: "75089432",
          correo: "carlos.rios@ejemplo.com", telefono: "3205559876", servicio: "Fisioterapia" },
        { id: "cli_demo_3", nombre: "Laura Valentina Cardona", documento: "1053990127",
          correo: "laura.cardona@ejemplo.com", telefono: "3015557788", servicio: "Odontología" },
        { id: "cli_demo_4", nombre: "Juan Pablo Henao", documento: "10285640",
          correo: "juan.henao@ejemplo.com", telefono: "3125554321", servicio: "Psicología" }
    ];

    // [días desde hoy, hora, id del cliente, servicio, estado, observaciones]
    const plantilla = [
        [-2, "10:00", "cli_demo_1", "Consulta general", "confirmada", "Control realizado"],
        [0, "16:00", "cli_demo_2", "Fisioterapia", "confirmada", "Terapia de rodilla"],
        [0, "16:30", "cli_demo_3", "Odontología", "pendiente", "Limpieza dental"],
        [1, "08:00", "cli_demo_4", "Psicología", "pendiente", "Primera sesión"],
        [1, "09:30", "cli_demo_1", "Nutrición", "confirmada", ""],
        [2, "10:00", "cli_demo_2", "Consulta general", "pendiente", "Dolor lumbar"],
        [3, "14:00", "cli_demo_3", "Exámenes de laboratorio", "confirmada", "Ayuno de 8 horas"],
        [3, "14:30", "cli_demo_4", "Psicología", "confirmada", "Seguimiento"],
        [5, "11:00", "cli_demo_1", "Fisioterapia", "pendiente", ""],
        [7, "15:00", "cli_demo_2", "Odontología", "cancelada", "Canceló el cliente"],
        [9, "09:00", "cli_demo_3", "Consulta general", "confirmada", "Chequeo anual"]
    ];

    app.reservas = plantilla.map(function (fila, indice) {
        return {
            id: "res_demo_" + (indice + 1),
            clienteId: fila[2],
            fecha: sumarDiasISO(hoy, fila[0]),
            hora: fila[1],
            servicio: fila[3],
            estado: fila[4],
            observaciones: fila[5],
            creadaEn: ahora,
            actualizadaEn: ahora
        };
    });

    guardarDatos();
    reiniciarFormularioReserva();
    reiniciarFormularioCliente();
    seleccionarFecha(hoy);
    renderizarTodo();
    mostrarMensaje("Datos de ejemplo cargados.", "info");
}

function borrarTodosLosDatos() {
    if (!window.confirm("Se eliminarán todos los clientes y reservas guardados. ¿Desea continuar?")) {
        return;
    }
    app.clientes = [];
    app.reservas = [];
    try {
        localStorage.removeItem(CLAVE_CLIENTES);
        localStorage.removeItem(CLAVE_RESERVAS);
    } catch (error) {
        console.error("No fue posible borrar el almacenamiento:", error);
    }
    reiniciarFormularioReserva();
    reiniciarFormularioCliente();
    renderizarTodo();
    mostrarMensaje("Todos los datos fueron eliminados.", "info");
}

/* 18. RENDERIZADO GENERAL Y EVENTOS --------------------------------------- */
function renderizarTodo() {
    renderizarDashboard();
    renderizarCalendario();
    renderizarPanelDia();
    poblarSelectClientes();
    actualizarHorarios();
    renderizarListado();
    renderizarClientes();
}

function registrarEventos() {
    // Menú responsive
    $("botonMenu").addEventListener("click", function () {
        const abierto = $("menuPrincipal").classList.toggle("menu--abierto");
        $("botonMenu").setAttribute("aria-expanded", String(abierto));
    });
    $("menuPrincipal").addEventListener("click", function (evento) {
        if (evento.target.closest("a")) {
            $("menuPrincipal").classList.remove("menu--abierto");
            $("botonMenu").setAttribute("aria-expanded", "false");
        }
    });

    // Calendario
    $("botonMesAnterior").addEventListener("click", function () {
        cambiarMes(-1);
    });
    $("botonMesSiguiente").addEventListener("click", function () {
        cambiarMes(1);
    });
    $("botonHoy").addEventListener("click", function () {
        seleccionarFecha(obtenerHoyISO());
    });
    $("rejillaCalendario").addEventListener("click", function (evento) {
        const dia = evento.target.closest("[data-fecha]");
        if (!dia) {
            return;
        }
        const fechaISO = dia.dataset.fecha;
        seleccionarFecha(fechaISO);
        const nuevo = $("rejillaCalendario").querySelector('[data-fecha="' + fechaISO + '"]');
        if (nuevo) {
            nuevo.focus();
        }
    });
    $("botonReservarDia").addEventListener("click", function () {
        $("nueva-reserva").scrollIntoView({ behavior: "smooth", block: "start" });
        $("reservaCliente").focus({ preventScroll: true });
    });

    // Formulario de reservas
    $("formReserva").addEventListener("submit", manejarEnvioReserva);
    $("botonLimpiarReserva").addEventListener("click", reiniciarFormularioReserva);
    $("reservaFecha").addEventListener("change", function () {
        const valor = $("reservaFecha").value;
        if (esFechaISOValida(valor)) {
            seleccionarFecha(valor, true);
        } else {
            actualizarHorarios();
        }
    });
    $("reservaHora").addEventListener("change", resaltarHoraElegida);
    $("rejillaHorarios").addEventListener("click", function (evento) {
        const chip = evento.target.closest(".horario");
        if (!chip || chip.disabled) {
            return;
        }
        $("reservaHora").value = chip.dataset.hora;
        limpiarErrorCampo($("reservaHora"));
        resaltarHoraElegida();
    });
    $("reservaCliente").addEventListener("change", function () {
        const cliente = buscarCliente($("reservaCliente").value);
        if (cliente && !app.editandoReservaId) {
            $("reservaServicio").value = cliente.servicio;
            limpiarErrorCampo($("reservaServicio"));
        }
    });

    // Limpieza de errores mientras el usuario escribe
    ["formReserva", "formCliente"].forEach(function (id) {
        $(id).addEventListener("input", function (evento) {
            limpiarErrorCampo(evento.target);
        });
        $(id).addEventListener("change", function (evento) {
            limpiarErrorCampo(evento.target);
        });
    });

    // Listados y acciones
    $("listaDia").addEventListener("click", manejarAccionesReserva);
    $("listaReservas").addEventListener("click", manejarAccionesReserva);
    $("listaClientes").addEventListener("click", manejarAccionesCliente);

    // Filtros y ordenamiento
    ["filtroTexto", "filtroEstado", "filtroServicio", "filtroFecha", "ordenarPor"].forEach(function (id) {
        $(id).addEventListener("input", renderizarListado);
        $(id).addEventListener("change", renderizarListado);
    });
    $("botonLimpiarFiltros").addEventListener("click", limpiarFiltros);

    // Clientes
    $("formCliente").addEventListener("submit", manejarEnvioCliente);
    $("botonLimpiarCliente").addEventListener("click", reiniciarFormularioCliente);

    // Datos
    $("botonDatosEjemplo").addEventListener("click", cargarDatosEjemplo);
    $("botonBorrarDatos").addEventListener("click", borrarTodosLosDatos);

    // Si la pestaña queda abierta varios días, se actualiza al volver a ella.
    window.addEventListener("focus", function () {
        $("reservaFecha").min = obtenerHoyISO();
        renderizarTodo();
    });
}

/* 19. INICIALIZACIÓN ------------------------------------------------------ */
function inicializar() {
    const hoy = new Date();
    poblarServicios();
    cargarDatos();

    app.vista = { anio: hoy.getFullYear(), mes: hoy.getMonth() };
    app.fechaSeleccionada = obtenerHoyISO();

    $("reservaFecha").min = obtenerHoyISO();
    $("reservaFecha").value = obtenerHoyISO();

    registrarEventos();
    actualizarModoEdicion();
    renderizarTodo();
}

document.addEventListener("DOMContentLoaded", inicializar);
