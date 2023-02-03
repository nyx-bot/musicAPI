const { PassThrough } = require('stream');

const cp = require('child_process')

const locationMaps = {};
let fallback = false;

let blacklistedIps = [];

global.metrics = {
    type: 1,
    connections: 0,
};

require(`./pm2Metrics`)(global.metrics);

module.exports = async ({app, auth}) => {
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
        } else if(fallback) {
            console.log(`No external nodes are online; serving fallback!`)
            return `http://127.0.0.1:1366`
        } else return null;

        while(linkToUse.toString().endsWith(`/`)) linkToUse = linkToUse.split(``).slice(0, -1).join(``);

        const send = `http://${linkToUse}:1366`
        console.log(send)
        return send; 
    };
    
    setInterval(() => {
        console.log(`musicApi nodes:\n| ${pool.length === 0 ? `{none}` : `| - ${pool.map(o => `${o.location} // ~${Math.floor((Date.now() - o.added)/1000)} seconds ago`).join(`\n - `)}`}\n| > ${fallback ? `(fallback online)` : `(fallback offline)`}`)
    }, 20000);
    
    app.get(`/registerMusicClient`, async (req, res) => {
        const ip = (req.headers[`CF-Connecting-IP`] || req.headers[`cf-connecting-ip`] || req.headers['x-forwarded-for'] || req.ip).replace(`::ffff:`, ``);

        if(!req.query.fallback) {
            let existingIndex = pool.findIndex(o => o.location == ip);
            let blacklisted = blacklistedIps.findIndex(o => o == ip);
    
            if(existingIndex != -1 && blacklisted === -1) {
                clearTimeout(pool[existingIndex].timeout);
    
                pool[existingIndex].timeout = setTimeout((toRemove) => {
                    const index = pool.findIndex(o => o.location == toRemove);
                    if(index != -1) {
                        console.log(`location ${toRemove} did not re-register within 5 seconds, removing!`)
                        pool.splice(index, 1);

                        const mapsArr = Object.entries(locationMaps)
                        const mapped = mapsArr.filter(o => o[1].split(`//`)[1].split(`:`)[0] == toRemove);
                        console.log(`There are ${mapped.length}/${mapsArr.length} cache entrie(s) to remove for this IP!`);

                        for([key, o] of mapped) {
                            console.log(`Removing ${key}...`);
                            delete locationMaps[key]
                        }

                        console.log(`There are now ${Object.keys(locationMaps).length} cache entries available! (Lost: ${mapsArr.length - mapped.length})`)
                    }
                }, 5000, `${ip}`);
    
                pool[existingIndex].added = Date.now();
    
                //console.log(`${ip} already exists in location pool! (index ${existingIndex} in array) -- removing timeout & resetting!`)
            } else {
                if(pool.length === 0) {
                    console.log(`Pool length was 0, restarting fb to offload`)
                    if(global.fallbackProc) global.fallbackProc.restart()
                }; pool.push({
                    location: ip,
                    timeout: setTimeout((toRemove) => {
                        const index = pool.findIndex(o => o.location == toRemove);
                        if(index != -1) {
                            console.log(`location ${toRemove} did not re-register within 5 seconds, removing!`)
                            pool.splice(index, 1);

                            const mapsArr = Object.entries(locationMaps)
                            const mapped = mapsArr.filter(o => o[1].split(`//`)[1].split(`:`)[0] == toRemove);
                            console.log(`There are ${mapped.length}/${mapsArr.length} cache entrie(s) to remove for this IP!`);

                            for([key, o] of mapped) {
                                console.log(`Removing ${key}...`);
                                delete locationMaps[key]
                            }

                            console.log(`There are now ${Object.keys(locationMaps).length} cache entries available! (Lost: ${mapsArr.length - mapped.length})`)
                        }
                    }, 5000, `${ip}`), // remove object after 5 seconds if not registered again -- nodes are supposed to ping every 5-10 seconds
                    added: Date.now(),
                }); existingIndex = pool.findIndex(o => o.location == ip);
    
                //console.log(`Successfully added ${ip}! (index ${existingIndex} in array) -- new entry!`)
            };
    
            res.send({
                error: false,
                message: `Successfully added ${ip}! (index ${existingIndex} in array)`
            })
        } else {
            if(fallback && fallback.timeout) clearTimeout(fallback.timeout);

            fallback = {
                location: ip,
                timeout: setTimeout(() => {
                    if(fallback) {
                        fallback = false;
                        console.log(`Fallback has not returned after 5 seconds, clearing...`)
                    } else {
                        console.log(`Fallback was already false!`)
                    }
                }, 5000), // remove object after 15 seconds if not registered again -- nodes are supposed to ping every 5-10 seconds
                added: Date.now(),
            }; existingIndex = pool.findIndex(o => o.location == ip);
        }
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

    let endpoints = require('fs').readdirSync(`./lib`).map(s => s.split(`.`).slice(0, -1).join(`.`));
    
    app.get(`/setCachedLocation/:arg(*+)`, async (req, res) => {
        const location = req.originalUrl.split(`setCachedLocation/`)[1];
        const ip = req.ip.split(`:`).length > 1 ? req.ip.split(`:`).slice(-1)[0] : req.ip
        const inPool = pool.find(o => o.location == ip);

        const send = res.send;
        res.send = (o) => {
            if(o.message) console.log(` ---- \nSetting cached location:\n URL: ${location}\n TO IP: ${ip}\n MESSAGE: ${o.message}\n ---- `);
            send(o)
        }

        if(inPool && !locationMaps[location]) {
            locationMaps[location] = `http://${inPool.location}:1366`

            res.send({
                success: true,
                message: `Successfully added "${location}" as a cached location to ${inPool.location}`
            });
        } else if(locationMaps[location]) {
            res.send({
                success: false,
                message: `Failed to add "${location}": a location is already registered for this url!`
            })
        } else {
            res.send({
                success: false,
                message: `Failed to add "${location}": this client's ip is not registered!`
            })
        }
    })

    const getCachedLocation = (req, endpoint) => {
        const body = req && req.body && typeof req.body == `object` ? req.body : {}

        let url = body.url, urlSource = `body`;

        if(!url && endpoint) {
            url = req.originalUrl.split(endpoint + `/`)[1];
            urlSource = `req.originalUrl split by ${endpoint}`
        };

        if(!url && `${req.originalUrl}`.includes(`https:`)) {
            url = `https:` + req.originalUrl.split(`https:`)[1];
            urlSource = `scraped directly from req.originalUrl (split by "https:")`
        }

        if(!url && `${req.originalUrl}`.includes(`http:`)) {
            url = `http:` + req.originalUrl.split(`http:`)[1];
            urlSource = `scraped directly from req.originalUrl (split by "http:")`
        }

        let location = locationMaps[url] || null, rawIp = locationMaps[url] ? locationMaps[url].split(`//`)[1].split(`:`)[0] : null;
        let ipExists = pool.find(o => o.location == rawIp);

        console.log(`> Parsed URL as "${url}" from ${urlSource}; \n> - ${location ? `there is a cached IP address for this URL (${location} / ${rawIp})! ${ipExists ? `It is still in the pool, returning ${location}.` : `It is not in the pool, so this location will be deleted & returning null.`}` : `there is no cached IP address for this URL.`}`)
        
        if(!ipExists) {
            delete locationMaps[url];
            location = null;
        };

        return location;
    }

    const run = (req, res, specifiedUrl, seek, ffmpegProc) => new Promise(async (resp, rej) => {
        const started = Date.now();

        if(!ffmpegProc) global.metrics.connections++;

        const cachedLocation = getCachedLocation(req, endpoints.find(s => s == req.originalUrl.split(`/`)[1]));

        var url = specifiedUrl || getUrl();
        if(!url) return rej({
            error: true,
            message: `No locations!`
        });

        console.log(`Requesting to ${cachedLocation ? `${cachedLocation} [cached response]` : `${url} [non-cached randomized server]`}`)

        let requestTo = (cachedLocation || url) + req.originalUrl/* + (req.originalUrl.includes(`?`) ? `&fetchOnly=true` : `?fetchOnly=true`)*/

        if(seek) {
            let oldUrl = `${requestTo}`
            requestTo = requestTo.split(`?startTime=`)[0].split(`&startTime=`)[0];
            if(requestTo.includes(`?`)) {
                requestTo += `&startTime=${seek}`
            } else requestTo += `?startTime=${seek}`;
            console.log(`SEEKING:\n- old url: ${oldUrl}\n- new url: ${requestTo}`)
        }

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
            const ffmpeg = ffmpegProc || require('child_process').spawn(`ffmpeg`, [`-i`, `-`, `-c:a`, `copy`, `-f`, `opus`, `/dev/null`, `-y`, `-hide_banner`]);

            let lastTimestamp = seek || `00:00:00.00`;

            if(ffmpeg && ffmpeg.stderr) ffmpeg.stderr.on(`data`, d => {
                const log = d.toString().trim();

                if(log.includes(`time=`)) {
                    let previousTimestamp = `${lastTimestamp}`
                    lastTimestamp = log.split(`time=`)[1].split(`bit`)[0].trim();
                    console.log(`${previousTimestamp} -> ${lastTimestamp}`)
                }
            });

            const request = require('request')(params);

            let connectionClosed = false;
    
            //let passthru = new PassThrough();
            //request.pipe(passthru);
    
            //var headers = r.response.headers;
            //headers[`Connection`] = `Keep-Alive`
    
            request.pipe(res)
    
            let totalChunkLength = 0;
    
            request.on(`data`, chunk => {
                //res.write(chunk);
                if(ffmpeg && ffmpeg.stdin && ffmpeg.stdin.write) ffmpeg.stdin.write(chunk)
                totalChunkLength += chunk.length
            });

            req.once(`abort`, () => {
                connectionClosed = true;
                try {
                    if(request && request.req && request.req) request.req.destroy()
                    if(request && request.destroy) request.destroy()
                    console.log(`Attempted to destroy request!`)
                } catch(e) {
                    console.warn(`Failed to destroy proxy request! ${e}`)
                }
            });
    
            let errored = false;

            req.once(`error`, console.error)
    
            req.once('close', () => {
                connectionClosed = true;
                console.log(`outside request closed connection!`);
                if(global.metrics.connections > 0 && !ffmpegProc) global.metrics.connections--;
                try {
                    if(request && request.req && request.req) request.req.destroy()
                    if(request && request.destroy) request.destroy()
                    console.log(`Attempted to destroy request!`)

                    if(!errored && ffmpeg) {
                        console.log(`no error & ffmpeg is active! destroying stdin...`);
                        ffmpeg.stdin.destroy();
                    }
                } catch(e) {
                    console.warn(`Failed to destroy proxy request! ${e}`)
                }
            });
    
            request.on(`error`, (err) => {
                errored = true;

                try {
                    if(request && request.req && request.req) request.req.destroy()
                    if(request && request.destroy) request.destroy()
                    console.log(`Attempted to destroy request!`)
                } catch(e) {
                    console.warn(`Failed to destroy proxy request! ${e}`)
                };
    
                if(!connectionClosed) {
                    console.log(`Connection was aborted (${err}) -- connection looks to be still active!`);

                    const ip = url.split(`//`)[1].split(`:`)[0];
                    
                    console.log(`Removing ip ${ip} from pool`);

                    const index = pool.findIndex(o => o.location == ip);
                    if(index != -1) {
                        console.log(`location ${ip} found! (index ${index})`)
                        clearTimeout(pool[index].timeout);
                        pool.splice(index, 1);
                    };

                    if(ffmpeg && ffmpeg.stderr) ffmpeg.stderr.removeAllListeners()

                    let rerunArgs = [req, res, null, lastTimestamp, ffmpeg];

                    run(...rerunArgs).catch(e => {
                        console.error(e)
                    })
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
                    connectionClosed = true;
                    if(request) request.removeAllListeners();
                    if(request && request.req && request.req) request.req.destroy()
                    if(request && request.destroy) request.destroy()
                    console.log(`Attempted to destroy request!`);

                    if(!errored && ffmpeg) {
                        console.log(`no error & ffmpeg is active! destroying stdin...`);
                        ffmpeg.stdin.destroy();
                    }
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

    const handler = async (req, res) => run(req, res).then(process).catch(e => {
        //console.error(`${e.message ? e.message : e.toString()}`)
        run(req, res).then(process).catch(e => {
            //console.error(`${e.message ? e.message : e.toString()}`)
            run(req, res).then(process).catch(e => {
                //console.error(`${e.message ? e.message : e.toString()}`)
                res.end()
            })
        })
    })

    app.use(handler)

    server = app.listen(1400, async function () {
        console.log(`online! port ${server.address().port}; listening to auth key ${auth}`);

        if(process.argv.indexOf(`--no-fallback`) === -1) {
            global.fallbackProc = await require(`./core`).spawnFallback(true);
    
            const beforeExit = () => {
                if(global.fallbackProc) global.fallbackProc.kill(); 
                process.exit(0)
            }
    
            process.on('beforeExit', beforeExit)
            process.on('exit', beforeExit)
            process.on('SIGINT', beforeExit)
            process.on('SIGUSR1', beforeExit)
            process.on('SIGUSR2', beforeExit)
        }
    
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
