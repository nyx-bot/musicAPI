const ff = require('fluent-ffmpeg');

let path = undefined;

const fs = require('fs')

const util = require('../util');

global.processes = {};

let ffmpegFormats = null;

module.exports = ({link: input, keys, waitUntilComplete, returnInstantly, seek, forceYtdlp, forceStream}) => new Promise(async (res, rej) => {
    console.log(`Wait until complete? ${waitUntilComplete ? true : false}`)

    const times = {
        start: Date.now(),
        firstPipe: Date.now(),
        finish: Date.now(),
    }

    if(!ffmpegFormats) try {
        ffmpegFormats = require('child_process').execSync(`ffmpeg -formats`).toString().split(`\n`).map(s => s.trim().slice(4).split(` `)[0]).filter(s => s.length > 0 ? true : false);
    } catch(e) {
        console.warn(`Failed to get FFmpeg formats: ${e}`)
    }

    const ytdl = keys.clients.ytdl;

    let sentBack = false;

    let startTimeArg = seek;

    if(input && `${input}`.includes(`&startTime=`)) {
        console.log(`download func determined that &startTime existed; trimming "&startTime=${input.split(`&startTime=`)[1]}" from the url`);
        if(!startTimeArg) startTimeArg = input.split(`&startTime=`)[1].split(`&`)[0];
        input = input.split(`&startTime=`)[0];
    }

    if(input && `${input}`.includes(`?startTime=`)) {
        console.log(`download func determined that ?startTime existed; trimming "?startTime=${input.split(`?startTime=`)[1]}" from the url`);
        if(!startTimeArg) startTimeArg = input.split(`?startTime=`)[1].split(`&`)[0];
        input = input.split(`?startTime=`)[0];
    }

    if(input) {
        let requestedInfo = null;

        if(typeof input == `string` && !global.streamCache[input]) {
            console.log(`got input of ${input}, but no cache yet! getting now c:`)
            try {
                requestedInfo = await require('./getInfo')(input, keys, true);

                times.gotData = Date.now();

                console.log(`got metadata!`)
            } catch(e) {
                console.error(e); return rej(`Could not get metadata! ${e}`);
            }
        };

        //if(`${input}`.includes(`spotify.com`) && getInfoPromise) await getInfoPromise 

        let json = requestedInfo || (typeof input == `object` ? input : global.streamCache[input]) || {
            title: `Unknown`,
            url: input,
            extractor: `${input}`.split(`//`)[1].split(`/`)[0].split(`.`).slice(-2, -1)[0],
            id: `unk-` + Buffer.from(input).toString(`base64`).slice(-8),
            nyxData: {
                livestream: true,
                forged: true,
            },
            formats: [],
        };

        if(!json || !json.url) return rej(`No streamable link! (input: ${input})`, json);

        if(forceStream) json = Object.assign({}, json, {
            nyxData: {
                livestream: true,
            }
        })

        const jsonFileID = require(`../util`).idGen(8);

        const domain = json.extractor;
        const id = json.id;

        console.log(`downloading for domain ${domain} and id ${id}`)

        if(fs.existsSync(`./etc/${domain}/`) && fs.readdirSync(`./etc/${domain}/`).find(f => f.startsWith(json.id))) {
            return res({domain, id, json, location: `${__dirname.split(`/`).slice(0, -1).join(`/`)}/etc/${domain}/${fs.readdirSync(`./etc/${domain}/`).find(f => f.startsWith(json.id))}`})
        };

        let fileLocation = `${__dirname.split(`/`).slice(0, -1).join(`/`)}/etc/${domain}/${id.match(/[(\w\d)]*/g).filter(s => s && s != `` && s.length > 0).join(`-`)}.opus`;
        const originalFileLocation = fileLocation;
        console.log(originalFileLocation)
        let fileRoot = fileLocation.split(`/`).slice(0, -1).join(`/`)

        if(!fs.existsSync(`${fileRoot}/`)) fs.mkdirSync(`${fileRoot}/`, { recursive: true })

        const process = () => {
            try {
                console.log(`This ${json.nyxData.livestream ? `is` : `is NOT`} a livestream!`)

                const { useFormat, downloaderArgs, format_id } = require(`../util`).findBestAudioQuality(json)

                let args = [
                    json.url,
                    //`--no-keep-video`,
                    //`--extract-audio`,
                    //`--audio-format`, `opus`,
                    `-P`, fileLocation.split(`/`).slice(0, -1).join(`/`),
                    `-o`, `%(id)s.%(ext)s`,
                    `--no-part`,
                    `--cache-dir`, `${__dirname.split(`/`).slice(0, -1).join(`/`)}/etc/yt-dlp-cache`,
                    //`--extractor-args`, `youtube:skip=dash,hls`
                    ...downloaderArgs
                ];

                let seeking = downloaderArgs.find(s => s.includes(`-ss`)) ? true : false;

                if(format_id) {
                    args.push(`--format`, `${format_id}`);
                    console.log(`Using format ${format_id}, corresponding to format obj:`, useFormat)
                }
    
                if(json.nyxData.livestream || startTimeArg) {
                    //if(args.indexOf(`--format`) !== -1) args.splice(args.indexOf(`--format`), 2)
                    if(args.indexOf(`-o`) !== -1) args.splice(args.indexOf(`-o`), 2);
                    if(args.indexOf(`-P`) !== -1) args.splice(args.indexOf(`-P`), 2);
                    //if(args.indexOf(`--no-part`) !== -1) args.splice(args.indexOf(`--no-part`), 1);
                    //args.push(`--fixup`, `never`)
                }

                const logData = (source) => {
                    console.log(`-`.repeat(40) + `\n` + `COMPLETED PROCESSING ${domain} / ${json.id} IN ${(times.finish - times.start)/1000} SECONDS USING ${source}\n- ` + Object.entries(times).map(o => `start to ${o[0]}: ${(o[1] - times.start)/1000}s`).join(`\n- `) + `\n` + `-`.repeat(40))
                }

                const useYtdlp = () => new Promise(async (res2, rej2) => {
                    const abort = new AbortController();
    
                    let ytdlCompleted = false;
    
                    console.log(`EXECUTING yt-dlp WITH ARGUMENTS "${args.join(` `)}"${seeking ? `\n\n-------- SEEKING THROUGH YT-DLP FFMPEG ARGS, EXPERIMENTAL --------\n\n` : ``}`)
    
                    const run = args.indexOf(`-o`) == -1 ? `execStream` : `exec`;
    
                    let playback = ytdl[run](args, {}, abort.signal);
    
                    let lastPercent = 0;
    
                    const returnJson = {
                        domain, 
                        id, 
                        json,
                        useFormat,
                        location: null, 
                        stream: null,
                        seeked: seeking,
                        abort: () => {
                            if(!ytdlCompleted) {
                                console.log(`Abort signal received!`);
                                delete processes[json.url];
                                abort.abort();
            
                                const file = fs.readdirSync(`./etc/${domain}/`).find(f => f.startsWith(json.id));
                                if(file) {
                                    console.log(`File exists at "./etc/${domain}/${file}"`)
                                    fs.rmSync(`./etc/${domain}/${file}`)
                                }
                            }
                        }, 
                        getLastPercent: () => lastPercent
                    };
    
                    returnJson.process = playback;
    
                    if(!json.nyxData.livestream) processes[json.url] = returnJson;
    
                    const initialRun = (progress) => {
                        const file = fs.readdirSync(`./etc/${domain}/`).find(f => f.startsWith(json.id));
    
                        if(waitUntilComplete) {
                            console.log(`requested to wait until complete! holding on to file for now...`)
                        } else if(!sentBack && run == `exec` && Math.round(progress.percent || 0) != 0) {
                            times.firstPipe = Date.now()
                            sentBack = true;
                            console.log(`returning file`)
                            returnJson.location = `${__dirname.split(`/`).slice(0, -1).join(`/`)}/etc/${domain}/${file}`
                            res2(returnJson)
                        } else if(!sentBack && run == `execStream` && Math.round(progress.percent || 0) != 0) {
                            times.firstPipe = Date.now()
                            sentBack = true;
                            console.log(`returning stream`)
                            returnJson.stream = playback;
                            res2(returnJson)
                        }
                
                        if(global.streamCache[input] && global.streamCache[input].nyxData && progress.timemark) {
                            global.streamCache[input].nyxData.downloadedLengthInMs = util.time(progress.timemark.split(`.`)[0]).units.ms
                            global.streamCache[input].nyxData.lastUpdate = Date.now();
                        };
                    };
    
                    if(returnInstantly) initialRun({percent: 1});
        
                    playback.on(json.nyxData.livestream ? `data` : `progress`, (progress) => {
                        initialRun(progress && typeof progress.percent == `number` ? progress : {percent: 1})
                        //console.log('processed ' + Math.round(progress.percent) + `% of ${domain}/${id.match(/[(\w\d)]*/g).filter(s => s && s != `` && s.length > 0).join(`-`)} at ${progress.currentKbps || `0`}kbps [${progress.timemark}]`);
                        if(progress.percent && Math.round(progress.percent || 0) != lastPercent) {
                            lastPercent = Math.round(progress.percent || 0)
                            console.log(`processed ` + Math.round(progress.percent || 0) + `% of ${domain}/${id.match(/[(\w\d)]*/g).filter(s => s && s != `` && s.length > 0).join(`-`)} at ${progress.currentSpeed} speed -- ETA: ${progress.eta}`)
                        }
                    });
            
                    playback.once(`close`, () => {
                        times.finish = Date.now();

                        if(fs.existsSync(`./etc/${domain}/`) && fs.readdirSync(`./etc/${domain}/`).find(f => f.startsWith(json.id))) {
                            require(`./createWaveform`)({
                                id: json.id,
                                info: json,
                                location: `${__dirname.split(`/`).slice(0, -1).join(`/`)}/etc/${domain}/${fs.readdirSync(`./etc/${domain}/`).find(f => f.startsWith(json.id))}`
                            })
                        };

                        ytdlCompleted = true;
    
                        delete processes[json.url];
    
                        const file = fs.readdirSync(`./etc/${domain}/`).find(f => f.startsWith(json.id));
    
                        if(fs.existsSync(`./etc/${jsonFileID}.json`)) fs.rmSync(`./etc/${jsonFileID}.json`)
    
                        if(waitUntilComplete) {
                            console.log(`returning file`)
                            returnJson.location = `${__dirname.split(`/`).slice(0, -1).join(`/`)}/etc/${domain}/${file}`
                            res2(returnJson)
                        } else if(!sentBack && file) {
                            sentBack = true;
                            console.log(`returning file`)
                            returnJson.location = `${__dirname.split(`/`).slice(0, -1).join(`/`)}/etc/${domain}/${file}`
                            res2(returnJson)
                        }
        
                        console.log(`successfully processed ${domain}/${id.match(/[(\w\d)]*/g).filter(s => s && s != `` && s.length > 0).join(`-`)}`);
        
                        fileLocation = `${__dirname.split(`/`).slice(0, -1).join(`/`)}/etc/${domain}/${file}`;
        
                        setTimeout(() => {
                            if(fs.existsSync(fileLocation)) fs.unlinkSync(fileLocation)
                            console.log(`deleted file ${domain}/${id.match(/[(\w\d)]*/g).filter(s => s && s != `` && s.length > 0).join(`-`)}.opus! (timed out)`)
                        }, 1.26e+7) // 3.5 hours
                        
                        logData(`yt-dlp`)
                    });
            
                    playback.on(`error`, (err, stdout, stderr) => {
                        delete processes[json.url];
                        console.error(`Failed to process ${domain}/${id.match(/[(\w\d)]*/g).filter(s => s && s != `` && s.length > 0).join(`-`)}: ${err}`, err);
                        if(fs.existsSync(fileLocation)) fs.unlinkSync(fileLocation);
                        delete global.streamCache[input];
                        rej2(`Unable to stream audio!\n- ${`${err}`.split(`:`).slice(5).join(`\n- `) || `(no internal error provided)`}`)
                    });
                });

                const useFFmpeg = (formatOverride) => new Promise(async (res2, rej2) => {
                    let dir = args.indexOf(`-P`) == -1 ? args[args.indexOf(`-P`)+1] : __dirname.split(`/func`)[0] + `/etc/${domain}`
                    let location = dir + `/` + json.id + `.` + (useFormat && useFormat.audio_ext ? useFormat.audio_ext : `ogg`)

                    let headers = Object.entries(useFormat && useFormat.http_headers ? useFormat.http_headers : json && json.http_headers ? json.http_headers : {}).map(o => `${o[0]}: ${o[1]}`);

                    let format = {
                        type: formatOverride || `opus`,
                        from: formatOverride ? `override` : `default`
                    };

                    if(!formatOverride && ffmpegFormats.find(s => s == `${useFormat.acodec}`)) {
                        format.type = ffmpegFormats.find(s => s == `${useFormat.acodec}`);
                        format.from = `exact match of yt-dlp's acodec (${useFormat.acodec}) result`
                    } else if(!formatOverride && ffmpegFormats.find(s => s.split(`,`).find(s2 => s2 == `${useFormat.acodec}`))) {
                        format.type = `${useFormat.acodec}`
                        format.from = `exact match of yt-dlp's acodec (${useFormat.acodec}) result, found by splitting ffmpeg group of codecs`
                    } else if(!formatOverride && ffmpegFormats.find(s => s == `${useFormat.acodec}`.split(`.`)[0])) {
                        format.type = `${useFormat.acodec}`.split(`.`)[0]
                        format.from = `yt-dlp's acodec (${useFormat.acodec}) split by "."`
                    } else if(!formatOverride && ffmpegFormats.find(s => s == useFormat.audio_ext)) {
                        format.type = ffmpegFormats.find(s => s == useFormat.audio_ext);
                        format.from = `exact match of yt-dlp's audio_ext (${useFormat.audio_ext}) result`
                    } else if(!formatOverride && ffmpegFormats.find(s => s.split(`,`).find(s2 => s2 == useFormat.audio_ext))) {
                        format.type = useFormat.audio_ext
                        format.from = `exact match of yt-dlp's audio_ext (${useFormat.audio_ext}) result, found by splitting ffmpeg group of codecs`
                    };

                    if(json.abr && !useFormat.abr) useFormat.abr = json.abr;
                    
                    if(!useFormat.abr) useFormat.abr = 384;
                    if(!json.abr) json.abr = useFormat.abr;

                    console.log(`Using ffmpeg output format ${format.type} from ${format.from} (acodec: ${useFormat.acodec})`)

                    console.log(`Headers:`, headers)

                    let ffmpegArgs = [
                        ...(headers.length > 0 ? [`-headers`, headers.join(`\r\n`) + `\r\n`] : []),
                        `-i`, useFormat && useFormat.url ? useFormat.url : json && json.url ? json.url : input,
                        //...(args.find(s => s.startsWith(`ffmpeg:`)) ? args.find(s => s.startsWith(`ffmpeg:`)).replace(`ffmpeg:`, ``).trim().split(` `) : []),
                        ...(startTimeArg ? [`-ss`, `${startTimeArg}`] : []),
                        //...(formatOverride ? [] : [`-codec:a`, `copy`]),
                        `-ar`, `48000`,
                        ...(json.streamAbr ? [`-b:a`, `${json.streamAbr}k`] : json.abr ? [`-b:a`, `${json.abr > 400 ? 384 : json.abr}k`] : [`-b:a`, `384k`]),
                        `-vn`,
                        `-y`,
                        //`-v`, `trace`
                    ];

                    const streaming = true

                    if(streaming) {
                        console.log(`STREAMING OUTPUT`)
                        ffmpegArgs.push(`-f`, `adts`, `-`)
                    } else {
                        console.log(`DOWNLOADING VIA FFMPEG TO ${location}`)
                        ffmpegArgs.push(...(formatOverride ? [`-f`, `opus`] : [`-c:a`, `copy`]), location)
                    }

                    console.log(`-----------------------\nEXECUTING FFMPEG WITH ARGS: ` + ffmpegArgs.map(s => s.includes(` `) ? `"${s}"` : s).join(` `) + `\n-----------------------`)

                    let f = require('child_process').spawn(`ffmpeg`, ffmpegArgs);

                    let allowAbort = true;

                    const returnJson = {
                        domain, 
                        id, 
                        json,
                        useFormat,
                        location: null, 
                        stream: null,
                        proc: f,
                        seeked: startTimeArg ? true : false,
                        abort: () => {
                            if(f && allowAbort) {
                                console.log(`Abort signal received!`);
                                delete processes[json.url];
                                f.kill();
                                f = null;

                                const file = fs.readdirSync(`./etc/${domain}/`).find(f => f.startsWith(json.id));
                                if(file) {
                                    console.log(`File exists at "./etc/${domain}/${file}"`)
                                    fs.rmSync(`./etc/${domain}/${file}`)
                                }
                            }
                        }, 
                        getLastPercent: () => lastPercent
                    };

                    if(!streaming) processes[json.url] = returnJson

                    let sent = false;

                    let stderr = ``, stderrCache;

                    let sendBack = (closed, source) => {
                        if(!sent && ((waitUntilComplete && closed) || !waitUntilComplete)) {
                            if(stderr.split(`\n`).filter(s => s && !s.startsWith(`  `) && !s.startsWith(`ffmpeg version`)).length === 0) {
                                console.log(`There is no stream! Letting error event handler take this...`);
                            } else {
                                times.firstPipe = Date.now()
                                console.log(`Sent back JSON (from: ${source})`)
                                //console.log(`Readable now, here's stderr:`);
                                stderrCache = stderr;
                                stderr = null;
                                sent = true;
                                if(closed) logData(`FFmpeg`)
                                return res2(returnJson)
                            }
                        }
                    };

                    f.once(`close`, (code, sig) => {
                        console.log(`FFmpeg download proc closed with code ${code} / signal ${sig}`)
                        if(sig == `SIGSEGV` || Number(code) > 0) {
                            if(!formatOverride) {
                                if(returnJson.writeStream) {
                                    returnJson.writeStream.destroy()
                                    if(fs.existsSync(location)) fs.rmSync(location)
                                }
                                useFFmpeg(`opus`).then(res2).catch(rej2)
                            } else rej()
                        } else {
                            f = null;
                            times.finish = Date.now();
                            if(returnJson.stream) returnJson.stream.end()
                            sendBack(true, `close`)
                        }
                    })

                    let t = 0;

                    if(streaming) {
                        //returnJson.stream = f.stdout
                        returnJson.stream = new (require('stream')).PassThrough();

                        f.stdout.on(`data`, d => returnJson.stream.write(d));
                        f.once(`close`, () => returnJson.stream.destroy());

                        f.stderr.on(`data`, d => {
                            t++;
                            if(t >= 2) sendBack(false, `log 2x streaming`);
                        });

                        if(!fs.existsSync(location)) {
                            allowAbort = false;

                            returnJson.abort = () => {
                                console.log(`abort was called, but was removed from this ffmpeg download instance because it is also downloading to cache!`);
                            };

                            returnJson.writeStream = fs.createWriteStream(location, {
                                flags: `w`
                            });

                            //f.stderr.on(`data`, d => write.write(d));
                            f.stdout.pipe(returnJson.writeStream)
                            f.stderr.once(`close`, () => returnJson.writeStream.destroy());
                        }
                    } else {                        
                        returnJson.location = location

                        f.on(`close`, (code, signal) => {
                            console.log(`download ffmpeg closed with code ${code} / sig ${signal}`);

                            if(fs.existsSync(`./etc/${domain}/`) && fs.readdirSync(`./etc/${domain}/`).find(f => f.startsWith(json.id))) {
                                require(`./createWaveform`)({
                                    id: json.id,
                                    info: json,
                                    location: `${__dirname.split(`/`).slice(0, -1).join(`/`)}/etc/${domain}/${fs.readdirSync(`./etc/${domain}/`).find(f => f.startsWith(json.id))}`
                                })
                            };

                            if(code == 1 && stderrCache) {
                                console.log(stderrCache)
                            }
                        });

                        f.stderr.on(`data`, d => {
                            let log = d.toString().trim()
                            if(log.includes(`time=`) && log.includes(`speed=`)) {
                                if(t == 0) times.firstPipe = Date.now();
                                t++;
                                console.log(`FFMPEG DOWNLOAD | ` + `size=` + log.split(`size=`)[1]);
                                if(t >= 2) sendBack(false, `log 2x`);
                            }
                        })
                    }

                    if(returnInstantly) sendBack();

                    f.stderr.on(`data`, d => {
                        //console.log(d.toString().trim())

                        if((d.toString().trim().includes(`Invalid argument`) || d.toString().trim().includes(`Invalid data found`) || d.toString().trim().includes(`Unsupported codec id`)) && format.from != `override`) {
                            if(returnJson.writeStream) {
                                returnJson.writeStream.destroy()
                                if(fs.existsSync(location)) fs.rmSync(location)
                            }
                            useFFmpeg(`opus`).then(res2).catch(rej2)
                        } else if(d.toString().trim().includes(`Error`)) {
                            returnJson.abort();
                            rej2(d.toString().trim())
                        } else {
                            if(typeof stderr == `string`) stderr += `\n${d.toString().trim()}`
                            //if(!stream.readable) stderr += `\n` + d.toString().trim();
                        }
                    })
                });

                let returned = false;

                if(forceYtdlp || json.nyxData.livestream) {
                    useYtdlp().then(r => {
                        if(!returned && r && typeof r == `object`) {
                            returned = true;
                            res(r)
                        }
                    }).catch(rej)
                } else useFFmpeg().then(r => {
                    if(!returned && r && typeof r == `object`) {
                        returned = true;
                        res(r)
                    }
                }).catch(e => {
                    console.warn(`FFmpeg failed: ${e}`)
                    if(!returned) useYtdlp().then(r => {
                        if(!returned && r && typeof r == `object`) {
                            returned = true;
                            res(r)
                        }
                    }).catch(rej)
                })
            } catch(e) {rej(e)}
        }

        if(fs.existsSync(fileLocation)) {
            console.log(`${fileLocation} equivalent of ${input} saved!`)
            res({domain, id, json, location: originalFileLocation, alreadyExists: true})
        } else if (processes[json.url]) {
            console.log(`Existing process for this URL exists! Waiting for fileLocation to exist.`);

            let attemptsLeft = 30;
            while(attemptsLeft > 0) {
                if(processes[json.url] && fs.readdirSync(`./etc/${processes[json.url].domain}/`).find(f => f.startsWith(processes[json.url].id))) {
                    console.log(`Process has returned a response: manually found song through domain directory!`)
                    attemptsLeft = -1;
                    res(Object.assign({}, processes[json.url], { location: `${__dirname.split(`/`).slice(0, -1).join(`/`)}/etc/${processes[json.url].domain}/${fs.readdirSync(`./etc/${processes[json.url].domain}/`).find(f => f.startsWith(processes[json.url].id))}` }))
                } else if(processes[json.url] && (processes[json.url].stream || (processes[json.url].location && fs.existsSync(processes[json.url].location)))) {
                    console.log(`Process has returned a response: ${processes[json.url].stream ? `stream has been provided!` : `location has been updated & file exists!`}`)
                    attemptsLeft = -1;
                    res(processes[json.url])
                } else if(fs.existsSync(originalFileLocation)) {
                    console.log(`Process has returned a response: originalFileLocation exists!`)
                    attemptsLeft = -1;
                    res(Object.assign({}, processes[json.url], { location: originalFileLocation }))
                } else if(fs.existsSync(fileLocation)) {
                    console.log(`Process has returned a response: fileLocation exists!`)
                    attemptsLeft = -1;
                    res(Object.assign({}, processes[json.url], { location: fileLocation }))
                } else {
                    //console.log(`No response yet.. (${attemptsLeft} attempts left)`)
                    await new Promise(r => setTimeout(r, 100));
                    attemptsLeft--;
                }
            };

            if(attemptsLeft === 0) process({})
        } else {
            process({});
        }
    } else {
        rej(`No input`)
    }
})