const fs = require('fs');

const { ffprobe } = require('../util');

module.exports = (link, keys, noDownload, waitForDownload) => new Promise(async (res, rej) => {
    const origLink = `${link}`

    const ytdl = keys.clients.ytdl;

    let retried = false;

    console.log(`getting metadata for ${link}`, link);

    const processInfo = async (input) => {
        console.log(`got metadata for ${link} -- ${input.title}`);

        const thisId = require(`../util`).idGen(8);

        let livestream = input.duration ? false : true;

        if(input.parsed) {
            return res(input)
        } else {
            if(input.direct) {
                console.log(`This is a direct download link, calling ffprobe for ${input.url}...`);
                
                try {
                    const info = await ffprobe(input.url);
    
                    let serviceName = link.split(`//`)[1].split(`.`).slice(-4, -3).slice(-1)[0]
    
                    input.uploader = `${serviceName[0].toUpperCase() + serviceName.slice(1)}`;
                    input.uploader_url = link;
    
                    if(info.format && info.format.duration) input.duration = Math.round(info.format.duration);

                    if(info.format && info.format.bit_rate && Number(info.format.bit_rate) > 0) {
                        input.abr = Number(info.format.bit_rate)/1000;
                        if(input.formats && input.formats.length > 0) input.formats = input.formats.map(o => o.abr = Number(info.format.bit_rate)/1000)
                    }
                } catch(e) {
                    console.warn(`Failed to get ffprobe info: ${e}`, e);
                }
            };
    
            if(input.entries && typeof input.entries == `object`) {
                console.log(`THIS IS A PLAYLIST! Parsing as such (entries length: ${input.entries.length})`);
                
                if(input.entries.find(o => o.entries)) input.entries = input.entries.find(o => o.entries && o.entries.length > 0).entries
    
                if(!input.uploader && input.entries.find(o => o.channel != null)) {
                    input.uploader = input.entries.find(o => o.channel != null).channel
                }
                if(!input.uploader_url && input.entries.find(o => o.channel_url != null)) {
                    input.uploader_url = input.entries.find(o => o.channel_url != null).channel_url
                }

                /*if(!input.entries[0].formats && !retried) {
                    console.log(`Formats is missing on entries! (${input.entries.filter(o => o.formats).length} entries has formats)`, input.entries[0]);
                    retried = true;
                    return ytdl.execPromise(`${link} --dump-single-json --skip-download`.split(` `)).then(i => {
                        processInfo(JSON.parse(i))
                    }).catch(e => {
                        console.error(e);
                        res(null)
                    });
                } else*/ if(!input.entries[0].duration && !retried) {
                    console.log(`Duration is missing on entries! (${input.entries.filter(o => o.duration).length} entries has duration)`, input.entries[0]);
                    retried = true;
                    return ytdl.execPromise(`${link} --dump-single-json --skip-download`.split(` `)).then(i => {
                        processInfo(JSON.parse(i))
                    }).catch(e => {
                        console.error(e);
                        res(null)
                    });
                } else {
                    if(retried) console.log(`ALREADY RETRIED ONCE`);
    
                    let obj = input;
    
                    input.entries = input.entries.map(json => { 
                        console.log(json.url, json.webpage_url)
                        
                        const thumbnail = json.thumbnails && json.thumbnails.length > 0 ? json.thumbnails.slice(-1)[0] : {
                            url: `https://i.nyx.bot/null.png`,
                            width: 1024,
                            height: 1024,
                        };
                
                        json.thumbnail = thumbnail;
        
                        json.nyxData = {
                            livestream: livestream ? true : false,
                            downloadedLengthInMs: 0,
                            lastUpdate: Date.now(),
                            thisId,
                        };
    
                        return json;
                    });
    
                    if(obj.thumbnails && obj.thumbnails.length > 0) {
                        obj.thumbnail = obj.thumbnails.slice(-1)[0]
                    } else if(input.entries.find(e => e.thumbnail && e.thumbnail.url != `https://i.nyx.bot/null.png`)) {
                        obj.thumbnail = input.entries.find(e => e.thumbnail && e.thumbnail.url != `https://i.nyx.bot/null.png`).thumbnail
                    } else obj.thumbnail = {
                        url: `https://i.nyx.bot/null.png`,
                        width: 1024,
                        height: 1024,
                    };
    
                    global.streamCache[link] = obj;
                    global.streamCache[origLink] = obj;

                    ctx.cacheLocation(link, origLink)
        
                    setTimeout(() => {
                        delete global.streamCache[link];
                        delete global.streamCache[origLink];
                    }, 4.32e+7);
    
                    if(input && noDownload != true && input.entries[0] && !input.entries[0].nyxData.livestream && input.extractor != `generic`) {
                        console.log(`Downloading on getInfo request enabled!`);
                        const a = await require('./download')({
                            link: input.entries[0],
                            keys,
                            waitUntilComplete: true,
                            returnInstantly: false,
                            forceYtdlp: true,
                        });
                        if(waitForDownload) res(obj)
                    }
    
                    if(!waitForDownload) res(obj)
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
                    livestream: json.duration ? false : true,
                    downloadedLengthInMs: 0,
                    lastUpdate: Date.now(),
                    thisId,
                };
    
                console.log(`Adding nyxData object: `, json.nyxData)
    
                json.url = link;
    
                global.streamCache[link] = json;
                global.streamCache[origLink] = json;

                ctx.cacheLocation(link, origLink)
    
                setTimeout(() => {
                    delete global.streamCache[link];
                    delete global.streamCache[origLink];
                }, 4.32e+7);
    
                if(input && noDownload != true && !json.nyxData.livestream && input.extractor != `generic`) {
                    console.log(`Downloading on getInfo request enabled!`);
                    const a = await require('./download')({
                        link: input,
                        keys,
                        waitUntilComplete: true,
                        returnInstantly: false,
                        forceYtdlp: true,
                    });
                    if(waitForDownload) res(json)
                }
    
                if(!waitForDownload) res(json);
            }
        }
    }

    if(global.streamCache[link]) {
        console.log(`metadata exists!`)
        return res(global.streamCache[link])
    } else if(typeof link == `object`) {
        processInfo(link)
    } else {
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

        let continueAfterSpotify = true;

        if(link.toString().includes(`spotify.com`)) {
            console.log(`recieved spotify url! running through spotify schtuff`);
            const id = link.split(`/`).slice(4)[0].split(`?`)[0];
            await new Promise(async (res, rej) => {
                require(`./lookupSpotify`)({
                    keys, q: id, getInfo: true,
                }).then(r => { return { body: r } }).then(r => {
                    if(r.body && r.body.tracks) {
                        console.log(`found spotify result for ${id}!\n- title: ${r.body.title}\n- PLAYLIST\n- artist: ${r.body.artists[0]}${r.body.artists.length > 1 ? ` + ${r.body.artists.length-1} more...` : ``}`);
                        
                        continueAfterSpotify = r.body;

                        res(null)
                    } else if(r.body) {
                        console.log(`found spotify result for ${id}!\n- title: ${r.body.title}\n- duration: ${r.body.duration[0]}\n- artist: ${r.body.artists[0]}${r.body.artists.length > 1 ? ` + ${r.body.artists.length-1} more...` : ``}`);
                        console.log(`starting global search for equivalent...`);

                        require(`./generalSong`)({
                            keys,

                            title: r.body.title,
                            artist: r.body.artists[0],
                            duration: r.body.duration[0]
                        }).then(async r2 => {
                            const yt = r2.top;
                            console.log(`got equivalent:\n| TITLE:\n| - Spotify: ${r.body.title}\n| - ${yt.source}: ${yt.title}\n| ARTIST:\n| - Spotify: ${r.body.artists[0]}\n| - ${yt.source}: ${yt.artists[0]}\n|\n| NEW LINK: ${yt.url}`);
                            link = yt.url;
                            res(true);
                        }).catch(e => {
                            console.error(e)
                            rej({
                                error: true,
                                message: `[SPOTIFY] Unable to lookup url provided! [2]`,
                            })
                        })

                        /*require('./findYoutubeEquivalent')({
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
                        })*/
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

        if(continueAfterSpotify !== true) return processInfo(continueAfterSpotify);

        ytdl.execPromise(`${link} --dump-single-json --flat-playlist --no-check-certificates`.split(` `)).then(i => {
            processInfo(JSON.parse(i))
        }).catch(e => {
            console.warn(`Error was thrown: ${e}\nStarting parse process again with less options...`)
            ytdl.execPromise(`${link} --dump-single-json`.split(` `)).then(i => {
                processInfo(JSON.parse(i), true)
            }).catch(e2 => {
                console.error(e2);
                res(null)
            })
        });
    }
})