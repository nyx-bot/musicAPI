const { PassThrough } = require('stream');

const locationMaps = {};

let blacklistedIps = [];

module.exports = ({app, auth}) => {
    let pool = []; let i = 0;

    let getUrl = () => {
        i++;

        let linkToUse;

        if(pool[i-1] && pool[i-1].location) {
            console.log(`serving ${i-1}, as ${pool[i-1].location}`)
            linkToUse = pool[i-1].location
        } else if(pool[pool.length-1] && pool[pool.length-1].location) {
            console.log(`serving ${pool.length-1} (reset; ${i-1} did not exist [tried ${i}/${pool.length}]), as ${pool[pool.length-1].location}`)
            i = 0;
            linkToUse = pool[pool.length-1].location
        } else return null;

        while(linkToUse.toString().endsWith(`/`)) linkToUse = linkToUse.split(``).slice(0, -1).join(``);

        const send = `http://${linkToUse}:1366`
        console.log(send)
        return send; 
    };
    
    setInterval(() => {
        console.log(`musicApi nodes:\n| ${pool.length === 0 ? `{none}` : `- ${pool.map(o => `${o.location} // ~${Math.floor((Date.now() - o.added)/1000)} seconds ago`).join(`\n - `)}`}`)
    }, 20000)

    app.get(`/registerMusicClient`, async (req, res) => {
        const ip = (req.headers[`CF-Connecting-IP`] || req.headers[`cf-connecting-ip`] || req.headers['x-forwarded-for'] || req.ip).replace(`::ffff:`, ``);

        let existingIndex = pool.findIndex(o => o.location == ip);
        let blacklisted = blacklistedIps.findIndex(o => o == ip);

        if(existingIndex != -1 && blacklisted === -1) {
            clearTimeout(pool[existingIndex].timeout);

            pool[existingIndex].timeout = setTimeout((toRemove) => {
                const index = pool.findIndex(o => o.location == toRemove);
                if(index != -1) {
                    console.log(`location ${toRemove} did not re-register within 15 seconds, removing!`)
                    pool.splice(index, 1);
                }
            }, 15000, `${ip}`);

            pool[existingIndex].added = Date.now();

            //console.log(`${ip} already exists in location pool! (index ${existingIndex} in array) -- removing timeout & resetting!`)
        } else {
            pool.push({
                location: ip,
                timeout: setTimeout((toRemove) => {
                    const index = pool.findIndex(o => o.location == toRemove);
                    if(index != -1) {
                        console.log(`location ${toRemove} did not re-register within 15 seconds, removing!`)
                        pool.splice(index, 1);
                    }
                }, 15000, `${ip}`), // remove object after 15 seconds if not registered again -- nodes are supposed to ping every 5-10 seconds
                added: Date.now(),
            }); existingIndex = pool.findIndex(o => o.location == ip);

            //console.log(`Successfully added ${ip}! (index ${existingIndex} in array) -- new entry!`)
        };

        res.send({
            error: false,
            message: `Successfully added ${ip}! (index ${existingIndex} in array)`
        })
    });

    app.get(`/unregisterMusicClient`, async (req, res) => {
        const ip = (req.headers[`CF-Connecting-IP`] || req.headers[`cf-connecting-ip`] || req.headers['x-forwarded-for'] || req.ip).replace(`::ffff:`, ``);

        let sent = false;

        while(pool.findIndex(o => o.location == ip) != -1) {
            let existingIndex = pool.findIndex(o => o.location == ip)

            clearTimeout(pool[existingIndex].timeout);
            
            pool.splice(existingIndex, 1);

            console.log(`Removed ${ip}`);

            blacklistedIps.push(ip);
            
            if(!sent) {
                sent = true;

                res.send({
                    error: false,
                    message: `Successfully removed IP!`
                })
            }
        }

        if(!sent) res.send({
            error: false,
            message: `IP wasn't registered!`
        })
    });

    let keys = require('./config.json').keys

    app.get(`/getConfigKeys`, async (req, res) => {
        try {
            keys = JSON.parse(require('fs').readFileSync(`./config.json`)).keys
        } catch(e) {};
        res.send(keys)
    })

    const run = (req, res, specifiedUrl) => new Promise(async (resp, rej) => {
        const started = Date.now();

        var url = specifiedUrl || getUrl();
        if(!url) return rej({
            error: true,
            message: `No locations!`
        });

        const requestTo = url + req.originalUrl/* + (req.originalUrl.includes(`?`) ? `&fetchOnly=true` : `?fetchOnly=true`)*/

        let params = {
            method: req.method.toString().toUpperCase(),
            uri: requestTo.replace(`::1`, `127.0.0.1`),
            headers: {},
            forever: true,
            encoding: null,
        };

        if(req && req.body && Object.keys(req.body).length > 0) {
            console.log(`req body:`, req.body)
            params.body = Buffer.from(JSON.stringify(req.body))
            //params.body = req.body
            //delete params.encoding;
            //params.json = true;
        }

        for(o of Object.entries(req.headers)) {
            params.headers[o[0]] = o[1]
        };

        params.headers.authorization = auth

        console.log(`${req.method.toString().toUpperCase()}/${requestTo}`)

        try {
            const request = require('request')(params);
    
            //let passthru = new PassThrough();
            //request.pipe(passthru);
    
            //var headers = r.response.headers;
            //headers[`Connection`] = `Keep-Alive`
    
            request.pipe(res)
    
            let totalChunkLength = 0;
    
            request.on(`data`, chunk => {
                totalChunkLength += chunk.length
            });

            req.once(`abort`, () => {
                try {
                    if(request && request.req && request.req) request.req.destroy()
                    if(request && request.destroy) request.destroy()
                    console.log(`Attempted to destroy request!`)
                } catch(e) {
                    console.warn(`Failed to destroy proxy request! ${e}`)
                }
            })
    
            req.once('close', () => {
                console.log(`outside request closed connection!`);
                try {
                    if(request && request.req && request.req) request.req.destroy()
                    if(request && request.destroy) request.destroy()
                    console.log(`Attempted to destroy request!`)
                } catch(e) {
                    console.warn(`Failed to destroy proxy request! ${e}`)
                }
                /*res({
                    request: request,
                    response: response,
                    firstChunk,
                    totalChunkLength: () => { return totalChunkLength; },
                    passthru,
                    url,
                });*/
            });
    
            let errored = false;
    
            request.on(`error`, (err) => {
                errored = true;

                try {
                    if(request && request.req && request.req) request.req.destroy()
                    if(request && request.destroy) request.destroy()
                    console.log(`Attempted to destroy request!`)
                } catch(e) {
                    console.warn(`Failed to destroy proxy request! ${e}`)
                }
    
                if(`${err}`.toLowerCase().includes(`aborted`)) {
                    console.warn(`Connection was aborted`);

                    const ip = url.split(`//`)[1].split(`:`)[0];
                    
                    console.log(`Removing ip ${ip} from pool`);

                    const index = pool.findIndex(o => o.location == ip);
                    if(index != -1) {
                        console.log(`location ${ip} found! (index ${index})`)
                        clearTimeout(pool[index].timeout);
                        pool.splice(index, 1);
                    }

                    run(req, res, specifiedUrl)
                } else {
                    console.error(`error occured in stack for ${requestTo}: ${err}`, err && err.stack ? err.stack : err);
                    console.log(`(${totalChunkLength / 1e+6}mb sent in ${(Date.now()-started)/1000} seconds)`);
                    /*if(`${err}`.includes(`aborted`)) {} else rej({
                        error: true,
                        message: `${err}`,
                        url,
                    });*/
                }
            });
    
            request.once(`close`, () => {
                try {
                    if(request && request.req && request.req) request.req.destroy()
                    if(request && request.destroy) request.destroy()
                    console.log(`Attempted to destroy request!`)
                } catch(e) {
                    console.warn(`Failed to destroy proxy request! ${e}`)
                }
                
                console.log(`close event triggered! (${totalChunkLength / 1e+6}mb sent in ${(Date.now()-started)/1000} seconds)`)
            })
        } catch(e) {
            console.error(`ERROR IN STREAMING WITH RUN FUNC: `, e)
            res.end()
        }
    });

    let endpoints = require('fs').readdirSync(`./lib`);

    const getMap = (req) => {
        let map = `${req.originalUrl.split(`/`).slice(2).join(`/`) ? req.originalUrl.split(`/`).slice(2).join(`/`) : req.originalUrl}`;
        if(map.includes(`startTime=`)) map = map.replace(`?startTime=${req.query.startTime}`, ``).replace(`&startTime=${req.query.startTime}`, ``);

        let toEndpoints = endpoints.find(s => req.originalUrl.toString().includes(s.toString().split(`.`).slice(0, -1).join(`.`)));

        if(toEndpoints) {
            if(map.split(toEndpoints)[1]) {
                map = map.split(toEndpoints)[1]
                console.log(`splitting by ${toEndpoints} -- new map: ${map}`)
            } else console.log(`cannot split by musicApi endpoint location`)
            map = map.split(toEndpoints)[1] ? map.split(toEndpoints)[1] : map.split(toEndpoints)[0];
        };

        console.log(`locationMap: ${map} (exists: ${locationMaps[map] ? true : false})`);
    }

    const handler = async (req, res) => {
        let map = getMap(req);

        const process = (r) => {
            if(typeof r == `string`) {
                console.log(`adding ${r} to locationMaps for ${map}`);
                locationMaps[map] = {
                    location: r.url.split(`//`)[1].split(`:`)[0],
                    redirect: `${r.url.replace(`?startTime=${req.query.startTime}`, ``).replace(`&startTime=${req.query.startTime}`, ``)}`,
                }; console.log(locationMaps[map])
                //res.redirect(r)
            } else {
                locationMaps[map] = {
                    location: r.url.split(`//`)[1].split(`:`)[0],
                    redirect: `${r.url.replace(`?startTime=${req.query.startTime}`, ``).replace(`&startTime=${req.query.startTime}`, ``)}`,
                }; console.log(locationMaps[map]);

                var headers = r.response.headers;
                headers[`Connection`] = `Keep-Alive`

                if(!res.headersSent) res.set(headers);

                r.passthru.pipe(res)

                //r.request.pipe(res)
            }
        }

        if(locationMaps[map] && pool.find(o => o.location == locationMaps[map].location)) {
            const redirection = `http://${locationMaps[map].location}:1366${req.originalUrl}`
            //const redirection = `${locationMaps[map].redirect}${req.query.startTime ? (locationMaps[map].redirect.includes(`?`) ? `&startTime=${req.query.startTime}` : `?startTime=${req.query.startTime}`) : ``}`;
            console.log(`redirect already exists!`, locationMaps[map], redirection);
            //res.redirect(redirection)
            run(req, res, `http://${locationMaps[map].location}:1366`).then(process).catch(e => {
                console.error(`Could not use existing location! (${e.message ? e.message : e.toString()})`)
                delete locationMaps[map]; 
                handler(req, res);
            })
        } else {
            if(locationMaps[map]) {
                console.log(`redirect exists, but is not in the musicapi pool! removing...`)
                delete locationMaps[map];
            }

            run(req, res).then(process).catch(e => {
                //console.error(`${e.message ? e.message : e.toString()}`)
                run(req, res).then(process).catch(e => {
                    //console.error(`${e.message ? e.message : e.toString()}`)
                    run(req, res).then(process).catch(e => {
                        //console.error(`${e.message ? e.message : e.toString()}`)
                        res.end()
                    })
                })
            })
        }
    }

    app.use(handler)

    server = app.listen(1400, function () {
        console.log(`online! port ${server.address().port}; listening to auth key ${auth}`);
    
        let cron = require('cron');
        let job = new cron.CronJob(`* * * * *`, () => {
            console.log(`ping time!\n- sending ping? ${global.sendPings}\n- node server pool size? ${pool.length}`)
            if(global.sendPings && pool.length >= 1) {
                const link = require('./config.json').uptimeHeartbeat
                require(`superagent`).get(link).then(r => {
                    console.log(`successfully sent uptime ping to ${link.split(`//`)[1].split(`/`)[0]} (status: ${r.status})`)
                }).catch(e => {
                    console.error(`failed to send uptime ping to ${link.split(`//`)[1].split(`/`)[0]} (status: ${e.status})`)
                });
            } else if(!global.sendPings) {
                console.log(`sendPings are disabled -- not sending to uptimeRobot`)
            } else if(pool.length < 1) {
                console.log(`sendPings are enabled, but no musicApi clients have registered yet! not sending ping this round...`)
            }
        }); job.start();
    });
}
