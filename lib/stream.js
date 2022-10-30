const fs = require('fs');
const ff = require('fluent-ffmpeg');

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

        const seekPlayback = async ({domain, id, json, location}) => {
            //await new Promise(res => setTimeout(res, 500))

            if(fetchOnly) {
                console.log(`fetchOnly`)

                return res.send({
                    error: false,
                    message: `Successfuly got metadata for "${json.title}", and started streaming to disk!`
                });
            } else console.log(`NOT fetchOnly`);

            if(seek) {
                let complete = false;
                let attempts = 0;

                while(!complete && attempts < 3) {
                    await new Promise(async resolve => {
                        attempts++;

                        console.log(`attempt #${attempts}`);
        
                        const ffcmd = ff();
                        console.log(`SEEKING AT ${seek || `00:00`} FROM LOCATION ${location}`)
                        ffcmd.input(location);
                
                        let extraInputOptions = [];
                
                        //const inputFormat = json.acodec || json.ext;
                        //console.log(`input: ${inputFormat}`)
                        //if(inputFormat && inputFormat == `opus`) extraInputOptions.push(`-acodec`, `copy`)
                
                        ffcmd.setStartTime(seek);
                
                        if(extraInputOptions.length > 0) ffcmd.inputOptions(...extraInputOptions);
                        
                        ffcmd.format(`opus`)
                        //ffcmd.outputOptions(`-map`, `0:a:0`)
                        const bitrate = `${(json.abr && Number(json.abr) && Number(json.abr) > 256 ? 256 : json.abr) || 256}k`;
                        console.log(`setting bitrate at ${bitrate}`);
                        ffcmd.audioBitrate(bitrate);
                
                        ffcmd.on(`codecData`, data => {
                            if(!res.headersSent) {
                                if(data.audio == `opus` || data.audio == `ogg`) res.set(`Content-Type`, `audio/ogg`);
                            }
                            console.log(`${location.replace(__dirname, ``)} processed data!\n- ${Object.entries(data).map(d => `${d[0]} - ${d[1]}`).join(`\n- `)}`)
                        });
                
                        ffcmd.on('progress', (progress) => {
                            if(progress.currentKbps) {
                                console.log('processed ' + Math.round(progress.percent) + `% of ${domain}/${id.match(/[(\w\d)]*/g).filter(s => s && s != `` && s.length > 0).join(`-`)} at ${progress.currentKbps || `0`}kbps [${progress.timemark}]`);
                            };
                        });
                
                        ffcmd.once(`end`, () => {
                            console.log(`successfully processed [TO CLIENT] ${domain}/${id.match(/[(\w\d)]*/g).filter(s => s && s != `` && s.length > 0).join(`-`)}`);
                            complete = true;
                            resolve()
                        });
                
                        ffcmd.on(`error`, (err, stdout, stderr) => {
                            console.error(`Failed to process ${domain}/${id.match(/[(\w\d)]*/g).filter(s => s && s != `` && s.length > 0).join(`-`)}: ${err}`, err);
                            resolve()
                        });
            
                        ffcmd.pipe(res)
                        
                        //ffcmd.output(fs.createWriteStream(fileLocation));
            
                        //ffcmd.run();
                    })
                }
            } else {
                let read = 0;
    
                let failedBufferPipeAttempts = -10;

                while(!(failedBufferPipeAttempts >= 7) && !streamClosed) {
                    //console.log(`called; ${failedBufferPipeAttempts}`)
                    await new Promise(async cycle => {
                        if(fs.existsSync(location)) {
                            const stat = fs.statSync(location);
            
                            const length = stat.size - read;
                            let buffer = Buffer.alloc(length);
                            const offset = 0;
                            const position = read;
            
                            if(length > 0) {
                                if(!res.headersSent) {
                                    res.set(`Content-Type`, `audio/ogg`);
                                }
                                
                                failedBufferPipeAttempts = 0;
                
                                fs.read(fs.openSync(location, `r`), {
                                    buffer, 
                                    offset, 
                                    length, 
                                    position
                                }, (err, bytesRead, buffer) => {
                                    res.write(buffer);
                                    read += buffer.length;
                                    if(read == buffer.length) {
                                        return setTimeout(cycle, 500)
                                    } else return setTimeout(cycle, 2000)
                                })
                            } else {
                                failedBufferPipeAttempts++;
                            }
            
                            if(failedBufferPipeAttempts >= 7) {
                                console.log(`There has been ${failedBufferPipeAttempts} / 7 attempts to pipe more output, but there has been none to send. Closing stream!`);
                                res.end();
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

                res.end()
            }
        };

        try {
            require('../func/download')({
                link,
                seek,
                keys,
                waitUntilComplete: seek ? true : false,
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