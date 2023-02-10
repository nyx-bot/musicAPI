let waveforms = {};

const parseData = (obj, length) => {
    if(!length || typeof length != `number`) length = 15

    if(typeof obj == `string`) obj = JSON.parse(obj);

    let data = obj.data.map(n => n < 0 ? n * -1 : n);

    console.log(data);

    if(data.length > length) {
        let nums = [];

        for (i = 0; i < length; i++) {
            const n = Math.floor((i/length) * data.length);
            nums.push(data[n])
        };

        console.log(nums);

        const highest = Math.max(...nums);

        console.log(`Highest number in array: ${highest}; normalizing!`);

        nums = nums.map(i => Math.round((i/highest)*100))

        console.log(nums);
        
        return nums;
    }
}

module.exports = ({id, location, info, length}) => {
    let prom;
    
    prom = new Promise(async (resolve, rej) => {
        if(!waveforms[id] && (!info || !info.waveform)) {
            let returnObj = undefined;

            const waveformPromise = new Promise(async (res, r) => {
                while(typeof returnObj == `undefined`) {
                    await new Promise(r => setTimeout(r, 200))
                };

                if(typeof returnObj == `object`) {
                    return res(returnObj)
                } else rej(returnObj)
            })

            waveforms[id] = waveformPromise;
            if(info) waveforms[info.id] = waveformPromise;
            if(info) waveforms[info.url] = waveformPromise;
    
            let spawn;
    
            let parsed = false;
        
            let output = ``;
    
            const closeHandler = (e) => {
                if(output) {
                    if(!parsed) {
                        parsed = true;
                        const d = parseData(output, length);
                        waveforms[id] = d;

                        returnObj = d;
    
                        if(info) {
                            waveforms[info.id] = d;
                            waveforms[info.url] = d;
    
                            info.waveform = d;
                        }
    
                        resolve(waveforms[id])
                    }
                } else {
                    const m = `Error occurred while running.`
                    rej(m)
                    returnObj = m;
                    console.error(e)
                }
            }
    
            const args = `--output-format json -b 8 -z 600 -q -o -`.split(` `)
    
            const methods = {
                rawLocation: () => new Promise(async res => {
                    console.log(`[WAVEFORM] USING FILE LOCATION FOR WAVEFORM`)
                    return res(false)
                    if(location) {
                        try {
                            spawn = require('child_process').spawn(`audiowaveform`, [`--input-format`, `mp3`, `-i`, location, ...args])
            
                            spawn.on(`error`, () => {
                                console.warn(`Failed to get stream from raw audio file:`, e);
                                res(false)
                            })
    
                            spawn.stderr.on(`data`, d => {
                                d.toString().split(`\n`).forEach(s => {
                                    console.error(`[WAVEFORM/RAW]: ${s.toString().trim()}`)
                                })
                            })
    
                            spawn.stdout.on(`data`, d => {
                                output = output + d.toString();
                            });
                        
                            spawn.on(`close`, () => res(true));
                        } catch(e) {
                            console.warn(`Failed to get stream from raw audio file:`, e);
                            res()
                        }
                    } else res()
                }),
                ffmpegProxy: () => new Promise(async res => {
                    console.log(`[WAVEFORM] CREATING FFMPEG STREAM FOR WAVEFORM`)
        
                    spawn = require('child_process').spawn(`audiowaveform`, [`--input-format`, `mp3`, `-i`, `-`, ...args]);
        
                    const ffmpegArgs = [
                        `-i`, location, 
                        `-f`, `mp3`,
                        `-ar`, `24000`,
                        `-b:a`, `64k`,
                        `-`
                    ];
    
                    console.log(`[WAVEFORM] Spawning ffmpeg with args: "${ffmpegArgs.join(` `)}"`)
    
                    const stream = require('child_process').spawn(`ffmpeg`, ffmpegArgs);
            
                    stream.stdout.pipe(spawn.stdin);
            
                    stream.on(`close`, () => {
                        spawn.stdin.destroy();
                    });
    
                    spawn.stderr.on(`data`, d => {
                        d.toString().split(`\n`).forEach(s => {
                            console.error(`[WAVEFORM/FFMPEG]: ${s.toString().trim()}`)
                        })
                    })
            
                    spawn.on(`error`, () => res(false))
    
                    spawn.stdout.on(`data`, d => {
                        output = output + d.toString();
                    });
                
                    spawn.on(`close`, () => res(true));
                }),
                streamFromOwnApi: () => new Promise(async res => {
                    console.log(`[WAVEFORM] CREATING STREAM FOR WAVEFORM`)
        
                    spawn = require('child_process').spawn(`audiowaveform`, [`--input-format`, `opus`, `-i`, `-`, ...args]);
                    
                    const stream = require(`superagent`).get(`http://127.0.0.1:1366/stream/${info ? info.url : id}`).set(`authorization`, require(`../config.json`).authKey)
            
                    stream.pipe(spawn.stdin);
            
                    stream.on(`close`, () => {
                        spawn.stdin.destroy();
                    });
    
                    spawn.stderr.on(`data`, d => {
                        d.toString().split(`\n`).forEach(s => {
                            console.error(`[WAVEFORM/API]: ${s.toString().trim()}`)
                        })
                    })
            
                    spawn.on(`error`, () => res(false))
    
                    spawn.stdout.on(`data`, d => {
                        output = output + d.toString();
                    });
                
                    spawn.on(`close`, () => res(true));
                })
            };
    
            for (let name of Object.keys(methods)) {
                const m = methods[name]
                if(!output) {
                    const r = await m();
                    if(r) {
                        console.log(`${name} has returned with true! (Object string length: ${output.length})`);
                    } else {
                        console.log(`${name} has returned with false. (Object string length: ${output.length})`);
                        await new Promise(r => setTimeout(() => {
                            output = ``;
                            r()
                        }, 1000))
                    };
                }
            };
    
            closeHandler();
        } else if(waveforms[id]) {
            if(waveforms[id].then) {
                waveforms[id].then(resolve).catch(rej);
            } else return resolve(waveforms[id])
        } else if(info && info.waveform) {
            return resolve(info.waveform)
        }
    });
    return prom;
}