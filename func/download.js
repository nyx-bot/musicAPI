const ff = require('fluent-ffmpeg');

let path = undefined;

const fs = require('fs')

const util = require('../util');

module.exports = ({link: input, keys, waitUntilComplete}) => new Promise(async (res, rej) => {
    const ytdl = keys.clients.ytdl;

    let sentBack = false;

    if(input) {
        if(!global.streamCache[input]) {
            console.log(`got input of ${input}, but no cache yet! getting now c:`)
            try {
                await require('./getInfo')(input, keys)
            } catch(e) {
                console.error(e); return rej(`Could not get metadata! ${e}`);
            }
        };

        let json = global.streamCache[input];

        if(!json || !json.url) return rej(`No streamable link! (input: ${input})`, global.streamCache[input]);

        const jsonFileID = require(`../util`).idGen(8);

        const nyxData = json.nyxData; delete json.nyxData;

        //fs.writeFileSync(`./etc/${jsonFileID}.json`, JSON.stringify(json, null, 4));

        json.nyxData = nyxData;

        const domain = json.extractor;
        const id = json.id;

        if(fs.existsSync(`./etc/${domain}/`) && fs.readdirSync(`./etc/${domain}/`).find(f => f.startsWith(json.id))) {
            return res({domain, id, json, location: `${__dirname.split(`/`).slice(0, -1).join(`/`)}/etc/${domain}/${fs.readdirSync(`./etc/${domain}/`).find(f => f.startsWith(json.id))}`})
        };

        let fileLocation = `${__dirname.split(`/`).slice(0, -1).join(`/`)}/etc/${domain}/${id.match(/[(\w\d)]*/g).filter(s => s && s != `` && s.length > 0).join(`-`)}.opus`;
        const originalFileLocation = fileLocation;
        console.log(originalFileLocation)
        let fileRoot = fileLocation.split(`/`).slice(0, -1).join(`/`)

        if(!fs.existsSync(`${fileRoot}/`)) fs.mkdirSync(`${fileRoot}/`, { recursive: true })

        const stream = json ? json.url : null;

        let overrideLocation;

        const process = () => {
            try {
                let audioBitrates = json.formats.filter(o => {
                    return !isNaN(o.abr) && o.abr > 1 && (o.asr || 0) <= 49000
                }).sort((a,b) => {
                    const abitrate = a.abr * (a.asr || 1), bbitrate = b.abr * (b.asr || 1);
                    console.log(abitrate, bbitrate)
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
                            console.log(abitrate, bbitrate)
                            if(abitrate > bbitrate) {
                                return -1
                            } else if(abitrate < bbitrate) {
                                return 1
                            } else return 0
                        }); bestAudio = audioBitrates[0]
                    } else {
                        return rej(`Unable to stream audio! (This source is not allowing me to play anything!)`)
                    }
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

                if(fs.existsSync(`./etc/${jsonFileID}.json`)) {
                    args.push(`--load-info-json`, `${__dirname.split(`/`).slice(0, -1).join(`/`)}/etc/${jsonFileID}.json`)
                } else args.push(json.url)

                console.log(`best audio bitrate: ${bestAudio.abr} with sampling rate of ${bestAudio.asr}`);
    
                const bestAudioWithoutVideo = audioBitrates.filter(o => typeof o.vbr != `number`)[0];

                if(bestAudioWithoutVideo) console.log(`best audio bitrate (without video): ${bestAudioWithoutVideo.abr} with sampling rate of ${bestAudioWithoutVideo.asr}`);
                
                if(bestAudio && bestAudioWithoutVideo && bestAudio.abr && bestAudio.abr == bestAudioWithoutVideo.abr && bestAudio.asr == bestAudioWithoutVideo.asr) {
                    console.log(`bestAudio is equivalent to bestAudioWithoutVideo, using without video!`);
                    format_id = bestAudioWithoutVideo.format_id
                } else {
                    if(bestAudio && bestAudioWithoutVideo) console.log(`bestAudio is NOT equivalent to bestAudioWithoutVideo (${bestAudio.abr} / ${bestAudio.asr} > ${bestAudioWithoutVideo.abr} / ${bestAudioWithoutVideo.asr})`);
                    
                    let difference = bestAudio.abr ? bestAudio.abr * (bestAudio.asr || 1) - bestAudioWithoutVideo.abr * (bestAudioWithoutVideo.asr || 1) : -11000;

                    if(difference < 10000 && difference > -10000) {
                        console.log(`difference is less than 10kbps off, using audio anyways! (${`${difference}`.replace(`-`, ``)})\n| FORMAT: ${bestAudioWithoutVideo.format_id}`);
                        format_id = bestAudioWithoutVideo.format_id
                    } else {
                        console.log(`difference is too high! (${`${difference}`.replace(`-`, ``)}) -- using video and extracting audio\n| FORMAT: ${bestAudio.format_id}`)
                        format_id = bestAudio.format_id
                        args.push(`--no-keep-video`)
                    }
                };

                args.push(`--format`, `${format_id}`);

                console.log(`EXECUTING yt-dlp WITH ARGUMENTS "${args.join(` `)}"`)

                const abort = new AbortController();

                let ytdlCompleted = false;

                let playback = ytdl.exec(args, {}, abort.signal);

                const abortNow = () => {
                    if(!ytdlCompleted) {
                        console.log(`Abort signal received!`);
                        abort.abort();
    
                        const file = fs.readdirSync(`./etc/${domain}/`).find(f => f.startsWith(json.id));
                        if(file) {
                            console.log(`File exists at "./etc/${domain}/${file}"`)
                            fs.rmSync(`./etc/${domain}/${file}`)
                        }
                    }
                }

                const initialRun = (progress) => {
                    const file = fs.readdirSync(`./etc/${domain}/`).find(f => f.startsWith(json.id));

                    if(waitUntilComplete) {
                        console.log(`requested to wait until complete! holding on to file for now...`)
                    } else if(!sentBack && file && Math.round(progress.percent || 0) != 0) {
                        sentBack = true;
                        console.log(`returning file`)
                        res({domain, id, json, location: `${__dirname.split(`/`).slice(0, -1).join(`/`)}/etc/${domain}/${file}`, abort: abortNow})
                    }
            
                    if(global.streamCache[input].nyxData && progress.timemark) {
                        global.streamCache[input].nyxData.downloadedLengthInMs = util.time(progress.timemark.split(`.`)[0]).units.ms
                        global.streamCache[input].nyxData.lastUpdate = Date.now();
                    };
                };

                setTimeout(initialRun, 2000, {
                    percent: 1
                })
    
                playback.on('progress', (progress) => {
                    initialRun(progress)
                    //console.log('processed ' + Math.round(progress.percent) + `% of ${domain}/${id.match(/[(\w\d)]*/g).filter(s => s && s != `` && s.length > 0).join(`-`)} at ${progress.currentKbps || `0`}kbps [${progress.timemark}]`);
                    console.log(`processed ` + Math.round(progress.percent || 0) + `% of ${domain}/${id.match(/[(\w\d)]*/g).filter(s => s && s != `` && s.length > 0).join(`-`)} at ${progress.currentSpeed} speed -- ETA: ${progress.eta}`)
                });
        
                playback.once(`close`, () => {
                    ytdlCompleted = true;

                    const file = fs.readdirSync(`./etc/${domain}/`).find(f => f.startsWith(json.id));

                    if(fs.existsSync(`./etc/${jsonFileID}.json`)) fs.rmSync(`./etc/${jsonFileID}.json`)

                    if(waitUntilComplete) {
                        console.log(`returning file`)
                        res({domain, id, json, location: `${__dirname.split(`/`).slice(0, -1).join(`/`)}/etc/${domain}/${file}`})
                    } else if(!sentBack && file) {
                        sentBack = true;
                        console.log(`returning file`)
                        res({domain, id, json, location: `${__dirname.split(`/`).slice(0, -1).join(`/`)}/etc/${domain}/${file}`})
                    }
    
                    console.log(`successfully processed ${domain}/${id.match(/[(\w\d)]*/g).filter(s => s && s != `` && s.length > 0).join(`-`)}`);
    
                    fileLocation = `${__dirname.split(`/`).slice(0, -1).join(`/`)}/etc/${domain}/${file}`;
    
                    setTimeout(() => {
                        if(fs.existsSync(fileLocation)) fs.unlinkSync(fileLocation)
                        console.log(`deleted file ${domain}/${id.match(/[(\w\d)]*/g).filter(s => s && s != `` && s.length > 0).join(`-`)}.opus! (timed out)`)
                    }, 1.26e+7) // 3.5 hours
                });
        
                playback.on(`error`, (err, stdout, stderr) => {
                    console.error(`Failed to process ${domain}/${id.match(/[(\w\d)]*/g).filter(s => s && s != `` && s.length > 0).join(`-`)}: ${err}`, err);
                    if(fs.existsSync(fileLocation)) fs.unlinkSync(fileLocation);
                    delete global.streamCache[input];
                    rej(`Unable to stream audio!\n- ${`${err}`.split(`:`).slice(5).join(`\n- `) || `(no internal error provided)`}`)
                });
            } catch(e) {rej(e)}
        }

        if(fs.existsSync(fileLocation)) {
            console.log(`${fileLocation} equivalent of ${input} saved!`)
            res({domain, id, json, location: originalFileLocation, alreadyExists: true})
        } else process({});
    } else {
        rej(`No input`)
    }
})