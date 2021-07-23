const { Variant } = require("mssql");
const conexion  = require('./conexion');

function getSocketIdFromArrayTpv(arrayTPV, tokenBusqueda) {
    for (let i = 0; i < arrayTPV.length; i++) {
        if (arrayTPV[i].token == tokenBusqueda) {
            return arrayTPV[i].id;
        }
    }
    return -1;;
}

function getNodosSanPedro(arrayTPV) {
    var devolver = new Promise((dev, rej) => {
        conexion.recHit('Hit', 'SELECT nombreTienda, ultimaConexion, token, 0 as online FROM tocGameInfo').then((data) => {
            let listaCompletaTPV = data.recordset;
            let listaPublica = [];
            for (let i = 0; i < arrayTPV.length; i++) {
                for (let j = 0; j < listaCompletaTPV.length; j++) {
                    if (listaCompletaTPV[j].token == arrayTPV[i].token) { //COINCIDE EL TOKEN DE LA BBDD CON EL ENVIADO
                        listaCompletaTPV[j].online = true; //ESTÁ ONLINE
                        break;
                    }
                }
            }
            //AHORA listaCompletaTPV ya tiene todos los TPV online y offline

            for (let i = 0; i < listaCompletaTPV.length; i++) {
                if (listaCompletaTPV[i].token != 'tpv-gestion') {
                    if (listaCompletaTPV[i].online) {
                        listaPublica.push({
                            id: listaPublica.length,
                            online: true,
                            nombreTienda: listaCompletaTPV[i].nombreTienda,
                            ultimaConexion: 0,
                            socketId: getSocketIdFromArrayTpv(arrayTPV, listaCompletaTPV[i].token)
                        });
                    } else { //SI NO ESTÁ ONLINE
                        listaPublica.push({
                            id: listaPublica.length,
                            online: false,
                            nombreTienda: listaCompletaTPV[i].nombreTienda,
                            ultimaConexion: listaCompletaTPV[i].ultimaConexion,
                            socketId: ''
                        });
                    }
                }
            }

            dev(listaPublica);
        });        
    });
    return devolver;
}

function configurarTarifasEspeciales(articulos, arrayTarifasEspeciales) {
    if (arrayTarifasEspeciales.length > 0) /* APLICAR TARIFAS ESPECIALES */ {
        for (let i = 0; i < arrayTarifasEspeciales.length; i++) {
            for (let j = 0; j < articulos.length; j++) {
                if (articulos[j]._id === arrayTarifasEspeciales[i].id) {
                    articulos[j].precioConIva = arrayTarifasEspeciales[i].precioConIva;
                    break;
                }
            }
        }
    }
    return articulos;
}

function configurarTarifasEspecialesViejo(articulos, arrayTarifasEspeciales) {
    if (arrayTarifasEspeciales.length > 0) /* APLICAR TARIFAS ESPECIALES */ {
        for (let i = 0; i < arrayTarifasEspeciales.length; i++) {
            for (let j = 0; j < articulos.length; j++) {
                if (articulos[j].id === arrayTarifasEspeciales[i].id) {
                    articulos[j].precioConIva = arrayTarifasEspeciales[i].precioConIva;
                    break;
                }
            }
        }
    }
    return articulos;
}
function sincronizarClientes(io) {
        io.emit('orden-descargar-clientes-finales', '');

}
function sincronizarTeclados(io) {
    io.emit('ordenSincronizarTeclado', 'Sincronizar tocGame con BBDD WEB');
}

function sincronizarTrabajadores(io) {
    io.emit('ordenSincronizarTrabajadores', 'Sincronización de trabajadores activa');
}
async function familiasPorObjetos(res5, database, codigoCliente, conexion)
{
    let objPrincipal    = null;
    let objSecundario   = null;
    for(let i = 0; i < res5.recordset.length; i++)
    {
        if(res5.recordset[i].principal.startsWith('F_'))
        {
            objPrincipal = await conexion.recHit(database, `select Codi as _id from articles where familia = '${res5.recordset[i].principal.substring(2)}'`);
            res5.recordset[i].principal = objPrincipal.recordset;
        }
        else
        {
            res5.recordset[i].principal = [{_id: Number(res5.recordset[i].principal)}]
        }

        if(res5.recordset[i].secundario.startsWith('F_'))
        {
            objSecundario = await conexion.recHit(database, `select Codi as _id from articles where familia = '${res5.recordset[i].secundario.substring(2)}'`);
            res5.recordset[i].secundario = objSecundario.recordset;
        }
        else
        {
            res5.recordset[i].secundario = [{_id: Number(res5.recordset[i].secundario)}]
        }
        objPrincipal    = null;
        objSecundario   = null;
    }
    return res5;
}

var arrayTPV = [];

// setInterval(function() { 
//     console.log(arrayTPV[0].ultimaConexion);
//   }, 3000);

