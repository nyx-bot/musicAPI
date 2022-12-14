const fs = require('fs');
const ff = require('fluent-ffmpeg');
const cp = require('child_process');
const util = require('../util')

module.exports = {
    endpoint: `/stream/:url(*+)`,
    func: async function stream({util, keys, idGen}, req, res) {
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

        const seekPlayback = async ({domain, id, json, location, stream, alreadyExists, abort, seeked}) => {
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

            let seekArg = (json && json.nyxData && json.nyxData.livestream ? `00:00` : seek || `00:00`) || `00:00`

            let args = [
                `-analyzeduration`, `2147483647`,
                `-probesize`, `2147483647`,
                `-f`, `opus`,
                `-ar`, `48000`,
                `-b:a`, `${(json.abr && Number(json.abr) && Number(json.abr) > 384 ? 384 : json.abr) || 384}k`,
                `pipe:1`,
                `-i`, `-`,
            ].filter(s => typeof s == `string`);

            if(seekArg != `00:00` && !seeked) args.splice(6, 0, `-ss`, seekArg)

            console.log(`Spawning ffmpeg with args: "ffmpeg ${args.join(` `)}"`)

            const ff = cp.spawn(`ffmpeg`, args);

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

            const closeFunc = (by) => {
                console.log(`Closed by ${by} eventemitter`);

                try {
                    abort();
                    console.log(`Aborted yt-dlp!`)
                } catch(e) {
                    console.warn(`Failed to abort: ${e}`)
                }

                try {
                    ff.stdin.destroy();
                    //ff.kill()
                    console.log(`Destroyed ffmpeg stdin`);
                } catch(e) {
                    console.warn(`Failed to kill ffmpeg: ${e}`)
                }
            }

            req.once(`close`, () => closeFunc(`req`)); req.connection.once(`close`, () => closeFunc(`connection`))

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

                let read = 0;
        
                let failedBufferPipeAttempts = -10;
    
                while(!(failedBufferPipeAttempts >= 14) && !streamClosed) {
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
                                        ff.stdin.write(buffer)
                                        read += buffer.length;
                                        if(read == buffer.length) {
                                            return setTimeout(cycle, 500)
                                        } else return setTimeout(cycle, 2000)
                                    } catch(e) {
                                        failedBufferPipeAttempts = 14
                                    }
                                })
                            } else {
                                failedBufferPipeAttempts++;
                            }
            
                            if(failedBufferPipeAttempts >= 14) {
                                console.log(`There has been ${failedBufferPipeAttempts} / 14 attempts to pipe more output, but there has been none to send. Closing stream!`);
                                //res.end();
                                ff.stdin.end()
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
            } else {
                console.error(`Neither location or stream was provided!`);
                res.end()
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