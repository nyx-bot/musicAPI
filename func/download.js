const ff = require('fluent-ffmpeg');

let path = undefined;

const fs = require('fs')

const util = require('../util');

let processes = {};

const ffmpegFormats = require('child_process').execSync(`ffmpeg -formats`).toString().split(`\n`).map(s => s.trim().slice(4).split(` `)[0]).filter(s => s.length > 0 ? true : false);

module.exports = ({link: input, keys, waitUntilComplete, returnInstantly, seek, forceYtdlp}) => new Promise(async (res, rej) => {
    const times = {
        start: Date.now(),
        firstPipe: Date.now(),
        finish: Date.now(),
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
                let audioBitrates = json.formats.filter(o => {
                    return !isNaN(o.abr) && o.abr > 1 && (o.asr || 0) <= 49000
                }).sort((a,b) => {
                    const abitrate = a.abr * (a.asr || 1), bbitrate = b.abr * (b.asr || 1);
                    console.log(`A-ABR: ${a.abr} / ${a.asr || 1} / ${abitrate} | B-ABR: ${b.abr} / ${b.asr || 1} / ${bbitrate}`)
                    if(abitrate > bbitrate) {
                        return -1
                    } else if(abitrate < bbitrate) {
                        return 1
                    } else return 0
                }), bestAudio = audioBitrates[0];

                if(!bestAudio) {
                    if(json.formats.length > 0) {
                        //return rej(`Unable to stream audio! (There are no audio streams available!)`)
                        console.warn(`THERE ARE NO DIRECT AUDIO STREAMS AVAILABLE -- trying highest quality...`);

                        audioBitrates = json.formats.sort((a,b) => {
                            const abitrate = a.tbr, bbitrate = b.tbr;
                            console.log(`A-TBR: ${abitrate} | B-TBR: ${bbitrate}`)
                            if(abitrate > bbitrate) {
                                return -1
                            } else if(abitrate < bbitrate) {
                                return 1
                            } else return 0
                        }); bestAudio = audioBitrates[0]
                    }/* else {
                        return rej(`Unable to stream audio! (This source is not allowing me to play anything!)`)
                    }*/
                };

                let args = [
                    //`--no-keep-video`,
                    //`--extract-audio`,
                    //`--audio-format`, `opus`,
                    `-P`, fileLocation.split(`/`).slice(0, -1).join(`/`),
                    `-o`, `%(id)s.%(ext)s`,
                    `--no-part`,
                    `--cache-dir`, `${__dirname.split(`/`).slice(0, -1).join(`/`)}/etc/yt-dlp-cache`,
                    //`--extractor-args`, `youtube:skip=dash,hls`
                ], format_id = null;

                let seeking = false;

                if(fs.existsSync(`./etc/${jsonFileID}.json`)) {
                    args.push(`--load-info-json`, `${__dirname.split(`/`).slice(0, -1).join(`/`)}/etc/${jsonFileID}.json`)
                } else args.push(json.url)

                if(bestAudio) console.log(`best audio bitrate: ${bestAudio.abr} with sampling rate of ${bestAudio.asr}`);
    
                //const bestAudioWithoutVideo = audioBitrates.filter(o => typeof o.vbr != `number`)[0];
                const bestAudioWithoutVideo = []

                if(bestAudioWithoutVideo) console.log(`best audio bitrate (without video): ${bestAudioWithoutVideo.abr} with sampling rate of ${bestAudioWithoutVideo.asr}`);
                
                if(bestAudio && bestAudioWithoutVideo && bestAudio.abr && bestAudio.abr == bestAudioWithoutVideo.abr && bestAudio.asr == bestAudioWithoutVideo.asr) {
                    console.log(`bestAudio is equivalent to bestAudioWithoutVideo, using without video!`);
                    format_id = bestAudioWithoutVideo.format_id
                } else {
                    if(bestAudio && bestAudioWithoutVideo) console.log(`bestAudio is NOT equivalent to bestAudioWithoutVideo (${bestAudio.abr} / ${bestAudio.asr} > ${bestAudioWithoutVideo.abr} / ${bestAudioWithoutVideo.asr})`);
                    
                    let difference = bestAudio && bestAudio.abr ? bestAudio.abr * (bestAudio.asr || 1) - (bestAudioWithoutVideo || {abr : 0}).abr * ((bestAudioWithoutVideo || {asr: 0}).asr || 1) : -11000;

                    if(difference < 10000 && difference > -10000) {
                        console.log(`difference is less than 10kbps off, using audio anyways! (${`${difference}`.replace(`-`, ``)})\n| FORMAT: ${bestAudioWithoutVideo.format_id}`);
                        format_id = bestAudioWithoutVideo.format_id
                    } else {
                        console.log(`difference is too high! (${`${difference}`.replace(`-`, ``)}) -- using video and extracting audio\n| FORMAT: ${bestAudio && bestAudio.format_id ? bestAudio.format_id : `NONE, YT-DLP IS ON ITS OWN THIS TIME`}`)
                        if(bestAudio && bestAudio.format_id) {
                            format_id = bestAudio.format_id
                            args.push(`--no-keep-video`);

                            if(startTimeArg) {
                                args.push(`--downloader`, `ffmpeg`, `--downloader-args`, `ffmpeg:-ss ${startTimeArg}`);
                            }
                        } else {
                            args.push(`--downloader`, `ffmpeg`);

                            let ffmpegArgs = `-acodec copy -vn`;

                            if(startTimeArg) {
                                ffmpegArgs = ffmpegArgs + ` -ss ${startTimeArg}`;
                                seeking = true;
                            }

                            args.push(`--downloader-args`, `ffmpeg:${ffmpegArgs}`)
                            //args.push(`--compat-options`, `multistreams`)
                            //args.push(`--dump-single-json`, `--no-simulate`)
                        }
                    }
                };

                let useFormat = json.formats.find(o => o.format_id == format_id);

                console.log(`Using format ${format_id}, corresponding to format obj:`, useFormat, useFormat ? useFormat.http_headers : {})

                if(format_id) args.push(`--format`, `${format_id}`);
    
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
    
                    const run = args.indexOf(`-o`) == -1 ? `execStream` : `exec`
    
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
    
                    processes[json.url] = returnJson;
    
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
                    let dir = args.indexOf(`-P`) == -1 ? args[args.indexOf(`-P`)+1] : `./etc/${domain}`
                    let location = dir + `/` + json.id + `.` + useFormat.audio_ext || `ogg`

                    let headers = Object.entries(useFormat && useFormat.http_headers ? useFormat.http_headers : {}).map(o => `${o[0]}: ${o[1]}`);

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
                    }

                    console.log(`Using ffmpeg output format ${format.type} from ${format.from} (acodec: ${useFormat.acodec})`)

                    let ffmpegArgs = [
                        `-i`, useFormat ? useFormat.url : input,
                        //...(args.find(s => s.startsWith(`ffmpeg:`)) ? args.find(s => s.startsWith(`ffmpeg:`)).replace(`ffmpeg:`, ``).trim().split(` `) : []),
                        ...(startTimeArg ? [`-ss`, `${startTimeArg}`] : []),
                        //...(formatOverride ? [] : [`-codec:a`, `copy`]),
                        `-ar`, `48000`,
                        ...(useFormat.abr ? [`-b:a`, `${useFormat.abr}k`] : [`-b:a`, `384k`]),
                        `-vn`,
                    ];

                    headers.forEach(h => ffmpegArgs.unshift(`-headers`, h));

                    const streaming = args.indexOf(`-o`) == -1 || (!fs.existsSync(location) && startTimeArg) ? true : false

                    if(streaming) {
                        console.log(`STREAMING OUTPUT`)
                        ffmpegArgs.push(`-f`, `adts`, `-`)
                    } else {
                        console.log(`DOWNLOADING VIA FFMPEG TO ${location}`)
                        ffmpegArgs.push(`-c:a`, `copy`, location)
                    }

                    console.log(`-----------------------\nEXECUTING FFMPEG WITH ARGS: ` + ffmpegArgs.map(s => s.includes(` `) ? `"${s}"` : s).join(` `) + `\n-----------------------`)

                    let f = require('child_process').spawn(`ffmpeg`, ffmpegArgs);

                    const returnJson = {
                        domain, 
                        id, 
                        json,
                        useFormat,
                        location: null, 
                        stream: null,
                        seeked: startTimeArg ? true : false,
                        abort: () => {
                            if(f) {
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

                    processes[json.url] = returnJson

                    let sent = false;

                    let stderr = ``, stderrCache;

                    let sendBack = (closed) => {
                        if(!sent && ((waitUntilComplete && closed) || !waitUntilComplete)) {
                            times.firstPipe = Date.now()
                            console.log(`Sent back JSON`)
                            //console.log(`Readable now, here's stderr:`, stderr);
                            stderrCache = stderr;
                            stderr = null;
                            sent = true;
                            return res2(returnJson)
                        }
                    };

                    f.once(`close`, () => {
                        f = null;
                        times.finish = Date.now();
                        sendBack(true)
                        logData(`FFmpeg`)
                    })

                    let t = 0;

                    if(streaming) {
                        returnJson.stream = new (require('stream')).PassThrough();

                        f.stdout.on(`data`, d => {
                            t++;
                            returnJson.stream.push(d);
                            if(t >= 2) sendBack();
                        })
                    } else {                        
                        returnJson.location = location

                        f.on(`close`, (code, signal) => {
                            console.log(`download ffmpeg closed with code ${code} / sig ${signal}`);
                            if(code == 1 && stderrCache) {
                                console.log(stderrCache)
                            }
                        });

                        let t = 0;

                        f.stderr.on(`data`, d => {
                            let log = d.toString().trim()
                            if(log.includes(`time=`) && log.includes(`speed=`)) {
                                if(t == 0) times.firstPipe = Date.now();
                                t++;
                                console.log(`FFMPEG DOWNLOAD | ` + `size=` + log.split(`size=`)[1]);
                                if(t >= 2) sendBack();
                            }
                        })
                    }

                    if(returnInstantly) sendBack();

                    f.stderr.on(`data`, d => {
                        //console.log(d.toString().trim())

                        if((d.toString().trim().includes(`Invalid argument`) || d.toString().trim().includes(`Invalid data found`) || d.toString().trim().includes(`Unsupported codec id`)) && format.from != `override`) {
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