const fs = require('fs');
const ff = require('fluent-ffmpeg');
const cp = require('child_process');
const util = require('../util')

let bypassFFmpeg = true;

module.exports = {
    endpoint: `/stream/:url(*+)`,
    func: async function stream({util, keys, idGen}, req, res) {
        global.metrics.streams++

        console.log(`--BEFORE STARTTIME THING--\n${req.query.startTime}`)

        if(req.query.startTime && Number(req.query.startTime.replace(/:/g, ``)) == 0) delete req.query.startTime
        if(req.query.startTime) req.query.startTime = req.query.startTime.split(`:`).length < 2 ? `00:${req.query.startTime}` : req.query.startTime;

        console.log(`--AFTER STARTTIME THING--\n${req.query.startTime}`)

        const seek = req.query.startTime;
        delete req.query.startTime;

        const fetchOnly = (req.headers.fetchOnly || req.query.fetchOnly) ? true : false;
        delete req.query.fetchOnly;

        const queryString = Object.entries(req.query).map((q, index) => `${index === 0 ? `?` : `&`}${q[0]}=${q[1]}`).join(``);
        const link = req.params.url + queryString;

        let streamClosed = false;
        
        req.once(`close`, () => {
            streamClosed = true;
        })

        const seekPlayback = async ({domain, id, json, useFormat, location, stream, proc, alreadyExists, abort, seeked}) => {
            const globalProcessExisted = global.processes[json.url] ? true : false

            //await new Promise(res => setTimeout(res, 500))

            if(fetchOnly) {
                console.log(`fetchOnly`)

                return res.send({
                    error: false,
                    message: `Successfuly got metadata for "${json.title}", and started streaming to disk!`
                });
            } else console.log(`NOT fetchOnly`);

            if(streamClosed) {
                if(abort && typeof abort == `function`) abort();
                return console.log(`Stream closed before playback could start!`)
            }

            console.log(`seeking`);

            let seekArg = (json && json.nyxData && json.nyxData.livestream ? `00:00` : seek || `00:00`) || `00:00`;

            let abr = json && json.streamAbr ? json.streamAbr : json && json.abr ? json.abr : 384;

            if(abr > 384) abr = 384

            let args = [
                `-analyzeduration`, `2147483647`,
                `-probesize`, `2147483647`,
                `-f`, `opus`,
                `-ar`, `48000`,
                `-b:a`, `${abr}k`,
                `pipe:1`,
                `-i`, `-`,
            ].filter(s => typeof s == `string`);

            if(seekArg != `00:00` && !seeked) args.splice(6, 0, `-ss`, seekArg)

            console.log(`STREAMING BACK TO CLIENT AT BITRATE ${abr}kb`)

            console.log(`Spawning ffmpeg with args: "ffmpeg ${args.join(` `)}"`)

            let closed = false

            let ff;

            if(!bypassFFmpeg) {
                ff = cp.spawn(`ffmpeg`, args);
    
                if(proc && proc.once) proc.once(`close`, () => ff.stdin.destroy())
    
                ff.stderr.on(`data`, d => {
                    const log = d.toString()
                    if(log.includes(`size=`) && log.includes(`time=`)) {
                        const totalDuration = util.time(json.duration*1000);
                        const progress = util.time(util.time(log.split(`time=`)[1].trim().split(/(\s+)/)[0]).units.ms + util.time(seek).units.ms);
    
                        console.log(`FFMPEG (${domain}/${id.match(/[(\w\d)]*/g).filter(s => s && s != `` && s.length > 0).join(`-`)}) | ${progress.timestamp}/${totalDuration.timestamp} @ ${log.split(`bitrate=`)[1].trim().split(/(\s+)/)[0]} (${Math.round((progress.units.ms/totalDuration.units.ms)*100)}% processed)`)
                        //console.log(`FFMPEG: ${domain}/${id.match(/[(\w\d)]*/g).filter(s => s && s != `` && s.length > 0).join(`-`)} | ` + log)
                    } else if(log.includes(`Input #0`)) {
                        console.log(`Input #0` + log.split(`Input #0`)[1])
                    } else if(log.includes(`ffmpeg version`)) {
                        // no need to log
                    } else {
                        console.error(log)
                    }
                })
    
                ff.stdout.on(`data`, (data) => {
                    if(!res.headersSent) {
                        console.log(`set headers`)
                        res.set(`Content-Type`, `audio/ogg`);
                    }
                    res.write(data)
                });
    
                ff.on(`close`, (signal) => {
                    console.log(`FFmpeg closed with signal ${signal}`);
                    res.end()
                });
            }

            const closeFunc = (by, ...writable) => {
                if(!closed) {
                    closed = true;
                    global.metrics.streams--
                }

                console.log(`Closed by ${by} eventemitter`);

                try {
                    abort();
                    console.log(`Aborted yt-dlp!`)
                } catch(e) {
                    console.warn(`Failed to abort: ${e}`)
                }

                try {
                    writable.forEach((w, e) => {
                        if(w.destroy) try {
                            w.destroy()
                        } catch(e) {
                            console.warn(`Failed destroying writable stream at index ${i} -- ${e}`)
                        } else console.warn(`No destroy func on index ${i}`);

                        if(w.close) try {
                            w.close()
                        } catch(e) {
                            console.warn(`Failed closing writable stream at index ${i} -- ${e}`)
                        } else console.warn(`No close func on index ${i}`);
                    })
                    //ff.kill()
                    console.log(`Destroyed ffmpeg stdin`);
                } catch(e) {
                    console.warn(`Failed to kill ffmpeg: ${e}`)
                }
            }

            const writeToLocation = async (writable) => {
                let read = 0;
        
                let failedBufferPipeAttempts = -10;
    
                while(!(failedBufferPipeAttempts >= 22) && !streamClosed) {
                    //console.log(`called; ${failedBufferPipeAttempts}; ${location}`)
                    await new Promise(async cycle => {
                        if(fs.existsSync(location)) {
                            const stat = fs.statSync(location);
    
                            //console.log(stat)
            
                            const length = stat.size - read;
            
                            if(length > 0) {
                                let buffer = Buffer.alloc(length);
                                const offset = 0;
                                const position = read;
                                
                                failedBufferPipeAttempts = 0;
                
                                fs.read(fs.openSync(location, `r`), {
                                    buffer, 
                                    offset, 
                                    length, 
                                    position
                                }, (err, bytesRead, buffer) => {
                                    //res.write(buffer);
                                    try {
                                        writable.write(buffer)
                                        read += buffer.length;
                                        if(read == buffer.length) {
                                            return setTimeout(cycle, 500)
                                        } else return setTimeout(cycle, 2000)
                                    } catch(e) {
                                        failedBufferPipeAttempts = 22
                                    }
                                })
                            } else {
                                if(!global.processes[json.url] && globalProcessExisted) {
                                    failedBufferPipeAttempts = 23
                                } else failedBufferPipeAttempts++;
                            }
            
                            if(failedBufferPipeAttempts >= 22) {
                                console.log(`There has been ${failedBufferPipeAttempts} / 22 attempts to pipe more output, but there has been none to send. Closing stream!`);
                                //res.end();
                                writable.end()
                                cycle(null);
                                buffer = null;
                            } else {
                                setTimeout(cycle, 500)
                            }
                        } else {
                            failedBufferPipeAttempts++;
                            setTimeout(cycle, 500)
                        }
                    })
                };
    
                if(streamClosed) return console.log(`stream has been closed! aborting stream`);
            }

            if(bypassFFmpeg) {
                console.log(`Bypassing client-sided FFmpeg`);

                if(!location && stream) {
                    console.log(`Streaming...`)

                    //stream.pipe(res)

                    req.once(`close`, () => closeFunc(`req`, stream, res)); 
                    req.connection.once(`close`, () => closeFunc(`connection`, stream, res));

                    let timeout = setTimeout(() => res.end(), 15000)

                    stream.on(`data`, d => {
                        res.write(d);
                        clearTimeout(timeout);
                        timeout = setTimeout(() => res.end(), 15000)
                    });
                } else if(location && !stream) {
                    console.log(`Streaming from file...`)

                    writeToLocation(res)
                } else {
                    console.error(`Neither location or stream was provided!`);
                    res.end()
                }
            } else {
                req.once(`close`, () => closeFunc(`req`, ff.stdin)); 
                req.connection.once(`close`, () => closeFunc(`connection`, ff.stdin));

                if(!location && stream) {
                    console.log(`Stream provided! Piping stream to FFmpeg...`)
    
                    //stream.pipe(ff.stdin)
    
                    let timeout = setTimeout(() => ff.stdin.end(), 15000)
    
                    ff.stderr.on(`data`, d => {
                        if(d.toString().trim().includes(`Invalid data found`)) {
                            console.log(`piping`)
                            ff.kill();
                            stream.pipe(ff.stdin)
                        }
                    })
    
                    stream.on(`data`, d => {
                        ff.stdin.write(d);
                        clearTimeout(timeout);
                        timeout = setTimeout(() => ff.stdin.end(), 15000)
                    });
                } else if(location && !stream) {
                    console.log(`File location provided! Reading file...`)
    
                    writeToLocation(ff.stdin)
                } else {
                    console.error(`Neither location or stream was provided!`);
                    res.end()
                }
            }
        };

        try {
            require('../func/download')({
                link,
                seek,
                keys,
                waitUntilComplete: /*seek ? true : false*/ false,
                seek,
            }).then((...args) => {
                console.log(`received playback!`)
                seekPlayback(...args)
            }).catch(message => {
                console.error(`Errored on seekPlayback / download function! [1]`, res.headersSent, message);
                
                res.end()
            })
        } catch(message) {
            console.error(`Errored on seekPlayback / download function! [2]`, res.headersSent, message);
            
            res.end()
        }
    }
}