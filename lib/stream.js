const fs = require('fs');
const ff = require('fluent-ffmpeg');
const cp = require('child_process')

module.exports = {
    endpoint: `/stream/:url(*+)`,
    func: async ({util, keys, idGen}, req, res) => {
        if(req.query.startTime && Number(req.query.startTime.replace(/:/g, ``)) == 0) delete req.query.startTime
        if(req.query.startTime) req.query.startTime = req.query.startTime.split(`:`).length < 2 ? `00:${req.query.startTime}` : req.query.startTime;

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

        const seekPlayback = async ({domain, id, json, location, alreadyExists}) => {
            //await new Promise(res => setTimeout(res, 500))

            if(fetchOnly) {
                console.log(`fetchOnly`)

                return res.send({
                    error: false,
                    message: `Successfuly got metadata for "${json.title}", and started streaming to disk!`
                });
            } else console.log(`NOT fetchOnly`);

            console.log(`seeking`);

            let args = [
                `-f`, `opus`,
                `-ar`, `48000`,
                `-b:a`, `${(json.abr && Number(json.abr) && Number(json.abr) > 256 ? 256 : json.abr) || 256}k`,
                `-ss`, (`${seek}`.split(`:`).filter(o => !isNaN(o) && (o.length == `1` || o.length == `2`)).length == `${seek}`.split(`:`).length ? `${seek}` : `00:00`),
                `pipe:1`,
                `-i`, `-`,
            ];

            console.log(`Spawning ffmpeg with args: "ffmpeg ${args.join(` `)}"`)

            const ff = cp.spawn(`ffmpeg`, args);

            ff.stderr.on(`data`, d => {
                const log = d.toString()
                if(log.includes(`size=`) && log.includes(`time=`)) {
                    console.log(`FFMPEG: ${domain}/${id.match(/[(\w\d)]*/g).filter(s => s && s != `` && s.length > 0).join(`-`)} | ` + log)
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
                console.log(`Closed`);
                res.end()
            });

            req.once(`close`, () => {
                ff.stdin.destroy()
                console.log(`Destroyed ffmpeg stdin`);
            })

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
                                ff.stdin.write(buffer)
                                read += buffer.length;
                                if(read == buffer.length) {
                                    return setTimeout(cycle, 500)
                                } else return setTimeout(cycle, 2000)
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

            //res.end()
        };

        try {
            require('../func/download')({
                link,
                seek,
                keys,
                waitUntilComplete: /*seek ? true : false*/ false,
            }).then((...args) => {
                console.log(`received playback!`)
                seekPlayback(...args)
            }).catch(message => {
                console.error(`Errored on seekPlayback / download function! [1]`, res.headersSent, message);
                
                res.status(500).send({
                    error: true,
                    message: message.toString()
                })
            })
        } catch(message) {
            console.error(`Errored on seekPlayback / download function! [2]`, res.headersSent, message);
            
            res.status(500).send({
                error: true,
                message: message.toString()
            })
        }
    }
}