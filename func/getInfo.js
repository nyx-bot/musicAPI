const fs = require('fs')

module.exports = (link, keys) => new Promise(async (res, rej) => {
    const ytdl = keys.clients.ytdl;

    console.log(`getting metadata for ${link}`, link);

    if(global.streamCache[link]) {
        console.log(`metadata exists!`)
        return res(global.streamCache[link])
    } else {
        const origLink = `${link}`

        const domain = link.split(`/`).slice(2,3)[0].split(`.`).filter(a => `${a}`.toLowerCase() !== `www`).slice(0, -1).join(`.`);
    
        const cookieDir = `${__dirname.split(`/`).slice(0, -1).join(`/`)}/${domain}.txt`;
    
        console.log(cookieDir)
    
        const cookies = fs.existsSync(cookieDir) ? cookieDir : undefined;

        const flags = {
            //audioFormat: `ogg`,
            //format: `webm`,
            //getUrl: true,
            //noWarnings: true,
            dumpSingleJson: true,
            //preferFreeFormats: true,
            //youtubeSkipDashManifest: true,
            extractAudio: true,
        };

        //if(cookies) flags.addHeader = `Cookie:${fs.readFileSync(cookies).toString().split(`\n`).filter(s => !s.startsWith(`#`) && s && s.length > 5).map(s => s.split(`\t`).slice(-2).join(`=`)).join(`; `)}`
    
        //console.log(flags.addHeader ? `Cookies exist! Using...` : `No cookies available to use here!`);
        
        console.log(`getting data!`);

        if(link.toString().includes(`spotify.com`)) {
            console.log(`recieved spotify url! running through spotify schtuff`);
            const id = link.split(`/`).slice(4)[0].split(`?`)[0];
            await new Promise(async (res, rej) => {
                require('superagent').get(`http://127.0.0.1:1366/lookupSpotify/${id}`).set(`auth`, require(`../config.json`).authKey).then(r => {
                    if(r.body) {
                        console.log(`found spotify result for ${id}!\n- title: ${r.body.title}\n- duration: ${r.body.duration[0]}\n- artist: ${r.body.artists[0]}${r.body.artists.length > 1 ? ` + ${r.body.artists.length-1} more...` : ``}`);
                        console.log(`starting youtube search for equivalent...`);

                        require('./findYoutubeEquivalent')({
                            title: r.body.title,
                            artist: r.body.artists[0],
                            duration: r.body.duration[0]
                        }).then(async r2 => {
                            const yt = r2.result;
                            console.log(`got youtube equivalent:\n| TITLE:\n| - Spotify: ${r.body.title}\n| - YouTube: ${yt.title}\n| ARTIST:\n| - Spotify: ${r.body.artists[0]}\n| - YouTube: ${yt.artists[0]}\n|\n| NEW LINK: ${yt.url}`);
                            link = yt.url;
                            res(true);
                        }).catch(e => {
                            console.error(e)
                            rej({
                                error: true,
                                message: `[SPOTIFY] Unable to lookup url provided! [2]`,
                            })
                        })
                    } else {
                        console.log(`unable to find spotify track!\n- original link: link\n- given to spotify lookup: ${id}\n- body:`, r.body)
                    }
                }).catch(e => {
                    console.error(e)
                    rej({
                        error: true,
                        message: `[SPOTIFY] Unable to lookup url provided! [1]`,
                    })
                })
            }).catch(rej)
        };

        const processInfo = (input) => {
            console.log(`got metadata for ${link} -- ${input.title}`);

            const thisId = require(`../util`).idGen(8)

            fs.writeFileSync(`./etc/${thisId}.json`, JSON.stringify(input, null, 4));

            if(input.entries && typeof input.entries == `object`) {
                console.log(`THIS IS A PLAYLIST! Parsing as such (entries length: ${input.entries.length})`);

                if(!input.entries[0].duration) {
                    console.log(`Duration is missing on entries!`)
                    return ytdl.execPromise(`${link} --dump-single-json --skip-download`.split(` `)).then(i => {
                        processInfo(JSON.parse(i))
                    }).catch(e => {
                        console.error(e);
                        res(null)
                    });
                } else {
                    let obj = input;
    
                    obj.thumbnail = obj.thumbnails && obj.thumbnails.length > 0 ? obj.thumbnails.slice(-1)[0] : {
                        url: `https://i.nyx.bot/null.png`,
                        width: 1024,
                        height: 1024,
                    };
    
                    input.entries = input.entries.map(json => { 
                        console.log(json.url, json.webpage_url)
                        
                        const thumbnail = json.thumbnails && json.thumbnails.length > 0 ? json.thumbnails.slice(-1)[0] : {
                            url: `https://i.nyx.bot/null.png`,
                            width: 1024,
                            height: 1024,
                        };
                
                        json.thumbnail = thumbnail;
        
                        json.nyxData = {
                            downloadedLengthInMs: 0,
                            lastUpdate: Date.now(),
                            thisId,
                        };
    
                        return json;
                    });
    
                    global.streamCache[link] = obj;
                    global.streamCache[origLink] = obj;
            
                    setTimeout(() => {
                        delete global.streamCache[link];
                        delete global.streamCache[origLink];
                    }, 4.32e+7);
    
                    res(obj)
                }
            } else {
                const json = input;
                
                console.log(`this is NOT a playlist.`)

                json.selectedFormat = json.formats.sort((a, b) => {
                    return a.quality - b.quality
                })

                const thumbnail = json.thumbnails && json.thumbnails.length > 0 ? json.thumbnails.slice(-1)[0] : {
                    url: `https://i.nyx.bot/null.png`,
                    width: 1024,
                    height: 1024,
                };
        
                json.thumbnail = thumbnail;

                json.nyxData = {
                    downloadedLengthInMs: 0,
                    lastUpdate: Date.now(),
                    thisId,
                };

                json.url = link;
        
                global.streamCache[link] = json;
                global.streamCache[origLink] = json;
        
                setTimeout(() => {
                    delete global.streamCache[link];
                    delete global.streamCache[origLink];
                }, 4.32e+7);
        
                res(json);
            }
        }

        ytdl.execPromise(`${link} --no-check-formats --extractor-args youtube:skip=dash,hls --dump-single-json --flat-playlist --skip-download`.split(` `)).then(i => {
            processInfo(JSON.parse(i))
        }).catch(e => {
            console.error(e);
            res(null)
        });
    }
})