function loadSockets(io, conexion) // Se devuelve data.recordset !!!
{
    setInterval(sincronizarClientes, 7300000, io);
    setInterval(sincronizarTeclados, 7200000, io);
    setInterval(sincronizarTrabajadores, 7200000, io);
    io.on('connection', (socket) => {
        if (typeof socket.handshake.query['token'] !== "undefined") {
            arrayTPV.push({
                id: socket.id, 
                token: socket.handshake.query['token']
            });
        }
        
        getNodosSanPedro(arrayTPV).then((lista) => {
            for (let i = 0; i < arrayTPV.length; i++) {
                if (arrayTPV[i].token == 'tpv-gestion') {
                    io.to(arrayTPV[i].id).emit('getNodosSanPedro', lista);
                }
            }                
        });
//-----------------------------------------------------------------
        socket.on('comprobarClienteVIP', data=>{
            var objEnviar = {
                esVip: false,
                info: null,
                idCliente: null
            };
            var sql = `
            DECLARE @idCliente int;
            SELECT @idCliente = Codi FROM ConstantsClient WHERE Variable = 'CFINAL' AND Valor = '${data.idCliente}'
            IF EXISTS (SELECT * FROM ConstantsClient WHERE Variable = 'EsClient' AND Valor = 'EsClient' AND Codi = @idCliente)
                BEGIN
                    SELECT 1 as resultado, @idCliente as idCliente
                END
            ELSE
                BEGIN
                    SELECT 0 as resultado
                END
            `;
            conexion.recHit(data.parametros.database, sql).then(res=>{
                if(res.recordset[0].resultado == 0) //NORMAL
                {
                    objEnviar.esVip = false;
                    socket.emit('respuestaClienteEsVIP', objEnviar);
                }
                else
                {
                    if(res.recordset[0].resultado == 1) //VIP
                    {
                        objEnviar.esVip = true;

                        conexion.recHit(data.parametros.database, `SELECT Nom as nombre, Nif as nif, Adresa as direccion, Ciutat as Ciudad, Cp as cp FROM Clients WHERE Codi = (SELECT TOP 1 Codi FROM ConstantsClient WHERE Valor = '${data.idCliente}' AND Variable = 'CFINAL')`).then(res2=>{
                            objEnviar.datos = res2.recordset[0];
                            objEnviar.idCliente = res.recordset[0].idCliente
                            socket.emit('respuestaClienteEsVIP', objEnviar);
                        });
                    }
                }
            });
        });
//------------------------------------------------------------------
        socket.on('sincronizar-tickets-tocgame', async (data)=>{
            try{

                for(let j = 0; j < data.arrayTickets.length; j++)
                {
                    let sql = '';
                    let campoOtros = '';
                    
                    let fechaTicket = new Date(data.arrayTickets[j].timestamp);
                    
                    let year = `${fechaTicket.getFullYear()}`;
                    let month = `${fechaTicket.getMonth() + 1}`;
                    let day = `${fechaTicket.getDate()}`;
                    let hours = `${fechaTicket.getHours()}`;
                    let minutes = `${fechaTicket.getMinutes()}`;
                    let seconds = `${fechaTicket.getSeconds()}`;
        
                    if (month.length === 1) {
                        month = '0' + month;
                    }
                    if (day.length === 1) {
                        day = '0' + day;
                    }
                    if (hours.length === 1) {
                        hours = '0' + hours;
                    }
                    if (minutes.length === 1) {
                        minutes = '0' + minutes;
                    }
                    if (seconds.length === 1) {
                        seconds = '0' + seconds;
                    }
    
                    let nombreTabla = `[V_Venut_${year}-${month}]`;
                    for (let i = 0; i < data.arrayTickets[j].lista.length; i++)
                    {  
                        if (data.arrayTickets[j].tipoPago == 'TARJETA')
                        {
                            campoOtros = '[Visa]';
                        }
                        else 
                        {
                            campoOtros = '';
                        }
                        if(data.arrayTickets[j].tipoPago == 'TICKET_RESTAURANT'){
                            campoOtros = `[TkRs:${data.arrayTickets[j].cantidadTkrs}]`;
                        }
                        if(data.arrayTickets[j].cliente !== null && data.arrayTickets[j].cliente !== undefined)
                        {
                            campoOtros += `[Id:${data.arrayTickets[j].cliente}]`;
                        }
                        
                        if(typeof data.arrayTickets[j].lista[i]._id === "object")
                        {
                            var idLista = data.arrayTickets[j].lista[i].idArticulo;
                        }
                        if(typeof data.arrayTickets[j].lista[i].idArticulo === "undefined")
                        {
                            var idLista = data.arrayTickets[j].lista[i]._id;
                        }
                        
                        if(data.arrayTickets[j].tipoPago === "CONSUMO_PERSONAL")
                        {
                            var idFinalTrabajadorAux = await conexion.recHit(data.parametros.database, `SELECT valor FROM dependentesExtes WHERE id = ${data.arrayTickets[j].idTrabajador} AND nom = 'CODICFINAL'`);//await conexion.recHit(data.parametros.database, `SELECT valor FROM dependentesExtes WHERE id = ${data.arrayTickets[j].idTrabajador} AND nom = 'CODICFINAL'`).recordset[0].valor;
                            
                            var idFinalTrabajador = `[Id:${idFinalTrabajadorAux.recordset[0].valor}]`;
                            
                        }                
                        
                        if(data.arrayTickets[j].lista[i].promocion.esPromo)
                        {
                            if(data.arrayTickets[j].lista[i].promocion.infoPromo.idSecundario != 0)
                            { //OFERTA COMBO
                                sql += ` INSERT INTO ${nombreTabla} (Botiga, Data, Dependenta, Num_tick, Estat, Plu, Quantitat, Import, Tipus_venta, FormaMarcar, Otros) VALUES (${data.parametros.codigoTienda}, CONVERT(datetime, '${year}-${month}-${day} ${hours}:${minutes}:${seconds}', 120), ${data.arrayTickets[j].idTrabajador}, ${data.arrayTickets[j]._id}, '', ${data.arrayTickets[j].lista[i].promocion.infoPromo.idPrincipal}, ${data.arrayTickets[j].lista[i].promocion.infoPromo.cantidadPrincipal*data.arrayTickets[j].lista[i].promocion.infoPromo.unidadesOferta}, ${(data.arrayTickets[j].tipoPago === "CONSUMO_PERSONAL") ? 0: data.arrayTickets[j].lista[i].promocion.infoPromo.precioRealPrincipal.toFixed(2)}, '${(data.arrayTickets[j].tipoPago === "CONSUMO_PERSONAL")? "Desc_100" : "V"}', 0, '${(data.arrayTickets[j].tipoPago === "CONSUMO_PERSONAL")? idFinalTrabajador : campoOtros}');`; 
                                sql += ` INSERT INTO ${nombreTabla} (Botiga, Data, Dependenta, Num_tick, Estat, Plu, Quantitat, Import, Tipus_venta, FormaMarcar, Otros) VALUES (${data.parametros.codigoTienda}, CONVERT(datetime, '${year}-${month}-${day} ${hours}:${minutes}:${seconds}', 120), ${data.arrayTickets[j].idTrabajador}, ${data.arrayTickets[j]._id}, '', ${data.arrayTickets[j].lista[i].promocion.infoPromo.idSecundario}, ${data.arrayTickets[j].lista[i].promocion.infoPromo.cantidadSecundario*data.arrayTickets[j].lista[i].promocion.infoPromo.unidadesOferta}, ${(data.arrayTickets[j].tipoPago === "CONSUMO_PERSONAL") ? 0: data.arrayTickets[j].lista[i].promocion.infoPromo.precioRealSecundario.toFixed(2)}, '${(data.arrayTickets[j].tipoPago === "CONSUMO_PERSONAL")? "Desc_100" : "V"}', 0, '${(data.arrayTickets[j].tipoPago === "CONSUMO_PERSONAL")? idFinalTrabajador : campoOtros}');`; 
                            }
                            else
                            { //OFERTA INDIVIDUAL
                                sql += ` INSERT  INTO ${nombreTabla} (Botiga, Data, Dependenta, Num_tick, Estat, Plu, Quantitat, Import, Tipus_venta, FormaMarcar, Otros) VALUES (${data.parametros.codigoTienda}, CONVERT(datetime, '${year}-${month}-${day} ${hours}:${minutes}:${seconds}', 120), ${data.arrayTickets[j].idTrabajador}, ${data.arrayTickets[j]._id}, '', ${data.arrayTickets[j].lista[i].promocion.infoPromo.idPrincipal}, ${data.arrayTickets[j].lista[i].promocion.infoPromo.cantidadPrincipal*data.arrayTickets[j].lista[i].promocion.infoPromo.unidadesOferta}, ${(data.arrayTickets[j].tipoPago === "CONSUMO_PERSONAL") ? 0: data.arrayTickets[j].lista[i].promocion.infoPromo.precioRealPrincipal.toFixed(2)}, '${(data.arrayTickets[j].tipoPago === "CONSUMO_PERSONAL")? "Desc_100" : "V"}', 0, '${(data.arrayTickets[j].tipoPago === "CONSUMO_PERSONAL")? idFinalTrabajador : campoOtros}');`; 
                            }
                        }
                        else
                        {
                            sql += ` INSERT INTO ${nombreTabla} (Botiga, Data, Dependenta, Num_tick, Estat, Plu, Quantitat, Import, Tipus_venta, FormaMarcar, Otros) VALUES (${data.parametros.codigoTienda}, CONVERT(datetime, '${year}-${month}-${day} ${hours}:${minutes}:${seconds}', 120), ${data.arrayTickets[j].idTrabajador}, ${data.arrayTickets[j]._id}, '', ${idLista}, ${data.arrayTickets[j].lista[i].unidades}, ${(data.arrayTickets[j].tipoPago === "CONSUMO_PERSONAL") ? 0 : data.arrayTickets[j].lista[i].subtotal}, '${(data.arrayTickets[j].tipoPago === "CONSUMO_PERSONAL")? "Desc_100" : "V"}', 0, '${(data.arrayTickets[j].tipoPago === "CONSUMO_PERSONAL")? idFinalTrabajador : campoOtros}');`;
                        }
                    }

                    sql = `
                        IF NOT EXISTS (SELECT * FROM ${nombreTabla} WHERE botiga = ${data.parametros.codigoTienda} AND Num_tick = ${data.arrayTickets[j]._id})
                            BEGIN
                                ${sql}
                            END
                    `

                    conexion.recHit(data.parametros.database, sql).then(res => {

                        if(res.rowsAffected.length > 0) {
                            socket.emit('confirmarEnvioTicket', {
                                idTicket: data.arrayTickets[j]._id,
                                respuestaSql: res
                            });
                            let sql2 = `IF EXISTS (SELECT * FROM tocGameInfo WHERE licencia = ${data.parametros.licencia}) 
                                            BEGIN
                                                IF ((SELECT ultimoIdTicket FROM tocGameInfo WHERE licencia = ${data.parametros.licencia}) < ${data.arrayTickets[j]._id})
                                                    BEGIN
                                                        UPDATE tocGameInfo SET ultimoIdTicket = ${data.arrayTickets[j]._id}, ultimaConexion = ${Date.now()}, nombreTienda = '${data.parametros.nombreTienda}' WHERE licencia = ${data.parametros.licencia}
                                                    END
                                                END
                                        ELSE
                                            BEGIN
                                                INSERT INTO tocGameInfo (licencia, bbdd, ultimoIdTicket, codigoInternoTienda, nombreTienda, token, version, ultimaConexion) 
                                                    VALUES (${data.parametros.licencia}, '${data.parametros.database}', ${data.arrayTickets[j]._id}, ${data.parametros.codigoTienda}, '${data.parametros.nombreTienda}', NEWID(), '2.0.0', ${Date.now()})
                                            END`;
                            
                            conexion.recHit('Hit', sql2);
                        }
                    }).catch((err) => {
                        console.log(err);
                    });
                }
            } catch(err){
                conexion.recHit('Hit', `insert into test_eze_report (error) values ('${JSON.stringify(data)} - ${String(err)}')`);
            }
        })
//------------------------------------------------------------------
        socket.on('guardarDevoluciones', data=>{
            try{
                let sql = '';
                let campoOtros = '';
                let sqlGraella = '';
                let fechaTicket = new Date(data.info.timestamp);
                
                let year = `${fechaTicket.getFullYear()}`;
                let month = `${fechaTicket.getMonth() + 1}`;
                let day = `${fechaTicket.getDate()}`;
                let hours = `${fechaTicket.getHours()}`;
                let minutes = `${fechaTicket.getMinutes()}`;
                let seconds = `${fechaTicket.getSeconds()}`;
                let year2 = `${fechaTicket.getFullYear()%100}`;
                if(year2.length === 1)
                {
                    year2 = '0' + year2;
                }
                if (month.length === 1) {
                    month = '0' + month;
                }
                if (day.length === 1) {
                    day = '0' + day;
                }
                if (hours.length === 1) {
                    hours = '0' + hours;
                }
                if (minutes.length === 1) {
                    minutes = '0' + minutes;
                }
                if (seconds.length === 1) {
                    seconds = '0' + seconds;
                }

                let nombreTabla = `[V_Tornat_${year}-${month}]`;
   
                for (let i = 0; i < data.info.lista.length; i++)
                {
                    if (data.info.tarjeta)
                    {
                        campoOtros = '[Visa]';
                    }
                    else 
                    {
                        campoOtros = '';
                    }
                    if(data.info.cliente !== null && data.info.cliente !== undefined)
                    {
                        campoOtros += `[Id:${data.info.cliente}]`;
                    }
                    
                    if(typeof data.info.lista[i]._id === "object")
                    {
                        var idLista = data.info.lista[i].idArticulo;
                    }
                    if(typeof data.info.lista[i].idArticulo === "undefined")
                    {
                        var idLista = data.info.lista[i]._id;
                    }
                    
                    if(data.info.lista[i].promocion.esPromo)
                    {
                        if(data.info.lista[i].promocion.infoPromo.idSecundario != 0)
                        { //OFERTA COMBO
                            sql += `INSERT INTO ${nombreTabla} (Botiga, Data, Dependenta, Num_tick, Estat, Plu, Quantitat, Import, Tipus_venta) VALUES (${data.parametros.codigoTienda}, CONVERT(datetime, '${year}-${month}-${day} ${hours}:${minutes}:${seconds}', 120), ${data.info.idTrabajador}, 0, '', ${data.info.lista[i].promocion.infoPromo.idPrincipal}, ${data.info.lista[i].promocion.infoPromo.cantidadPrincipal*data.info.lista[i].promocion.infoPromo.unidadesOferta}, ${data.info.lista[i].promocion.infoPromo.precioRealPrincipal.toFixed(2)}, 'V');`; 
                            sql += `INSERT INTO ${nombreTabla} (Botiga, Data, Dependenta, Num_tick, Estat, Plu, Quantitat, Import, Tipus_venta) VALUES (${data.parametros.codigoTienda}, CONVERT(datetime, '${year}-${month}-${day} ${hours}:${minutes}:${seconds}', 120), ${data.info.idTrabajador}, 0, '', ${data.info.lista[i].promocion.infoPromo.idSecundario}, ${data.info.lista[i].promocion.infoPromo.cantidadSecundario*data.info.lista[i].promocion.infoPromo.unidadesOferta}, ${data.info.lista[i].promocion.infoPromo.precioRealSecundario.toFixed(2)}, 'V');`; 
                            sqlGraella += `INSERT INTO [Servit-${year2}-${month}-${day}] (Id, TimeStamp, QuiStamp, Client, CodiArticle, PluUtilitzat, Viatge, Equip, QuantitatDemanada, QuantitatTornada ,QuantitatServida, MotiuModificacio, Hora, TipusComanda, Comentari, ComentariPer, Atribut, CitaDemanada, CitaServida, CitaTornada) VALUES (newid(), GETDATE(), 'Botiga ${data.parametros.nombreTienda}', ${data.parametros.codigoTienda}, ${data.info.lista[i].promocion.infoPromo.idPrincipal}, NULL, 'AUTO', 'AUTO', 0, ${data.info.lista[i].promocion.infoPromo.cantidadPrincipal*data.info.lista[i].promocion.infoPromo.unidadesOferta}, 0, NULL, 91, 2, '', NULL, NULL, '', '', '');`;
                            sqlGraella += `INSERT INTO [Servit-${year2}-${month}-${day}] (Id, TimeStamp, QuiStamp, Client, CodiArticle, PluUtilitzat, Viatge, Equip, QuantitatDemanada, QuantitatTornada ,QuantitatServida, MotiuModificacio, Hora, TipusComanda, Comentari, ComentariPer, Atribut, CitaDemanada, CitaServida, CitaTornada) VALUES (newid(), GETDATE(), 'Botiga ${data.parametros.nombreTienda}', ${data.parametros.codigoTienda}, ${data.info.lista[i].promocion.infoPromo.idSecundario}, NULL, 'AUTO', 'AUTO', 0, ${data.info.lista[i].promocion.infoPromo.cantidadSecundario*data.info.lista[i].promocion.infoPromo.unidadesOferta}, 0, NULL, 91, 2, '', NULL, NULL, '', '', '');`;
                        }
                        else
                        { //OFERTA INDIVIDUAL
                            sql += `INSERT INTO ${nombreTabla} (Botiga, Data, Dependenta, Num_tick, Estat, Plu, Quantitat, Import, Tipus_venta) VALUES (${data.parametros.codigoTienda}, CONVERT(datetime, '${year}-${month}-${day} ${hours}:${minutes}:${seconds}', 120), ${data.info.idTrabajador}, 0, '', ${data.info.lista[i].promocion.infoPromo.idPrincipal}, ${data.info.lista[i].promocion.infoPromo.cantidadPrincipal*data.info.lista[i].promocion.infoPromo.unidadesOferta}, ${data.info.lista[i].promocion.infoPromo.precioRealPrincipal.toFixed(2)}, 'V');`; 
                            sqlGraella += `INSERT INTO [Servit-${year2}-${month}-${day}] (Id, TimeStamp, QuiStamp, Client, CodiArticle, PluUtilitzat, Viatge, Equip, QuantitatDemanada, QuantitatTornada ,QuantitatServida, MotiuModificacio, Hora, TipusComanda, Comentari, ComentariPer, Atribut, CitaDemanada, CitaServida, CitaTornada) VALUES (newid(), GETDATE(), 'Botiga ${data.parametros.nombreTienda}', ${data.parametros.codigoTienda}, ${data.info.lista[i].promocion.infoPromo.idPrincipal}, NULL, 'AUTO', 'AUTO', 0, ${data.info.lista[i].promocion.infoPromo.cantidadPrincipal*data.info.lista[i].promocion.infoPromo.unidadesOferta}, 0, NULL, 91, 2, '', NULL, NULL, '', '', '');`;
                        }
                    }
                    else
                    {
                        sql += `INSERT INTO ${nombreTabla} (Botiga, Data, Dependenta, Num_tick, Estat, Plu, Quantitat, Import, Tipus_venta) VALUES (${data.parametros.codigoTienda}, CONVERT(datetime, '${year}-${month}-${day} ${hours}:${minutes}:${seconds}', 120), ${data.info.idTrabajador}, 0, '', ${idLista}, ${data.info.lista[i].unidades}, ${data.info.lista[i].subtotal}, 'V');`;
                        sqlGraella += `INSERT INTO [Servit-${year2}-${month}-${day}] (Id, TimeStamp, QuiStamp, Client, CodiArticle, PluUtilitzat, Viatge, Equip, QuantitatDemanada, QuantitatTornada ,QuantitatServida, MotiuModificacio, Hora, TipusComanda, Comentari, ComentariPer, Atribut, CitaDemanada, CitaServida, CitaTornada) VALUES (newid(), GETDATE(), 'Botiga ${data.parametros.nombreTienda}', ${data.parametros.codigoTienda}, ${idLista}, NULL, 'AUTO', 'AUTO', 0, ${data.info.lista[i].unidades}, 0, NULL, 91, 2, '', NULL, NULL, '', '', '');`;
                    }
                }
    
                conexion.recHit(data.parametros.database, sql+sqlGraella).then(res => {
                    socket.emit('confirmarEnvioDevolucion', {
                        idTicket: data.info._id,
                        respuestaSql: res
                    });
                });
            }catch(err){
                conexion.recHit('Hit', `insert into test_eze_report (error) values ('${JSON.stringify(data)} - ${String(err)}')`);
            }
        })
        /* GET PUNTOS DE UN CLIENTE */
        socket.on('get-puntos-cliente', (data) => {
            conexion.recHit(data.parametros.database, `SELECT Punts AS puntos FROM punts WHERE idClient = '${data.idCliente}'`).then(resultado=>{
                if(resultado.recordset.length == 1)
                {
                    if(data.imprimir) {
                        socket.emit('imprimir-ticket-cliente', {puntos: Number(resultado.recordset[0].puntos), infoTicket: data.infoParaImprimir});
                    } else {
                        socket.emit('get-puntos-cliente', Number(resultado.recordset[0].puntos));
                    }
                }
            });
        });
        /* FINAL GET PUNTOS DE UN CLIENTE*/

        /* GET TARIFA CLIENTE VIP */
        socket.on('cargarPreciosVIP', async (data) => {
            let resArticulos    = await conexion.recHit(data.database, 'SELECT Codi as _id, NOM as nombre, PREU as precioConIva, TipoIva as tipoIva, EsSumable as esSumable, Familia as familia, ISNULL(PreuMajor, 0) as precioBase FROM Articles');
            let auxArticulos    = await conexion.recHit(data.database, `SELECT Codi as id, PREU as precioConIva FROM TarifesEspecials WHERE TarifaCodi = (select [Desconte 5] from clients where Codi = ${data.idCliente}) AND TarifaCodi <> 0`);
            resArticulos.recordset = configurarTarifasEspeciales(resArticulos.recordset, auxArticulos.recordset);
            socket.emit('resCargarPreciosVIP', resArticulos.recordset);
        });
        /* FINAL GET TARIFA CLIENTE VIP */

        /* GUARDAR FICHAJES */
        socket.on('guardarFichajes', (data) => {
            var fechaEntrada = new Date(data.infoFichaje.fecha.year, data.infoFichaje.fecha.month, data.infoFichaje.fecha.day, data.infoFichaje.fecha.hours, data.infoFichaje.fecha.minutes, data.infoFichaje.fecha.seconds);

            let year = `${fechaEntrada.getFullYear()}`;
            let month = `${fechaEntrada.getMonth() + 1}`;
            let day = `${fechaEntrada.getDate()}`;
            let hours = `${fechaEntrada.getHours()}`;
            let minutes = `${fechaEntrada.getMinutes()}`;
            let seconds = `${fechaEntrada.getSeconds()}`;

            if (month.length === 1) {
                month = '0' + month;
            }
            if (day.length === 1) {
                day = '0' + day;
            }
            if (hours.length === 1) {
                hours = '0' + hours;
            }
            if (minutes.length === 1) {
                minutes = '0' + minutes;
            }
            if (seconds.length === 1) {
                seconds = '0' + seconds;
            }
            if (data.tipo === 'ENTRADA') {

                let sqlEntrada = `INSERT INTO cdpDadesFichador (id, tmst, accio, usuari, idr, lloc, comentari) VALUES (0, CONVERT(datetime, '${year}-${month}-${day} ${hours}:${minutes}:${seconds}', 120), 1, ${data.infoFichaje.idTrabajador}, NEWID(), ${data.idTienda}, '${data.nombreTienda}')`;
                conexion.recHit(data.database, sqlEntrada);
            }
            else {
                if (data.tipo === 'SALIDA') {
                    let sqlSalida = `INSERT INTO cdpDadesFichador (id, tmst, accio, usuari, idr, lloc, comentari) VALUES (0, CONVERT(datetime, '${year}-${month}-${day} ${hours}:${minutes}:${seconds}', 120), 2, ${data.infoFichaje.idTrabajador}, NEWID(), ${data.idTienda}, '${data.nombreTienda}')`;
                    conexion.recHit(data.database, sqlSalida);
                }
            }
        });
        /* GUARDAR FICHAJES TOC GAME V2*/
        socket.on('guardarFichajes-tocGame', (data) => { //A PARTIR DE TODOS LOS TOCS CON VERSIÓN SUPERIOR A LA 2.3.93, ESTA FUNCIÓN SE PUEDE BORRAR
            let sql = '';
            for(let i = 0; i < data.arrayFichajes.length; i++)
            {
                var fechaEntrada = new Date(data.arrayFichajes[i].infoFichaje.fecha.year, data.arrayFichajes[i].infoFichaje.fecha.month, data.arrayFichajes[i].infoFichaje.fecha.day, data.arrayFichajes[i].infoFichaje.fecha.hours, data.arrayFichajes[i].infoFichaje.fecha.minutes, data.arrayFichajes[i].infoFichaje.fecha.seconds);

                let year = `${fechaEntrada.getFullYear()}`;
                let month = `${fechaEntrada.getMonth() + 1}`;
                let day = `${fechaEntrada.getDate()}`;
                let hours = `${fechaEntrada.getHours()}`;
                let minutes = `${fechaEntrada.getMinutes()}`;
                let seconds = `${fechaEntrada.getSeconds()}`;
    
                if (month.length === 1) {
                    month = '0' + month;
                }
                if (day.length === 1) {
                    day = '0' + day;
                }
                if (hours.length === 1) {
                    hours = '0' + hours;
                }
                if (minutes.length === 1) {
                    minutes = '0' + minutes;
                }
                if (seconds.length === 1) {
                    seconds = '0' + seconds;
                }
                if (data.arrayFichajes[i].tipo === 'ENTRADA') 
                {
    
                    sql += `INSERT INTO cdpDadesFichador (id, tmst, accio, usuari, idr, lloc, comentari) VALUES (0, CONVERT(datetime, '${year}-${month}-${day} ${hours}:${minutes}:${seconds}', 120), 1, ${data.arrayFichajes[i].infoFichaje.idTrabajador}, NEWID(), ${data.parametros.codigoTienda}, '${data.parametros.nombreTienda}')`;
                }
                else 
                {
                    if (data.arrayFichajes[i].tipo === 'SALIDA') 
                    {
                        sql += `INSERT INTO cdpDadesFichador (id, tmst, accio, usuari, idr, lloc, comentari) VALUES (0, CONVERT(datetime, '${year}-${month}-${day} ${hours}:${minutes}:${seconds}', 120), 2, ${data.arrayFichajes[i].infoFichaje.idTrabajador}, NEWID(), ${data.parametros.codigoTienda}, '${data.parametros.nombreTienda}')`;
                    }
                }
                if(sql.length > 0)
                {
                    conexion.recHit(data.parametros.database, sql).then(()=>{
                        socket.emit('confirmarEnvioFichaje', data.arrayFichajes[i]._id);
                    });
                }
            }            
        });
        /* GUARDAR FICHAJES TOC GAME V2*/
        socket.on('guardarFichajes-tocGame-nueva', (data) => { //EL CAMBIO ES QUE AHORA SE INSERTAN INDIVIDUALMENTE, NO ESTÁ PROBADO SU FUNCIONAMIENTO CON GRANDES CANTIDADES DE DATOS ACUMULADOS A LA VEZ.
            try {
                let sql = '';
                var fechaEntrada = new Date(data.info.infoFichaje.fecha.year, data.info.infoFichaje.fecha.month, data.info.infoFichaje.fecha.day, data.info.infoFichaje.fecha.hours, data.info.infoFichaje.fecha.minutes, data.info.infoFichaje.fecha.seconds);
                
                let year = `${fechaEntrada.getFullYear()}`;
                let month = `${fechaEntrada.getMonth() + 1}`;
                let day = `${fechaEntrada.getDate()}`;
                let hours = `${fechaEntrada.getHours()}`;
                let minutes = `${fechaEntrada.getMinutes()}`;
                let seconds = `${fechaEntrada.getSeconds()}`;
    
                if (month.length === 1) {
                    month = '0' + month;
                }
                if (day.length === 1) {
                    day = '0' + day;
                }
                if (hours.length === 1) {
                    hours = '0' + hours;
                }
                if (minutes.length === 1) {
                    minutes = '0' + minutes;
                }
                if (seconds.length === 1) {
                    seconds = '0' + seconds;
                }
                if (data.info.tipo === 'ENTRADA') 
                {
    
                    sql += `INSERT INTO cdpDadesFichador (id, tmst, accio, usuari, idr, lloc, comentari) VALUES (0, CONVERT(datetime, '${year}-${month}-${day} ${hours}:${minutes}:${seconds}', 120), 1, ${data.info.infoFichaje.idTrabajador}, NEWID(), ${data.parametros.codigoTienda}, '${data.parametros.nombreTienda}')`;
                }
                else 
                {
                    if (data.info.tipo === 'SALIDA') 
                    {
                        sql += `INSERT INTO cdpDadesFichador (id, tmst, accio, usuari, idr, lloc, comentari) VALUES (0, CONVERT(datetime, '${year}-${month}-${day} ${hours}:${minutes}:${seconds}', 120), 2, ${data.info.infoFichaje.idTrabajador}, NEWID(), ${data.parametros.codigoTienda}, '${data.parametros.nombreTienda}')`;
                    }
                }
                if(sql.length > 0)
                {
                    conexion.recHit(data.parametros.database, sql).then(()=>{
                        socket.emit('confirmarEnvioFichaje', data.info._id);
                    });
                }   
            } catch(err){
                console.log(err);
                conexion.recHit('Hit', `insert into test_eze_report (error) values ('${JSON.stringify(data)} - ${String(err)}')`);
            }
        });

        /* INICIO GUARDAR MOVIMIENTOS (ENTRADA/SALIDA) VERSIÓN NUEVA*/
        socket.on('guardarMovimiento', (data) => {
            try
            {
                let sql = '';
                let sqlBarras = '';
                let fecha = new Date(data.info._id);
                let year = `${fecha.getFullYear()}`;
                let month = `${fecha.getMonth() + 1}`;
                let day = `${fecha.getDate()}`;
                let hours = `${fecha.getHours()}`;
                let minutes = `${fecha.getMinutes()}`;
                let seconds = `${fecha.getSeconds()}`;
    
                if (month.length === 1) {
                    month = '0' + month;
                }
                if (day.length === 1) {
                    day = '0' + day;
                }
                if (hours.length === 1) {
                    hours = '0' + hours;
                }
                if (minutes.length === 1) {
                    minutes = '0' + minutes;
                }
                if (seconds.length === 1) {
                    seconds = '0' + seconds;
                }
                if(typeof data.info.idTicket == "undefined")
                {
                    data.info.idTicket = 0;
                }
                let nombreTabla = '[V_Moviments_' + year + '-' + month + ']';
                let concepto = data.info.concepto;
                if(data.info.idTicket != -100) 
                {
                    switch(data.info.tipoExtra){
                        case 'TARJETA': concepto = `Pagat Targeta: ${data.info.idTicket}`; break;
                        case 'TKRS_CON_EXCESO': 
                            concepto = `Excs.TkRs:  [${data.info.idTicket}]`;
                            break;
                        case 'TKRS_SIN_EXCESO': 
                            concepto = `Pagat TkRs:  [${data.info.idTicket}]`;
                            break;
                        case 'CONSUMO_PERSONAL': break;
                        case 'DEUDA': break; //el concepto de deuda se controla desde el tocGame
                    }
                    if(data.info.tipoExtra == 'TKRS'){
                        concepto = ``;
                    }
                    else if(data.info.tipoExtra == 'TARJETA'){
                        
                    }
                    
                }
                if(typeof data.info.idTrabajador == "undefined")
                {
                    data.info.idTrabajador = 975;
                }


                sql = `INSERT INTO ${nombreTabla} (Botiga, Data, Dependenta, Tipus_moviment, Import, Motiu) VALUES (${data.parametros.codigoTienda}, CONVERT(datetime, '${year}-${month}-${day} ${hours}:${minutes}:${seconds}', 120), ${data.info.idTrabajador}, '${(data.info.tipo == "SALIDA") ? 'O':'A'}', ${(data.info.tipo == "SALIDA") ? -data.info.valor : data.info.valor}, '${concepto}');`;
                if(data.info.codigoBarras != "")
                {
                    sqlBarras = `INSERT INTO CodisBarresReferencies (Num, Tipus, Estat, Data, TmSt, Param1, Param2, Param3, Param4) VALUES (${data.info.codigoBarras}, 'Moviments', 'Creat', CONVERT(datetime, '${year}-${month}-${day} ${hours}:${minutes}:${seconds}', 120), CONVERT(datetime, '${year}-${month}-${day} ${hours}:${minutes}:${seconds}', 120), ${data.parametros.licencia}, ${data.info.idTrabajador}, ${-data.info.valor}, '${day}/${month}/${year} ${hours}:${minutes}:${seconds}');`;
                }

                conexion.recHit(data.parametros.database, sql+sqlBarras).then(res2 => {
                    socket.emit('confirmarEnvioMovimiento', {
                        idMovimiento: data.info._id,
                        respuestaSql: res2
                    });
                }).catch(err=>{
                    console.log("Entro en el catch maldito");
                    conexion.recHit('Hit', `insert into test_eze_report (error) values ('${JSON.stringify(data)} - ${String(err)}')`);
                });            
            }
            catch(err)
            {
                conexion.recHit('Hit', `insert into test_eze_report (error) values ('${JSON.stringify(data)} - ${String(err)}')`);
                console.log(err);
                console.log("Error en: ", data.info)
            }
        });
        /* FIN GUARDAR MOVIMIENTOS (ENTRADA/SALIDA) VERSIÓN NUEVA*/

        /* FIN GUARDAR TICKET */
        /* GUARDAR CAJAS */
    socket.on('guardar-caja', (data) => {
            try{
                let fechaFinal = new Date(data.info.finalTime);
                let fechaInicio = new Date(data.info.inicioTime);
    
                let finalYear = `${fechaFinal.getFullYear()}`;
                let finalMonth = `${fechaFinal.getMonth() + 1}`;
                let finalDay = `${fechaFinal.getDate()}`;
                let finalHours = `${fechaFinal.getHours()}`;
                let finalMinutes = `${fechaFinal.getMinutes()}`;
                let finalSeconds = `${fechaFinal.getSeconds()}`;
    
                let inicioYear = `${fechaInicio.getFullYear()}`;
                let inicioMonth = `${fechaInicio.getMonth() + 1}`;
                let inicioDay = `${fechaInicio.getDate()}`;
                let inicioHours = `${fechaInicio.getHours()}`;
                let inicioMinutes = `${fechaInicio.getMinutes()}`;
                let inicioSeconds = `${fechaInicio.getSeconds()}`;
    
                let descuadre = data.info.descuadre;
                let nClientes = data.info.nClientes;
    
                if (finalMonth.length === 1) {
                    finalMonth = '0' + finalMonth;
                }
                if (finalDay.length === 1) {
                    finalDay = '0' + finalDay;
                }
                if (finalHours.length === 1) {
                    finalHours = '0' + finalHours;
                }
                if (finalMinutes.length === 1) {
                    finalMinutes = '0' + finalMinutes;
                }
                if (finalSeconds.length === 1) {
                    finalSeconds = '0' + finalSeconds;
                }
                //-------------------------------------
                if (inicioMonth.length === 1) {
                    inicioMonth = '0' + inicioMonth;
                }
                if (inicioDay.length === 1) {
                    inicioDay = '0' + inicioDay;
                }
                if (inicioHours.length === 1) {
                    inicioHours = '0' + inicioHours;
                }
                if (inicioMinutes.length === 1) {
                    inicioMinutes = '0' + inicioMinutes;
                }
                if (inicioMinutes.length === 1) {
                    inicioMinutes = '0' + inicioMinutes;
                }
    
                let sqlZGJ = '';
                let sqlW = '';
                let sqlWi = '';
                let sqlO = '';
                let sqlAna = '';
                let sqlAna2 = '';
                let nombreTabla = '[V_Moviments_' + finalYear + '-' + finalMonth + ']';
    
                sqlZGJ = `
                            INSERT INTO ${nombreTabla} (Botiga, Data, Dependenta, Tipus_moviment, Import, Motiu) VALUES (${data.parametros.codigoTienda}, CONVERT(datetime, '${finalYear}-${finalMonth}-${finalDay} ${finalHours}:${finalMinutes}:${finalSeconds}', 120), ${data.info.idDependienta}, 'Z', ${data.info.calaixFetZ}, '');
                            INSERT INTO ${nombreTabla} (Botiga, Data, Dependenta, Tipus_moviment, Import, Motiu) VALUES (${data.parametros.codigoTienda}, CONVERT(datetime, '${finalYear}-${finalMonth}-${finalDay} ${finalHours}:${finalMinutes}:${finalSeconds}', 120), ${data.info.idDependienta}, 'G', ${nClientes}, '');
                            INSERT INTO ${nombreTabla} (Botiga, Data, Dependenta, Tipus_moviment, Import, Motiu) VALUES (${data.parametros.codigoTienda}, CONVERT(datetime, '${finalYear}-${finalMonth}-${finalDay} ${finalHours}:${finalMinutes}:${finalSeconds}', 120), ${data.info.idDependienta}, 'J', ${descuadre}, '');
                        `;
    
                sqlW = `
                            INSERT INTO ${nombreTabla} (Botiga, Data, Dependenta, Tipus_moviment, Import, Motiu) VALUES (${data.parametros.codigoTienda}, CONVERT(datetime, '${finalYear}-${finalMonth}-${finalDay} ${finalHours}:${finalMinutes}:${finalSeconds}', 120), ${data.info.idDependienta}, 'W', ${data.info.detalleCierre[0].valor}, 'En : 0.01');
                            INSERT INTO ${nombreTabla} (Botiga, Data, Dependenta, Tipus_moviment, Import, Motiu) VALUES (${data.parametros.codigoTienda}, CONVERT(datetime, '${finalYear}-${finalMonth}-${finalDay} ${finalHours}:${finalMinutes}:${finalSeconds}', 120), ${data.info.idDependienta}, 'W', ${data.info.detalleCierre[1].valor}, 'En : 0.02');
                            INSERT INTO ${nombreTabla} (Botiga, Data, Dependenta, Tipus_moviment, Import, Motiu) VALUES (${data.parametros.codigoTienda}, CONVERT(datetime, '${finalYear}-${finalMonth}-${finalDay} ${finalHours}:${finalMinutes}:${finalSeconds}', 120), ${data.info.idDependienta}, 'W', ${data.info.detalleCierre[2].valor}, 'En : 0.05');
                            INSERT INTO ${nombreTabla} (Botiga, Data, Dependenta, Tipus_moviment, Import, Motiu) VALUES (${data.parametros.codigoTienda}, CONVERT(datetime, '${finalYear}-${finalMonth}-${finalDay} ${finalHours}:${finalMinutes}:${finalSeconds}', 120), ${data.info.idDependienta}, 'W', ${data.info.detalleCierre[3].valor}, 'En : 0.1');
                            INSERT INTO ${nombreTabla} (Botiga, Data, Dependenta, Tipus_moviment, Import, Motiu) VALUES (${data.parametros.codigoTienda}, CONVERT(datetime, '${finalYear}-${finalMonth}-${finalDay} ${finalHours}:${finalMinutes}:${finalSeconds}', 120), ${data.info.idDependienta}, 'W', ${data.info.detalleCierre[4].valor}, 'En : 0.2');
                            INSERT INTO ${nombreTabla} (Botiga, Data, Dependenta, Tipus_moviment, Import, Motiu) VALUES (${data.parametros.codigoTienda}, CONVERT(datetime, '${finalYear}-${finalMonth}-${finalDay} ${finalHours}:${finalMinutes}:${finalSeconds}', 120), ${data.info.idDependienta}, 'W', ${data.info.detalleCierre[5].valor}, 'En : 0.5');
                            INSERT INTO ${nombreTabla} (Botiga, Data, Dependenta, Tipus_moviment, Import, Motiu) VALUES (${data.parametros.codigoTienda}, CONVERT(datetime, '${finalYear}-${finalMonth}-${finalDay} ${finalHours}:${finalMinutes}:${finalSeconds}', 120), ${data.info.idDependienta}, 'W', ${data.info.detalleCierre[6].valor}, 'En : 1');
                            INSERT INTO ${nombreTabla} (Botiga, Data, Dependenta, Tipus_moviment, Import, Motiu) VALUES (${data.parametros.codigoTienda}, CONVERT(datetime, '${finalYear}-${finalMonth}-${finalDay} ${finalHours}:${finalMinutes}:${finalSeconds}', 120), ${data.info.idDependienta}, 'W', ${data.info.detalleCierre[7].valor}, 'En : 2');
                            INSERT INTO ${nombreTabla} (Botiga, Data, Dependenta, Tipus_moviment, Import, Motiu) VALUES (${data.parametros.codigoTienda}, CONVERT(datetime, '${finalYear}-${finalMonth}-${finalDay} ${finalHours}:${finalMinutes}:${finalSeconds}', 120), ${data.info.idDependienta}, 'W', ${data.info.detalleCierre[8].valor}, 'En : 5');
                            INSERT INTO ${nombreTabla} (Botiga, Data, Dependenta, Tipus_moviment, Import, Motiu) VALUES (${data.parametros.codigoTienda}, CONVERT(datetime, '${finalYear}-${finalMonth}-${finalDay} ${finalHours}:${finalMinutes}:${finalSeconds}', 120), ${data.info.idDependienta}, 'W', ${data.info.detalleCierre[9].valor}, 'En : 10');
                            INSERT INTO ${nombreTabla} (Botiga, Data, Dependenta, Tipus_moviment, Import, Motiu) VALUES (${data.parametros.codigoTienda}, CONVERT(datetime, '${finalYear}-${finalMonth}-${finalDay} ${finalHours}:${finalMinutes}:${finalSeconds}', 120), ${data.info.idDependienta}, 'W', ${data.info.detalleCierre[10].valor}, 'En : 20');
                            INSERT INTO ${nombreTabla} (Botiga, Data, Dependenta, Tipus_moviment, Import, Motiu) VALUES (${data.parametros.codigoTienda}, CONVERT(datetime, '${finalYear}-${finalMonth}-${finalDay} ${finalHours}:${finalMinutes}:${finalSeconds}', 120), ${data.info.idDependienta}, 'W', ${data.info.detalleCierre[11].valor}, 'En : 50');
                            INSERT INTO ${nombreTabla} (Botiga, Data, Dependenta, Tipus_moviment, Import, Motiu) VALUES (${data.parametros.codigoTienda}, CONVERT(datetime, '${finalYear}-${finalMonth}-${finalDay} ${finalHours}:${finalMinutes}:${finalSeconds}', 120), ${data.info.idDependienta}, 'W', ${data.info.detalleCierre[12].valor}, 'En : 100');
                            INSERT INTO ${nombreTabla} (Botiga, Data, Dependenta, Tipus_moviment, Import, Motiu) VALUES (${data.parametros.codigoTienda}, CONVERT(datetime, '${finalYear}-${finalMonth}-${finalDay} ${finalHours}:${finalMinutes}:${finalSeconds}', 120), ${data.info.idDependienta}, 'W', ${data.info.detalleCierre[13].valor}, 'En : 200');
                            INSERT INTO ${nombreTabla} (Botiga, Data, Dependenta, Tipus_moviment, Import, Motiu) VALUES (${data.parametros.codigoTienda}, CONVERT(datetime, '${finalYear}-${finalMonth}-${finalDay} ${finalHours}:${finalMinutes}:${finalSeconds}', 120), ${data.info.idDependienta}, 'W', ${data.info.detalleCierre[14].valor}, 'En : 500');
                        `;
                sqlWi = `
                            INSERT INTO ${nombreTabla} (Botiga, Data, Dependenta, Tipus_moviment, Import, Motiu) VALUES (${data.parametros.codigoTienda}, CONVERT(datetime, '${inicioYear}-${inicioMonth}-${inicioDay} ${inicioHours}:${inicioMinutes}:${inicioSeconds}', 120), ${data.info.idDependienta}, 'Wi', ${data.info.detalleApertura[0].valor}, 'En : 0.01');
                            INSERT INTO ${nombreTabla} (Botiga, Data, Dependenta, Tipus_moviment, Import, Motiu) VALUES (${data.parametros.codigoTienda}, CONVERT(datetime, '${inicioYear}-${inicioMonth}-${inicioDay} ${inicioHours}:${inicioMinutes}:${inicioSeconds}', 120), ${data.info.idDependienta}, 'Wi', ${data.info.detalleApertura[1].valor}, 'En : 0.02');
                            INSERT INTO ${nombreTabla} (Botiga, Data, Dependenta, Tipus_moviment, Import, Motiu) VALUES (${data.parametros.codigoTienda}, CONVERT(datetime, '${inicioYear}-${inicioMonth}-${inicioDay} ${inicioHours}:${inicioMinutes}:${inicioSeconds}', 120), ${data.info.idDependienta}, 'Wi', ${data.info.detalleApertura[2].valor}, 'En : 0.05');
                            INSERT INTO ${nombreTabla} (Botiga, Data, Dependenta, Tipus_moviment, Import, Motiu) VALUES (${data.parametros.codigoTienda}, CONVERT(datetime, '${inicioYear}-${inicioMonth}-${inicioDay} ${inicioHours}:${inicioMinutes}:${inicioSeconds}', 120), ${data.info.idDependienta}, 'Wi', ${data.info.detalleApertura[3].valor}, 'En : 0.1');
                            INSERT INTO ${nombreTabla} (Botiga, Data, Dependenta, Tipus_moviment, Import, Motiu) VALUES (${data.parametros.codigoTienda}, CONVERT(datetime, '${inicioYear}-${inicioMonth}-${inicioDay} ${inicioHours}:${inicioMinutes}:${inicioSeconds}', 120), ${data.info.idDependienta}, 'Wi', ${data.info.detalleApertura[4].valor}, 'En : 0.2');
                            INSERT INTO ${nombreTabla} (Botiga, Data, Dependenta, Tipus_moviment, Import, Motiu) VALUES (${data.parametros.codigoTienda}, CONVERT(datetime, '${inicioYear}-${inicioMonth}-${inicioDay} ${inicioHours}:${inicioMinutes}:${inicioSeconds}', 120), ${data.info.idDependienta}, 'Wi', ${data.info.detalleApertura[5].valor}, 'En : 0.5');
                            INSERT INTO ${nombreTabla} (Botiga, Data, Dependenta, Tipus_moviment, Import, Motiu) VALUES (${data.parametros.codigoTienda}, CONVERT(datetime, '${inicioYear}-${inicioMonth}-${inicioDay} ${inicioHours}:${inicioMinutes}:${inicioSeconds}', 120), ${data.info.idDependienta}, 'Wi', ${data.info.detalleApertura[6].valor}, 'En : 1');
                            INSERT INTO ${nombreTabla} (Botiga, Data, Dependenta, Tipus_moviment, Import, Motiu) VALUES (${data.parametros.codigoTienda}, CONVERT(datetime, '${inicioYear}-${inicioMonth}-${inicioDay} ${inicioHours}:${inicioMinutes}:${inicioSeconds}', 120), ${data.info.idDependienta}, 'Wi', ${data.info.detalleApertura[7].valor}, 'En : 2');
                            INSERT INTO ${nombreTabla} (Botiga, Data, Dependenta, Tipus_moviment, Import, Motiu) VALUES (${data.parametros.codigoTienda}, CONVERT(datetime, '${inicioYear}-${inicioMonth}-${inicioDay} ${inicioHours}:${inicioMinutes}:${inicioSeconds}', 120), ${data.info.idDependienta}, 'Wi', ${data.info.detalleApertura[8].valor}, 'En : 5');
                            INSERT INTO ${nombreTabla} (Botiga, Data, Dependenta, Tipus_moviment, Import, Motiu) VALUES (${data.parametros.codigoTienda}, CONVERT(datetime, '${inicioYear}-${inicioMonth}-${inicioDay} ${inicioHours}:${inicioMinutes}:${inicioSeconds}', 120), ${data.info.idDependienta}, 'Wi', ${data.info.detalleApertura[9].valor}, 'En : 10');
                            INSERT INTO ${nombreTabla} (Botiga, Data, Dependenta, Tipus_moviment, Import, Motiu) VALUES (${data.parametros.codigoTienda}, CONVERT(datetime, '${inicioYear}-${inicioMonth}-${inicioDay} ${inicioHours}:${inicioMinutes}:${inicioSeconds}', 120), ${data.info.idDependienta}, 'Wi', ${data.info.detalleApertura[10].valor}, 'En : 20');
                            INSERT INTO ${nombreTabla} (Botiga, Data, Dependenta, Tipus_moviment, Import, Motiu) VALUES (${data.parametros.codigoTienda}, CONVERT(datetime, '${inicioYear}-${inicioMonth}-${inicioDay} ${inicioHours}:${inicioMinutes}:${inicioSeconds}', 120), ${data.info.idDependienta}, 'Wi', ${data.info.detalleApertura[11].valor}, 'En : 50');
                            INSERT INTO ${nombreTabla} (Botiga, Data, Dependenta, Tipus_moviment, Import, Motiu) VALUES (${data.parametros.codigoTienda}, CONVERT(datetime, '${inicioYear}-${inicioMonth}-${inicioDay} ${inicioHours}:${inicioMinutes}:${inicioSeconds}', 120), ${data.info.idDependienta}, 'Wi', ${data.info.detalleApertura[12].valor}, 'En : 100');
                            INSERT INTO ${nombreTabla} (Botiga, Data, Dependenta, Tipus_moviment, Import, Motiu) VALUES (${data.parametros.codigoTienda}, CONVERT(datetime, '${inicioYear}-${inicioMonth}-${inicioDay} ${inicioHours}:${inicioMinutes}:${inicioSeconds}', 120), ${data.info.idDependienta}, 'Wi', ${data.info.detalleApertura[13].valor}, 'En : 200');
                            INSERT INTO ${nombreTabla} (Botiga, Data, Dependenta, Tipus_moviment, Import, Motiu) VALUES (${data.parametros.codigoTienda}, CONVERT(datetime, '${inicioYear}-${inicioMonth}-${inicioDay} ${inicioHours}:${inicioMinutes}:${inicioSeconds}', 120), ${data.info.idDependienta}, 'Wi', ${data.info.detalleApertura[14].valor}, 'En : 500');
                `;
    
                sqlAna = `INSERT INTO feinesafer VALUES (newid(), 'VigilarAlertes', 0, 'Caixa', '[${inicioDay}-${inicioMonth}-${inicioYear} de ${inicioHours}:${inicioMinutes} a ${finalHours}:${finalMinutes}]', '[${data.parametros.codigoTienda}]', '${descuadre}', '${data.info.calaixFetZ}', getdate());`;
                sqlAna2 = `insert into feinesafer values (newid(), 'SincroMURANOCaixaOnLine', 0, '[${data.parametros.codigoTienda}]', '[${inicioDay}-${inicioMonth}-${inicioYear} ${inicioHours}:${inicioMinutes}:${inicioSeconds}]', '[${finalDay}-${finalMonth}-${finalYear} ${finalHours}:${finalMinutes}:${finalSeconds}]', '[${data.info.primerTicket},${data.info.ultimoTicket}]', '[${data.info.calaixFetZ}]', getdate());`;
                sqlPrevisiones =  `INSERT INTO feinesafer values (newid(), 'PrevisionsVendesDiari', 0, '${finalDay}/${finalMonth}/${finalYear}', '${data.parametros.codigoTienda}', '${(Number(finalHours) < 16) ? 'MATI': 'TARDA'}', '' ,'', GETDATE());`;
                let sqlCompleta = sqlZGJ + sqlW + sqlWi + sqlAna + sqlAna2 + sqlPrevisiones;
                conexion.recHit(data.parametros.database, sqlCompleta).then(aux => {
                    socket.emit('confirmarEnvioCaja', {
                        idCaja: data.info._id,
                        respuestaSql: aux
                    });
                });
            }catch(err){
                console.log(err);
                conexion.recHit('Hit', `insert into test_eze_report (error) values ('${JSON.stringify(data)} - ${String(err)}')`);
            }
        });

        /* FIN GUARDAR CAJAS */
        /* INICIO COMPROBAR Y GUARDAR NUEVO CLIENTE*/
        socket.on('guardarNuevoCliente', (data) => {
            const idTarjetaCliente  = data.idTarjetaCliente; //STRING
            const nombreCliente     = data.nombreCliente;
            const idCliente         = data.idCliente;
            
            try
            {
                conexion.recHit(data.parametros.database, `
                    INSERT INTO ClientsFinals (Id, IdExterna, Nom, Nif, Telefon, Adreca, emili, Descompte, Altres) VALUES ('${idCliente}', '${idTarjetaCliente}', '${nombreCliente}', NULL, '', '', '', '', '');
                    INSERT INTO Punts (IdClient, Punts, data, Punts2, data2) VALUES ('${idCliente}', 0, GETDATE(), NULL, NULL);
                `);
            }
            catch(err)
            {
                conexion.recHit('Hit', `insert into test_eze_report (error) values ('${JSON.stringify(data)} - ${String(err)}')`);
                console.log(err);
                console.log("Error en: ", data.info)
            }
        });
        /* FIN COMPROBAR Y GUARDAR NUEVO CLIENTE*/
        /* COMPROBAR E INSTALAR LICENCIA */
        socket.on('install-licencia', (data) => {
            if (data.password == 'LOperas93786') {
                const sqlParaImprimir = `SELECT ll.Llicencia, ll.Empresa, ll.LastAccess, we.Db, ISNULL(ti.ultimoIdTicket, 0) as ultimoIdTicket, ti.token FROM llicencies ll LEFT JOIN Web_Empreses we ON ll.Empresa = we.Nom LEFT JOIN tocGameInfo ti ON ti.licencia = ${data.numLicencia} WHERE ll.Llicencia = ${data.numLicencia}`;
                
                conexion.recHit('Hit', sqlParaImprimir).then(function (data) {
                    const sqlParaImprimir2 = `SELECT Nom, Codi as codigoTienda FROM clients WHERE Codi = (SELECT Valor1 FROM ParamsHw WHERE Codi = ${data.recordset[0].Llicencia})`;
                    
                    conexion.recHit(data.recordset[0].Db, sqlParaImprimir2).then(data2 => {
                        if (data.recordset.length === 1) {
                            conexion.recHit(data.recordset[0].Db, `SELECT Valor FROM paramstpv WHERE CodiClient = ${data.recordset[0].Llicencia} AND (Variable = 'BotonsPreu' OR Variable = 'ProhibirCercaArticles')`).then(dataF => {
                                socket.emit('install-licencia', {
                                    licencia: parseInt(data.recordset[0].Llicencia),
                                    nombreEmpresa: data.recordset[0].Empresa,
                                    database: data.recordset[0].Db,
                                    error: false,
                                    nombreTienda: data2.recordset[0].Nom,
                                    codigoTienda: data2.recordset[0].codigoTienda,
                                    ultimoTicket: data.recordset[0].ultimoIdTicket,
                                    botonesConPrecios: dataF.recordset[0].Valor,
                                    prohibirBuscarArticulos: dataF.recordset[1].Valor,
                                    token: data.recordset[0].token
                                });
                            })
                            
                        }
                        else {
                            socket.emit('install-licencia', {
                                error: true,
                                infoError: "No hay UN resultado con estos datos"
                            });
                        }
                    });
                });
            }
            else {
                socket.emit('install-licencia', {
                    error: true,
                    infoError: "Contraseña incorrecta"
                });
            }
        });

        /*ACTUALIZAR TOC INDIVIDUAL NUEVA */
        socket.on('actualizarTocGameIndividual'), ((socketId) => {
            io.to(socketId).emit('actualizarTocGame');
        });
        
        /* FIN ACTUALIZAR TOC INDIVIDUAL NUEVA*/
        
        /* ACTUALIZAR TOC INDIVIDUAL */
        socket.on('peticion-actualizar-toc', (stringLicencia) => {
            io.emit('orden-actualizar-toc', stringLicencia);
        });
        /* FIN ACTUALIZAR TOC INDIVIDUAL */

        /* ACTUALIZAR TOC ALL */
        socket.on('peticion-actualizar-toc-all', () => {
            io.emit('orden-actualizar-toc-all', 'ACTUALIZAR');
        });
        /* FIN ACTUALIZAR TOC ALL */

        /* DESCARGAR ARTÍCULOS */
        socket.on('descargar-articulos', (data) => {
            conexion.recHit(data.database, 'SELECT Codi as id, NOM as nombre, PREU as precioConIva, TipoIva as tipoIva, EsSumable as aPeso, Familia as familia, ISNULL(PreuMajor, 0) as precioBase FROM Articles').then(resSQL => {
                if (resSQL) {
                    conexion.recHit(data.database, `SELECT Codi as id, PREU as precioConIva FROM TarifesEspecials WHERE TarifaCodi = (select [Desconte 5] from clients where Codi = ${data.codigoTienda}) AND TarifaCodi <> 0`).then(infoTarifas => {
                        if (infoTarifas) {
                            if (infoTarifas.recordset.length > 0) {
                                resSQL.recordset = configurarTarifasEspecialesViejo(resSQL.recordset, infoTarifas.recordset);
                            }
                            socket.emit('descargar-articulos', resSQL.recordset);
                        }
                        else {
                            socket.emit('error', "Error en la respuesta de la consulta SQL infoTarifas");
                        }
                    });
                }
                else {
                    socket.emit('error', "Error en la respuesta de la consulta SQL resSQL");
                }
            });
        });
        /* FIN DESCARGAR ARTÍCULOS*/

        /* DESCARGAR TRABAJADORES */
        socket.on('descargar-trabajadores', (data) => {
            conexion.recHit(data.database, 'select Codi as idTrabajador, Codi as _id, nom as nombre, memo as nombreCorto from dependentes').then(resSQL => {
                if (resSQL) {
                    socket.emit('descargar-trabajadores', resSQL.recordset);
                }
                else {
                    socket.emit('error', "Error en la respuesta de la consulta SQL resSQL");
                }
            });
        });
        /* FIN DESCARGAR TRABAJADORES */

        /* DESCARGAR CLIENTES */
        socket.on('descargar-clientes', (data) => {
            conexion.recHit(data.database, "select Id as id, Nom as nombre, IdExterna as tarjetaCliente from ClientsFinals WHERE Id IS NOT NULL AND Id <> ''").then(resSQL => {
                if (resSQL) {
                    socket.emit('descargar-clientes', resSQL.recordset);

                }
                else {
                    socket.emit('error', "Error en la respuesta de la consulta SQL resSQL");
                }
            });
        });
        /* FIN DESCARGAR CLIENTES */

        /* DESCARGAR PROMOCIONES */
        socket.on('descargar-promociones', (data) => {
            let sqlPromos = `SELECT Id as id, Di as fechaInicio, Df as fechaFinal, D_Producte as principal, D_Quantitat as cantidadPrincipal, S_Producte as secundario, S_Quantitat as cantidadSecundario, S_Preu as precioFinal FROM ProductesPromocionats WHERE Client = ${data.licencia}`;// AND Df > GETDATE()`;
            conexion.recHit(data.database, sqlPromos).then(resSQL => {
                if (resSQL) {
                    socket.emit('descargar-promociones', resSQL.recordset);

                }
                else {
                    socket.emit('error', "Error en la respuesta de la consulta SQL resSQL");
                }
            });
        });
        /* FIN DESCARGAR PROMOCIONES */

        /* DESCARGAR FAMILIAS */
        socket.on('descargar-familias', (data) => {
            conexion.recHit(data.database, 'SELECT Nom as nombre, Pare as padre FROM Families WHERE Nivell > 0').then(resSQL => {
                if (resSQL) {
                    socket.emit('descargar-familias', resSQL.recordset);

                }
                else {
                    socket.emit('error', "Error en la respuesta de la consulta SQL resSQL");
                }
            });
        });
        /* FIN DESCARGAR FAMILIAS */

        //DESCONEXIÓN
        socket.on('disconnect', async function() {
            for (let i = 0; i < arrayTPV.length; i++) { 
                if (arrayTPV[i].id === socket.id) { 
                    await conexion.recHit('Hit', `UPDATE tocGameInfo SET ultimaConexion = ${Date.now()} WHERE token = '${arrayTPV[i].token}'`);
                    arrayTPV.splice(i, 1);
                    break;
                }            
            }
            getNodosSanPedro(arrayTPV).then((lista) => {
                for (let i = 0; i < arrayTPV.length; i++) {
                    if (arrayTPV[i].token == 'tpv-gestion') {
                        io.to(arrayTPV[i].id).emit('getNodosSanPedro', lista);
                    }
                }                
            });
        })

        /* GET NODOS & IDENTIFICACIÓN DE LOS TPV */
        socket.on('getNodosSanPedro', () => {
            getNodosSanPedro(arrayTPV).then((lista) => {
                io.to(socket.id).emit('getNodosSanPedro', lista);              
            });            
        });
        /* FIN GET NODOS & IDENTIFICACIÓN DE LOS TPV */

        /* DESCARGAR TECLADO */
        socket.on('descargar-teclado', async (data) => {
            let resMenus        = await conexion.recHit(data.database, `SELECT DISTINCT Ambient as nomMenu FROM TeclatsTpv WHERE Llicencia = ${data.licencia} AND Data = (select MAX(Data) FROM TeclatsTpv WHERE Llicencia = ${data.licencia} )`);
            let resTeclas       = await conexion.recHit(data.database, `SELECT Data, Ambient as nomMenu, (select EsSumable from articles where codi = article) as esSumable, (select nom from articles where codi = article) as nombreArticulo, article as idArticle, pos, color FROM TeclatsTpv WHERE Llicencia = ${data.licencia} AND Data = (select MAX(Data) FROM TeclatsTpv WHERE Llicencia = ${data.licencia} )`);
            let resArticulos    = await conexion.recHit(data.database, 'SELECT Codi as _id, NOM as nombre, PREU as precioConIva, TipoIva as tipoIva, EsSumable as esSumable, Familia as familia, ISNULL(PreuMajor, 0) as precioBase FROM Articles');
            let auxArticulos    = await conexion.recHit(data.database, `SELECT Codi as id, PREU as precioConIva FROM TarifesEspecials WHERE TarifaCodi = (select [Desconte 5] from clients where Codi = ${data.codigoTienda}) AND TarifaCodi <> 0`);
            resArticulos.recordset = configurarTarifasEspeciales(resArticulos.recordset, auxArticulos.recordset);
            let resFamilias     = await conexion.recHit(data.database, 'SELECT Nom as nombre, Pare as padre FROM Families WHERE Nivell > 0');
            let resPromos       = await conexion.recHit(data.database, `SELECT Id as _id, Di as fechaInicio, Df as fechaFinal, D_Producte as principal, D_Quantitat as cantidadPrincipal, S_Producte as secundario, S_Quantitat as cantidadSecundario, S_Preu as precioFinal FROM ProductesPromocionats WHERE Client = ${data.licencia}`);
            resPromos = await familiasPorObjetos(resPromos, data.database, data.codigoTienda, conexion);
            if(resMenus && resTeclas && resArticulos && auxArticulos && resFamilias && resPromos)
            {
                let objEnviar = {
                    error: false,
                    menus: resMenus.recordset,
                    teclas: resTeclas.recordset,
                    articulos: resArticulos.recordset,
                    familias: resFamilias.recordset,
                    promociones: resPromos.recordset
                }
                socket.emit('res-descargar-teclado', objEnviar);
            }
            else
            {
                socket.emit('res-descargar-teclado', {error: true});
            }
        });
        /* FIN DESCARGAR TECLADO */
        /* DESCARGAR TECLADO */
        socket.on('descargar-clientes-finales', (data) => { //PARA LA SINCRONIZACION MANUAL DEL TOC, NO ESTÁ EN USO AHORA, PERO LO  DEBE ESTAR.
            conexion.recHit(data.database, "select Id as id, Nom as nombre, IdExterna as tarjetaCliente from ClientsFinals WHERE Id IS NOT NULL AND Id <> ''").then(info=>{
                socket.emit('res-descargar-clientes-finales', info.recordset);
            });
        });
        /* FIN DESCARGAR TECLADO */

        /* OTRA */
        socket.on('cargar-todo', (data) => 
        {
            conexion.recHit(data.database, `SELECT Valor1 as codigoCliente FROM ParamsHw WHERE Codi = ${data.licencia}`).then(res8 => {
                let codigoCliente = res8.recordset[0].codigoCliente;
                if (res8) {
                    conexion.recHit(data.database, 'SELECT Codi as _id, NOM as nombre, PREU as precioConIva, TipoIva as tipoIva, EsSumable as esSumable, Familia as familia, ISNULL(PreuMajor, 0) as precioBase FROM Articles').then(res2 => {
                        conexion.recHit(data.database, `SELECT Codi as id, PREU as precioConIva FROM TarifesEspecials WHERE TarifaCodi = (select [Desconte 5] from clients where Codi = ${codigoCliente}) AND TarifaCodi <> 0`).then(res7 => {
                            if (res7) 
                            {
                                if (res7.recordset.length > 0) 
                                {
                                    res2.recordset = configurarTarifasEspeciales(res2.recordset, res7.recordset);
                                }
                                conexion.recHit(data.database, `SELECT DISTINCT Ambient as nomMenu FROM TeclatsTpv WHERE Llicencia = ${data.licencia} AND Data = (select MAX(Data) FROM TeclatsTpv WHERE Llicencia = ${data.licencia} )`).then(res1 => 
                                    {
                                    if (res1) 
                                    {
                                        conexion.recHit(data.database, `SELECT Data, Ambient as nomMenu, (select EsSumable from articles where codi = article) as esSumable, (select nom from articles where codi = article) as nombreArticulo, article as idArticle, pos, color FROM TeclatsTpv WHERE Llicencia = ${data.licencia} AND Data = (select MAX(Data) FROM TeclatsTpv WHERE Llicencia = ${data.licencia} )`).then((res) => {
                                            if (res) {
                                                conexion.recHit(data.database, 'select Codi as idTrabajador, Codi as _id, nom as nombre, memo as nombreCorto from dependentes').then(res3 => {
                                                    if (res3) {
                                                        conexion.recHit(data.database, 'SELECT Nom as nombre, Pare as padre FROM Families WHERE Nivell > 0').then(res4 => {
                                                            if (res4) { //Esta consulta debería buscar el codigo de cliente en el paramsHw, según la licencia data.licencia
                                                                let sqlPromos = `SELECT Id as _id, Di as fechaInicio, Df as fechaFinal, D_Producte as principal, D_Quantitat as cantidadPrincipal, S_Producte as secundario, S_Quantitat as cantidadSecundario, S_Preu as precioFinal FROM ProductesPromocionats WHERE Client = ${data.licencia}`;// AND Df > GETDATE()`;
                                                                conexion.recHit(data.database, sqlPromos).then(async res5 => {
                                                                    if (res5) {
                                                                        res5 = await familiasPorObjetos(res5, data.database, codigoCliente, conexion);
                                                                        conexion.recHit(data.database, `select Variable AS nombreDato, Valor AS valorDato from paramsTpv where CodiClient = ${codigoCliente} AND (Variable = 'Capselera_1' OR Variable = 'Capselera_2')`).then(res10 => {
                                                                            conexion.recHit(data.database, "select Id as id, Nom as nombre, IdExterna as tarjetaCliente from ClientsFinals WHERE Id IS NOT NULL AND Id <> ''").then(res6 => {
                                                                                if (res6) {
                                                                                    var auxObject = {
                                                                                            error: false,
                                                                                            menus: res1.recordset,
                                                                                            teclas: res.recordset,
                                                                                            articulos: res2.recordset,
                                                                                            dependentes: res3.recordset,
                                                                                            familias: res4.recordset,
                                                                                            promociones: res5.recordset,
                                                                                            clientes: res6.recordset,
                                                                                            parametrosTicket: res10.recordset,
                                                                                            sql: sqlPromos
                                                                                        };
                                                                                        
                                                                                    
                                                                                    socket.emit('cargar-todo', auxObject);                                                                                    
                                                                                }
                                                                                else {
                                                                                    socket.emit('cargar-todo', { error: true, infoError: "Error en la respuesta de la consulta SQL 6" });
                                                                                }
                                                                            });
                                                                        });
                                                                    }
                                                                    else {
                                                                        socket.emit('cargar-todo', { error: true, infoError: "Error en la respuesta de la consulta SQL 5" });
                                                                    }
                                                                });
                                                            }
                                                            else {
                                                                socket.emit('cargar-todo', { error: true, infoError: 'Error en la respuesta de la consulta 4' });
                                                            }
                                                        });
                                                    }
                                                    else {
                                                        socket.emit('cargar-todo', { error: true, infoError: "Error en la respuesta de la consulta SQL 3" });
                                                    }
                                                });
                                            }
                                            else {
                                                socket.emit('cargar-todo', { error: true, infoError: "Error en la respuesta de la consulta SQL" });
                                            }
                                        });
                                    }
                                    else {
                                        socket.emit('cargar-todo', { error: true, infoError: "Error en la respuesta de la consulta SQL 1" });
                                    }
                                });
                            }
                            else {
                                socket.emit('cargar-todo', { error: true, infoError: "Error en la respuesta de la consulta SQL 7" });
                            }
                        });
                    });
                }
                else {
                    socket.emit('cargar-todo', { error: true, infoError: "Error en la respuesta de la consulta SQL 8" });
                }
            });
        });
    });
}
module.exports.loadSockets = loadSockets;